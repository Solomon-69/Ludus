# Changelog

All notable changes to Ludus. Versions follow the app's version number (`Info.plist`,
`windows/Ludus.csproj`).

## 1.12.23 (28 Oct 2026)
- Create room works on networks that only allow ordinary web traffic: Ludus remembers the relay that worked last time and tries it first, and waits a little longer for a room before giving up.
- If making a room fails, you go back to the Online page instead of being left on a stray card.
- Arcade games and puzzle clocks wait for your first move ("Move to start" / "Tap to start") instead of starting at once; Restart waits again. Room games keep their countdown.
- New "Load names file" button in Settings > More settings (Mac and Windows): pick your original-names.json and Original names turns on straight away. The file is copied into Ludus's own folder, so it keeps working. Without a file, the switch says it needs one.
- Dark mode: every raised edge is now a dark shadow under its button or card (it was lighter than the card before). The category tabs (All, Arcade...) are raised pills with a real lower edge.
- The party room card's corners now run parallel to the panel around it.
- Blocks has a new game-over: the stack flashes as it locks, each row flashes and folds away from the top down while the board dims, then the Game over card comes up. Reduce motion skips straight to the end.

## 1.12.22 (28 Oct 2026)
- New raised buttons: every button, tab and game card now has a solid edge underneath, lifts a little when you point at it, sinks when you press it and springs back. Disabled buttons stay flat, and Reduce motion keeps the look without the movement.
- Settings groups, the Online page cards, the Last party card, the party room and its seats, the pause and result panels, the search field and the tab bars get the same raised edge, so the whole app matches. The edges show clearly in light and dark.
- The selected tab and the main buttons are a softer charcoal in light mode, so their edge stands out.
- The Online page grows with the panel: on Large (and the wide sizes) the cards, text, fields, buttons, code boxes and step circles are all bigger, so the page fills the panel instead of leaving wide gaps. Nothing scrolls.
- On the compact panel without a Last party, the gaps between the Online blocks are small and even (they used to spread far apart), with the spare room shared above and below.

## 1.12.21 (28 Oct 2026)
- Rejoin now works for old parties on any network. On networks that only allow ordinary web traffic (where the main relays cannot be reached), Rejoin used to wait forever on the party's own relay; it now moves to the backup relay and reopens the same code there, and friends joining by code find it.
- Rejoin is no longer fooled by old messages a relay keeps or replays from a host who has gone, so it never ends on "No such room". If the host it gave way to disappears, it reopens the code itself.
- Rejoin always keeps the party's own code (it never switches to a new one), and the Last party card stays until you press Forget.

## 1.12.20 (2026-10-28)
- Sound everywhere: every game has fuller sounds, and the app itself now has soft sounds for tabs, opening games, Back, switches, panels, messages, results, new bests, rooms, friends joining and copying an invite. All follow the Sound switch and volume.
- Smoother Online page: Forgetting a party fades the card out whole while the cards below glide up, the Last party card eases in, switching tabs and opening a room no longer jump.
- Rounded corners now match everywhere a rounded box sits inside another (game cards, lobby seats, settings, tags).

## 1.12.19 (2026-10-28)
- Air Hockey: the bot no longer pins the puck in a corner, in the vertical layout either.
- Rejoin works however old the party is: it joins the live party, or reopens the same code if nobody is there, and the Last party card is never lost.
- Room codes never repeat a letter or number. Older codes still work.
- Online page: matching rounded corners, and the Play online card keeps its size when Last party appears.
- Hammer Climb: no difficulty levels (plays like Medium). The top is now floating rocks in the sky and a final launch into space. New cover.
- Map Hunt and Mosaic Hunt: much more detailed maps when zoomed in (streets, buildings, districts, places). Mosaic Hunt has one set of zoom buttons. Pinch to zoom works on Windows.
- Full game names always show (game headers, Continue card). Settings descriptions follow the switch. Symmetric name bubble and a new rename tooltip. The Edit list button is gone.

