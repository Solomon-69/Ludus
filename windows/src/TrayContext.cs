using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Ludus;

/// <summary>
/// The app itself: a tray icon (left-click toggles the panel, right-click shows Open / Open at login / Quit)
/// and the hidden-until-needed panel. Lives for the whole session; there is no main window.
/// "Invisible icon" hides the tray icon; Ludus then opens with Ctrl+Alt+G or from the Start menu.
/// </summary>
internal sealed class TrayContext : ApplicationContext
{
    private readonly Theme theme = new();
    private readonly PopupForm popup;
    private readonly NotifyIcon tray;
    private readonly ContextMenuStrip menu;
    private readonly ToolStripMenuItem loginItem;
    private readonly HotKey hotKey;
    private readonly LaunchOptions options;
    private Icon? trayIcon;
    private bool exiting;

    public TrayContext(LaunchOptions options)
    {
        this.options = options;
        Store.RefreshLoginPath();
        Store.EnsureStartMenuShortcut();

        PopupForm.SkipIntro = options.SelfTestPath != null;
        popup = new PopupForm(theme, ExitApp);
        // First run: the page asks for the panel so its welcome is seen, and keeps it open until it is done.
        popup.IntroRequested += () => { popup.StayOpen = true; popup.ShowPopup(TrayCenter()); };
        popup.IntroDone += () => popup.StayOpen = options.TestOpen;
        popup.LoginChanged += () => loginItem!.Checked = Store.LoginEnabled();
        popup.InvisibleChanged += hide => tray!.Visible = !hide;
        popup.PageReady += OnPageReady;

        var openItem = new ToolStripMenuItem("Open", null, (_, _) => popup.ShowPopup(TrayCenter()));
        openItem.Font = new Font(openItem.Font, FontStyle.Bold);
        loginItem = new ToolStripMenuItem("Open at login", null, (_, _) =>
        {
            Store.SetLogin(!Store.LoginEnabled());
            loginItem!.Checked = Store.LoginEnabled();
            popup.PushLogin();
        });
        var quitItem = new ToolStripMenuItem("Quit", null, (_, _) =>
        {
            if (popup.Visible) popup.Quit(); else ExitApp();
        });

        menu = new ContextMenuStrip { ShowImageMargin = false, ShowCheckMargin = true };
        menu.Items.AddRange(new ToolStripItem[] { openItem, loginItem, new ToolStripSeparator(), quitItem });
        menu.Opening += (_, _) =>
        {
            loginItem.Checked = Store.LoginEnabled();
            MenuStyle.Apply(menu, theme.SystemDark);
        };

        tray = new NotifyIcon { Text = "Ludus", ContextMenuStrip = menu };
        DrawTrayIcon();
        tray.Visible = !Store.LoadInvisible();
        tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) popup.Toggle(TrayCenter() ?? Cursor.Position);
        };
        theme.TaskbarChanged += () =>
        {
            if (popup.IsHandleCreated) popup.BeginInvoke(DrawTrayIcon);
        };

        // Ctrl+Alt+G opens or closes Ludus from anywhere (the way in when the icon is invisible).
        hotKey = new HotKey(() => popup.Toggle(TrayCenter() ?? DefaultAnchor()));

        // Start WebView2 once the message loop runs, so an early failure can still end the app cleanly.
        Application.Idle += StartOnce;
    }

    private void StartOnce(object? sender, EventArgs e)
    {
        Application.Idle -= StartOnce;
        _ = popup.InitializeAsync();
    }

    /// <summary>Called by the second-instance signal: just open the panel.</summary>
    public void OpenFromOutside() => Post(() =>
    {
        popup.ShowPopup(TrayCenter());
        var code = Store.TakeJoin();   // a clicked ludus://join/CODE link: go straight to joining that room
        if (code != null) popup.JoinRoom(code);
    });

    /// <summary>Called by "Ludus.exe --quit".</summary>
    public void QuitFromOutside() => Post(() => { if (popup.Visible) popup.Quit(); else ExitApp(); });

    private void Post(Action a)
    {
        try
        {
            if (!exiting && !popup.IsDisposed && popup.IsHandleCreated) popup.BeginInvoke(a);
        }
        catch (Exception ex) when (ex is ObjectDisposedException or InvalidOperationException)
        {
            // Ludus is shutting down.
        }
    }

    private static Point DefaultAnchor()
    {
        var work = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        return new Point(work.Right - 1, work.Bottom - 1);
    }

    // ---------- Tray icon ----------

    /// <summary>The controller glyph, white on a dark taskbar and near-black on a light one, at the exact tray size.</summary>
    private void DrawTrayIcon()
    {
        var px = TraySize();
        using var bmp = new Bitmap(px, px);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            Glyph.Controller(g, px, theme.TaskbarDark ? Color.White : Color.FromArgb(0x1A, 0x1A, 0x1A));
        }
        var handle = bmp.GetHicon();
        var next = (Icon)Icon.FromHandle(handle).Clone();
        Native.DestroyIcon(handle);
        tray.Icon = next;
        trayIcon?.Dispose();
        trayIcon = next;
    }

    private static int TraySize()
    {
        try { return Math.Max(16, Native.GetSystemMetricsForDpi(Native.SM_CXSMICON, Native.GetDpiForSystem())); }
        catch { return SystemInformation.SmallIconSize.Width; }
    }

    /// <summary>Screen rectangle of the tray icon, or null when hidden (invisible, or in the overflow area).</summary>
    private Rectangle? TrayBounds()
    {
        if (!tray.Visible) return null;
        try
        {
            IntPtr hwnd = IntPtr.Zero;
            uint? id = null;
            foreach (var f in typeof(NotifyIcon).GetFields(BindingFlags.Instance | BindingFlags.NonPublic))
            {
                var v = f.GetValue(tray);
                if (v is NativeWindow nw) hwnd = nw.Handle;
                else if (f.Name.TrimStart('_').Equals("id", StringComparison.OrdinalIgnoreCase) && v != null) id = Convert.ToUInt32(v);
            }
            if (hwnd == IntPtr.Zero || id == null) return null;
            var nid = new Native.NOTIFYICONIDENTIFIER { cbSize = (uint)Marshal.SizeOf<Native.NOTIFYICONIDENTIFIER>(), hWnd = hwnd, uID = id.Value };
            if (Native.Shell_NotifyIconGetRect(ref nid, out var rc) != 0) return null;
            var r = Rectangle.FromLTRB(rc.Left, rc.Top, rc.Right, rc.Bottom);
            return r.Width > 0 && r.Height > 0 ? r : null;
        }
        catch (Exception ex)
        {
            Store.Log($"Tray position unknown: {ex.Message}");
            return null;
        }
    }

    private Point? TrayCenter() => TrayBounds() is { } r ? new Point(r.Left + r.Width / 2, r.Top + r.Height / 2) : null;

    // ---------- Automated test (--test-open, --selftest=path) ----------

    private async void OnPageReady()
    {
        popup.PageReady -= OnPageReady;
        if (options.TestOpen)
        {
            popup.StayOpen = true;
            popup.ShowPopup(TrayCenter());
        }
        if (options.JoinCode != null)
        {
            popup.ShowPopup(TrayCenter());
            popup.JoinRoom(options.JoinCode);
        }
        if (options.SelfTestPath == null) return;
        if (options.ZoomProbe) { await popup.ZoomProbe(options.SelfTestPath); return; }
        await Task.Delay(2500);
        if (options.TestGame != null)
        {
            // Opens one game (a wide one makes the panel landscape) and records the panel size.
            await popup.Eval($"window.ludusOpenGame && ludusOpenGame({JsonSerializer.Serialize(options.TestGame)})");
            await Task.Delay(2000);
        }
        try
        {
            var cards = await popup.Eval("document.querySelectorAll('#grid .card').length");
            var games = await popup.Eval("(window.Ludus && Ludus.games && Ludus.games.length) || (window.L && L.games && L.games.length) || null");
            var state = await popup.Eval("window.ludusState ? ludusState() : null");
            var filter = await popup.Eval("(document.querySelector('#filters .chip.is-on')||{}).textContent || null");
            var b = popup.Bounds;
            var t = TrayBounds();
            var page = await popup.Eval("JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})");
            var selfCheck = await popup.Eval("window.ludusSelfCheck ? JSON.stringify(ludusSelfCheck()) : null");
            File.WriteAllText(options.SelfTestPath, JsonSerializer.Serialize(new
            {
                app = "Ludus",
                pid = Environment.ProcessId,
                ready = popup.IsReady,
                panelVisible = popup.Visible,
                panelBounds = new[] { b.X, b.Y, b.Width, b.Height },
                monitorScale = Native.ScaleAt(new Point(b.X + b.Width / 2, b.Y + b.Height / 2)),
                fitZoom = popup.FitZoom,
                page = JsonSerializer.Deserialize<string>(page),
                screen = new[] { Screen.PrimaryScreen!.Bounds.Width, Screen.PrimaryScreen.Bounds.Height },
                tray = t is { } r ? new[] { r.X, r.Y, r.Width, r.Height } : null,
                trayVisible = tray.Visible,
                hotKey = hotKey.Registered,
                cards = JsonSerializer.Deserialize<int>(cards),
                games,
                state = JsonSerializer.Deserialize<string?>(state),
                filter = JsonSerializer.Deserialize<string?>(filter),
                game = options.TestGame,
                check = JsonSerializer.Deserialize<string?>(selfCheck),
            }, new JsonSerializerOptions { WriteIndented = true }));
            SaveIconSheet(Path.ChangeExtension(options.SelfTestPath, ".icons.png"));
        }
        catch (Exception ex)
        {
            Store.Log($"Self-test failed: {ex}");
        }
    }

    /// <summary>Test aid: the tray glyph at 16-64 px on a dark and a light taskbar colour.</summary>
    private static void SaveIconSheet(string path)
    {
        int[] sizes = { 16, 20, 24, 32, 64 };
        const int cell = 72;
        using var sheet = new Bitmap(cell * sizes.Length * 2, cell);
        using var g = Graphics.FromImage(sheet);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        for (var half = 0; half < 2; half++)
        {
            var dark = half == 0;
            using var back = new SolidBrush(dark ? Color.FromArgb(0x20, 0x20, 0x20) : Color.FromArgb(0xF3, 0xF3, 0xF3));
            g.FillRectangle(back, half * cell * sizes.Length, 0, cell * sizes.Length, cell);
            for (var i = 0; i < sizes.Length; i++)
            {
                var state = g.Save();
                g.TranslateTransform(half * cell * sizes.Length + i * cell + (cell - sizes[i]) / 2f, (cell - sizes[i]) / 2f);
                Glyph.Controller(g, sizes[i], dark ? Color.White : Color.FromArgb(0x1A, 0x1A, 0x1A));
                g.Restore(state);
            }
        }
        sheet.Save(path, System.Drawing.Imaging.ImageFormat.Png);
    }

    private void ExitApp()
    {
        if (exiting) return;
        exiting = true;
        hotKey.Dispose();
        tray.Visible = false;   // no ghost icon left in the tray
        tray.Dispose();
        trayIcon?.Dispose();
        menu.Dispose();
        theme.Dispose();
        popup.Dispose();
        ExitThread();
    }
}

