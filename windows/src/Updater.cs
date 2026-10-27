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

    private static readonly HttpClient Http = MakeClient();
    private static HttpClient MakeClient()
    {
        // Redirects followed (github.com -> release-assets.githubusercontent.com), a real User-Agent (GitHub wants one),
        // no whole-request cap: a stalled download is caught by the read timeout below instead.
        var h = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = true, MaxAutomaticRedirections = 10, ConnectTimeout = TimeSpan.FromSeconds(20),
            AutomaticDecompression = System.Net.DecompressionMethods.All }) { Timeout = Timeout.InfiniteTimeSpan };
        var v = typeof(Updater).Assembly.GetName().Version?.ToString(3) ?? "0";
        h.DefaultRequestHeaders.UserAgent.ParseAdd("Ludus/" + v + " (Windows)");
        return h;
    }
    private static readonly TimeSpan Stall = TimeSpan.FromSeconds(30);   // no bytes for this long: give up (then the fallback URL is tried)
    public const string Repo = "Solomon-69/Ludus";

    /// <summary>Tries the release's own links first, then the same file under releases/latest/download (another CDN path).</summary>
    public static async Task<string> DownloadWithFallbackAsync(Uri zip, Uri sums, string name, IProgress<double> progress)
    {
        try { return await DownloadAsync(zip, sums, name, progress); }
        catch (Exception ex) when (ex is not InvalidOperationException || ex.Message != "checksum mismatch")
        {
            Store.Log($"update: first try failed ({ex.Message}), trying the latest/download links");
            var b = $"https://github.com/{Repo}/releases/latest/download/";
            return await DownloadAsync(new Uri(b + name), new Uri(b + "SHA256SUMS.txt"), name, progress);
        }
    }

    private static async Task<string> GetStringAsync(Uri u)
    {
        using var cts = new CancellationTokenSource(Stall);
        return await Http.GetStringAsync(u, cts.Token);
    }

    /// <summary>Downloads and checks the zip, unzips it and returns the folder that holds Ludus.exe. Throws on any problem; nothing installed then.</summary>
    public static async Task<string> DownloadAsync(Uri zip, Uri sums, string name, IProgress<double> progress)
    {
        if (!Allowed(zip) || !Allowed(sums) || name.Contains('/') || name.Contains('\\')) throw new InvalidOperationException("source not allowed");
        var work = Path.Combine(Path.GetTempPath(), "ludus-update-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            var sumsText = await GetStringAsync(sums);
            var want = ExpectedHash(sumsText, name) ?? throw new InvalidOperationException("no checksum");

            var file = Path.Combine(work, name);
            progress.Report(1);   // started: the bar moves off 0 straight away
            using (var head = new CancellationTokenSource(Stall))
            using (var resp = await Http.GetAsync(zip, HttpCompletionOption.ResponseHeadersRead, head.Token))
            {
                resp.EnsureSuccessStatusCode();
                var total = resp.Content.Headers.ContentLength ?? 0;
                await using var src = await resp.Content.ReadAsStreamAsync();
                await using var dst = new FileStream(file, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, useAsync: true);
                var buf = new byte[1 << 18]; long got = 0; double last = 1; int n;
                while (true)
                {
                    using var cts = new CancellationTokenSource(Stall);
                    n = await src.ReadAsync(buf, cts.Token);
                    if (n <= 0) break;
                    await dst.WriteAsync(buf.AsMemory(0, n));
                    got += n;
                    // without a size, still show movement (up to 95%) so it never sits at 0
                    var p = total > 0 ? Math.Min(99, Math.Max(1, Math.Round(got * 100.0 / total))) : Math.Min(95, 1 + Math.Round(got / 1_000_000.0));
                    if (p != last) { last = p; progress.Report(p); }
                }
                if (total > 0 && got != total) throw new IOException($"download cut short ({got} of {total} bytes)");
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

    // ---------- Test aid (update-test workflow): --selftest-update=RESULTFILE ----------
    // No window. Does what Settings > Update does against the real GitHub release: check (the releases API), download with
    // progress, verify the checksum, unzip. Nothing is installed. Writes {ok, tag, maxPct, seconds, bytes, error} as JSON.
    public static async Task<int> SelfTestRealAsync(string result)
    {
        var sw = Stopwatch.StartNew(); double max = 0; string? tag = null, err = null; var ok = false;
        try
        {
            using var cts = new CancellationTokenSource(Stall);
            var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.github.com/repos/{Repo}/releases/latest");
            req.Headers.Accept.ParseAdd("application/vnd.github+json");
            using var resp = await Http.SendAsync(req, cts.Token);
            resp.EnsureSuccessStatusCode();
            using var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            tag = doc.RootElement.GetProperty("tag_name").GetString();
            string? zip = null, sums = null;
            foreach (var a in doc.RootElement.GetProperty("assets").EnumerateArray())
            {
                var n = a.GetProperty("name").GetString(); var u = a.GetProperty("browser_download_url").GetString();
                if (n == "Ludus-windows.zip") zip = u; else if (n == "SHA256SUMS.txt") sums = u;
            }
            if (zip == null || sums == null) throw new InvalidOperationException("release has no files");
            var staged = await DownloadWithFallbackAsync(new Uri(zip), new Uri(sums), "Ludus-windows.zip", new Progress<double>(v => max = Math.Max(max, v)));
            await Task.Delay(100);   // let the last progress report land
            ok = File.Exists(Path.Combine(staged, "Ludus.exe"));
            if (!ok) err = "no Ludus.exe in the download";
            for (var d = new DirectoryInfo(staged); d != null; d = d.Parent)
                if (d.Name.StartsWith("ludus-update-")) { try { d.Delete(true); } catch { /* temp folder */ } break; }
        }
        catch (Exception ex) { err = ex.GetType().Name + ": " + ex.Message; }
        var json = System.Text.Json.JsonSerializer.Serialize(new { ok, tag, maxPct = max, seconds = Math.Round(sw.Elapsed.TotalSeconds, 1), error = err });
        File.WriteAllText(result, json);
        return ok ? 0 : 1;
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
