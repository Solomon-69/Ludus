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
    removed: ['Left the room', 'You were disconnected from the room.']
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
    const row = el('div', 'seats');
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
      card.appendChild(el('p', 'lobby-sub', 'Play ' + game.name + ' with someone in another place. One of you makes a room and shares the code.'));
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
      cb.onclick = () => { L.sfx('click'); copyCode(L.net.inviteText(game.name, session.code), cl); };
      row.appendChild(cb); row.appendChild(connChip(session.conn));
      card.appendChild(row);
      const n = session.count(), mx = session.max;
      live.textContent = host ? (n >= session.min ? 'Ready to start. ' + n + '/' + mx + ' players' : 'Waiting for players ' + n + '/' + mx) : 'Waiting for the host to start. ' + n + '/' + mx + ' players';
      card.appendChild(live);
      card.appendChild(avatars(n, mx));
      if (host) {
        const s = btn('Start game', 'primary', () => session && session.start());
        s.disabled = n < session.min;
        card.appendChild(s);
      }
      card.appendChild(btn('Leave', 'ghost', cancel));
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
    offs.push(s.on('error', e => { const w = WHY[e.code] || WHY.offline; discard(); if (e.code === 'no-room' || e.code === 'full' || e.code === 'started' || e.code === 'game') { screen = 'join'; error = w[1]; } else { screen = 'choose'; error = ''; ops.toast && ops.toast(w[0]); } render(); }));
    offs.push(s.on('closed', e => { const w = WHY[e.reason] || WHY['host-left']; discard(); screen = 'notice'; error = [w[0], w[1], 'OK']; ops.noticeOk = ops.onCancel; render(); }));
    offs.push(s.on('start', () => {
      const keep = session; unhook(); session = null;
      hide();
      ops.onStart(keep);
    }));
  }
  function createRoom() {
    screen = 'creating'; render();
    hookSession(L.net.createRoom({ gameId: game.id, min: game.online.min, max: game.online.max, name: nameValue() }));
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
    // [title, text] for a room closing reason
    why(reason) { return WHY[reason] || WHY['host-left']; }
  };
})();
