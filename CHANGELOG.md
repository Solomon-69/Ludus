# Changelog

All notable changes to Ludus. Versions follow the app's version number (`Info.plist`,
`windows/Ludus.csproj`).

## 1.8.3 (2026-10-23)

- Geo Guess map: zooming in and out no longer flashes blank patches. A coarse whole-world map now sits under the
  detailed tiles, tiles no longer fade in, and the map is only redrawn when a zoom step settles
  (test: 0 blank frames out of about 1,000, was 801).
- Geo Guess pin bar: the text is picked from the map's final size, so it no longer swaps mid-animation.
- Online page: "Play online" sits in its own box with three short steps (Create or join a room, Share the code,
  Host picks games) instead of the long sentence.
- Light mode: text fields, the Last party card, the room code boxes and the Online header use a slightly deeper
  cream with a hairline edge so they stand out from the panel. Dark mode is unchanged.

## 1.8.2 (2026-10-23)

- New covers: Flag Quiz (France and Seychelles, clean edges), 2048 (a real board mid-game), Ultimate tic-tac-toe
  (nine small boards), snake arena game (smooth worm), Air Hockey (rink in play), Tanks (arena, two tanks, a shell);
  falling-blocks game and Minefield lose the little star; Geo Guess map without the pale stripe.
- Mac: opening Ludus closes the panel of our other menu bar apps (and the other way round); a click on any other
  menu bar item closes it too, except Nox's quick dark-mode switch.
- Geo Guess: the pin bar shows the whole sentence only when it fits, otherwise "Place your pin"; never cut off.
- Online page: equal spacing between every block; Last party card shows "Last party · <game>", the players with a
  crown on the host, Forget and Rejoin on the right.

## 1.8.1 (2026-10-23)

- Geo Guess no longer saves a game to resume later: every open starts a fresh game (pause still works while it is
  open, best score kept). Any old Geo Guess save is removed. A damaged best score counts as none.
- Geo Guess cover: no dashed centre line.

## 1.8.0 (2026-10-23)

- Crash failsafe: if a game throws, freezes or loses its graphics, a calm recovery card (Try again, New game, Back to
  games) replaces it; a save that keeps crashing is set aside; errors go to a local log file, never on screen.

- Geo Guess: a saved game no longer reopens as a blurred map with nothing to press (the game's map sat on top of the
  Paused / Welcome back card). The pause card is always on top; a 1.7 Geo Guess save is cleared once after updating.
- Geo Guess: a street photo that will not load is retried, then swapped for another place (solo); the "Needs internet"
  card has a New game button; the street view recovers if the graphics card drops it; clicking the map to pin works.
- Geo Guess map: zooming settles in the direction you zoom (no bounce back between wheel clicks), the country map stays
  underneath while city tiles load, and your pin stays fully in view when the map shrinks back.
- Card covers are redrawn whenever their size changes, so they are never squashed or stretched (panel back from a wide
  game, Compact/Large, screen scale). Search lists the best name match first (Geo finds Geo Guess) and starts at the top.
- Online page: fills the panel with no empty band, tidier Last party card, "Create a room" wording.
- hammer-climbing game: swinging the hammer in the air no longer pushes the pot, so long jumps fly their full arc.

## 1.7.0 (2026-10-23)

- **Online tournaments and parties:** pick several games and rounds, play them in a row with a scoreboard, rejoin your party, and a rematch button on the final standings. Still works with friends on 1.6.x (they play one game per room).
- **Smoother online action games:** guests now predict their own paddle or player and ease out the host's corrections, so paddle game, Air Hockey, Tag, swallow-the-city game, claim-the-land game and snake arena game feel responsive on slow connections.
- **Online page:** the 3-4 Player games moved into Online; filter chips All, Arcade, Puzzle, Duel, 2 Player and Online.
- **Polish:** new covers for swallow-the-city game, claim-the-land game, Sokoban and Slither, a redrawn Rock Paper Scissors fist with a spring rebound, and fixes for toasts overlapping the result bar.
- **Windows:** better handling of display scaling and zoom.
- **Geo Guess (new game):** a street-level photo from somewhere on Earth; look around, move along the road, pin the place on the map. Solo or online for 2 to 4 players with the same places for everyone.
- **Online lobby:** two tabs, Single game and Tournament, with cover cards for picking games. Rejoin brings back the same room code.
- **Rock Paper Scissors** plays against the bot on its own; play a friend through Online (picks stay secret).
- **swallow-the-city game:** buildings no longer twitch or shift while you move. **Snake:** a little slower, with a bump and spark burst on a crash.
- **The panel always opens on All games, scrolled to the top.**

## 1.6.0 (2026-10-23)

- **Play online (opt-in):** create a room, share the 5 character code (or the Copy invite link,
  `ludus://join/CODE`) and play with someone in another place. Works on Mac and Windows, for 2 to 4 players,
  in 13 games. Uses free public relays only when you choose Play online. Rooms are not private. See `web/ONLINE.md`.
- **3-4 Player tab:** Tag, claim-the-land game and swallow-the-city game for three or four players.
- **Search:** the best match leads as a highlighted card, with related games below it.
- **Rename games (Settings > Play):** click a game's name to give it your own. The original name is still shown.
- **Game list (37 games):** new Flag Quiz (countries plus regional flags from the US, Canada, the UK and 13 more
  countries), snake arena game, swallow-the-city game, claim-the-land game, balloon tower-defence game, garden-defence game (Easy and Hard), hammer-climbing game
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
