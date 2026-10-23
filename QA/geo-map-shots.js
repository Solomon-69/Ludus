// Screenshots of the Map Hunt guess map (map box opened large) at world, country, city and street zoom.
//   node QA/geo-map-shots.js OUT_PREFIX [webDir]      (webDir lets you shoot an older copy of web/ for a before/after)
const path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const prefix = process.argv[2] || '/tmp/geo-map', web = process.argv[3] || path.join(__dirname, '../web');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1, colorScheme: process.env.DARK ? 'dark' : 'light' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__LUDUS_SKIP_INTRO__ = true; });
  await page.goto('file://' + path.join(web, 'index.html')); await wait(400);
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await w(1500);
    for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await w(500);
    document.querySelector('.geo-go').click();
    for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await w(500);
    document.querySelector('.geo-mini').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await w(600);
    const b = document.querySelectorAll('.geo-mapctl button')[0]; b.click(); await w(400); b.click(); await w(400); b.click(); await w(800);
  });
  for (const [n, lat, lon, z] of [['world', 25, 10, 1.3], ['country', 49.5, 11, 5.4], ['city', 48.21, 16.37, 10.5], ['street', 48.21, 16.37, 14]]) {
    await page.evaluate(([a, o, z]) => ludusGeoTest.view(a, o, z), [lat, lon, z]); await wait(7000);
    const el = await page.$('.geo-mapbox'); await el.screenshot({ path: `${prefix}-${n}.png` });
  }
  console.log(JSON.stringify({ errors })); await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
