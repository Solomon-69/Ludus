# Ludus for Windows

The Windows version of Ludus: a tray app that opens a small panel of games just above the
taskbar. It runs the very same game files as the Mac app (the `web` folder at the top of this
repo) inside Microsoft Edge WebView2.

## Requirements

- Windows 10 or Windows 11, 64-bit (x64; Windows on Arm runs it through emulation).
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (x64). Windows asks
  to install it the first time if it is missing.
- Microsoft Edge WebView2 Runtime. It is built into Windows 11. On Windows 10 it is usually
  already installed with Edge; if not, Ludus offers to open Microsoft's
  [Evergreen bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) download page.

## Using it

- **Left-click** the controller icon in the tray: open or close the panel.
- **Click anywhere else**: the panel closes (a running game pauses).
- **Right-click** the icon: Open, Open at login, Quit.
- **Esc** inside the panel is handled by the games (pause, back).
- Settings inside the panel: theme (System, Light, Dark), panel size (Compact 400 x 600 or
  Large 520 x 740, in screen-independent pixels), sound, open at login, quit.

Starting Ludus a second time just opens the panel of the copy that is already running.

## Where things are kept

| What | Where |
| --- | --- |
| Scores, saves, settings | `%APPDATA%\Ludus\state.json` |
| Panel size | `%APPDATA%\Ludus\window.json` |
| Troubleshooting log | `%APPDATA%\Ludus\ludus.log` |
| WebView2 cache | `%LOCALAPPDATA%\Ludus\WebView2` |
| Open at login | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `Ludus` |

Nothing is sent anywhere. To remove Ludus completely: quit it, turn off "Open at login" first
(or delete the Run value), then delete the app folder and the two `Ludus` folders above.

## Build

You need the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) on Windows.

```powershell
cd windows
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ..\out\Ludus
```

The output folder holds `Ludus.exe` and a `web` folder (copied from `../web` by the project file).
Keep them together. For a quick debug run: `dotnet run` (developer tools are on in Debug builds).

GitHub Actions builds this on every push (`.github/workflows/ci.yml`) and attaches
`Ludus-windows.zip` to a release when a `v*` tag is pushed (`.github/workflows/release.yml`).

## How it works

| File | Job |
| --- | --- |
| `src/Program.cs` | Single instance, WebView2 runtime check, starts the tray app |
| `src/TrayContext.cs` | Tray icon, right-click menu (light/dark), exit |
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

## Redrawing the icon

On a Mac:

```bash
swiftc -O -framework AppKit windows/tools/make-ico.swift -o /tmp/mkico && /tmp/mkico windows/assets
```

## Unsigned builds

The release build is not code signed, so Windows SmartScreen shows "Windows protected your PC"
the first time. Choose **More info**, then **Run anyway**. A code signing certificate removes this
warning; see the main README.
