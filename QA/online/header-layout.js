// Header layout check for EVERY game (1.12.34): no two header things may overlap, no header text may be clipped.
//   node header-layout.js [local|online] [--dir <web dir>] [--game id] [--sizes compact,wide,...] [--themes light,dark] [--shots]
// Header = the page bar above the stage (back, title, score, vs switch, online chip, buttons) and the top 72px of the game canvas.
// Canvas text and small images are recorded as they are drawn (patched fillText / drawImage), so the check sees what the player sees.
// local : every game solo / vs Bot / vs Friend.   online: every online game in a 2+ player party through the local broker.
const L = require('./lib.js');
const path = require('path');
const { wait } = L;
const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
const DIR = opt('--dir'), ONLY = opt('--game'), SHOTS = a.includes('--shots');
const MODES = a.filter(x => x === 'local' || x === 'online');
const SIZES_ALL = { compact: { width: 400, height: 600 }, large: { width: 520, height: 740 }, wide: { width: 760, height: 500 }, tall: { width: 430, height: 860 }, narrow: { width: 340, height: 520 }, widelarge: { width: 900, height: 640 } };
const sizes = (opt('--sizes') || 'compact,wide').split(',');
const themes = (opt('--themes') || 'light,dark').split(',');
const BAND = 72;

const RECORD = () => {
  if (window.__rec) return;
  const rec = window.__rec = { frame: 0, ids: 0, frames: new Map() };
  const loop = () => { rec.frame++; for (const [k, v] of rec.frames) if (v.f < rec.frame - 30) rec.frames.delete(k); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  const push = (ctx, kind, s, ext) => {
    const cv = ctx.canvas; if (!cv || !cv.isConnected) return;
    const m = ctx.getTransform(); if (Math.abs(m.b) > 0.01 || Math.abs(m.c) > 0.01) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const k = r.width / cv.width, X = x => r.left + (m.a * x + m.e) * k, Y = y => r.top + (m.d * y + m.f) * k;
    const box = ext(X, Y, m.a * k, m.d * k); if (!box) return;
    box.kind = kind; box.s = s; box.top = r.top; box.left = r.left; box.right = r.right; box.bottom = r.bottom;
    const key = rec.frame + ':' + (cv.__id || (cv.__id = ++rec.ids)) + ':' + (cv.__fr || 0); let list = rec.frames.get(key); if (!list) { list = []; list.f = rec.frame; rec.frames.set(key, list); } if (list.length < 400) list.push(box);
  };
  const cr = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) { const cv = this.canvas; const m = this.getTransform(); if (cv && w * m.a >= cv.width * 0.9 && h * m.d >= cv.height * 0.9) cv.__fr = (cv.__fr || 0) + 1; return cr.apply(this, arguments); };
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y, mw) {
    try {
      if (String(s).trim()) push(this, 'text', String(s), (X, Y, sx, sy) => {
        const mt = this.measureText(String(s)); let ax = x;
        const al = this.textAlign, w = mt.width;
        const x0 = al === 'center' ? x - w / 2 : (al === 'right' || al === 'end') ? x - w : x;
        return { x0: X(x0), x1: X(x0 + w), y0: Y(y - mt.actualBoundingBoxAscent), y1: Y(y + mt.actualBoundingBoxDescent) };
      });
    } catch (e) {}
    return ft.apply(this, arguments);
  };
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...p) {
    try {
      if (p.length === 4 || p.length === 8) {
        const [x, y, w, h] = p.length === 4 ? p : p.slice(4);
        if (w > 4 && h > 4 && w <= 64 && h <= 64) push(this, 'img', 'img', (X, Y) => ({ x0: X(x), x1: X(x + w), y0: Y(y), y1: Y(y + h) }));
      }
    } catch (e) {}
    return di.apply(this, arguments);
  };
};

// run in the page: the issues found in the recorded frames + the page bar
const COLLECT = (BAND) => {
  const out = [], seen = new Set(), add = s => { if (!seen.has(s)) { seen.add(s); out.push(s); } };
  const rec = window.__rec;
  const area = b => Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  const inter = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0)) / Math.min(area(p), area(q));
  const hit = (p, q) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 1.5 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 2;
  if (rec) for (const list of rec.frames.values()) {
    let hd = list.filter(b => b.y0 < b.top + BAND && b.y1 > b.top - 2);
    hd = hd.filter(b => b.kind === 'text' || b.y0 < b.top + 50);   // icons count only in the card row itself, not in a list below it
    if (hd.filter(b => b.kind === 'img').length > 10) hd = hd.filter(b => b.kind === 'text');   // a tiled background, not header icons
    for (const b of hd) if (b.kind === 'text' && !/^(N|NE|E|SE|S|SW|W|NW)$/.test(b.s) && (b.x0 < b.left - 1 || b.x1 > b.right + 1)) add(`clipped text "${b.s.slice(0, 24)}"`);
    for (let i = 0; i < hd.length; i++) for (let j = i + 1; j < hd.length; j++) {
      const p = hd[i], q = hd[j]; if (p.kind === 'img' && q.kind === 'img') continue; if (p.s === q.s) continue;
      if (hit(p, q) && (p.kind === q.kind || (inter(p, q) > 0.3 && Math.max(p.y0, q.y0) < p.top + 50))) add(`overlap "${p.s.slice(0, 20)}" x "${q.s.slice(0, 20)}"`);
    }
  }
  // the page bar
  const bar = document.querySelector('#game .game-bar');
  if (bar && document.getElementById('game').classList.contains('is-active')) {
    const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return false; } return true; };
    const els = ['#backBtn', '#gameName', '#gameScores > span:nth-child(1)', '#gameScores > span:nth-child(2)', '#vsToggle', '#onlineChip', '#orientBtn', '#leaveBtn', '#gameSettings', '#pauseBtn'].map(s => [s, document.querySelector('#game ' + s)]).filter(([, e]) => e && vis(e));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const p = els[i][1].getBoundingClientRect(), q = els[j][1].getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) add(`bar overlap ${els[i][0]} x ${els[j][0]}`);
    }
    for (const [s, e] of els) if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') add(`bar clipped ${s}`);
    const br = bar.getBoundingClientRect(); for (const [s, e] of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) add(`bar off-screen ${s}`); }
  }
  return out;
};

