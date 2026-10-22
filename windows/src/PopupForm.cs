using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Ludus;

/// <summary>
/// The Ludus panel: a borderless, rounded, shadowed window that opens just above the tray and hosts
/// the shared web games (../web) in WebView2. Mirrors the Mac popover in Sources/App.swift, including
/// the page bridge (save, size, wide, theme, login, quit, playing) and the window.ludus* callbacks.
/// </summary>
internal sealed class PopupForm : Form
{
    // Served from the bundled "web" folder. A made-up host on the reserved .example TLD:
    // Microsoft advises against .local (it can add a delay to every navigation).
    private const string Host = "ludus.example";
    private const string Origin = "https://" + Host + "/";
    private const string StartPage = Origin + "index.html";

    private static readonly Size CompactDip = new(400, 600);
    private static readonly Size LargeDip = new(520, 740);
    // Landscape panel used only while a wide game is open (same sizes as the Mac app).
    private static readonly Size WideCompactDip = new(760, 500);
    private static readonly Size WideLargeDip = new(900, 600);
    private const int GapDip = 12;              // space between the panel and the taskbar / screen edge
    private const int ReopenGuardMs = 600;      // a tray click that closed the panel must not reopen it
    private const int QuitFadeMs = 180;

    private const int WS_EX_TOOLWINDOW = 0x00000080;  // no taskbar button, no Alt+Tab entry
    private const int CS_DROPSHADOW = 0x00020000;     // shadow on Windows 10 (Windows 11 draws its own)

    private readonly WebView2 web;
    private readonly Theme theme;
    private readonly Action onQuit;
    private string size;
    private bool wide;
    private Point anchor;
    private bool hasAnchor;
    private bool ready;
    private bool quitting;
    private long lastHiddenAt;
    private string? bootScriptId;

    /// <summary>Raised when "Open at login" changes from inside the page.</summary>
    public event Action? LoginChanged;

    /// <summary>Raised when the "Invisible icon" setting changes (true = hide the tray icon).</summary>
    public event Action<bool>? InvisibleChanged;

    /// <summary>Raised once the games page has loaded.</summary>
    public event Action? PageReady;

    public bool IsReady => ready;

    /// <summary>Keeps the panel open when it loses focus (automated test only).</summary>
    public bool StayOpen { get; set; }
    /// <summary>The page shows its first-run welcome (asks for the panel to open) and finishes it.</summary>
    public event Action? IntroRequested, IntroDone;
    /// <summary>Automated test runs skip the first-run welcome.</summary>
    public static bool SkipIntro { get; set; }

    public PopupForm(Theme theme, Action onQuit)
    {
        this.theme = theme;
        this.onQuit = onQuit;
        size = Store.LoadSize();

        Text = "Ludus";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        AutoScaleMode = AutoScaleMode.None;   // sizes are computed per monitor in PopupBounds
        MinimizeBox = false;
        MaximizeBox = false;
        ControlBox = false;

        web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);
        ApplyThemeColors();

