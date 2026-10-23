// Shared helpers for the online tests: headless Chromium pages that talk through the in-memory broker.
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs'), cp = require('child_process');
const broker = require('./broker.js');
const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const OLD = path.join(__dirname, '.old', 'web');          // Ludus 1.6.0 exactly as shipped (git tag v1.6.0)
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME || (() => { const d = path.join(process.env.HOME, 'Library/Caches/ms-playwright'); const h = fs.readdirSync(d).find(x => x.startsWith('chromium_headless_shell')); return path.join(d, h, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); })();
if (!fs.existsSync(OLD)) { fs.mkdirSync(path.join(__dirname, '.old'), { recursive: true }); cp.execSync('git archive v1.6.0 web | tar -x -C QA/online/.old', { cwd: ROOT }); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
const launch = () => chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function newPage(browser, br, o = {}) {
  const ctx = await browser.newContext({ viewport: o.size || { width: 400, height: 600 }, colorScheme: o.dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript(([port, name, dark]) => {
    window.ludusDebug = window.ludusDebug || {};
    window.__LUDUS_BROKERS__ = port ? ['ws://127.0.0.1:' + port] : ['ws://127.0.0.1:9'];
    try { if (!localStorage.getItem('ludus.v1')) localStorage.setItem('ludus.v1', JSON.stringify({ reduceMotion: true, introDone: true, onlineName: name || '', theme: dark ? 'dark' : 'light' })); } catch (e) {}
  }, [br && br.port, o.name || '', !!o.dark]);
  await page.goto('file://' + path.join(o.old ? OLD : WEB, 'index.html'));
  await page.waitForTimeout(300);
  return page;
}
const errs = ps => ps.reduce((a, p) => a + p.errors.length, 0);
const code = page => page.$$eval('.code-ch', els => els.map(e => e.textContent).join(''));
const lobbyText = page => page.$eval('#lobbyCard', e => e.innerText);
const title = page => page.$eval('#lobbyCard .sheet-title', e => e.textContent).catch(() => '');
const rows = page => page.$$eval('#lobbyCard .seat', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
const hasScore = (rs, name, n) => rs.some(x => new RegExp('^\\S+ ' + name + '( \\(you\\))? ' + n + '$').test(x));
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png') });
// --- the Online section (new pages)
const onlineTab = async page => { await page.click('#filters .chip:has(.chip-lab:text-is("Online"))'); await page.waitForSelector('#opCreate'); };
async function flexCreate(page) { await onlineTab(page); await page.click('#opCreate'); await page.waitForSelector('.code-ch', { timeout: 8000 }); return code(page); }
async function flexJoin(page, c) { await onlineTab(page); await page.fill('#opCode', c); await page.click('#opJoin'); await page.waitForSelector('.plan', { timeout: 9000 }); }
const esc = n => new RegExp('^' + n.replace(/[.]/g, '\\.') + '$');
async function pick(page, names, rounds) {
  await page.locator('#lobbyCard .mode-tab', { hasText: names.length > 1 ? 'Tournament' : 'Single game' }).click();
  const first = page.locator('#lobbyCard .pick-chips').first();
  for (const n of names) { const c = first.locator('.chip', { hasText: esc(n) }); if ((await c.getAttribute('aria-pressed')) !== 'true') await c.click(); }
  const on = await first.locator('.chip.is-on').evaluateAll(els => els.map(e => e.textContent));
  for (const n of on) if (!names.includes(n)) await first.locator('.chip.is-on', { hasText: esc(n) }).first().click();
  if (rounds !== undefined) await page.locator('#lobbyCard .pick-chips').nth(1).locator('.chip', { hasText: esc(String(rounds)) }).click();
}
const waitCard = (page, re, ms = 12000) => page.waitForFunction(r => new RegExp(r).test((document.getElementById('lobbyCard') || {}).innerText || '') && !document.getElementById('lobbySheet').hidden, re, { timeout: ms });
const waitPlaying = page => page.waitForFunction(() => { const o = window.ludusOnline && window.ludusOnline(); return o && o.started && o.session && o.session.active && document.getElementById('lobbySheet').hidden; }, null, { timeout: 12000 });
async function playRound(pages, winner) { await Promise.all(pages.map(waitPlaying)); await wait(500); await Promise.all(pages.map((p, k) => p.evaluate(w => ludusForceOver(w), k === winner))); }
// a party of n pages for one game, through the Online section; the host presses Start
async function party(browser, br, gameName, n, opts = {}) {
  const names = ['Ann', 'Bo', 'Cy', 'Dee'], pages = [];
  for (let k = 0; k < n; k++) pages.push(await newPage(browser, br, { name: names[k], size: opts.size, dark: opts.dark }));
  const [A] = pages, c = await flexCreate(A);
  for (const P of pages.slice(1)) await flexJoin(P, c);
  await pick(A, [gameName], 1);
  await A.waitForFunction(k => document.querySelectorAll('.seat.on').length === k, n, { timeout: 9000 });
  await A.click('#lobbyCard button.primary');
  await Promise.all(pages.map(waitPlaying));
  return { pages, code: c };
}
const hold = async (p, key, ms) => { await p.keyboard.down(key); await wait(ms); await p.keyboard.up(key); };
module.exports = { broker, wait, check, results, launch, newPage, errs, code, lobbyText, title, rows, hasScore, shot, onlineTab, flexCreate, flexJoin, pick, waitCard, waitPlaying, playRound, party, hold, SHOTS, WEB, OLD };