/// <summary>Ctrl+Alt+G, registered for the whole session on a hidden message window.</summary>
internal sealed class HotKey : NativeWindow, IDisposable
{
    private const int Id = 0x4C55;   // "LU"
    private const uint VkG = 0x47;
    private readonly Action onPress;

    public bool Registered { get; }

    public HotKey(Action onPress)
    {
        this.onPress = onPress;
        CreateHandle(new CreateParams { Parent = new IntPtr(-3) });   // HWND_MESSAGE: invisible, message-only
        Registered = Native.RegisterHotKey(Handle, Id, Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT, VkG);
        if (!Registered) Store.Log("Ctrl+Alt+G is taken by another app; open Ludus from the Start menu instead.");
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_HOTKEY && m.WParam.ToInt32() == Id) onPress();
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (Handle != IntPtr.Zero)
        {
            Native.UnregisterHotKey(Handle, Id);
            DestroyHandle();
        }
    }
}

/// <summary>The Ludus mark: a solid controller with the d-pad and a diamond of four face buttons cut out (as on the Mac).</summary>
internal static class Glyph
{
    public static void Controller(Graphics g, float px, Color color)
    {
        using var path = new System.Drawing.Drawing2D.GraphicsPath(System.Drawing.Drawing2D.FillMode.Alternate);
        // Body, in the Mac's 100-unit design space (y down).
        path.StartFigure();
        path.AddLine(32, 29, 68, 29);
        path.AddBezier(68, 29, 80, 29, 86.5f, 36, 89, 48);
        path.AddBezier(89, 48, 92, 60, 93, 70, 88, 75);
        path.AddBezier(88, 75, 83, 80, 76, 77.5f, 72, 71);
        path.AddLine(72, 71, 67.5f, 63.5f);
        path.AddBezier(67.5f, 63.5f, 65.8f, 61, 63.5f, 60, 60, 60);
        path.AddLine(60, 60, 40, 60);
        path.AddBezier(40, 60, 36.5f, 60, 34.2f, 61, 32.5f, 63.5f);
        path.AddLine(32.5f, 63.5f, 28, 71);
        path.AddBezier(28, 71, 24, 77.5f, 17, 80, 12, 75);
        path.AddBezier(12, 75, 7, 70, 8, 60, 11, 48);
        path.AddBezier(11, 48, 13.5f, 36, 20, 29, 32, 29);
        path.CloseFigure();
        // D-pad as one cross outline (no overlap, so the alternate fill cuts it out cleanly).
        float dx = 30.5f, dy = 45, arm = 9, half = 3.3f;
        path.AddPolygon(new[]
        {
            new PointF(dx - half, dy - arm), new PointF(dx + half, dy - arm), new PointF(dx + half, dy - half),
            new PointF(dx + arm, dy - half), new PointF(dx + arm, dy + half), new PointF(dx + half, dy + half),
            new PointF(dx + half, dy + arm), new PointF(dx - half, dy + arm), new PointF(dx - half, dy + half),
            new PointF(dx - arm, dy + half), new PointF(dx - arm, dy - half), new PointF(dx - half, dy - half),
        });
        // Four face buttons in a diamond.
        float cx = 69.5f, cy = 45, offset = 6.5f, radius = 3.4f;
        foreach (var (ox, oy) in new[] { (0f, -offset), (offset, 0f), (0f, offset), (-offset, 0f) })
            path.AddEllipse(cx + ox - radius, cy + oy - radius, radius * 2, radius * 2);

        var scale = px * 0.94f / 82f;   // body spans x 8..90
        using var m = new System.Drawing.Drawing2D.Matrix();
        m.Translate(px / 2f, px / 2f);
        m.Scale(scale, scale);
        m.Translate(-50f, -54f);
        path.Transform(m);
        using var brush = new SolidBrush(color);
        g.FillPath(brush, path);
    }
}

