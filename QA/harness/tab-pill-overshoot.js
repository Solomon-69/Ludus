// Sliding tab pill never overshoots: sample the pill every frame during All -> Online and Online -> All (and with the
// tab row scrolled the other way first). It must stay between where it started and the target tab, never past the
// target tab's edges, and end exactly on it.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), f = document.getElementById('filters'), out = [];
  const chips = () => [...f.querySelectorAll('.chip')], pill = () => f.querySelector('.tab-pill');
  async function move(from, to, tag, scroll) {
    from.click(); await wait(700);
    if (scroll != null) { f.scrollLeft = scroll; await wait(60); }
    const s = pill().getBoundingClientRect(); let worst = 0, frames = 0;
    to.click();
    const t0 = performance.now();
    while (performance.now() - t0 < 900) {
      await new Promise(r => requestAnimationFrame(r)); frames++;
      const p = pill().getBoundingClientRect(), t = to.getBoundingClientRect();   // the row may be scrolling too: compare in row space
      const lo = Math.min(s.left - (performance.now() - t0 < 1 ? 0 : 0), t.left), hi = Math.max(t.right, 0);
      const pastL = t.left > s.left ? 0 : Math.max(0, t.left - p.left);        // moving left: must not go left of target
      const pastR = t.left > s.left ? Math.max(0, p.right - t.right) : 0;      // moving right: must not go right of target
      worst = Math.max(worst, pastL, pastR);
    }
    const p = pill().getBoundingClientRect(), t = to.getBoundingClientRect();
    if (worst > 0.5) out.push(`${tag}: overshoot ${worst.toFixed(1)}px`);
    if (Math.abs(p.left - t.left) > 1 || Math.abs(p.width - t.width) > 1) out.push(`${tag}: ends off target`);
    return { frames, worst: +worst.toFixed(2) };
  }
  await wait(500);
  const c = chips(), first = c[0], last = c[c.length - 1];
  const r = {
    allToOnline: await move(first, last, 'All->' + last.textContent),
    onlineToAll: await move(last, first, last.textContent + '->All'),
    scrolledAllToOnline: await move(first, last, 'scrolled All->last', 0),
    scrolledOnlineToAll: await move(last, first, 'scrolled last->All', 99999),
  };
  return { problems: out, r, last: last.textContent };
}
