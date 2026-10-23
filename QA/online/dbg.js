const L = require('./lib.js'); const { broker, wait, party, hold } = L;
(async () => {
  const b = await L.launch(), br = await broker.start();
  const { pages: [A, B] } = await party(b, br, 'Air Hockey', 2); await wait(800);
  br.latency = { base: 150, jitter: 150 };
  await B.evaluate(() => { window.__ws = []; (function f() { const m = ludusDebug.hockey().m1; window.__ws.push([Math.round(performance.now()), Math.round(m.x), Math.round(m.y)]); requestAnimationFrame(f); })(); });
  await wait(300); await hold(A, 'd', 900); await wait(300);
  const ws = await B.evaluate(() => window.__ws); let prev = null;
  console.log(ws.filter((p, i) => i % 3 === 0).map(p => p[1] + ',' + p[2]).join(' '));
  process.exit(0);
})();
