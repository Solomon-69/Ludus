// Hammer Climb starts: open it fresh, then a real mouse press on the "Normal" mountain card must begin the climb.
// Used by windows/ci (cdp-probe.mjs, real WebView2 input) and the Mac harness. Returns the click point and a check.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  Ludus.state.saves = {}; delete Ludus.state.climbDiff;
  ludusOpenGame('climb'); await wait(900);
  const c = [...document.querySelectorAll('canvas')].find(x => x.getBoundingClientRect().width > 100);
  if (!c) return { error: 'no canvas' };
  const r = c.getBoundingClientRect(), w = r.width, h = r.height;
  const cw = Math.min(w - 32, 340), ch = Math.max(46, Math.min(58, (h - 170) / 4 - 10)), total = 64 + 4 * (ch + 10) + 26, top = Math.max(12, (h - total) / 2);
  const x = Math.round(r.left + w / 2), y = Math.round(r.top + top + 64 + (ch + 10) + ch / 2);
  const hit = document.elementFromPoint(x, y);
  return { click: [x, y], canvas: [r.left, r.top, w, h], hitIsCanvas: hit === c, hit: hit && hit.tagName + '#' + hit.id + '.' + hit.className,
    screen: document.body.dataset.screen || null,
    then: 'async () => ({ started: Ludus.state.climbDiff === "normal", diff: Ludus.state.climbDiff || null })' };
}
