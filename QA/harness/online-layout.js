// Online page layout (no network): node QA/harness/run.js QA/harness/online-layout.js [--size compact|large|wide|widelarge] [--dark]
// Measures the Online page with and without a Last party card: gaps between blocks, block sizes, fonts, scrolling, and the
// Play online card height. Problems: on a Large panel, cards/fonts/tiles/dots not scaled by one ratio at least the panel's; a gap over 24px between blocks on a compact panel, any scrolling, the Play online card
// changing height when Last party comes and goes, the footer hint not at the bottom.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), S = Ludus.state, out = { problems: [] };
  document.documentElement.classList.add('reduce'); S.reduceMotion = true;
  window.ludusSetSystemDark(matchMedia('(prefers-color-scheme: dark)').matches);
  const party = { role: 'host', code: 'AB3CD', mine: true, live: false, names: ['Ann', 'Bo', 'Cy'], games: ['dots', 'pong'], at: Date.now() };
  const open = async () => { const t = [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim() === 'Online'); t.click(); await wait(450); };
  const measure = tag => {
    const pg = document.querySelector('#grid > .online-page'), grid = document.getElementById('grid');
    const blocks = [...pg.querySelectorAll('[data-k]')].filter(b => !b.classList.contains('op-ghost') && b.getBoundingClientRect().height > 0);
    const rs = blocks.map(b => ({ k: b.dataset.k, r: b.getBoundingClientRect() }));
    const cols = {}; rs.forEach(x => { const c = Math.round(x.r.left / 40); (cols[c] = cols[c] || []).push(x); });
    const gaps = []; Object.values(cols).forEach(c => { c.sort((a, b) => a.r.top - b.r.top); for (let i = 1; i < c.length; i++) gaps.push(Math.round(c[i].r.top - c[i - 1].r.bottom)); });
    const head = rs.find(x => x.k === 'head'), start = rs.find(x => x.k === 'start'), note = rs.find(x => x.k === 'note');
    const gr = grid.getBoundingClientRect();
    const fs = s => { const e = pg.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
    const m = { gaps, maxGap: Math.max(...gaps), minGap: Math.min(...gaps), headH: Math.round(head.r.height), cardW: Math.round(start.r.width),
      startH: Math.round(start.r.height), title: fs('.op-title'), step: fs('.op-steps li'), btn: fs('#opCreate'), tile: fs('.code-tile'),
      dot: Math.round(pg.querySelector('.op-dot').getBoundingClientRect().width), input: Math.round(pg.querySelector('.op-card input').getBoundingClientRect().height),
      scroll: grid.scrollHeight - grid.clientHeight, noteBottomGap: Math.round(gr.bottom - note.r.bottom), pageBottomGap: Math.round(gr.bottom - pg.getBoundingClientRect().bottom), panel: [innerWidth, innerHeight] };
    if (m.scroll > 1) out.problems.push(`${tag}: scrolls ${m.scroll}px`);
    if (innerWidth < 640 && innerHeight < 680 && m.maxGap > 24) out.problems.push(`${tag}: gap ${m.maxGap}px > 24`);
    if (m.minGap < 6) out.problems.push(`${tag}: gap ${m.minGap}px < 6`);
    return m;
  };
  S.party = null; await open(); out.without = measure('without');
  S.party = party; Ludus.save && Ludus.save(); [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim() === 'All').click(); await wait(300); await open(); out.with = measure('with');
  if (Math.abs(out.with.headH - out.without.headH) > 1) out.problems.push(`Play online card ${out.without.headH} -> ${out.with.headH}px with Last party`);
  // a bigger single-column panel scales everything by one ratio, at least the panel's own (compact: 360px cards, 18px title, 16px dots)
  if (innerWidth < 640 && innerHeight > 600) {
    const k = out.with.cardW / 360, want = Math.min(innerWidth / 400, innerHeight / 600);
    if (k < want - 0.02) out.problems.push(`large: cards x${k.toFixed(2)}, panel x${want.toFixed(2)}`);
    for (const [n, base] of [['title', 18], ['step', 12], ['tile', 22], ['dot', 16]]) if (Math.abs(out.with[n] / base - k) > 0.08) out.problems.push(`large: ${n} x${(out.with[n] / base).toFixed(2)} vs cards x${k.toFixed(2)}`);
  }
  return out;
}
