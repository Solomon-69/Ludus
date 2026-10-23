/* The Crossing: Hex on a 7 x 7 board. You join left to right, the computer joins top to bottom.
   No draws. After the first stone the other side may steal it (swap rule).
   Score = games won in a row. The run ends when the computer crosses. */
(function () {
  const N = 7, NN = N * N, YOU = 1, CPU = 2;
  const PURPLE = '#9b6dd6';
  const NB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
  const NEI = [];
  for (let i = 0; i < NN; i++) {
    const r = Math.floor(i / N), c = i % N, out = [];
    NB.forEach(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N) out.push(rr * N + cc); });
    NEI.push(out);
  }
  // ---------- rules (pure) ----------
  // Shortest chain of side s across the board, or null. YOU joins column 0 to column N-1, CPU row 0 to row N-1.
  function winPath(b, s) {
    const par = new Int16Array(NN).fill(-2), q = [];
    for (let k = 0; k < N; k++) { const i = s === YOU ? k * N : k; if (b[i] === s) { par[i] = -1; q.push(i); } }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (s === YOU ? i % N === N - 1 : Math.floor(i / N) === N - 1) {
        const path = []; let j = i; while (j !== -1) { path.push(j); j = par[j]; } return path;
      }
      for (const j of NEI[i]) if (b[j] === s && par[j] === -2) { par[j] = i; q.push(j); }
    }
    return null;
  }
  const stack = new Int16Array(NN), seen = new Uint8Array(NN);
  function cpuConnects(b) { // fast check used by playouts
    seen.fill(0); let sp = 0;
    for (let c = 0; c < N; c++) if (b[c] === CPU) { seen[c] = 1; stack[sp++] = c; }
    while (sp) {
      const i = stack[--sp]; if (i >= NN - N) return true;
      const nb = NEI[i];
      for (let k = 0; k < nb.length; k++) { const j = nb[k]; if (!seen[j] && b[j] === CPU) { seen[j] = 1; stack[sp++] = j; } }
    }
    return false;
  }
  // Swap rule: the opening stone changes colour and mirrors across the long diagonal.
  function swapBoard(b) {
    const out = Array.from(b); const i = out.findIndex(v => v !== 0); if (i < 0) return { board: out, cell: -1 };
    const r = Math.floor(i / N), c = i % N, owner = out[i];
    out[i] = 0; out[c * N + r] = owner === YOU ? CPU : YOU;
    return { board: out, cell: c * N + r };
  }
  function winningCell(b, s) {
    for (let i = 0; i < NN; i++) if (!b[i]) { b[i] = s; const w = winPath(b, s); b[i] = 0; if (w) return i; }
    return -1;
  }
  // If the player just stepped into one of our bridges (or edge templates), take the other carrier.
  function bridgeReply(b, m) {
    if (m < 0) return -1;
    for (let i = 0; i < NN; i++) {
      if (b[i] !== CPU) continue;
      const ri = Math.floor(i / N), ci = i % N;
      // edge templates: a stone on row 1 or N-2 with both edge carriers
      if (ri === 1 || ri === N - 2) {
        const top = ri === 1, cells = top ? [[0, ci], [0, ci + 1]] : [[N - 1, ci - 1], [N - 1, ci]];
        const ids = cells.filter(([r, c]) => c >= 0 && c < N).map(([r, c]) => r * N + c);
        if (ids.length === 2 && ids.includes(m)) { const o = ids[0] === m ? ids[1] : ids[0]; if (!b[o]) return o; }
      }
      for (let j = i + 1; j < NN; j++) {
        if (b[j] !== CPU) continue;
        const common = NEI[i].filter(x => NEI[j].includes(x));
        if (common.length !== 2 || NEI[i].includes(j)) continue;
        if (common.includes(m)) { const o = common[0] === m ? common[1] : common[0]; if (!b[o]) return o; }
      }
    }
    return -1;
  }
  // Monte Carlo with all-moves-as-first: fill the board at random, credit every cell the computer owned.
  function makeSearch(b) {
    const empty = []; for (let i = 0; i < NN; i++) if (!b[i]) empty.push(i);
    const wins = new Float64Array(NN), cnt = new Float64Array(NN), work = Int8Array.from(b), order = empty.slice();
    let plays = 0;
    return {
      run(n) {
        for (let p = 0; p < n; p++) {
          for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
          for (let k = 0; k < order.length; k++) work[order[k]] = k % 2 === 0 ? CPU : YOU;
          const won = cpuConnects(work);
          for (let k = 0; k < order.length; k += 2) { const c = order[k]; cnt[c]++; if (won) wins[c]++; }
          plays++;
        }
      },
      best() {
        let bi = empty[0], bv = -1;
        for (const i of empty) { const v = cnt[i] ? wins[i] / cnt[i] : 0; if (v > bv) { bv = v; bi = i; } }
        return bi;
      },
      get plays() { return plays; }
    };
  }
  function strongOpening(i, level) {
    const r = Math.floor(i / N), c = i % N;
    if (level >= 2) return r >= 1 && r <= N - 2 && c >= 1 && c <= N - 2 && !(r === 1 && c === 1) && !(r === N - 2 && c === N - 2);
    return r >= 2 && r <= N - 3 && c >= 2 && c <= N - 3;
  }

  Ludus.register({
    id: 'crossing', name: 'Hex', aka: 'The Crossing', tag: 'Duel', tint: PURPLE, versus: true, online: { min: 2, max: 2 },
    hint: 'Click a hex, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> + <kbd>Space</kbd>. Link your left and right edges with a chain. <kbd>S</kbd> steals the bot opening stone. vs Friend: take turns, Player 2 joins top to bottom, first to 3 games',
    _rules: { winPath, cpuConnects, swapBoard, winningCell, bridgeReply, makeSearch, N, YOU, CPU },
    art(ctx, w, h) {
      const R = h * 0.13, W = Math.sqrt(3) * R, n = 4;
      const ox = w / 2 - W * (n + (n - 1) / 2) / 2, oy = h / 2 - (2 * R + 1.5 * R * (n - 1)) / 2;
      const pat = ['0120', '1210', '0211', '2010'];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const x = ox + W / 2 + W * (c + r / 2), y = oy + R + 1.5 * R * r, v = pat[r][c];
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); ctx.lineTo(x + (R - 1) * Math.cos(a), y + (R - 1) * Math.sin(a)); }
        ctx.closePath();
        ctx.fillStyle = v === '1' ? '#d97757' : v === '2' ? '#fff' : 'rgba(255,255,255,0.28)'; ctx.fill();
      }
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend, TARGET = 3;
      // Online: seat 0 plays YOU (left to right), seat 1 plays CPU (top to bottom). Moves go out as 'stone' { i } and
      // 'swap' {}; every screen applies the same move to the same board.
      const on = api.online;
      const mySide = on ? (on.seat === 0 ? YOU : CPU) : 0;
      const mayAct = () => !on || turn === mySide;
      const nameOf = sd => (on && on.names[sd === YOU ? 0 : 1]) || (sd === YOU ? 'Player 1' : 'Player 2');
      const wins = [0, 0, 0];
      let clock = 0, matches = 0, starter = YOU;
      let board, turn, moves, last, lastBy, swapped, winner, path, pathArr, winT, placeT, job, hover = -1, banner = null, parts = [], kc = 24, useKeys = false;
      api.score(0);

      function newGame(quiet) {
        board = new Int8Array(NN); turn = starter; moves = 0; last = -1; lastBy = [-1, -1, -1]; swapped = false; winner = 0; path = null; pathArr = null; winT = 0;
        placeT = new Float64Array(NN).fill(-9); job = null;
        if (turn === CPU && !quiet && !friend) think();
      }
      function geo() {
        const w = view.w, h = view.h, top = 50, bottom = 58;
        const R = Math.max(8, Math.min((w - 16) / (Math.sqrt(3) * (N + (N - 1) / 2) + 2.6), (h - top - bottom) / (2 + 1.5 * (N - 1) + 2.2)));
        const W = Math.sqrt(3) * R, bw = W * (N + (N - 1) / 2), bh = 2 * R + 1.5 * R * (N - 1);
        const ox = (w - bw) / 2, oy = top + (h - top - bottom - bh) / 2;
        return { w, h, R, W, cx: (r, c) => ox + W / 2 + W * (c + r / 2), cy: r => oy + R + 1.5 * R * r, bottom };
      }
      function cellAt(e) {
        const rect = view.canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, G = geo();
        let bi = -1, bd = G.R * 0.95;
        for (let i = 0; i < NN; i++) { const r = Math.floor(i / N), c = i % N, d = Math.hypot(G.cx(r, c) - x, G.cy(r) - y); if (d < bd) { bd = d; bi = i; } }
        return bi;
      }
      function stealBtn() { const G = geo(); return { x: G.w / 2 - 70, y: G.h - 46, w: 140, h: 34 }; }
      const canSteal = () => !winner && (turn === YOU || friend) && mayAct() && moves === 1 && !swapped && board.some(v => v && v !== turn);

      function place(i, s) {
        board[i] = s; moves++; last = i; lastBy[s] = i; placeT[i] = clock; api.sfx(s === YOU ? 'drop' : 'click');
        const p = winPath(board, s);
        if (p) { winner = s; pathArr = p.slice().reverse(); path = new Set(p); winT = clock; endGame(); return; }
        turn = s === YOU ? CPU : YOU;
        if (turn === CPU && !friend) think();
      }
      function doSwap(by) {
        const r = swapBoard(board); board = Int8Array.from(r.board); swapped = true; moves = 1; last = r.cell; lastBy = [-1, -1, -1]; lastBy[board[r.cell]] = r.cell; placeT[r.cell] = clock;
        api.sfx('power'); banner = friend ? { title: nameOf(by) + ' stole it', sub: 'The opening stone changes sides', t: clock, small: true }
          : { title: by === CPU ? 'Stolen' : 'You stole it', sub: by === CPU ? 'The bot took your opening stone' : 'The bot opening is yours now', t: clock, small: true };
        api.timeout(() => { if (banner && banner.small) banner = null; }, 1100);
        turn = by === YOU ? CPU : YOU;
        if (turn === CPU && !friend) think();
      }
      function endGame() {
        if (friend) {
          wins[winner]++; api.sfx('win'); burstPath(winner === YOU ? col0().accent : D.P2);
          const done = wins[winner] >= TARGET;
          api.timeout(() => { banner = { title: nameOf(winner) + ' crossed', sub: done ? 'Match ' + wins[YOU] + ' to ' + wins[CPU] : 'Games ' + wins[YOU] + ' to ' + wins[CPU] + '. First to ' + TARGET, t: clock }; }, 700);
          if (done) api.timeout(() => api.over({ score: Math.max(wins[YOU], wins[CPU]), won: true, title: nameOf(winner) + ' wins', message: 'Match ' + wins[YOU] + ' to ' + wins[CPU] }), 2200);
          else api.timeout(() => { banner = null; starter = starter === YOU ? CPU : YOU; newGame(); }, 2400);
          return;
        }
        if (winner === YOU) {
          matches++; api.score(matches); api.sfx('win'); burstPath(col0().accent);
          api.timeout(() => { banner = { title: 'You crossed', sub: matches + (matches === 1 ? ' game' : ' games') + ' in a row', t: clock }; }, 700);
          api.timeout(() => { banner = null; starter = starter === YOU ? CPU : YOU; newGame(); }, 2400);
        } else {
          api.sfx('lose');
          api.timeout(() => api.over({ score: matches, won: false, title: 'Bot wins', message: matches ? matches + (matches === 1 ? ' game' : ' games') + ' won in a row' : 'No games won this time' }), 1700);
        }
      }
      const col0 = () => api.colors();
      function burstPath(c) {
        if (api.reduceMotion || !path) return;
        const G = geo();
        path.forEach(i => {
          const r = Math.floor(i / N), cc = i % N;
          for (let k = 0; k < 4; k++) parts.push({ x: G.cx(r, cc), y: G.cy(r), vx: api.rand(-90, 90), vy: api.rand(-160, -20), life: api.rand(0.5, 0.9), s: api.rand(2, 4), c });
        });
      }

      // ---------- computer ----------
      function think() {
        const t0 = clock, level = api.level;
        const delay = api.rand(0.4, 0.65);
        // opening reply: maybe steal
        if (moves === 1 && !swapped && level > 0) {
          const i = board.findIndex(v => v === YOU);
          if (i >= 0 && strongOpening(i, level)) { job = { t0, delay, done: () => doSwap(CPU) }; return; }
        }
        if (moves === 0) {
          const pool = [];
          for (let i = 0; i < NN; i++) { const r = Math.floor(i / N), c = i % N; if (level === 0 || ((r === 1 || r === N - 2 || c === 1 || c === N - 2) && !strongOpening(i, 2))) pool.push(i); }
          const cell = api.pick(pool.length ? pool : [3]);
          job = { t0, delay, done: () => place(cell, CPU) }; return;
        }
        let forced = winningCell(board, CPU);
        if (forced < 0) forced = winningCell(board, YOU);
        if (forced < 0 && level > 0) forced = bridgeReply(board, last);
        if (forced >= 0) { job = { t0, delay, done: () => place(forced, CPU) }; return; }
        const search = makeSearch(board);
        job = { t0, delay, search, budget: [0, 0.3, 0.55][level], playouts: level === 0 ? 160 : Infinity };
      }
      function stepJob() {
        if (!job) return;
        if (job.search) {
          const sliceEnd = performance.now() + 9;
          if (job.search.plays < job.playouts && clock - job.t0 < Math.max(job.budget, 0.02)) {
            let guard = 0;
            while (performance.now() < sliceEnd && job.search.plays < job.playouts && guard++ < 150) job.search.run(40);
          }
          const doneThinking = job.search.plays >= job.playouts || clock - job.t0 >= job.budget;
          if (doneThinking && clock - job.t0 >= job.delay) {
            let cell = job.search.best();
            if (api.level === 0 && Math.random() < 0.2) { const e = []; board.forEach((v, i) => { if (!v) e.push(i); }); cell = api.pick(e); }
            job = null; place(cell, CPU);
          }
        } else if (clock - job.t0 >= job.delay) { const j = job; job = null; j.done(); }
      }

      // ---------- input ----------
      function tryPlay(i) {
        if (winner || (turn !== YOU && !friend) || job || i < 0 || board[i] || !mayAct()) return;
        if (on) on.send('stone', { i });
        place(i, turn);
      }
      api.on(view.canvas, 'pointerdown', e => {
        const rect = view.canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, b = stealBtn();
        if (canSteal() && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { if (on) on.send('swap', {}); doSwap(turn); return; }
        tryPlay(cellAt(e));
      });
      api.on(view.canvas, 'pointermove', e => { hover = cellAt(e); if (hover >= 0) useKeys = false; view.canvas.style.cursor = hover >= 0 && !board[hover] && (turn === YOU || friend) && mayAct() && !winner ? 'pointer' : 'default'; });
      api.on(view.canvas, 'pointerleave', () => { hover = -1; });
      api.keys(e => {
        const k = e.key;
        if ((k === 's' || k === 'S') && canSteal()) { if (on) on.send('swap', {}); doSwap(turn); return; }
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        if (d) { const r = Math.max(0, Math.min(N - 1, Math.floor(kc / N) + d[0])), c = Math.max(0, Math.min(N - 1, kc % N + d[1])); kc = r * N + c; useKeys = true; hover = -1; api.sfx('tick'); return; }
        if (k === ' ' || k === 'Enter') { useKeys = true; tryPlay(kc); }
      });

      // ---------- render ----------
      function hexPath(x, y, s) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); ctx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); }
        ctx.closePath();
      }
      const botColor = col => friend ? D.P2 : col.dark ? '#8fa3c2' : '#5a6f8f';
      // A stone: pops in with a slight overshoot, flat side colour, soft top light. Yours carry a faint spark.
      function drawStone(i, x, y, v, R, col, BOTC) {
        const t = clock - placeT[i], s = t < 0.34 && !api.reduceMotion ? D.ease.outBack(Math.max(0, t / 0.34)) : 1;
        if (s <= 0) return;
        ctx.globalAlpha = winner && path && !path.has(i) ? 0.35 : 1;
        hexPath(x, y, (R - 2.5) * s);
        ctx.fillStyle = v === YOU ? col.accent : BOTC; ctx.fill();
        hexPath(x, y - R * 0.12 * s, (R - 2.5) * 0.62 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
        if (v === YOU) { ctx.globalAlpha *= 0.55; D.spark(ctx, x, y, R * 0.3 * s, '#fff8f2', 0); }
        ctx.globalAlpha = 1;
      }
      // Soft ring that breathes out from the newest stone of each side.
      function pulseRing(G, i, c) {
        const r = Math.floor(i / N), cc = i % N, x = G.cx(r, cc), y = G.cy(r);
        ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 2;
        if (api.reduceMotion) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x, y, G.R * 0.98, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return; }
        const age = clock - placeT[i];
        for (let k = 0; k < 2; k++) {
          const ph = ((age + k * 0.8) % 1.6) / 1.6;
          ctx.globalAlpha = 0.55 * (1 - ph) * Math.min(1, age / 0.3);
          ctx.beginPath(); ctx.arc(x, y, G.R * (0.8 + 0.55 * D.ease.outCubic(ph)), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      // Winning chain: a glowing line drawn stone to stone, then a light that keeps running along it.
      function drawWinPath(G, c, col, BOTC) {
        // stones light up one by one as the line reaches them (halo first, then the stone again on top)
        pathArr.forEach((i, j) => {
          const g = api.reduceMotion ? 1 : Math.max(0, Math.min(1, (clock - winT - 0.75 * j / Math.max(1, pathArr.length - 1)) / 0.25));
          if (g <= 0) return;
          const x = G.cx(Math.floor(i / N), i % N), y = G.cy(Math.floor(i / N));
          ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = G.R * 1.1 * g; ctx.globalAlpha = 0.9 * g; hexPath(x, y, G.R - 2.5); ctx.fillStyle = c; ctx.fill(); ctx.restore();
        });
        pathArr.forEach(i => drawStone(i, G.cx(Math.floor(i / N), i % N), G.cy(Math.floor(i / N)), board[i], G.R, col, BOTC));
        const pts = pathArr.map(i => [G.cx(Math.floor(i / N), i % N), G.cy(Math.floor(i / N))]);
        const lens = [0]; for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        const total = lens[lens.length - 1] || 1, age = clock - winT;
        const k = api.reduceMotion ? 1 : D.ease.inOut(Math.min(1, age / 0.75));
        const at = d => { let j = 1; while (j < pts.length - 1 && lens[j] < d) j++; const seg = (lens[j] - lens[j - 1]) || 1, u = Math.max(0, Math.min(1, (d - lens[j - 1]) / seg)); return [D.lerp(pts[j - 1][0], pts[j][0], u), D.lerp(pts[j - 1][1], pts[j][1], u)]; };
        const reach = total * k;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const line = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let j = 1; j < pts.length && lens[j] <= reach; j++) ctx.lineTo(pts[j][0], pts[j][1]); const e = at(reach); ctx.lineTo(e[0], e[1]); ctx.stroke(); };
        ctx.shadowColor = c; ctx.shadowBlur = G.R * 0.9; ctx.strokeStyle = c; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(4, G.R * 0.34); line();
        ctx.shadowColor = '#fff'; ctx.shadowBlur = G.R * 0.5; ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(1.5, G.R * 0.09); line();
        if (pts.length === 1 || reach <= 0) { ctx.restore(); return; }
        if (!api.reduceMotion && k >= 1) {
          const p = at(((age - 0.75) * total / 0.9) % total);
          const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], G.R * 0.7);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], G.R * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      function render() {
        const col = api.colors(), G = geo(), { w, h, R, W } = G;
        ctx.clearRect(0, 0, w, h);
        // header
        const yourTurn = turn === YOU && !winner, cpuTurn = turn === CPU && !winner;
        let msg;
        if (friend) msg = winner ? nameOf(winner) + ' crossed' : canSteal() ? (on ? 'Steal it or play' : nameOf(turn) + ': steal it or play') : (on && turn === mySide ? (moves === 0 ? 'Your opening' : 'Your move') : nameOf(turn) + (moves === 0 ? '\u2019s opening' : '\u2019s move'));
        else if (winner) msg = winner === YOU ? 'You crossed' : 'Bot crossed';
        else if (cpuTurn) msg = 'Bot is thinking';
        else if (moves === 0) msg = 'Your opening';
        else if (canSteal()) msg = 'Steal it or play';
        else msg = 'Your move';
        D.duelHeader(ctx, 8, 8, w - 16, {
          left: friend ? { who: 'you', label: nameOf(YOU) + ' \u00b7 ' + wins[YOU], score: 'Left to right' } : { who: 'you', score: 'Left to right' },
          right: friend ? { who: 'p2', label: wins[CPU] + ' \u00b7 ' + nameOf(CPU), score: 'Top to bottom' } : { who: 'bot', score: 'Top to bottom' },
          turn: winner ? null : (yourTurn ? 'left' : 'right'), status: msg, thinking: cpuTurn && !friend
        }, col);

        // edges
        const off = R * 1.15;
        const edge = (c, pts) => { ctx.strokeStyle = c; ctx.lineWidth = Math.max(4, R * 0.3); ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
        const BOTC = botColor(col);
        edge(BOTC, [[G.cx(0, 0) - W / 2, G.cy(0) - off * 0.7], [G.cx(0, N - 1) + W / 2, G.cy(0) - off * 0.7]]);
        edge(BOTC, [[G.cx(N - 1, 0) - W / 2, G.cy(N - 1) + off * 0.7], [G.cx(N - 1, N - 1) + W / 2, G.cy(N - 1) + off * 0.7]]);
        edge(col.accent, [[G.cx(0, 0) - off, G.cy(0)], [G.cx(N - 1, 0) - off, G.cy(N - 1)]]);
        edge(col.accent, [[G.cx(0, N - 1) + off, G.cy(0)], [G.cx(N - 1, N - 1) + off, G.cy(N - 1)]]);

        for (let i = 0; i < NN; i++) {
          const r = Math.floor(i / N), c = i % N, x = G.cx(r, c), y = G.cy(r), v = board[i];
          hexPath(x, y, R - 1);
          ctx.fillStyle = col.dark ? '#3d3730' : '#efe6d8'; ctx.fill();
          ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(32,28,23,0.08)'; ctx.lineWidth = 1; ctx.stroke();
          if (!v && (useKeys ? i === kc : i === hover) && (turn === YOU || friend) && mayAct() && !winner && !job) {
            hexPath(x, y, R * 0.62); ctx.fillStyle = turn === YOU ? col.accent : BOTC; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
          }
          if (v) drawStone(i, x, y, v, R, col, BOTC);
        }
        [YOU, CPU].forEach(sd => { if (lastBy[sd] >= 0 && board[lastBy[sd]] === sd && !winner) pulseRing(G, lastBy[sd], sd === YOU ? col.accent : BOTC); });
        if (winner && pathArr) drawWinPath(G, winner === YOU ? col.accent : BOTC, col, BOTC);
        if (useKeys && (turn === YOU || friend) && mayAct() && !winner) {
          const r = Math.floor(kc / N), c = kc % N; hexPath(G.cx(r, c), G.cy(r), R - 1);
          ctx.strokeStyle = turn === YOU ? col.accent : BOTC; ctx.lineWidth = 2; ctx.stroke();
        }
        if (canSteal()) {
          const b = stealBtn(), p = api.reduceMotion ? 1 : 1 + Math.sin(clock * 5) * 0.02;
          ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(p, p);
          ctx.fillStyle = col.ink; D.roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 17); ctx.fill();
          D.text(ctx, 'Steal it  (S)', 0, 1, 13, col.bg, 700);
          ctx.restore();
        }
        parts.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); });
        ctx.globalAlpha = 1;
        if (banner) {
          const k = Math.min(1, (clock - banner.t) / 0.35), e = api.reduceMotion ? 1 : D.ease.outBack(k);
          if (!banner.small) { ctx.fillStyle = col.dark ? 'rgba(20,18,15,0.5)' : 'rgba(244,239,230,0.55)'; ctx.globalAlpha = k; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
          ctx.save(); ctx.translate(w / 2, banner.small ? h - 40 : h * 0.45); ctx.scale(e, e);
          const bw = banner.small ? 220 : 240, bh = banner.small ? 48 : 84;
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16;
          D.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.fill(); ctx.shadowBlur = 0;
          D.text(ctx, banner.title, 0, banner.small ? -8 : -10, banner.small ? 14 : 20, col.ink, 750);
          D.text(ctx, banner.sub, 0, banner.small ? 10 : 18, 11.5, col.ink2, 560);
          ctx.restore();
        }
      }

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || sv.dead) return false;
        matches = Math.max(0, sv.matches | 0); starter = sv.starter === CPU ? CPU : YOU; api.score(matches);
        if (friend && Array.isArray(sv.w)) { wins[YOU] = Math.min(TARGET - 1, Math.max(0, sv.w[0] | 0)); wins[CPU] = Math.min(TARGET - 1, Math.max(0, sv.w[1] | 0)); }
        if (sv.fresh) { newGame(); return true; }
        if (!Array.isArray(sv.board) || sv.board.length !== NN || !sv.board.every(v => v === 0 || v === YOU || v === CPU)) return false;
        const b = Int8Array.from(sv.board);
        if (winPath(b, YOU) || winPath(b, CPU)) return false;
        newGame(true);
        board = b; turn = sv.turn === CPU ? CPU : YOU; moves = Math.max(0, sv.moves | 0); swapped = !!sv.swapped;
        last = Number.isInteger(sv.last) && sv.last >= 0 && sv.last < NN ? sv.last : -1;
        kc = Number.isInteger(sv.kc) && sv.kc >= 0 && sv.kc < NN ? sv.kc : 24;
        [YOU, CPU].forEach(sd => { const v = sd === YOU ? sv.ly : sv.lc; lastBy[sd] = Number.isInteger(v) && v >= 0 && v < NN && board[v] === sd ? v : -1; });
        if (last >= 0 && board[last] && lastBy[board[last]] < 0) lastBy[board[last]] = last;
        if (turn === CPU && !friend) think();
        return true;
      }

      if (!restore(api.saved)) newGame();
      // The other player's moves. Waits while the last game's result is still on screen; ignores anything illegal.
      if (on) on.queue((type, d, from) => {
        if (type !== 'stone' && type !== 'swap') return true;
        if (winner) return false;
        const who = from === 0 ? YOU : CPU;
        if (turn !== who) return true;
        if (type === 'swap') { if (moves === 1 && !swapped && board.some(v => v && v !== who)) doSwap(who); return true; }
        if (!d || !Number.isInteger(d.i) || d.i < 0 || d.i >= NN || board[d.i]) return true;
        place(d.i, who);
        return true;
      });
      api.loop(dt => {
        clock += dt;
        stepJob();
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy += 400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) parts.splice(i, 1); }
        render();
      });
      return {
        save() {
          if (api.ended) return null;
          const w = [wins[YOU], wins[CPU]];
          if (friend && winner) return wins[winner] >= TARGET ? { v: 1, dead: true } : { v: 1, fresh: true, matches, starter: starter === YOU ? CPU : YOU, w };
          if (winner === CPU) return { v: 1, dead: true };
          if (winner === YOU) return { v: 1, fresh: true, matches, starter: starter === YOU ? CPU : YOU };
          if (!moves && !matches && !w[0] && !w[1]) return null;
          return { v: 1, board: Array.from(board), turn, moves, swapped, last, matches, starter, kc, ly: lastBy[YOU], lc: lastBy[CPU], w };
        }
      };
    }
  });
})();
