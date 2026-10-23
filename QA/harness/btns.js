// Pause sheet, result bar and top bar buttons of every game: inside the window, not overlapping, same place in every game.
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const R = id => { const r = $(id).getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  const issues = [], sig = {};
  const check = (tag, ids, group) => {
    const rs = ids.map(i => [i, R(i)]);
    for (const [i, r] of rs) if (r.l < 0 || r.t < 0 || r.r > innerWidth || r.b > innerHeight || r.r - r.l < 20) issues.push(`${tag}: ${i} out/clipped ${JSON.stringify(r)} in ${innerWidth}x${innerHeight}`);
    for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) { const p = rs[a][1], q = rs[b][1]; if (Math.min(p.r, q.r) - Math.max(p.l, q.l) > 1 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 1) issues.push(`${tag}: ${rs[a][0]} overlaps ${rs[b][0]}`); }
    const k = JSON.stringify(rs.map(x => x[1])); sig[group] = sig[group] || {}; sig[group][k] = (sig[group][k] || 0) + 1;
  };
  for (const g of Ludus.games) for (const vs of (g.versus ? ['bot', 'friend'] : ['solo'])) {
    if (vs !== 'solo') Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [g.id]: vs });
    Ludus.state.saves = {}; ludusOpenGame(g.id); await wait(450);
    check(g.id + '/' + vs + '/top', ['backBtn', 'pauseBtn'], 'top');
    $('pauseBtn').click(); await wait(250);
    check(g.id + '/' + vs + '/pause', ['resumeBtn', 'restartBtn', 'quitBtn'], 'pause');
    $('resumeBtn').click(); await wait(80);
    $('overSheet').hidden = false; await wait(100);
    check(g.id + '/' + vs + '/over', ['againBtn', 'overQuitBtn', 'overHideBtn'], 'over');
    $('overSheet').hidden = true;
    $('backBtn').click(); await wait(150);
  }
  window.__sig = sig; return { issues, groups: Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, Object.entries(v).map(([p, n]) => n + 'x ' + p)])), distinctPositions: Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, Object.keys(v).length])) };
}
