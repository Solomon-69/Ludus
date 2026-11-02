// Turn Room: the two lessons and the first rooms made on the spot must be solvable. node rotate-solve.js
global.Ludus = { draw: new Proxy({}, { get: () => () => {} }), register: g => { global.G = g; } };
require('../../web/games/rotate.js');
let ok = true, ms = 0;
const rooms = G._levels.slice();
for (let n = 2; n < 40; n++) { const t = Date.now(); rooms.push(G._gen(12345, n)); ms = Math.max(ms, Date.now() - t); }
rooms.forEach((rows, i) => {
  const s = G._solve(G._parse(rows));
  console.log('room ' + (i + 1), s ? `solvable, ${s.turns} turn(s)` : 'NOT SOLVABLE');
  if (!s) ok = false;
});
console.log('slowest room to make: ' + ms + ' ms');
process.exit(ok ? 0 : 1);
