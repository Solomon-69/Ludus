// Diagnostic: Rejoin on a network where only ntfy.sh works (MQTT hosts swallow connections: they never answer).
// node ntfyonly.js [hang|refuse] [host|guest]
const L = require('./lib.js'); const { chromium } = require('playwright-core'); const net = require('net'); const path = require('path');
const MODE = process.argv[2] || 'hang', ROLE = process.argv[3] || 'host';
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
(async () => {
  const hole = net.createServer(s => { s.on('error', () => {}); }); await new Promise(r => hole.listen(0, '127.0.0.1', r));
  const port = MODE === 'hang' ? hole.address().port : 9;
  const rules = ['broker.emqx.io', 'broker.hivemq.com', 'test.mosquitto.org'].map(h => 'MAP ' + h + ' 127.0.0.1:' + port).join(',');
  const fs = require('fs'), d = path.join(process.env.HOME, 'Library/Caches/ms-playwright'), h = fs.readdirSync(d).find(x => x.startsWith('chromium_headless_shell'));
  const browser = await chromium.launch({ executablePath: path.join(d, h, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), args: ['--host-resolver-rules=' + rules, '--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 600 } }); const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('response', r => { if (/ntfy\.sh\/lds-/.test(r.url()) && r.request().method() === 'POST' && r.status() !== 200) log('ntfy POST', r.status()); });
  await page.addInitScript(() => { window.ludusDebug = {}; window.__LUDUS_NO_AUTOREJOIN__ = true; try { if (!localStorage.getItem('ludus.v1')) localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, onlineName: 'Ann' })); } catch (e) {} });
  await page.goto('file://' + path.join(L.WEB, 'index.html')); await page.waitForTimeout(300);
  const code = await page.evaluate(() => Ludus.net.codeFor(0, 4));
  await page.evaluate(([c, r]) => { const s = JSON.parse(localStorage.getItem('ludus.v1')); localStorage.setItem('ludus.relay', 'ntfy://ntfy.sh'); s.party = { role: r, code: c, mine: r === 'host', live: false, name: 'Ann', names: ['Ann', 'Bo'], games: [], n: 1, at: Date.now() - 30 * 3600e3 }; localStorage.setItem('ludus.v1', JSON.stringify(s)); }, [code, ROLE]);
  await page.reload(); await page.waitForTimeout(400);
  let last = ''; const w = setInterval(async () => { try { const st = JSON.stringify(await page.evaluate(() => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || (Ludus.lobby && Ludus.lobby.session); const t = Array.from(document.querySelectorAll('.toast')).map(e => e.textContent).join('|'); const card = (document.getElementById('lobbyCard') || {}).innerText || ''; return { s: s ? { role: s.role, ready: s.ready, over: s.over, conn: s.conn, url: s.client && s.client.url } : null, toast: t, card: card.slice(0, 70).replace(/\s+/g, ' '), vis: !document.getElementById('lobbySheet').hidden }; })); if (st !== last) { last = st; log(st); } } catch (e) {} }, 500);
  log('press Rejoin', code, ROLE); await L.onlineTab(page); await page.click('#opRejoin');
  const ok = await page.waitForFunction(c => { const s = ((window.ludusOnline && window.ludusOnline()) || {}).session || Ludus.lobby.session; return s && s.ready && s.code === c; }, code, { timeout: 100000 }).then(() => true, () => false);
  log('READY', ok); await L.wait(2000); clearInterval(w); log('errors', page.errors.slice(0, 3));
  await browser.close(); hole.close();
})();
