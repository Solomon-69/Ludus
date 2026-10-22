/* Four Up: Connect Four against the computer, or a friend on the same keyboard. 7 x 6, first to three games takes the match. */
(function () {
  const COLS = 7, ROWS = 6, P = 1, C = 2, TARGET = 3;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  // ---------- pure rules + AI (exposed as _logic for tests) ----------
  const logic = {
    newBoard: () => new Int8Array(COLS * ROWS),
    // lowest empty row in column c (row 0 is the top), or -1 when full
    openRow(b, c) { for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r; return -1; },
    legal(b) { return ORDER.filter(c => !b[c]); },
    // returns the four winning cell indexes through idx, or null
    lineAt(b, idx) {
      const who = b[idx]; if (!who) return null;
      const r0 = Math.floor(idx / COLS), c0 = idx % COLS;
      for (const [dr, dc] of DIRS) {
        const line = [idx];
        for (const s of [1, -1]) {
          let r = r0 + dr * s, c = c0 + dc * s;
          while (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r * COLS + c] === who) { line.push(r * COLS + c); r += dr * s; c += dc * s; }
        }
        if (line.length >= 4) return line.sort((a, z) => a - z).slice(0, 4);
      }
      return null;
    },
    findWin(b) {
      for (let i = 0; i < b.length; i++) { const l = logic.lineAt(b, i); if (l) return { who: b[i], line: l }; }
      return null;
    },
    evaluate(b, me) {
      const op = me === P ? C : P;
      let s = 0;
      for (let r = 0; r < ROWS; r++) { if (b[r * COLS + 3] === me) s += 3; else if (b[r * COLS + 3] === op) s -= 3; }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of DIRS) {
        const er = r + dr * 3, ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        let m = 0, o = 0;
        for (let k = 0; k < 4; k++) { const v = b[(r + dr * k) * COLS + c + dc * k]; if (v === me) m++; else if (v === op) o++; }
        if (m && o) continue;
        if (m === 3) s += 6; else if (m === 2) s += 2;
        if (o === 3) s -= 7; else if (o === 2) s -= 2;
      }
      return s;
    },
    negamax(b, depth, alpha, beta, me) {
      const op = me === P ? C : P;
      const moves = logic.legal(b);
      if (!moves.length) return 0;
      // immediate win check first (cheap and prunes hard)
      for (const c of moves) {
        const r = logic.openRow(b, c), i = r * COLS + c;
        b[i] = me; const w = logic.lineAt(b, i); b[i] = 0;
        if (w) return 100000 + depth;
      }
      if (depth <= 0) return logic.evaluate(b, me);
      let best = -Infinity;
      for (const c of moves) {
        const i = logic.openRow(b, c) * COLS + c;
        b[i] = me;
        const v = -logic.negamax(b, depth - 1, -beta, -alpha, op);
        b[i] = 0;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    },
    // pick a column for `me` at level 0/1/2
    choose(board, level, me, rnd) {
      rnd = rnd || Math.random;
      const b = Int8Array.from(board), op = me === P ? C : P;
      const moves = logic.legal(b);
      if (moves.length === 1) return moves[0];
      const winNow = moves.find(c => { const i = logic.openRow(b, c) * COLS + c; b[i] = me; const w = logic.lineAt(b, i); b[i] = 0; return w; });
      if (winNow !== undefined && (level > 0 || rnd() < 0.75)) return winNow;
      if (level === 0 && rnd() < 0.3) return moves[Math.floor(rnd() * moves.length)];
      const depth = [2, 5, 7][level] || 5;
      let best = -Infinity, pick = [];
      for (const c of moves) {
        const i = logic.openRow(b, c) * COLS + c;
        b[i] = me;
        const v = logic.lineAt(b, i) ? 200000 : -logic.negamax(b, depth - 1, -Infinity, Infinity, op);
        b[i] = 0;
        if (v > best + 0.5) { best = v; pick = [c]; } else if (Math.abs(v - best) <= 0.5) pick.push(c);
      }
      // ties: some variety so no two games play out the same (Hard leans to the centre-most)
      return level === 2 && rnd() < 0.5 ? pick[0] : pick[Math.floor(rnd() * pick.length)];
    }
  };

  Ludus.register({
    id: 'fourup', name: 'Connect Four', aka: 'Four Up', tag: 'Duel', versus: true, online: { min: 2, max: 2 }, tint: '#c4633f',
    hint: 'Click a column, or <kbd>←</kbd><kbd>→</kbd> + <kbd>Space</kbd> (or <kbd>1</kbd>-<kbd>7</kbd>). Four in a row wins a game. First to 3 games. vs Friend: take turns',
    _logic: logic,
    art(ctx, w, h) {
      const D = Ludus.draw;
      const cell = Math.min(w / 8.2, h / 5.2), bw = cell * 7, bh = cell * 4;
      const ox = (w - bw) / 2, oy = (h - bh) / 2 + cell * 0.15;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      D.roundRect(ctx, ox - 4, oy - 4, bw + 8, bh + 8, 9); ctx.fill();
      const pat = ['.......', '...C...', '..PCP..', '.CPPPC.'];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
        const ch = pat[r][c], x = ox + c * cell + cell / 2, y = oy + r * cell + cell / 2;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = ch === 'P' ? '#fff7ef' : ch === 'C' ? '#3b2418' : 'rgba(0,0,0,0.16)'; ctx.fill();
        if (ch === 'P') D.spark(ctx, x, y, cell * 0.22, '#c4633f');
      }
      ctx.beginPath(); ctx.arc(ox + 3.5 * cell, oy - cell * 0.55, cell * 0.38, 0, Math.PI * 2); ctx.fillStyle = '#fff7ef'; ctx.fill();
      D.spark(ctx, ox + 3.5 * cell, oy - cell * 0.55, cell * 0.22, '#c4633f');
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      const L = logic;
      // vs Friend: both players take turns on this keyboard; 'C' is Player 2 and the bot never moves.
      const friend = api.friend;
      // Online: seat 0 plays P, seat 1 plays C; each screen controls only its own side. Moves are sent as { c } and
      // every screen applies the same move to the same board, so the games never drift apart.
      const on = api.online;
      const mySide = on ? (on.seat === 0 ? P : C) : 0;
      const mayAct = () => !on || turn === mySide;
      const nameOf = who => (on && on.names[who === P ? 0 : 1]) || (who === P ? 'Player 1' : 'Player 2');
      let board, discs, turn, wins = { p: 0, c: 0 }, starter = P, winLine = null, lastIdx = -1;
      let phase = 'play', cursor = 3, hoverCol = -1, thinking = false, banner = null, shake = 0, flashT = 0;
      let geo = null, gameNo = 0, sparks = [];

      function newGame() {
        board = L.newBoard(); discs = []; winLine = null; lastIdx = -1; banner = null; sparks = [];
        turn = starter; phase = 'play'; gameNo++;
        if (turn === C && !friend) cpuTurn();
      }

      function dropTime(r) { return api.reduceMotion ? 0.12 : 0.34 + r * 0.045; }

      function place(c, who) {
        const r = L.openRow(board, c); if (r < 0) return false;
        const i = r * COLS + c;
        board[i] = who; lastIdx = i;
        const d = dropTime(r);
        discs.push({ i, r, c, who, t0: performance.now(), dur: d * 1000 });
        api.sfx(who === P || friend ? 'tap' : 'click');
        phase = 'anim';
        api.timeout(() => { api.sfx('drop'); }, d * 360);
        api.timeout(() => afterMove(who), d * 1000 + 20);
        return true;
      }

      function afterMove(who) {
        const line = L.lineAt(board, lastIdx);
        if (line) {
          winLine = line; phase = 'end';
          const pk = who === P ? 'p' : 'c';
          wins[pk]++;
          if (who === P) { api.score(wins.p); api.sfx('line'); } else api.sfx(friend ? 'line' : 'hit');
          if (!api.reduceMotion) { shake = 0.25; burst(line, who); }
          flashT = performance.now();
          const matchOver = wins[pk] >= TARGET;
          banner = friend
            ? { text: nameOf(who) + ' has four', sub: matchOver ? '' : 'Game to ' + nameOf(who) + '. Next game coming', t0: performance.now() }
            : { text: who === P ? 'Four in a row' : 'Bot has four', sub: matchOver ? '' : (who === P ? 'Game to you. Next game coming' : 'Game to the bot. Next game coming'), t0: performance.now() };
          api.timeout(() => {
            if (matchOver) {
              if (friend) api.over({ score: Math.max(wins.p, wins.c), won: true, title: nameOf(who) + ' wins', message: `Match ${wins.p} to ${wins.c}` });
              else api.over({ score: wins.p, won: who === P, title: who === P ? 'You win' : 'Bot wins',
                message: `Match ${wins.p} to ${wins.c}` });
            } else { starter = starter === P ? C : P; newGame(); }
          }, matchOver ? 1500 : 1900);
          return;
        }
        if (!L.legal(board).length) {
          phase = 'end'; banner = { text: 'Draw', sub: 'Board full. Next game coming', t0: performance.now() };
          api.sfx('over');
          api.timeout(() => { starter = starter === P ? C : P; newGame(); }, 1700);
          return;
        }
        turn = who === P ? C : P;
        phase = 'play';
        if (turn === C && !friend) cpuTurn();
      }

      function cpuTurn() {
        thinking = true;
        api.timeout(() => {
          const t0 = performance.now();
          const c = L.choose(board, api.level, C);
          const spent = performance.now() - t0;
          api.timeout(() => { thinking = false; place(c, C); }, Math.max(60, api.rand(380, 640) - spent));
        }, 120);
      }

      function playerDrop(c) {
        if (phase !== 'play' || (turn !== P && !friend) || c < 0 || c >= COLS) return;
        if (!mayAct()) return;
        if (L.openRow(board, c) < 0) { api.sfx('hit'); return; }
        cursor = c;
        if (on) on.send('drop', { c });
        place(c, turn);
      }

      function burst(line, who) {
        line.forEach(i => {
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
            sparks.push({ i, x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, who });
          }
        });
      }

      // ---------- layout ----------
      function layout() {
        const { w, h } = view;
        const top = 54, pad = 14;
        const cell = Math.max(10, Math.min((w - pad * 2 - 16) / COLS, (h - top - pad - 16) / (ROWS + 0.85)));
        const bw = cell * COLS + 16, bh = cell * ROWS + 16;
        const ox = (w - bw) / 2, oy = top + cell * 0.85 + Math.max(0, (h - top - pad - bh - cell * 0.85) / 2);
        geo = { cell, ox, oy, bw, bh, x0: ox + 8, y0: oy + 8 };
        return geo;
      }
      const cx = c => geo.x0 + c * geo.cell + geo.cell / 2;
      const cy = r => geo.y0 + r * geo.cell + geo.cell / 2;

      function colAt(e) {
        if (!geo) return -1;
        const rect = view.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (x < geo.ox || x > geo.ox + geo.bw || y < geo.oy - geo.cell * 1.2 || y > geo.oy + geo.bh) return -1;
        return Math.max(0, Math.min(COLS - 1, Math.floor((x - geo.x0) / geo.cell)));
      }

      // ---------- drawing ----------
      function bounce(t) {
        const n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
      }

      const botInk = col => (friend ? D.P2 : col.dark ? '#6b7380' : '#4a5260');
      function disc(x, y, rad, who, col, alpha, glow) {
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = who === P ? col.accent : botInk(col); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y + rad * 0.12, rad * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = who === P ? col.accent : botInk(col); ctx.fill();
        if (who === P) D.spark(ctx, x, y, rad * 0.5, 'rgba(255,248,242,0.92)');
        else if (friend) D.spark(ctx, x, y, rad * 0.5, 'rgba(255,255,255,0.92)');
        else D.avatar(ctx, x, y, rad * 0.56, 'bot', col);
        if (glow) {
          ctx.lineWidth = Math.max(2, rad * 0.14); ctx.strokeStyle = col.dark ? '#fff4e6' : '#fffaf3';
          ctx.beginPath(); ctx.arc(x, y, rad * (0.9 + glow * 0.06), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      function hud(col) {
        const ended = phase === 'end' || api.ended;
        let status = '';
        if (ended) status = banner ? banner.text : '';
        else if (friend) status = phase === 'play' ? (on && turn === mySide ? 'Your move' : nameOf(turn) + '\u2019s move') : '';
        else if (turn === P) status = phase === 'play' ? 'Your move' : '';
        else status = 'Bot is thinking';
        D.duelHeader(ctx, 8, 8, view.w - 16, {
          left: { who: 'you', label: friend ? nameOf(P) : undefined, pips: wins.p, of: TARGET },
          right: friend ? { who: 'p2', label: nameOf(C), pips: wins.c, of: TARGET } : { who: 'bot', pips: wins.c, of: TARGET },
          turn: ended ? null : (turn === P ? 'left' : 'right'), status, thinking: !ended && turn === C && !friend
        }, col);
      }

      function render(dt) {
        const col = api.colors(), now = performance.now();
        const { w, h } = view;
        layout();
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) { shake = Math.max(0, shake - dt); const k = shake * 14; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
        hud(col);
        const { cell, ox, oy, bw, bh } = geo;
        const rad = cell * 0.4;

        // hover / thinking ghost disc
        let gc = -1, gw = P;
        if (phase === 'play' && (turn === P || friend) && mayAct()) { gc = hoverCol >= 0 ? hoverCol : cursor; gw = turn; }
        else if (thinking) { gc = 3 + Math.sin(now / 420) * 2.6; gw = C; }
        if (gc !== -1) {
          const x = geo.x0 + gc * cell + cell / 2;
          const bob = api.reduceMotion ? 0 : Math.sin(now / 260) * 2;
          const mine = phase === 'play' && (gw === P || friend);
          disc(x, oy - cell * 0.5 + bob, rad, gw, col, mine ? 0.9 : 0.35);
          if (mine) {
            ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.04)' : 'rgba(217,119,87,0.07)';
            D.roundRect(ctx, geo.x0 + gc * cell + 2, oy + 4, cell - 4, bh - 8, cell * 0.45); ctx.fill();
          }
        }

        // discs (drawn behind the board face so they fall "inside")
        ctx.save();
        D.roundRect(ctx, ox, oy, bw, bh, 16); ctx.clip();
        const winSet = new Set(winLine || []);
        discs.forEach(d => {
          const k = Math.min(1, (now - d.t0) / d.dur);
          const y0 = oy - cell * 0.6, y1 = cy(d.r);
          const y = api.reduceMotion ? y1 : D.lerp(y0, y1, bounce(k));
          const dim = winLine && !winSet.has(d.i) ? 0.45 : 1;
          const glow = winSet.has(d.i) ? 0.5 + Math.sin(now / 160) * 0.5 : 0;
          disc(cx(d.c), y, rad, d.who, col, dim, glow);
        });
        ctx.restore();

        // board face with holes (even-odd fill)
        ctx.save();
        ctx.beginPath();
        D.roundRect(ctx, ox, oy, bw, bh, 16);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          ctx.moveTo(cx(c) + cell * 0.43, cy(r)); ctx.arc(cx(c), cy(r), cell * 0.43, 0, Math.PI * 2);
        }
        ctx.fillStyle = col.dark ? '#3a332b' : '#e4d6c2';
        ctx.fill('evenodd');
        ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(80,50,20,0.10)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        // hole rims
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          ctx.beginPath(); ctx.arc(cx(c), cy(r), cell * 0.43, Math.PI * 1.1, Math.PI * 1.9);
          ctx.strokeStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,60,30,0.16)'; ctx.lineWidth = 2; ctx.stroke();
        }
        // last move marker
        if (lastIdx >= 0) {
          const d = discs[discs.length - 1];
          if (d && now - d.t0 > d.dur) {
            ctx.beginPath(); ctx.arc(cx(d.c), cy(d.r), cell * 0.47, 0, Math.PI * 2);
            ctx.strokeStyle = d.who === P ? col.accent : friend ? D.P2 : col.ink2; ctx.lineWidth = 2; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        // keyboard cursor under board
        if (phase === 'play' && (turn === P || friend) && mayAct() && hoverCol < 0) {
          ctx.fillStyle = turn === P ? col.accent : D.P2;
          D.roundRect(ctx, cx(cursor) - cell * 0.18, oy + bh + 5, cell * 0.36, 4, 2); ctx.fill();
        }
        // particles
        sparks = sparks.filter(s => (s.life -= dt) > 0);
        sparks.forEach(s => {
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt;
          const r = Math.floor(s.i / COLS), c = s.i % COLS;
          ctx.globalAlpha = Math.max(0, s.life / 0.7);
          ctx.fillStyle = s.who === P ? col.accent : friend ? D.P2 : col.ink2;
          ctx.beginPath(); ctx.arc(cx(c) + s.x, cy(r) + s.y, 2.4, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        // round result caption under the board (the board itself stays clear)
        if (banner && banner.sub && !api.ended) D.text(ctx, banner.sub, w / 2, Math.min(h - 12, oy + bh + 20), 12, col.ink2, 650);
        ctx.restore();
      }

      // ---------- input ----------
      api.on(view.canvas, 'pointermove', e => { hoverCol = colAt(e); });
      api.on(view.canvas, 'pointerleave', () => { hoverCol = -1; });
      api.on(view.canvas, 'pointerdown', e => {
        const c = colAt(e);
        if (c >= 0) { hoverCol = c; playerDrop(c); }
      });
      api.keys(e => {
        if (e.key === 'ArrowLeft' || e.key === 'a') { cursor = (cursor + COLS - 1) % COLS; hoverCol = -1; api.sfx('tick'); }
        else if (e.key === 'ArrowRight' || e.key === 'd') { cursor = (cursor + 1) % COLS; hoverCol = -1; api.sfx('tick'); }
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); playerDrop(cursor); }
        else if (e.key >= '1' && e.key <= '7') { hoverCol = -1; playerDrop(+e.key - 1); }
      });

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.board) || sv.board.length !== COLS * ROWS || !sv.wins) return false;
        const wp = sv.wins.p | 0, wc = sv.wins.c | 0;
        if (wp < 0 || wc < 0 || wp >= TARGET || wc >= TARGET) return false;
        wins = { p: wp, c: wc }; starter = sv.starter === C ? C : P; api.score(wins.p);
        if (sv.phase === 'end') { starter = starter === P ? C : P; newGame(); return true; }
        board = Int8Array.from(sv.board.map(v => (v === P || v === C ? v : 0)));
        discs = []; winLine = null; banner = null; sparks = []; gameNo++;
        lastIdx = Number.isInteger(sv.lastIdx) && board[sv.lastIdx] ? sv.lastIdx : -1;
        for (let i = 0; i < board.length; i++) if (board[i] && i !== lastIdx) discs.push({ i, r: Math.floor(i / COLS), c: i % COLS, who: board[i], t0: 0, dur: 1 });
        if (lastIdx >= 0) discs.push({ i: lastIdx, r: Math.floor(lastIdx / COLS), c: lastIdx % COLS, who: board[lastIdx], t0: 0, dur: 1 });
        cursor = Math.max(0, Math.min(COLS - 1, sv.cursor | 0));
        if (sv.phase === 'anim' && lastIdx >= 0) { phase = 'anim'; afterMove(board[lastIdx]); return true; }
        turn = sv.turn === C ? C : P; phase = 'play';
        if (turn === C && !friend) cpuTurn();
        return true;
      }

      api.score(0);
      if (!restore(api.saved)) newGame();
      // The other player's moves. Waits (returns false) while a disc is still falling; ignores anything illegal.
      if (on) on.queue((type, d, from) => {
        if (type !== 'drop') return true;
        if (phase !== 'play') return false;
        const who = from === 0 ? P : C;
        if (turn !== who || !d || !Number.isInteger(d.c) || d.c < 0 || d.c >= COLS || L.openRow(board, d.c) < 0) return true;
        place(d.c, who);
        return true;
      });
      api.loop(dt => render(dt));
      return {
        save() {
          if (api.ended || !board) return null;
          if (!discs.length && !wins.p && !wins.c) return null;
          return { v: 1, board: Array.from(board), lastIdx, turn, wins: { p: wins.p, c: wins.c }, starter, phase, cursor };
        }
      };
    }
  });
})();