## 1.12.18 (2026-10-28)
- Online games are smooth for the guest: every live game (Paddle Duel, Air Hockey, Tag, Worm Arena, Land Claim, City Swallow) now plays the host's moves back on an even clock a little behind, blends between them, carries motion on briefly when the line hiccups and eases back instead of jumping. Copies that arrive late, twice or out of order no longer cause stutters, and a lost copy no longer freezes the picture.
- Air Hockey online: the guest's puck is drawn where it really is now and bounces off your own mallet straight away. Mouse and trackpad steer your mallet inside your half. The rink is wide by default; the Rotate button in the header turns it tall and remembers it. Everyone has their own goal on their side (left when wide, bottom when tall).
- Air Hockey and other games vs the bot: a bot no longer pins the puck or ball in a corner, circles in place or waits for ever; a puck stuck still against a wall gets nudged, and a long standstill is faced off again.
- Parties: a room code can never be hosted twice. Rejoin always joins as a guest (only the player who made the code opens it again, and only if nobody hosts it). An old host who comes back joins the new leader's room. Closing and reopening Ludus keeps you in the party and brings back the room, not a half played game.
- A player who goes quiet keeps their seat for 45 seconds, and someone who drops out gets the same seat and score back for 2 minutes.
- The fallback relay for blocked networks sends less often, backs off when it is busy and replaces dead connections by itself.
- Online page: fits the panel at every size with no scrolling (two columns when wide), the Last party card folds away and opens smoothly, the join boxes never show an old code, the host's suggestion card is cleaner, and suggesting games uses the same orange picker as the host with a small Host tag.

