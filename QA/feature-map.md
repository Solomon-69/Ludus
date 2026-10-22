# Ludus feature map

## Mac shell (Sources/App.swift)
- M1 Menu bar icon (gamecontroller, template, normal size), left or right click toggles the panel
- M2 Panel is an NSPopover, arrow under the icon, icon bounce on open
- M3 Clicking outside closes the panel; closing pauses a running game
- M4 Keyboard works in games without the app taking over the menu bar
- M5 Panel size Compact 400x600 / Large 520x740 (from Settings)
- M6 Open at login (SMAppService) from Settings
- M7 Quit from Settings
- M8 Scores and settings survive quitting (UserDefaults `ludusState`)
- M9 Light/dark follows the Mac when Appearance = Auto
- M10 Only bundled files can load in the web view
- M11 Test hook `com.solomon.Ludus.test`

## Home
- H1 Brand header, game count text
- H2 Filter chips All / Arcade / Puzzle / Duel
- H3 Game cards with thumbnail, tag, best score; last played shown first as "Continue"
- H4 Card entrance animation replays each time the panel opens
- H5 Settings button

## Game screen
- G1 Back, title, Score with bump animation, Best
- G2 Pause button, Esc / P pause and resume; pause sheet Resume / Restart / All games
- G3 Game over sheet: title, score, New best / Best, Play again (Enter or Space), All games
- G4 Controls hint under the stage (hidden when the setting is off)

## Settings
- S1 Appearance Auto / Light / Dark
- S2 Accent colour (8)
- S3 Panel size
- S4 Reduce motion
- S5 Difficulty Easy / Normal / Hard (read by every game)
- S6 Sound on/off, Volume
- S7 Show controls under games
- S8 Open on: All games / Last game
- S9 Games shown (switch per game)
- S10 Open at login (Mac only), Reset best scores (two-step), Quit (Mac only)

## Games (16)
2048, Blocks, Flappy Spark, Chomp, Snake, Minesweeper, Breakout, Four Up, Box It, Nine Squared, Last Wire, Wall Run, The Crossing, The Decider, Dead Centre, Right of Way.
Each: starts, takes keyboard and mouse input, scores, ends with the game-over sheet, Play again works repeatedly, no leaked listeners, no console errors, light and dark, compact and large stage, difficulty changes behaviour.
