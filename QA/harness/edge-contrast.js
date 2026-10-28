// Raised edges are visible (no network): node QA/harness/run.js QA/harness/edge-contrast.js [--size ...] [--dark]
// Every control and surface with a raised edge (a solid bottom box-shadow) on home (All, Duel), the Online page with a Last
// party, settings and a game with its pause sheet: the edge colour must differ from what is behind it (luminance contrast
// >= 1.25) and from the element's own face (>= 1.15 when the face is opaque), so the edge reads in light and dark.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), out = [], seen = { n: 0 };
  document.documentElement.classList.add('reduce'); const S = Ludus.state; S.reduceMotion = true; S.last = 'boxit'; S.plays = { boxit: 2 };
  window.ludusSetSystemDark(matchMedia('(prefers-color-scheme: dark)').matches); await wait(300);
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const behind = el => { let c = [0, 0, 0, 0], layers = []; for (let e = el.parentElement; e; e = e.parentElement) { const b = rgba(getComputedStyle(e).backgroundColor); if (b[3] > 0) layers.push(b); if (b[3] >= 0.99) break; } c = rgba(getComputedStyle(document.body).backgroundColor); if (c[3] < 0.99) c = rgba(getComputedStyle(document.documentElement).backgroundColor); for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c); return c; };
  const edgeOf = el => { const bs = getComputedStyle(el).boxShadow; if (!bs || bs === 'none') return null;
    for (const part of bs.split(/,(?![^(]*\))/)) { if (/inset/.test(part)) continue; const col = (part.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i) || [])[0]; const nums = part.replace(col || '', '').trim().split(/\s+/).map(parseFloat);
      if (col && nums[0] === 0 && nums[1] >= 2 && (nums[2] || 0) === 0) return { col, y: nums[1] }; } return null; };
  const scan = tag => { document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
    for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.5) return; }
    const ed = edgeOf(el); if (!ed) return; seen.n++;
    const back = behind(el), edge = over(rgba(ed.col), back), face = rgba(getComputedStyle(el).backgroundColor);
    const name = el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 14) + '"' : '');
    const rb = ratio(edge, back); if (rb < 1.25) out.push(`${tag}: ${name} edge vs behind ${rb.toFixed(2)}`);
    if (face[3] > 0.99) { const rf = ratio(edge, face); if (rf < 1.15) out.push(`${tag}: ${name} edge vs face ${rf.toFixed(2)}`); }
  }); };
  const tab = async t => { [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim() === t).click(); await wait(350); };
  await tab('All'); scan('home/All'); await tab('Duel'); scan('home/Duel');
  S.party = { role: 'host', code: 'AB3CD', mine: true, live: false, names: ['Ann', 'Bo'], games: ['boxit'], at: Date.now() };
  await tab('Online'); scan('online'); await tab('All');
  window.ludusOpenSettings(); await wait(450); scan('settings'); ($('settingsBack') || document.querySelector('#settings .icon-btn')).click(); await wait(300);
  ludusOpenGame('boxit'); await wait(900); scan('game'); $('pauseBtn').click(); await wait(400); scan('pause');
  return { checked: seen.n, problems: [...new Set(out)] };
}
