using System.Diagnostics;
using System.Text.Json;

namespace Ludus;

/// <summary>UpdateProbe RESULTFILE INSTALLDIR [LABEL]: checks the latest Ludus release like the app does, downloads it
/// with Updater.DownloadAsync on a UI thread (progress logged with times), then runs Updater.StartSwap over INSTALLDIR
/// (an older Ludus) and waits for the new Ludus.exe to land there. Exit 0 = every check passed.</summary>
internal static class Probe
{
    private static readonly List<string> Lines = new();
    private static readonly Stopwatch Clock = Stopwatch.StartNew();
    private static string? resultFile;
    private static void Log(string s)
    {
        var l = $"[{Clock.Elapsed.TotalSeconds,6:0.0}s] {s}";
        lock (Lines) { Lines.Add(l); if (resultFile != null) File.AppendAllText(resultFile, l + "\n"); }   // written as it goes
    }

    [STAThread]
    private static int Main(string[] args)
    {
        var result = args[0]; var install = args[1]; var label = args.Length > 2 ? args[2] : "updater";
        File.WriteAllText(result, ""); resultFile = result;
        int code = 1;
        var form = new Form { ShowInTaskbar = false, Opacity = 0, Width = 1, Height = 1 };
        form.Load += async (_, _) => { try { code = await Run(install, label); } catch (Exception e) { Log("FAIL " + e); } form.Close(); };
        Application.Run(form);
        return code;
    }

    private static async Task<int> Run(string install, string label)
    {
        Log($"{label}: checking the latest release (same request as the app)");
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Ludus-update-probe");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        var rel = JsonDocument.Parse(await http.GetStringAsync("https://api.github.com/repos/Solomon-69/Ludus/releases/latest")).RootElement;
        var tag = rel.GetProperty("tag_name").GetString()!.TrimStart('v');
        string Url(string n) => rel.GetProperty("assets").EnumerateArray().First(a => a.GetProperty("name").GetString() == n).GetProperty("browser_download_url").GetString()!;
        var zip = Url("Ludus-windows.zip"); var sums = Url("SHA256SUMS.txt");
        Log($"latest = {tag}, zip = {zip}");

        double max = 0; var firstAboveZero = -1.0;
        SetUpdaterLog();   // only the newer updater has this hook
        var progress = new Progress<double>(p =>
        {
            if (p > max) { max = p; if (firstAboveZero < 0 && p > 0) firstAboveZero = Clock.Elapsed.TotalSeconds; if (p % 10 == 0 || p >= 99) Log($"progress {p}%"); }
        });
        var t0 = Clock.Elapsed.TotalSeconds;
        var dl = Updater.DownloadAsync(new Uri(zip), new Uri(sums), "Ludus-windows.zip", progress);
        var limit = Task.Delay(TimeSpan.FromMinutes(8));
        if (await Task.WhenAny(dl, limit) == limit) { Log($"FAIL download not finished after 8 minutes (progress {max}%)"); return 1; }
        var staged = await dl;
        var secs = Clock.Elapsed.TotalSeconds - t0;
        Log($"download+verify+unzip took {secs:0.0}s, progress first above 0 at {firstAboveZero:0.0}s, highest {max}%");
        var fails = 0;
        void Check(bool ok, string what) { Log((ok ? "PASS " : "FAIL ") + what); if (!ok) fails++; }
        Check(max >= 100, "progress reached 100%");
        Check(firstAboveZero > 0 && firstAboveZero - t0 < 30, "progress moved above 0% within 30 seconds");
        Check(secs < 300, "download finished within 5 minutes");
        Check(File.Exists(Path.Combine(staged, "Ludus.exe")), "staged folder holds Ludus.exe");

        var before = FileVersionInfo.GetVersionInfo(Path.Combine(install, "Ludus.exe")).FileVersion;
        Log($"installed before swap: {before}");
        var child = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul") { CreateNoWindow = true, UseShellExecute = false })!;
        Updater.StartSwap(staged, install, child.Id);
        string? after = before;
        for (var i = 0; i < 120; i++)
        {
            await Task.Delay(500);
            try { after = FileVersionInfo.GetVersionInfo(Path.Combine(install, "Ludus.exe")).FileVersion; } catch { /* mid-copy */ }
            if (after != null && after.StartsWith(tag + ".")) break;
        }
        Check(after != null && after.StartsWith(tag + "."), $"install folder now holds Ludus {tag} (file version {after})");
        var relaunched = false;
        for (var i = 0; i < 20 && !relaunched; i++) { await Task.Delay(500); relaunched = Process.GetProcessesByName("Ludus").Any(); }
        Check(relaunched, "Ludus was started again after the swap");
        Get_Ludus_Quit();
        if (label == "current")
        {
            // The address the page gave is broken (a release that does not exist): the updater must fall back to the
            // fixed "latest release" address and still finish.
            Log("fallback: starting from a broken address");
            try
            {
                var bad = new Uri("https://github.com/Solomon-69/Ludus/releases/download/v0.0.0/Ludus-windows.zip");
                var badSums = new Uri("https://github.com/Solomon-69/Ludus/releases/download/v0.0.0/SHA256SUMS.txt");
                SetUpdaterLog();
                var st = await Updater.DownloadAsync(bad, badSums, "Ludus-windows.zip", new Progress<double>(_ => { }));
                Check(File.Exists(Path.Combine(st, "Ludus.exe")), "fallback address used when the first one fails");
            }
            catch (Exception e) { Check(false, "fallback address used when the first one fails: " + e.Message); }
        }
        return fails == 0 ? 0 : 1;
    }

    private static void SetUpdaterLog() =>
        typeof(Updater).GetProperty("Log")?.SetValue(null, (Action<string>)(m => Log("  " + m)));

    private static void Get_Ludus_Quit() { foreach (var p in Process.GetProcessesByName("Ludus")) try { p.Kill(); } catch { } }
}
