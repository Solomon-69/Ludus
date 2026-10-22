/* Ludus smoke test. Paste/run inside the page (browser pane or WKWebView). Returns a report object.
   For every game: open it, hammer it with random keys, clicks and drags, pause, restart 3 times,
   go home; checks for errors, leaked window listeners, frame rate and that the stage has content. */
(async function ludusSmoke(opts) {
  opts = opts || {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  const onErr = e => errors.push(String(e.message || e.reason || e));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); origErr.apply(console, a); };
  let live = 0;
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const tracked = new WeakSet();
  EventTarget.prototype.addEventListener = function (t, f, o) { if (this === window && typeof f === 'function' && !tracked.has(f)) { tracked.add(f); live++; } return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) { if (this === window && tracked.has(f)) { tracked.delete(f); live--; } return rem.call(this, t, f, o); };
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'a', 'd', 'w', 's', 'x', 'z', 'c', 'g', 'f', 'r', 't', 'k', 'l', '1', '2', '3'];
  const ids = opts.only || Ludus.games.map(g => g.id);
  const report = [];
  for (const id of ids) {
    const before = live; const errBefore = errors.length; const t0 = performance.now();
    ludusOpenGame(id); await wait(450);
    const stage = document.getElementById('stage');
    const hasContent = stage.children.length > 0 && !stage.textContent.includes('hit a problem');
    let frames = 0; const fpsStart = performance.now(); let counting = true;
    (function f() { if (!counting) return; frames++; requestAnimationFrame(f); })();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < (opts.events || 60); i++) {
        const r = stage.getBoundingClientRect();
        const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height;
        const target = document.elementFromPoint(x, y) || stage;
        const roll = Math.random();
        if (roll < 0.45) {
          const k = keys[Math.floor(Math.random() * keys.length)];
          window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k, bubbles: true }));
        } else {
          const base = { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: 1 };
          target.dispatchEvent(new PointerEvent('pointerdown', base));
          target.dispatchEvent(new MouseEvent('mousedown', base));
          const dx = (Math.random() - 0.5) * 120, dy = (Math.random() - 0.5) * 120;
          target.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, base, { clientX: x + dx, clientY: y + dy })));
          target.dispatchEvent(new MouseEvent('mousemove', Object.assign({}, base, { clientX: x + dx, clientY: y + dy })));
          target.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { clientX: x + dx * (roll < 0.7 ? 0 : 1), clientY: y + dy * (roll < 0.7 ? 0 : 1), buttons: 0 })));
          target.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 })));
          target.dispatchEvent(new MouseEvent('click', base));
        }
        await wait(opts.gap || 25);
      }
      // pause, resume, restart (or play again if the run ended)
      const over = !document.getElementById('overSheet').hidden;
      if (over) document.getElementById('againBtn').click();
      else { document.getElementById('pauseBtn').click(); await wait(80); document.getElementById('restartBtn').click(); }
      await wait(250);
    }
    counting = false;
    const fps = Math.round(frames / ((performance.now() - fpsStart) / 1000));
    document.getElementById('backBtn').click(); await wait(250);
    report.push({ id, ok: hasContent && errors.length === errBefore && live === before, content: hasContent,
      errors: errors.slice(errBefore, errBefore + 3), leaked: live - before, fps, ms: Math.round(performance.now() - t0) });
  }
  EventTarget.prototype.addEventListener = add; EventTarget.prototype.removeEventListener = rem; console.error = origErr;
  window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
  return { pass: report.every(r => r.ok), failed: report.filter(r => !r.ok), all: report.map(r => `${r.id}:${r.ok ? 'ok' : 'FAIL'} fps${r.fps}`) };
})
