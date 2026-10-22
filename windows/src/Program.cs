using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace Ludus;

internal static class Program
{
    private const string MutexName = @"Local\Ludus.SingleInstance";
    private const string OpenEventName = @"Local\Ludus.Open";
    // Microsoft's Evergreen WebView2 Runtime bootstrapper (needed on some Windows 10 PCs).
    private const string WebView2Download = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    [STAThread]
    private static void Main()
    {
        // Single instance: a second launch just asks the running Ludus to open its panel.
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var firstInstance);
        if (!firstInstance)
        {
            try
            {
                using var open = EventWaitHandle.OpenExisting(OpenEventName);
                Native.AllowSetForegroundWindow(Native.ASFW_ANY);
                open.Set();
            }
            catch (Exception ex)
            {
                Store.Log($"Could not signal the running Ludus: {ex.Message}");
            }
            return;
        }

        // Created straight away so a second launch can always reach this one.
        using var openSignal = new EventWaitHandle(false, EventResetMode.AutoReset, OpenEventName);

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

        var context = new TrayContext();
        var wait = ThreadPool.RegisterWaitForSingleObject(
            openSignal, (_, _) => context.OpenFromOutside(), null, Timeout.Infinite, executeOnlyOnce: false);

        Application.Run(context);

        wait.Unregister(null);
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
