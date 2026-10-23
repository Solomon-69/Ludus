// Online page layout: fills the panel (no empty band), nothing cut off or overlapping. Compact/large, light/dark, with/without a last party.
const L = require('./lib.js'); const { check, newPage, shot, wait } = L;
(async () => {
  const b = await L.launch();
  for (const [sz, size] of [['compact', { width: 400, height: 600 }], ['large', { width: 520, height: 740 }]]) for (const dark of [false, true]) for (const party of [true, false]) {
    const p = await newPage(b, null, { size, dark, name: 'Solomon' });
    if (party) await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('ludus.v1')); S.party = { code: 'K7M2Q', role: 'host', names: ['Solomon', 'Bo'], games: ['geoguess', 'flags', 'snake'] }; localStorage.setItem('ludus.v1', JSON.stringify(S)); });
    if (party) { await p.reload(); await wait(300); }
    await L.onlineTab(p); await wait(500);
    const r = await p.evaluate(() => {
      const g = document.getElementById('grid'), pg = document.querySelector('.online-page'), gr = g.getBoundingClientRect();
      const note = [...pg.querySelectorAll('.lobby-note')].pop().getBoundingClientRect();
      const kids = [...pg.querySelectorAll('.op-title,.op-steps,.field,.party-card,#opCreate,.op-or,.join-row,.lobby-note')].map(e => e.getBoundingClientRect());
      let overlap = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], c = kids[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlap++; }
      const pc = document.querySelector('.party-card'); let clip = 0;
      if (pc) pc.querySelectorAll('*').forEach(e => { const x = e.getBoundingClientRect(), q = pc.getBoundingClientRect(); if (x.width && (x.right > q.right + 0.5 || x.left < q.left - 0.5)) clip++; });
      const ch = [...pg.children].map(e => e.getBoundingClientRect()), gaps = ch.slice(1).map((r, i) => Math.round(r.top - ch[i].bottom));
      return { gaps, even: Math.max(...gaps) - Math.min(...gaps) <= 2, gap: Math.round(gr.bottom - note.bottom), scroll: g.scrollHeight - g.clientHeight, overlap, clip, steps: [...pg.querySelectorAll('.op-steps li')].map(li => li.textContent), stepCut: [...pg.querySelectorAll('.op-steps li span:last-child')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > pg.querySelector('.op-head').getBoundingClientRect().right).length, stepLines: Math.max(...[...pg.querySelectorAll('.op-steps li span:last-child')].map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)))), boxes: ['.op-head', '.online-page input', '.party-card'].map(q => { const e = pg.querySelector(q); return e ? getComputedStyle(e).backgroundColor : ''; }).filter(Boolean), win: [innerWidth, innerHeight] };
    });
    const tag = `${sz}_${dark ? 'dark' : 'light'}_${party ? 'party' : 'noparty'}`;
    check(`${tag}: no empty band under the page (gap ${r.gap}px)`, r.gap <= 26 && r.scroll <= 1, r);
    check(`${tag}: equal gaps between the blocks (${r.gaps})`, r.even, r.gaps);
    check(`${tag}: nothing overlaps or is cut off`, r.overlap === 0 && r.clip === 0, r);
    check(`${tag}: three steps`, r.steps.join('|') === '1Create or join|2Share the code|3Host picks games', r.steps);
    check(`${tag}: steps never cut off, at most two lines (${r.stepLines})`, r.stepCut === 0 && r.stepLines <= 2, r);
    const want = dark ? 'rgb(50, 45, 39)' : 'rgb(239, 231, 218)';
    check(`${tag}: boxes use the ${dark ? 'unchanged dark' : 'deeper cream'} fill`, r.boxes.every(c => c === want), r.boxes);
    await shot(p, 'op_' + tag); await p.context().close();
  }
  await b.close(); const f = L.results.filter(x => !x).length; console.log(`${L.results.length - f}/${L.results.length}`); process.exit(f ? 1 : 0);
})();