        theme.SystemDarkChanged += dark =>
        {
            // SystemEvents may call back on its own thread; hop to the UI thread.
            if (IsHandleCreated) BeginInvoke((MethodInvoker)(() => OnSystemDarkChanged(dark)));
        };
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_TOOLWINDOW;
            if (!Native.IsWindows11) cp.ClassStyle |= CS_DROPSHADOW;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => false;

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Windows 11: system rounded corners, border and shadow on our borderless window.
        Native.SetDwmInt(Handle, Native.DWMWA_WINDOW_CORNER_PREFERENCE, Native.DWMWCP_ROUND);
        Native.SetDwmInt(Handle, Native.DWMWA_USE_IMMERSIVE_DARK_MODE, theme.EffectiveDark ? 1 : 0);
    }

    // ---------- WebView2 ----------

    /// <summary>Creates WebView2, wires the bridge and loads the games. Called once at start, while hidden.</summary>
    public async Task InitializeAsync()
    {
        try
        {
            // Force the window handles so WebView2 can attach while the panel is still hidden.
            _ = Handle;
            _ = web.Handle;

            var userData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ludus", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, userData);
            await web.EnsureCoreWebView2Async(env);
            var core = web.CoreWebView2;

            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;   // no F5 / Ctrl+R / Ctrl+P inside the panel
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
#if DEBUG
            core.Settings.AreDevToolsEnabled = true;
#else
            core.Settings.AreDevToolsEnabled = false;
#endif

            var webFolder = Path.Combine(AppContext.BaseDirectory, "web");
            if (!File.Exists(Path.Combine(webFolder, "index.html")))
            {
                Store.Log($"Game files not found at {webFolder}");
                MessageBox.Show("Ludus could not find its game files (the \"web\" folder next to Ludus.exe).\n\n" +
                                "Keep Ludus.exe and the web folder together, then open Ludus again.",
                                "Ludus", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                onQuit();
                return;
            }
            core.SetVirtualHostNameToFolderMapping(Host, webFolder, CoreWebView2HostResourceAccessKind.Deny);

            await RegisterBootScriptAsync();
            core.WebMessageReceived += OnWebMessage;
            core.NavigationStarting += (_, e) =>
            {
                // Only the bundled game files may load; anything else (a stray link) is refused.
                if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
            };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationCompleted += (_, e) =>
            {
                ready = e.IsSuccess;
                if (!e.IsSuccess) { Store.Log($"Page failed to load: {e.WebErrorStatus}"); return; }
                if (Visible) RunScript("window.ludusOpened && ludusOpened()");
                PageReady?.Invoke();
            };
            core.ProcessFailed += (_, e) =>
            {
                Store.Log($"WebView2 process failed: {e.ProcessFailedKind}");
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited ||
                    e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                {
                    ReloadWithFreshState();
                }
            };

            core.Navigate(StartPage);
        }
        catch (Exception ex)
        {
            Store.Log($"WebView2 start failed: {ex}");
            MessageBox.Show("Ludus could not start its game view (Microsoft Edge WebView2).\n\n" + ex.Message,
                            "Ludus", MessageBoxButtons.OK, MessageBoxIcon.Error);
            onQuit();
        }
    }

    /// <summary>(Re)registers the boot script so a reload gets the current saved state, not the one from start-up.</summary>
    private async Task RegisterBootScriptAsync()
    {
        var core = web.CoreWebView2;
        if (bootScriptId != null) core.RemoveScriptToExecuteOnDocumentCreated(bootScriptId);
        bootScriptId = await core.AddScriptToExecuteOnDocumentCreatedAsync(BootScript());
    }

    private async void ReloadWithFreshState()
    {
        try
        {
            ready = false;
            await RegisterBootScriptAsync();
            web.CoreWebView2.Navigate(StartPage);
        }
        catch (Exception ex)
        {
            Store.Log($"Reload failed: {ex.Message}");
        }
    }

    /// <summary>Runs before the page's own scripts: hands over saved scores/settings and Windows' state.</summary>
    private string BootScript()
    {
        static string Bool(bool b) => b ? "true" : "false";
        return "window.__LUDUS_NATIVE__ = true;\n" +
               "window.__LUDUS_PLATFORM__ = 'windows';\n" +
               $"window.__LUDUS_STATE__ = {Store.LoadStateJson()};\n" +
               $"window.__LUDUS_LOGIN__ = {Bool(Store.LoginEnabled())};\n" +
               $"window.__LUDUS_DARK__ = {Bool(theme.SystemDark)};\n" +
               $"window.__LUDUS_INVISIBLE__ = {Bool(Store.LoadInvisible())};\n" +
               $"window.__LUDUS_SKIP_INTRO__ = {Bool(SkipIntro)};\n";
    }

    private void RunScript(string js)
    {
        if (web.CoreWebView2 == null) return;
        web.ExecuteScriptAsync(js).ContinueWith(
            t => Store.Log($"Script failed: {t.Exception?.GetBaseException().Message}"),
            CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
    }

    // ---------- Bridge: page -> app ----------

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var msg = doc.RootElement;
            if (msg.ValueKind != JsonValueKind.Object ||
                !msg.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String) return;

            switch (type.GetString())
            {
                case "save":
                    if (msg.TryGetProperty("state", out var state)) Store.SaveState(state);
                    break;
                case "size":
                    size = StringProp(msg, "size") == "large" ? "large" : "compact";
                    Store.SaveSize(size);
                    if (Visible) Bounds = PopupBounds();   // one layout at the new size, no animated reflow
                    break;
                case "wide":
                    wide = msg.TryGetProperty("on", out var wideProp) && wideProp.ValueKind == JsonValueKind.True;
                    if (Visible) Bounds = PopupBounds();
                    RunScript("window.ludusResized && ludusResized()");   // the page waits for this before starting the game
                    break;
                case "theme":
                    var mode = StringProp(msg, "mode");
                    theme.Mode = mode is "light" or "dark" ? mode : "system";
                    ApplyThemeColors();
                    break;
                case "login":
                    var on = msg.TryGetProperty("on", out var onProp) && onProp.ValueKind == JsonValueKind.True;
                    Store.SetLogin(on);
                    PushLogin();
                    LoginChanged?.Invoke();
                    break;
                case "invisible":
                    var hide = msg.TryGetProperty("on", out var hideProp) && hideProp.ValueKind == JsonValueKind.True;
                    Store.SaveInvisible(hide);
                    InvisibleChanged?.Invoke(hide);
                    break;
                case "quit":
                    // Leave the WebView2 event first; quitting disposes the control.
                    BeginInvoke((MethodInvoker)Quit);
                    break;
                case "intro":
                    BeginInvoke((MethodInvoker)(() => IntroRequested?.Invoke()));
                    break;
                case "introDone":
                    BeginInvoke((MethodInvoker)(() => IntroDone?.Invoke()));
                    break;
                case "playing":
                    break;   // the Mac ignores this too; kept for future use
            }
        }
        catch (JsonException ex)
        {
            Store.Log($"Bad message from page: {ex.Message}");
        }
    }

    private static string? StringProp(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    /// <summary>Runs JavaScript and returns its JSON result (used by the automated test).</summary>
    public async Task<string> Eval(string js) => web.CoreWebView2 == null ? "null" : await web.ExecuteScriptAsync(js);

    public void PushLogin() => RunScript($"window.__LUDUS_LOGIN__ = {(Store.LoginEnabled() ? "true" : "false")}");

    // ---------- Theme ----------

    private void OnSystemDarkChanged(bool dark)
    {
        ApplyThemeColors();
        RunScript($"window.ludusSetSystemDark && ludusSetSystemDark({(dark ? "true" : "false")})");
    }

    /// <summary>Paper colour behind the page (it is transparent in "system" mode) and a matching window border.</summary>
    private void ApplyThemeColors()
    {
        var paper = theme.EffectiveDark ? Theme.PaperDark : Theme.PaperLight;
        BackColor = paper;
        web.DefaultBackgroundColor = paper;
        if (IsHandleCreated)
            Native.SetDwmInt(Handle, Native.DWMWA_USE_IMMERSIVE_DARK_MODE, theme.EffectiveDark ? 1 : 0);
    }

    // ---------- Showing and hiding ----------

    /// <summary>Left-click on the tray icon.</summary>
    public void Toggle(Point at)
    {
        if (Visible) { HidePopup(); return; }
        // Clicking the tray icon while open first deactivates (and hides) the panel; don't bring it straight back.
        if (Environment.TickCount64 - lastHiddenAt < ReopenGuardMs) return;
        ShowPopup(at);
    }

    /// <summary>Opens the panel above the tray. Without a point it opens at the tray corner of the main screen.</summary>
    public void ShowPopup(Point? at = null)
    {
        if (quitting) return;
        if (at.HasValue) { anchor = at.Value; hasAnchor = true; }
        else if (!hasAnchor)
        {
            var work = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
            anchor = new Point(work.Right - 1, work.Bottom - 1);
        }

        theme.Refresh();   // in case a theme change event was missed while hidden
        wide = false;   // Ludus always opens on All games, so never at a wide game's landscape size
        Bounds = PopupBounds();
        if (!Visible) Show();
        Activate();
        Native.SetForegroundWindow(Handle);
        web.Focus();
        if (ActiveForm != this)
        {
            // Opened from outside (second launch): the focus grant can arrive a moment later.
            BeginInvoke((MethodInvoker)(() =>
            {
                if (!Visible) return;
                Native.SetForegroundWindow(Handle);
                Activate();
                web.Focus();
            }));
        }
        if (ready) RunScript("window.ludusOpened && ludusOpened()");
    }

    public void HidePopup()
    {
        if (!Visible) return;
        Hide();
        lastHiddenAt = Environment.TickCount64;
        RunScript("window.ludusClosed && ludusClosed()");
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        if (!quitting && !StayOpen) HidePopup();   // click outside = close, like the Mac popover
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        // We size the panel ourselves per monitor; stop WinForms from rescaling it a second time.
        e.Cancel = true;
        base.OnDpiChanged(e);
        if (Visible) BeginInvoke((MethodInvoker)(() => { Bounds = PopupBounds(); }));
    }

    /// <summary>Panel rectangle in physical pixels: DIP size times the monitor scale, docked to the taskbar side.</summary>
    private Rectangle PopupBounds()
    {
        var screen = Screen.FromPoint(anchor);
        var work = screen.WorkingArea;
        var scale = Native.ScaleAt(anchor);
        var dip = wide ? (size == "large" ? WideLargeDip : WideCompactDip) : (size == "large" ? LargeDip : CompactDip);
        var gap = (int)Math.Round(GapDip * scale);
        var w = Math.Min((int)Math.Round(dip.Width * scale), work.Width - gap * 2);
        var h = Math.Min((int)Math.Round(dip.Height * scale), work.Height - gap * 2);

        var edge = TaskbarEdge(screen);
        // An auto-hidden taskbar does not shrink the working area; leave room for it to slide in.
        if (work == screen.Bounds)
        {
            var reserve = (int)Math.Round(48 * scale);
            work = edge switch
            {
                Native.ABE_LEFT => new Rectangle(work.Left + reserve, work.Top, work.Width - reserve, work.Height),
                Native.ABE_TOP => new Rectangle(work.Left, work.Top + reserve, work.Width, work.Height - reserve),
                Native.ABE_RIGHT => new Rectangle(work.Left, work.Top, work.Width - reserve, work.Height),
                _ => new Rectangle(work.Left, work.Top, work.Width, work.Height - reserve),
            };
        }

        int x, y;
        switch (edge)
        {
            case Native.ABE_LEFT: x = work.Left + gap; y = anchor.Y - h / 2; break;
            case Native.ABE_RIGHT: x = work.Right - gap - w; y = anchor.Y - h / 2; break;
            case Native.ABE_TOP: x = anchor.X - w / 2; y = work.Top + gap; break;
            default: x = anchor.X - w / 2; y = work.Bottom - gap - h; break;
        }
        x = Math.Clamp(x, work.Left + gap, Math.Max(work.Left + gap, work.Right - gap - w));
        y = Math.Clamp(y, work.Top + gap, Math.Max(work.Top + gap, work.Bottom - gap - h));
        return new Rectangle(x, y, w, h);
    }

    /// <summary>
    /// Taskbar side for the screen that was clicked: the side where the working area is cut short.
    /// Falls back to the main taskbar's edge (auto-hide or no taskbar on that screen).
    /// </summary>
    private static uint TaskbarEdge(Screen screen)
    {
        var b = screen.Bounds;
        var w = screen.WorkingArea;
        if (w.Bottom < b.Bottom) return Native.ABE_BOTTOM;
        if (w.Top > b.Top) return Native.ABE_TOP;
        if (w.Left > b.Left) return Native.ABE_LEFT;
        if (w.Right < b.Right) return Native.ABE_RIGHT;
        return Native.TaskbarEdge();
    }

    // ---------- Quit ----------

    /// <summary>Fades the panel's content out, hides it, then exits (the page's Quit button or the tray menu).</summary>
    public async void Quit()
    {
        if (quitting) return;
        quitting = true;
        try
        {
            if (ready && web.CoreWebView2 != null)
            {
                // Save the running game first (ludusClosed writes the state at once), then fade.
                await web.ExecuteScriptAsync("window.ludusClosed && ludusClosed()");
                await Task.Delay(60);
            }
            if (Visible && ready && web.CoreWebView2 != null)
            {
                await web.ExecuteScriptAsync(
                    $"document.documentElement.style.transition='opacity {QuitFadeMs}ms ease';" +
                    "document.documentElement.style.opacity='0';");
                await Task.Delay(QuitFadeMs + 20);
            }
        }
        catch (Exception ex)
        {
            Store.Log($"Quit fade skipped: {ex.Message}");
        }
        Hide();
        onQuit();
    }
}
