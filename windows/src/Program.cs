using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace Ludus;

/// <summary>Command-line switches: --quit (close the running Ludus), and for the automated Windows test
/// --test-open (open the panel once the games have loaded) and --selftest=PATH (write a result file).</summary>
internal sealed record LaunchOptions(bool TestOpen, bool Quit, string? SelfTestPath, string? TestGame, string? JoinCode)
{
    public bool ZoomProbe => Environment.GetCommandLineArgs().Contains("--test-zoomprobe", StringComparer.OrdinalIgnoreCase);

    public static LaunchOptions Parse(string[] args)
    {
        string? path = null, game = null, join = null;
        foreach (var a in args)
        {
            // ludus://join/K7M2Q (a clicked room invite): only a 5 character code is ever taken from it
            var m = System.Text.RegularExpressions.Regex.Match(a, @"^ludus://join/([A-Za-z0-9]{5})/?$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success) join = m.Groups[1].Value.ToUpperInvariant();
            if (a.StartsWith("--selftest=", StringComparison.OrdinalIgnoreCase)) path = a["--selftest=".Length..].Trim('"');
            if (a.StartsWith("--test-game=", StringComparison.OrdinalIgnoreCase)) game = a["--test-game=".Length..];
        }
        return new LaunchOptions(
            args.Contains("--test-open", StringComparer.OrdinalIgnoreCase),
            args.Contains("--quit", StringComparer.OrdinalIgnoreCase),
            path, game, join);
    }
}

internal static class Program
{
    private const string MutexName = @"Local\Ludus.SingleInstance";
    private const string OpenEventName = @"Local\Ludus.Open";
    private const string QuitEventName = @"Local\Ludus.Quit";
    // Microsoft's Evergreen WebView2 Runtime bootstrapper (needed on some Windows 10 PCs).
    private const string WebView2Download = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    [STAThread]
    private static void Main(string[] args)
    {
        var options = LaunchOptions.Parse(args);

        // Single instance: a second launch just asks the running Ludus to open its panel (or to quit).
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var firstInstance);
        if (!firstInstance)
        {
            try
            {
                if (options.JoinCode != null && !options.Quit) Store.QueueJoin(options.JoinCode);
                using var signal = EventWaitHandle.OpenExisting(options.Quit ? QuitEventName : OpenEventName);
                Native.AllowSetForegroundWindow(Native.ASFW_ANY);
                signal.Set();
            }
            catch (Exception ex)
            {
                Store.Log($"Could not signal the running Ludus: {ex.Message}");
            }
            return;
        }
        if (options.Quit) return;   // nothing running, nothing to quit
        Store.RegisterUrlScheme();   // so ludus://join/CODE links open Ludus

        // Created straight away so a second launch can always reach this one.
        using var openSignal = new EventWaitHandle(false, EventResetMode.AutoReset, OpenEventName);
        using var quitSignal = new EventWaitHandle(false, EventResetMode.AutoReset, QuitEventName);

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Store.Log($"Unhandled: {e.Exception}");
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Store.Log($"Fatal: {e.ExceptionObject}");

        if (!WebView2Installed())
        {
            var answer = MessageBox.Show(
                "Ludus needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.\n\n" +
                "It is built into Windows 11 and is a free, small download from Microsoft for Windows 10.\n\n" +
                "Open the download page now?",
                "Ludus", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (answer == DialogResult.Yes)
                Process.Start(new ProcessStartInfo(WebView2Download) { UseShellExecute = true });
            return;
        }

        var context = new TrayContext(options);
        var openWait = ThreadPool.RegisterWaitForSingleObject(
            openSignal, (_, _) => context.OpenFromOutside(), null, Timeout.Infinite, executeOnlyOnce: false);
        var quitWait = ThreadPool.RegisterWaitForSingleObject(
            quitSignal, (_, _) => context.QuitFromOutside(), null, Timeout.Infinite, executeOnlyOnce: false);

        Application.Run(context);

        openWait.Unregister(null);
        quitWait.Unregister(null);
        GC.KeepAlive(mutex);
    }

    private static bool WebView2Installed()
    {
        try
        {
            return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString());
        }
        catch (WebView2RuntimeNotFoundException)
        {
            return false;
        }
        catch (Exception ex)
        {
            Store.Log($"WebView2 check failed: {ex.Message}");
            return true;   // let the real start report a clearer error
        }
    }
}
