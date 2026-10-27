// Hammer Climb: can each kind of step on the new mountain actually be climbed with the real physics?
// For a few hard spots, a simple search tries hammer motions (keyframed aim, like a player sweeping the mouse) from just
// before the step and reports whether the pot gets on top. Run: node QA/harness/run.js QA/climb-reach.js
async () => {
  const g = Ludus.games.find(x => x.id === 'climb'), R = g._rules, w = R.makeWorld(+(window.__DI ?? 1));
  const rt = w.route, out = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function settle(x, y) { const s = R.newState({ x, y }); for (let i = 0; i < 480; i++) R.step(w, s, { x: 40, y: -6 }, R.STEP); return s; }
  function run(s0, keys, dur) {
    const s = JSON.parse(JSON.stringify(s0)); let best = -1e9, bx = 0;
    const n = Math.round(dur / R.STEP);
    for (let i = 0; i < n; i++) {
      const t = i / n * (keys.length - 1), k = Math.floor(t), f = t - k, a = keys[k], b = keys[Math.min(keys.length - 1, k + 1)];
      const ang = a[0] + (b[0] - a[0]) * f, len = a[1] + (b[1] - a[1]) * f;
      R.step(w, s, R.clampArm(Math.cos(ang) * len, Math.sin(ang) * len), R.STEP);
      if ((s.ground || s.hc) && s.p.y > best) { best = s.p.y; bx = s.p.x; }
    }
    return { s, best, bx };
  }
  function trySpot(name, from, goal, tries) {
    const s0 = settle(from[0], from[1] + 4); let hit = null, bestY = -1e9;
    for (let t = 0; t < tries && !hit; t++) {
      const keys = []; for (let k = 0; k < 7; k++) keys.push([rnd() * Math.PI * 2 - Math.PI, 30 + rnd() * 50]);
      const r = run(s0, keys, 2.2);
      bestY = Math.max(bestY, r.s.p.y);
      if (r.s.ground && r.s.p.y > goal[1] - 30 && Math.abs(r.s.p.x - goal[0]) < 260) hit = t + 1;
    }
    out.push({ name, from: from.map(Math.round), goalY: Math.round(goal[1]), climbed: !!hit, tries: hit, bestY: Math.round(bestY) });
  }
  const P = i => rt[Math.min(rt.length - 1, i)];
  trySpot('pit boulder', [P(0)[0] + 70, 16], P(1), 400);
  trySpot('shelf to pipe 1', [P(2)[0] + 160, P(2)[1]], P(3), 400);
  trySpot('pipe 1 to pipe 2', [P(3)[0] + 60, P(3)[1]], P(4), 400);
  trySpot('orange step', [P(7)[0] + 40, P(7)[1]], P(8), 400);
  const m = w.marks.find(x => x.name === 'The mountain'), mi = rt.findIndex(q => q[0] > m.x + 100);
  trySpot('mountain step', [rt[mi][0] - 10, rt[mi][1]], rt[mi + 1], 400);
  return out;
}
