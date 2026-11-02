// Turn Room: every room must be solvable (and say how many turns it takes). node rotate-solve.js
global.Ludus = { draw: new Proxy({}, { get: () => () => {} }), register: g => { global.G = g; } };
require('../../web/games/rotate.js');
let ok = true;
G._levels.forEach((rows, i) => {
  const m = G._parse(rows), s = G._solve(m);
  console.log('room ' + (i + 1), s ? `solvable, ${s.turns} turn(s)` : 'NOT SOLVABLE');
  if (!s) ok = false;
});
process.exit(ok ? 0 : 1);
