// Draws the cover art of a few games on their tint at card size (221x78) so a screenshot shows them.
async () => {
  const ids = ['holeio', 'paperio', 'crates', 'slither', 'snake', 'decider'];
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f2eee6;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;align-content:start';
  const c = Ludus.colors();
  for (const id of ids) { const g = Ludus.games.find(x => x.id === id); const w = 221, h = 78;
    const holder = document.createElement('div'); holder.style.cssText = 'border-radius:14px;overflow:hidden;height:78px;background:' + g.tint;
    const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; cv.style.cssText = 'width:100%;height:100%;display:block';
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); holder.appendChild(cv); wrap.appendChild(holder); g.art(ctx, w, h, c); }
  document.body.appendChild(wrap); return ids.length;
}
