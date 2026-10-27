# Ludus for Windows

The Windows version of Ludus: a tray app that opens a small panel of games just above the
taskbar. It runs the very same game files as the Mac app (the `web` folder at the top of this
repo) inside Microsoft Edge WebView2.

## Requirements

- Windows 10 or Windows 11, 64-bit (x64; Windows on Arm runs it through emulation).
- Nothing else: `Ludus.exe` is self-contained (it carries its own .NET 8).
- Microsoft Edge WebView2 Runtime. It is built into Windows 11. On Windows 10 it is usually
  already installed with Edge; if not, Ludus offers to open Microsoft's
  [Evergreen bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) download page.

## Using it

- **Left-click** the controller icon in the tray: open or close the panel.
- **Click anywhere else**: the panel closes (a running game pauses).
- **Right-click** the icon: opens Ludus straight on Settings (Open at login and Quit are there).
- **Ctrl+Alt+G** anywhere: open or close the panel. **Start menu > Ludus** opens it too (Ludus keeps
  that shortcut pointing at wherever `Ludus.exe` is).
- **Invisible icon** (Settings): hides the tray icon; Ctrl+Alt+G and the Start menu still open Ludus.
- The tray icon is drawn in code at the exact tray size: white on a dark taskbar, near-black on a light one.
- **Esc** inside the panel is handled by the games (pause, back).
- Settings inside the panel: the same as on the Mac (appearance, accent, panel size Compact 400 x 600 or
  Large 520 x 740, reduce motion, difficulty, sound, open at login, invisible icon, quit).
- Wide (2-player) games turn the panel landscape: 760 x 500, or 900 x 600 at Large. Ludus always opens on All games.

Starting Ludus a second time just opens the panel of the copy that is already running.

## Where things are kept

| What | Where |
| --- | --- |
| Scores, saves, settings | `%APPDATA%\Ludus\state.json` |
| Panel size, invisible icon | `%APPDATA%\Ludus\window.json` |
| Start menu shortcut | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Ludus.lnk` |
| Troubleshooting log | `%APPDATA%\Ludus\ludus.log` |
| WebView2 cache | `%LOCALAPPDATA%\Ludus\WebView2` |
| Open at login | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `Ludus` |

Nothing is sent anywhere. To remove Ludus completely: quit it, turn off "Open at login" first
(or delete the Run value), then delete the app folder and the two `Ludus` folders above.

## Build

You need the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) on Windows.

```powershell
cd windows
dotnet publish -c Release -o ..\out\Ludus
```

From a Mac: `dotnet publish windows/Ludus.csproj -c Release -o out/Ludus` also works (the project sets
`EnableWindowsTargeting`, `win-x64`, self-contained, single file).

The output folder holds `Ludus.exe` and a `web` folder (copied from `../web` by the project file).
Keep them together. For a quick debug run: `dotnet run` (developer tools are on in Debug builds).

GitHub Actions builds this on every push (`.github/workflows/ci.yml`) and attaches
`Ludus-windows.zip` to a release when a `v*` tag is pushed (`.github/workflows/release.yml`).

## How it works

| File | Job |
| --- | --- |
| `src/Program.cs` | Single instance, WebView2 runtime check, starts the tray app |
| `src/TrayContext.cs` | Tray icon (left-click opens, right-click opens Settings), exit |
| `src/PopupForm.cs` | The panel: placement above the tray (taskbar side and DPI aware), rounded corners, WebView2 and the page bridge |
| `src/Store.cs` | `state.json`, `window.json`, the Run key, the log |
| `src/Theme.cs` | Windows light/dark (`AppsUseLightTheme`) and live changes |
| `src/Native.cs` | The few Win32 calls (DWM corners, taskbar edge, monitor DPI) |
| `assets/Ludus.ico` | App and tray icon, drawn by `tools/make-ico.swift` |

The page is served from `https://ludus.example/` with
`SetVirtualHostNameToFolderMapping`, so browser storage and file loading behave like a normal
site. (`.example` is a reserved name that never exists on the internet; Microsoft recommends
against `.local`, which can slow down every page load.) Navigation to any other address is blocked.

### Bridge (same as the Mac app)

Page to app, via `window.chrome.webview.postMessage({ type, ... })` (already in `web/engine.js`):

| `type` | Payload | What the app does |
| --- | --- | --- |
| `save` | `state` | Writes `state.json` (atomic replace) |
| `size` | `size`: `compact` or `large` | Resizes the panel |
| `theme` | `mode`: `system`, `light`, `dark` | Matches window and background colour |
| `login` | `on` | Adds or removes the Run key value |
| `quit` | | Fades the page out, hides the panel, exits |
| `playing` | `id` | Ignored (as on the Mac) |

App to page: before the page loads it sets `window.__LUDUS_NATIVE__`, `__LUDUS_STATE__`,
`__LUDUS_LOGIN__`, `__LUDUS_DARK__` (and `__LUDUS_PLATFORM__ = 'windows'`), and later calls
`ludusOpened()`, `ludusClosed()` and `ludusSetSystemDark(bool)`.

## Testing on Windows

`windows/ci/test.ps1` starts Ludus with `--test-open` (open the panel once the games load),
`--selftest=PATH` (write a JSON result: page loaded, number of game cards, tab, panel and tray position)
and `--test-game=pong` (open a wide game), sends Ctrl+Alt+G, quits with `Ludus.exe --quit`, and saves
screenshots. It runs in GitHub Actions on `windows-latest`.

## Redrawing the icon

`assets/Ludus.ico` (16 to 256 px) is made from the Mac app icon `assets/Ludus.icns`
(`sips -s format png assets/Ludus.icns --out /tmp/ludus.png`, then any ICO writer, e.g. Pillow).
The tray icon is not an image file: it is drawn by `Glyph.Controller` in `src/TrayContext.cs`.
`tools/make-ico.swift` draws the old spark icon and is no longer used.

## Unsigned builds

The release build is not code signed, so Windows SmartScreen shows "Windows protected your PC"
the first time. Choose **More info**, then **Run anyway**. A code signing certificate removes this
warning; see the main README.
