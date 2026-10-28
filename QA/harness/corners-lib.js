// Concentric corners check (shared): for every painted rounded box D whose corner sits inside the curve of its nearest
// painted rounded ancestor E (both insets smaller than E's corner radius), D's radius must be E's radius minus the inset
// (within 1px), and the two insets (side and top/bottom) must match (within 2px), so the curves run parallel.
// Pairs only count when the inner box is within 14px of both edges (further in, the curves no longer read as a pair).
// Not checked: game boards inside #stage (each game draws its own), round dots / icons up to 24px, the see-through
// .sheet backdrop (it only dims the window, the card on it is the box you see), and the bottom corners of a box that
// scrolls (its content runs on past the edge). Uneven insets are listed as warnings (window.__cornerWarn).
// window.__cornerScan(tag) returns a list of problems; window.__cornerPairs counts the pairs checked.
window.__cornerScan = function (tag) {
  const out = [];
  const painted = e => {
    const cs = getComputedStyle(e);
    if (e.tagName === 'IMG' || e.tagName === 'CANVAS') return true;
    const bg = cs.backgroundColor, sh = cs.boxShadow;
    return (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') || cs.backgroundImage !== 'none' || (sh && sh !== 'none');
  };
  const visible = e => {
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || a.hidden) return false; }
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const rad = (e, c, r) => Math.min(parseFloat(getComputedStyle(e)['border' + c + 'Radius']) || 0, r.width / 2, r.height / 2);
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const C = [['TopLeft', 'left', 'top'], ['TopRight', 'right', 'top'], ['BottomLeft', 'left', 'bottom'], ['BottomRight', 'right', 'bottom']];
  let pairs = 0;
  const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('.op-ghost, .grid-ghost, #stage') && !e.matches('.sheet') && visible(e) && painted(e));
  const set = new Set(all);
  for (const d of all) {
    const rd = d.getBoundingClientRect();
    if (Math.abs(rd.width - rd.height) < 1 && rd.width <= 24 && parseFloat(getComputedStyle(d).borderTopLeftRadius) >= rd.width / 2 - 0.5) continue;   // a small round dot or icon
    let e = d.parentElement; while (e && !(set.has(e) && C.some(([c]) => parseFloat(getComputedStyle(e)['border' + c + 'Radius']) > 0))) e = e.parentElement;
    if (!e) continue;
    const re = e.getBoundingClientRect();
    for (const [c, h, v] of C) {
      const R = rad(e, c, re); if (R < 3) continue;
      const dx = h === 'left' ? rd.left - re.left : re.right - rd.right, dy = v === 'top' ? rd.top - re.top : re.bottom - rd.bottom;
      if (dx < -0.5 || dy < -0.5 || dx >= R || dy >= R || Math.max(dx, dy) > 14) continue;   // this corner of D is not inside E's corner curve
      if (v === 'bottom' && e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') continue;
      // a box flush with the edge (inset 0) is clipped by the parent or meant to be: E must clip it (overflow hidden)
      const r = rad(d, c, rd); pairs++;
      if (Math.min(dx, dy) < 0.5) { if (getComputedStyle(e).overflow === 'visible' && Math.abs(r - R) > 1) out.push(`${tag}: ${name(d)} ${c} flush in ${name(e)} (r ${r.toFixed(1)} vs ${R.toFixed(1)}, no clip)`); continue; }
      const inset = (dx + dy) / 2, want = Math.max(0, R - inset);
      if (Math.abs(dx - dy) > 2) (window.__cornerWarn = window.__cornerWarn || []).push(`${tag}: ${name(d)} ${c} uneven inset in ${name(e)} (${dx.toFixed(1)} x ${dy.toFixed(1)})`);
      if (Math.abs(r - want) > 1) out.push(`${tag}: ${name(d)} ${c} r ${r.toFixed(1)} should be ${want.toFixed(1)} (${name(e)} R ${R.toFixed(1)} - inset ${inset.toFixed(1)})`);
    }
  }
  window.__cornerPairs = (window.__cornerPairs || 0) + pairs;
  return [...new Set(out)];
};
