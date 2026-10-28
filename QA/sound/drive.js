// Every game makes a sound on its key moments, and nothing plays with Sound off.
// node QA/harness/run.js QA/sound/drive.js --init QA/sound/init.js   [window.__onlyGames = 'id,id' to narrow]
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), L = window.__sfxLog;
  window.ludusRevealMs = 50;
  const stage = $('stage');
  const key = k => { for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, bubbles: true })); };
  const ptr = (x, y, x2, y2) => {
    const r = stage.getBoundingClientRect(), px = r.left + r.width * x, py = r.top + r.height * y;
    const qx = r.left + r.width * (x2 ?? x), qy = r.top + r.height * (y2 ?? y);
    const tgt = document.elementFromPoint(px, py);
    if (!tgt || !stage.contains(tgt)) return;   // only the game itself is driven, never the header or a sheet
    const o = (cx, cy, b) => ({ clientX: cx, clientY: cy, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: b, pointerType: 'mouse' });
    tgt.dispatchEvent(new PointerEvent('pointerdown', o(px, py, 1))); tgt.dispatchEvent(new MouseEvent('mousedown', o(px, py, 1)));
    for (const t of [tgt, window]) { t.dispatchEvent(new PointerEvent('pointermove', o(qx, qy, 1))); t.dispatchEvent(new MouseEvent('mousemove', o(qx, qy, 1))); }
    const up = document.elementFromPoint(qx, qy) || tgt;
    up.dispatchEvent(new PointerEvent('pointerup', o(qx, qy, 0))); up.dispatchEvent(new MouseEvent('mouseup', o(qx, qy, 0))); up.dispatchEvent(new MouseEvent('click', o(qx, qy, 0)));
  };
  const clickDom = () => { const bs = [...stage.querySelectorAll('button, [role=button], .lk-tile, input[type=button]')].filter(b => b.offsetParent && !b.disabled); bs.slice(0, 3).forEach(b => b.click()); };
  const typeWord = async w => { const inp = stage.querySelector('input:not([type=button])'); if (!inp) { if (/^[A-Z]+$/.test(w)) { for (const ch of w) key(ch.toLowerCase()); key('Enter'); } return; } inp.focus(); inp.value = w; inp.dispatchEvent(new Event('input', { bubbles: true })); for (const t of ['keydown', 'keyup']) inp.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', bubbles: true })); };
  async function drive(ms) {
    const end = performance.now() + ms; let i = 0;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'a', 'd', 'w', 's'];
    while (performance.now() < end) {
      const st = JSON.parse(ludusState());
      if (st.view !== 'game' || st.paused || st.over) break;   // the round ended (or something left the game): stop driving
      const x = 0.15 + ((i * 0.37) % 0.7), y = 0.2 + ((i * 0.53) % 0.65);
      if (i % 3 === 0) ptr(x, y); else if (i % 3 === 1) ptr(x, y, 1 - x, 1 - y); else key(keys[i % keys.length]);
      if (i % 7 === 0) clickDom();
      if (i % 11 === 0) await typeWord(['CRANE', 'france', 'paris'][i % 3]);
      i++; await wait(45);
    }
  }
  const only = (window.__onlyGames || '').split(',').filter(Boolean);
  const games = Ludus.games.filter(g => !only.length || only.includes(g.id));
  const res = { silent: [], fired: {}, offLeaks: [] };
  Ludus.state.sound = true; Ludus.state.volume = 0.6;
  for (const g of games) {
    if (g.versus) Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [g.id]: 'bot' });
    Ludus.state.saves = {}; L.names.length = 0; L.game.length = 0;
    ludusOpenGame(g.id); await wait(700); L.names.length = 0; L.game.length = 0;   // only sounds made by the game itself count (not the open sound)
    await drive(+(window.__driveMs || 3500));
    const names = [...new Set(L.game)];
    res.fired[g.id] = names.join(' ');
    if (!names.length) res.silent.push(g.id);
    $('backBtn').click(); await wait(150);
  }
  // Sound off: nothing is played, whatever happens in the app.
  Ludus.state.sound = false;
  for (const g of games.slice(0, +(window.__offCount || 12))) {
    const before = L.tones; L.names.length = 0;
    ludusOpenGame(g.id); await wait(400); await drive(900);
    $('backBtn').click(); await wait(100);
    if (L.tones !== before || L.names.length) res.offLeaks.push(g.id + ':' + (L.tones - before));
  }
  Ludus.state.sound = true;
  res.count = games.length; res.resumes = L.resumes;
  return res;
}
