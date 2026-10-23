// Draws the three RPS hands big, small, light, dark and mirrored.
async () => {
  const hand = Ludus.games.find(g => g.id === 'decider')._hand;
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#888;display:grid;gap:6px;padding:6px;align-content:start';
  const row = (bg, col, ink, r, mirror) => { const cv = document.createElement('canvas'); cv.width = 800; cv.height = r * 2.6 * 2; cv.style.cssText = 'width:100%;border-radius:10px;background:' + bg; const ctx = cv.getContext('2d'); ctx.scale(2, 2);
    ['rock', 'paper', 'scissors'].forEach((k, i) => hand(ctx, k, 60 + i * r * 2.2 + r * 0.2, r * 1.3, r, col, ink, mirror && i === 2)); wrap.appendChild(cv); };
  row('#f6f1e9', '#d97757', '#2b2520', 60); row('#1f1b17', '#e8946f', '#f2eee6', 60); row('#f6f1e9', '#5d6573', '#2b2520', 60, true); row('#e05d8b', 'rgba(255,255,255,0.95)', '#7a1d43', 28); row('#f6f1e9', '#d97757', '#2b2520', 16);
  document.body.appendChild(wrap); return 1;
}
