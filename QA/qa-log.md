# Ludus QA log (22 Oct 2026, night)

| id | where | problem | severity | status |
|---|---|---|---|---|
| Q1 | engine api.canvas | onResize ran before create() returned: 2048 crashed "Cannot access 'view' before initialization" | high | fixed (onResize now fires after create), re-tested |
| Q2 | home, real app | orange focus ring on Settings button when the panel opened | low | fixed (blur on open) |
| Q3 | settings header | title not centred | low | fixed |
| Q4 | index.html | favicon 404 in the browser console | low | fixed (inline empty icon) |
| Q5 | Right of Way | arena small in the compact panel | low | open: use Panel size Large; noted for the report |
| Q6 | Last Wire | partly luck by design; Hard wins ~60% vs random play | info | accepted |

## Round results
- Round 1 smoke (QA/smoke.js, Playwright headless, 400x600): 16/16 games ok, 0 errors, 0 leaked listeners, 52-61 fps.
- Shell test (QA/shell-test.js): 26/26 checks pass (filters, thumbnails, theme, accent, difficulty, hide game, instant switch, hint toggle, Esc pause/resume, game over sheet, new best, Enter play again, reset two-step).
- Light mode: all 16 games screenshotted, all readable.
- Real app: popover arrow under the icon (compact and large), arrows reach the game without changing the front app, Esc pauses, settings and best scores survive rebuild/restart (UserDefaults), Open at login on then off confirmed in the system login items list (sfltool), panel size Large/Compact applied.

## v1.7.0 pass (23 Oct 2026): features since 22 Oct 17:00
Mac = installed app (test hook) or headless harness on the same web files; Windows = CI run "Windows test" on main (screenshots in the run artifact).

| Feature | Mac | Windows |
|---|---|---|
| Online: create / join / Rejoin keeps the same room code (twice), Create room makes a new code | pass (online.js party, reopen) | web code shared; CI opens WebView2 |
| Online: Single game / Tournament tabs, cover picker, 1 point per game won, scoreboard, rematch | pass (tournament, tleave, tleave2, lobbyui) | not run on Windows |
| Online: names never cut, Join row | pass (lobbyui, layout 42/42, screenshots Read) | not run on Windows |
| Online: old 1.6.x compatibility (rt plain format, one game per room) | pass (compat 12/12, futurehost) | not run |
| Online: guest smoothness / lag (Pong, Air Hockey, Tag, Hole.io, Paper.io) | pass (lag 20/20; Hole.io jump check flaky only when the Mac is overloaded) | not run |
| Only the game runs: rAF and timers audit (home 0 loops, game its own loop, lobby 0 loops) | pass | not run |
| Rock Paper Scissors: bot only, old paper/scissors drawings, new fist, online keeps secret picks | pass (harness screenshots Read) | opens (all games load) |
| Snake slower, crash bump and spark burst | pass (screenshots Read) | opens |
| Hole.io: static world no longer twitches | pass (stamp drift 1.67 -> 0.14 world units) | opens |
| Toast never covers text | pass (toast test, 4 sizes) | not run |
| Panel opens on All, scrolled to top; room memory kept | pass (reopen test) | pass (CI opens on All) |
| Geo Guess: opens wide, photo, Esri map English labels, timer pauses, guess flow, online | pass (installed app + geo.js 28 checks) | pass (CI opens it, screenshot 05b) |
| Geo Guess: Space to guess, no total mid-game, save/resume, pause sheet | pass (headless) | not run |
| Share with a friend (zip) | pass (sharetest: zip built, 9.3 MB) | n/a |
| Popover stays open on other menu bar clicks, rename toggle, rotate animation | not re-tested in this pass (other chats) | n/a |
| Flag Quiz, Getting Over It, Plants vs Zombies modes, new covers | pass (smoke opens every game, fit/btns) | opens (cards = games) |
| No zoom on Windows | n/a | pass (CI zoom test) |
| shell-test 47/47, fit and btns harness | pass (pre-existing: sparkhop Score overlap, wide over-bar clip are flaky/old) | n/a |

Known: smoke flags Geo Guess "leaked 1" listener and a Pannellum FileReader error during random mashing (does not reproduce in a plain open/close, 0 leaked).
