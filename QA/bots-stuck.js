/* Bot stuck test. Every vs Bot game gets about a minute of simulated play with the bot dropped into awkward spots
   (corners), and must keep making progress: no stall longer than a few seconds, no bot circling in place.
   Run: cd /tmp/lx-online && NODE_PATH=<playwright-core parent> node QA/harness/run.js QA/bots-stuck.js --size compact
   Option: set window.__botsOnly = ['pong', ...] before (or use --init) to run only some games. Fully headless: time is
   simulated (fake clock for frames and timers), so a minute of play takes a few real seconds and nothing is audible. */
(async function botsStuck() {
  window.ludusDebug = window.ludusDebug || {};
  window.ludusRevealMs = 0;
  const realSetTimeout = window.setTimeout.bind(window);
  const realWait = ms => new Promise(r => realSetTimeout(r, ms));
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', e => errors.push(String(e.reason || e)));

  // ---------- simulated clock: frames and timers run on a virtual timeline we advance by hand ----------
  const realNow = performance.now.bind(performance);
  let skew = 0;
  performance.now = () => realNow() + skew;
  const timers = new Map(); let tid = 9e6;
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.set(id, { fn, due: performance.now() + (ms || 0), a }); return id; };
  window.clearTimeout = id => { timers.delete(id); };
  window.setInterval = (fn, ms, ...a) => { const id = tid++; timers.set(id, { fn, due: performance.now() + (ms || 0), a, every: Math.max(1, ms || 1) }); return id; };
  window.clearInterval = window.clearTimeout;
  const frames = new Map(); let fid = 1;
  window.requestAnimationFrame = cb => { const id = fid++; frames.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  let fakeT = 0;   // seconds advanced
  function advance(sec, step = 1 / 30) {
    const n = Math.max(1, Math.round(sec / step));
    for (let i = 0; i < n; i++) {
      skew += step * 1000; fakeT += step;
      const now = performance.now();
      for (const [id, t] of [...timers]) {
        if (!timers.has(id) || t.due > now) continue;
        if (t.every) t.due = now + t.every; else timers.delete(id);
        try { t.fn(...t.a); } catch (e) { errors.push('timer: ' + (e.stack || e)); }
      }
      const cbs = [...frames.values()]; frames.clear();
      for (const cb of cbs) { try { cb(now); } catch (e) { errors.push('frame: ' + (e.stack || e)); } }
    }
  }
  const $ = id => document.getElementById(id);
  const overUp = () => !$('overSheet').hidden;
  function again() { if (overUp()) { $('againBtn').click(); advance(0.4); return true; } return false; }
  async function openFresh(id) {
    if (!$('backBtn').closest('[hidden]') && document.getElementById('stage') && $('backBtn').offsetParent) { try { $('backBtn').click(); } catch (e) {} advance(0.4); }
    ludusOpenGame(id); advance(0.8); again();
  }
  const canvasClick = (x, y) => {
    const c = document.querySelector('#stage canvas'), r = c.getBoundingClientRect(), px = r.left + x, py = r.top + y;
    const base = { clientX: px, clientY: py, bubbles: true, pointerId: 1, button: 0, buttons: 1, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', base)); c.dispatchEvent(new MouseEvent('mousedown', base));
    c.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 }))); c.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 }))); c.dispatchEvent(new MouseEvent('click', base));
  };
  const key = (k, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: k, bubbles: true }));
  const tap = k => { key(k, true); key(k, false); };

  // ---------- checks ----------
  const same = (a, b, eps) => a.length === b.length && a.every((v, i) => typeof v === 'number' ? Math.abs(v - b[i]) <= eps : v === b[i]);
  // Real-time games: run `secs` of play; `tick(t)` may teleport the bot into a corner; fail on a stall or on a bot that stays boxed in.
  async function realtime(g) {
    const r = { id: g.id, mode: 'realtime', pass: true, problems: [] };
    try {
      await openFresh(g.id);
      if (g.start) await g.start();
      let prev = null, lastChange = fakeT, maxStall = 0, changes = 0, t0 = fakeT;
      const hist = new Map();   // bot id -> [{t,x,y,alive}]
      let nextTp = 0;
      while (fakeT - t0 < (g.secs || 60)) {
        advance(0.5);
        if (again() && g.start) await g.start();   // a new round after the game ended
        const t = fakeT - t0;
        if (g.tp && t >= nextTp) { nextTp = t + (g.tpEvery || 20); try { g.tp(Math.floor(t / (g.tpEvery || 20))); } catch (e) { r.problems.push('tp: ' + e.message); } hist.clear(); lastChange = fakeT; }
        const sig = g.progress();
        if (!prev || !same(sig, prev, g.eps || 0.5)) { changes++; lastChange = fakeT; prev = sig; }
        if (fakeT - lastChange > maxStall) { maxStall = fakeT - lastChange; r.stallAt = Math.round(t) + ' s: ' + JSON.stringify(sig.map(v => typeof v === 'number' ? Math.round(v * 10) / 10 : v)) + (g.phase ? ' ' + g.phase() : ''); }
        if (g.bots) for (const b of g.bots()) {
          const h = hist.get(b.id) || []; hist.set(b.id, h);
          h.push({ t, x: b.x, y: b.y, alive: b.alive !== false });
          while (h.length && t - h[0].t > g.win) h.shift();
        }
      }
      r.maxStallSec = +maxStall.toFixed(1); r.changes = changes;
      if (maxStall > (g.stall || 3.5)) r.problems.push('no progress for ' + maxStall.toFixed(1) + ' s');
      if (changes < (g.minChanges || 5)) r.problems.push('only ' + changes + ' changes');
      if (g.bots && g.win) {
        // confinement: over the last window, was any bot (alive the whole time) stuck inside a tiny box?
        let worst = 1e9, worstId = null;
        for (const [id, h] of hist) {
          if (h.length < 4 || h[h.length - 1].t - h[0].t < g.win * 0.9 || !h.every(p => p.alive)) continue;
          const xs = h.map(p => p.x), ys = h.map(p => p.y), ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          if (ext < worst) { worst = ext; worstId = id; }
        }
        r.minExtent = worst === 1e9 ? null : Math.round(worst);
        if (worst < g.minExt) r.problems.push('bot ' + worstId + ' stayed inside a ' + Math.round(worst) + ' box for ' + g.win + ' s');
      }
    } catch (e) { r.problems.push('threw: ' + (e.stack || e).toString().slice(0, 300)); }
    r.pass = !r.problems.length; return r;
  }
  // Turn-based games: play random moves for the person; the bot must answer within `lat` seconds every time.
  async function turnBased(g) {
    const r = { id: g.id, mode: 'turns', pass: true, problems: [] };
    try {
      await openFresh(g.id);
      const H = () => window.ludusDebug.botTest;
      let replies = 0, maxLat = 0, t0 = fakeT, guard = 0;
      while (fakeT - t0 < (g.secs || 90) && replies < (g.moves || 25) && guard++ < 4000) {
        advance(0.25);
        if (again()) continue;
        const s0 = H().state();
        if (s0.phase !== 'play' || s0.turn !== 'me') continue;
        if (!H().play()) continue;
        const s1 = H().state(), tm = fakeT; let done = false;
        // wait for the bot's answer: it is my turn again, or the game moved on (round/game ended)
        let tChg = tm, prevN = s1.n;
        while (fakeT - tChg < (g.lat || 3.5) + 4) {
          advance(0.1);
          const s = H().state();
          if (s.n !== prevN) { prevN = s.n; tChg = fakeT; }   // the bot may chain several moves; each one counts as progress
          if (overUp() || (s.turn === 'me' && s.phase === 'play' && s.n !== s1.n) || s.phase !== 'play' || (g.fresh && g.fresh(s, s1))) { done = true; break; }
          if (s.turn === 'me' && s.phase === 'play' && s.n === s1.n && fakeT - tm > 0.3) { /* my move was refused; try another */ done = true; break; }
        }
        const lat = fakeT - tChg; maxLat = Math.max(maxLat, lat);
        if (!done || lat > (g.lat || 3.5)) { r.problems.push('bot took ' + lat.toFixed(1) + ' s to answer (state ' + JSON.stringify(H().state()) + ')'); break; }
        replies++;
      }
      r.replies = replies; r.maxReplySec = +maxLat.toFixed(1);
      if (replies < Math.min(8, g.moves || 25) && !r.problems.length) r.problems.push('only ' + replies + ' bot replies');
    } catch (e) { r.problems.push('threw: ' + (e.stack || e).toString().slice(0, 300)); }
    r.pass = !r.problems.length; return r;
  }

  // ---------- the games ----------
  const D = () => window.ludusDebug;
  const bt = () => D().botTest.state();
  const games = [];
  games.push({ id: 'pong', kind: 'rt', secs: 60, stall: 3.5, minChanges: 20,
    progress: () => { const d = D().pong(); return [d.score.p1, d.score.p2, d.ball.x, d.ball.y, d.p2]; }, eps: 0.5,
    tp: n => { const d = D().pong(); D().pongSet({ x: d.W - 8, y: n % 2 ? d.H - 8 : 8, vx: -0.05, vy: n % 2 ? -0.05 : 0.05 }); } });
  // Air Hockey: the puck dropped still into the bot's corners (the bot used to pin it there and the game stalled)
  games.push({ id: 'hockey', kind: 'rt', secs: 60, stall: 3.5, minChanges: 20,
    progress: () => { const d = D().hockey(); return [d.score.p1, d.score.p2, d.puck.x, d.puck.y]; }, eps: 0.5,
    tp: n => { const d = D().hockey(); D().hockeySet(n % 2 ? 14 : d.W - 14, 14, 0, 0); } });
  games.push({ id: 'tag', kind: 'rt', secs: 60, stall: 3.5, win: 10, minExt: 30,
    start: async () => { const d = D().tag(); if (d.phase === 'menu' && d.menu && d.menu[0]) { const t = d.menu[0]; canvasClick(t[0] + t[2] / 2, t[1] + t[3] / 2); advance(0.2); canvasClick(t[0] + t[2] / 2, t[1] + t[3] / 2); advance(2.5); } },
    progress: () => { const d = D().tag(); return [d.round, ...d.ps.flatMap(p => [p.x, p.y])]; },
    bots: () => { const d = D().tag(); const p = d.ps[1]; return p ? [{ id: 'bot', x: p.x, y: p.y, alive: !p.dead }] : []; },
    phase: () => D().tag().phase + ' ps=' + D().tag().ps.length,
    tp: n => { const d = D().tag(); D().tagTp('p2', n % 2 ? 30 : 690, 20); } });
  games.push({ id: 'slither', kind: 'rt', secs: 60, stall: 3.5, win: 12, minExt: 120,
    progress: () => { const d = D().slither(); return [d.humans, ...d.W.filter(w => !w.human && w.alive).slice(0, 6).flatMap(w => [w.px[0], w.py[0]])]; }, eps: 1,
    bots: () => D().slither().W.filter(w => !w.human).map(w => ({ id: w.idx, x: w.px[0], y: w.py[0], alive: w.alive })) });
  games.push({ id: 'paperio', kind: 'rt', secs: 60, stall: 3.5, win: 10, minExt: 3,
    start: async () => { D().paperio.start(); },
    progress: () => D().paperio.state().players.filter(p => !p.human).flatMap(p => [p.x, p.y]), eps: 0.2,
    bots: () => D().paperio.state().players.filter(p => !p.human).map(p => ({ id: p.id, x: p.x, y: p.y, alive: p.alive })),
    tp: n => { const st = D().paperio.state(); const bot = st.players.find(p => !p.human); D().paperio.place(bot.id, n % 2 ? 1.5 : st.N - 1.5, 1.5, 0); } });
  games.push({ id: 'holeio', kind: 'rt', secs: 60, stall: 3.5, win: 8, minExt: 60,
    start: async () => { advance(0.5); },
    progress: () => D().holeio().holes.flatMap(h => [h.x, h.y]), eps: 1,
    bots: () => { const d = D().holeio(), me = D().holeMe(); return d.holes.filter(h => !(me && Math.hypot(h.x - me.x, h.y - me.y) < 1)).map(h => ({ id: h.n, x: h.x, y: h.y, alive: h.alive })); },
    tp: n => { const d = D().holeio(); const me = D().holeMe(); const i = d.holes.findIndex(h => !(me && Math.hypot(h.x - me.x, h.y - me.y) < 1)); d._tp(i, n % 2 ? 40 : 3000, 40); } });
  for (const id of ['stickbrawl', 'finalpush', 'tanks']) games.push({ id, kind: 'rt', secs: 60, stall: 3.5, minChanges: 10,
    start: async () => { const h = D().botTest; if (h.begin) h.begin(); advance(0.3); tap(' '); },
    progress: () => D().botTest.state().sig, eps: 0.4, phase: () => D().botTest.state().phase,
    tp: n => { const h = D().botTest; if (id === 'finalpush') h.tp(n % 2 ? 4 : 640); else h.tp(30, 30); } });
  for (const id of ['fourup', 'ninesq', 'boxit', 'crossing', 'lastwire', 'wallrun']) games.push({ id, kind: 'turn', moves: 25, secs: 120 });
  games.push({ id: 'deadcentre', kind: 'turn', moves: 20, secs: 120, lat: 5 });
  games.push({ id: 'chess', kind: 'chess' });
  games.push({ id: 'popduel', kind: 'popduel' });

  const only = window.__botsOnly;
  const out = [];
  for (const g of games) {
    if (only && !only.includes(g.id)) continue;
    let r;
    if (g.kind === 'rt') r = await realtime(g);
    else if (g.kind === 'turn') r = await turnBased(g);
    else if (g.kind === 'chess') r = await chessTest();
    else r = await popduelTest();
    out.push(r);
    await realWait(5);
  }
  async function chessTest() {
    const r = { id: 'chess', mode: 'turns', pass: true, problems: [] };
    try {
      await openFresh('chess'); advance(0.5);
      let replies = 0, maxLat = 0;
      for (let k = 0, tries = 0; k < 14 && tries++ < 200; k++) {
        const s = D().chess();
        if (s.phase !== 'play' || s.side !== s.my) { advance(0.3); if (again()) { /* a fresh game */ } k--; continue; }
        // the person plays any legal move (first one the engine lists for our side)
        const mv = D().chessAny && D().chessAny();
        if (!mv) { r.problems.push('no chessAny hook'); break; }
        const n0 = D().chess().plies.length; let okMv = false; for (let q = 0; q < 12 && !(okMv = D().chessMove(mv)); q++) advance(0.3);
        const tm = fakeT;
        // the bot's worker answers in real time, so let real time pass as the simulated clock runs
        while (fakeT - tm < 12 && (D().chess().plies.length < n0 + 1 || D().chess().side !== D().chess().my) && !D().chess().ended) { advance(0.05); await realWait(30); }
        const lat = fakeT - tm; maxLat = Math.max(maxLat, lat);
        if ((D().chess().plies.length < n0 + 1 || D().chess().side !== D().chess().my) && !D().chess().ended) { r.problems.push('bot never answered within ' + lat.toFixed(1) + ' s ' + JSON.stringify(D().chess()).slice(0, 400) + ' mv=' + mv + ' ok=' + okMv); break; }
        replies++; advance(0.6);
      }
      r.replies = replies; r.maxReplySec = +maxLat.toFixed(1);
      if (maxLat > 6 && !r.problems.length) r.problems.push('bot took ' + maxLat.toFixed(1) + ' s to answer');
      if (replies < 6 && !r.problems.length) r.problems.push('only ' + replies + ' bot replies');
    } catch (e) { r.problems.push('threw: ' + (e.stack || e).toString().slice(0, 300)); }
    r.pass = !r.problems.length; return r;
  }
  async function popduelTest() {
    const r = { id: 'popduel', mode: 'realtime', pass: true, problems: [] };
    try {
      await openFresh('popduel');
      D().popduelCtl.startRun('duel'); advance(0.5);
      let last = null, lastChange = fakeT, maxStall = 0, maxTowers = 0;
      for (let k = 0; k < 160; k++) {   // 80 s
        advance(0.5);
        if (again()) { D().popduelCtl.startRun('duel'); advance(0.3); last = null; lastChange = fakeT; }
        const b = D().popduel().boards[1]; if (!b) continue;
        maxTowers = Math.max(maxTowers, b.towers.length);
        const sig = [b.towers.length, b.towers.join(',').length, b.wave, b.pops];
        if (!last || !same(sig, last, 0)) { last = sig; lastChange = fakeT; }
        maxStall = Math.max(maxStall, fakeT - lastChange);
      }
      const b = D().popduel().boards[1];
      r.maxStallSec = +maxStall.toFixed(1); r.botTowers = maxTowers; r.wave = b && b.wave;
      if (maxStall > 35) r.problems.push('bot built and upgraded nothing for ' + maxStall.toFixed(1) + ' s');
      if (maxTowers < 3) r.problems.push('bot built only ' + maxTowers + ' towers');
    } catch (e) { r.problems.push('threw: ' + (e.stack || e).toString().slice(0, 300)); }
    r.pass = !r.problems.length; return r;
  }
  return { pass: out.every(r => r.pass), games: out.map(r => ({ id: r.id, pass: r.pass, problems: r.problems, stats: Object.fromEntries(Object.entries(r).filter(([k]) => !['id', 'pass', 'problems', 'mode'].includes(k))) })), errors: errors.slice(0, 8), simulatedSeconds: Math.round(fakeT) };
})