## 1.12.17 (2026-10-28)
- Windows: the in-app update now works. Before, pressing Install left the bar stuck at 0% because the app read the
  update request after it had already been thrown away, so the download never started. It now starts straight away,
  shows real progress, retries a second download link if the first stalls, and gives up after 30 seconds without data
  instead of hanging. If an update ever fails, the update row offers a Website button.
  People on Windows Ludus 1.12.16 or older still have the old, broken button: they need to download this version
  once from the website (https://solomon-69.github.io/Ludus/). After that, updates work in the app.
- Mac: updates use the same safety net (timeouts, a second download link, a Website button). A full check, download
  and verify of the newest release takes about 2 seconds.
- New automatic tests on GitHub's Windows and Mac machines: a hidden self-test checks, downloads, verifies and unpacks
  the newest release, and on Windows an older build updates itself end to end through its own Settings buttons.
- Hammer Climb: a brand new mountain, in the spirit of the famous pot-and-hammer climb: the start pit under a dead
  tree, the pipes, orange rocks and a bucket, the chimney, the furniture, the long slide, the mountain, the ice, and
  a summit where the sky turns to space and you lift off into the stars. The hammer follows the mouse more closely and
  gravity is a little gentler. Back or Quit starts the climb over; closing the panel or pausing keeps your place.
  Tested on Windows: clicking a mountain starts the climb and the hammer follows the mouse.
- Sky Hop: a second mode, Monsters. Little monsters float between the platforms (land on top to bop them, touch one
  any other way and you fall) and puffy clouds hold you for one bounce. Switch between Classic and Monsters at the top
  before the first jumps or after a fall (or press M).
- Original names (Settings > More) now does something everywhere: reads your own list of names
  (one "Game = name" per line), and on Windows a list file next to Ludus.exe is found too.
- Map Hunt and Mosaic Hunt maps: + and - zoom buttons, double-click to zoom, and a trackpad pinch works on Mac too.
- Mosaic Hunt: the map pins and labels no longer draw on top of the "Hunt complete" card.
- The game name in the header no longer has a coloured underline; hovering shows a soft grey round pill instead.
- The home Continue card shows one label (Continue), not two.
- The sliding tab pill never overshoots its tab, even from All to Online and back.
- Sky Raiders has a new cover that looks like the game itself (the same raiders, bunkers and cannon), and the little
  star in the cover's corner is gone.

## 1.12.16 (2026-10-27)

- The category tabs on the home screen (All, Arcade, Puzzle, Duel, Same laptop, Online) now work like one toggle:
  the dark pill (light in dark mode) slides smoothly from the old tab to the new one and stretches to the new tab's width.
  It stays exactly under the chosen tab when the tab row scrolls, when the panel or size setting changes, and after a
  search is cleared. Left and right arrow keys move between tabs. With Reduce Motion on, the pill moves without sliding.

## 1.12.15 (2026-10-27)

- The Online page is the same height as the other tabs; its sections spread out with equal gaps instead of the panel shrinking.
- Right-click on the menu bar or tray icon now opens and closes Ludus like a left click. The shortcut straight to Settings was unreliable, so it is gone; Settings is the gear icon.

## 1.12.14 (2026-10-27)

- Switching between the Online tab and the other tabs no longer blanks the panel for a moment: the page stays visible while the bottom edge slides.
- The join code boxes stay empty until you type, with no dashes.

## 1.12.13 (2026-10-27)

- Online: the host can make another player the leader. In the room, tap Make leader under a player's name and confirm. That player gets the host controls (picking games, starting, answering suggestions) and everyone sees who the new leader is. The room keeps its code, players, games and scores, so the old host can leave and everyone else plays on.
- Online: if the host leaves without choosing, the player who has been in the room longest becomes the leader instead of the room closing. This works in the waiting room and between tournament rounds; leaving in the middle of a round still ends the room.
- If someone in the room has an older Ludus, Make leader is greyed out (everyone needs this version) and a leaving host closes the room as before.

## 1.12.12 (2026-10-27)

- Online: the join code is shown as five tiles that fill from left to right (a dash while empty); a recent party's code shows faintly. Paste still works with a code or an invite message.

## 1.12.11 (2026-10-27)

- Settings: opening More settings scrolls down with it so the new options are in view.
- Small grey text is darker and easier to read in light and dark, in the app and on the Ludus page.

## 1.12.10 (2026-10-27)

- Online: if the free MQTT relays are blocked or down on your network, Ludus now falls back to ntfy.sh (an ordinary HTTPS service), so Create room works on any network. Both players connect outward, so players on different networks meet fine.
- Online: relays that do not answer are skipped after 4 seconds instead of 7.
- The Online page panel now slides to fit its content (Mac and Windows), instead of leaving a gap at the bottom.
- Small grey text (subtitle, Settings descriptions, section labels) is darker and easier to read.

## 1.12.9 (2026-10-27)

- Online page: the join box shows the code of your most recent party instead of made-up letters.

## 1.12.8 (2026-10-27)

- Online page: thinner cards and bars, and the "or join a room" line is back between hosting and joining.

## 1.12.7 (2026-10-27)

- Chess clock: one Timed switch (15 minutes for each player) that glides between Off and Timed; the two clocks sit on opposite sides of the board.
- Online page: two clear cards (start a room, join a room) with one 12px rhythm.
- Mac: the panel and the arrow under the menu bar icon are one continuous glass surface in Auto, Light and Dark.
- Chess cover: the board runs off the bottom edge with softly rounded top corners.
- Chomp cover redrawn: open-mouthed chomper, dot trail, power dot and a clear ghost.

## 1.12.6 (2026-10-27)

- Chomp: ghosts stay edible much longer after a power spark, so there is time to chase them down.

## 1.12.5 (2026-10-27)

- Chess: play timed (3, 5, 10 or 15 minutes per side) or not timed; the clock starts on the first move.
- Chess moves feel like Duolingo: lifted pieces, soft dots for legal moves, pale yellow last move, no boxes. Black pieces are darker.
- Chomp: when you are caught, the maze dims and a spotlight stays on the ghost that got you (the red circle is gone).

## 1.12.4 (2026-10-27)

- Right-click the menu bar icon opens Settings straight away, always at the top, with no flash of the home screen.
- Settings: even gaps between cards, a taller More settings card.
- Online page: tighter gaps and thicker cards, fits without scrolling.
- Covers: Mosaic Hunt label no longer cut off; Languages has clean, centred speech bubbles.

## 1.12.3 (2026-10-27)

- Privacy blur removed: it could pick an iPhone camera instead of the Mac's, and it wasn't reliable enough.
- Chess has a softer look: rounded pieces, a calm board and a game clock.
- Clearer covers: Solitaire card edges, Flag Quiz now shows France and Jamaica, no corner sparks.

## 1.12.2 (2026-10-27)

- Right-click the menu bar icon to open Settings. (Windows: right-click the tray icon; Open at login and Quit are in Settings.)

## 1.12.1 (2026-10-27)

- **Privacy blur** works properly now: it finds your face at a normal sitting distance (before, it often missed it and
  kept the game blurred) and notices someone looking from further back. Still checked only on this computer, nothing saved or sent.
- New Chess cover: the queen stands over the fallen king.
- Chess cover pieces never overlap, at any card size.

## 1.12.0 (2026-10-27)

- New game: **Chess**. Play the computer (four levels, it thinks in the background so the board never stutters), a friend
  on the same screen, or a friend online.
- **Mosaic Hunt** rebuilt: real mosaic spots with live close-up photos (credited, never stored in the app), guess on a map
  and score like Map Hunt, with a small fixed map and a card that follows light or dark mode. Offline it falls back to drawn pictures and bundled map tiles.
- **Privacy blur** (More settings): blurs the game when someone else looks at your screen or you look away. Uses the camera,
  checked on your computer only; nothing is saved or sent. On the Mac the app asks for camera permission first. On Windows the app
  switches the camera on only while Privacy blur is on, and Windows' own camera privacy setting decides whether desktop apps may use it.
  If your computer has no built-in face finder, Ludus downloads a small one once (Google's MediaPipe, an exact version, and each file
  is checked against a fixed fingerprint before it runs).
- **Worm Arena online** for 2 to 4 players plus bots: everyone steers their own worm, last worm standing wins.
- **Suggestions in online rooms**: players who are not the host can now see the host's choices (the picked games have an orange outline)
  and suggest games, the number of rounds, single game or tournament, and the Map Hunt time and movement. The host gets a card in the
  app with Accept or Decline, and the player sees whether it was accepted or declined. Older Ludus versions simply never see the feature.
- **Original names** (More settings): show your own list of names instead of ours. The list comes from a file you make yourself,
  `original-names.json`, in Ludus's app folder (Mac: `~/Library/Application Support/Ludus/`, Windows: `%APPDATA%\Ludus\`). No names
  are built in. Without the file the switch does nothing.
- **Clearer turns** in two-sided games (Chess, Four in a Row, Dots and Boxes, Ultimate Tic-Tac-Toe, Hex, Wall Race and others): the
  player whose turn it is gets a coloured card with a pulsing dot, and the waiting player's card fades back.
- The 2 Player tab is now called **Same laptop** and only lists games two people play on one computer; Duel lists games
  against the computer. The game you played last waits at the top of its tab as "Continue", and every tab opens at the top.
- The Online connection light is a solid dot from the start: green when online, red when offline.
- Map Hunt: more country names (Poland, Slovakia, Hungary, Serbia...), borders and towns show sooner when zooming in,
  double-click the street to step there, and trackpad pinch zooms the street view.
- Fixes: Five Letters only accepts real words; Hex has a hexagon pulse; Rock Paper Scissors new cover and fist fade;
  Worm Arena has no trail or dots behind worms; Tank Arena fires with Space; search returns to the game's tab; games always
  open vs Bot; the More settings card opens in place; centred title and footer.

## 1.11.1 (2026-10-23)

- (Replaced in 1.12.0, see above.) Mosaic Hunt used only our own material: eight original pixel creatures (Moth, Newt, Pip, Bloop, Gull, Fox, Crab, Owl)
  hidden at made-up spots around 7 city centres plus 40 more world cities. No real artworks, positions, IDs or artist names.
- Garden Defence has new original plant art: a glow bulb, flared horns and a pebble, new cover.
- Ludus is now open source under the MIT licence.

## 1.11.0 (2026-10-23)

- Every game now has its own original name, with no other company's game title anywhere (menus, covers, hints, search,
  docs). Renamed: Hammer Climb, Garden Defence, Sweet Match, Five Letters, Worm Arena, City Swallow, Land Claim,
  Tank Arena, Sky Hop, Flap Through, Chomp, Blocks, Sword Duel, Sky Raiders, Rock Blaster, Brick Break, Paddle Duel,
  Minefield, Wall Race, Four in a Row, Map Hunt, Mosaic Hunt, Clue Spotter, Crate Push.
