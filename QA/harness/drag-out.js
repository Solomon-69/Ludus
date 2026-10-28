// Mouse control never stops at the window edge (no network): node QA/harness/drag-out.js [--web dir]
// Hammer Climb (the pointer-lock fallback path, as in an app view that refuses a lock): press inside the
// game, drag far outside the window, and the game keeps getting the moves; after the button is released outside, moves
// out there no longer reach it. Prints PASS/FAIL lines and "n/m passed".
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const web = opt('--web') || path.join(__dirname, '../../web');
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
let pass = 0, total = 0; const check = (ok, name, extra) => { total++; if (ok) pass++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + JSON.stringify(extra) : '')); };
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await (await browser.newContext({ viewport: { width: 400, height: 600 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__LUDUS_NO_LOCK__ = 1; });
  await page.goto('file://' + path.join(web, 'index.html')); await page.waitForTimeout(400);
  await page.evaluate(async () => { Ludus.state.climbDiff = 'normal'; Ludus.state.reduceMotion = true; ludusOpenGame('climb'); await new Promise(r => setTimeout(r, 900)); });
  const aim = () => page.evaluate(() => Ludus.debug && Ludus.debug.climbMouse && Ludus.debug.climbMouse());
  const box = await page.evaluate(() => { const r = document.querySelector('#stage canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.6;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(100);
  await page.mouse.move(cx - 300, cy + 40, { steps: 6 }); await page.waitForTimeout(100);   // far left of the 400px window
  const out1 = await aim();
  await page.mouse.move(cx - 300, cy - 320, { steps: 6 }); await page.waitForTimeout(100);  // and above it
  const out2 = await aim();
  check(out1 && out1.x < -50, 'climb: a drag past the left edge keeps steering the hammer', out1);
  check(out2 && out2.y < 0 && out2.y < out1.y - 200, 'climb: still steering while outside the window (above it)', out2);
  await page.mouse.up(); await page.waitForTimeout(100);
  await page.mouse.move(cx - 380, cy + 500, { steps: 6 }); await page.waitForTimeout(100);
  const out3 = await aim();
  check(out3 && Math.abs(out3.x - out2.x) < 1 && Math.abs(out3.y - out2.y) < 1, 'climb: after letting go outside, moves out there no longer reach it', out3);
  await page.mouse.move(cx + 20, cy, { steps: 4 }); await page.waitForTimeout(100);
  const back = await aim();
  check(back && Math.abs(back.x - (cx + 20 - box.x)) < 2, 'climb: back inside, the hammer follows the mouse again', back);
  check(!errors.length, 'no page errors', errors.slice(0, 3));
  console.log(pass + '/' + total + ' passed');
  await browser.close(); process.exit(pass === total ? 0 : 1);
})();
