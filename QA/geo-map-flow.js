// Geo Guess map flow: click the closed map (opens it), click to pin (pin lands where the pointer is), pin marker shows,
// Guess -> result map with the right-answer marker, the guess marker and the dotted line. Dark mode keeps the map light.
//   node QA/geo-map-flow.js [OUT_PNG_PREFIX]   (prints JSON, exit code 1 on a failed check)
const path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const prefix = process.argv[2] || '/tmp/geo-flow', wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 760, height: 500 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('x', '1'); } catch (e) {} window.__LUDUS_SKIP_INTRO__ = true; });
  await page.goto('file://' + path.join(__dirname, '../web/index.html')); await wait(400);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await w(1500);
    for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await w(500);
    document.querySelector('.geo-go').click();
    for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await w(500);
    await w(1500);
  });
  const checks = {};
  const rect = () => page.evaluate(() => { const b = document.querySelector('.geo-mapbox').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  // 1. click on the closed (scaled-down) map opens it, no pin yet
  let r = await rect(); await page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); await wait(900);
  checks.closedClickOpens = await page.evaluate(() => ludusDebug.geo().mapOpen);
  // 2. click to pin: the pin is where the pointer is
  r = await rect(); const px = r[0] + r[2] * 0.62, py = r[1] + r[3] * 0.4;
  const want = await page.evaluate(([x, y]) => { const m = ludusGeoTest.map().map, b = document.querySelector('.geo-minimap').getBoundingClientRect(), p = m.unproject([x - b.left, y - b.top]); return { lat: p.lat, lon: ((p.lng + 540) % 360) - 180 }; }, [px, py]);
  await page.mouse.click(px, py); await wait(700);
  const pin = await page.evaluate(() => ludusDebug.geo().pin);
  checks.pinPlaced = !!pin && Math.abs(pin.lat - want.lat) < 1 && Math.abs(pin.lon - want.lon) < 1;
  checks.pinMarker = await page.evaluate(() => document.querySelectorAll('.geo-minimap .geo-mk .geo-gpin').length === 1);
  checks.lightInDark = await page.evaluate(() => { const c = document.querySelector('.geo-minimap canvas'); return getComputedStyle(document.querySelector('.geo-mapbox')).backgroundColor; });
  await (await page.$('.geo-mapbox')).screenshot({ path: prefix + '-pinned.png' });
  // 3. result map
  await page.evaluate(() => ludusGeoTest.guess(false)); await wait(4500);
  checks.result = await page.evaluate(() => ({ phase: ludusDebug.geo().phase, markers: document.querySelectorAll('.geo-resmap .geo-mk').length, pins: document.querySelectorAll('.geo-resmap .geo-gpin').length, target: document.querySelectorAll('.geo-resmap .geo-pin').length }));
  await page.screenshot({ path: prefix + '-result.png' }); checks.dom = await page.evaluate(() => { const h = document.querySelector('.geo-resmap'), c = h && h.querySelector('canvas'); const r = e => e ? [e.clientWidth, e.clientHeight, getComputedStyle(e).display, getComputedStyle(e).position] : null; return { h: r(h), c: r(c), cls: h && h.className, mm: !!(window.ludusGeoTest && 1) }; });
  const ok = checks.closedClickOpens && checks.pinPlaced && checks.pinMarker && checks.result.phase === 'result' && checks.result.markers === 2 && checks.result.pins === 1 && checks.result.target === 1 && !errors.length;
  console.log(JSON.stringify({ pass: !!ok, checks, errors })); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
