// DOM text check: overlapping text, text clipped by its box or off-screen, on home, in every game and on every pause sheet.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), out = [];
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.1 || e.hidden) return false; } return true; };
  function scan(tag) {
    const items = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.textContent.trim(), el = n.parentElement; if (!t || !el || /SCRIPT|STYLE|CANVAS/.test(el.tagName) || !vis(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const rs = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5); if (!rs.length) continue;
      items.push({ t, el, rs });
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.display !== 'inline' && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis')) out.push(`${tag}: truncated "${t.slice(0, 30)}"`);
      const r = rs[0]; let sc = false; for (let a = el; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') sc = true; }
      if (!sc && r.top < innerHeight && (r.right > innerWidth + 1 || r.left < -1)) out.push(`${tag}: off-screen "${t.slice(0, 30)}"`);
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.el === b.el) continue;
      for (const p of a.rs) for (const q of b.rs) { const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); if (x > 1.5 && y > 2) out.push(`${tag}: overlap "${a.t.slice(0, 25)}" x "${b.t.slice(0, 25)}"`); }
    }
  }
  await wait(400); scan('home');
  for (const g of Ludus.games) for (const vs of (g.versus ? ['bot', 'friend'] : ['solo'])) {
    if (vs !== 'solo') Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [g.id]: vs });
    Ludus.state.saves = {}; ludusOpenGame(g.id); await wait(500); scan(g.id + '/' + vs);
    $('pauseBtn').click(); await wait(250); scan(g.id + '/' + vs + '/pause'); $('resumeBtn').click(); await wait(60); $('backBtn').click(); await wait(120);
  }
  return [...new Set(out)];
}