- Chomp's four ghosts have new names; Sky Raiders has newly drawn alien and cannon pictures; Blocks calls its clears
  Quad and Twist.
- Game ids, saves, best scores and online room codes are unchanged, so old saves and older Ludus versions still work.
- Map Hunt documentation now names only the map sources actually used (OpenFreeMap, OpenStreetMap, MapLibre, Panoramax).
- All cover pictures and documentation pictures re-made with the new names.

## 1.10.0 (2026-10-23)

- Six new games: a solo balloon tower-defence with fusing, a stick-figure brawler, the final balloon duel, a mosaic-hunting
  map game with a code breaker, a road-detail spotting game, and a language-guessing game with a map. All work offline
  where they do not need map photos; online rooms work for the spotting game.
- Documentation: source stays unlicensed for reuse, third-party credits in THIRD_PARTY.md, checksums in CHECKSUMS.md.

## 1.9.2 (2026-10-23)

- Map Hunt map tuned to be calmer, like a standard street map: one flat soft green for all land (no forest or grass texture),
  slightly greener parks, pale grey-white built-up areas, thinner and paler roads, and only big cities and country
  names until you zoom well in (small towns and villages appear later).

## 1.9.1 (2026-10-23)

- Map Hunt map rebuilt to look and behave like a standard street map: a GPU vector map (MapLibre GL, free
  OpenFreeMap tiles) in the Google palette, with soft green land, flat blue water, thin grey borders, pale built-up
  areas and thin pale roads. Labels only in English or Latin letters and kept sparse; no icons, no 3D, no satellite.
  Smooth built-in wheel, pinch and drag zoom (the old per-tile recolouring and custom zoom code are gone, so no blank
  or blocky tiles and no jiggle). Always light, also in dark mode. If the tiles cannot load (or the graphics card cannot
  run it), a plain flat-colour map still lets you pin.

