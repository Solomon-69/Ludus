/* Air Hockey vs Bot: the puck dropped (still or slow) into each of the 4 rink corners and along the bot's walls, with the bot
   mallet placed in awkward spots, over many seeds. The puck must leave the corner within 3 s every time.
   Run (both layouts): node QA/harness/run.js QA/hockey-corner.js --size compact   (and --size wide)
   Layout comes from window.__hockeyWide (true = side-on, false = vertical); the test runs both when it is unset. */
(async function hockeyCorner() {
  window.ludusDebug = window.ludusDebug || {};
  window.ludusRevealMs = 0;
  const realNow = performance.now.bind(performance);
  let skew = 0; performance.now = () => realNow() + skew;
  const timers = new Map(); let tid = 9e6;
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.set(id, { fn, due: performance.now() + (ms || 0), a }); return id; };
  window.clearTimeout = id => { timers.delete(id); };
  window.setInterval = (fn, ms, ...a) => { const id = tid++; timers.set(id, { fn, due: performance.now() + (ms || 0), a, every: Math.max(1, ms || 1) }); return id; };
  window.clearInterval = window.clearTimeout;
  const frames = new Map(); let fid = 1;
  window.requestAnimationFrame = cb => { const id = fid++; frames.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  const errors = [];
  function advance(sec, step = 1 / 60) {
    const n = Math.max(1, Math.round(sec / step));
    for (let i = 0; i < n; i++) {
      skew += step * 1000;
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
  // seeded randomness so every run is repeatable
  let seed = 1;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const $ = id => document.getElementById(id);
  const D = () => window.ludusDebug;
  function open(wide) {
    Ludus.state.orient = Object.assign({}, Ludus.state.orient, { hockey: wide });
    Ludus.state.vs = Object.assign({}, Ludus.state.vs, { hockey: 'bot' });
    ludusOpenGame('hockey'); advance(1.2);
  }
  const results = [];
  const layouts = typeof window.__hockeyWide === 'boolean' ? [window.__hockeyWide] : [true, false];
  for (const wide of layouts) {
    open(wide);
    const g0 = D().hockey();
    const r = { layout: wide ? 'horizontal' : 'vertical', H: g0.H, flat: g0.flat, trials: 0, fails: [], worst: 0 };
    const W = g0.W;
    for (let s = 1; s <= 60; s++) {
      for (let c = 0; c < 6; c++) {
        seed = s * 7919 + c * 104729;
        const g = D().hockey(), H = g.H;
        if (!$('overSheet').hidden) { $('againBtn').click(); advance(0.5); }
        // corners 0..3 = bot top-left, bot top-right, player bottom-left, player bottom-right; 4, 5 = bot side walls mid-half
        const j = Math.random() * 6;
        const spots = [[14 + j, 14 + j], [W - 14 - j, 14 + j], [14 + j, H - 14 - j], [W - 14 - j, H - 14 - j], [13, H * 0.25 + j * 5], [W - 13, H * 0.3 - j * 5]];
        const [x, y] = spots[c];
        // the corner (or wall point) the puck has to get away from
        const cx = c < 4 ? (x < W / 2 ? 0 : W) : x, cy = c < 4 ? (y < H / 2 ? 0 : H) : y;
        const ang = Math.random() * Math.PI * 2, sp = Math.random() * 40;
        D().hockeySet(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp);
        // bot mallet somewhere awkward: right on top of the puck (pinning it), or near its goal, or mid half
        const k = Math.floor(Math.random() * 3);
        if (D().hockeyBot && y < H / 2) {
          if (k === 0) D().hockeyBot(x + (x < W / 2 ? 34 : -34) * Math.random(), y + 33);
          else if (k === 1) D().hockeyBot(W / 2, 40); else D().hockeyBot(W / 2 + (Math.random() - 0.5) * 200, H * 0.35);
        }
        r.trials++;
        let left = null;
        for (let t = 0; t < 3; t += 1 / 60) {
          advance(1 / 60);
          const d = D().hockey();
          if (d.phase !== 'play' || Math.hypot(d.puck.x - cx, d.puck.y - cy) > 80) { left = t; break; }
        }
        if (left === null) { const d = D().hockey(); r.fails.push({ seed: s, corner: c, puck: [Math.round(d.puck.x), Math.round(d.puck.y)], bot: [Math.round(d.m2.x), Math.round(d.m2.y)] }); }
        else r.worst = Math.max(r.worst, +left.toFixed(2));
        // let the rally settle before the next drop
        advance(0.3);
      }
    }
    r.failCount = r.fails.length; r.fails = r.fails.slice(0, 6);
    r.pass = !r.fails.length;
    results.push(r);
    $('backBtn').click(); advance(0.5);
  }
  return { pass: results.every(r => r.pass) && !errors.length, results, errors: errors.slice(0, 5) };
})
