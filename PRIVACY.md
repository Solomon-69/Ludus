# Privacy

**Ludus collects no data.** No accounts, no analytics, no crash reporting, no ads, no tracking.

- **Map Hunt uses the internet.** When you play Map Hunt, the app loads street photos from the free public Panoramax service (api.panoramax.xyz) and map pictures from the free OpenFreeMap servers (tiles.openfreemap.org). Those services see your internet address and the part of the world you look at, like any website would. Nothing else is sent, and there are no accounts. Ludus does not check for updates by itself.
- **Mosaic Hunt uses the internet.** The close-up photos are loaded live from invader-spotter.art, and the map from OpenFreeMap / OpenStreetMap tiles. Those sites see your internet address, like any website would. Offline, Mosaic Hunt uses drawn pictures and bundled map tiles instead.
- **Privacy blur (off until you turn it on) uses the camera.** It asks for camera permission the first time. Each camera frame is checked for faces in memory on your computer and thrown away at once: no picture is saved, recorded or sent anywhere. If the web view has no built-in face finder, the small open-source MediaPipe face detector (code from cdn.jsdelivr.net, model from storage.googleapis.com) is downloaded once; only that download touches the internet, never the camera picture.
- **No other network.** The games and sounds are bundled with the app. Apart from Map Hunt, Mosaic Hunt,
  Privacy blur (above) and the optional **Play online** feature (below), Ludus does not connect to the
  internet, and the app never opens any page other than its own bundled files.
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
