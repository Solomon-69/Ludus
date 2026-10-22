using Microsoft.Win32;

namespace Ludus;

/// <summary>Windows light/dark: reads AppsUseLightTheme and raises Changed when the user flips it.</summary>
internal sealed class Theme : IDisposable
{
    private const string PersonalizeKey = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    // Ludus's own paper colours (web/style.css --bg), used behind the page so there is never a white flash.
    public static readonly Color PaperLight = Color.FromArgb(0xF4, 0xEF, 0xE6);
    public static readonly Color PaperDark = Color.FromArgb(0x1B, 0x18, 0x14);

    public event Action<bool>? SystemDarkChanged;

    /// <summary>"system", "light" or "dark", as last chosen in Ludus settings.</summary>
    public string Mode { get; set; } = "system";

    public bool SystemDark { get; private set; }

    public bool EffectiveDark => Mode switch
    {
        "dark" => true,
        "light" => false,
        _ => SystemDark,
    };

    public Theme()
    {
        SystemDark = ReadSystemDark();
        SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
    }

    private async void OnUserPreferenceChanged(object? sender, UserPreferenceChangedEventArgs e)
    {
        // Theme switches arrive as General (and sometimes Color) preference changes.
        if (e.Category is not (UserPreferenceCategory.General or UserPreferenceCategory.Color)) return;
        Refresh();
        // The registry value can lag the event a little; look again shortly after.
        await Task.Delay(300);
        Refresh();
    }

    /// <summary>Re-reads the Windows setting and raises SystemDarkChanged if it flipped.</summary>
    public void Refresh()
    {
        var dark = ReadSystemDark();
        if (dark == SystemDark) return;
        SystemDark = dark;
        SystemDarkChanged?.Invoke(dark);
    }

    private static bool ReadSystemDark()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeKey);
            return key?.GetValue("AppsUseLightTheme") is int light && light == 0;
        }
        catch
        {
            return false;
        }
    }

    public void Dispose() => SystemEvents.UserPreferenceChanged -= OnUserPreferenceChanged;
}
