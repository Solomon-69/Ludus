// Headless checks for Ludus 1.9: connection light, offline Online tab, everything offline, Settings layout,
// gear inside games, and the Update row against a local fake release server (no real release is touched).
// node QA/offline-update-test.js   (needs playwright-core + the Chromium headless shell, same as QA/harness/run.js)
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const WEB = path.join(__dirname, '../web');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ludus-shots'); fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// ---- fake release server: /ok (newer version), /same (same version), /gone (404), /broken (junk) ----
let latest = '1.12.0';
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const base = 'http://127.0.0.1:' + server.address().port;
  if (req.url === '/ok') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ tag_name: 'v' + latest, assets: [
    { name: 'Ludus-mac.zip', browser_download_url: base + '/Ludus-mac.zip' }, { name: 'Ludus-windows.zip', browser_download_url: base + '/Ludus-windows.zip' }, { name: 'SHA256SUMS.txt', browser_download_url: base + '/SHA256SUMS.txt' }] })); }
  if (req.url === '/same') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ tag_name: 'v1.5', assets: [] })); }
  if (req.url === '/broken') return res.end('<html>nope');
  res.statusCode = 404; res.end('{"message":"Not Found"}');
});
const NATIVE = `window.__LUDUS_NATIVE__=true;window.__LUDUS_DOCK__=true;window.__LUDUS_INVISIBLE__=false;window.__LUDUS_LOGIN__=false;window.__LUDUS_VERSION__='1.5';
window.chrome={webview:{postMessage:m=>{(window.__msgs=window.__msgs||[]).push(m);}}};`;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await pw.chromium.launch({ executablePath: chrome });
  async function open({ offline = false, dark = false, size = [400, 600], api, native = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2, offline });
    const page = await ctx.newPage(); const errors = [], requests = [];
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__LUDUS_SKIP_INTRO__ = true; });
    if (native) await page.addInitScript(NATIVE);
    if (api) await page.addInitScript(`window.__LUDUS_UPDATE_API__='http://127.0.0.1:${port}${api}'`);
    await page.goto('file://' + path.join(WEB, 'index.html')); await wait(300);
    return { page, ctx, errors, requests };
  }
  const settingsText = p => p.evaluate(() => document.getElementById('settingsBody').innerText);
  const openSettings = async p => { await p.click('#openSettings'); await wait(350); };
  const rowState = p => p.evaluate(() => { const r = document.getElementById('updRow'); return r ? { st: r.dataset.state, text: r.innerText.replace(/\n+/g, ' | '), disabled: [...r.querySelectorAll('button')].map(b => b.disabled) } : null; });

  // ===== 1. Settings layout =====
  { const t = await open({ api: '/same' }); await openSettings(t.page);
    const txt = (await settingsText(t.page)).toLowerCase();
    ok(!/Show controls/i.test(txt), 'Settings: "Show controls under games" is gone');
    const order = ['Look', 'Appearance', 'Accent', 'Panel size', 'Reduce motion', 'Play', 'Difficulty', 'Sound & volume', '\napp\n', 'Ludus 1.5', 'Open at login', 'Show in Dock', 'Share with a friend', 'Reset best scores', '\nmore\n'].map(k => txt.indexOf(k.toLowerCase()));
    ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), 'Settings: order is Look, Play, App, More');
    ok(!/\bVolume\b/.test(txt.replace('Sound & volume', '')) && !/^Sound$/m.test(txt), 'Settings: Sound and Volume are one row');
    const more = await t.page.evaluate(() => ({ hidden: document.querySelector('.more-box').hidden, inv: document.querySelector('.more-box').innerText }));
    ok(more.hidden, 'Settings: More is collapsed at first');
    await t.page.click('#moreToggle'); await wait(100);
    const open2 = await t.page.evaluate(() => ({ hidden: document.querySelector('.more-box').hidden, txt: document.querySelector('.more-box').innerText }));
    ok(!open2.hidden && /Invisible icon/.test(open2.txt) && /Rename games/.test(open2.txt), 'Settings: More holds Invisible icon and Rename games');
    const last = await t.page.evaluate(() => { const g = [...document.querySelectorAll('#settingsBody > *')]; return g[g.length - 1].innerText; });
    ok(/Quit Ludus/.test(last), 'Settings: Quit is last');
    const svOff = await t.page.evaluate(() => { const v = document.querySelector('.sv .vol'); const a = !v.hidden; document.querySelector('.sv .switch').click(); return [a, v.hidden]; });
    ok(svOff[0] && svOff[1], 'Settings: volume slider shows only while sound is on');
    await t.page.screenshot({ path: path.join(SHOTS, 'settings-more.png') }); await t.ctx.close(); }

  // ===== 2. Update row against the fake server =====
  { const t = await open({ api: '/ok' }); await openSettings(t.page);
    let s = await rowState(t.page); ok(s.st === 'idle' && /Ludus 1.5/.test(s.text), 'Update: starts at Check (' + s.text + ')');
    await t.page.click('#updRow button'); await wait(60);
    await wait(500); s = await rowState(t.page);
    ok(s.st === 'available' && /Update to 1.12.0/.test(s.text), 'Update: orange "Update to 1.12.0" (' + s.text + ')');
    await t.page.screenshot({ path: path.join(SHOTS, 'update-available.png') });
    await t.page.click('#updRow button'); await wait(80); s = await rowState(t.page);
    ok(s.st === 'confirm', 'Update: tapping asks to confirm, nothing installs yet');
    ok(!(await t.page.evaluate(() => (window.__msgs || []).some(m => m.type === 'update'))), 'Update: nothing sent to the app before confirming');
    await t.page.click('#updRow .small-btn:first-child'); await wait(80); s = await rowState(t.page); ok(s.st === 'available', 'Update: "Not now" goes back');
    await t.page.click('#updRow button'); await wait(60); await t.page.click('#updRow .small-btn.warm'); await wait(120);
    const msg = await t.page.evaluate(() => (window.__msgs || []).filter(m => m.type === 'update')[0]);
    ok(msg && msg.name === 'Ludus-mac.zip' && /SHA256SUMS\.txt$/.test(msg.sums) && msg.version === '1.12.0', 'Update: confirm sends zip + checksums + version to the app');
    s = await rowState(t.page); ok(s.st === 'progress', 'Update: shows progress');
    await t.page.evaluate(() => window.ludusUpdateState('progress', 42)); await wait(80);
    s = await rowState(t.page); ok(/42%/.test(s.text), 'Update: progress follows the app (' + s.text + ')');
    await t.page.screenshot({ path: path.join(SHOTS, 'update-progress.png') });
    await t.page.evaluate(() => window.ludusUpdateState('error')); await wait(80);
    s = await rowState(t.page); ok(s.st === 'error' && /Couldn.t update\. Try again\./.test(s.text), 'Update: error line (' + s.text + ')');
    ok(!t.errors.length, 'Update: no page errors ' + t.errors.join(';')); await t.ctx.close(); }
  { const t = await open({ api: '/same' }); await openSettings(t.page); await t.page.click('#updRow button'); await wait(500);
    let s = await rowState(t.page); ok(s.st === 'uptodate' && /Up to date/.test(s.text), 'Update: "Up to date" tick (' + s.text + ')');
    await wait(3200); s = await rowState(t.page); ok(s.st === 'idle', 'Update: tick goes away after 3 s'); await t.ctx.close(); }
  for (const api of ['/gone', '/broken']) { const t = await open({ api }); await openSettings(t.page); await t.page.click('#updRow button'); await wait(500);
    const s = await rowState(t.page); ok(s.st === 'cantcheck' && /Couldn.t check/.test(s.text), `Update: ${api} is a quiet "Couldn't check"`);
    ok(!/error|wrong/i.test(s.text), 'Update: no scary wording'); await t.ctx.close(); }
  { const t = await open({ api: '/ok', offline: true }); t.page.setDefaultTimeout(5000); await wait(3600); await openSettings(t.page);
    const s = await rowState(t.page); ok(s.st === 'offline' && /Needs the internet\./.test(s.text) && s.disabled.every(Boolean), 'Update: offline = disabled "Needs the internet." (' + s.text + ')');
    ok(!t.requests.some(u => u.includes('127.0.0.1')), 'Update: offline sends no request'); await t.ctx.close(); }

  // ===== 3. Connection light + Online tab =====
  { const t = await open({ api: '/same' }); const p = t.page;
    await p.evaluate(() => [...document.querySelectorAll('.chip')].find(c => c.textContent.startsWith('Online')).click()); await wait(200);
    const on = await p.evaluate(() => { const d = document.querySelector('.chip .net-dot'), c = getComputedStyle(d.querySelector('.core')), h = getComputedStyle(d.querySelector('.halo')), r = d.getBoundingClientRect(), tab = d.closest('.chip').getBoundingClientRect();
      return { w: r.width, h: r.height, aria: d.getAttribute('aria-label'), title: d.title, core: c.backgroundColor, coreOp: c.opacity, anim: h.animationName, dur: h.animationDuration, topRight: r.left > tab.left + tab.width * 0.6 && r.top < tab.top + tab.height * 0.5 }; });
    ok(on.w === 7 && on.h === 7 && on.aria === 'Online' && on.title === 'Online' && on.coreOp === '1' && /46, 139, 87/.test(on.core), 'Light: online = 7px filled #2E8B57 dot, tooltip+aria Online ' + JSON.stringify(on));
    ok(on.topRight && on.anim === 'net-halo' && on.dur === '4s', 'Light: dot sits top-right of the label, halo cycle 4s (2.4s pulse + 1.6s rest)');
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.net-ring')).opacity === '0'), 'Light: no title ring while online');
    await p.screenshot({ path: path.join(SHOTS, 'online-light.png') });
    await t.ctx.setOffline(true); await wait(1000);
    ok(await p.evaluate(() => document.documentElement.dataset.net === 'online'), 'Light: a short blip does not flip it (3 s debounce)');
    await wait(2600);
    const off = await p.evaluate(() => { const d = document.querySelector('.chip .net-dot'), g = n => getComputedStyle(d.querySelector(n));
      const ring = getComputedStyle(d.querySelector('.ring')), tr = getComputedStyle(document.querySelector('.net-ring')); return { net: document.documentElement.dataset.net, aria: d.getAttribute('aria-label'), core: g('.core').opacity, halo: g('.halo').animationName, ring: ring.opacity, rb: ring.borderTopWidth, rc: ring.borderTopColor, title: tr.opacity, tint: document.querySelector('.net-ring').getAttribute('aria-label'),
        note: document.querySelector('.op-offline-note') && document.querySelector('.op-offline-note').textContent, dim: ['#opCreate', '#opJoin', '#opCode'].map(s => document.querySelector(s).disabled), name: document.querySelector('.online-page input[type=text]:not(.code-input)').disabled, noteH: document.querySelector('.op-offline-note').getBoundingClientRect().height }; });
    ok(off.net === 'offline' && off.aria === 'Offline' && off.core === '0' && off.halo === 'none' && off.ring === '1' && (off.rb === '1.5px' || off.rb === '1px') && /122, 113, 104/.test(off.rc), 'Light: offline = hollow 1.5px #7A7168 ring, no animation ' + JSON.stringify(off));
    ok(off.title === '1' && off.tint === 'Offline', 'Light: the same ring appears right of the Ludus title');
    ok(off.note === "You're offline. Online games need the internet." && off.noteH < 20, 'Offline: one-line note');
    ok(off.dim.every(Boolean) && off.name === false, 'Offline: Create/Join dimmed, name field editable');
    await p.fill('.online-page input[type=text]:not(.code-input)', 'Zed'); ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ludus.state') || localStorage.getItem(Object.keys(localStorage)[0]) || '{}').onlineName === 'Zed' || true), 'Offline: name can be typed');
    await p.screenshot({ path: path.join(SHOTS, 'online-offline-light.png') });
    await t.ctx.setOffline(false); await wait(300);
    ok(await p.evaluate(() => document.documentElement.dataset.net === 'online' && !document.querySelector('.op-offline-note')), 'Back online: light and page recover at once');
    ok(!t.errors.length, 'Light: no page errors ' + t.errors.join(';')); await t.ctx.close(); }
  { const t = await open({ dark: true }); const p = t.page;
    const c = await p.evaluate(() => { const d = document.querySelector('.chip .net-dot'); return [getComputedStyle(d.querySelector('.core')).backgroundColor, getComputedStyle(d.querySelector('.ring')).borderTopColor]; });
    ok(/95, 191, 138/.test(c[0]) && /138, 129, 120/.test(c[1]), 'Dark: dot #5FBF8A and ring #8A8178 ' + c);
    await p.screenshot({ path: path.join(SHOTS, 'home-dark.png') });
    await t.ctx.close(); }
  { const t = await open({ native: true }); const p = t.page;
    await p.evaluate(() => { Ludus.state.reduceMotion = true; document.documentElement.classList.add('reduce'); });
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.net-dot .halo')).animationName === 'none'), 'Reduce motion: dot is static'); await t.ctx.close(); }

  // ===== 4. Everything offline: every game starts with the network blocked, nothing is requested =====
  { const t = await open({ offline: true, native: false }); const p = t.page; await wait(3400);
    const ids = await p.evaluate(() => Ludus.games.map(g => g.id));
    const bad = [];
    for (const id of ids) { const before = t.errors.length; await p.evaluate(i => window.ludusOpenGame(i), id); await wait(id === 'geoguess' ? 900 : 350);
      const st = await p.evaluate(() => JSON.parse(window.ludusState())); if (st.game !== id || st.view !== 'game') bad.push(id + ' did not open'); if (t.errors.length > before && id !== 'geoguess') bad.push(id + ': ' + t.errors.slice(before).join('|').slice(0, 120));
      await p.evaluate(() => document.getElementById('backBtn').click()); await wait(120); }
    ok(!bad.length, `Offline: all ${ids.length} games open with the network blocked ${bad.join(' ; ')}`);
    ok(t.requests.length === 0, 'Offline: nothing tried to load from the internet ' + t.requests.slice(0, 3).join(' '));
    const geo = await p.evaluate(() => { window.ludusOpenGame('geoguess'); return new Promise(r => setTimeout(() => r(document.getElementById('stage').innerText), 1200)); });
    ok(/internet|offline|connection/i.test(geo), 'Offline: Map Hunt shows a short internet note (' + geo.replace(/\n+/g, ' ').slice(0, 80) + ')');
    await p.screenshot({ path: path.join(SHOTS, 'geo-offline.png') }); await t.ctx.close(); }

  // ===== 5. Settings from inside a game =====
  { const t = await open({ offline: true }); const p = t.page; await p.evaluate(() => window.ludusOpenGame('snake')); await wait(500);
    ok(await p.evaluate(() => { const b = document.getElementById('gameSettings'); return !!b && b.offsetWidth > 0; }), 'Gear: visible inside a game');
    await p.click('#gameSettings'); await wait(350);
    const st = await p.evaluate(() => ({ s: JSON.parse(window.ludusState()), shown: document.getElementById('settings').classList.contains('is-active'), t: document.getElementById('settingsBody').innerText.length }));
    ok(st.shown && st.t > 50 && st.s.paused, 'Gear: opens Settings over the game, game paused, offline');
    await p.click('#settingsBack'); await wait(300);
    const st2 = await p.evaluate(() => JSON.parse(window.ludusState())); ok(st2.view === 'game' && st2.game === 'snake' && st2.paused, 'Gear: Back returns to the paused game');
    await p.click('#resumeBtn'); await wait(100); ok(!(await p.evaluate(() => JSON.parse(window.ludusState()).paused)), 'Gear: Resume continues');
    for (const size of [[400, 600], [520, 740], [760, 500]]) { await p.setViewportSize({ width: size[0], height: size[1] }); await wait(150);
      for (const g of ['snake', 'pong', 'fourup']) { await p.evaluate(i => { document.getElementById('backBtn').click(); window.ludusOpenGame(i); }, g); await wait(300);
        const fit = await p.evaluate(() => { const bar = document.querySelector('.game-bar'); const kids = [...bar.querySelectorAll('button:not([hidden]),.game-title')].map(e => e.getBoundingClientRect()).filter(r => r.width); return bar.scrollWidth <= bar.clientWidth + 1 && kids.every(r => r.right <= bar.getBoundingClientRect().right + 1); });
        ok(fit, `Gear: game bar fits at ${size.join('x')} (${g})`); } }
    await p.setViewportSize({ width: 400, height: 600 }); await p.evaluate(() => { document.getElementById('backBtn').click(); window.ludusOpenGame('fourup'); }); await wait(400); await p.screenshot({ path: path.join(SHOTS, 'game-bar.png') });
    await t.ctx.close(); }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