## 1.9.0 (2026-10-23)

- Online light: a small dot on the Online tab (green with a soft pulse when connected, a hollow ring when
  offline, also shown next to the Ludus title). Offline, the Online page says so, dims Create, Join and Rejoin,
  and keeps the name field editable.
- Everything except Online, Map Hunt photos and updates works with no internet (checked with the network blocked).
- Settings: the gear is now also inside every game (the game pauses behind it). Cleaner list: Look, Play
  (Sound and volume in one row), App (Update first), a folded "More" (Invisible icon, Rename games), Quit last.
  "Show controls under games" is gone (the controls always show).
- Update button (Settings, App): Check, Up to date, orange Update to X.Y, progress, errors, and "Needs the
  internet." offline. Downloads the latest release of Solomon-69/Ludus, checks its SHA-256, swaps the app and
  reopens. Always asks first. One setting (`Ludus.UPDATE_API` in `web/status.js`) says where updates come from.
- Failsafe: if the games screen ever fails to start, the app shows its own screen with Reload Ludus and Reset
  this game's data instead of a blank panel.
- Online page steps all fit on one line ("Create or join"). Share with a friend: short one-line text, the
  "right-click, Open the first time" tip now travels with the copy (Read me file and the Messages text), and the
  picker opens beside the button.

## 1.8.3 (2026-10-23)

