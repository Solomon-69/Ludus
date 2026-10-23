// Real rendered frames of the Geo Guess guess map while zooming across the city-map switch (level 9), captured with
// the browser's screencast (what is really painted, not what the DOM says). Writes frames to OUT and prints how many
// show an empty map (flat water blue over the whole map box).  node QA/geo-frames.js OUT_DIR [--dir]
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const out = process.argv[2] || path.join(os.tmpdir(), 'geo-frames'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome });
  const page = await (await browser.newContext({ viewport: { width: 760, height: 500 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__LUDUS_SKIP_INTRO__ = true; });
  await page.goto('file://' + path.join(__dirname, '../web/index.html')); await wait(400);
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await w(1500);
    for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await w(500);
    document.querySelector('.geo-go').click();
    for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await w(500);
    document.querySelector('.geo-mini').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await w(800);
    ludusGeoTest.view(45.4, 9.2, 5); await w(3000);
  });
  const box = await page.evaluate(() => { const b = document.querySelector('.geo-mapbox').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  const cdp = await page.context().newCDPSession(page); let n = 0; const meta = [];
  cdp.on('Page.screencastFrame', async f => { const i = n++; fs.writeFileSync(path.join(out, String(i).padStart(4, '0') + '.jpg'), Buffer.from(f.data, 'base64')); meta.push([i, f.metadata.timestamp]); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  const cx = box[0] + box[2] * 0.55, cy = box[1] + box[3] * 0.45;
  for (let k = 0; k < 8; k++) {
    const dy = k % 2 === 0 ? -120 : 120;
    for (let i = 0; i < 14; i++) { await page.mouse.move(cx, cy); await page.evaluate(([x, y, d]) => document.querySelector('.geo-minimap').dispatchEvent(new WheelEvent('wheel', { deltaY: d, clientX: x, clientY: y, bubbles: true, cancelable: true })), [cx, cy, dy]); await wait(k % 4 < 2 ? 70 : 25); }
    await wait(900);
  }
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ box, frames: n, meta }));
  console.log(JSON.stringify({ frames: n, box }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
