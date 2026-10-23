// Geo Guess guess map: zoom in and out 40 times with the wheel; count frames where part of the map shows no loaded
// tile (a blank / flashing area). Target: none above 5 %.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await wait(1500);
  for (let i = 0; i < 40 && !(ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await wait(500);
  document.querySelector('.geo-go').click();
  for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await wait(500);
  const mini = document.querySelector('.geo-mini'); mini.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  await wait(800); ludusGeoTest.view(48.85, 2.35, 4); await wait(3000);
  const box = document.querySelector('.geo-mapbox').getBoundingClientRect(), el = document.querySelector('.geo-minimap');
  const pts = []; for (let i = 1; i < 10; i++) for (let j = 1; j < 7; j++) pts.push([box.left + box.width * i / 10, box.top + box.height * j / 7]);
  const covered = () => {
    const rects = [...el.querySelectorAll('.leaflet-tile.leaflet-tile-loaded')].filter(t => {
      for (let e = t; e && e !== el; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.9) return false; }
      return true;
    }).map(t => t.getBoundingClientRect());
    let miss = 0;
    for (const [x, y] of pts) if (!rects.some(q => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom)) miss++;
    return miss / pts.length;
  };
  const badZ = []; let frames = 0, bad = 0, worst = 0, run = true;
  (async () => { while (run) { await new Promise(r => requestAnimationFrame(r)); const m = covered(); frames++; worst = Math.max(worst, m); if (m > 0.05) { bad++; if (badZ.length < 40) { const t = document.querySelector('.geo-minimap .leaflet-proxy'); badZ.push(Math.round((t ? Math.log2(new DOMMatrix(getComputedStyle(t).transform).a) + 1 : 0) * 10) / 10 + ':' + Math.round(m * 100)); } } } })();
  const r = el.getBoundingClientRect();
  for (let k = 0; k < 40; k++) {
    const dy = k % 4 < 2 ? -120 : 120;   // two clicks in, two out
    for (let i = 0; i < 3; i++) { el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, clientX: r.left + r.width * 0.55, clientY: r.top + r.height * 0.45, bubbles: true, cancelable: true })); await wait(40); }
    await wait(260);
  }
  await wait(1500); run = false; await wait(50);
  return { pass: bad === 0, frames, badFrames: bad, worstBlank: Math.round(worst * 100) + '%', badZ };
}
