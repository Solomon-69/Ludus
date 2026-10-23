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

    // ---- Original names: the player's own list (never shipped), %APPDATA%\Ludus\original-names.json, game id -> name ----

    public static string NamesPath => Path.Combine(Folder, "original-names.json");

    /// <summary>The file's names as a JSON object of strings, or "null" when the file is missing or not valid.</summary>
    public static string LoadOriginalNamesJson()
    {
        try
        {
            if (!File.Exists(NamesPath)) return "null";
            using var doc = JsonDocument.Parse(File.ReadAllText(NamesPath));
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return "null";
            var clean = new Dictionary<string, string>();
            foreach (var p in doc.RootElement.EnumerateObject())
                if (p.Value.ValueKind == JsonValueKind.String) clean[p.Name] = p.Value.GetString() ?? "";
            return JsonSerializer.Serialize(clean).Replace("\u2028", "\\u2028").Replace("\u2029", "\\u2029");
        }
        catch (Exception) { return "null"; }
    }

    /// <summary>Opens Explorer on the names file, or on its folder (made if needed) when the file does not exist yet.</summary>
    public static void RevealNamesFile()
    {
        try
        {
            Directory.CreateDirectory(Folder);
            var args = File.Exists(NamesPath) ? $"/select,\"{NamesPath}\"" : $"\"{Folder}\"";
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", args) { UseShellExecute = true });
        }
        catch (Exception ex) { Log($"Could not open the names folder: {ex.Message}"); }
    }

    // ---- Room invites (ludus://join/CODE) ----

    private static string PendingJoinPath => Path.Combine(Folder, "pending-join.txt");

    /// <summary>Makes ludus:// links open this Ludus (per user, HKCU, no admin needed). Safe to run on every start.</summary>
    public static void RegisterUrlScheme()
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exe)) return;
            using var root = Registry.CurrentUser.CreateSubKey(@"Software\Classes\ludus");
            root.SetValue("", "URL:Ludus room invite");
            root.SetValue("URL Protocol", "");
            using var command = root.CreateSubKey(@"shell\open\command");
            command.SetValue("", $"\"{exe}\" \"%1\"");
        }
        catch (Exception ex) { Log($"Could not register ludus:// links: {ex.Message}"); }
    }

    /// <summary>A second launch (a clicked invite link) leaves the room code here for the running Ludus to pick up.</summary>
    public static void QueueJoin(string code)
    {
        try { Directory.CreateDirectory(Folder); File.WriteAllText(PendingJoinPath, code); }
        catch (Exception ex) { Log($"Could not hand over the room code: {ex.Message}"); }
    }

    /// <summary>The queued room code (5 letters or digits), or null. Reading it removes it.</summary>
    public static string? TakeJoin()
    {
        try
        {
            if (!File.Exists(PendingJoinPath)) return null;
            var text = File.ReadAllText(PendingJoinPath).Trim().ToUpperInvariant();
            File.Delete(PendingJoinPath);
            return System.Text.RegularExpressions.Regex.IsMatch(text, "^[A-Z0-9]{5}$") ? text : null;
        }
        catch { return null; }
    }

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

    /// <summary>Forgets all saved scores and settings (the failsafe screen's reset).</summary>
    public static void ResetState()
    {
        try { if (File.Exists(StatePath)) File.Delete(StatePath); } catch (Exception ex) { Log($"state reset failed: {ex.Message}"); }
    }

    /// <summary>Writes the state atomically (temp file, then replace) so a crash never leaves half a file.</summary>
    public static void SaveState(JsonElement state)
    {
        if (state.ValueKind != JsonValueKind.Object) return;
        WriteAtomic(StatePath, state.GetRawText());
    }

    // ---- Panel size and the invisible tray icon (window.json) ----

    private sealed record WindowPrefs(string Size, bool Invisible);

    private static WindowPrefs LoadPrefs()
    {
        try
        {
            if (!File.Exists(WindowPath)) return new WindowPrefs("compact", false);
            using var doc = JsonDocument.Parse(File.ReadAllText(WindowPath));
            var root = doc.RootElement;
            var size = root.TryGetProperty("size", out var s) && s.ValueKind == JsonValueKind.String && s.GetString() == "large" ? "large" : "compact";
            var invisible = root.TryGetProperty("invisible", out var i) && i.ValueKind == JsonValueKind.True;
            return new WindowPrefs(size, invisible);
        }
        catch (Exception ex)
        {
            Log($"window.json could not be read: {ex.Message}");
            return new WindowPrefs("compact", false);
        }
    }

    private static void SavePrefs(WindowPrefs prefs) =>
        WriteAtomic(WindowPath, JsonSerializer.Serialize(new { size = prefs.Size, invisible = prefs.Invisible }));

    public static string LoadSize() => LoadPrefs().Size;

    public static void SaveSize(string size) => SavePrefs(LoadPrefs() with { Size = size == "large" ? "large" : "compact" });

    /// <summary>Invisible icon: no tray icon; Ludus opens with Ctrl+Alt+G or from the Start menu.</summary>
    public static bool LoadInvisible() => LoadPrefs().Invisible;

    public static void SaveInvisible(bool on) => SavePrefs(LoadPrefs() with { Invisible = on });

    // ---- Start menu shortcut ----

    /// <summary>Keeps "Ludus" in the Start menu pointing at this exe (the way back in when the tray icon is hidden).</summary>
    public static void EnsureStartMenuShortcut()
    {
        try
        {
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            var link = Path.Combine(folder, "Ludus.lnk");
            var shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            dynamic shell = Activator.CreateInstance(shellType)!;
            try
            {
                dynamic shortcut = shell.CreateShortcut(link);
                if (File.Exists(link) && string.Equals((string)shortcut.TargetPath, ExePath(), StringComparison.OrdinalIgnoreCase)) return;
                shortcut.TargetPath = ExePath();
                shortcut.WorkingDirectory = AppContext.BaseDirectory;
                shortcut.IconLocation = ExePath() + ",0";
                shortcut.Description = "Ludus: 33 little games";
                shortcut.Save();
            }
            finally
            {
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
            }
        }
        catch (Exception ex)
        {
            Log($"Start menu shortcut not made: {ex.Message}");
        }
    }

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