async function sample(page, tag, report, extra) {
  await page.evaluate(RECORD); await wait(450);
  if (extra) await extra(page);
  await wait(500);
  let issues = await page.evaluate(COLLECT, BAND);
  if (issues.some(x => x.startsWith('bar '))) { await wait(500); const again = await page.evaluate(COLLECT, BAND); issues = issues.filter(x => !x.startsWith('bar ') || again.includes(x)); }   // the bar slides in when a game opens
  for (const s of issues) report.push(`${tag}: ${s}`);
  return issues;
}

async function runLocal(browser, report, stats) {
  for (const sz of sizes) for (const th of themes) {
    const page = await L.newPage(browser, null, { size: SIZES_ALL[sz], dark: th === 'dark', dir: DIR || undefined });
    const games = await page.evaluate(() => Ludus.games.map(g => ({ id: g.id, name: g.name, versus: !!g.versus })));
    for (const g of games) {
      if (ONLY && g.id !== ONLY) continue;
      for (const vs of (g.versus ? ['bot', 'friend'] : ['solo'])) {
        await page.evaluate(([id, vs]) => { if (vs !== 'solo') Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [id]: vs }); Ludus.state.saves = {}; ludusOpenGame(id); }, [g.id, vs]);
        stats.n++;
        const tag = `local ${g.id}/${vs} ${sz} ${th}`;
        const got = await sample(page, tag, report, async p => { await p.keyboard.press('Space'); });
        if (SHOTS && got.length) await L.shot(page, `hdr-${g.id}-${vs}-${sz}-${th}`);
        await page.evaluate(() => document.getElementById('backBtn').click()); await wait(120);
      }
    }
    if (page.errors.length) report.push(`page errors ${sz} ${th}: ${page.errors[0].slice(0, 120)}`);
    await page.context().close();
  }
}

async function runOnline(browser, br, report, stats) {
  const probe = await L.newPage(browser, null, { size: SIZES_ALL.compact, dir: DIR || undefined });
  const games = await probe.evaluate(() => Ludus.games.filter(g => g.online).map(g => ({ id: g.id, name: g.name, min: g.online.min || 2, max: g.online.max || 2 })));
  await probe.context().close();
  for (const sz of sizes) for (const th of themes) for (const g of games) {
    if (ONLY && g.id !== ONLY) continue;
    const tag = `online ${g.id} ${sz} ${th}`; stats.n++;
    let party;
    try {
      party = await partyOf(browser, br, g, sz, th);
    } catch (e) { report.push(`${tag}: could not start (${String(e.message).split('\n')[0].slice(0, 80)})`); continue; }
    for (let k = 0; k < party.pages.length; k++) {
      const got = await sample(party.pages[k], tag + ` seat${k}`, report, async p => { await p.keyboard.press('Space'); });
      if (SHOTS && got.length && k === 0) await L.shot(party.pages[k], `hdr-${g.id}-online-${sz}-${th}`);
    }
    for (const p of party.pages) await p.context().close().catch(() => {});
  }
}

async function partyOf(browser, br, g, sz, th) {
  const n = Math.min(g.max, Math.max(g.min, 2)), names = ['Ann', 'Bo', 'Cy', 'Dee'], pages = [];
  for (let k = 0; k < n; k++) pages.push(await L.newPage(browser, br, { name: names[k], size: SIZES_ALL[sz], dark: th === 'dark', dir: DIR || undefined }));
  const [A] = pages, c = await L.flexCreate(A);
  for (const P of pages.slice(1)) await L.flexJoin(P, c);
  await L.pick(A, [g.name], 1);
  await A.waitForFunction(k => document.querySelectorAll('.seat.on').length === k, n, { timeout: 9000 });
  await A.click('#lobbyCard button.primary');
  await Promise.all(pages.map(L.waitPlaying));
  return { pages };
}

(async () => {
  const modes = MODES.length ? MODES : ['local', 'online'];
  const report = [], stats = { n: 0 };
  const br = await L.broker.start(), browser = await L.launch();
  if (modes.includes('local')) await runLocal(browser, report, stats);
  if (modes.includes('online')) await runOnline(browser, br, report, stats);
  await browser.close(); br.stop && br.stop();
  const uniq = [...new Set(report)];
  console.log(uniq.join('\n'));
  console.log(`\nchecked ${stats.n} game screens; ${uniq.length} problems`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
