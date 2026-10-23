# Privacy

**Ludus collects no data.** No accounts, no analytics, no crash reporting, no ads, no tracking.

- **Map Hunt uses the internet.** When you play Map Hunt, the app loads street photos from the free public Panoramax service (api.panoramax.xyz) and map pictures from the free OpenFreeMap servers (tiles.openfreemap.org). Those services see your internet address and the part of the world you look at, like any website would. Nothing else is sent, and there are no accounts. Ludus does not check for updates by itself.
- **No other network unless you use Play online.** The games and sounds are bundled with the app. Ludus
  does not connect to the internet on its own, and the app refuses to load any page other than its
  own bundled files. The only exception is the optional **Play online** feature, described below.
- **Play online (opt-in).** Nothing is sent until you press *Create room* or *Join room* in an
  online-capable game. Then Ludus opens a connection to a free public relay (an MQTT message server:
  `broker.emqx.io`, `broker.hivemq.com` or `test.mosquitto.org`, tried in that order) and sends only
  the game messages (moves and picks), a random room code, a random temporary id, and the optional
  nickname you typed. No account, no device information and no scores are sent. The relay is public
  and **not private**: anyone who knows or guesses a room code can join the room or read its
  messages, and the relay operators can see them. Ludus keeps no copy; closing the room or the app
  ends the connection. Do not type anything private as your nickname.
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
