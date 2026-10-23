// Geo Guess guess map: scripted real mouse-wheel zoom in and out (world -> city -> world) while the browser records what is
// really painted. Reports: blank frames (box is one flat colour), and anchor drift (the spot under the pointer must stay
// under the pointer while zooming: a fixed landmark does not move between frames). Writes frames + log to OUT.
//   node QA/geo-map-zoom.js OUT_DIR       then   python3 QA/geo-map-zoom-analyse.py OUT_DIR
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const out = process.argv[2] || path.join(os.tmpdir(), 'geo-map-zoom'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 760, height: 500 }, deviceScaleFactor: 1 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__LUDUS_SKIP_INTRO__ = true; });
  await page.goto('file://' + path.join(__dirname, '../web/index.html')); await wait(400);
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await w(1500);
    for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await w(500);
    document.querySelector('.geo-go').click();
    for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await w(500);
    document.querySelector('.geo-mini').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await w(800);
    ludusGeoTest.view(48.2, 16.4, 2.2); await w(4000);
  });
  const box = await page.evaluate(() => { const b = document.querySelector('.geo-mapbox').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  const cx = box[0] + box[2] * 0.55, cy = box[1] + box[3] * 0.45;
  await page.mouse.move(cx, cy);
  // per-frame log: zoom, and where the spot that was under the pointer when each wheel burst began sits now
  await page.evaluate(([x, y]) => {
    const m = ludusGeoTest.map().map, r = document.querySelector('.geo-minimap').getBoundingClientRect();
    window.__log = []; window.__anchor = null; window.__run = true;
    const tick = () => { if (!window.__run) return; const z = m.getZoom(); let d = null; if (window.__anchor) { const p = m.project(window.__anchor); d = Math.hypot(p.x - (x - r.left), p.y - (y - r.top)); } window.__log.push([performance.now(), z, d]); requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__setAnchor = () => { window.__anchor = m.unproject([x - r.left, y - r.top]); };
  }, [cx, cy]);
  const cdp = await page.context().newCDPSession(page); let n = 0; const meta = [];
  cdp.on('Page.screencastFrame', async f => { const i = n++; fs.writeFileSync(path.join(out, String(i).padStart(4, '0') + '.jpg'), Buffer.from(f.data, 'base64')); meta.push([i, f.metadata.timestamp]); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  for (let k = 0; k < 8; k++) {
    const dy = k < 4 ? -100 : 100;   // 4 bursts in (to street level), 4 bursts out
    await page.evaluate(() => window.__setAnchor());
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, dy); await wait(k % 2 ? 25 : 70); }
    await wait(1200);
    await page.evaluate(() => { window.__anchor = null; });
  }
  await cdp.send('Page.stopScreencast');
  const log = await page.evaluate(() => { window.__run = false; return window.__log; });
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ box, frames: n, meta, log, errors }));
  const drift = log.map(l => l[2]).filter(v => v !== null);
  console.log(JSON.stringify({ frames: n, rafFrames: log.length, maxDriftPx: Math.max(0, ...drift).toFixed(2), errors }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
