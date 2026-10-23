// Hammer Climb: swinging the hammer in the air must not push the pot (it used to: swing up = pushed down, which
// killed long jumps). Run with QA/online/run.js QA/climb-air.js
async () => {
  const g = Ludus.games.find(x => x.id === 'climb'), R = g._rules;
  const world = R.makeWorld(1);
  // a spot in open air, well clear of the mountain
  let at = null;
  for (let y = 900; y < 9000 && !at; y += 100) for (let x = -600; x < 900 && !at; x += 100) if (!R.probe(world, x, y, 700).hit && !R.probe(world, x + 300, y + 200, 700).hit) at = { x, y };
  if (!at) return { ok: false, why: 'no open air found' };
  const fly = (swing, steps) => {
    const s = R.newState(at); s.ground = false; s.hc = false; s.v.x = 320; s.v.y = 380; s.o = { x: 40, y: -6 }; s.h = { x: at.x + 40, y: at.y - 6 };
    let hits = 0;
    for (let i = 0; i < steps; i++) {
      const k = i * R.STEP;
      const T = swing ? R.clampArm(Math.cos(k * 9) * 78, Math.sin(k * 9) * 78 + (i % 60 < 30 ? 60 : -60)) : { x: 40, y: -6 };
      R.step(world, s, T, R.STEP); if (s.hc || s.ground) hits++;
    }
    return { p: s.p, v: s.v, hits };
  };
  const N = Math.round(0.45 / R.STEP);   // 0.45 s of flight
  const a = fly(false, N), b = fly(true, N);
  const dv = Math.hypot(a.v.x - b.v.x, a.v.y - b.v.y), dp = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
  // the jump distance: where the pot comes back down to its take-off height
  const land = swing => { const s = R.newState(at); s.ground = false; s.v.x = 320; s.v.y = 380; let i = 0; do { const k = i * R.STEP; R.step(world, s, swing ? R.clampArm(Math.cos(k * 9) * 78, Math.sin(k * 9) * 78) : { x: 40, y: -6 }, R.STEP); i++; } while (s.p.y > at.y && i < 5000 && !s.hc && !s.ground); return s.p.x - at.x; };
  const d0 = land(false), d1 = land(true);
  return { ok: a.hits === 0 && b.hits === 0 && dv < 0.5 && dp < 0.5 && Math.abs(d0 - d1) < 0.01 * Math.abs(d0), at, dv, dp, d0, d1, hits: [a.hits, b.hits] };
}
