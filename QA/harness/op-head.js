/* Online page: the "Play online" info card (title + 3 steps) keeps the same height with and without the Last party card,
   and the page still fits without scrolling. node QA/harness/run.js QA/harness/op-head.js --size compact|large|wide [--dark] */
(async function opHead() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tab = async name => { [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim().startsWith(name)).click(); await wait(700); };
  const out = {};
  for (const withParty of [false, true]) {
    Ludus.state.party = withParty ? { code: 'J8AU8', mine: true, live: false, names: ['Annabelle', 'Bo', 'Cy', 'Dee'], games: ['pong', 'hockey'], n: 1, at: Date.now() } : null;
    await tab('All'); await tab('Online');
    const pg = document.querySelector('.online-page'), head = document.querySelector('.op-head'), pr = pg.getBoundingClientRect();
    const boxes = [...pg.querySelectorAll('.op-head,.party-card,.op-card,.op-or,.lobby-note')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
    let overlap = false; const byCol = boxes.slice().sort((a, b) => a.top - b.top);
    for (let i = 1; i < byCol.length; i++) for (let j = 0; j < i; j++) { const a = byCol[j], b = byCol[i]; if (a.left < b.right && b.left < a.right && b.top < a.bottom - 0.5) overlap = true; }
    out[withParty ? 'party' : 'none'] = {
      head: Math.round(head.getBoundingClientRect().height * 10) / 10,
      steps: getComputedStyle(head.querySelector('.op-steps')).display,
      fits: Math.max(...boxes.map(b => b.bottom)) <= Math.min(pr.bottom, innerHeight) + 0.5 && pg.scrollHeight <= pg.clientHeight + 1,
      overlap,
      scrollY: (document.scrollingElement || document.body).scrollHeight > innerHeight + 1
    };
  }
  const pass = out.none.head === out.party.head && out.party.steps !== 'none' && out.none.fits && out.party.fits && !out.none.overlap && !out.party.overlap;
  return { pass, out };
})
