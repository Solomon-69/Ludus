async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const k = key => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  const out = {};
  ludusOpenGame('snake'); await wait(400);
  k('ArrowUp'); await wait(150);
  // collect a snapshot while alive
  document.getElementById('backBtn').click(); await wait(200);
  out.savedWhileAlive = !!Ludus.state.saves.snake;
  ludusOpenGame('snake'); await wait(400);
  out.welcome = document.getElementById('pauseTitle').textContent;
  document.getElementById('resumeBtn').click();
  // keep going up until the crash, then leave inside the 700 ms window before over()
  let s; for (let i = 0; i < 80; i++) { await wait(100); s = JSON.parse(ludusState()); if (s.revealing || s.over) break; if (Ludus.state.saves.snake && i > 40) break; }
  const t0 = performance.now();
  document.getElementById('backBtn').click(); await wait(200);
  out.savedAfterLeavingDuringDeath = !!Ludus.state.saves.snake;
  // rejected save: corrupt snapshot must not show Welcome back
  Ludus.state.saves.mines = { junk: true };
  ludusOpenGame('mines'); await wait(400);
  out.minesTitle = document.getElementById('pauseSheet').hidden ? 'no sheet' : document.getElementById('pauseTitle').textContent;
  out.minesSaveDropped = !Ludus.state.saves.mines;
  return out;
}
