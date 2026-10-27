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

    /// <summary>Where a release file can also be fetched if the address the page gave does not work.</summary>
    public const string LatestDownload = "https://github.com/Solomon-69/Ludus/releases/latest/download/";

    private const int Attempts = 4;                                    // per address; a dropped connection resumes where it stopped
    private static readonly TimeSpan Stall = TimeSpan.FromSeconds(30); // no bytes for this long = try again

    // One client for the app's life. Connect timeout short, no overall timeout (a big file on a slow line may take a
    // while); the stall watchdog below catches a download that stops moving. Redirects (github.com -> release-assets)
    // are followed. GitHub asks every client to send a User-Agent.
    private static readonly HttpClient Http = MakeClient();
    private static HttpClient MakeClient()
    {
        var h = new SocketsHttpHandler
        {
            ConnectTimeout = TimeSpan.FromSeconds(20),
            AllowAutoRedirect = true, MaxAutomaticRedirections = 10,
            AutomaticDecompression = System.Net.DecompressionMethods.None,
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        };
        var c = new HttpClient(h) { Timeout = Timeout.InfiniteTimeSpan };
        var v = typeof(Updater).Assembly.GetName().Version;
        c.DefaultRequestHeaders.UserAgent.ParseAdd($"Ludus/{v?.Major}.{v?.Minor}.{v?.Build} (Windows)");
        return c;
    }

    /// <summary>Optional log line for each step (the app writes it to its log file).</summary>
    public static Action<string>? Log { get; set; }

    /// <summary>Downloads and checks the zip, unzips it and returns the folder that holds Ludus.exe. Throws on any problem; nothing installed then.
    /// <paramref name="progress"/> gets 0..100 (one decimal) when the size is known; <paramref name="bytes"/> gets the bytes so far when it is not.</summary>
    public static async Task<string> DownloadAsync(Uri zip, Uri sums, string name, IProgress<double> progress, IProgress<long>? bytes = null, CancellationToken ct = default)
    {
        if (!Allowed(zip) || !Allowed(sums) || name.Contains('/') || name.Contains('\\')) throw new InvalidOperationException("source not allowed");
        var work = Path.Combine(Path.GetTempPath(), "ludus-update-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            progress.Report(0);
            var sumsText = await WithFallback(sums, "SHA256SUMS.txt", u => GetTextAsync(u, ct), ct);
            var want = ExpectedHash(sumsText, name) ?? throw new InvalidOperationException("no checksum");

            var file = Path.Combine(work, name);
            await WithFallback(zip, name, u => FetchFileAsync(u, file, progress, bytes, ct), ct);
            string have;
            await using (var fs = File.OpenRead(file)) have = Convert.ToHexString(await SHA256.HashDataAsync(fs, ct)).ToLowerInvariant();
            if (have != want) throw new InvalidOperationException("checksum mismatch");
            progress.Report(100);
            Log?.Invoke("update: downloaded and checked " + name);

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

    /// <summary>Tries the address from the page, then the fixed "latest release" address (real releases only).
    /// The checksum check still guards whatever arrives.</summary>
    private static async Task<T> WithFallback<T>(Uri first, string fileName, Func<Uri, Task<T>> get, CancellationToken ct)
    {
        try { return await get(first); }
        catch (Exception ex) when (ex is not InvalidOperationException && !ct.IsCancellationRequested
                                   && first.Scheme == Uri.UriSchemeHttps && first.AbsolutePath.Contains("/releases/"))
        {
            var second = new Uri(LatestDownload + Uri.EscapeDataString(fileName));
            Log?.Invoke($"update: {first.Host} failed ({ex.Message}), trying {second}");
            return await get(second);
        }
    }

    private static async Task<string> GetTextAsync(Uri u, CancellationToken ct)
    {
        for (var i = 1; ; i++)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(30));
                return await Http.GetStringAsync(u, cts.Token);
            }
            catch (Exception ex) when (i < Attempts && !ct.IsCancellationRequested && Retryable(ex))
            {
                Log?.Invoke($"update: {u.Host} try {i} failed ({ex.Message})");
                await Task.Delay(TimeSpan.FromSeconds(i * 2), ct);
            }
        }
    }

    // A 4xx answer (file not there) is not worth repeating; dropped connections, time-outs and 5xx are.
    private static bool Retryable(Exception ex) =>
        ex is HttpRequestException h ? h.StatusCode is null || (int)h.StatusCode >= 500 || h.StatusCode == System.Net.HttpStatusCode.RequestTimeout
        : ex is IOException or OperationCanceledException;

    /// <summary>Streams <paramref name="u"/> to <paramref name="file"/> in 64 KB pieces, reporting progress as it goes.
    /// A stall (no bytes for 30 s) or a dropped connection is retried, carrying on from the bytes already saved when the
    /// server allows it (HTTP Range), otherwise from the start.</summary>
    private static async Task<bool> FetchFileAsync(Uri u, string file, IProgress<double> progress, IProgress<long>? bytes, CancellationToken ct)
    {
        long got = 0, total = 0;
        double last = -1;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        File.Delete(file);
        for (var i = 1; ; i++)
        {
            using var stall = CancellationTokenSource.CreateLinkedTokenSource(ct);
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, u);
                if (got > 0) req.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(got, null);
                stall.CancelAfter(Stall);
                using var resp = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, stall.Token);
                if (!Allowed(resp.RequestMessage?.RequestUri ?? u)) throw new InvalidOperationException("source not allowed");
                if (got > 0 && resp.StatusCode != System.Net.HttpStatusCode.PartialContent) { got = 0; File.Delete(file); }   // no resume: start again
                resp.EnsureSuccessStatusCode();
                var len = resp.Content.Headers.ContentLength ?? 0;
                if (total == 0 && len > 0) total = got + len;
                Log?.Invoke($"update: downloading {u.Host} -> {resp.RequestMessage?.RequestUri?.Host} ({(total > 0 ? total / 1048576.0 : -1):0.0} MB, from {got / 1048576.0:0.0} MB, try {i})");
                await using var src = await resp.Content.ReadAsStreamAsync(stall.Token);
                await using var dst = new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.None, 65536, true);
                var buf = new byte[65536]; int n;
                while (true)
                {
                    stall.CancelAfter(Stall);   // re-arm: the watchdog only fires when nothing arrives for 30 s
                    n = await src.ReadAsync(buf, stall.Token);
                    if (n <= 0) break;
                    await dst.WriteAsync(buf.AsMemory(0, n), ct);
                    got += n;
                    if (total > 0)
                    {
                        var p = Math.Min(99.9, Math.Floor(got * 1000.0 / total) / 10);
                        if (p != last) { last = p; progress.Report(p); }
                    }
                    else bytes?.Report(got);
                }
                if (total > 0 && got < total) throw new IOException($"connection closed early ({got} of {total} bytes)");
                Log?.Invoke($"update: {got / 1048576.0:0.0} MB in {sw.Elapsed.TotalSeconds:0}s");
                return true;
            }
            catch (Exception ex) when (i < Attempts && !ct.IsCancellationRequested && Retryable(ex))
            {
                Log?.Invoke($"update: try {i} stopped at {got / 1048576.0:0.0} MB ({(stall.IsCancellationRequested ? "no data for 30 s" : ex.Message)})");
                await Task.Delay(TimeSpan.FromSeconds(i * 2), ct);
            }
            catch (Exception ex) when (stall.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                throw new TimeoutException("the download stopped (no data for 30 s)", ex);
            }
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
            "for ($i=0; $i -lt 20; $i++) { try { Copy-Item -Path (Join-Path $Staged '*') -Destination $Install -Recurse -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }\n" +
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
