namespace Ludus;

/// <summary>
/// The app itself: a tray icon (left-click toggles the panel, right-click shows Open / Open at login / Quit)
/// and the hidden-until-needed panel. Lives for the whole session; there is no main window.
/// </summary>
internal sealed class TrayContext : ApplicationContext
{
    private readonly Theme theme = new();
    private readonly PopupForm popup;
    private readonly NotifyIcon tray;
    private readonly ContextMenuStrip menu;
    private readonly ToolStripMenuItem loginItem;
    private bool exiting;

    public TrayContext()
    {
        Store.RefreshLoginPath();

        popup = new PopupForm(theme, ExitApp);
        popup.LoginChanged += () => loginItem!.Checked = Store.LoginEnabled();

        var openItem = new ToolStripMenuItem("Open", null, (_, _) => popup.ShowPopup());
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

        tray = new NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "Ludus",
            ContextMenuStrip = menu,
            Visible = true,
        };
        tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) popup.Toggle(Cursor.Position);
        };

        // Start WebView2 once the message loop runs, so an early failure can still end the app cleanly.
        Application.Idle += StartOnce;
    }

    private void StartOnce(object? sender, EventArgs e)
    {
        Application.Idle -= StartOnce;
        _ = popup.InitializeAsync();
    }

    /// <summary>Called by the second-instance signal: just open the panel.</summary>
    public void OpenFromOutside()
    {
        try
        {
            if (!exiting && !popup.IsDisposed && popup.IsHandleCreated)
                popup.BeginInvoke((MethodInvoker)(() => popup.ShowPopup()));
        }
        catch (Exception ex) when (ex is ObjectDisposedException or InvalidOperationException)
        {
            // Ludus is shutting down; nothing to open.
        }
    }

    private static Icon LoadIcon()
    {
        using var stream = typeof(TrayContext).Assembly.GetManifestResourceStream("Ludus.ico");
        return stream != null ? new Icon(stream, SystemInformation.SmallIconSize) : SystemIcons.Application;
    }

    private void ExitApp()
    {
        if (exiting) return;
        exiting = true;
        tray.Visible = false;   // no ghost icon left in the tray
        tray.Dispose();
        menu.Dispose();
        theme.Dispose();
        popup.Dispose();
        ExitThread();
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
