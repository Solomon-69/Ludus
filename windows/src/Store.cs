using System.Text.Json;
using Microsoft.Win32;

namespace Ludus;

/// <summary>
/// Everything Ludus keeps on disk, all under %APPDATA%\Ludus:
/// state.json (scores, saves and settings, written by the games) and window.json (panel size).
/// "Open at login" lives in the HKCU Run key, like any per-user startup app.
/// </summary>
internal static class Store
{
    public static readonly string Folder =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Ludus");
    private static readonly string StatePath = Path.Combine(Folder, "state.json");
    private static readonly string WindowPath = Path.Combine(Folder, "window.json");

    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "Ludus";

    // ---- Game state ----

    /// <summary>The saved state as a JSON object literal, or "null" when there is none or it is unreadable.</summary>
    public static string LoadStateJson()
    {
        try
        {
            if (!File.Exists(StatePath)) return "null";
            var text = File.ReadAllText(StatePath);
            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.GetRawText() : "null";
        }
        catch (Exception ex)
        {
            Log($"state.json could not be read: {ex.Message}");
            return "null";
        }
    }

    /// <summary>Writes the state atomically (temp file, then replace) so a crash never leaves half a file.</summary>
    public static void SaveState(JsonElement state)
    {
        if (state.ValueKind != JsonValueKind.Object) return;
        WriteAtomic(StatePath, state.GetRawText());
    }

    // ---- Panel size ----

    public static string LoadSize()
    {
        try
        {
            if (!File.Exists(WindowPath)) return "compact";
            using var doc = JsonDocument.Parse(File.ReadAllText(WindowPath));
            return doc.RootElement.TryGetProperty("size", out var s) && s.GetString() == "large" ? "large" : "compact";
        }
        catch (Exception ex)
        {
            Log($"window.json could not be read: {ex.Message}");
            return "compact";
        }
    }

    public static void SaveSize(string size) =>
        WriteAtomic(WindowPath, JsonSerializer.Serialize(new { size = size == "large" ? "large" : "compact" }));

    // ---- Open at login ----

    public static bool LoginEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(RunValue) is string;
        }
        catch (Exception ex)
        {
            Log($"Run key could not be read: {ex.Message}");
            return false;
        }
    }

    public static void SetLogin(bool on)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            if (on) key.SetValue(RunValue, $"\"{ExePath()}\"", RegistryValueKind.String);
            else if (key.GetValue(RunValue) != null) key.DeleteValue(RunValue, throwOnMissingValue: false);
        }
        catch (Exception ex)
        {
            Log($"Open at login change failed: {ex.Message}");
        }
    }

    /// <summary>Keeps the Run entry pointing at this exe after the app folder is moved.</summary>
    public static void RefreshLoginPath()
    {
        if (LoginEnabled()) SetLogin(true);
    }

    private static string ExePath() => Environment.ProcessPath ?? Application.ExecutablePath;

    // ---- Helpers ----

    private static void WriteAtomic(string path, string text)
    {
        try
        {
            Directory.CreateDirectory(Folder);
            var temp = path + ".tmp";
            File.WriteAllText(temp, text);
            File.Move(temp, path, overwrite: true);
        }
        catch (Exception ex)
        {
            Log($"Could not write {Path.GetFileName(path)}: {ex.Message}");
        }
    }

    /// <summary>Small local log at %APPDATA%\Ludus\ludus.log for troubleshooting. Nothing leaves the PC.</summary>
    public static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(Folder);
            File.AppendAllText(Path.Combine(Folder, "ludus.log"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never take the app down.
        }
    }
}
