// Hammer Climb: the long sky and the fall into the void.
// Run: node QA/harness/run.js QA/climb-fall.js [--dark] [--shot out.png] [--init mode.js]
// mode.js sets window.__FALLMODE:
//   'reach'  : every sky gap measured (edge gap, rise) and a hammer-motion search shows each rock can be reached
//   'sky'    : stands on a rock in the sky stages (screenshot there)
//   'mid'    : falls off a high rock and returns mid warp (screenshot of the warp)
//   default  : falls off a high rock, waits for the warp back to the start, checks the run restarted and still plays
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mode = window.__FALLMODE || 'fall';
  const g = Ludus.games.find(x => x.id === 'climb'), R = g._rules;
  if (mode === 'reach') {
    const w = R.makeWorld(), f = w.deco.floats, out = { summitY: Math.round(w.summit.y), skyY: Math.round(w.skyY), rocks: f.length, marks: w.marks.map(m => m.name), gaps: [] };
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const settle = (x, y) => { const s = R.newState({ x, y }); for (let i = 0; i < 480; i++) R.step(w, s, { x: 40, y: -6 }, R.STEP); return s; };
    const tryGap = (from, to, tw) => {
      const s0 = settle(from[0], from[1] + 4);
      if (!s0.ground) return -1;
      for (let t = 0; t < 900; t++) {
        const keys = []; for (let k = 0; k < 7; k++) keys.push([rnd() * Math.PI * 2 - Math.PI, 30 + rnd() * 50]);
        const s = JSON.parse(JSON.stringify(s0)), n = Math.round(2.2 / R.STEP);
        for (let i = 0; i < n; i++) {
          const tt = i / n * 6, k = Math.floor(tt), fr = tt - k, a = keys[k], b = keys[Math.min(6, k + 1)];
          const ang = a[0] + (b[0] - a[0]) * fr, len = a[1] + (b[1] - a[1]) * fr;
          R.step(w, s, R.clampArm(Math.cos(ang) * len, Math.sin(ang) * len), R.STEP);
        }
        if (s.ground && s.p.y > to[1] - 10 && Math.abs(s.p.x - to[0]) < tw / 2 + 4) return t + 1;
      }
      return 0;
    };
    // the cliff top to rock 1, then rock to rock up to the summit
    const pts = [[w.cliff - 30, w.skyY, 60]].concat(f.map(q => [q[0], q[1], q[2]]));
    for (let j = 0; j + 1 < pts.length; j++) {
      const a = pts[j], b = pts[j + 1], edge = Math.round((b[0] - b[2] / 2) - (a[0] + a[2] / 2));
      const tries = tryGap([a[0] + a[2] / 2 - 22, a[1]], [b[0], b[1]], b[2]);
      out.gaps.push([edge, Math.round(b[1] - a[1]), tries]);
    }
    out.allReached = out.gaps.every(q => q[2] > 0);
    out.maxEdgeGap = Math.max(...out.gaps.map(q => q[0])); out.maxTries = Math.max(...out.gaps.map(q => q[2]));
    // nothing under the sky: straight down from each rock's right edge is open air to the bottom of the world
    out.emptyBelow = f.every(q => { for (let y = q[1] - 80; y > R.FALLY; y -= 20) if (R.probe(w, q[0] + q[2] / 2 + 40, y, 16).hit) return false; return true; });
    return out;
  }
  window.ludusDebug = window.ludusDebug || {}; Ludus.state.introDone = true; window.ludusOpenGame('climb'); await wait(800);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); await wait(100);
  for (let i = 0; i < 20 && !(g._peek().time > 0.3); i++) await wait(150);
  let pk = g._peek(); const f = pk.world.deco.floats;
  // stand on a rock high in the sky (Thin air), so Best is well up the course
  const j = Math.min(f.length - 1, 50), rock = f[j];
  pk.teleport(rock[0], rock[1] + 17); await wait(700);
  pk = g._peek();
  const out = { onRock: { y: Math.round(pk.s.p.y), ground: pk.s.ground, maxP: Math.round(pk.maxP), state: pk.state }, section: pk.reached };
  if (mode === 'sky') { pk.teleport(f[16][0] - 10, f[16][1] + 17); await wait(900); out.state = g._peek().state; return out; }
  // step off into the void, to the right of the rock
  pk.teleport(rock[0] + rock[2] / 2 + 60, rock[1] + 40);
  const t0 = performance.now(), camYs = [];
  let warpAt = 0;
  while (performance.now() - t0 < 20000) {
    await wait(50); pk = g._peek(); camYs.push(Math.round(pk.cam.y - pk.s.p.y));
    if (pk.state === 'warp') { warpAt = performance.now() - t0; break; }
  }
  out.fellFor = Math.round(warpAt); out.warpFrom = pk.warpFrom && { x: Math.round(pk.warpFrom.x), y: Math.round(pk.warpFrom.y) };
  out.camFollows = camYs.every(d => Math.abs(d) < 1);
  if (mode === 'mid') { await wait(250); out.state = g._peek().state; return out; }
  for (let i = 0; i < 40 && g._peek().state !== 'play'; i++) await wait(100);
  pk = g._peek();
  out.after = { state: pk.state, x: Math.round(pk.s.p.x), y: Math.round(pk.s.p.y), maxP: Math.round(pk.maxP), bestP: Math.round(pk.bestP), time: +pk.time.toFixed(2), reached: pk.reached };
  // still playable: a held arrow key swings the hammer and the clock runs
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); await wait(600); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
  pk = g._peek(); out.after.time2 = +pk.time.toFixed(2); out.after.aimA = +pk.aim.a.toFixed(2);
  out.ok = !!warpAt && out.camFollows && out.after.state === 'play' && Math.abs(out.after.x - R.START.x) < 30 && out.after.y < 60 && out.after.maxP === 0 && out.after.bestP >= out.onRock.maxP && out.after.time2 > out.after.time;
  return out;
}
