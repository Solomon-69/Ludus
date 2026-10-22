/* Ludus shell: home grid, game screen, settings. Talks to the Mac app through Ludus.native(). */
(function () {
  const L = window.Ludus;
  const S = L.state;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const ACCENTS = ['#d97757', '#5b8def', '#4f9d69', '#9b6dd6', '#e0a526', '#e05d8b', '#3aa6a6'];
  const FILTERS = ['All', 'Arcade', 'Puzzle', 'Duel', '2 Player'];
  const TWO = '2 Player';
  const REVEAL_MS = 1200;   // how long the final board stays on screen before the result bar slides up
  const SAVE_EVERY_MS = 4000;
  const DIFFS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];
  const THEMES = [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
  const SIZES = [['compact', 'Compact'], ['large', 'Large']];

  let current = null;       // { game, run, instance }
  let view = 'home';
  let sysDark = matchMedia('(prefers-color-scheme: dark)');
  let overAt = 0;           // when the result bar appeared (keys are armed 300 ms later)
  let revealTimer = null;
  let launchTimer = null;

  // ---------- theme ----------
  function applyTheme() {
    const dark = S.theme === 'dark' || (S.theme === 'system' && (window.__LUDUS_DARK__ ?? sysDark.matches));
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', S.accent);
    root.style.setProperty('--accent-soft', S.accent + '26');
    root.classList.toggle('reduce', !!S.reduceMotion);
    L.native('theme', { mode: S.theme });
    // On Auto the Mac's own panel material shows through; a picked Light or Dark paints its own solid background.
    root.classList.toggle('transparent', !!window.__LUDUS_NATIVE__ && S.theme === 'system');
    if (view === 'home') drawCards();
  }
  sysDark.addEventListener('change', applyTheme);
  window.ludusSetSystemDark = d => { window.__LUDUS_DARK__ = d; applyTheme(); renderCards(); };

  // ---------- views ----------
  function show(next) {
    const order = { home: 0, game: 1, settings: 1 };
    ['home', 'game', 'settings'].forEach(v => {
      const el = $(v);
      el.classList.toggle('is-active', v === next);
      el.classList.toggle('is-behind', v !== next && order[v] < order[next]);
    });
    view = next;
  }

  // ---------- home ----------
  function visibleGames() {
    return L.games.filter(g => !S.hidden.includes(g.id) && (S.filter === 'All' || g.tag === S.filter));
  }
  function renderFilters() {
    const f = $('filters'); f.innerHTML = '';
    FILTERS.forEach(name => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.filter === name ? ' is-on' : '');
      b.textContent = name; b.setAttribute('role', 'tab');
      b.onclick = () => { S.filter = name; L.save(); L.sfx('click'); renderFilters(); renderCards(); };
      f.appendChild(b);
    });
  }
  function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n); }
  function renderCards() {
    const grid = $('grid'); grid.innerHTML = '';
    const list = visibleGames();
    const lastGame = S.filter === 'All' && L.games.find(g => g.id === S.last && !S.hidden.includes(g.id));
    const rest = list.filter(g => g !== lastGame);
    // In "All", the games for two people on one keyboard get their own section at the end.
    const solo = S.filter === 'All' ? rest.filter(g => g.tag !== TWO) : rest;
    const duo = S.filter === 'All' ? rest.filter(g => g.tag === TWO) : [];
    const ordered = [...(lastGame ? [lastGame] : []), ...solo, ...duo];
    ordered.forEach((g, i) => {
      if (duo.length && g === duo[0]) grid.appendChild(el('div', 'section-label', '2 players, one keyboard'));
      const b = document.createElement('button');
      const feature = lastGame && i === 0;
      b.className = 'card' + (feature ? ' feature' : '');
      b.style.setProperty('--i', i);
      b.style.setProperty('--tint', g.tint);
      b.dataset.id = g.id;
      const best = S.best[g.id] || 0;
      b.innerHTML = `<div class="art"><canvas></canvas></div>
        <div><div class="tag">${feature ? 'Continue' : g.tag}${S.saves[g.id] ? '<i class="saved-dot">In progress</i>' : ''}</div>
        <div class="card-name">${g.name}</div>
        <div class="card-meta"><span>${g.tag === TWO ? 'Played' : g.tag === 'Duel' ? 'Wins' : 'Best'}</span><b>${fmt(g.tag === TWO ? (S.plays[g.id] || 0) : best)}</b></div></div>`;
      b.onclick = () => start(g.id);
      grid.appendChild(b);
    });
    if (!ordered.length) grid.innerHTML = '<div class="foot" style="grid-column:span 2">No games here yet.</div>';
    requestAnimationFrame(drawCards);
  }
  function drawCards() {
    const c = L.colors();
    document.querySelectorAll('.card').forEach(card => {
      const g = L.games.find(x => x.id === card.dataset.id);
      const cv = card.querySelector('canvas');
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(3, devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      try { g.art && g.art(ctx, r.width, r.height, c); } catch (e) { /* a broken thumbnail must not break the grid */ }
    });
  }
  function replayCards() {
    document.querySelectorAll('.card').forEach(c => { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
  }

  // ---------- game screen ----------
  function setScore(n) {
    const el = $('scoreNow');
    if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function start(id) {
    const g = L.games.find(x => x.id === id);
    if (!g) return;
    stop();
    S.last = id; S.plays[id] = (S.plays[id] || 0) + 1; L.save();
    $('gameName').textContent = g.name;
    $('scoreNow').textContent = '0';
    $('scoreBest').textContent = fmt(S.best[id] || 0);
    $('scoreBest').parentElement.hidden = g.tag === TWO;   // no high score between two people
    $('hint').innerHTML = S.hints ? (g.hint || '') : '';
    hideOver();
    $('pauseSheet').hidden = true;
    show('game');
    L.sfx('tap');
    // The card that was clicked keeps keyboard focus otherwise, and Enter in a game would click it again.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // Wait for the slide-in so the stage has its final size.
    clearTimeout(launchTimer);
    launchTimer = setTimeout(() => {
      if (view !== 'game') return;
      launch(g);
      if (!current || !S.saves[id]) return;
      // Only greet "Welcome back" when the game really restored its snapshot; a rejected one is dropped.
      let restored = null;
      try { restored = current.instance.save ? current.instance.save() : null; } catch (e) { restored = null; }
      if (restored) { pause(); $('pauseTitle').textContent = 'Welcome back'; $('pauseSheet').classList.add('welcome'); }
      else forget(id);
    }, 60);
    L.native('playing', { id });
  }
  function launch(g) {
    const stage = $('stage'); stage.innerHTML = '';
    clearTimeout(revealTimer);
    const run = L.makeApi(g, stage, {
      onScore: setScore,
      onOver: res => finish(g, res),
      toast
    });
    current = { game: g, run, instance: null };
    try { current.instance = g.create(stage, run.api) || {}; }
    catch (e) {
      // A saved game that no longer loads must not lock the player out: drop it and start fresh.
      if (run.api.saved) { delete S.saves[g.id]; L.save(); run.destroy(); return launch(g); }
      const msg = el('div', 'foot', ''); msg.style.padding = '40px'; msg.textContent = 'This game hit a problem: ' + e.message;
      stage.innerHTML = ''; stage.appendChild(msg);
    }
    if (current.instance && current.instance.save) current.saver = setInterval(() => { if (!run.api.paused) persist(); }, SAVE_EVERY_MS);
  }
  // Keep the running game's snapshot so leaving and coming back finds it exactly as it was.
  function persist() {
    if (!current || current.run.ended || !current.instance || !current.instance.save) return;
    const id = current.game.id;
    try {
      const snap = current.instance.save();
      // null means "nothing to resume" (not started, or already lost): drop any older snapshot.
      if (snap) { S.saves[id] = snap; L.save(); } else forget(id);
    } catch (e) { forget(id); }   // a game that cannot snapshot starts fresh next time
  }
  function forget(id) { if (S.saves[id]) { delete S.saves[id]; L.save(); } }
  function stop() {
    clearTimeout(launchTimer);
    if (!current) return;
    if (current.run.ended) forget(current.game.id);   // left during the end-of-game reveal: the run is over
    clearInterval(current.saver); clearTimeout(revealTimer);
    try { current.instance && current.instance.destroy && current.instance.destroy(); } catch (e) {}
    current.run.destroy();
    $('stage').innerHTML = '';
    current = null;
  }
  function finish(g, res) {
    const prev = S.best[g.id] || 0;
    const record = res.score > prev && g.tag !== TWO;
    if (record) { S.best[g.id] = res.score; $('scoreBest').textContent = fmt(res.score); }
    forget(g.id); L.save();
    $('overTitle').textContent = res.title || (res.won ? 'You win' : 'Game over');
    $('overScore').textContent = res.score;
    const best = $('overBest');
    best.textContent = record && res.score > 0 ? 'New best' : (res.message || (g.tag === TWO ? '' : `Best ${fmt(Math.max(prev, res.score))}`));
    best.classList.toggle('record', record && res.score > 0);
    L.sfx(res.won || record ? 'win' : 'over');
    // Let the final board play out (bombs revealed, last move shown) before the result bar comes up.
    clearTimeout(revealTimer);
    const run = current && current.run;
    revealTimer = setTimeout(() => {
      if (run && current && current.run === run) run.pause();
      $('overSheet').hidden = false; $('overPeek').hidden = true; overAt = performance.now();
    }, window.ludusRevealMs ?? REVEAL_MS);
  }
  function hideOver() { clearTimeout(revealTimer); $('overSheet').hidden = true; $('overPeek').hidden = true; }
  function overShown() { return !$('overSheet').hidden || !$('overPeek').hidden; }
  function revealing() { return !!(current && current.run.ended && !overShown()); }
  function restart() {
    if (!current) return;
    const g = current.game; forget(g.id); stop();
    hideOver(); $('pauseSheet').hidden = true;
    $('scoreNow').textContent = '0';
    launch(g);
  }
  function pause() {
    if (!current || current.run.ended || !$('pauseSheet').hidden) return;
    $('pauseTitle').textContent = 'Paused'; $('pauseSheet').classList.remove('welcome');
    current.run.pause(); current.instance && current.instance.pause && current.instance.pause();
    $('pauseSheet').hidden = false;
  }
  function resume() {
    if (!current) return;
    $('pauseSheet').hidden = true;
    current.run.resume(); current.instance && current.instance.resume && current.instance.resume();
  }
  function goHome() { persist(); stop(); hideOver(); show('home'); renderCards(); L.native('playing', { id: null }); }

  $('backBtn').onclick = goHome;
  $('quitBtn').onclick = goHome;
  $('overQuitBtn').onclick = goHome;
  $('pauseBtn').onclick = pause;
  $('resumeBtn').onclick = resume;
  $('restartBtn').onclick = restart;
  $('againBtn').onclick = restart;
  $('overHideBtn').onclick = () => { $('overSheet').hidden = true; $('overPeek').hidden = false; };
  $('overPeek').onclick = () => { $('overPeek').hidden = true; $('overSheet').hidden = false; overAt = performance.now(); };
  window.addEventListener('keydown', e => {
    if (view === 'game') {
      if (revealing()) { if (e.key === 'Escape') e.preventDefault(); return; }
      if (overShown()) {
        const armed = performance.now() - overAt > 300;   // a key still held from the last move must not restart
        if (e.key === 'Escape') { e.preventDefault(); goHome(); }
        else if (armed && (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R')) { e.preventDefault(); restart(); }
        return;
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (!$('pauseSheet').hidden) resume(); else pause();
      }
    } else if (view === 'settings' && e.key === 'Escape') { show('home'); renderCards(); }
  });
  window.addEventListener('pagehide', persist);

  // ---------- settings ----------
  function toast(text) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; $('app').appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1600);
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function row(title, sub, control, extra) {
    const r = el('div', 'row' + (extra ? ' ' + extra : ''));
    const t = el('div', 'row-text'); t.appendChild(el('div', 'row-title', title));
    if (sub) t.appendChild(el('div', 'row-sub', sub));
    r.appendChild(t); if (control) r.appendChild(control);
    return r;
  }
  function sw(on, onChange, label) {
    const b = el('button', 'switch'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on));
    if (label) b.setAttribute('aria-label', label);
    b.onclick = () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); L.sfx('click'); onChange(v); };
    return b;
  }
  function seg(options, value, onChange) {
    const s = el('div', 'seg'); const thumb = el('div', 'seg-thumb'); s.appendChild(thumb);
    const btns = options.map(([v, label]) => {
      const b = el('button', v === value ? 'is-on' : '', label);
      b.onclick = () => { btns.forEach(x => x.classList.remove('is-on')); b.classList.add('is-on'); place(b); L.sfx('click'); onChange(v); };
      s.appendChild(b); return b;
    });
    const place = b => { thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 2}px)`; };
    requestAnimationFrame(() => { const on = btns.find(b => b.classList.contains('is-on')); if (on) { thumb.style.transition = 'none'; place(on); void thumb.offsetWidth; thumb.style.transition = ''; } });
    return s;
  }
  function group(label, rows) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div', 'group-label', label));
    const g = el('div', 'group'); rows.forEach(r => g.appendChild(r)); frag.appendChild(g);
    return frag;
  }
  function renderSettings() {
    const body = $('settingsBody'); body.innerHTML = '';
    const sw8 = el('div', 'swatches');
    ACCENTS.forEach(c => {
      const b = el('button', 'swatch' + (S.accent === c ? ' is-on' : '')); b.style.setProperty('--c', c); b.setAttribute('aria-label', 'Accent ' + c);
      b.onclick = () => { S.accent = c; L.save(); applyTheme(); sw8.querySelectorAll('.swatch').forEach(x => x.classList.toggle('is-on', x === b)); L.sfx('click'); };
      sw8.appendChild(b);
    });
    const vol = el('input', 'range'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = S.volume;
    vol.oninput = () => { S.volume = +vol.value; L.save(); }; vol.onchange = () => L.sfx('score');
    body.appendChild(group('Look', [
      row('Appearance', null, seg(THEMES, S.theme, v => { S.theme = v; L.save(); applyTheme(); })),
      row('Accent colour', null, sw8),
      row('Panel size', 'Large gives the games more room', seg(SIZES, S.size, v => { S.size = v; L.save(); L.native('size', { size: v }); })),
      row('Reduce motion', 'Calmer animations everywhere', sw(S.reduceMotion, v => { S.reduceMotion = v; L.save(); applyTheme(); }, 'Reduce motion'))
    ]));
    body.appendChild(group('Play', [
      row('Difficulty', 'Speed and how clever the computer is', seg(DIFFS, S.difficulty, v => { S.difficulty = v; L.save(); })),
      row('Sound', null, sw(S.sound, v => { S.sound = v; L.save(); if (v) L.sfx('score'); }, 'Sound')),
      row('Volume', null, vol),
      row('Show controls under games', null, sw(S.hints, v => { S.hints = v; L.save(); }, 'Show controls')),
      row('Open on', 'What you see when the panel opens', seg([['home', 'All games'], ['last', 'Last game']], S.startOn, v => { S.startOn = v; L.save(); }))
    ]));
    const appRows = [];
    if (window.__LUDUS_NATIVE__) {
      appRows.push(row('Open at login', null, sw(!!window.__LUDUS_LOGIN__, v => { window.__LUDUS_LOGIN__ = v; L.native('login', { on: v }); }, 'Open at login')));
      // Mac only: the Mac app hands over __LUDUS_INVISIBLE__ (the Windows tray has no such option).
      if (typeof window.__LUDUS_INVISIBLE__ === 'boolean') appRows.push(row('Invisible icon', 'Hidden in the menu bar. Click the empty space at the far left of your menu bar icons to open',
        sw(!!window.__LUDUS_INVISIBLE__, v => { window.__LUDUS_INVISIBLE__ = v; L.native('invisible', { on: v }); }, 'Invisible icon')));
    }
    const reset = el('button', 'small-btn bad', 'Reset');
    reset.onclick = () => {
      if (reset.dataset.armed) { S.best = {}; S.plays = {}; S.last = null; L.save(); renderCards(); toast('Scores cleared'); reset.textContent = 'Reset'; delete reset.dataset.armed; return; }
      reset.dataset.armed = '1'; reset.textContent = 'Sure?'; setTimeout(() => { reset.textContent = 'Reset'; delete reset.dataset.armed; }, 2500);
    };
    appRows.push(row('Reset best scores', 'Clears every high score', reset, 'danger'));
    if (window.__LUDUS_NATIVE__) {
      const q = el('button', 'small-btn', 'Quit'); q.onclick = () => L.native('quit');
      appRows.push(row('Quit Ludus', null, q));
    }
    body.appendChild(group('App', appRows));
    body.appendChild(el('div', 'foot', 'Ludus 1.5'));
  }
  $('openSettings').onclick = () => { renderSettings(); show('settings'); L.sfx('tap'); };
  $('settingsBack').onclick = () => { show('home'); renderCards(); };

  // ---------- native hooks ----------
  window.ludusOpened = () => {
    // The panel taking keyboard focus must not draw a focus ring on the first button.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (view === 'home') replayCards();
    if (view === 'game' && current && !$('pauseSheet').hidden) { /* stay paused until the player resumes */ }
  };
  window.ludusClosed = () => { if (view === 'game') { persist(); pause(); } L.save(true); };
  window.ludusOpenGame = id => start(id);
  // Test helper: end the current run as if the game called api.over (used by QA/shell-test.js).
  window.ludusTestOver = score => { if (current) current.run.api.over({ score }); };
  window.ludusState = () => JSON.stringify({ view, game: current && current.game.id, score: $('scoreNow').textContent, paused: !$('pauseSheet').hidden, over: overShown(), revealing: revealing(), games: L.games.length, theme: root.dataset.theme, saved: Object.keys(S.saves) });

  // ---------- boot ----------
  if (S.hidden.length) { S.hidden = []; L.save(); }   // the "Games shown" setting is gone: every game shows
  if (!ACCENTS.includes(S.accent)) { S.accent = ACCENTS[0]; L.save(); }   // e.g. the removed second orange
  applyTheme();
  renderFilters();
  renderCards();
  if (S.startOn === 'last' && S.last && L.games.some(g => g.id === S.last)) start(S.last);
})();
