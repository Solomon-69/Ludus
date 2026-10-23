# Changelog

All notable changes to Ludus. Versions follow the app's version number (`Info.plist`,
`windows/Ludus.csproj`).

## 1.7.0 (2026-10-23)

- **Online tournaments and parties:** pick several games and rounds, play them in a row with a scoreboard, rejoin your party, and a rematch button on the final standings. Still works with friends on 1.6.x (they play one game per room).
- **Smoother online action games:** guests now predict their own paddle or player and ease out the host's corrections, so Pong, Air Hockey, Tag, Hole.io, Paper.io and Slither feel responsive on slow connections.
- **Online page:** the 3-4 Player games moved into Online; filter chips All, Arcade, Puzzle, Duel, 2 Player and Online.
- **Polish:** new covers for Hole.io, Paper.io, Sokoban and Slither, a redrawn Rock Paper Scissors fist with a spring rebound, and fixes for toasts overlapping the result bar.
- **Windows:** better handling of display scaling and zoom.
- **Geo Guess (new game):** a street-level photo from somewhere on Earth; look around, move along the road, pin the place on the map. Solo or online for 2 to 4 players with the same places for everyone.
- **Online lobby:** two tabs, Single game and Tournament, with cover cards for picking games. Rejoin brings back the same room code.
- **Rock Paper Scissors** plays against the bot on its own; play a friend through Online (picks stay secret).
- **Hole.io:** buildings no longer twitch or shift while you move. **Snake:** a little slower, with a bump and spark burst on a crash.
- **The panel always opens on All games, scrolled to the top.**

## 1.6.0 (2026-10-23)

- **Play online (opt-in):** create a room, share the 5 character code (or the Copy invite link,
  `ludus://join/CODE`) and play with someone in another place. Works on Mac and Windows, for 2 to 4 players,
  in 13 games. Uses free public relays only when you choose Play online. Rooms are not private. See `web/ONLINE.md`.
- **3-4 Player tab:** Tag, Paper.io and Hole.io for three or four players.
- **Search:** the best match leads as a highlighted card, with related games below it.
- **Rename games (Settings > Play):** click a game's name to give it your own. The original name is still shown.
- **Game list (37 games):** new Flag Quiz (countries plus regional flags from the US, Canada, the UK and 13 more
  countries), Slither.io, Hole.io, Paper.io, Bloons TD Battles, Plants vs. Zombies (Easy and Hard), Getting Over It
  (difficulty menu) and the Brain rot skin for Stack. Tron has been removed.

## 1.5

- **Saves and resume:** close the panel mid-game and pick up exactly where you left off.
- **End-of-game reveal:** the finished board stays visible with a result bar (play again, menu,
  hide result).
- **2 Player section:** games for two people on one keyboard, with their own filter.
- **New games** in every section.
- **Settings cleanup:** clearer layout and wording.
- **Light panel fix:** choosing Light now gives a light panel even when the Mac is in dark mode.
- **Smooth quit:** the panel folds away before Ludus quits; switching panel size no longer flickers.
- **New icon:** a premium controller mark (cream controller on a terracotta squircle, four round face
  buttons in a diamond), the same mark in the menu bar and next to "Ludus" in the panel. On macOS 26
  the app icon follows the Mac's look: a terracotta controller on near-black in Dark mode.
- **Invisible icon (Mac):** an App setting that keeps Ludus in the menu bar as an empty spot at the far
  left of the menu bar icons. Click it to open; opening Ludus again from Finder or Spotlight also opens it.
- **Windows version:** a tray app that runs the same games (new in this release's source).

## 1.0

- First release: Ludus in the Mac menu bar with arcade, puzzle and duel games, best scores,
  light and dark themes, sound, difficulty, panel size and open at login.