- Map Hunt map: zooming in and out no longer flashes blank patches. A coarse whole-world map now sits under the
  detailed tiles, tiles no longer fade in, and the map is only redrawn when a zoom step settles
  (test: 0 blank frames out of about 1,000, was 801).
- Map Hunt pin bar: the text is picked from the map's final size, so it no longer swaps mid-animation.
- Online page: "Play online" sits in its own box with three short steps (Create or join a room, Share the code,
  Host picks games) instead of the long sentence.
- Light mode: text fields, the Last party card, the room code boxes and the Online header use a slightly deeper
  cream with a hairline edge so they stand out from the panel. Dark mode is unchanged.

## 1.8.2 (2026-10-23)

- New covers: Flag Quiz (France and Seychelles, clean edges), 2048 (a real board mid-game), Ultimate tic-tac-toe
  (nine small boards), snake arena game (smooth worm), Air Hockey (rink in play), Tanks (arena, two tanks, a shell);
  falling-blocks game and Minefield lose the little star; Map Hunt map without the pale stripe.
- Mac: opening Ludus closes the panel of our other menu bar apps (and the other way round); a click on any other
  menu bar item closes it too, except Nox's quick dark-mode switch.
- Map Hunt: the pin bar shows the whole sentence only when it fits, otherwise "Place your pin"; never cut off.
- Online page: equal spacing between every block; Last party card shows "Last party · <game>", the players with a
  crown on the host, Forget and Rejoin on the right.

## 1.8.1 (2026-10-23)

- Map Hunt no longer saves a game to resume later: every open starts a fresh game (pause still works while it is
  open, best score kept). Any old Map Hunt save is removed. A damaged best score counts as none.
- Map Hunt cover: no dashed centre line.

## 1.8.0 (2026-10-23)

- Crash failsafe: if a game throws, freezes or loses its graphics, a calm recovery card (Try again, New game, Back to
  games) replaces it; a save that keeps crashing is set aside; errors go to a local log file, never on screen.

- Map Hunt: a saved game no longer reopens as a blurred map with nothing to press (the game's map sat on top of the
  Paused / Welcome back card). The pause card is always on top; a 1.7 Map Hunt save is cleared once after updating.
- Map Hunt: a street photo that will not load is retried, then swapped for another place (solo); the "Needs internet"
  card has a New game button; the street view recovers if the graphics card drops it; clicking the map to pin works.
- Map Hunt map: zooming settles in the direction you zoom (no bounce back between wheel clicks), the country map stays
  underneath while city tiles load, and your pin stays fully in view when the map shrinks back.
- Card covers are redrawn whenever their size changes, so they are never squashed or stretched (panel back from a wide
  game, Compact/Large, screen scale). Search lists the best name match first (Geo finds Map Hunt) and starts at the top.
- Online page: fills the panel with no empty band, tidier Last party card, "Create a room" wording.
- hammer-climbing game: swinging the hammer in the air no longer pushes the pot, so long jumps fly their full arc.

## 1.7.0 (2026-10-23)

- **Online tournaments and parties:** pick several games and rounds, play them in a row with a scoreboard, rejoin your party, and a rematch button on the final standings. Still works with friends on 1.6.x (they play one game per room).
- **Smoother online action games:** guests now predict their own paddle or player and ease out the host's corrections, so paddle game, Air Hockey, Tag, swallow-the-city game, claim-the-land game and snake arena game feel responsive on slow connections.
- **Online page:** the 3-4 Player games moved into Online; filter chips All, Arcade, Puzzle, Duel, 2 Player and Online.
- **Polish:** new covers for swallow-the-city game, claim-the-land game, Crate Push and Slither, a redrawn Rock Paper Scissors fist with a spring rebound, and fixes for toasts overlapping the result bar.
- **Windows:** better handling of display scaling and zoom.
- **Map Hunt (new game):** a street-level photo from somewhere on Earth; look around, move along the road, pin the place on the map. Solo or online for 2 to 4 players with the same places for everyone.
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
