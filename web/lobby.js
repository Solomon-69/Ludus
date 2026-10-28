/* Ludus online lobby: the sheet where a player creates a room, or types a room code to join one.
   Opens from a game's top bar ("Online" next to vs Bot / vs Friend). Nothing touches the network until
   the player presses Create room or Join room. When the host starts the game the sheet closes and
   app.js takes over the room (Ludus.lobby.open calls ops.onStart(session)).
*/
(function () {
  const L = window.Ludus;
  const SEAT_COLORS = ['var(--accent)', '#5b8def', '#4f9d69', '#9b6dd6', '#e0a526', '#e05d8b', '#3aa6a6', '#8a8f98'];
  const WHY = {
    offline: ['Cannot connect', 'Ludus could not reach the internet relay. Check your connection and try again.'],
    'no-room': ['No such room', 'Nobody is hosting that code right now. Check the letters and try again.'],
    full: ['Room is full', 'Every seat in that room is taken.'],
    started: ['Game already started', 'That room has already begun playing.'],
    game: ['Different game', 'That room code is for another game.'],
    'host-left': ['Room closed', 'The host left, so the room has closed.'],
    'host-lost': ['Lost the host', 'The host stopped answering, so the room has closed.'],
    removed: ['Left the room', 'You were disconnected from the room.'],
    update: ['Update Ludus', 'Your friend needs to update Ludus before you can play together.']
  };
  let sheet = null, card = null, session = null, offs = [], ops = null, game = null, screen = '', error = '', copied = false, copyTimer = 0, autoStart = 0;

  const $ = id => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(label, cls, fn) { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.onclick = () => { L.sfx('click'); fn(); }; return b; }
  const nameValue = () => L.net.cleanName(L.state.onlineName, '');

  function ensure() {
    if (sheet) return;
    sheet = $('lobbySheet'); card = $('lobbyCard');
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back(); }
    });
  }
  function unhook() { offs.forEach(f => f()); offs = []; clearTimeout(autoStart); }
  function discard() { unhook(); if (session) { try { session.leave(); } catch (e) {} } session = null; popped.clear(); }
  // The room redraws on every roster or plan change: seats and code boxes pop in once, when they first show, never again
  // on a redraw (that read as a flash of the whole card each time somebody joined or the host picked a game).
  // (a redraw right after the first one, while the pop is still playing, carries it on from where it was)
  const popped = new Map();
  const popOnce = (node, key) => {
    const t = popped.get(key), now = performance.now();
    if (t === undefined) popped.set(key, now); else if (now - t < 500) node.style.animationDelay = (t - now) + 'ms'; else node.classList.add('still');
    return node;
  };
  const calmMotion = () => { const r = document.documentElement.classList; return r.contains('reduce') || r.contains('instant') || (matchMedia('(prefers-reduced-motion: reduce)').matches && !r.contains('motion-ok')); };

  // ---------- pieces ----------
  function connChip(state) {
    const c = el('div', 'conn-chip ' + (state || 'connecting'));
    c.appendChild(el('i'));
    c.appendChild(el('span', '', state === 'online' ? 'Online' : state === 'offline' ? 'Offline, trying again' : 'Connecting'));
    return c;
  }
  function avatars(count, max) {
    const row = el('div', 'seats' + (max > 2 ? ' many' : ''));   // 3 or 4 seats: two columns, so the card stays short
    const mine = session ? session.seat : -1;
    for (let i = 0; i < max; i++) {
      const p = session && session.roster.get(i);
      const s = el('div', 'seat' + (p ? ' on' : '')); if (p) popOnce(s, 'seat' + i + ':' + p.name);
      const dot = el('div', 'seat-dot', p ? Array.from(p.name)[0].toUpperCase() : '');
      if (p) dot.style.background = SEAT_COLORS[i % SEAT_COLORS.length];
      s.appendChild(dot);
      const label = p ? p.name + (i === mine ? ' (you)' : '') : 'Waiting';
      const tx = el('div', 'seat-text'); tx.appendChild(el('div', 'seat-name', label));
      if (p && i === 0) tx.appendChild(el('div', 'seat-badge', 'Host'));   // under the name, so the name always has the whole width
      else if (p && session.role === 'host' && i !== mine) tx.appendChild(leaderActs(p));
      s.appendChild(tx);
      row.appendChild(s);
    }
    return row;
  }
  // host: "Make leader" under each other player's name, confirmed in place (no pop-up)
  let confirmLeader = { s: null, cid: '' }, focusConfirm = false;
  const LEADER_WHY = { old: 'Needs everyone on the newest Ludus', offline: 'Needs a connection', playing: 'Not while a round is being played' };
  function leaderActs(p) {
    const box = el('div', 'seat-acts'), why = session.promoteBlock(), asking = confirmLeader.s === session && confirmLeader.cid === p.cid && !why;
    const act = (label, cls, fn) => { const b = el('button', 'seat-act' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = () => { L.sfx('click'); fn(); }; return b; };
    if (asking) {
      const yes = act('Confirm', 'is-yes', () => {
        confirmLeader = { s: null, cid: '' };
        if (!session.promote(p.cid)) ops && ops.toast && ops.toast('Could not change the leader');
        render();
      });
      yes.setAttribute('aria-label', 'Confirm: make ' + p.name + ' the leader');
      box.appendChild(yes);
      box.appendChild(act('Cancel', '', () => { confirmLeader = { s: null, cid: '' }; render(); }));
      if (focusConfirm) { focusConfirm = false; setTimeout(() => { try { yes.focus({ preventScroll: true }); } catch (e) {} }, 0); }
    } else {
      const b = act('Make leader', '', () => { confirmLeader = { s: session, cid: p.cid }; focusConfirm = true; render(); });
      b.setAttribute('aria-label', 'Make ' + p.name + ' the leader');
      if (why) { b.disabled = true; b.title = LEADER_WHY[why] || ''; }
      box.appendChild(b);
    }
    return box;
  }
  function codeBoxes(code) {
    const row = el('div', 'code-row');
    row.setAttribute('aria-label', 'Room code ' + code.split('').join(' '));
    code.split('').forEach((ch, i) => row.appendChild(popOnce(el('div', 'code-ch', ch), 'code' + code + i)));
    return row;
  }
  function copyCode(code, label) {
    const done = () => { copied = true; L.sfx('copy'); label.textContent = 'Copied'; clearTimeout(copyTimer); copyTimer = setTimeout(() => { copied = false; label.textContent = 'Copy invite'; }, 1500); };
    const fallback = () => {
      try {
        const t = document.createElement('textarea'); t.value = code; t.style.cssText = 'position:fixed;opacity:0;user-select:text;-webkit-user-select:text';
        document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (ok) done();
      } catch (e) { /* no clipboard here: the code is on screen anyway */ }
    };
    try { navigator.clipboard.writeText(code).then(done, fallback); } catch (e) { fallback(); }
  }

  // ---------- games and rounds (the host picks, everyone sees it live) ----------
  const gname = id => { const g = L.games.find(x => x.id === id); return g ? (L.displayName ? L.displayName(g) : g.name) : id; };
  const roundsText = n => n === 0 ? 'Tournament: each game once' : n === 1 ? '1 round per game' : n + ' rounds per game';
  function chip(label, on, fn, title) {
    const b = el('button', 'chip' + (on ? ' is-on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
    if (title) b.title = title;
    b.onclick = () => { L.sfx('click'); fn(); };
    return b;
  }
  let modeFor = { s: null, mode: '' };   // the host's Single game / Tournament tab for this room
  const coverCache = {};
  // a small cover (the same art as the game card) for the game picker, drawn once per game and look
  function cover(g) {
    const c = L.colors(), key = g.id + (c.dark ? 'd' : 'l'), im = el('img', 'gcard-cover'); im.alt = ''; im.draggable = false;
    if (!coverCache[key]) {
      try {
        const w = 120, h = 46, cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2;
        const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.fillStyle = g.tint || '#888'; ctx.fillRect(0, 0, w, h);
        g.art && g.art(ctx, w, h, c); coverCache[key] = cv.toDataURL('image/png');
      } catch (e) { coverCache[key] = ''; }
    }
    if (coverCache[key]) im.src = coverCache[key];
    im.style.background = g.tint || 'var(--surface-2)';
    return im;
  }
  function planBlock(host) {
    const box = el('div', 'plan');
    const plan = session.plan, playable = session.playable();
    if (session.legacy || session.oldPeer) {
      box.appendChild(el('p', 'lobby-note', 'A friend has an older Ludus, so this room plays ' + gname(plan.g[0] || session.gameId) + ' only. Tournaments need everyone on the newest version.'));
      return box;
    }
    if (!host) {
      if (session.hostSg) return guestPlan(box);
      box.appendChild(el('div', 'plan-line', 'Games: ' + (plan.g.map(gname).join(', ') || '...')));
      box.appendChild(el('div', 'plan-line', roundsText(plan.n)));
      return box;
    }
    const n = Math.max(2, session.count());
    const mode = modeFor.s === session && modeFor.mode ? modeFor.mode : (plan.g.length > 1 || plan.n === 0 ? 'tournament' : 'single');
    const setMode = m => {
      modeFor = { s: session, mode: m };
      if (m === 'single') session.setPlan(plan.g.slice(0, 1), plan.n === 0 ? 1 : plan.n);
      else session.setPlan(plan.g, plan.n === 1 || plan.n === 0 ? 3 : plan.n);
      render();
    };
    const tabs = el('div', 'mode-tabs'); tabs.setAttribute('role', 'tablist');
    [['single', 'Single game'], ['tournament', 'Tournament']].forEach(([m, t]) => {
      const tb = el('button', 'mode-tab' + (mode === m ? ' is-on' : ''), t); tb.type = 'button'; tb.setAttribute('role', 'tab'); tb.setAttribute('aria-selected', String(mode === m));
      tb.onclick = () => { if (mode !== m) { L.sfx('click'); setMode(m); } };
      tabs.appendChild(tb);
    });
    box.appendChild(tabs);
    const rn = plan.n === 0 ? 3 : plan.n;
    box.appendChild(el('div', 'mode-note', mode === 'single' ? (rn === 1 ? 'One game, one round' : 'One game, best of ' + rn) : 'Several games, 1 point per game won'));
    box.appendChild(el('div', 'field-label', mode === 'single' ? 'Pick a game' : 'Pick 2 or more games'));
    const chips = el('div', 'pick-chips game-grid');
    L.games.filter(g => g.online && g.online.max >= n && g.online.min <= session.max).forEach(g => {
      const on = plan.g.includes(g.id);
      const c = chip('', on, () => {
        if (mode === 'single') { if (!on) session.setPlan([g.id], plan.n === 0 ? 1 : plan.n); return; }
        const next = on ? plan.g.filter(x => x !== g.id) : plan.g.concat(g.id);
        if (next.length) session.setPlan(next, plan.n);
      });
      c.classList.add('gcard'); c.appendChild(cover(g)); c.appendChild(el('span', 'gcard-name', gname(g.id)));
      chips.appendChild(c);
    });
    box.appendChild(chips);
    box.appendChild(el('div', 'field-label', mode === 'single' ? 'Rounds' : 'Rounds per game'));
    const rr = el('div', 'pick-chips');
    [[1, '1'], [3, '3'], [5, '5']].forEach(([v, t]) => rr.appendChild(chip(t, rn === v, () => session.setPlan(plan.g, v))));
    box.appendChild(rr);
    if (session.count() < 2) box.appendChild(el('p', 'lobby-note', 'Waiting for a friend to join'));
    else if (mode === 'tournament' && plan.g.length < 2) box.appendChild(el('p', 'lobby-note', 'Pick at least 2 games for a tournament.'));
    else if (plan.g.length && !playable.length) box.appendChild(el('p', 'lobby-note', 'None of the picked games fit ' + session.count() + ' players. Pick another game.'));
    else if (playable.length < plan.g.length) box.appendChild(el('p', 'lobby-note', 'Some picked games need a different number of players and will be skipped.'));
    return box;
  }
  // ---------- suggestions: a guest proposes, the host accepts or declines ----------
  const GEO_TIMES = [[30, '30 s'], [60, '60 s'], [120, '2 min'], [0, 'No limit']];
  const GEO_MOVES = [['move', 'Move'], ['nomove', 'No move'], ['nmpz', 'NMPZ']];
  let draft = null;   // the guest's own idea: { s: session, dirty, m: 's'|'t', g: [ids], n, geo: { t?, m? } }
  function syncDraft() {
    const plan = session.plan;
    draft.g = plan.g.slice(); draft.n = plan.n === 0 ? 3 : plan.n; draft.m = plan.g.length > 1 || plan.n === 0 ? 't' : 's';
  }
  const draftPayload = () => {
    const p = { m: draft.m, g: draft.g.slice(), n: draft.n };
    if (draft.geo.t !== undefined || draft.geo.m !== undefined) p.geo = Object.assign({}, draft.geo);
    return p;
  };
  function describe(p) {
    const lines = [];
    lines.push((p.m === 't' ? 'Tournament: ' : 'Single game: ') + p.g.map(gname).join(', '));
    lines.push(p.n === 1 ? '1 round per game' : p.n + ' rounds per game');
    if (p.geo) {
      const t = GEO_TIMES.find(x => x[0] === p.geo.t), m = GEO_MOVES.find(x => x[0] === p.geo.m);
      lines.push('Map Hunt: ' + [t && 'time ' + t[1], m && m[1]].filter(Boolean).join(', '));
    }
    return lines;
  }
  function guestPlan(box) {
    const plan = session.plan, n = Math.max(2, session.count());
    if (!draft || draft.s !== session) { draft = { s: session, dirty: false, geo: {} }; syncDraft(); }
    else if (!draft.dirty) syncDraft();
    const touch = fn => { draft.dirty = true; fn(); render(); };
    box.classList.add('guest-plan');
    // The same picker the host has: your idea is the orange selection (it starts as the host's pick); a small "Host" tag marks
    // what the host has chosen right now. Pick single or tournament, the games and the rounds, then send it.
    box.appendChild(el('div', 'field-label', 'Suggest a game or a tournament'));
    const tabs = el('div', 'mode-tabs'); tabs.setAttribute('role', 'tablist');
    [['s', 'Single game'], ['t', 'Tournament']].forEach(([m, t]) => {
      const tb = el('button', 'mode-tab' + (draft.m === m ? ' is-on' : ''), t); tb.type = 'button'; tb.setAttribute('role', 'tab'); tb.setAttribute('aria-selected', String(draft.m === m)); tb.dataset.mode = m;
      tb.onclick = () => { if (draft.m !== m) { L.sfx('click'); touch(() => { draft.m = m; if (m === 's') draft.g = draft.g.slice(0, 1); }); } };
      tabs.appendChild(tb);
    });
    box.appendChild(tabs);
    box.appendChild(el('div', 'field-label', draft.m === 't' ? 'Games (pick 2 or more)' : 'Game'));
    const chips = el('div', 'pick-chips game-grid');
    L.games.filter(g => g.online && g.online.max >= n && g.online.min <= session.max).forEach(g => {
      const host_on = plan.g.includes(g.id), mine = draft.g.includes(g.id);
      const c = chip('', mine, () => touch(() => {
        if (draft.m === 's') draft.g = [g.id];
        else if (mine) { if (draft.g.length > 1) draft.g = draft.g.filter(x => x !== g.id); } else draft.g = draft.g.concat(g.id);
      }));
      c.classList.add('gcard'); c.classList.toggle('is-host', host_on); c.dataset.id = g.id; c.setAttribute('aria-label', gname(g.id) + (host_on ? ', host’s pick' : '') + (mine ? ', in your suggestion' : ''));
      c.appendChild(cover(g)); c.appendChild(el('span', 'gcard-name', gname(g.id)));
      chips.appendChild(c);
    });
    box.appendChild(chips);
    box.appendChild(el('div', 'field-label', 'Rounds'));
    const rr = el('div', 'pick-chips rounds-pick');
    [1, 3, 5].forEach(v => rr.appendChild(chip(String(v), draft.n === v, () => touch(() => { draft.n = v; }))));
    box.appendChild(rr);
    if (draft.g.includes('geoguess') || plan.g.includes('geoguess')) {
      box.appendChild(el('div', 'field-label', 'Map Hunt time per round'));
      const tr = el('div', 'pick-chips geo-time');
      GEO_TIMES.forEach(([v, t]) => tr.appendChild(chip(t, draft.geo.t === v, () => touch(() => { if (draft.geo.t === v) delete draft.geo.t; else draft.geo.t = v; }))));
      box.appendChild(tr);
      box.appendChild(el('div', 'field-label', 'Map Hunt movement'));
      const mr = el('div', 'pick-chips geo-move');
      GEO_MOVES.forEach(([v, t]) => mr.appendChild(chip(t, draft.geo.m === v, () => touch(() => { if (draft.geo.m === v) delete draft.geo.m; else draft.geo.m = v; }))));
      box.appendChild(mr);
    }
    const payload = draftPayload(), valid = !!L.net.cleanSuggestion(payload);
    const same = payload.m === (plan.g.length > 1 || plan.n === 0 ? 't' : 's') && payload.n === (plan.n === 0 ? 3 : plan.n) && payload.g.join() === plan.g.join() && !payload.geo;
    const st = session.mySug && session.mySug.st;
    const go = btn('Suggest to the host', 'primary small suggest-btn', () => { if (session.suggest(payload)) { draft.dirty = false; render(); } });
    go.disabled = !valid || same || st === 'wait' || !session.canSuggest();
    box.appendChild(go);
    const status = el('div', 'sug-status' + (st ? ' ' + st : ''));
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (st === 'wait') status.textContent = 'Sent. Waiting for the host…';
    else if (st === 'ok') status.textContent = 'Accepted. The host is using your idea.';
    else if (st === 'no') status.textContent = session.mySug.why === 'busy' ? 'Declined: the host is playing right now.' : 'Declined by the host.';
    else if (st === 'late') status.textContent = 'No answer yet. You can send it again.';
    else if (draft.m === 't' && draft.g.length < 2) status.textContent = 'Pick at least 2 games for a tournament.';
    else status.textContent = same ? 'This is the host’s pick. Change it to suggest something else.' : 'The host gets your idea and chooses.';
    box.appendChild(status);
    return box;
  }
  // host: the oldest waiting suggestion as an accept / decline card
  function suggestionCard() {
    const list = session.suggestions();
    if (!list.length) return null;
    const sg = list[0], card_ = el('div', 'sug-card'); card_.setAttribute('role', 'group'); card_.setAttribute('aria-label', 'Suggestion from ' + sg.name);
    const hd = el('div', 'sug-head'); const nm = document.createElement('b'); nm.textContent = sg.name; hd.append(nm, ' suggests'); card_.appendChild(hd);
    describe(sg.p).forEach(t => card_.appendChild(el('div', 'sug-line', t)));
    const row = el('div', 'sug-actions');
    row.appendChild(btn('Accept', 'primary small sug-accept', () => {
      const r = session.answerSuggestion(sg.i, true);
      if (r && r.ok) {
        modeFor = { s: session, mode: r.p.m === 't' ? 'tournament' : 'single' };
        if (r.p.geo) {
          const g = Object.assign({}, L.state.geo);
          if (r.p.geo.t !== undefined) g.time = r.p.geo.t;
          if (r.p.geo.m !== undefined) g.move = r.p.geo.m;
          L.state.geo = g; L.save();
        }
        ops && ops.toast && ops.toast('Accepted ' + r.name + '’s idea');
      } else if (r) ops && ops.toast && ops.toast('Could not use that idea');
      render();
    }));
    row.appendChild(btn('Decline', 'small sug-decline', () => { session.answerSuggestion(sg.i, false); render(); }));
    card_.appendChild(row);
    if (list.length > 1) card_.appendChild(el('div', 'sug-more', '+' + (list.length - 1) + ' more waiting'));
    return card_;
  }
  // The standings table used between rounds and at the end
  function standings(ser, winners) {
    const rows = ser.sc.slice().sort((a, b) => b[2] - a[2]);
    const top = rows.length ? rows[0][2] : 0, list = el('div', 'seats stand');
    rows.forEach(e => {
      const seat = Array.from(session.roster.values()).find(p => p.cid === e[0]);
      const s2 = el('div', 'seat on' + (winners && top > 0 && e[2] === top ? ' lead' : ''));
      const dot = el('div', 'seat-dot', Array.from(e[1])[0].toUpperCase()); dot.style.background = SEAT_COLORS[(seat ? seat.seat : 0) % SEAT_COLORS.length];
      s2.appendChild(dot);
      s2.appendChild(el('div', 'seat-name', e[1] + (e[0] === session.cid ? ' (you)' : '')));
      s2.appendChild(el('div', 'seat-score', String(e[2])));
      list.appendChild(s2);
    });
    return list;
  }
  function nextRound(ser) {
    let gi = ser.gi, ri = ser.ri + 1;
    if (ri >= ser.n) { ri = 0; gi++; }
    return gi < ser.gs.length ? { gi, ri } : null;
  }

  // ---------- screens ----------
  // A redraw that changes the card's height (Opening a room -> the room, a seat filling...) eases the card to its new
  // height instead of snapping, with one curve; a new screen also fades its content in. Instant with reduced motion.
  let rendering = false, screenAt = -1e9;
  function render() {
    if (rendering) return renderBody();
    ensure(); rendering = true;
    const h0 = !sheet.hidden && card.firstChild ? card.getBoundingClientRect().height : 0, s0 = card.dataset.screen, now = performance.now();
    try { renderBody(); } finally { rendering = false; }
    // not while the sheet itself is still coming in (it was hidden: the old height belongs to an earlier room)
    const opening = sheet.hidden || card.getAnimations().some(x => x.animationName === 'sheetIn' && (x.currentTime || 0) < 300);
    if (!h0 || opening || calmMotion()) return;
    const h1 = card.getBoundingClientRect().height;
    if (Math.abs(h1 - h0) >= 2) card.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 300, easing: 'cubic-bezier(0.3, 1.1, 0.45, 1)' });
    // a new screen fades its content in; a redraw a moment later (the roster arriving) carries the same fade on
    if (s0 !== screen) screenAt = now;
    const since = now - screenAt;
    if (since < 260) [...card.children].forEach(c => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 60 - since, easing: 'ease-out', fill: 'backwards' }));
  }
  function renderBody() {
    card.innerHTML = '';
    card.dataset.screen = screen;
    const on = game && game.online;
    const title = (t) => card.appendChild(el('div', 'sheet-title', t));
    const live = el('div', 'lobby-live'); live.setAttribute('aria-live', 'polite');
    if (screen === 'choose') {
      title('Play online');
      card.appendChild(el('p', 'lobby-sub', 'Play ' + (game ? (L.displayName ? L.displayName(game) : game.name) : 'games') + ' with someone in another place. One of you makes a room and shares the code.'));
      const f = el('label', 'field');
      f.appendChild(el('span', 'field-label', 'Your name (optional)'));
      const input = el('input'); input.type = 'text'; input.maxLength = 10; input.placeholder = 'Player'; input.value = nameValue();
      input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Your name');
      input.addEventListener('input', () => { L.state.onlineName = L.net.cleanName(input.value, ''); L.save(); });
      f.appendChild(input);
      card.appendChild(f);
      card.appendChild(btn('Create room', 'primary', createRoom));
      card.appendChild(btn('Join room', '', () => { screen = 'join'; error = ''; render(); }));
      card.appendChild(btn('Cancel', 'ghost', cancel));
      card.appendChild(el('p', 'lobby-note', 'Needs the internet. Anyone who knows the code can join.'));
    } else if (screen === 'creating' || screen === 'joining') {
      title(screen === 'creating' ? 'Opening a room' : 'Looking for room ' + (session ? session.code : ''));
      card.appendChild(connChip(session ? session.conn : 'connecting'));
      card.appendChild(el('p', 'lobby-sub', screen === 'creating' ? 'Getting a room code ready.' : 'Asking the host to let you in.'));
      card.appendChild(btn('Cancel', 'ghost', cancel));
    } else if (screen === 'join') {
      title('Join a room');
      card.appendChild(el('p', 'lobby-sub', 'Type the 5 character room code, or paste the invite your friend sent.'));
      const input = el('input', 'code-input'); input.type = 'text'; input.maxLength = 300; input.placeholder = 'K7M2Q';
      input.autocomplete = 'off'; input.spellcheck = false; input.autocapitalize = 'characters'; input.setAttribute('aria-label', 'Room code');
      input.value = L.lobbyLastCode || '';
      const go = () => { const code = L.net.extractCode(input.value) || L.net.cleanCode(input.value); L.lobbyLastCode = code; if (!L.net.validCode(code)) { error = 'Room codes are 5 letters or digits.'; msg.textContent = error; input.focus(); return; } joinRoom(code); };
      const msg = el('div', 'lobby-error', error); msg.setAttribute('role', 'alert');
      input.addEventListener('input', () => {
        // a pasted sentence or link: pull the code out of it
        const v = input.value, m = L.net.extractCode(v);
        input.value = m || L.net.cleanCode(v); msg.textContent = !m && v.replace(/\s/g, '').length > 6 ? 'No room code found in that text.' : '';
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      card.appendChild(input);
      card.appendChild(msg);
      const f = el('label', 'field');
      f.appendChild(el('span', 'field-label', 'Your name (optional)'));
      const n = el('input'); n.type = 'text'; n.maxLength = 10; n.placeholder = 'Player'; n.value = nameValue(); n.autocomplete = 'off'; n.spellcheck = false; n.setAttribute('aria-label', 'Your name');
      n.addEventListener('input', () => { L.state.onlineName = L.net.cleanName(n.value, ''); L.save(); });
      f.appendChild(n);
      card.appendChild(f);
      card.appendChild(btn('Join', 'primary', go));
      card.appendChild(btn('Back', 'ghost', back));
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) {} }, 30);
    } else if (screen === 'room') {
      const host = session.role === 'host';
      title(host ? 'Your room' : 'In room');
      card.appendChild(codeBoxes(session.code));
      const row = el('div', 'lobby-row');
      const cl = el('span', '', copied ? 'Copied' : 'Copy invite');
      const cb = el('button', 'btn small', ''); cb.type = 'button'; cb.appendChild(cl);
      cb.onclick = () => { copyCode(L.net.inviteText(game ? (L.displayName ? L.displayName(game) : game.name) : 'games', session.code), cl); };
      row.appendChild(cb); row.appendChild(connChip(session.conn));
      card.appendChild(row);
      const n = session.count(), mx = session.max;
      live.textContent = host ? (n >= session.min ? 'Ready to start. ' + n + '/' + mx + ' players' : n < 2 ? 'Waiting for a friend to join' : 'Waiting for players ' + n + '/' + mx) : session.waitRound ? 'A round is being played. You join the next one.' : 'Waiting for the host to start. ' + n + '/' + mx + ' players';
      card.appendChild(live);
      card.appendChild(avatars(n, mx));
      if (host && n > 1 && session.promoteBlock() === 'old') card.appendChild(el('p', 'lobby-note leader-note', 'Make leader needs everyone on the newest Ludus.'));
      if (host) { const sc = suggestionCard(); if (sc) card.appendChild(sc); }
      if (session.flex || session.plan.g.length) card.appendChild(planBlock(host));
      if (host) {
        // a room for more than two: the host may start once enough are in, without waiting for every seat
        const s = btn(mx > 2 && n >= session.min && n < mx ? 'Start now' : 'Start game', 'primary', () => session && session.start());
        s.disabled = session.flex && !session.legacy ? (!session.playable().length || (session.plan.g.length > 1 || (modeFor.s === session && modeFor.mode === 'tournament')) && session.plan.g.length < 2) : n < session.min;
        card.appendChild(s);
      }
      card.appendChild(btn('Leave', 'ghost', cancel));
    } else if (screen === 'board' || screen === 'final') {
      const ser = session.ser, host = session.role === 'host';
      if (!ser) { screen = 'room'; return render(); }
      const winners = ser.sc.filter(e => e[2] === Math.max.apply(null, ser.sc.map(x => x[2])) && e[2] > 0);
      if (screen === 'board') {
        const nx = nextRound(ser);
        title(nx ? 'Round ' + (nx.ri + 1) + ' of ' + ser.n + ' \u00b7 Next: ' + gname(ser.gs[nx.gi]) : 'Last round done');
        card.appendChild(el('p', 'lobby-sub', ser.gs.length > 1 ? 'Points: 1 for each game won' : 'Wins so far'));
        card.appendChild(standings(ser, false));
        card.appendChild(el('div', 'lobby-live', host ? 'Next round starts in a moment.' : 'Waiting for the host to start the next round.'));
        if (host) card.appendChild(btn(nx ? 'Start now' : 'Show results', 'primary', () => session.advance()));
      } else {
        const why = ser.why === 'left' ? 'A player left, so this is how it stands so far.' : ser.why === 'few' ? 'There are not enough players for the next game. Final standings so far.' : ser.why === 'host' ? 'The host left. Final standings so far.' : '';
        title(winners.length === 1 ? winners[0][1] + ' wins' : winners.length > 1 ? 'A tie: ' + winners.map(w => w[1]).join(' and ') : 'No winner this time');
        if (why) card.appendChild(el('p', 'lobby-sub', why));
        card.appendChild(standings(ser, true));
        if (host && ser.why !== 'host') {
          card.appendChild(btn('Rematch', 'primary', () => { if (!session.rematchSeries()) { ops.toast && ops.toast('Not enough players for that'); } }));
          card.appendChild(btn('Back to lobby', '', () => session.toLobby()));
        } else if (ser.why !== 'host') card.appendChild(el('div', 'lobby-live', 'Waiting for the host to choose what is next.'));
        card.appendChild(btn(ser.why === 'host' ? 'OK' : 'Leave', 'ghost', cancelToHome));
      }
    } else if (screen === 'notice') {
      title(error[0]);
      card.appendChild(el('p', 'lobby-sub', error[1]));
      card.appendChild(btn(error[2] || 'OK', 'primary', () => { const f = ops && ops.noticeOk; hide(); if (f) f(); }));
    }
  }

  // ---------- actions ----------
  function hookSession(s) {
    session = s;
    offs.push(s.on('conn', () => { if (screen === 'room' || screen === 'creating' || screen === 'joining') render(); }));
    offs.push(s.on('ready', () => { screen = 'room'; L.sfx('room'); render(); }));
    offs.push(s.on('yield', () => { screen = 'joining'; render(); }));   // somebody else already hosts this code: we join their room
    let seen = s.count ? s.count() : 1;
    offs.push(s.on('roster', () => {
      const n = s.count(), more = n > Math.max(1, seen); seen = n;   // more than just me, and more than before
      if (screen === 'room') {
        render();
        if (more) L.sfx('friend');   // somebody joined the room: a soft chime
        // the room is full: start by itself
        if (s.role === 'host' && s.count() >= s.max) { clearTimeout(autoStart); autoStart = setTimeout(() => { if (session === s && !s.over) s.start(); }, 700); }
      }
    }));
    offs.push(s.on('plan', () => { if (screen === 'room') render(); }));
    offs.push(s.on('host', () => { confirmLeader = { s: null, cid: '' }; if (screen === 'room') { render(); L.sfx('tap'); } }));
    offs.push(s.on('sugstate', () => { if (screen === 'room') { render(); L.sfx('tap'); } }));
    offs.push(s.on('suggest', () => { if (screen === 'room') { render(); L.sfx('tap'); } }));
    offs.push(s.on('oldpeer', () => { ops && ops.toast && ops.toast('Your friend needs to update Ludus for tournaments'); }));
    offs.push(s.on('error', e => { const w = WHY[e.code] || WHY.offline; discard(); if (e.code === 'no-room' || e.code === 'full' || e.code === 'started' || e.code === 'game' || e.code === 'update') { screen = e.code === 'update' ? 'notice' : 'join'; if (e.code === 'update') { error = [w[0], w[1], 'OK']; ops.noticeOk = ops.onCancel; } else error = w[1]; } else if (!game) { ops.toast && ops.toast(w[0]); const back = ops.onCancel; hide(); if (back) back(); return; }   // a room from the Online page: back to that page, not the per-game card
      else { screen = 'choose'; error = ''; ops.toast && ops.toast(w[0]); } render(); }));
    offs.push(s.on('closed', e => { const w = WHY[e.reason] || WHY['host-left']; discard(); screen = 'notice'; error = [w[0], w[1], 'OK']; ops.noticeOk = ops.onCancel; render(); }));
    offs.push(s.on('start', e => {
      if (s.appHooked) { unhook(); session = null; return; }   // the app already runs this room's rounds
      const keep = session; unhook(); session = null;
      hide();
      ops.onStart(keep, e);
    }));
  }
  const uidOf = () => (typeof L.state.onlineId === 'string' ? L.state.onlineId : '');
  function createRoom(code, uid) {
    screen = 'creating'; render(); L.sfx('room');
    if (game) hookSession(L.net.createRoom({ gameId: game.id, min: game.online.min, max: game.online.max, name: nameValue() }));
    else {   // from the Online page: a room for up to 4 whose games the host picks in the lobby
      const first = L.games.find(g => g.id === L.state.last && g.online && g.online.min <= 2) || L.games.find(g => g.online && g.online.min <= 2 && g.online.max >= 2);
      hookSession(L.net.createRoom({ gameId: first ? first.id : '', min: 2, max: 4, name: nameValue(), uid: uid || uidOf(), code: typeof code === 'string' ? code : '' }));
    }
  }
  function joinRoom(code) {
    screen = 'joining'; render(); L.sfx('room');
    hookSession(L.net.joinRoom(code, { gameId: game.id, name: nameValue(), uid: uidOf() }));
    session.code = code;
    render();
  }
  function back() {
    if (screen === 'join') { screen = 'choose'; error = ''; render(); } else cancel();
  }
  function cancel() {
    discard(); hide();
    if (ops && ops.onCancel) ops.onCancel();
  }
  function hide() { ensure(); sheet.hidden = true; unhook(); }
  function cancelToHome() { const f = ops && ops.goHome; hide(); if (f) f(); }

  L.lobby = {
    get session() { return session; },   // for the tests
    get isOpen() { return !!sheet && !sheet.hidden; },
    open(g, o) {
      ensure(); discard();
      game = g; ops = o; screen = 'choose'; error = '';
      sheet.hidden = false; render();
    },
    // A message card over the game ("The host left"). ok runs when the player presses OK.
    notice(title, text, ok) {
      ensure(); ops = ops || {};
      ops.noticeOk = ok; screen = 'notice'; error = [title, text, 'OK']; sheet.hidden = false; render();
    },
    // Show the room screen for a session that is already in the room (joined from a ludus:// link).
    attach(g, s, o) { ensure(); discard(); game = g; ops = o; hookSession(s); screen = 'room'; error = ''; sheet.hidden = false; render(); },
    close() { discard(); if (sheet) sheet.hidden = true; },
    // redraw for this session (the room got a new leader while a scoreboard card is up)
    refresh(s) { if (sheet && !sheet.hidden && session === s && (screen === 'board' || screen === 'final')) render(); },
    hide,
    // A room made from the Online page: no game yet, the host picks games in the lobby.
    openRoom(o, code, uid) { ensure(); discard(); game = null; ops = o; error = ''; sheet.hidden = false; createRoom(code, uid); return session; },
    // Scoreboard between rounds ('board') or the final standings ('final') for a session that is playing a tournament.
    series(s, kind, o) { ensure(); unhook(); session = s; ops = o || ops; screen = kind; sheet.hidden = false; render(); L.sfx(kind === 'final' ? 'best' : 'result'); },
    // Back to the waiting room (after a tournament, "Back to lobby").
    resume(s, o) { ensure(); unhook(); session = s; ops = o || ops; hookSession(s); screen = 'room'; sheet.hidden = false; render(); },
    // [title, text] for a room closing reason
    why(reason) { return WHY[reason] || WHY['host-left']; }
  };
})();
