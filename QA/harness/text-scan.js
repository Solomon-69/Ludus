// Cut-off text scan: every screen with Rename games on, long names (own names of 12+ characters and original names on),
// flags any text that ends in an ellipsis, overflows its box, is clipped by a parent with overflow hidden, or runs off-screen.
// Run at each size and theme: node QA/harness/run.js QA/harness/text-scan.js --size compact|large|wide [--dark]
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), out = [];
  const S = Ludus.state;
  S.renameGames = true; S.originalNames = true;
  S.names = {}; Ludus.games.forEach((g, i) => { if (i % 3 === 0) S.names[g.id] = (g.name + ' the Great One').slice(0, 24); });
  S.last = 'invhunt'; S.saves = {}; Ludus.save();
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  function scan(tag) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.textContent.trim(), el = n.parentElement; if (!t || !el || /SCRIPT|STYLE|CANVAS|TEXTAREA|OPTION/.test(el.tagName) || !vis(el)) continue;
      if (el.closest('[aria-hidden="true"], .sr-only, .visually-hidden')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const rs = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5); if (!rs.length) continue;
      const cs = getComputedStyle(el), tt = `${tag}: "${t.slice(0, 34)}" <${el.className || el.tagName}>`;
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) { out.push(`${tt} ellipsis`); continue; }
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.display !== 'inline' && cs.overflowX !== 'visible') { out.push(`${tt} overflows its box`); continue; }
      // clipped by an ancestor that hides overflow (scroll containers excluded: their text can be scrolled to)
      let clip = null;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a); if (o.overflowX === 'auto' || o.overflowX === 'scroll' || o.overflowY === 'auto' || o.overflowY === 'scroll') break;
        if (o.overflowX !== 'visible' || o.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect(); if (rs.some(r => r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1)) { clip = a; break; }
        }
      }
      if (clip) { out.push(`${tt} clipped by <${clip.className || clip.tagName}>`); continue; }
      let sc = false; for (let a = el; a; a = a.parentElement) { const o = getComputedStyle(a); if (/auto|scroll/.test(o.overflowX + o.overflowY)) sc = true; }
      if (!sc && rs.some(r => r.top < innerHeight && (r.right > innerWidth + 1 || r.left < -1))) out.push(`${tt} off-screen`);
    }
  }
  await wait(500);
  // tabs (Online last), with the Continue card on All
  const tabs = [...$('filters').querySelectorAll('button')];
  for (const b of tabs) { b.click(); await wait(450); scan('tab ' + b.textContent.trim()); }
  tabs[0].click(); await wait(400);
  // the rename tooltip
  const nm = document.querySelector('.card .rename-name'); if (nm) { nm.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await wait(650); scan('tooltip'); nm.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })); }
  // settings, with More open
  const sb = [...document.querySelectorAll('button')].find(b => /settings/i.test(b.getAttribute('aria-label') || '')); if (sb) { sb.click(); await wait(500); document.querySelector('.more-head')?.click(); await wait(600); scan('settings'); document.querySelector('.view-settings .icon-btn, .view-settings button')?.click(); await wait(400); }
  // every game: header, pause sheet
  for (const g of Ludus.games) {
    S.saves = {}; ludusOpenGame(g.id); await wait(450); scan(g.id);
    $('pauseBtn').click(); await wait(220); scan(g.id + ' pause'); $('resumeBtn').click(); await wait(60);
    $('backBtn').click(); await wait(120);
  }
  // a result card (Hammer Climb, launched into space)
  window.ludusDebug = {}; ludusOpenGame('climb'); await wait(500);
  const pk = Ludus.games.find(x => x.id === 'climb')._peek; if (pk && pk().win) { pk().win(); await wait(3900); scan('result card'); }
  $('backBtn').click(); await wait(200);
  return [...new Set(out)];
}
