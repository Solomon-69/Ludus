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
