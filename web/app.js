/* Ludus shell: home grid, game screen, settings. Talks to the Mac app through Ludus.native(). */
(function () {
  const L = window.Ludus;
  const S = L.state;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const ACCENTS = ['#d97757', '#5b8def', '#4f9d69', '#9b6dd6', '#e0a526', '#e05d8b', '#3aa6a6'];
  const FILTERS = ['All', 'Arcade', 'Puzzle', 'Duel', '2 Player', 'Online'];   // 2, 3 and 4 player online play all live under Online
  const ONLINE = 'Online';                 // the tab that opens the Online page instead of a list of games
  const TWO = '2 Player';
  const PARTY = '3-4 Player';              // games that 3 or 4 people can play together (online, some also on one keyboard)
  const party = g => !!(g.online && g.online.max >= 3);
  // ---------- custom game names (Settings > Rename games) ----------
  // Off: every name is the original. On: a name the player typed (kept in S.names, also while switched off) replaces it.
  const NAME_MAX = 24;
  const customName = g => (S.renameGames && S.names && typeof S.names[g.id] === 'string' && S.names[g.id].trim()) || '';
  const dispName = g => customName(g) || g.name;
  L.displayName = dispName;
  const REVEAL_MS = 1200;   // how long the final board stays on screen before the result bar slides up
  const SAVE_EVERY_MS = 4000;
  const SLIDE_MS = 60;          // the game screen's slide-in, before a game is started
  const RESIZE_WAIT_MS = 400;   // longest wait for the app to confirm a panel resize (ludusResized)
  const DIFFS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];
  const THEMES = [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
  const SIZES = [['compact', 'Compact'], ['large', 'Large']];

  let current = null;       // { game, run, instance }
  let view = 'home';
  let sysDark = matchMedia('(prefers-color-scheme: dark)');
  let overAt = 0;           // when the result bar appeared (keys are armed 300 ms later)
  let revealTimer = null;
  let launchTimer = null;
  let pendingLaunch = null; // { go, at }: the game waiting for the panel to reach its size
  let online = null;        // a room in progress or being set up: { game, session, started }; null = local play

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

  // ---------- wide or tall ----------
  // The .io games work in either shape; the button next to Pause flips the panel and remembers the choice.
  const ORIENT = new Set(['slither', 'holeio', 'paperio']);
  function wideFor(g) { return ORIENT.has(g.id) ? !!(S.orient && S.orient[g.id]) : !!g.wide; }
  function renderOrient(g) {
    const b = $('orientBtn'); b.hidden = !ORIENT.has(g.id);
    const icon = () => { b.classList.toggle('is-wide', wideFor(g)); $('orientUse').setAttribute('href', wideFor(g) ? '#i-rotate-back' : '#i-rotate'); };
    icon();
    b.onclick = () => {
      if (!S.orient) S.orient = {};
      S.orient[g.id] = !wideFor(g); L.save(); L.sfx('click');
      icon();
      L.native('wide', { on: wideFor(g), animate: true });
      b.blur();
    };
  }

  // ---------- home ----------
  // Search box: matches a game's name, its group and its older Ludus name, ignoring case and accents.
  let query = '';
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const matches = g => { const q = norm(query); return !q || q.split(' ').every(w => norm([g.name, customName(g), g.tag, g.aka, g.id].join(' ')).includes(w)); };
  function visibleGames() {
    if (norm(query)) {   // best match first: the name starting with what you typed, then a word of the name, then anything else
      const q = norm(query), rank = g => { const n = norm(customName(g) || g.name); return n.startsWith(q) ? 3 : (' ' + n).includes(' ' + q) ? 2 : n.includes(q) ? 1 : 0; };
      return L.games.filter(g => !S.hidden.includes(g.id) && matches(g)).map((g, i) => [g, rank(g), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
    }
    return L.games.filter(g => !S.hidden.includes(g.id) && (S.filter === 'All' || g.tag === S.filter || (S.filter === TWO && g.versus) || (S.filter === PARTY && party(g))));
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
  // ---------- the Online page: make a room or join one ----------
  function renderOnlinePage(grid) {
    // The blocks (heading, name, last party, Create room, joining) share the page's full height with equal gaps
    // between them, so there is no empty band at the bottom; the panel itself keeps the same size as every other tab.
    const page = el('div', 'online-page'), head = el('div', 'op-group op-head'), join = el('div', 'op-group');
    page.appendChild(head); const mid = { appendChild: e => page.appendChild(e) };
    head.appendChild(el('div', 'op-title', 'Play online'));
    const steps = el('ol', 'op-steps');   // three short steps instead of a long sentence; each wraps to two lines when narrow
    ['Create or join a room', 'Share the code', 'Host picks games'].forEach((t, i) => { const li = el('li'); li.appendChild(el('span', 'op-dot', String(i + 1))); li.appendChild(el('span', '', t)); steps.appendChild(li); });
    head.appendChild(steps);
    const f = el('label', 'field');
    f.appendChild(el('span', 'field-label', 'Your name (optional)'));
    const nm = el('input'); nm.type = 'text'; nm.maxLength = 10; nm.placeholder = 'Player'; nm.value = L.net.cleanName(S.onlineName, ''); nm.autocomplete = 'off'; nm.spellcheck = false; nm.setAttribute('aria-label', 'Your name');
    nm.addEventListener('input', () => { S.onlineName = L.net.cleanName(nm.value, ''); L.save(); });
    f.appendChild(nm); mid.appendChild(f);
    if (S.party && S.party.code) mid.appendChild(partyCard(S.party));
    const mk = el('button', 'btn primary', 'Create room'); mk.type = 'button'; mk.id = 'opCreate';
    mk.onclick = () => { L.sfx('click'); createFlexRoom(); };
    mid.appendChild(mk);
    join.appendChild(el('div', 'op-or', 'or join a room'));
    const code = el('input', 'code-input'); code.type = 'text'; code.maxLength = 300; code.placeholder = 'K7M2Q'; code.id = 'opCode';
    code.autocomplete = 'off'; code.spellcheck = false; code.autocapitalize = 'characters'; code.setAttribute('aria-label', 'Room code, invite or link');
    const msg = el('div', 'lobby-error', ''); msg.setAttribute('role', 'alert');
    const go = () => { const c = L.net.extractCode(code.value) || L.net.cleanCode(code.value); if (!L.net.validCode(c)) { msg.textContent = 'Room codes are 5 letters or digits.'; code.focus(); return; } msg.textContent = 'Joining room ' + c + '...'; L.sfx('click'); joinFromInvite(c, true); };
    code.addEventListener('input', () => { const v = code.value, m = L.net.extractCode(v); code.value = m || L.net.cleanCode(v); msg.textContent = !m && v.replace(/\s/g, '').length > 6 ? 'No room code found in that text.' : ''; });
    code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const jb = el('button', 'btn primary', 'Join'); jb.type = 'button'; jb.id = 'opJoin'; jb.onclick = go;
    const jr = el('div', 'join-row'); jr.appendChild(code); jr.appendChild(jb);   // the code and the Join button side by side
    join.appendChild(jr); join.appendChild(msg);
    join.appendChild(el('p', 'lobby-note', 'Code, invite message or ludus:// link. Needs the internet.'));
    page.appendChild(join);
    grid.appendChild(page);
  }
  // The last room you were in: an orange "Last party · <game>" tag on top, then the players as small name chips (a
  // crown on the host's) with Forget and Rejoin on the right.
  function partyCard(p) {
    const card = el('div', 'party-card');
    const games = (p.games || []).map(id => { const g = L.games.find(x => x.id === id); return g ? dispName(g) : id; });
    const gameLabel = games.length ? games[0] + (games.length > 1 ? ' +' + (games.length - 1) : '') : '';
    const tag = el('span', 'party-tag', 'Last party' + (gameLabel ? ' \u00b7 ' + gameLabel : ''));
    tag.title = games.join(', ');
    card.appendChild(tag);
    // never cut off: if the full tag does not fit, it shows just the game
    requestAnimationFrame(() => { if (gameLabel && tag.scrollWidth > tag.clientWidth + 1) tag.textContent = gameLabel; });
    const row = el('div', 'party-row'), ppl = el('div', 'party-people');
    (p.names || []).filter(Boolean).forEach((n, i) => {
      const c = el('span', 'party-chip'), av = el('i', 'party-av');
      av.textContent = String(n).trim().charAt(0).toUpperCase() || '?'; av.style.setProperty('--c', PARTY_COLS[i % PARTY_COLS.length]);
      c.appendChild(av); c.appendChild(document.createTextNode(n));
      if (i === 0) { const cr = el('span', 'party-crown', CROWN); cr.setAttribute('role', 'img'); cr.setAttribute('aria-label', 'Host'); cr.title = 'Host'; c.appendChild(cr); }
      ppl.appendChild(c);
    });
    const acts = el('div', 'party-acts');
    const fg = el('button', 'btn small ghost', 'Forget'); fg.type = 'button'; fg.id = 'opForget'; fg.onclick = () => { L.sfx('click'); S.party = null; L.save(); renderCards(); };
    const rj = el('button', 'btn small primary', 'Rejoin'); rj.type = 'button'; rj.id = 'opRejoin'; rj.onclick = () => { L.sfx('click'); rejoinParty(); };
    acts.appendChild(fg); acts.appendChild(rj);
    row.appendChild(ppl); row.appendChild(acts); card.appendChild(row);
    return card;
  }
  const CROWN = '<svg viewBox="0 0 16 12" width="12" height="9" aria-hidden="true"><path d="M1 3.2 4.6 6 8 1l3.4 5L15 3.2 13.6 11H2.4z" fill="currentColor"/></svg>';
  const PARTY_COLS = ['#d97757', '#5b8def', '#4f9d69', '#9b6dd6'];   // the seat colours used in online games
  function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n); }
  function renderCards() {
    const grid = $('grid'); grid.innerHTML = '';
    const list = visibleGames();
    const searching = !!norm(query);
    if (S.filter === ONLINE && !searching) { renderOnlinePage(grid); return; }
    const lastGame = !searching && S.filter === 'All' && L.games.find(g => g.id === S.last && !S.hidden.includes(g.id));
    const rest = list.filter(g => g !== lastGame);
    // In "All", the games for two people on one keyboard get their own section at the end.
    const all = S.filter === 'All' && !searching;
    const solo = all ? rest.filter(g => g.tag !== TWO) : rest;
    const duo = all ? rest.filter(g => g.tag === TWO) : [];
    // Searching: the best match leads as a highlighted card, then similar games fill the screen.
    const best0 = searching ? list[0] : null;
    const related = searching && best0 ? L.games.filter(g => !S.hidden.includes(g.id) && !list.includes(g)).sort((x, y) => {
      const sc = g => (g.tag === best0.tag ? 3 : 0) + (!!g.versus === !!best0.versus ? 1 : 0) + (g.tag === 'Puzzle' && best0.tag === 'Puzzle' ? 1 : 0);
      return sc(y) - sc(x);
    }).slice(0, 8) : [];
    const ordered = searching ? [...list, ...related] : [...(lastGame ? [lastGame] : []), ...solo, ...duo];
    ordered.forEach((g, i) => {
      if (duo.length && g === duo[0]) grid.appendChild(el('div', 'section-label', '2 players, one keyboard'));
      if (searching && related.length && g === related[0]) grid.appendChild(el('div', 'section-label', 'Related games'));
      const b = document.createElement('button');
      const found = searching && best0 && g === best0, feature = (lastGame && i === 0) || found;
      b.className = 'card' + (feature ? ' feature' : '') + (found ? ' found' : '');
      b.style.setProperty('--i', i);
      b.style.setProperty('--tint', g.tint);
      b.dataset.id = g.id;
      const best = S.best[g.id] || 0;
      b.innerHTML = `<div class="art"><canvas></canvas></div>
        <div><div class="tag">${found ? 'Best match' : feature ? 'Continue' : g.tag}${S.saves[g.id] ? '<i class="saved-dot">In progress</i>' : ''}</div>
        <div class="card-name"></div>
        <div class="card-meta"><span>${g.tag === TWO ? 'Played' : g.tag === 'Duel' ? 'Wins' : 'Best'}</span><b>${fmt(g.tag === TWO ? (S.plays[g.id] || 0) : best)}</b></div></div>`;
      fillName(b.querySelector('.card-name'), g, () => renderCards());
      b.onclick = () => start(g.id);
      grid.appendChild(b);
    });
    if (!ordered.length) grid.innerHTML = `<div class="foot" style="grid-column:span 2">${norm(query) ? 'No games match \u201c' + query.replace(/[<>&]/g, '') + '\u201d' : 'No games here yet.'}</div>`;
    requestAnimationFrame(drawCards);
  }
  // Puts the game's name in el. In rename mode the name is a small button that opens the rename sheet
  // (a click on it never opens the game); after a save, done() redraws whatever shows the name.
  function fillName(el, g, done) {
    el.textContent = ''; el.title = '';
    root.classList.toggle('renaming', !!S.renameGames);
    if (!S.renameGames) { el.textContent = g.name; return; }
    const n = document.createElement('span');
    n.className = 'rename-name'; n.textContent = dispName(g); n.setAttribute('role', 'button'); n.tabIndex = 0;
    n.title = customName(g) ? g.name + ' \u00b7 click to rename' : 'Click to rename';
    n.setAttribute('aria-label', 'Rename ' + dispName(g));
    const open = e => { e.preventDefault(); e.stopPropagation(); openRename(g, done); };
    n.addEventListener('click', open);
    n.addEventListener('pointerdown', e => e.stopPropagation());
    n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    el.appendChild(n);
  }
  let renameSheet = null;
  function openRename(g, done) {
    if (!renameSheet) {
      renameSheet = document.createElement('div'); renameSheet.className = 'sheet rename-sheet'; renameSheet.setAttribute('role', 'dialog'); renameSheet.setAttribute('aria-modal', 'true'); renameSheet.setAttribute('aria-label', 'Rename game');
      document.body.appendChild(renameSheet);
    }
    const sh = renameSheet; sh.innerHTML = ''; sh.hidden = false;
    const card = document.createElement('div'); card.className = 'lobby-card rename-card';
    const t = document.createElement('div'); t.className = 'sheet-title'; t.textContent = 'Rename game'; card.appendChild(t);
    const sub = document.createElement('p'); sub.className = 'lobby-sub'; sub.textContent = 'Original name: ' + g.name; card.appendChild(sub);
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = NAME_MAX; input.value = dispName(g); input.placeholder = g.name;
    input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'New name for ' + g.name);
    card.appendChild(input);
    const count = document.createElement('div'); count.className = 'rename-count'; card.appendChild(count);
    const upd = () => { count.textContent = input.value.length + ' / ' + NAME_MAX; };
    input.addEventListener('input', upd); upd();
    const close = () => { sh.hidden = true; sh.innerHTML = ''; document.removeEventListener('keydown', esc, true); };
    const finish = v => {
      const clean = String(v || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
      S.names = Object.assign({}, S.names);
      if (!clean || clean === g.name) delete S.names[g.id]; else S.names[g.id] = clean;
      L.save(); close(); L.sfx('click'); if (done) done();
    };
    const save = document.createElement('button'); save.className = 'btn primary'; save.type = 'button'; save.textContent = 'Save'; save.onclick = () => finish(input.value);
    const reset = document.createElement('button'); reset.className = 'btn'; reset.type = 'button'; reset.textContent = 'Reset to original'; reset.onclick = () => finish('');
    const cancel = document.createElement('button'); cancel.className = 'btn ghost'; cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = close;
    card.appendChild(save); card.appendChild(reset); card.appendChild(cancel);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value); } });
    function esc(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', esc, true);
    sh.onclick = e => { if (e.target === sh) close(); };
    sh.appendChild(card);
    setTimeout(() => { try { input.focus({ preventScroll: true }); input.select(); } catch (e) {} }, 30);
  }
  // Card covers are drawn at the size the canvas has on screen. Each canvas is watched: whenever its size changes (the
  // panel switching between wide and normal, Compact/Large, search results, a new screen scale) it is drawn again, so a
  // cover can never be left stretched or squashed. Sizes come from layout (clientWidth), never from the on-screen box,
  // which a card's slide-in animation scales.
  const artSize = new ResizeObserver(entries => entries.forEach(e => drawArt(e.target)));
  function drawArt(cv, force) {
    const card = cv.closest('.card'), g = card && L.games.find(x => x.id === card.dataset.id);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!g || !w || !h) return;
    const dpr = Math.min(3, devicePixelRatio || 1), key = w + 'x' + h + '@' + dpr;
    if (!force && cv.dataset.drawn === key) return;
    cv.dataset.drawn = key;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
    try { g.art && g.art(ctx, w, h, L.colors()); } catch (e) { /* a broken thumbnail must not break the grid */ }
  }
  function drawCards() {
    artSize.disconnect();
    document.querySelectorAll('.card .art canvas').forEach(cv => { artSize.observe(cv); drawArt(cv, true); });
  }
  (function watchScale() {   // moving to a screen with another scale (or zooming) redraws the covers sharply
    const mq = matchMedia('(resolution: ' + (devicePixelRatio || 1) + 'dppx)');
    mq.addEventListener('change', () => { if (view === 'home') drawCards(); watchScale(); }, { once: true });
  })();
  function replayCards() {
    document.querySelectorAll('.card').forEach(c => { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
  }

  // ---------- game screen ----------
  function setScore(n) {
    const el = $('scoreNow');
    if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function start(id, keepRoom) {
    const g = L.games.find(x => x.id === id);
    if (!g) return;
    if (!keepRoom) leaveOnline();
    stop();
    S.last = id; S.plays[id] = (S.plays[id] || 0) + 1; L.save();
    fillName($('gameName'), g, () => { fillName($('gameName'), g); });
    $('gameScores').style.display = '';
    $('scoreNow').textContent = '0';
    $('scoreBest').textContent = fmt(S.best[id] || 0);
    if (!S.vs) S.vs = {};
    // Opened from the 2 Player tab: a board game starts with a friend.
    if (g.versus && S.filter === TWO && S.vs[id] !== 'friend') { S.vs[id] = 'friend'; L.save(); }
    $('scoreBest').parentElement.hidden = g.tag === TWO;   // no high score between two people
    renderVsToggle(g);
    $('hint').innerHTML = S.hints ? (g.hint || '') : '';
    hideOver();
    $('pauseSheet').hidden = true;
    // Wide games (Tag, Rally...) get a landscape panel while they are open; every other game uses the normal size.
    const inApp = L.native('wide', { on: wideFor(g) });
    renderOrient(g);
    show('game');
    L.sfx('tap');
    // The card that was clicked keeps keyboard focus otherwise, and Enter in a game would click it again.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // Wait for the slide-in, and in the app for the panel to confirm its new size (ludusResized), so the
    // game lays out once at its final size. The timeout is a fallback in case the confirmation never comes.
    clearTimeout(launchTimer);
    const go = () => {
      if (!pendingLaunch || pendingLaunch.go !== go) return;
      pendingLaunch = null; clearTimeout(launchTimer);
      if (view !== 'game') return;
      launch(g);
      if (!current || !S.saves[id]) return;
      // Only greet "Welcome back" when the game really restored its snapshot; a rejected one is dropped.
      let restored = null;
      try { restored = current.instance.save ? current.instance.save() : null; } catch (e) { restored = null; }
      if (restored) { pause(); $('pauseTitle').textContent = 'Welcome back'; $('pauseSheet').classList.add('welcome'); }
      else forget(id);
    };
    pendingLaunch = { go, at: performance.now() };
    launchTimer = setTimeout(go, inApp ? RESIZE_WAIT_MS : SLIDE_MS);
    L.native('playing', { id });
  }
  /* Bot / Friend switch in the game's top bar for board games (game.versus). It takes the place of the
     score line; switching starts a fresh game in the other mode. */
  function renderVsToggle(g) {
    const box = $('vsToggle');
    const inRoom = !!(online && online.game === g);      // setting up a room or playing in one
    const playing = inRoom && online.started;
    $('gameScores').hidden = !!g.versus;
    box.hidden = !g.versus || playing;
    syncOnlineBar(g);
    if (!g.versus) return;
    const mode = inRoom ? 'online' : ((S.vs && S.vs[g.id]) || g.defaultVs || 'bot') === 'friend' ? 'friend' : 'bot';
    box.querySelectorAll('button').forEach(b => {
      if (b.dataset.vs === 'online') b.hidden = true;   // online play lives in the Online section
      const on = b.dataset.vs === mode;
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
      b.onclick = () => {
        if (on) return;
        if (b.dataset.vs === 'online') { openLobby(g); L.sfx('click'); return; }
        if (inRoom) leaveOnline();
        S.vs[g.id] = b.dataset.vs; forget(g.id); L.save(); L.sfx('click');
        renderVsToggle(g);
        if (!current || current.game !== g) return;
        stop(); hideOver(); $('pauseSheet').hidden = true;
        $('scoreNow').textContent = '0';
        launch(g);
        toast(b.dataset.vs === 'friend' ? 'Two players: take turns on this keyboard' : 'Playing the bot');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      };
    });
    if (inRoom && !playing) box.querySelector('[data-vs="online"]').onclick = null;
  }

  /* ---------- online rooms ----------
     The lobby (lobby.js) makes or joins a room. Once the host starts, the room belongs to this file:
     the game runs with api.online, and any room trouble sends the player back to the menu with a message. */
  function openLobby(g) {
    persist(); stop(); hideOver(); $('pauseSheet').hidden = true;
    online = { game: g, session: null, started: false, shown: g.id };
    renderVsToggle(g);
    L.lobby.open(g, lobbyOps(g));
  }
  // The room sheet lives on the game screen, so a room made from the Online page opens that screen with a plain header first.
  function showOnlineShell() {
    persist(); stop(); hideOver(); $('pauseSheet').hidden = true;
    $('gameName').textContent = 'Online'; $('vsToggle').hidden = true; $('gameScores').style.display = 'none'; $('hint').innerHTML = ''; $('stage').innerHTML = '';
    $('onlineChip').hidden = true; $('leaveBtn').hidden = true; $('pauseBtn').hidden = true; $('orientBtn').hidden = true;
    L.native('wide', { on: false });
    show('game');
  }
  // The last party (room code, names, games) is kept in the saved state so the Online page can offer Rejoin. Only "Forget" removes it.
  function trackParty(s, role) {
    const save = () => {
      if (!s.ready) return;
      S.party = { role, code: s.code, name: L.net.cleanName(S.onlineName, ''), names: s.rosterList().map(p => p.name), games: s.plan.g.slice(), n: s.plan.n, at: Date.now() };
      L.save();
    };
    ['ready', 'roster', 'plan'].forEach(ev => s.on(ev, save));
  }
  function rejoinParty() {
    const p = S.party; if (!p) return;
    if (p.role === 'host') createFlexRoom(p); else joinFromInvite(p.code);
  }
  function createFlexRoom(party) {   // from the Online page: no game yet, the host picks them in the room
    showOnlineShell();
    online = { game: null, session: null, started: false };
    const s = L.lobby.openRoom(lobbyOps(null), party && party.code);
    if (!s) return;
    trackParty(s, 'host');
    if (party && party.games && party.games.length) s.on('ready', () => { s.setPlan(party.games.filter(id => L.games.some(g => g.id === id && g.online)), party.n); });
  }
  function lobbyOps(g) {
    return {
      toast, goHome,
      onStart: (s, e) => beginOnline(s, e, g),
      onCancel: () => {
        // back to whatever mode was there before
        online = null;
        if (!g) { goHome(); return; }
        renderVsToggle(g);
        if (view === 'game') { $('scoreNow').textContent = '0'; launch(g); }
      }
    };
  }
  // A room invite: the code typed or pasted, or a ludus://join/CODE link opened by the Mac / Windows app. The link does not
  // say which game, so the room tells us. A newer host (tournament rooms) lets the host pick games, so we just show the room;
  // a 1.6 host plays one game, so that game's screen opens with the room already joined.
  function joinFromInvite(text, quiet) {
    const code = L.net.extractCode(text);
    if (!code) { toast('No room code found'); return false; }
    leaveOnline(); stop(); hideOver(); $('pauseSheet').hidden = true;
    if (!quiet) toast('Joining room ' + code);
    const s = L.net.joinRoom(code, { gameId: '', name: L.net.cleanName(S.onlineName, '') });
    online = { game: null, session: s, started: false };
    trackParty(s, 'guest');
    s.on('error', e => { online = null; if (e.code === 'update') L.lobby.notice(...L.lobby.why('update'), () => {}); else toast(L.lobby.why(e.code === 'no-room' || e.code === 'full' || e.code === 'started' ? e.code : 'offline')[0]); });
    s.on('ready', () => {
      if (s.hostPv >= 2) { showOnlineShell(); online = { game: null, session: s, started: false }; L.lobby.attach(null, s, lobbyOps(null)); return; }
      const g = L.games.find(x => x.id === s.gameId && x.online);
      if (!g) { online = null; s.leave(); toast('This version of Ludus cannot play that room'); return; }
      online = null;                       // start() must not leave the room we just joined
      start(g.id, true);
      clearTimeout(launchTimer); pendingLaunch = null;   // no local game behind the lobby
      online = { game: g, session: s, started: false, shown: g.id };
      renderVsToggle(g);
      L.lobby.attach(g, s, lobbyOps(g));
    });
    return true;
  }
  window.ludusJoin = joinFromInvite;
  const gameById = id => L.games.find(x => x.id === id && x.online);
  // The room started a game (the first one, the next round, or a rematch): hooks are added once per room.
  function beginOnline(s, e, fallback) {
    const g = gameById(e && e.game) || gameById(s.gameId) || fallback;
    if (!g) { toast('This version of Ludus cannot play that game'); try { s.leave(); } catch (x) {} online = null; return; }
    online = { game: g, session: s, started: true, shown: online && online.shown };
    if (!s.appHooked) {
      s.appHooked = true;
      const mine = () => online && online.session === s;
      const ops = () => lobbyOps(online && online.game);
      s.on('start', ev => { if (!mine()) return; const g2 = gameById(ev.game) || online.game; online.game = g2; online.started = true; L.lobby.hide(); showRound(g2); });
      s.on('oldpeer', () => { if (mine()) toast('Your friend needs to update Ludus to join this'); });
      s.on('rematch', ev => toast((ev.name || 'Your opponent') + ' wants a rematch'));
      s.on('conn', () => { if (mine()) syncOnlineBar(online.game); });
      s.on('left', ev => {
        if (!mine() || s.ser) return;   // a tournament: the host decides whether it goes on
        if (s.count() < s.gmin) endOnline((ev.name || 'Your opponent') + ' left', 'The game cannot go on without them, so you are going back to the menu.');
      });
      s.on('closed', ev => {
        if (!mine()) return;
        if (s.ser && s.ser.st !== 'final') {   // the host went away mid-tournament: keep the standings so far
          s.ser = Object.assign({}, s.ser, { st: 'final', why: 'host' }); stop(); hideOver(); online.session = null; syncOnlineBar(online.game);
          L.lobby.series(s, 'final', lobbyOps(online.game)); return;
        }
        endOnline(...L.lobby.why(ev.reason));
      });
      s.on('board', () => { if (mine()) L.lobby.series(s, 'board', ops()); });
      s.on('final', () => { if (mine()) { stop(); hideOver(); online.started = false; syncOnlineBar(online.game); L.lobby.series(s, 'final', ops()); } });
      s.on('lobby', () => { if (mine()) { stop(); hideOver(); online.started = false; syncOnlineBar(online.game); L.lobby.resume(s, ops()); } });
    }
    showRound(g);
  }
  function showRound(g) {
    online.game = g;
    if (view !== 'game' || online.shown !== g.id) {
      online.shown = g.id;
      start(g.id, true);                                  // the game's screen, header and name
      clearTimeout(launchTimer); pendingLaunch = null;    // no local game behind the room
    }
    launchOnline(g);
  }
  function launchOnline(g) {
    const s = online.session;
    stop(); hideOver(); $('pauseSheet').hidden = true;
    $('scoreNow').textContent = '0';
    renderVsToggle(g);
    launch(g, s.makeOnline());
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function endOnline(title, text) {
    if (online) online.session = null;
    stop(); hideOver();
    L.lobby.notice(title, text, goHome);
  }
  function leaveOnline() {
    if (!online) return;
    const s = online.session, g = online.game;
    online = null;
    L.lobby.close();
    if (s) { try { s.leave(); } catch (e) { /* already closed */ } }
    syncOnlineBar(g);
  }
  // Header while in a room: the code and connection chip replace the Bot/Friend switch; Leave replaces Pause.
  function syncOnlineBar(g) {
    const playing = !!(online && online.started && online.session);
    $('onlineChip').hidden = !playing; $('leaveBtn').hidden = !playing; $('pauseBtn').hidden = !!online;   // no pausing in a room
    if (!playing) return;
    const st = online.session.conn;
    $('onlineChip').dataset.state = st;
    $('onlineState').textContent = st === 'online' ? 'Online' : st === 'offline' ? 'Reconnecting' : 'Connecting';
    $('onlineCode').textContent = online.session.code;
  }

  function launch(g, onlineApi) {
    const stage = $('stage'); stage.innerHTML = '';
    $('hint').innerHTML = S.hints ? ((onlineApi && g.onlineHint) || g.hint || '') : '';
    $('againBtn').textContent = onlineApi ? (onlineApi.isHost ? 'Rematch' : 'Ask for rematch') : 'Play again';
    clearTimeout(revealTimer);
    const run = L.makeApi(g, stage, {
      onScore: setScore,
      onOver: res => finish(g, res),
      toast,
      onCrash: (e, kind) => gameCrashed(g, run, e, kind)
    }, onlineApi);
    current = { game: g, run, instance: null, online: !!onlineApi };
    try { current.instance = g.create(stage, run.api) || {}; }
    catch (e) {
      // A saved game that no longer loads must not lock the player out: set the save aside and start fresh.
      if (run.api.saved) { logError(g.id, 'load', e); quarantine(g.id); run.destroy(); return launch(g, onlineApi); }
      current.instance = {}; run.crash(e, 'start');
    }
    if (!onlineApi && current.instance && current.instance.save) current.saver = setInterval(() => { if (!run.api.paused) persist(); }, SAVE_EVERY_MS);
  }
  // ---------- crash failsafe: a game that throws, freezes or loses its graphics gets a calm recovery card ----------
  function logError(id, kind, e) {
    const entry = { t: new Date().toISOString(), game: id, kind, msg: String((e && e.message) || e || '').slice(0, 300), stack: String((e && e.stack) || '').slice(0, 800) };
    try { const k = 'ludus.errors', a = JSON.parse(localStorage.getItem(k) || '[]'); a.push(entry); localStorage.setItem(k, JSON.stringify(a.slice(-50))); } catch (x) {}
    L.native('log', { line: JSON.stringify(entry) });   // the app appends it to a local log file
  }
  function quarantine(id) {
    if (!S.saves[id]) return;
    S.quarantine = Object.assign({}, S.quarantine, { [id]: { at: Date.now(), snap: S.saves[id] } });
    delete S.saves[id]; L.save();
  }
  function gameCrashed(g, run, e, kind) {
    if (!current || current.run !== run) return;
    logError(g.id, kind, e);
    clearInterval(current.saver);   // the last good save stays; a broken state is never saved over it
    if (current.retryAt && performance.now() - current.retryAt < 8000) quarantine(g.id);   // the save itself is the problem
    $('pauseSheet').hidden = true;
    const art = $('crashArt'), box = art.parentElement; box.style.setProperty('--tint', g.tint || '');
    $('crashRetry').hidden = $('crashNew').hidden = !!current.online;
    $('crashSheet').hidden = false;
    requestAnimationFrame(() => {
      const w = art.clientWidth, h = art.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
      if (w && h) { art.width = Math.round(w * dpr); art.height = Math.round(h * dpr); const c = art.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); try { g.art && g.art(c, w, h, L.colors()); } catch (x) {} }
    });
  }
  const crashShown = () => !$('crashSheet').hidden;
  function hideCrash() { $('crashSheet').hidden = true; }
  $('crashRetry').onclick = () => { if (!current) return; const g = current.game; hideCrash(); stop(); hideOver(); launch(g); if (current) current.retryAt = performance.now(); L.sfx('click'); };
  $('crashNew').onclick = () => { if (!current) return; const g = current.game; hideCrash(); forget(g.id); stop(); hideOver(); launch(g); L.sfx('click'); };
  $('crashBack').onclick = () => { hideCrash(); goHome(); };
  // errors from a game's own files, promises it left unhandled, and graphics it did not recover itself
  window.addEventListener('error', e => {
    if (!current || current.run.crashed) return;
    const src = e.target && e.target !== window ? (e.target.src || '') : (e.filename || '');
    if (!/\/games\//.test(src)) return;
    const run = current.run;
    setTimeout(() => { if (!e.defaultPrevented && current && current.run === run) run.crash(e.error || e.message || 'load', e.target && e.target !== window ? 'asset' : 'error'); });
  }, true);
  window.addEventListener('unhandledrejection', e => {
    if (!current || current.run.crashed || !/\/games\//.test(String(e.reason && e.reason.stack || ''))) return;
    current.run.crash(e.reason, 'promise');
  });
  $('stage').addEventListener('webglcontextlost', e => {
    const run = current && current.run;
    setTimeout(() => { if (run && current && current.run === run && !e.defaultPrevented) run.crash('graphics context lost', 'webgl'); }, 50);
  }, true);
  let visibleSince = performance.now();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) visibleSince = performance.now(); });
  setInterval(() => {   // a game whose drawing has stopped for 5 s while on screen counts as frozen
    if (view !== 'game' || !current || document.hidden || !$('pauseSheet').hidden || overShown() || crashShown()) return;
    const now = performance.now();
    if (now - visibleSince > 6000 && current.run.stalledFor(now) > 5000) current.run.crash('no frames for 5 s', 'stall');
  }, 1000);
  window.ludusCrashTest = kind => { if (!current) return false; if (kind === 'stall') { current.run.noteFrame = null; } current.run.crash(new Error('test ' + kind), kind || 'test'); return true; };   // test helper

  // Keep the running game's snapshot so leaving and coming back finds it exactly as it was.
  function persist() {
    if (online || !current || current.run.crashed || current.run.ended || !current.instance || !current.instance.save) return;
    const id = current.game.id;
    try {
      const snap = current.instance.save();
      // null means "nothing to resume" (not started, or already lost): drop any older snapshot.
      if (snap) { S.saves[id] = current.game.versus ? Object.assign({}, snap, { vsMode: current.run.api.vs }) : snap; L.save(); } else forget(id);
    } catch (e) { forget(id); }   // a game that cannot snapshot starts fresh next time
  }
  function forget(id) { if (S.saves[id]) { delete S.saves[id]; L.save(); } }
  function stop() {
    clearTimeout(launchTimer); pendingLaunch = null;
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
    const friends = g.tag === TWO || (g.versus && current && current.run.api.friend);
    const record = res.score > prev && !friends;
    if (record) { S.best[g.id] = res.score; $('scoreBest').textContent = fmt(res.score); }
    forget(g.id); L.save();
    $('overTitle').textContent = res.title || (res.won ? 'You win' : 'Game over');
    $('overScore').textContent = res.score;
    const best = $('overBest');
    best.textContent = record && res.score > 0 ? 'New best' : (res.message || (friends ? '' : `Best ${fmt(Math.max(prev, res.score))}`));
    best.classList.toggle('record', record && res.score > 0);
    L.sfx(res.won || record ? 'win' : 'over');
    // Let the final board play out (bombs revealed, last move shown) before the result bar comes up.
    clearTimeout(revealTimer);
    const run = current && current.run;
    revealTimer = setTimeout(() => {
      if (run && current && current.run === run) run.pause();
      // a tournament: tell the host who won; the scoreboard card comes up once everybody has reported
      if (online && online.session && online.session.ser && online.session.ser.st === 'play') { online.session.reportResult(!!res.won); return; }
      $('overSheet').hidden = false; $('overPeek').hidden = true; overAt = performance.now();
    }, window.ludusRevealMs ?? REVEAL_MS);
  }
  function hideOver() { clearTimeout(revealTimer); $('overSheet').hidden = true; $('overPeek').hidden = true; }
  function overShown() { return !$('overSheet').hidden || !$('overPeek').hidden; }
  function revealing() { return !!(current && current.run.ended && !overShown()); }
  function restart() {
    if (!current) return;
    if (online && online.session) {   // a rematch: the host starts it for everybody, the guest asks
      if (online.session.role === 'host') online.session.start();
      else { online.session.requestRematch(); toast('Asked the host for a rematch'); }
      return;
    }
    const g = current.game; forget(g.id); stop();
    hideOver(); $('pauseSheet').hidden = true;
    $('scoreNow').textContent = '0';
    launch(g);
  }
  function pause() {
    if (crashShown()) return;
    if (online || !current || current.run.ended || !$('pauseSheet').hidden) return;
    $('pauseTitle').textContent = 'Paused'; $('pauseSheet').classList.remove('welcome');
    current.run.pause(); current.instance && current.instance.pause && current.instance.pause();
    $('pauseSheet').hidden = false;
  }
  function resume() {
    if (!current) return;
    $('pauseSheet').hidden = true;
    current.run.resume(); current.instance && current.instance.resume && current.instance.resume();
  }
  function goHome() { hideCrash(); leaveOnline(); persist(); stop(); hideOver(); $('pauseSheet').hidden = true; show('home'); renderCards(); L.native('playing', { id: null }); L.native('wide', { on: false }); }

  $('backBtn').onclick = goHome;
  $('leaveBtn').onclick = goHome;
  $('quitBtn').onclick = goHome;
  $('overQuitBtn').onclick = goHome;
  $('pauseBtn').onclick = pause;
  $('resumeBtn').onclick = resume;
  $('restartBtn').onclick = restart;
  $('againBtn').onclick = restart;
  $('overHideBtn').onclick = () => { $('overSheet').hidden = true; $('overPeek').hidden = false; };
  $('overPeek').onclick = () => { $('overPeek').hidden = true; $('overSheet').hidden = false; overAt = performance.now(); };
  const search = $('search');
  search.addEventListener('input', () => { query = search.value; $('grid').scrollTop = 0; $('filters').classList.toggle('is-dim', !!norm(query)); renderCards(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); search.value = ''; query = ''; $('filters').classList.remove('is-dim'); renderCards(); search.blur(); }
    else if (e.key === 'Enter') { const first = visibleGames()[0]; if (first) { e.preventDefault(); start(first.id); } }
  });
  window.addEventListener('keydown', e => {
    if (view === 'home' && document.activeElement !== search && (e.key === '/' || ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'k')))) { e.preventDefault(); search.focus(); search.select(); return; }
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
    t.textContent = text; t.classList.add('show'); $('app').classList.add('toasting');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.remove('show'); $('app').classList.remove('toasting'); }, 1600);
  }
  /* Volume: elastic slider (after React Bits' Elastic Slider). A slim bar with no knob that thickens
     while touched, and a rubber-band stretch past either end that springs back. Keyboard: arrows, Home, End. */
  function volumeSlider(value, onInput, onDone) {
    const wrap = el('div', 'vol');
    const track = el('div', 'vol-track'), bar = el('div', 'vol-fill');
    track.appendChild(bar);
    track.tabIndex = 0;
    track.setAttribute('role', 'slider'); track.setAttribute('aria-label', 'Volume');
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    wrap.append(track);
    let v = Math.min(1, Math.max(0, +value || 0));
    const STEP = 0.05, MAX_STRETCH = 10;   // px the bar may stretch past an end
    const paint = () => {
      bar.style.width = (v * 100) + '%';
      track.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    };
    const set = nv => { nv = Math.round(Math.min(1, Math.max(0, nv)) / STEP) * STEP; if (nv !== v) { v = nv; paint(); onInput(v); } };
    // Overshoot past an end, eased so it resists more the further you pull (sigmoid decay).
    const stretch = over => MAX_STRETCH * (2 / (1 + Math.exp(-over / 40)) - 1);
    const pull = dx => {
      wrap.style.setProperty('--sx', (1 + Math.abs(dx) / track.offsetWidth).toFixed(3));
      wrap.style.setProperty('--tx', (dx / 2).toFixed(1) + 'px');
    };
    let dragging = false;
    const at = e => {
      const r = track.getBoundingClientRect();
      const x = e.clientX - r.left;
      set(x / r.width);
      pull(x < 0 ? -stretch(-x) : x > r.width ? stretch(x - r.width) : 0);
    };
    track.addEventListener('pointerdown', e => {
      dragging = true; try { track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ } wrap.classList.add('is-active'); at(e);
    });
    track.addEventListener('pointermove', e => { if (dragging) at(e); });
    const end = () => {
      if (!dragging) return;
      dragging = false; wrap.classList.remove('is-active'); pull(0); onDone();
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', e => {
      const k = e.key;
      const nv = k === 'ArrowRight' || k === 'ArrowUp' ? v + STEP : k === 'ArrowLeft' || k === 'ArrowDown' ? v - STEP
        : k === 'Home' ? 0 : k === 'End' ? 1 : null;
      if (nv === null) return;
      e.preventDefault(); set(nv); onDone();
    });
    paint();
    return wrap;
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
    const vol = volumeSlider(S.volume, v => { S.volume = v; L.save(); }, () => L.sfx('score'));
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
      row('Rename games', 'Click a game\u2019s name to give it your own', sw(!!S.renameGames, v => { S.renameGames = v; L.save(); }, 'Rename games')),
    ]));
    const appRows = [];
    if (window.__LUDUS_NATIVE__) {
      appRows.push(row('Open at login', null, sw(!!window.__LUDUS_LOGIN__, v => { window.__LUDUS_LOGIN__ = v; L.native('login', { on: v }); }, 'Open at login')));
      // The app hands over __LUDUS_INVISIBLE__. Mac: an empty menu bar slot. Windows: no tray icon, Ctrl+Alt+G or the Start menu.
      const invisibleHelp = window.__LUDUS_PLATFORM__ === 'windows'
        ? 'Hides the tray icon. Open Ludus with Ctrl+Alt+G, or from the Start menu'
        : 'Hidden in the menu bar. Click the empty space at the far left of your menu bar icons to open';
      if (typeof window.__LUDUS_INVISIBLE__ === 'boolean') appRows.push(row('Invisible icon', invisibleHelp,
        sw(!!window.__LUDUS_INVISIBLE__, v => { window.__LUDUS_INVISIBLE__ = v; L.native('invisible', { on: v }); }, 'Invisible icon')));
      if (typeof window.__LUDUS_DOCK__ === 'boolean') appRows.push(row('Show in Dock', 'Off: Ludus stays in the menu bar only',
        sw(!!window.__LUDUS_DOCK__, v => { window.__LUDUS_DOCK__ = v; L.native('dock', { on: v }); }, 'Show in Dock')));
    }
    const reset = el('button', 'small-btn bad', 'Reset');
    reset.onclick = () => {
      if (reset.dataset.armed) { S.best = {}; S.plays = {}; S.last = null; L.save(); renderCards(); toast('Scores cleared'); reset.textContent = 'Reset'; delete reset.dataset.armed; return; }
      reset.dataset.armed = '1'; reset.textContent = 'Sure?'; setTimeout(() => { reset.textContent = 'Reset'; delete reset.dataset.armed; }, 2500);
    };
    appRows.push(row('Reset best scores', 'Clears every high score', reset, 'danger'));
    if (window.__LUDUS_NATIVE__ && window.__LUDUS_PLATFORM__ !== 'windows') {
      const sh = el('button', 'small-btn', 'Share'); sh.id = 'shareFriend';
      sh.onclick = () => { const b = sh.getBoundingClientRect(); L.native('share', { x: b.left, y: b.top, w: b.width, h: b.height }); };
      const shRow = row('Share with a friend', 'Friend: right-click the app and choose Open the first time.', sh);
      window.ludusShareError = m => { const e = shRow.querySelector('.row-sub'); if (e) e.textContent = m; };
      appRows.push(shRow);
    }
    if (window.__LUDUS_NATIVE__) {
      const q = el('button', 'small-btn', 'Quit'); q.onclick = () => L.native('quit');
      appRows.push(row('Quit Ludus', null, q));
    }
    body.appendChild(group('App', appRows));
    body.appendChild(el('div', 'foot', 'Ludus 1.8.3'));
  }
  $('openSettings').onclick = () => { renderSettings(); show('settings'); L.sfx('tap'); };
  $('settingsBack').onclick = () => { show('home'); renderCards(); };

  // ---------- native hooks ----------
  window.ludusOpened = () => {
    // The panel taking keyboard focus must not draw a focus ring on the first button.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    // Ludus always opens on All games, wherever it was left. A game left open is saved and waits
    // in the "Continue" card at the top.
    if (view !== 'home' && !(online && online.started)) { root.classList.add('instant'); goHome(); }   // an online round that is being played stays; a room being set up does not (its code is remembered for Rejoin)   // safety net; normally done on close (a room stays open)
    if (S.filter !== 'All') { S.filter = 'All'; L.save(); renderFilters(); renderCards(); }
    const top = () => { const g = $('grid'); if (g) g.scrollTop = 0; };
    top(); replayCards(); top();   // always the very top of All, never wherever it was left
    // Next frame, once the home screen has been laid out without transitions.
    requestAnimationFrame(() => { top(); root.classList.remove('instant'); requestAnimationFrame(top); });
  };
  // Go back to All games while the panel is closing, with transitions off, so the next open shows
  // the finished home screen straight away instead of the game flashing and sliding out.
  window.ludusClosed = () => {
    if (view !== 'home' && !(online && online.started)) {
      root.classList.add('instant');
      if (view === 'game') goHome(); else { show('home'); renderCards(); }
    }
    if (S.filter !== 'All') { S.filter = 'All'; renderFilters(); renderCards(); }
    { const g = $('grid'); if (g) g.scrollTop = 0; }
    L.save(true);
  };
  window.ludusOpenGame = id => start(id);
  // The app has resized the panel for a game (wide or normal): start it once the page has the new size.
  window.ludusResized = () => {
    const p = pendingLaunch; if (!p) return;
    requestAnimationFrame(() => {
      clearTimeout(launchTimer);
      launchTimer = setTimeout(p.go, Math.max(0, SLIDE_MS - (performance.now() - p.at)));
    });
  };
  // Test helper: end the current run as if the game called api.over (used by QA/shell-test.js).
  window.ludusOnline = () => online;
  window.ludusOpenLobby = () => { if (current && current.game && current.game.online) openLobby(current.game); };   // test helper: the old per-game room sheet (no button any more)
  window.ludusForceOver = won => { if (current) current.run.api.over({ score: 0, won: !!won, title: 'Test' }); };   // test helper: end the round now
  window.ludusSnapshot = () => { try { return current && current.instance && current.instance.save ? current.instance.save() : null; } catch (e) { return null; } };   // test helper   // test helper: the current room, if any
  // Test helper (Mac harness and the Windows CI self-test): every cover's drawn shape against its shape on screen.
  window.ludusCoverCheck = () => {
    const out = { cards: 0, worst: 0, bad: [] };
    document.querySelectorAll('#grid .card .art canvas').forEach(cv => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      out.cards++;
      const d = cv.width && cv.height ? Math.abs((cv.width / cv.height) / (w / h) - 1) : 1;
      out.worst = Math.max(out.worst, Math.round(d * 1000) / 1000);
      if (d > 0.02) out.bad.push(cv.closest('.card').dataset.id + ' ' + cv.width + 'x' + cv.height + ' shown ' + w + 'x' + h);
    });
    return out;
  };
  // Windows CI self-test: covers true to shape, the pause card on top when paused, never blurred without a menu.
  window.ludusSelfCheck = () => {
    const sheet = $('pauseSheet'); let pauseOnTop = null;
    if (!sheet.hidden) { const b = $('resumeBtn'), r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); pauseOnTop = !!h && (h === b || b.contains(h)); }
    return { view, covers: view === 'home' ? window.ludusCoverCheck() : null, paused: !sheet.hidden, pauseOnTop, blurredWithoutMenu: !!document.querySelector('.geo.geo-paused') && sheet.hidden, saved: Object.keys(S.saves || {}), geoReset: S.geoReset || 0 };
  };
  window.ludusTestOver = score => { if (current) current.run.api.over({ score }); };
  window.ludusState = () => JSON.stringify({ view, game: current && current.game.id, score: $('scoreNow').textContent, paused: !$('pauseSheet').hidden, over: overShown(), revealing: revealing(), games: L.games.length, theme: root.dataset.theme, saved: Object.keys(S.saves) });

  // ---------- boot ----------
  if (S.filter !== 'All') { S.filter = 'All'; L.save(); }   // Ludus always opens on the All tab
  // 1.7.1: a Geo Guess save from 1.7 could reopen behind an invisible pause card (blurred map, nothing to press).
  // Drop that save once, so the game starts clean after the update.
  // Geo Guess is never saved mid-game (every open is a fresh game): drop any old Geo save, whatever version wrote it.
  if (S.saves && S.saves.geoguess) { delete S.saves.geoguess; L.save(); }
  S.geoReset = 1;
  // Best scores: anything that is not a plain number (a damaged file) counts as no score, never blocks a game.
  if (S.best && typeof S.best === 'object') Object.keys(S.best).forEach(k => { const v = S.best[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) { delete S.best[k]; } });
  else S.best = {};
  if (S.hidden.length) { S.hidden = []; L.save(); }   // the "Games shown" setting is gone: every game shows
  if (!ACCENTS.includes(S.accent)) { S.accent = ACCENTS[0]; L.save(); }   // e.g. the removed second orange
  applyTheme();
  renderFilters();
  renderCards();
  maybeIntro();

  // ---------- first-run welcome ----------
  // Shown once to someone new (no games played yet). Three short pages over the home screen,
  // each part rising in after the one above, pages sliding sideways. Skippable.
  function maybeIntro() {
    if (S.introDone) return;
    const fresh = !S.last && !Object.keys(S.plays).length;
    const testing = navigator.webdriver || window.__LUDUS_SKIP_INTRO__;
    if (!fresh || testing) { if (!testing) { S.introDone = true; L.save(); } return; }
    showIntro();
  }

  function showIntro(startPage) {
    const win = window.__LUDUS_PLATFORM__ === 'windows';
    const mark = '<svg viewBox="6 27 88 55" aria-hidden="true"><use href="#ludus-mark"/></svg>';
    const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
    const pages = [
      { art: mark, app: true, title: 'Welcome to Ludus', text: `${L.games.length} little games, one click away. Take a short break, then get back to work.`,
        items: [
          [ic('M5 19l4-8 3 5 2-3 5 6zM15 6h.01'), 'Arcade', 'Sky Raiders, Snake, Breakout, Stack and more'],
          [ic('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'), 'Puzzle', '2048, Sudoku, Five Letters, Minesweeper'],
          [ic('M8 12h8M6 8a4 4 0 1 0 0 8M18 8a4 4 0 1 1 0 8'), 'Duel and 2 Player', 'Beat the computer, or a friend on one keyboard'],
        ] },
      { art: ic(win ? 'M3 15h18v5H3zM17 17.5h.01M12 4v7M9 8l3 3 3-3' : 'M3 5h18M7 9h10a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8zM9 13h2M10 12v2M15 13h.01'),
        title: win ? 'It lives in your tray' : 'It lives in your menu bar',
        text: win ? 'Click the Ludus icon next to the clock to open it. Or press Ctrl+Alt+G from anywhere.'
                  : 'Click the controller icon at the top of your screen to open it. Click outside to put it away.',
        items: [
          [ic('M6 5h4v14H6zM14 5h4v14h-4z'), 'Close it mid-game', 'Every game saves itself and waits for you'],
          [ic('M4 6h16M4 12h10M4 18h7'), 'Pick a tab', 'All, Arcade, Puzzle, Duel, 2 Player or Online'],
          [ic('M11 4a2 2 0 1 1 2 0v1a7 7 0 0 1 5 6.7V15l2 3H4l2-3v-3.3A7 7 0 0 1 11 5z'), 'Make it yours', 'Colours, sound and light or dark in Settings'],
        ] },
      { art: ic('M8 5v14l11-7z'), title: 'Ready to play', text: 'Start with something quick. Your best scores are kept on this computer only.' },
    ];

    const box = el('div', 'intro');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Welcome to Ludus');
    const stage = el('div', 'intro-stage');
    const foot = el('div', 'intro-foot');
    const back = el('button', 'btn ghost intro-back'), dots = el('div', 'intro-dots'), next = el('button', 'btn primary intro-next');
    pages.forEach(() => dots.appendChild(el('i')));
    foot.append(back, dots, next);
    const card = el('div', 'intro-card');
    card.append(stage, foot);
    box.append(card);
    let page = -1;

    function build(p) {
      const v = el('div', 'intro-page');
      let i = 0;
      const add = n => { n.style.setProperty('--i', i++); v.appendChild(n); };
      add(el('div', 'intro-art' + (p.app ? ' app' : ''), p.art));
      add(el('h2', '', p.title));
      add(el('p', 'intro-text', p.text));
      (p.items || []).forEach(([icon, t, d]) => {
        const r = el('div', 'intro-item');
        r.append(el('div', 'intro-ic', icon));
        const g = el('div'); g.append(el('b', '', t), el('small', '', d));
        r.append(g); add(r);
      });
      return v;
    }
    function go(n) {
      if (n < 0 || n >= pages.length || n === page) return;
      const dir = n > page ? 'next' : 'prev';
      const old = stage.firstChild;
      if (old) { old.classList.add('out-' + dir); setTimeout(() => old.remove(), 340); }
      const v = build(pages[n]);
      if (page >= 0) v.classList.add('in-' + dir);
      stage.appendChild(v);
      page = n;
      dots.childNodes.forEach((d, k) => d.classList.toggle('on', k === n));
      back.textContent = n === 0 ? 'Skip' : 'Back';
      next.textContent = n === pages.length - 1 ? 'Let\u2019s play' : 'Continue';
      L.sfx('click');
    }
    function close() {
      S.introDone = true; L.save(true);
      box.classList.add('leaving');
      setTimeout(() => box.remove(), 260);
      L.native('introDone');
    }
    back.onclick = () => page === 0 ? close() : go(page - 1);
    next.onclick = () => page === pages.length - 1 ? close() : go(page + 1);
    box.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      else if (e.key === 'ArrowLeft' && page > 0) { e.preventDefault(); back.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    $('app').appendChild(box);
    go(startPage || 0);
    next.focus({ preventScroll: true });
    L.native('intro');   // the app opens its panel so the welcome is seen
  }
  // Test helper (screenshots): show the welcome on any page.
  window.ludusShowIntro = n => { document.querySelectorAll('.intro').forEach(x => x.remove()); showIntro(n || 0); };
})();
