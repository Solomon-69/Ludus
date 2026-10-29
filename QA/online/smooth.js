// Guest-side smoothness (1.12.33), no internet: node smooth.js [--dir <old web dir>] [only ...]
// Two pages on the local broker play Tag and Worm Arena online. On the guest it records when each state copy ("st")
// arrives and where the host's player is drawn every frame. Also a "hidden host": the host page only gets animation
// frames for 300 ms of every second (what a closed, covered or napping panel did), which made every guest stutter.
// Pass: no gap between state copies over 250 ms, no drawn jump far above the usual step, the round never restarts.
const L = require('./lib.js');
const { broker, wait, check, newPage, errs } = L;
const a = process.argv.slice(2), di = a.indexOf('--dir'), DIR = di >= 0 ? a[di + 1] : null;
const only = a.filter((x, i) => !x.startsWith('--') && (di < 0 || i !== di + 1)), want = n => !only.length || only.includes(n);

// the host page: animation frames only in the first 300 ms of every second (like a hidden/napping panel)
const THROTTLE = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(function f(t) { if (window.__throttle && (performance.now() % 1000) > 300) return raf(f); cb(t); });
};

async function room(browser, br, gameName, hidden) {
  const names = ['Ann', 'Bo'], pages = [];
  for (let k = 0; k < 2; k++) {
    const p = await newPage(browser, br, { name: names[k], size: { width: 560, height: 400 }, dir: DIR || undefined });
    if (k === 0 && hidden) { await p.addInitScript(THROTTLE); await p.reload(); await p.waitForTimeout(300); }
    pages.push(p);
  }
  const [A, B] = pages, c = await L.flexCreate(A);
  await L.flexJoin(B, c);
  await L.pick(A, [gameName], 1);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary');
  await Promise.all(pages.map(L.waitPlaying));
  return { A, B };
}

// on the guest: state arrival times, the gen (round) and the host player's drawn position each frame
const RECORD = kind => {
  const s = window.ludusOnline().session, act = s.active, rec = { st: [], pos: [], gen: s.gen, gens: new Set([s.gen]) };
  const orig = act._deliverFast.bind(act);
  act._deliverFast = item => { if (item.type === 'st') { rec.st.push(performance.now()); rec.nw = (rec.nw || 0) + (item.data && item.data.w ? 0 : 1); } orig(item); };
  const pos = () => {
    if (kind === 'tag') return window.ludusDebug.tagMe && window.ludusDebug.tagMe('p1');
    const d = window.ludusDebug.slither && window.ludusDebug.slither(); const w = d && d.humans.find(h => h.human === 1);
    return w && w.alive ? { x: w.px[0], y: w.py[0] } : null;
  };
  const f = () => { if (!window.__rec) return; const p = pos(); rec.pos.push([performance.now(), p ? p.x : NaN, p ? p.y : NaN]); const o = window.ludusOnline(); rec.gens.add(o && o.session ? o.session.gen : -1); requestAnimationFrame(f); };
  window.__rec = rec; requestAnimationFrame(f);
};
const REPORT = () => {
  const r = window.__rec; window.__rec = null;
  const gaps = r.st.slice(1).map((t, i) => t - r.st[i]).sort((x, y) => x - y);
  const steps = []; for (let i = 1; i < r.pos.length; i++) { const p = r.pos[i], q = r.pos[i - 1]; if (Number.isFinite(p[1]) && Number.isFinite(q[1])) steps.push(Math.hypot(p[1] - q[1], p[2] - q[2])); }
  const ss = steps.slice().sort((x, y) => x - y), still = steps.filter(v => v < 0.01).length, jumps = steps.filter(v => v > 60).length;
  return { copies: r.st.length, maxGap: Math.round(gaps[gaps.length - 1] || 0), p95Gap: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0), medGap: Math.round(gaps[gaps.length >> 1] || 0),
    noW: r.nw || 0, pos5: r.pos[5], frames: r.pos.length, medStep: +(ss[ss.length >> 1] || 0).toFixed(2), maxStep: +(ss[ss.length - 1] || 0).toFixed(2), stillFrames: still, jumps, gens: Array.from(r.gens) };
};

async function drive(A, ms) {   // the host moves about so there is something to draw
  const keys = ['ArrowRight', 'ArrowLeft'], t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < ms) { await A.keyboard.down(keys[k % 2]); await wait(700); await A.keyboard.up(keys[k % 2]); k++; }
}

(async () => {
  const browser = await L.launch();
  const out = {};
  try {
    for (const [kind, gameName] of [['tag', 'Tag'], ['slither', 'Worm Arena']]) {
      for (const hidden of [false, true]) {
        const label = kind + (hidden ? ' hidden host' : '');
        if (!want(kind) && !want(label.replace(' ', '-'))) continue;
        const br = await broker.start();
        const { A, B } = await room(browser, br, gameName, hidden);
        await wait(1500);
        if (kind === 'tag') {   // the host picks the first map
          for (let i = 0; i < 6 && await A.evaluate(() => window.ludusDebug.tag().phase) === 'menu'; i++) { await A.keyboard.press('Enter'); await wait(500); }
          await wait(2500);   // the countdown
        }
        if (hidden) await A.evaluate(() => { window.__throttle = true; });
        await B.evaluate(RECORD, kind);
        await drive(A, 8000);
        const r = await B.evaluate(REPORT);
        out[label] = r;
        console.log(label, JSON.stringify(r));
        check(label + ': state copies keep coming (>= 8 a second)', r.copies >= 64, r);
        check(label + ': no gap between state copies over 250 ms (max ' + r.maxGap + ' ms)', r.maxGap <= 250, r);
        check(label + ': the round never restarts', r.gens.length === 1, r);
        if (kind === 'tag') check(label + ': the host player moves smoothly on the guest (few still frames, at most 2 jumps: a tag or respawn)', r.jumps <= 2 && r.stillFrames < r.frames * 0.3, r);
        check(label + ': no page errors', errs([A, B]) === 0, [A.errors, B.errors]);
        for (const p of [A, B]) await p.context().close();
        br.close();
      }
    }
  } catch (e) { check('threw: ' + e.message, false); }
  await browser.close();
  console.log(L.results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
