// Contact sheet of ALL game covers at card size (221x78), 3 columns.
async () => {
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f2eee6;display:grid;grid-template-columns:repeat(3,221px);gap:6px;padding:6px;align-content:start;overflow:auto';
  const c = Ludus.colors();
  for (const g of Ludus.games) { const w = 221, h = 78;
    const holder = document.createElement('div'); holder.title = g.id; holder.style.cssText = 'border-radius:14px;overflow:hidden;height:78px;position:relative;background:' + g.tint;
    const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; cv.style.cssText = 'width:100%;height:100%;display:block';
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); holder.appendChild(cv);
    const lb = document.createElement('div'); lb.textContent = g.id; lb.style.cssText = 'position:absolute;left:4px;bottom:2px;font:9px sans-serif;color:#000a'; holder.appendChild(lb);
    wrap.appendChild(holder); try { g.art(ctx, w, h, c); } catch (e) { lb.textContent += ' ERR ' + e.message; } }
  document.body.appendChild(wrap); return Ludus.games.length;
}
