// Sliding tab pill: after every tab click (mouse and keyboard), after scrolling the tab row, after a resize and after
// search clears, the pill sits exactly under the active tab (position and width within 1px) and the tab is in view.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), f = document.getElementById('filters'), out = [];
  const check = tag => {
    const on = f.querySelector('.chip.is-on'), p = f.querySelector('.tab-pill');
    if (!on || !p) { out.push(tag + ': missing'); return; }
    const a = on.getBoundingClientRect(), b = p.getBoundingClientRect(), fr = f.getBoundingClientRect();
    if (Math.abs(a.left - b.left) > 1 || Math.abs(a.width - b.width) > 1 || Math.abs(a.top - b.top) > 1 || Math.abs(a.height - b.height) > 1) out.push(`${tag}: pill off (${b.left.toFixed(1)},${b.width.toFixed(1)}) vs tab (${a.left.toFixed(1)},${a.width.toFixed(1)})`);
    if (a.left < fr.left - 1 || a.right > fr.right + 1) out.push(`${tag}: active tab not in view (${a.left.toFixed(0)}-${a.right.toFixed(0)} in ${fr.left.toFixed(0)}-${fr.right.toFixed(0)}, scroll ${f.scrollLeft}/${f.scrollWidth - f.clientWidth})`);
    if (getComputedStyle(p).opacity !== '1') out.push(tag + ': pill hidden');
    const dot = f.querySelector('.net-dot');
    if (dot && on.contains(dot)) { const d = dot.getBoundingClientRect(); if (d.right > fr.right + 0.5 || d.top < fr.top - 0.5) out.push(tag + ': dot clipped'); }
  };
  await wait(500); check('first load');
  const chips = () => [...f.querySelectorAll('.chip')];
  for (const c of chips()) { c.click(); await wait(600); check('click ' + c.textContent); }
  for (const c of chips().reverse()) { c.click(); await wait(600); check('back ' + c.textContent); }
  // mid-slide sample: pill must be between, not jumped
  chips()[0].click(); await wait(600); chips()[3].click(); await wait(90);
  const mid = f.querySelector('.tab-pill').getBoundingClientRect().left, s = chips()[0].getBoundingClientRect().left, e = chips()[3].getBoundingClientRect().left;
  const slides = !(Math.abs(mid - e) < 1) && mid > Math.min(s, e) - 1;
  await wait(600); check('after mid');
  // keyboard
  chips()[0].click(); await wait(600); chips()[0].focus();
  for (let i = 0; i < chips().length; i++) { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(600); check('key right ' + i); }
  const focusOk = document.activeElement && document.activeElement.classList.contains('is-on');
  // user scrolls the row away, then picks a tab
  f.scrollLeft = 0; await wait(50); chips()[chips().length - 1].click(); await wait(700); check('scrolled pick last');
  f.scrollLeft = f.scrollWidth; await wait(50); chips()[0].click(); await wait(700); check('scrolled pick first');
  // resize (size setting / panel resize)
  document.documentElement.style.fontSize = '17px'; f.style.padding = '6px 18px 12px'; await wait(200); check('after resize');
  document.documentElement.style.fontSize = ''; f.style.padding = ''; await wait(200); check('after resize back');
  // search: dim, type, clear
  const search = document.getElementById('search'); chips()[2].click(); await wait(600);
  search.value = 'ch'; search.dispatchEvent(new Event('input')); await wait(200);
  search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(300); check('after search clear');
  return { problems: out, slides, focusOk, scrollable: f.scrollWidth > f.clientWidth };
}
