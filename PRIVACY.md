# Privacy

**Ludus collects no data.** No accounts, no analytics, no crash reporting, no ads, no tracking.

- **No network.** The games and sounds are bundled with the app. Ludus does not connect to the
  internet, and the app refuses to load any page other than its own bundled files.
- **What is stored, and where.** Your best scores, saved games and settings are kept on your
  own computer only:
  - Mac: in the app's preferences (`~/Library/Preferences/com.solomon.Ludus.plist`) and the
    web view's local storage inside your user Library.
  - Windows: `%APPDATA%\Ludus\` (`state.json`, `window.json`, and `ludus.log`, a small local
    troubleshooting log) and `%LOCALAPPDATA%\Ludus\WebView2`.
- **Open at login** uses the standard system setting (macOS Login Items; the Windows
  per-user Run key) and can be turned off at any time.
- **Removing your data:** "Reset best scores" in settings clears high scores only; to remove everything (scores, saved games and settings), delete the files above after
  quitting Ludus.

The download page (GitHub Pages) and GitHub Releases are hosted by GitHub, whose own privacy
statement applies when you visit them.

Questions: open an issue on the project's GitHub page.
