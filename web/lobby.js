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
  function discard() { unhook(); if (session) { try { session.leave(); } catch (e) {} } session = null; }

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
      const s = el('div', 'seat' + (p ? ' on' : ''));
      const dot = el('div', 'seat-dot', p ? Array.from(p.name)[0].toUpperCase() : '');
      if (p) dot.style.background = SEAT_COLORS[i % SEAT_COLORS.length];
      s.appendChild(dot);
      const label = p ? p.name + (i === mine ? ' (you)' : '') : 'Waiting';
      s.appendChild(el('div', 'seat-name', label));
      if (p && i === 0) s.appendChild(el('div', 'seat-tag', 'Host'));
      row.appendChild(s);
    }
    return row;
  }
  function codeBoxes(code) {
    const row = el('div', 'code-row');
    row.setAttribute('aria-label', 'Room code ' + code.split('').join(' '));
    code.split('').forEach(ch => row.appendChild(el('div', 'code-ch', ch)));
    return row;
  }
  function copyCode(code, label) {
    const done = () => { copied = true; label.textContent = 'Copied'; clearTimeout(copyTimer); copyTimer = setTimeout(() => { copied = false; label.textContent = 'Copy invite'; }, 1500); };
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
  function planBlock(host) {
    const box = el('div', 'plan');
    const plan = session.plan, playable = session.playable();
    if (session.legacy || session.oldPeer) {
      box.appendChild(el('p', 'lobby-note', 'A friend has an older Ludus, so this room plays ' + gname(plan.g[0] || session.gameId) + ' only. Tournaments need everyone on the newest version.'));
      return box;
    }
    if (!host) {
      box.appendChild(el('div', 'plan-line', 'Games: ' + (plan.g.map(gname).join(', ') || '...')));
      box.appendChild(el('div', 'plan-line', roundsText(plan.n)));
      return box;
    }
    const n = Math.max(2, session.count());
    box.appendChild(el('div', 'field-label', 'Games'));
    const chips = el('div', 'pick-chips');
    L.games.filter(g => g.online && g.online.max >= n && g.online.min <= session.max).forEach(g => {
      const on = plan.g.includes(g.id);
      chips.appendChild(chip(gname(g.id), on, () => {
        const next = on ? plan.g.filter(x => x !== g.id) : plan.g.concat(g.id);
        if (next.length) session.setPlan(next, plan.n);
      }));
    });
    box.appendChild(chips);
    box.appendChild(el('div', 'field-label', 'Rounds per game'));
    const rr = el('div', 'pick-chips');
    [[1, '1'], [3, '3'], [5, '5'], [0, 'Tournament']].forEach(([v, t]) => rr.appendChild(chip(t, plan.n === v, () => session.setPlan(plan.g, v), v === 0 ? 'Every picked game once, in order' : '')));
    box.appendChild(rr);
    if (plan.g.length && !playable.length) box.appendChild(el('p', 'lobby-note', 'None of the picked games fit ' + session.count() + ' players. Pick another game.'));
    else if (playable.length < plan.g.length) box.appendChild(el('p', 'lobby-note', 'Some picked games need a different number of players and will be skipped.'));
    return box;
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
  function render() {
    ensure();
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
      cb.onclick = () => { L.sfx('click'); copyCode(L.net.inviteText(game ? (L.displayName ? L.displayName(game) : game.name) : 'games', session.code), cl); };
      row.appendChild(cb); row.appendChild(connChip(session.conn));
      card.appendChild(row);
      const n = session.count(), mx = session.max;
      live.textContent = host ? (n >= session.min ? 'Ready to start. ' + n + '/' + mx + ' players' : 'Waiting for players ' + n + '/' + mx) : 'Waiting for the host to start. ' + n + '/' + mx + ' players';
      card.appendChild(live);
      card.appendChild(avatars(n, mx));
      if (session.flex || session.plan.g.length) card.appendChild(planBlock(host));
      if (host) {
        // a room for more than two: the host may start once enough are in, without waiting for every seat
        const s = btn(mx > 2 && n >= session.min && n < mx ? 'Start now' : 'Start game', 'primary', () => session && session.start());
        s.disabled = session.flex && !session.legacy ? !session.playable().length : n < session.min;
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
        card.appendChild(el('p', 'lobby-sub', 'Wins so far'));
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
    offs.push(s.on('ready', () => { screen = 'room'; L.sfx('tap'); render(); }));
    offs.push(s.on('roster', () => {
      if (screen === 'room') {
        render();
        // the room is full: start by itself
        if (s.role === 'host' && s.count() >= s.max) { clearTimeout(autoStart); autoStart = setTimeout(() => { if (session === s && !s.over) s.start(); }, 700); }
      }
    }));
    offs.push(s.on('plan', () => { if (screen === 'room') render(); }));
    offs.push(s.on('oldpeer', () => { ops && ops.toast && ops.toast('Your friend needs to update Ludus for tournaments'); }));
    offs.push(s.on('error', e => { const w = WHY[e.code] || WHY.offline; discard(); if (e.code === 'no-room' || e.code === 'full' || e.code === 'started' || e.code === 'game' || e.code === 'update') { screen = e.code === 'update' ? 'notice' : 'join'; if (e.code === 'update') { error = [w[0], w[1], 'OK']; ops.noticeOk = ops.onCancel; } else error = w[1]; } else { screen = 'choose'; error = ''; ops.toast && ops.toast(w[0]); } render(); }));
    offs.push(s.on('closed', e => { const w = WHY[e.reason] || WHY['host-left']; discard(); screen = 'notice'; error = [w[0], w[1], 'OK']; ops.noticeOk = ops.onCancel; render(); }));
    offs.push(s.on('start', e => {
      const keep = session; unhook(); session = null;
      hide();
      ops.onStart(keep, e);
    }));
  }
  function createRoom() {
    screen = 'creating'; render();
    if (game) hookSession(L.net.createRoom({ gameId: game.id, min: game.online.min, max: game.online.max, name: nameValue() }));
    else {   // from the Online page: a room for up to 4 whose games the host picks in the lobby
      const first = L.games.find(g => g.id === L.state.last && g.online && g.online.min <= 2) || L.games.find(g => g.online && g.online.min <= 2 && g.online.max >= 2);
      hookSession(L.net.createRoom({ gameId: first ? first.id : '', min: 2, max: 4, name: nameValue() }));
    }
  }
  function joinRoom(code) {
    screen = 'joining'; render();
    hookSession(L.net.joinRoom(code, { gameId: game.id, name: nameValue() }));
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
    hide,
    // A room made from the Online page: no game yet, the host picks games in the lobby.
    openRoom(o) { ensure(); discard(); game = null; ops = o; error = ''; sheet.hidden = false; createRoom(); return session; },
    // Scoreboard between rounds ('board') or the final standings ('final') for a session that is playing a tournament.
    series(s, kind, o) { ensure(); unhook(); session = s; ops = o || ops; screen = kind; sheet.hidden = false; render(); },
    // Back to the waiting room (after a tournament, "Back to lobby").
    resume(s, o) { ensure(); unhook(); session = s; ops = o || ops; hookSession(s); screen = 'room'; sheet.hidden = false; render(); },
    // [title, text] for a room closing reason
    why(reason) { return WHY[reason] || WHY['host-left']; }
  };
})();
