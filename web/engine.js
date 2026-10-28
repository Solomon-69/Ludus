/* Ludus engine: game registry, settings, storage, sound and helpers shared by every game.
   Game contract (see games/g2048.js for a full example):

   Ludus.register({
     id: 'snake', name: 'Snake', tag: 'Arcade' | 'Puzzle' | 'Duel' | '2 Player', tint: '#hex',
     hint: 'Arrows or swipe',            // shown under the stage (HTML allowed, use <kbd>)
     art(ctx, w, h, colors) { ... },     // draws the card thumbnail (CSS pixels, already scaled)
     create(stage, api) { ...; return { destroy() {}, pause() {}, resume() {} } } // all optional
     waitForMove: true | 'tap',          // optional: a game that would start running on its own waits, still,
                                         // until the player's first key, click, tap or (pointer games) mouse move.
                                         // 'tap' = a one-button game: that first press only starts it and says "Tap to start".
   })

   Everything a game registers through api.on / api.loop / api.timeout is cleaned up automatically
   on restart, quit and pause. Restart = destroy + create again.
*/
(function () {
  const games = [];
  const STORE_KEY = 'ludus.v1';
  const defaults = {
    theme: 'system', accent: '#d97757', sound: true, volume: 0.6, difficulty: 'normal',
    reduceMotion: false, raised: true, hints: true, size: 'compact', hidden: [], best: {}, plays: {}, last: null,
    filter: 'All', saves: {}, introDone: false, onlineName: '', party: null, stackSkin: '', renameGames: false, originalNames: false, names: {}
  };

  // ---------- persistence (native bridge first, browser storage as fallback) ----------
  function loadState() {
    let s = null;
    try { if (window.__LUDUS_STATE__) s = window.__LUDUS_STATE__; } catch (e) {}
    if (!s) { try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {} }
    const st = Object.assign({}, defaults, s || {});
    delete st.privacyBlur;   // Privacy blur was removed in 1.12.3: an old saved switch is ignored
    return st;
  }
  const state = loadState();
  let saveTimer = null;
  function write() {
    const json = JSON.stringify(state);
    try { localStorage.setItem(STORE_KEY, json); } catch (e) {}
    native('save', { state: JSON.parse(json) });
  }
  // Batched save; pass true to write at once (panel closing or app quitting).
  function save(now) {
    clearTimeout(saveTimer);
    if (now) { write(); return; }
    saveTimer = setTimeout(write, 120);
  }
  function native(type, payload) {
    try { window.webkit.messageHandlers.ludus.postMessage(Object.assign({ type }, payload || {})); return true; }
    catch (e) {
      try { if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage(Object.assign({ type }, payload || {})); return true; } } catch (e2) {}
      return false;
    }
  }

  // ---------- sound: tiny WebAudio synth, no files ----------
  // Each sound is a list of notes [frequency, seconds, wave, glide-to frequency]. Game sounds play at full level;
  // the app's own interface sounds (QUIET) are softer and shorter so they sit under the games.
  let actx = null;
  const tones = {
    tap: [[660, 0.04, 'sine']], click: [[520, 0.03, 'triangle']], move: [[300, 0.03, 'triangle']],
    merge: [[520, 0.05, 'sine'], [780, 0.07, 'sine']], score: [[880, 0.06, 'sine'], [1320, 0.08, 'sine']],
    eat: [[620, 0.04, 'square'], [820, 0.05, 'square']], jump: [[420, 0.07, 'sine', 760]],
    drop: [[180, 0.06, 'triangle']], line: [[660, 0.06, 'sine'], [880, 0.06, 'sine'], [1100, 0.1, 'sine']],
    hit: [[160, 0.09, 'sawtooth', 90]], boom: [[120, 0.25, 'sawtooth', 40]], power: [[300, 0.18, 'square', 900]],
    win: [[523, 0.09, 'sine'], [659, 0.09, 'sine'], [784, 0.09, 'sine'], [1046, 0.18, 'sine']],
    lose: [[392, 0.12, 'triangle'], [330, 0.12, 'triangle'], [262, 0.22, 'triangle']],
    over: [[330, 0.12, 'triangle'], [247, 0.24, 'triangle']], tick: [[1200, 0.015, 'square']],
    // game moments added in 1.12.20
    flip: [[900, 0.035, 'triangle', 620]], place: [[260, 0.05, 'triangle', 190]], bounce: [[520, 0.045, 'sine', 380]],
    correct: [[700, 0.05, 'sine'], [1050, 0.08, 'sine']], wrong: [[220, 0.1, 'triangle', 170], [196, 0.12, 'triangle']],
    shoot: [[900, 0.05, 'square', 320]], coin: [[988, 0.04, 'square'], [1319, 0.08, 'square']],
    whoosh: [[220, 0.12, 'sine', 640]], deal: [[1400, 0.02, 'triangle', 900]],
    // interface sounds (all soft, see QUIET)
    tab: [[740, 0.035, 'sine', 880]], open: [[523, 0.045, 'sine', 784], [988, 0.05, 'sine']], back: [[660, 0.05, 'sine', 440]],
    on: [[660, 0.03, 'sine'], [990, 0.045, 'sine']], off: [[700, 0.03, 'sine'], [470, 0.045, 'sine']],
    sheet: [[440, 0.07, 'sine', 660]], unsheet: [[620, 0.07, 'sine', 420]],
    panel: [[392, 0.05, 'sine', 587], [784, 0.06, 'sine']], panelOff: [[587, 0.06, 'sine', 392]],
    toast: [[1046, 0.035, 'sine'], [1318, 0.055, 'sine']], copy: [[1200, 0.03, 'triangle'], [1600, 0.045, 'sine']],
    save: [[700, 0.04, 'sine'], [1050, 0.06, 'sine']], room: [[523, 0.06, 'triangle'], [784, 0.08, 'triangle']],
    friend: [[784, 0.07, 'sine'], [1046, 0.07, 'sine'], [1568, 0.13, 'sine']],
    count: [[880, 0.05, 'sine']], go: [[880, 0.04, 'sine'], [1320, 0.14, 'sine']],
    best: [[659, 0.07, 'sine'], [784, 0.07, 'sine'], [1046, 0.07, 'sine'], [1318, 0.09, 'sine'], [1568, 0.2, 'sine']],
    result: [[587, 0.08, 'triangle'], [740, 0.08, 'triangle'], [880, 0.16, 'triangle']]
  };
  const QUIET = { tab: 0.45, open: 0.5, back: 0.45, on: 0.45, off: 0.45, sheet: 0.4, unsheet: 0.4, panel: 0.35, panelOff: 0.3,
    toast: 0.35, copy: 0.4, save: 0.5, room: 0.55, friend: 0.55, count: 0.6, go: 0.7, result: 0.65, shoot: 0.45, coin: 0.6,
    deal: 0.5, wrong: 0.7, whoosh: 0.5, click: 0.8 };
  // The same sound never stacks up: a repeat sooner than this (ms) is dropped. Busy games (a hit every frame,
  // online snapshots arriving in bursts) stay calm, and at most MAX_BURST sounds start in any 120 ms.
  const GAP = { toast: 400, panel: 500, panelOff: 500, friend: 600, tick: 60, move: 45, eat: 45, hit: 60, flip: 40, deal: 30 };
  const MAX_BURST = 6, lastAt = {}, recent = [];
  function ctx() {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
    // WebKit can leave a context 'interrupted' (Mac panel hidden, sleep): any state but running is resumed
    if (actx.state !== 'running' && actx.state !== 'closed') { try { const p = actx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    return actx;
  }
  function sfx(name) {
    if (!state.sound) return;
    if (!tones[name]) name = 'tap';
    const now = performance.now();
    if (now - (lastAt[name] || -1e9) < (GAP[name] || 35)) return;
    while (recent.length && now - recent[0] > 120) recent.shift();
    if (recent.length >= MAX_BURST && !/^(win|over|best|result)$/.test(name)) return;   // the burst cap never eats an end-of-game sound
    lastAt[name] = now; recent.push(now);
    if (window.__ludusSfxSpy) { try { window.__ludusSfxSpy(name); } catch (e) {} }   // headless sound tests
    if (window.__ludusTestMuted) return;   // test runs (test hook "mute") stay silent
    try {
      const a = ctx(); if (!a) return;
      let t = a.currentTime + 0.005;
      const level = 0.12 * Math.max(0, Math.min(1, +state.volume || 0)) * (QUIET[name] || 1);
      if (level <= 0.0002) return;
      tones[name].forEach(([f, d, type, toF]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (toF) o.frequency.exponentialRampToValueAtTime(toF, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
        t += d * 0.85;
      });
    } catch (e) {}
  }
  // Browsers only let a page make sound after the person has clicked or pressed a key. The first tap or key press
  // (and any later one after the Mac or Windows panel was hidden and the audio paused) wakes the audio up, with one
  // silent sample so WebKit (Mac) and WebView2 (Windows) both count it as started. Nothing happens with Sound off.
  function unlockAudio() {
    if (!state.sound || window.__ludusTestMuted) return;
    if (actx && actx.state === 'running') return;
    try {
      const a = ctx(); if (!a) return;
      const src = a.createBufferSource(); src.buffer = a.createBuffer(1, 1, 22050); src.connect(a.destination); src.start(0);
    } catch (e) {}
  }
  ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(t => window.addEventListener(t, unlockAudio, { capture: true, passive: true }));

  // ---------- colours from CSS tokens ----------
  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    return {
      bg: v('--bg'), bg2: v('--bg-2'), surface: v('--surface'), surface2: v('--surface-2'),
      ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), line: v('--line'),
      accent: v('--accent'), good: v('--good'), bad: v('--bad'),
      dark: document.documentElement.dataset.theme === 'dark'
    };
  }

  // ---------- per-run api ----------
  function versusMode(game) {
    if (!game.versus) return 'bot';
    const v = state.vs && state.vs[game.id];
    return (v || game.defaultVs || 'bot') === 'friend' ? 'friend' : 'bot';
  }
  function savedFor(game) {
    const snap = (state.saves && state.saves[game.id]) || null;
    if (snap && game.versus && (snap.vsMode || 'bot') !== versusMode(game)) return null;
    if (snap && !game.versus && snap.vsMode === 'friend') return null;   // a game that no longer has a local friend mode: an old friend-mode save is dropped and it starts against the bot
    return snap;
  }

  function makeApi(game, stage, hooks, online) {
    const cleanups = [];
    // online = the api.online object when this run is a room game (see ONLINE.md), otherwise null: local play.
    if (online) cleanups.push(() => { try { online.dispose(); } catch (e) {} });
    const loops = new Set();
    let paused = false;
    const held = new Map();   // keys down right now (key -> code), released on resume
    let touched = false; // the player pressed a key or clicked at least once this run
    let ended = false;   // after api.over: input is ignored but drawing continues so the final board can be seen
    let score = 0;
    // Wait for the first move: a solo (or same-screen) run of a game marked waitForMove stands still, time and all,
    // until the player presses a key, clicks, taps or (pointer-steered games) moves the mouse. Room games never wait:
    // they keep their shared countdown so nobody stalls the others.
    const tapStart = game.waitForMove === 'tap';
    let simTime = 0;   // seconds of game time handed to the loops (tests: nothing runs before the first move)
    let waiting = !!game.waitForMove && !online, startEvent = null, moved = 0, lastMove = null;
    const startNow = e => {
      if (!waiting) return;
      waiting = false; startEvent = e || null;
      loops.forEach(l => l.reset && l.reset());
      try { hooks.onWait && hooks.onWait(false); } catch (x) {}
      const cbs = startCbs.splice(0); cbs.forEach(fn => { try { fn(); } catch (x) { crash(x, 'start'); } });
    };
    const startCbs = [];
    const NOT_A_MOVE = new Set(['Escape', 'p', 'P', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Fn']);
    const startsRun = (type, e) => {
      if (type === 'keydown') return !NOT_A_MOVE.has(e.key) && !e.metaKey && !e.ctrlKey;
      if (type === 'pointerdown' || type === 'mousedown' || type === 'touchstart') return true;
      if (!tapStart && (type === 'pointermove' || type === 'mousemove')) {   // a real move of the pointer, not a nudge
        const p = [e.clientX, e.clientY];
        if (lastMove) moved += Math.hypot(p[0] - lastMove[0], p[1] - lastMove[1]);
        lastMove = p;
        return moved > 14;
      }
      return false;
    };
    // The game stopped working (threw, stalled, lost its graphics): stop it and let the app show the recovery card.
    let crashed = false, lastFrame = performance.now();
    const crash = (e, kind) => {
      if (crashed) return; crashed = true; paused = true;
      loops.forEach(l => { l.running = false; });
      try { hooks.onCrash ? hooks.onCrash(e, kind) : hooks.toast('This game hit a problem'); } catch (x) {}
    };
    const guard = (fn, kind) => function () { if (crashed) return; try { return fn.apply(this, arguments); } catch (e) { crash(e, kind); } };
    const api = {
      settings: state, colors, sfx,
      difficulty: state.difficulty,
      // 0 = easy, 1 = normal, 2 = hard
      level: { easy: 0, normal: 1, hard: 2 }[state.difficulty] ?? 1,
      reduceMotion: state.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
      best: state.best[game.id] || 0,
      // Board games with a bot can also be played by two people on one keyboard ("versus: true").
      // 'bot' or 'friend'; api.friend is the shortcut.
      // An online game reads as a 'friend' game: seat 0 is Player 1, seat 1 is Player 2.
      vs: online ? 'friend' : versusMode(game),
      online: online || null,
      get friend() { return api.vs === 'friend'; },
      // The snapshot this game returned from save() last time, or null. Restore from it in create().
      // A snapshot from the other mode (bot vs friend) is not resumed.
      saved: online ? null : savedFor(game),
      get ended() { return ended; },
      get touched() { return touched; },
      get paused() { return paused; },
      // true while a waitForMove game stands still before the first move; onStart(fn) runs fn when it starts
      get waiting() { return waiting; },
      onStart(fn) { if (!waiting) { fn(); return; } startCbs.push(fn); },
      rand: (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
      randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
      pick: arr => arr[Math.floor(Math.random() * arr.length)],
      on(target, type, fn, opts) {
        const wrapped = e => {
          // keyup and blur still reach the game while paused, so a key let go during the pause is not stuck down.
          if ((paused || ended) && type !== 'resize' && type !== 'keyup' && type !== 'blur') return;
          if (waiting && !crashed && startsRun(type, e)) startNow(e);
          // a one-button game: the press that started it is not also a move (it would drop / jump at once)
          if (tapStart && startEvent && e === startEvent) return;
          if (type === 'keydown' || type === 'pointerdown') touched = true;
          if (type === 'keydown' && e.key) held.set(e.key, e.code);
          if (type === 'keyup' && e.key) held.delete(e.key);
          if (crashed) return;
          // A press on a game's canvas keeps the pointer: a drag that leaves the panel (Mac or Windows) keeps reaching the
          // game until the button is let go, so steering never stops at the window edge.
          if (type === 'pointerdown' && target instanceof HTMLCanvasElement && e.pointerType !== 'touch') { try { target.setPointerCapture(e.pointerId); } catch (x) {} }
          try { fn(e); } catch (x) { crash(x, 'input'); }
        };
        target.addEventListener(type, wrapped, opts);
        cleanups.push(() => target.removeEventListener(type, wrapped, opts));
      },
      keys(fn) {
        api.on(window, 'keydown', e => {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
          if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return;
          fn(e);
        });
      },
      keysUp(fn) { api.on(window, 'keyup', fn); },
      swipe(fn, el) {
        el = el || stage;
        let sx = 0, sy = 0, down = false;
        api.on(el, 'pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; });
        api.on(el, 'pointerup', e => {
          if (!down) return; down = false;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { fn('tap', e); return; }
          fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), e);
        });
      },
      loop(fn) {
        let last = performance.now(), id = 0, t0 = last;
        const entry = { running: true, needsFrame: true };
        const tick = now => {
          if (!entry.running) return;
          const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // never negative: a reset can land after this frame began
          // While paused, draw one still frame (dt 0) when asked, e.g. right after a restore or a resize.
          const step = !paused || entry.needsFrame;
          entry.needsFrame = false;
          id = requestAnimationFrame(tick);
          if (step) {
            try { const d = paused || waiting ? 0 : dt; simTime += d; fn(d, (now - t0) / 1000); lastFrame = now; }
            catch (e) { if (!entry.failed) { entry.failed = true; crash(e, 'loop'); } }
          }
        };
        entry.reset = () => { last = performance.now(); };
        id = requestAnimationFrame(tick);
        loops.add(entry);
        cleanups.push(() => { entry.running = false; cancelAnimationFrame(id); });
        return entry;
      },
      timeout(fn, ms) { fn = guard(fn, 'timer'); const id = setTimeout(() => { if (crashed) return; if (!paused && !waiting) fn(); else api.timeout(fn, 60); }, ms); cleanups.push(() => clearTimeout(id)); return id; },
      // Full-stage canvas sized for the screen's pixel density. onResize(w, h) fires on start and on resize.
      canvas(onResize) {
        const c = document.createElement('canvas');
        stage.appendChild(c);
        const ctx = c.getContext('2d');
        const view = { canvas: c, ctx, w: 0, h: 0, dpr: 1 };
        const fit = notify => {
          const r = stage.getBoundingClientRect();
          const dpr = Math.min(3, window.devicePixelRatio || 1);
          view.w = Math.max(1, Math.round(r.width)); view.h = Math.max(1, Math.round(r.height)); view.dpr = dpr;
          c.width = Math.round(view.w * dpr); c.height = Math.round(view.h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (notify && onResize) onResize(view.w, view.h);
          if (notify) loops.forEach(l => { l.needsFrame = true; });
        };
        // Size now, but only call onResize after create() has returned (the game's own
        // variables, like the returned view, exist by then). ResizeObserver fires once on observe.
        fit(false);
        const ro = new ResizeObserver(() => fit(true)); ro.observe(stage);
        cleanups.push(() => ro.disconnect());
        return view;
      },
      score(n) {
        score = Math.max(0, Math.round(n));
        hooks.onScore(score);
      },
      addScore(d) { api.score(score + d); },
      getScore() { return score; },
      // End the run. opts: { score, title, won, message }
      over(opts) {
        if (ended) return;
        ended = true;
        opts = opts || {};
        const final = opts.score !== undefined ? opts.score : score;
        hooks.onOver(Object.assign({ score: final }, opts));
      },
      toast(text) { hooks.toast(text); }
    };
    if (waiting) { try { hooks.onWait && hooks.onWait(true, tapStart ? 'Tap to start' : 'Move to start', api.reduceMotion); } catch (x) {} }
    return {
      api,
      crash,
      get waiting() { return waiting; },
      get simTime() { return simTime; },
      get crashed() { return crashed; },
      // a loop that should be drawing has not finished a frame for this long (ms); 0 when nothing is expected
      stalledFor(now) { return !crashed && !paused && !ended && loops.size ? now - lastFrame : 0; },
      noteFrame() { lastFrame = performance.now(); },
      pause() { paused = true; loops.forEach(l => { l.needsFrame = true; }); },
      get ended() { return ended; },
      resume() {
        if (crashed) return;
        paused = false; lastFrame = performance.now(); loops.forEach(l => l.reset && l.reset());
        // A key let go while the panel was closed never sent keyup: release it now so nothing stays stuck down.
        const keys = [...held]; held.clear();
        keys.forEach(([key, code]) => window.dispatchEvent(new KeyboardEvent('keyup', { key, code })));
      },
      destroy() { cleanups.splice(0).forEach(fn => { try { fn(); } catch (e) {} }); loops.clear(); }
    };
  }

  // ---------- drawing helpers for games ----------
  const draw = {
    roundRect(ctx, x, y, w, h, r) {
      w = Math.max(0, w); h = Math.max(0, h);
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    },
    // The Claude spark (8 rounded rays). Used as the hero in several games.
    spark(ctx, x, y, r, color, rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
      ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.32);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const inner = r * 0.18, outer = i % 2 ? r * 0.78 : r;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); ctx.stroke();
      }
      ctx.restore();
    },
    text(ctx, s, x, y, size, color, weight, align) {
      ctx.fillStyle = color; ctx.font = `${weight || 650} ${size}px ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif`;
      ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
    },
    // Text kept inside maxW: shrinks to minSize, then splits onto two lines, then trims with an ellipsis.
    fitText(ctx, s, x, y, maxW, size, color, weight, minSize) {
      const font = sz => `${weight || 650} ${sz}px ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif`;
      const min = minSize || Math.max(9, size * 0.8);
      let sz = size; ctx.font = font(sz);
      while (sz > min && ctx.measureText(s).width > maxW) { sz -= 0.5; ctx.font = font(sz); }
      if (ctx.measureText(s).width <= maxW) { draw.text(ctx, s, x, y, sz, color, weight); return; }
      const words = s.split(' ');
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || m < best.m) best = { a, b, m };
      }
      const clip = t => { if (ctx.measureText(t).width <= maxW) return t; while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1); return t + '\u2026'; };
      if (best) { draw.text(ctx, clip(best.a), x, y - sz * 0.6, sz, color, weight); draw.text(ctx, clip(best.b), x, y + sz * 0.6, sz, color, weight); }
      else draw.text(ctx, clip(s), x, y, sz, color, weight);
    },
    ease: {
      // Clamped at 0: a tiny negative result (floating point at t = 0) sizing an arc throws and stops a game's loop.
      outBack: t => { const c = 1.7; return Math.max(0, 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)); },
      outCubic: t => 1 - Math.pow(1 - t, 3),
      inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    },
    lerp: (a, b, t) => a + (b - a) * t,
    // Player avatars, the same in every game: 'you' = Claude spark, 'bot' = the computer's robot face,
    // 'p1' / 'p2' = two people on one keyboard (spark in accent / spark in blue).
    P2: '#5b8def',
    avatar(ctx, x, y, r, who, c) {
      c = c || Ludus.colors();
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = who === 'bot' ? (c.dark ? '#3a3f47' : '#e4e7ec') : (c.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)');
      ctx.fill();
      if (who === 'bot') {
        const s = r * 0.62, ink = c.dark ? '#cfd5de' : '#4a5260';
        ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.62); ctx.lineTo(x, y - s * 0.95); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - s * 1.0, r * 0.1, 0, Math.PI * 2); ctx.fill();
        draw.roundRect(ctx, x - s * 0.78, y - s * 0.6, s * 1.56, s * 1.2, s * 0.32); ctx.fill();
        ctx.fillStyle = c.dark ? '#3a3f47' : '#e4e7ec';
        ctx.beginPath(); ctx.arc(x - s * 0.34, y - s * 0.05, s * 0.17, 0, Math.PI * 2); ctx.arc(x + s * 0.34, y - s * 0.05, s * 0.17, 0, Math.PI * 2); ctx.fill();
      } else {
        draw.spark(ctx, x, y, r * 0.66, who === 'p2' ? draw.P2 : c.accent, 0);
      }
      ctx.restore();
    },
    // Standard header for every game with two sides. opts: { left:{who,label,score,pips,of}, right:{...},
    // turn:'left'|'right'|null, status:'Your move', thinking:true }. Returns the header height.
    duelHeader(ctx, x, y, w, opts, c) {
      c = c || Ludus.colors();
      const h = 40, pw = Math.min(132, w * 0.34), t = performance.now() / 1000;
      const side = (o, px, right) => {
        if (!o) return;
        const active = opts.turn === (right ? 'right' : 'left');
        ctx.save();
        draw.roundRect(ctx, px, y, pw, h, 12);
        ctx.fillStyle = c.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; ctx.fill();
        // whose turn it is: the active card gets a tinted fill, a thick coloured edge and a pulsing dot; the waiting card fades back
        const sideCol = o.who === 'bot' ? c.ink3 : (o.who === 'p2' ? draw.P2 : c.accent);
        if (active) {
          ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = sideCol; ctx.fill(); ctx.restore();
          ctx.strokeStyle = sideCol; ctx.lineWidth = 2.5; ctx.stroke();
          const dotX = right ? px + 9 : px + pw - 9;
          ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5); ctx.beginPath(); ctx.arc(dotX, y + 9, 3.2, 0, Math.PI * 2); ctx.fillStyle = sideCol; ctx.fill(); ctx.restore();
        } else if (opts.turn === 'left' || opts.turn === 'right') ctx.globalAlpha = 0.6;
        const ax = right ? px + pw - 20 : px + 20;
        draw.avatar(ctx, ax, y + h / 2, 13, o.who, c);
        const tx = right ? ax - 19 : ax + 19, align = right ? 'right' : 'left';
        // a long player name shrinks, then is trimmed with an ellipsis, so it never runs into the middle of the header
        let lab = String(o.label || (o.who === 'bot' ? 'Bot' : 'You')), lsz = 11.5;
        const labMax = pw - 46;
        ctx.font = `650 ${lsz}px ui-rounded, system-ui, sans-serif`;
        while (lsz > 9.5 && ctx.measureText(lab).width > labMax) { lsz -= 0.5; ctx.font = `650 ${lsz}px ui-rounded, system-ui, sans-serif`; }
        while (lab.length > 1 && ctx.measureText(lab).width > labMax) { lab = lab.slice(0, -1); }
        draw.text(ctx, lab, tx, y + 13, lsz, c.ink, 650, align);
        if (o.of) {
          for (let i = 0; i < o.of; i++) {
            const dx = right ? tx - i * 9 - 3 : tx + i * 9 + 3;
            ctx.beginPath(); ctx.arc(dx, y + 28, 3, 0, Math.PI * 2);
            ctx.fillStyle = i < (o.pips || 0) ? (o.who === 'bot' ? c.ink2 : (o.who === 'p2' ? draw.P2 : c.accent)) : c.line; ctx.fill();
          }
        } else if (o.score !== undefined) {
          draw.text(ctx, String(o.score), tx, y + 28, 13, c.ink, 700, align);
        }
        if (active && o.who === 'bot' && opts.thinking) {
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.9));
            ctx.beginPath(); ctx.arc(ax - 6 + i * 6, y + h + 6, 2, 0, Math.PI * 2); ctx.fillStyle = c.ink2; ctx.fill();
          }
        }
        ctx.restore();
      };
      side(opts.left, x, false);
      side(opts.right, x + w - pw, true);
      let status = opts.status;
      if (!status && (opts.turn === 'left' || opts.turn === 'right')) {   // a game that sends no text still says whose turn it is
        const o = opts.turn === 'left' ? opts.left : opts.right;
        status = o ? (o.who === 'you' && (!o.label || o.label === 'You') ? 'Your turn' : String(o.label || (o.who === 'bot' ? 'Bot' : 'Player')) + '\u2019s turn') : '';
      }
      if (status) draw.fitText(ctx, status, x + w / 2, y + h / 2, Math.max(40, w - 2 * pw - 16), 12, c.accent, 650, 10);
      return h;
    }
  };

  window.Ludus = { games, state, save, native, sfx, colors, draw, makeApi, register(g) { games.push(g); } };
})();