/// <summary>Tray menu colours that follow Windows light/dark (WinForms menus are always light otherwise).</summary>
internal static class MenuStyle
{
    private static readonly MenuColors LightColors = new(false), DarkColors = new(true);
    private static readonly ToolStripProfessionalRenderer LightRenderer = new(LightColors) { RoundedEdges = true };
    private static readonly ToolStripProfessionalRenderer DarkRenderer = new(DarkColors) { RoundedEdges = true };

    public static void Apply(ContextMenuStrip menu, bool dark)
    {
        var colors = dark ? DarkColors : LightColors;
        menu.Renderer = dark ? DarkRenderer : LightRenderer;
        menu.BackColor = colors.Back;
        foreach (ToolStripItem item in menu.Items) item.ForeColor = colors.Text;
    }

    private sealed class MenuColors : ProfessionalColorTable
    {
        public Color Back { get; }
        public Color Text { get; }
        private readonly Color hover;
        private readonly Color line;

        public MenuColors(bool dark)
        {
            UseSystemColors = false;
            Back = dark ? Color.FromArgb(0x2B, 0x27, 0x22) : Color.FromArgb(0xFB, 0xF8, 0xF3);
            Text = dark ? Color.FromArgb(0xF3, 0xED, 0xE3) : Color.FromArgb(0x20, 0x1C, 0x17);
            hover = dark ? Color.FromArgb(0x3A, 0x34, 0x2D) : Color.FromArgb(0xEE, 0xE6, 0xDA);
            line = dark ? Color.FromArgb(0x45, 0x3E, 0x36) : Color.FromArgb(0xDD, 0xD3, 0xC6);
        }

        public override Color ToolStripDropDownBackground => Back;
        public override Color MenuBorder => line;
        public override Color MenuItemBorder => hover;
        public override Color MenuItemSelected => hover;
        public override Color MenuItemSelectedGradientBegin => hover;
        public override Color MenuItemSelectedGradientEnd => hover;
        public override Color ImageMarginGradientBegin => Back;
        public override Color ImageMarginGradientMiddle => Back;
        public override Color ImageMarginGradientEnd => Back;
        public override Color SeparatorDark => line;
        public override Color SeparatorLight => Back;
        public override Color CheckBackground => hover;
        public override Color CheckSelectedBackground => hover;
        public override Color CheckPressedBackground => hover;
    }
}
