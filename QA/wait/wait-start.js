// Wait for the first move (1.12.22): every game opened with no input stays still for 3 s (score 0, no game over,
// no game sounds, the save unchanged; games marked waitForMove also report waiting and get no game time at all),
// then one input starts it. Restart waits again. A room (online) run never waits.
// node QA/harness/run.js QA/wait/wait-start.js --init QA/sound/init.js     [window.__onlyGames = 'id,id']
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), L = window.__sfxLog;
  const stage = $('stage'), st = () => JSON.parse(ludusState());
  const px = () => { const c = stage.querySelector('canvas'); if (!c) return null; const t = document.createElement('canvas'); t.width = 64; t.height = 64; const x = t.getContext('2d'); try { x.drawImage(c, 0, 0, 64, 64); return x.getImageData(0, 0, 64, 64).data; } catch (e) { return null; } };
  const diff = (a, b) => { if (!a || !b) return 0; let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return Math.round(n / (a.length / 4) * 1000) / 10; };
  const key = k => { for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { key: k, code: k === ' ' ? 'Space' : k, bubbles: true })); };
  const tap = (fx, fy) => {
    const r = stage.getBoundingClientRect(), x = r.left + r.width * fx, y = r.top + r.height * fy, tgt = document.elementFromPoint(x, y) || stage;
    const o = b => ({ clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: b, pointerType: 'mouse' });
    tgt.dispatchEvent(new PointerEvent('pointerdown', o(1))); tgt.dispatchEvent(new MouseEvent('mousedown', o(1)));
    tgt.dispatchEvent(new PointerEvent('pointerup', o(0))); tgt.dispatchEvent(new MouseEvent('mouseup', o(0))); tgt.dispatchEvent(new MouseEvent('click', o(0)));
  };
  const pill = () => { const p = $('hint').querySelector('.wait-start'); return p && p.style.visibility !== 'hidden' && p.style.opacity !== '0' ? p.textContent : ''; };
  const only = (window.__onlyGames || '').split(',').filter(Boolean);
  const rows = {}, fails = [];
  Ludus.state.sound = true;
  for (const g of Ludus.games.filter(g => !only.length || only.includes(g.id))) {
    if (g.versus) Ludus.state.vs = Object.assign({}, Ludus.state.vs, { [g.id]: 'bot' });
    const marked = !!g.waitForMove, f = m => fails.push(g.id + ': ' + m);
    Ludus.state.saves = {}; ludusOpenGame(g.id); await wait(700);
    L.game.length = 0;
    const a = st(), s0 = JSON.stringify(ludusSnapshot()), p0 = px(), hint0 = pill();
    await wait(3000);
    const b = st(), s1 = JSON.stringify(ludusSnapshot()), p1 = px(), snd = [...new Set(L.game)];
    const idle = { score: b.score, over: b.over || b.revealing, snd: snd.join(' '), pix: diff(p0, p1), snap: s0 === s1 ? 'same' : 'changed' };
    if (b.score !== a.score) f('score changed with no input');
    if (idle.over) f('game over with no input');
    if (snd.length) f('game sounds with no input: ' + idle.snd);
    if (s0 !== s1) f('save changed with no input');
    if (marked) {
      if (!a.waiting || !b.waiting) f('not waiting before the first move');
      if (b.sim !== 0) f('game time ran before the first move (' + b.sim + ' s)');
      if (!/to start/.test(hint0)) f('no start hint shown');
      // one input starts it: the game's own first move (tap games: a tap), then it runs
      if (g.waitForMove === 'tap') key(' '); else key('ArrowRight');
      await wait(60);
      if (st().waiting) { tap(0.5, 0.55); await wait(60); }
      const c = st();
      if (c.waiting) f('one input did not start it');
      if (pill()) f('start hint still shown after the start');
      const p2 = px(); await wait(1500); const d = st();
      idle.after = diff(p2, px()); idle.sim = d.sim;
      if (!c.waiting && d.sim < 0.1 && !d.over && !d.paused) f('game time did not run after the start (' + d.sim + ' s)');
      // restart waits again
      $('pauseBtn').click(); await wait(150); $('restartBtn').click(); await wait(400);
      if (!st().waiting) f('restart did not wait for the first move');
      if (!/to start/.test(pill())) f('no start hint after restart');
      // a room run never waits (its shared countdown keeps everybody in step)
      const div = document.createElement('div'), run = Ludus.makeApi(g, div, { onScore() {}, onOver() {}, toast() {} }, { dispose() {} });
      if (run.waiting) f('an online run would wait');
      run.destroy();
    }
    rows[g.id] = Object.assign({ status: marked ? 'changed' : 'already waits / turn-based' }, idle);
    $('backBtn').click(); await wait(150);
  }
  return { rows, fails };
}
