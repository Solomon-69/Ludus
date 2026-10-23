using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;

namespace Ludus;

/// <summary>In-app update (Windows). The page decides when (the user taps, then confirms). This downloads the release
/// zip, checks its SHA-256 against the release's checksums file, unzips it to a temp folder, then a small PowerShell
/// helper waits for Ludus to exit, copies the new files over the install folder and starts Ludus again.
/// Nothing is silent and no token is stored.</summary>
internal static class Updater
{
    private static readonly HashSet<string> Hosts = new(StringComparer.OrdinalIgnoreCase)
        { "github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com" };

    /// <summary>Extra hosts allowed over plain http (a local test server only, set by the test switches).</summary>
    public static readonly HashSet<string> TestHosts = new(StringComparer.OrdinalIgnoreCase);

    public static bool Allowed(Uri u)
    {
        if (u.Scheme == Uri.UriSchemeHttps) return Hosts.Contains(u.Host) || u.Host.EndsWith(".githubusercontent.com", StringComparison.OrdinalIgnoreCase);
        return u.Scheme == Uri.UriSchemeHttp && TestHosts.Contains(u.Host);
    }

    /// <summary>"hash  name" lines (sha256sum style, a leading * on the name allowed). Returns the lowercase hash for <paramref name="name"/>.</summary>
    public static string? ExpectedHash(string sums, string name)
    {
        foreach (var raw in sums.Split('\n'))
        {
            var line = raw.Trim();
            var cut = line.IndexOfAny(new[] { ' ', '\t' });
            if (cut != 64) continue;
            var hash = line[..64].ToLowerInvariant();
            var file = line[64..].Trim(' ', '\t', '*');
            if (file == name && hash.All(Uri.IsHexDigit)) return hash;
        }
        return null;
    }

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(10) };

    /// <summary>Downloads and checks the zip, unzips it and returns the folder that holds Ludus.exe. Throws on any problem; nothing installed then.</summary>
    public static async Task<string> DownloadAsync(Uri zip, Uri sums, string name, IProgress<double> progress)
    {
        if (!Allowed(zip) || !Allowed(sums) || name.Contains('/') || name.Contains('\\')) throw new InvalidOperationException("source not allowed");
        var work = Path.Combine(Path.GetTempPath(), "ludus-update-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            var sumsText = await Http.GetStringAsync(sums);
            var want = ExpectedHash(sumsText, name) ?? throw new InvalidOperationException("no checksum");

            var file = Path.Combine(work, name);
            using (var resp = await Http.GetAsync(zip, HttpCompletionOption.ResponseHeadersRead))
            {
                resp.EnsureSuccessStatusCode();
                var total = resp.Content.Headers.ContentLength ?? 0;
                await using var src = await resp.Content.ReadAsStreamAsync();
                await using var dst = File.Create(file);
                var buf = new byte[65536]; long got = 0; double last = -1; int n;
                while ((n = await src.ReadAsync(buf)) > 0)
                {
                    await dst.WriteAsync(buf.AsMemory(0, n));
                    got += n;
                    if (total > 0) { var p = Math.Min(99, Math.Round(got * 100.0 / total)); if (p != last) { last = p; progress.Report(p); } }
                }
            }
            string have;
            await using (var fs = File.OpenRead(file)) have = Convert.ToHexString(await SHA256.HashDataAsync(fs)).ToLowerInvariant();
            if (have != want) throw new InvalidOperationException("checksum mismatch");
            progress.Report(100);

            var x = Path.Combine(work, "x");
            ZipFile.ExtractToDirectory(file, x);
            File.Delete(file);
            var exe = Directory.EnumerateFiles(x, "Ludus.exe", SearchOption.AllDirectories).FirstOrDefault()
                      ?? throw new InvalidOperationException("not a Ludus app");
            return Path.GetDirectoryName(exe)!;
        }
        catch
        {
            try { Directory.Delete(work, true); } catch { /* temp folder, best effort */ }
            throw;
        }
    }

    /// <summary>Starts the helper that waits for process <paramref name="pid"/> to exit, copies <paramref name="staged"/> over
    /// <paramref name="installDir"/> and starts Ludus.exe again. The caller quits right after.</summary>
    public static void StartSwap(string staged, string installDir, int pid)
    {
        var script = Path.Combine(Path.GetTempPath(), "ludus-swap-" + Guid.NewGuid().ToString("N") + ".ps1");
        File.WriteAllText(script,
            "param([int]$ProcId,[string]$Staged,[string]$Install)\n" +
            "$ErrorActionPreference='SilentlyContinue'\n" +
            "while (Get-Process -Id $ProcId -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }\n" +
            "Start-Sleep -Milliseconds 300\n" +
            "for ($i=0; $i -lt 10; $i++) { Copy-Item -Path (Join-Path $Staged '*') -Destination $Install -Recurse -Force -ErrorAction Stop; if ($?) { break }; Start-Sleep -Milliseconds 500 }\n" +
            "Start-Process -FilePath (Join-Path $Install 'Ludus.exe')\n" +
            "Remove-Item -Recurse -Force (Split-Path $Staged -Parent) -ErrorAction SilentlyContinue\n" +
            "Remove-Item -Force $PSCommandPath -ErrorAction SilentlyContinue\n");
        var psi = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
        };
        foreach (var a in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-ProcId", pid.ToString(), "-Staged", staged, "-Install", installDir })
            psi.ArgumentList.Add(a);
        Process.Start(psi);
    }

    // ---------- Test aid (windows/ci/update.ps1): --update-selftest=BASEURL;ZIPNAME;INSTALLDIR;RESULTFILE ----------
    // Runs the real download, checksum and unzip against a local fake release server, then the real swap helper
    // against INSTALLDIR (waiting on a short-lived child process) and writes what happened.
    public static async Task<int> SelfTestAsync(string spec)
    {
        var p = spec.Split(';');
        var baseUrl = p[0].TrimEnd('/'); var name = p[1]; var install = p[2]; var result = p[3];
        var lines = new List<string>();
        TestHosts.Add(new Uri(baseUrl).Host);
        var none = new Progress<double>(_ => { });
        try { await DownloadAsync(new Uri(baseUrl + "/" + name), new Uri(baseUrl + "/SUMS-BAD.txt"), name, none); lines.Add("FAIL bad checksum was accepted"); }
        catch (InvalidOperationException) { lines.Add("PASS bad checksum refused"); }
        try { await DownloadAsync(new Uri("https://evil.example.com/a.zip"), new Uri(baseUrl + "/SHA256SUMS.txt"), name, none); lines.Add("FAIL foreign host accepted"); }
        catch (InvalidOperationException) { lines.Add("PASS foreign host refused"); }
        try
        {
            var seen = 0.0;
            var staged = await DownloadAsync(new Uri(baseUrl + "/" + name), new Uri(baseUrl + "/SHA256SUMS.txt"), name, new Progress<double>(v => seen = v));
            lines.Add(File.Exists(Path.Combine(staged, "Ludus.exe")) ? "PASS good release downloaded, verified, unzipped" : "FAIL no Ludus.exe in the unzipped release");
            var child = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul") { CreateNoWindow = true, UseShellExecute = false })!;
            StartSwap(staged, install, child.Id);
            lines.Add("PASS swap helper started");
        }
        catch (Exception ex) { lines.Add("FAIL good release: " + ex.Message); }
        File.WriteAllText(result, string.Join("\n", lines) + "\n");
        return lines.Any(l => l.StartsWith("FAIL")) ? 1 : 0;
    }
}
