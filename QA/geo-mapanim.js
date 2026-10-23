// Geo Guess small map: expand/contract 30 times. The pin-bar label is decided from the final size (never swaps
// mid-animation, never empty), and the map moves smoothly (no back-and-forth jitter of the tiles between frames).
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await wait(1500);
  for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await wait(500);
  document.querySelector('.geo-go').click();
  for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await wait(500);
  await wait(1500);
  const mini = document.querySelector('.geo-mini'), b = document.querySelector('.geo-guess');
  const labels = new Set(), swapsMid = [], rev = [];
  for (let k = 0; k < 30; k++) {
    const open = k % 2 === 0;
    mini.dispatchEvent(new PointerEvent(open ? 'pointerenter' : 'pointerleave', { pointerType: 'mouse' }));
    if (!open) await wait(450);   // the close waits 450 ms after the pointer leaves
    const seen = [], pos = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 420) {
      await new Promise(r => requestAnimationFrame(r));
      seen.push(b.textContent); labels.add(b.textContent);
      const tile = document.querySelector('.geo-minimap .leaflet-tile-loaded') || document.querySelector('.geo-minimap .leaflet-tile');
      if (tile) { const r = tile.getBoundingClientRect(); pos.push([r.left, r.top]); }
    }
    if (new Set(seen).size > 1) swapsMid.push(k + ':' + [...new Set(seen)].join('|'));
    for (let i = 2; i < pos.length; i++) for (const d of [0, 1]) { const a = pos[i - 1][d] - pos[i - 2][d], c = pos[i][d] - pos[i - 1][d]; if (Math.abs(a) > 0.6 && Math.abs(c) > 0.6 && Math.sign(a) !== Math.sign(c)) rev.push(k); }
  }
  const okLabels = [...labels].every(t => t === 'Place your pin' || t === 'Place your pin on the map');
  return { pass: okLabels && swapsMid.length === 0 && rev.length === 0, labels: [...labels], swapsMid: swapsMid.slice(0, 5), jitter: rev.length };
}
