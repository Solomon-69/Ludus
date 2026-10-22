/* Nine Squared: ultimate tic-tac-toe against the computer. Your square picks their board. */
(function () {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const P = 1, C = 2, DRAW = 3;
  const WEIGHT = [1.2, 1, 1.2, 1, 1.5, 1, 1.2, 1, 1.2];

  // ---------- pure rules + AI ----------
  // state: cells Int8Array(81) board-major (b*9+c), smalls Int8Array(9) 0 open / P / C / DRAW, force -1 or board, turn, winner
  const logic = {
    LINES,
    newState: () => ({ cells: new Int8Array(81), smalls: new Int8Array(9), force: -1, turn: P, winner: 0, line: null }),
    clone: s => ({ cells: Int8Array.from(s.cells), smalls: Int8Array.from(s.smalls), force: s.force, turn: s.turn, winner: s.winner, line: s.line }),
    lineOf(get, who) { for (const l of LINES) if (get(l[0]) === who && get(l[1]) === who && get(l[2]) === who) return l; return null; },
    smallResult(cells, b) {
      const g = k => cells[b * 9 + k];
      if (logic.lineOf(g, P)) return P;
      if (logic.lineOf(g, C)) return C;
      for (let k = 0; k < 9; k++) if (!g(k)) return 0;
      return DRAW;
    },
    over: s => s.winner !== 0,
    moves(s) {
      if (s.winner) return [];
      const out = [];
      const boards = s.force >= 0 && !s.smalls[s.force] ? [s.force] : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(b => !s.smalls[b]);
      for (const b of boards) for (let k = 0; k < 9; k++) if (!s.cells[b * 9 + k]) out.push(b * 9 + k);
      return out;
    },
    // apply in place
    apply(s, i) {
      const who = s.turn, b = Math.floor(i / 9), k = i % 9;
      s.cells[i] = who;
      if (!s.smalls[b]) {
        const r = logic.smallResult(s.cells, b);
        if (r) {
          s.smalls[b] = r;
          const big = logic.lineOf(x => s.smalls[x], who);
          if (big) { s.winner = who; s.line = big; }
          else if (s.smalls.every(x => x)) s.winner = DRAW;
        }
      }
      s.force = s.smalls[k] ? -1 : k;
      s.turn = who === P ? C : P;
      return s;
    },
    // heuristic from `me` view
    evaluate(s, me) {
      const op = me === P ? C : P;
      if (s.winner === me) return 10000; if (s.winner === op) return -10000; if (s.winner === DRAW) return 0;
      let sc = 0;
      for (let b = 0; b < 9; b++) {
        const r = s.smalls[b];
        if (r === me) sc += 100 * WEIGHT[b]; else if (r === op) sc -= 100 * WEIGHT[b];
        else if (!r) {
          for (const l of LINES) {
            let m = 0, o = 0;
            for (const k of l) { const v = s.cells[b * 9 + k]; if (v === me) m++; else if (v === op) o++; }
            if (m && !o) sc += (m === 2 ? 9 : 1.5) * WEIGHT[b];
            if (o && !m) sc -= (o === 2 ? 9 : 1.5) * WEIGHT[b];
          }
          if (s.cells[b * 9 + 4] === me) sc += 2; else if (s.cells[b * 9 + 4] === op) sc -= 2;
        }
      }
      for (const l of LINES) {
        let m = 0, o = 0, dead = false;
        for (const b of l) { const v = s.smalls[b]; if (v === me) m++; else if (v === op) o++; else if (v === DRAW) dead = true; }
        if (dead) continue;
        if (m && !o) sc += m === 2 ? 220 : 40;
        if (o && !m) sc -= o === 2 ? 220 : 40;
      }
      // a free move for the side to play is a real advantage
      if (s.force === -1) sc += s.turn === me ? 25 : -25;
      return sc;
    },
    wouldWinSmall(s, i, who) {
      const b = Math.floor(i / 9);
      if (s.smalls[b]) return false;
      s.cells[i] = who; const r = logic.smallResult(s.cells, b); s.cells[i] = 0;
      return r === who;
    },
    chooseEasy(s, rnd) {
      const ms = logic.moves(s), me = s.turn, op = me === P ? C : P;
      const wins = ms.filter(i => logic.wouldWinSmall(s, i, me));
      if (wins.length && rnd() < 0.8) return wins[Math.floor(rnd() * wins.length)];
      const blocks = ms.filter(i => logic.wouldWinSmall(s, i, op));
      if (blocks.length && rnd() < 0.6) return blocks[Math.floor(rnd() * blocks.length)];
      return ms[Math.floor(rnd() * ms.length)];
    },
    chooseNormal(s, rnd) {
      const me = s.turn, ms = logic.moves(s);
      let best = -Infinity, pick = [];
      for (const i of ms) {
        const a = logic.apply(logic.clone(s), i);
        let v;
        if (a.winner) v = logic.evaluate(a, me);
        else {
          v = Infinity;
          for (const j of logic.moves(a)) {
            const b2 = logic.apply(logic.clone(a), j);
            const e = logic.evaluate(b2, me);
            if (e < v) v = e;
            if (v <= best) break;
          }
        }
        v += rnd() * 3;
        if (v > best) { best = v; pick = [i]; }
      }
      return pick[0];
    },
    // light playout policy: take a small-board win when one is there, otherwise random
    playout(s, rnd) {
      let guard = 90;
      while (!s.winner && guard--) {
        const ms = logic.moves(s);
        if (!ms.length) { s.winner = DRAW; break; }
        let m = -1;
        if (rnd() < 0.5) for (const i of ms) if (logic.wouldWinSmall(s, i, s.turn)) { m = i; break; }
        if (m < 0) m = ms[Math.floor(rnd() * ms.length)];
        logic.apply(s, m);
      }
      return s.winner;
    },
    chooseMCTS(s, budgetMs, rnd) {
      const me = s.turn;
      const root = { move: -1, parent: null, kids: null, untried: logic.moves(s), n: 0, w: 0, who: me === P ? C : P };
      const t0 = Date.now();
      let iters = 0;
      while ((iters & 63) || Date.now() - t0 < budgetMs) {
        iters++;
        const st = logic.clone(s);
        let node = root;
        // select
        while (node.untried.length === 0 && node.kids && node.kids.length) {
          let bestU = -Infinity, nxt = null;
          const ln = Math.log(node.n);
          for (const k of node.kids) {
            const u = k.w / k.n + 1.25 * Math.sqrt(ln / k.n);
            if (u > bestU) { bestU = u; nxt = k; }
          }
          node = nxt; logic.apply(st, node.move);
        }
        // expand
        if (node.untried.length && !st.winner) {
          const idx = Math.floor(rnd() * node.untried.length);
          const mv = node.untried[idx];
          node.untried[idx] = node.untried[node.untried.length - 1]; node.untried.pop();
          const mover = st.turn;
          logic.apply(st, mv);
          const kid = { move: mv, parent: node, kids: null, untried: logic.moves(st), n: 0, w: 0, who: mover };
          (node.kids = node.kids || []).push(kid);
          node = kid;
        }
        const res = st.winner ? st.winner : logic.playout(st, rnd);
        // backprop: w counts wins for the player who made the move into the node
        while (node) { node.n++; if (res === node.who) node.w += 1; else if (res === DRAW) node.w += 0.5; node = node.parent; }
        if (iters > 200000) break;
      }
      let best = null;
      for (const k of root.kids || []) if (!best || k.n > best.n) best = k;
      return { move: best ? best.move : root.untried[0], iters };
    },
    choose(s, level, rnd, budget) {
      rnd = rnd || Math.random;
      const ms = logic.moves(s);
      if (ms.length === 1) return ms[0];
      // never miss a game-winning move on Normal and Hard
      if (level > 0) for (const i of ms) { const a = logic.apply(logic.clone(s), i); if (a.winner === s.turn) return i; }
      if (level === 0) return logic.chooseEasy(s, rnd);
      if (level === 1) return logic.chooseNormal(s, rnd);
      return logic.chooseMCTS(s, budget || 340, rnd).move;
    }
  };

  Ludus.register({
    id: 'ninesq', name: 'Ultimate Tic-Tac-Toe', aka: 'Nine Squared', tag: 'Duel', tint: '#5b8def', versus: true, online: { min: 2, max: 2 },
    hint: 'Click a square, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> + <kbd>Space</kbd>. The square you pick sends the bot to that board. Win 3 boards in a row. vs Friend: take turns',
    _logic: logic,
    art(ctx, w, h) {
      const D = Ludus.draw, S = Math.min(w, h) * 0.86, s = S / 3, ox = (w - S) / 2, oy = (h - S) / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let k = 1; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(ox + k * s, oy + 2); ctx.lineTo(ox + k * s, oy + S - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox + 2, oy + k * s); ctx.lineTo(ox + S - 2, oy + k * s); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; D.roundRect(ctx, ox + s + 3, oy + 3, s - 6, s - 6, 5); ctx.fill();
      const X = (x, y, r, lw) => { ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); };
      ctx.lineWidth = 3; X(ox + s / 2, oy + s / 2, s * 0.22, 3); X(ox + s * 1.5, oy + s * 1.5, s * 0.22, 3);
      ctx.strokeStyle = '#1d3566'; ctx.lineWidth = 3;
      [[2, 0], [0, 2]].forEach(([c, r]) => { ctx.beginPath(); ctx.arc(ox + c * s + s / 2, oy + r * s + s / 2, s * 0.27, 0, Math.PI * 2); ctx.stroke(); });
      const m = s / 3;
      ctx.lineWidth = 1.6;
      [[0, 0, 1], [1, 1, 2], [2, 2, 1], [0, 2, 2]].forEach(([c, r, who]) => {
        const x = ox + s + c * m + m / 2, y = oy + r * m + m / 2;
        if (who === 1) X(x, y, m * 0.2, 1.6); else { ctx.beginPath(); ctx.arc(x, y, m * 0.24, 0, Math.PI * 2); ctx.stroke(); }
      });
    },
    create(stage, api) {
      const D = Ludus.draw, L = logic;
      const friend = api.friend;
      // Online: seat 0 plays P (X), seat 1 plays C (O). A move is sent as { i } (the cell number 0..80) and every screen applies it.
      const on = api.online;
      const mySide = on ? (on.seat === 0 ? P : C) : 0;
      const mayAct = () => !on || s.turn === mySide;
      const nameOf = who => (on && on.names[who === P ? 0 : 1]) || (who === P ? 'Player 1' : 'Player 2');
      const view = api.canvas();
      const { ctx } = view;
      let s = L.newState(), phase = 'play', thinking = false, last = -1, hover = -1, cur = 40, useCursor = false;
      const placedT = new Float64Array(81), claimT = new Float64Array(9);
      let geo = null, banner = null, shake = 0;

      function doMove(i) {
        const who = s.turn, b = Math.floor(i / 9);
        const before = s.smalls[b];
        L.apply(s, i);
        last = i; placedT[i] = performance.now();
        if (!before && s.smalls[b]) { claimT[b] = performance.now(); api.sfx(s.smalls[b] === DRAW ? 'move' : who === P ? 'score' : 'merge'); }
        else api.sfx(who === P || friend ? 'tap' : 'click');
        if (s.winner) return finish();
        if (s.turn === C && !friend) cpuTurn(); else snapCursor();
      }
      // keep the keyboard cursor inside the board you are allowed to play in
      function snapCursor() {
        const ms = L.moves(s); if (!ms.length || ms.includes(cur)) return;
        const b = Math.floor(ms[0] / 9), centre = b * 9 + 4;
        cur = ms.includes(centre) && ms.every(i => Math.floor(i / 9) === b) ? centre : ms[0];
      }

      function finish() {
        phase = 'end';
        if (friend) {
          const w = s.winner === DRAW ? '' : nameOf(s.winner) + ' wins';
          banner = { text: w || 'Draw', t0: performance.now() };
          api.sfx(w ? 'line' : 'over');
          api.timeout(() => api.over({ score: w ? 1 : 0, won: !!w, title: w || 'Draw', message: w ? 'Three boards in a row' : 'No line left to make' }), 1500);
          return;
        }
        const won = s.winner === P;
        banner = { text: won ? 'You win' : s.winner === DRAW ? 'Draw' : 'Bot wins', t0: performance.now() };
        if (won) api.score(1); else if (!api.reduceMotion && s.winner === C) shake = 0.22;
        api.sfx(won ? 'line' : s.winner === DRAW ? 'over' : 'hit');
        api.timeout(() => api.over({ score: won ? 1 : 0, won, title: won ? 'You win' : s.winner === DRAW ? 'Draw' : 'Bot wins',
          message: won ? 'Three boards in a row' : s.winner === DRAW ? 'No line left to make' : 'Three boards in a row for the bot' }), 1500);
      }

      function cpuTurn() {
        thinking = true;
        const t0 = performance.now();
        api.timeout(() => {
          const mv = L.choose(s, api.level, Math.random, api.level === 2 ? 260 + Math.random() * 120 : 0);
          api.timeout(() => { thinking = false; if (phase === 'play') doMove(mv); }, Math.max(40, api.rand(420, 680) - (performance.now() - t0)));
        }, 140);
      }

      function playerMove(i) {
        if (phase !== 'play' || (s.turn !== P && !friend) || thinking || i < 0) return;
        if (!mayAct()) return;
        if (!L.moves(s).includes(i)) { api.sfx('hit'); return; }
        if (on) on.send('cell', { i });
        doMove(i);
      }

      // ---------- layout ----------
      function layout() {
        const { w, h } = view, top = 54;
        const S = Math.max(60, Math.min(w - 24, h - top - 34));
        const ox = (w - S) / 2, oy = top + Math.max(2, (h - top - 30 - S) / 2);
        const gap = S * 0.03, bs = (S - gap * 2) / 3, cs = bs / 3;
        geo = { S, ox, oy, gap, bs, cs };
      }
      const boardXY = b => [geo.ox + (b % 3) * (geo.bs + geo.gap), geo.oy + Math.floor(b / 3) * (geo.bs + geo.gap)];
      const cellXY = i => { const [bx, by] = boardXY(Math.floor(i / 9)), k = i % 9; return [bx + (k % 3) * geo.cs + geo.cs / 2, by + Math.floor(k / 3) * geo.cs + geo.cs / 2]; };
      function cellAt(e) {
        if (!geo) return -1;
        const r = view.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        for (let b = 0; b < 9; b++) {
          const [bx, by] = boardXY(b);
          if (x >= bx && x < bx + geo.bs && y >= by && y < by + geo.bs) {
            const c = Math.min(2, Math.floor((x - bx) / geo.cs)), rr = Math.min(2, Math.floor((y - by) / geo.cs));
            return b * 9 + rr * 3 + c;
          }
        }
        return -1;
      }
      // keyboard cursor in 9x9 screen coordinates
      const toScreen = i => { const b = Math.floor(i / 9), k = i % 9; return [Math.floor(b / 3) * 3 + Math.floor(k / 3), (b % 3) * 3 + (k % 3)]; };
      const fromScreen = (r, c) => (Math.floor(r / 3) * 3 + Math.floor(c / 3)) * 9 + (r % 3) * 3 + (c % 3);
      function moveCur(dr, dc) {
        const [r, c] = toScreen(cur);
        cur = fromScreen((r + dr + 9) % 9, (c + dc + 9) % 9); useCursor = true; hover = -1; api.sfx('tick');
      }

      // ---------- drawing ----------
      // Marks draw themselves in: X = two rounded strokes one after the other, O = one circular stroke.
      function markX(x, y, r, c, k, alpha, lw) {
        if (k <= 0) return;
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.strokeStyle = c; ctx.lineWidth = lw || Math.max(2, r * 0.3); ctx.lineCap = 'round';
        const d = r * 0.62, a = D.ease.outCubic(Math.min(1, k * 2)), b = D.ease.outCubic(Math.max(0, k * 2 - 1));
        ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x - d + 2 * d * a, y - d + 2 * d * a); ctx.stroke();
        if (b > 0) { ctx.beginPath(); ctx.moveTo(x + d, y - d); ctx.lineTo(x + d - 2 * d * b, y - d + 2 * d * b); ctx.stroke(); }
        ctx.restore();
      }
      function markO(x, y, r, c, k, alpha, lw) {
        if (k <= 0) return;
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.strokeStyle = c; ctx.lineWidth = lw || Math.max(2, r * 0.3); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, r * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * D.ease.outCubic(k)); ctx.stroke();
        ctx.restore();
      }
      // Thin rounded line drawn from p to q (k = 0..1), with a soft glow in its own colour.
      function glowLine(x1, y1, x2, y2, c, lw, k, alpha) {
        if (k <= 0) return;
        const e = D.ease.inOut(Math.min(1, k)), x = D.lerp(x1, x2, e), y = D.lerp(y1, y2, e);
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.shadowColor = c; ctx.shadowBlur = lw * 4; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha *= 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, lw * 0.35);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
      }
      // the three cells or boards of a line, stretched a little past both ends
      function lineEnds(p, q, ext) { const dx = q[0] - p[0], dy = q[1] - p[1], L2 = Math.hypot(dx, dy) || 1; return [p[0] - dx / L2 * ext, p[1] - dy / L2 * ext, q[0] + dx / L2 * ext, q[1] + dy / L2 * ext]; }
      const markCol = (who, col) => who === P ? col.accent : friend ? D.P2 : col.ink;
      function hud(col) {
        const ended = phase !== 'play';
        const n = who => { let k = 0; for (let b = 0; b < 9; b++) if (s.smalls[b] === who) k++; return k + (k === 1 ? ' board' : ' boards'); };
        D.duelHeader(ctx, 8, 8, view.w - 16, {
          left: friend ? { who: 'you', label: nameOf(P), score: n(P) } : { who: 'you', score: n(P) },
          right: friend ? { who: 'p2', label: nameOf(C), score: n(C) } : { who: 'bot', score: n(C) },
          turn: ended ? null : (s.turn === P ? 'left' : 'right'),
          status: ended ? (banner ? banner.text : '') : friend ? (on && s.turn === mySide ? (s.force >= 0 && !s.smalls[s.force] ? 'Your move' : 'Play anywhere') : nameOf(s.turn) + (s.force >= 0 && !s.smalls[s.force] ? '\u2019s move' : ': play anywhere')) : s.turn === P ? (s.force >= 0 && !s.smalls[s.force] ? 'Your move' : 'Play anywhere') : 'Bot is thinking',
          thinking: !ended && s.turn === C && !friend
        }, col);
      }

      function render(dt) {
        const col = api.colors(), now = performance.now(), { w, h } = view;
        layout();
        const { S, ox, oy, bs, cs } = geo;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) { shake = Math.max(0, shake - dt); const k = shake * 12; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
        hud(col);
        const legal = phase === 'play' ? new Set(L.moves(s)) : new Set();
        const liveBoards = new Set([...legal].map(i => Math.floor(i / 9)));
        const winSet = new Set(s.line || []);
        for (let b = 0; b < 9; b++) {
          const [bx, by] = boardXY(b);
          const live = liveBoards.has(b);
          ctx.fillStyle = live && s.turn === P ? (col.dark ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.10)') : col.surface;
          if (live && s.turn === C) ctx.fillStyle = friend ? (col.dark ? 'rgba(91,141,239,0.15)' : 'rgba(91,141,239,0.11)') : col.dark ? 'rgba(255,255,255,0.06)' : col.surface2;
          D.roundRect(ctx, bx, by, bs, bs, 10); ctx.fill();
          if (winSet.has(b) && s.winner && s.winner !== DRAW) {
            const hk = api.reduceMotion ? 1 : Math.max(0, Math.min(1, (now - Math.max(...s.line.map(x => claimT[x])) - 650) / 500));
            ctx.save(); ctx.globalAlpha = hk;
            ctx.fillStyle = s.winner === P ? 'rgba(217,119,87,0.14)' : (col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(32,28,23,0.06)'); D.roundRect(ctx, bx, by, bs, bs, 10); ctx.fill();
            ctx.strokeStyle = markCol(s.winner, col); ctx.lineWidth = 1.5; ctx.globalAlpha = hk * 0.45; D.roundRect(ctx, bx + 0.75, by + 0.75, bs - 1.5, bs - 1.5, 10); ctx.stroke();
            ctx.restore();
          }
          if (live) {
            ctx.strokeStyle = s.turn === P ? col.accent : friend ? D.P2 : col.ink3; ctx.lineWidth = 2;
            ctx.globalAlpha = s.turn === P || friend ? 0.6 + 0.3 * Math.sin(now / 300) : 0.5; D.roundRect(ctx, bx + 1, by + 1, bs - 2, bs - 2, 10); ctx.stroke(); ctx.globalAlpha = 1;
          }
          // inner grid
          ctx.strokeStyle = col.line; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
          for (let k = 1; k < 3; k++) {
            ctx.beginPath(); ctx.moveTo(bx + k * cs, by + cs * 0.18); ctx.lineTo(bx + k * cs, by + bs - cs * 0.18); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx + cs * 0.18, by + k * cs); ctx.lineTo(bx + bs - cs * 0.18, by + k * cs); ctx.stroke();
          }
          const claimed = s.smalls[b];
          const smallLine = claimed === P || claimed === C ? L.lineOf(k => s.cells[b * 9 + k], claimed) : null;
          const winCells = new Set(smallLine || []);
          const cel = api.reduceMotion ? 9 : (now - claimT[b]) / 1000, ct = Math.min(1, cel / 0.32) * (cel < 0.7 ? 1 : Math.max(0.45, 1 - (cel - 0.7) * 1.5));
          if (smallLine) smallLine.forEach(k => { const [x, y] = cellXY(b * 9 + k); ctx.fillStyle = claimed === P ? 'rgba(217,119,87,' + (0.14 * ct) + ')' : (col.dark ? 'rgba(255,255,255,' : 'rgba(32,28,23,') + (0.06 * ct) + ')'; D.roundRect(ctx, x - cs * 0.42, y - cs * 0.42, cs * 0.84, cs * 0.84, 6); ctx.fill(); });
          for (let k = 0; k < 9; k++) {
            const i = b * 9 + k, v = s.cells[i]; if (!v) continue;
            const [x, y] = cellXY(i);
            const t = api.reduceMotion ? 1 : Math.min(1, (now - placedT[i]) / 280);
            const a = claimed ? (claimed !== DRAW && winCells.has(k) ? 0.5 : 0.22) : 1;
            if (i === last) { ctx.fillStyle = v === P ? 'rgba(217,119,87,0.18)' : (col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(32,28,23,0.07)'); D.roundRect(ctx, x - cs * 0.44, y - cs * 0.44, cs * 0.88, cs * 0.88, 6); ctx.fill(); }
            if (v === P) markX(x, y, cs * 0.34, col.accent, t, a);
            else markO(x, y, cs * 0.34, markCol(C, col), t, a);
          }
          // claimed overlay
          if (claimed) {
            const el = api.reduceMotion ? 9 : (now - claimT[b]) / 1000;
            const cxm = bx + bs / 2, cym = by + bs / 2;
            if (smallLine) {
              const p = cellXY(b * 9 + smallLine[0]), q = cellXY(b * 9 + smallLine[2]), e = lineEnds(p, q, cs * 0.3);
              glowLine(e[0], e[1], e[2], e[3], markCol(claimed, col), Math.max(1.6, cs * 0.07), el / 0.3, el < 0.5 ? 0.9 : Math.max(0.3, 0.9 - (el - 0.5) * 2));
            }
            const mk = Math.min(1, Math.max(0, (el - 0.22) / 0.45)), lw = Math.max(2.5, bs * 0.055);
            if (claimed === P) markX(cxm, cym, bs * 0.38, col.accent, mk, 1, lw);
            else if (claimed === C) markO(cxm, cym, bs * 0.4, markCol(C, col), mk, 0.85, lw);
            else D.text(ctx, 'Draw', cxm, cym, bs * 0.16, col.ink3, 700);
          }
        }
        if (s.line && s.winner && s.winner !== DRAW) {
          const tEnd = Math.max(...s.line.map(b => claimT[b])), k = api.reduceMotion ? 1 : (now - tEnd - 650) / 560;
          const c = markCol(s.winner, col), a = boardXY(s.line[0]), b = boardXY(s.line[2]);
          const e = lineEnds([a[0] + bs / 2, a[1] + bs / 2], [b[0] + bs / 2, b[1] + bs / 2], bs * 0.42);
          glowLine(e[0], e[1], e[2], e[3], c, Math.max(2.5, bs * 0.035), k, 0.95);
        }
        // hover / cursor preview
        const target = useCursor ? cur : hover;
        if (phase === 'play' && (s.turn === P || friend) && mayAct() && target >= 0) {
          const [x, y] = cellXY(target), tc = markCol(s.turn, col);
          if (legal.has(target)) { if (s.turn === P) markX(x, y, cs * 0.34, tc, 1, 0.35); else markO(x, y, cs * 0.34, tc, 1, 0.35); }
          if (useCursor) { ctx.strokeStyle = legal.has(target) ? tc : col.ink3; ctx.lineWidth = 2; D.roundRect(ctx, x - cs * 0.45, y - cs * 0.45, cs * 0.9, cs * 0.9, 6); ctx.stroke(); }
        }
        // thinking cue: soft scan across live boards
        if (thinking && !api.reduceMotion) {
          const arr = [...liveBoards];
          if (arr.length) {
            const b = arr[Math.floor(now / 380) % arr.length], [bx, by] = boardXY(b);
            ctx.strokeStyle = col.ink2; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
            D.roundRect(ctx, bx - 2, by - 2, bs + 4, bs + 4, 12); ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      }

      // ---------- input ----------
      api.on(view.canvas, 'pointermove', e => { hover = cellAt(e); if (hover >= 0) useCursor = false; });
      api.on(view.canvas, 'pointerleave', () => { hover = -1; });
      api.on(view.canvas, 'pointerdown', e => { const i = cellAt(e); if (i >= 0) { useCursor = false; playerMove(i); } });
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a') moveCur(0, -1);
        else if (k === 'ArrowRight' || k === 'd') moveCur(0, 1);
        else if (k === 'ArrowUp' || k === 'w') moveCur(-1, 0);
        else if (k === 'ArrowDown' || k === 's') moveCur(1, 0);
        else if (k === ' ' || k === 'Enter') { e.preventDefault(); useCursor = true; playerMove(cur); }
      });

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.cells) || sv.cells.length !== 81 || !Array.isArray(sv.smalls) || sv.smalls.length !== 9) return false;
        if (!sv.cells.every(v => v === 0 || v === P || v === C) || !sv.smalls.every(v => v >= 0 && v <= DRAW)) return false;
        const n = L.newState();
        n.cells = Int8Array.from(sv.cells); n.smalls = Int8Array.from(sv.smalls);
        n.force = Number.isInteger(sv.force) && sv.force >= -1 && sv.force < 9 ? sv.force : -1;
        n.turn = sv.turn === C ? C : P;
        if (L.lineOf(x => n.smalls[x], P) || L.lineOf(x => n.smalls[x], C) || !L.moves(n).length) return false;
        s = n; last = Number.isInteger(sv.last) ? sv.last : -1;
        cur = Number.isInteger(sv.cur) && sv.cur >= 0 && sv.cur < 81 ? sv.cur : 40;
        if (s.turn === C && !friend) cpuTurn(); else snapCursor();
        return true;
      }

      api.score(0);
      restore(api.saved);
      // The other player's moves; anything that is not legal on their turn is ignored.
      if (on) on.queue((type, d, from) => {
        if (type !== 'cell') return true;
        if (phase !== 'play') return false;
        const who = from === 0 ? P : C;
        if (s.turn !== who || !d || !Number.isInteger(d.i) || d.i < 0 || d.i >= 81 || !L.moves(s).includes(d.i)) return true;
        doMove(d.i);
        return true;
      });
      api.loop(dt => render(dt));
      return {
        save() {
          if (api.ended) return null;
          if (phase !== 'play') return { v: 1, dead: true };
          if (last < 0) return null;
          return { v: 1, cells: Array.from(s.cells), smalls: Array.from(s.smalls), force: s.force, turn: s.turn, last, cur };
        }
      };
    }
  });
})();
