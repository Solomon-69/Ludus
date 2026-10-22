/* Wall Run: Quoridor on a 7 x 7 board against the computer. Six walls each.
   Each turn move one square or place a wall. Walls may never cut anyone off from their goal.
   Pawns that meet face to face can jump, or step diagonally if a wall is behind.
   Score = games won in a row. The run ends when the computer gets across. */
(function () {
  const S = 7, G = S - 1, WALLS = 6, GREEN = '#4f9d69';
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const GOAL = { a: 0, b: S - 1 }; // a = you (start bottom, go up), b = computer
  const on = (r, c) => r >= 0 && r < S && c >= 0 && c < S;
  const W = (arr, r, c) => (r >= 0 && r < G && c >= 0 && c < G ? arr[r * G + c] : 0);

  // ---------- rules (pure) ----------
  function blank() {
    return { p: { a: [S - 1, 3], b: [0, 3] }, h: new Uint8Array(G * G), v: new Uint8Array(G * G), left: { a: WALLS, b: WALLS } };
  }
  function clone(st) { return { p: { a: st.p.a.slice(), b: st.p.b.slice() }, h: st.h.slice(), v: st.v.slice(), left: { a: st.left.a, b: st.left.b } }; }
  function blocked(st, r, c, dr, dc) {
    if (dr === 1) return W(st.h, r, c) || W(st.h, r, c - 1);
    if (dr === -1) return W(st.h, r - 1, c) || W(st.h, r - 1, c - 1);
    if (dc === 1) return W(st.v, r, c) || W(st.v, r - 1, c);
    return W(st.v, r, c - 1) || W(st.v, r - 1, c - 1);
  }
  function legalMoves(st, who) {
    const [r, c] = st.p[who], q = st.p[who === 'a' ? 'b' : 'a'], out = [];
    for (const [dr, dc] of DIRS) {
      if (!on(r + dr, c + dc) || blocked(st, r, c, dr, dc)) continue;
      const nr = r + dr, nc = c + dc;
      if (nr !== q[0] || nc !== q[1]) { out.push([nr, nc]); continue; }
      if (on(nr + dr, nc + dc) && !blocked(st, nr, nc, dr, dc)) { out.push([nr + dr, nc + dc]); continue; }
      for (const [er, ec] of DIRS) {
        if ((er === dr && ec === dc) || (er === -dr && ec === -dc)) continue;
        if (on(nr + er, nc + ec) && !blocked(st, nr, nc, er, ec)) out.push([nr + er, nc + ec]);
      }
    }
    return out;
  }
  const qbuf = new Int16Array(S * S), dbuf = new Int16Array(S * S);
  // Shortest path length to the goal row, ignoring pawns. Infinity if cut off.
  function dist(st, who) {
    const goal = GOAL[who], [sr, sc] = st.p[who];
    dbuf.fill(-1); let qh = 0, qt = 0;
    qbuf[qt++] = sr * S + sc; dbuf[sr * S + sc] = 0;
    while (qh < qt) {
      const k = qbuf[qh++], r = (k / S) | 0, c = k % S;
      if (r === goal) return dbuf[k];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!on(nr, nc) || blocked(st, r, c, dr, dc)) continue;
        const j = nr * S + nc; if (dbuf[j] < 0) { dbuf[j] = dbuf[k] + 1; qbuf[qt++] = j; }
      }
    }
    return Infinity;
  }
  function wallFits(st, o, r, c) {
    if (r < 0 || r >= G || c < 0 || c >= G) return false;
    if (W(st.h, r, c) || W(st.v, r, c)) return false;
    if (o === 'h' && (W(st.h, r, c - 1) || W(st.h, r, c + 1))) return false;
    if (o === 'v' && (W(st.v, r - 1, c) || W(st.v, r + 1, c))) return false;
    return true;
  }
  function wallOk(st, o, r, c) {
    if (!wallFits(st, o, r, c)) return false;
    const arr = o === 'h' ? st.h : st.v; arr[r * G + c] = 1;
    const ok = dist(st, 'a') < Infinity && dist(st, 'b') < Infinity;
    arr[r * G + c] = 0;
    return ok;
  }
  function apply(st, who, act) {
    const n = clone(st);
    if (act.type === 'move') n.p[who] = act.to.slice();
    else { (act.o === 'h' ? n.h : n.v)[act.r * G + act.c] = 1; n.left[who]--; }
    return n;
  }
  // Walls ranked by how much they hurt `victim` relative to `owner`.
  function rankWalls(st, owner, limit) {
    if (st.left[owner] <= 0) return [];
    const victim = owner === 'a' ? 'b' : 'a', dv = dist(st, victim), dow = dist(st, owner), out = [];
    for (const o of ['h', 'v']) for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      if (!wallFits(st, o, r, c)) continue;
      const arr = o === 'h' ? st.h : st.v; arr[r * G + c] = 1;
      const nv = dist(st, victim), no = dist(st, owner);
      arr[r * G + c] = 0;
      if (nv === Infinity || no === Infinity) continue;
      out.push({ type: 'wall', o, r, c, gain: (nv - dv) - (no - dow) });
    }
    out.sort((x, y) => y.gain - x.gain);
    return limit ? out.slice(0, limit) : out;
  }
  function bestMove(st, who, rnd) {
    let best = [], bd = Infinity;
    for (const to of legalMoves(st, who)) {
      const d = to[0] === GOAL[who] ? -1 : dist(apply(st, who, { type: 'move', to }), who);
      if (d < bd) { bd = d; best = [to]; } else if (d === bd) best.push(to);
    }
    return { type: 'move', to: best[Math.floor(rnd() * best.length)] };
  }
  const evalFor = st => dist(st, 'a') - dist(st, 'b') + 0.35 * (st.left.b - st.left.a);
  // The computer always plays 'b'.
  function chooseAction(st, level, rnd) {
    rnd = rnd || Math.random;
    const moves = legalMoves(st, 'b');
    const win = moves.find(m => m[0] === GOAL.b);
    if (win) return { type: 'move', to: win };
    if (level === 0) {
      if (st.left.b > 0 && rnd() < 0.2) { const ws = rankWalls(st, 'b'); if (ws.length) return ws[Math.floor(rnd() * Math.min(ws.length, 20))]; }
      if (rnd() < 0.12) return { type: 'move', to: moves[Math.floor(rnd() * moves.length)] };
      return bestMove(st, 'b', rnd);
    }
    if (level === 1) {
      const dp = dist(st, 'a'), dc = dist(st, 'b');
      if (st.left.b > 0 && (dp <= dc + 1 || dp <= 2)) {
        const ws = rankWalls(st, 'b', 1);
        if (ws.length && ws[0].gain > 0) return ws[0];
      }
      return bestMove(st, 'b', rnd);
    }
    // Hard: two-ply search on (your path - its path).
    const acts = moves.map(to => ({ type: 'move', to })).concat(rankWalls(st, 'b', 14).filter(w => w.gain >= 0));
    let best = null, bv = -Infinity;
    for (const a of acts) {
      const s1 = apply(st, 'b', a);
      let worst = Infinity;
      const replies = legalMoves(s1, 'a').map(to => ({ type: 'move', to })).concat(rankWalls(s1, 'a', 10));
      for (const rp of replies) {
        if (rp.type === 'move' && rp.to[0] === GOAL.a) { worst = -1000; break; }
        const v = evalFor(apply(s1, 'a', rp));
        if (v < worst) worst = v;
      }
      const v = worst + (a.type === 'move' ? 0.05 : 0) + rnd() * 0.01;
      if (v > bv) { bv = v; best = a; }
    }
    return best || bestMove(st, 'b', rnd);
  }

  Ludus.register({
    id: 'wallrun', name: 'Wall Run', tag: 'Duel', tint: GREEN,
    hint: 'Reach the top row first. Click a dot or use <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> to step. Click a groove to place a wall (6 each), <kbd>R</kbd> or right-click turns it',
    _rules: { blank, clone, legalMoves, dist, wallOk, apply, rankWalls, chooseAction, S, G },
    art(ctx, w, h) {
      const n = 5, cell = h * 0.13, gap = cell * 0.3, size = n * cell + (n - 1) * gap, ox = (w - size) / 2, oy = (h - size) / 2;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; Ludus.draw.roundRect(ctx, ox + c * (cell + gap), oy + r * (cell + gap), cell, cell, 2.5); ctx.fill();
      }
      ctx.fillStyle = '#d97757';
      Ludus.draw.roundRect(ctx, ox + cell * 1, oy + 2 * (cell + gap) + cell + gap * 0.15, 2 * cell + gap, gap * 0.7, 2); ctx.fill();
      Ludus.draw.roundRect(ctx, ox + 3 * (cell + gap) + cell + gap * 0.15, oy, gap * 0.7, 2 * cell + gap, 2); ctx.fill();
      Ludus.draw.spark(ctx, ox + 2 * (cell + gap) + cell / 2, oy + 4 * (cell + gap) + cell / 2, cell * 0.45, '#fff', 0);
      ctx.fillStyle = '#1f4d2f'; ctx.beginPath(); ctx.arc(ox + 2 * (cell + gap) + cell / 2, oy + cell / 2, cell * 0.38, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      let clock = 0, matches = 0, starter = 'a';
      let st, turn, winner, thinking, last, anim, wallT, hover = null, flip = false, flipKey = '', banner = null, parts = [];
      api.score(0);

      function newGame(quiet) {
        st = blank(); turn = starter; winner = ''; thinking = false; last = null; hover = null;
        anim = { a: { from: st.p.a.slice(), t: -9 }, b: { from: st.p.b.slice(), t: -9 } };
        wallT = {};
        if (turn === 'b' && !quiet) cpuTurn();
      }
      function act(who, a) {
        if (a.type === 'move') { anim[who] = { from: st.p[who].slice(), t: clock }; api.sfx(who === 'a' ? 'move' : 'click'); }
        else { wallT[a.o + a.r + ':' + a.c] = clock; api.sfx('drop'); }
        st = apply(st, who, a); last = Object.assign({ who }, a);
        if (a.type === 'move' && st.p[who][0] === GOAL[who]) { winner = who; return finish(); }
        turn = who === 'a' ? 'b' : 'a';
        if (turn === 'b') cpuTurn();
      }
      function cpuTurn() {
        thinking = true;
        api.timeout(() => {
          if (winner) return;
          const a = chooseAction(st, api.level, Math.random);
          thinking = false; act('b', a);
        }, api.rand(450, 700));
      }
      function finish() {
        if (winner === 'a') {
          matches++; api.score(matches); api.sfx('win'); burst();
          api.timeout(() => { banner = { title: 'You made it across', sub: matches + (matches === 1 ? ' game' : ' games') + ' in a row', t: clock }; }, 450);
          api.timeout(() => { banner = null; starter = starter === 'a' ? 'b' : 'a'; newGame(); }, 2200);
        } else {
          api.sfx('lose');
          api.timeout(() => api.over({ score: matches, won: false, title: 'Bot wins', message: matches ? matches + (matches === 1 ? ' game' : ' games') + ' won in a row' : 'No games won this time' }), 1400);
        }
      }
      function burst() {
        if (api.reduceMotion) return;
        const L = geo(), [r, c] = st.p.a, x = L.ox + c * L.p + L.cell / 2, y = L.oy + r * L.p + L.cell / 2;
        for (let i = 0; i < 28; i++) parts.push({ x, y, vx: api.rand(-180, 180), vy: api.rand(-240, 0), life: api.rand(0.5, 0.9), s: api.rand(2, 4) });
      }

      // ---------- layout + hit testing ----------
      function geo() {
        const w = view.w, h = view.h, top = 58, bottom = 14;
        const size = Math.max(60, Math.min(w - 24, h - top - bottom));
        const cell = size / (S + G * 0.28), gap = cell * 0.28, p = cell + gap;
        return { w, h, size, cell, gap, p, ox: (w - size) / 2, oy: top + (h - top - bottom - size) / 2 };
      }
      function target(e) {
        const rect = view.canvas.getBoundingClientRect(), L = geo();
        const x = e.clientX - rect.left - L.ox, y = e.clientY - rect.top - L.oy;
        if (x < -L.gap || y < -L.gap || x > L.size + L.gap || y > L.size + L.gap) return null;
        const near = v => { const k = Math.max(0, Math.min(G - 1, Math.round((v - L.cell - L.gap / 2) / L.p))); return { k, d: Math.abs(v - (k * L.p + L.cell + L.gap / 2)) }; };
        const nx = near(x), ny = near(y), tol = L.gap / 2 + L.cell * 0.13;
        const half = (v, k) => Math.max(0, Math.min(G - 1, (v - k * L.p) < L.cell / 2 ? k - 1 : k));
        const cx = Math.max(0, Math.min(S - 1, Math.floor(x / L.p))), cy = Math.max(0, Math.min(S - 1, Math.floor(y / L.p)));
        let wall = null;
        if (nx.d < tol && ny.d < tol) wall = { r: ny.k, c: nx.k, nat: 'h' };
        else if (nx.d < tol) wall = { r: half(y, cy), c: nx.k, nat: 'v' };
        else if (ny.d < tol) wall = { r: ny.k, c: half(x, cx), nat: 'h' };
        if (wall) {
          const key = wall.r + ':' + wall.c + wall.nat;
          if (key !== flipKey) { flipKey = key; flip = false; }
          return { kind: 'wall', r: wall.r, c: wall.c, o: flip ? (wall.nat === 'h' ? 'v' : 'h') : wall.nat };
        }
        return { kind: 'cell', r: cy, c: cx };
      }
      const myTurn = () => turn === 'a' && !winner && !thinking;
      function click(t) {
        if (!t || !myTurn()) return;
        if (t.kind === 'cell') {
          const m = legalMoves(st, 'a').find(([r, c]) => r === t.r && c === t.c);
          if (m) act('a', { type: 'move', to: m });
        } else if (st.left.a > 0 && wallOk(st, t.o, t.r, t.c)) act('a', { type: 'wall', o: t.o, r: t.r, c: t.c });
        else api.sfx('hit');
      }
      function rotate() { flip = !flip; if (hover && hover.kind === 'wall') hover.o = hover.o === 'h' ? 'v' : 'h'; api.sfx('tick'); }
      api.on(view.canvas, 'pointerdown', e => { if (e.button === 2) return; hover = target(e); click(hover); });
      api.on(view.canvas, 'pointermove', e => { hover = target(e); view.canvas.style.cursor = hover && myTurn() ? 'pointer' : 'default'; });
      api.on(view.canvas, 'pointerleave', () => { hover = null; });
      api.on(view.canvas, 'contextmenu', e => { e.preventDefault(); rotate(); });
      api.keys(e => {
        if (e.key === 'r' || e.key === 'R') { rotate(); return; }
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] }[e.key];
        if (!d || !myTurn()) return;
        const [r, c] = st.p.a, ms = legalMoves(st, 'a');
        const m = ms.find(([mr, mc]) => Math.sign(mr - r) === d[0] && Math.sign(mc - c) === d[1]);
        if (m) act('a', { type: 'move', to: m });
      });

      // ---------- render ----------
      function pawnPos(who, L) {
        const a = anim[who], to = st.p[who], k = api.reduceMotion ? 1 : Math.min(1, (clock - a.t) / 0.22), e = D.ease.outCubic(k);
        const r = D.lerp(a.from[0], to[0], e), c = D.lerp(a.from[1], to[1], e), hop = Math.sin(k * Math.PI) * L.cell * 0.18;
        return [L.ox + c * L.p + L.cell / 2, L.oy + r * L.p + L.cell / 2 - hop, k];
      }
      function wallRect(L, o, r, c) {
        const t = L.gap * 0.72, len = 2 * L.cell + L.gap;
        return o === 'h' ? [L.ox + c * L.p, L.oy + r * L.p + L.cell + (L.gap - t) / 2, len, t] : [L.ox + c * L.p + L.cell + (L.gap - t) / 2, L.oy + r * L.p, t, len];
      }
      function stock(x, y, n, c, line, right) {
        for (let i = 0; i < WALLS; i++) {
          ctx.fillStyle = i < n ? c : line;
          D.roundRect(ctx, right ? x - (i + 1) * 7 : x + i * 7, y, 4, 11, 2); ctx.fill();
        }
      }
      function render() {
        const col = api.colors(), L = geo(), { w, h } = L;
        ctx.clearRect(0, 0, w, h);
        // header
        const walls = n => n + (n === 1 ? ' wall' : ' walls');
        D.duelHeader(ctx, 8, 8, w - 16, {
          left: { who: 'you', score: walls(st.left.a) }, right: { who: 'bot', score: walls(st.left.b) },
          turn: winner ? null : (turn === 'a' ? 'left' : 'right'),
          status: winner ? (winner === 'a' ? 'You made it' : 'Bot made it') : turn === 'a' ? 'Your move' : 'Bot is thinking',
          thinking: !winner && turn === 'b'
        }, col);
        const BOTC = col.dark ? '#aab2bf' : '#6b7380';

        // board
        ctx.fillStyle = col.dark ? '#2b2721' : '#e7decf';
        D.roundRect(ctx, L.ox - L.gap, L.oy - L.gap, L.size + L.gap * 2, L.size + L.gap * 2, 12); ctx.fill();
        const moves = myTurn() ? legalMoves(st, 'a') : [];
        for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
          const x = L.ox + c * L.p, y = L.oy + r * L.p;
          ctx.fillStyle = col.dark ? '#3a342d' : '#fbf6ee';
          D.roundRect(ctx, x, y, L.cell, L.cell, L.cell * 0.18); ctx.fill();
          if (r === GOAL.a || r === GOAL.b) { ctx.fillStyle = r === GOAL.a ? col.accent : BOTC; ctx.globalAlpha = 0.13; ctx.fill(); ctx.globalAlpha = 1; }
        }
        if (last && last.type === 'move') {
          const [r, c] = last.to; ctx.strokeStyle = last.who === 'a' ? col.accent : BOTC; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
          D.roundRect(ctx, L.ox + c * L.p + 1, L.oy + r * L.p + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.stroke(); ctx.globalAlpha = 1;
        }
        moves.forEach(([r, c]) => {
          const hov = hover && hover.kind === 'cell' && hover.r === r && hover.c === c;
          ctx.fillStyle = col.accent; ctx.globalAlpha = hov ? 0.85 : 0.4;
          ctx.beginPath(); ctx.arc(L.ox + c * L.p + L.cell / 2, L.oy + r * L.p + L.cell / 2, L.cell * (hov ? 0.18 : 0.12), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        });
        // walls
        for (const o of ['h', 'v']) for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
          if (!(o === 'h' ? st.h : st.v)[r * G + c]) continue;
          const [x, y, ww, hh] = wallRect(L, o, r, c), t = clock - (wallT[o + r + ':' + c] ?? -9);
          const s = t < 0.28 && !api.reduceMotion ? D.ease.outBack(Math.max(0, t / 0.28)) : 1;
          const isLast = last && last.type === 'wall' && last.o === o && last.r === r && last.c === c;
          ctx.save(); ctx.translate(x + ww / 2, y + hh / 2); ctx.scale(s, s);
          ctx.fillStyle = isLast ? (last.who === 'a' ? col.accent : BOTC) : (col.dark ? '#c9b89e' : '#6b5a45');
          D.roundRect(ctx, -ww / 2, -hh / 2, ww, hh, Math.min(ww, hh) / 2); ctx.fill();
          ctx.restore();
        }
        if (hover && hover.kind === 'wall' && myTurn() && st.left.a > 0) {
          const ok = wallOk(st, hover.o, hover.r, hover.c), [x, y, ww, hh] = wallRect(L, hover.o, hover.r, hover.c);
          ctx.fillStyle = ok ? col.accent : col.bad; ctx.globalAlpha = ok ? 0.55 : 0.4;
          D.roundRect(ctx, x, y, ww, hh, Math.min(ww, hh) / 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        // pawns
        const [bx, by] = pawnPos('b', L), [ax, ay] = pawnPos('a', L), pr = L.cell * 0.36;
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(bx, by + pr * 0.9, pr * 0.8, pr * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        D.avatar(ctx, bx, by, pr, 'bot', col);
        ctx.strokeStyle = BOTC; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, pr, 0, Math.PI * 2); ctx.stroke();
        if (thinking && !api.reduceMotion) { ctx.strokeStyle = BOTC; ctx.lineWidth = 2; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(bx, by, pr * (1.25 + 0.15 * Math.sin(clock * 6)), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(ax, ay + pr * 0.9, pr * 0.8, pr * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col.dark ? '#f4ece0' : '#fffaf3'; ctx.beginPath(); ctx.arc(ax, ay, pr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col.accent; ctx.lineWidth = 2; ctx.stroke();
        D.spark(ctx, ax, ay, pr * 0.62, col.accent, 0);
        if (winner) {
          const wx = winner === 'a' ? ax : bx, wy = winner === 'a' ? ay : by;
          ctx.strokeStyle = winner === 'a' ? col.accent : BOTC; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(clock * 6);
          ctx.beginPath(); ctx.arc(wx, wy, pr * 1.35, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }

        parts.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = col.accent; ctx.fillRect(p.x, p.y, p.s, p.s); });
        ctx.globalAlpha = 1;
        if (banner) {
          const k = Math.min(1, (clock - banner.t) / 0.35), e = api.reduceMotion ? 1 : D.ease.outBack(k);
          ctx.save(); ctx.translate(w / 2, h * 0.45); ctx.scale(e, e);
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16;
          D.roundRect(ctx, -Math.min(125, w / 2 - 12), -42, Math.min(250, w - 24), 84, 18); ctx.fill(); ctx.shadowBlur = 0;
          D.text(ctx, banner.title, 0, -10, 19, col.ink, 750);
          D.text(ctx, banner.sub, 0, 18, 12, col.ink2, 560);
          ctx.restore();
        }
      }

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || sv.dead) return false;
        matches = Math.max(0, sv.matches | 0); starter = sv.starter === 'b' ? 'b' : 'a'; api.score(matches);
        if (sv.fresh) { newGame(); return true; }
        const pos = q => Array.isArray(q) && q.length === 2 && q.every(v => Number.isInteger(v) && v >= 0 && v < S);
        const bits = a => Array.isArray(a) && a.length === G * G && a.every(v => v === 0 || v === 1);
        if (!sv.p || !pos(sv.p.a) || !pos(sv.p.b) || !bits(sv.hw) || !bits(sv.vw) || !sv.left) return false;
        const n = blank();
        n.p = { a: sv.p.a.slice(), b: sv.p.b.slice() }; n.h = Uint8Array.from(sv.hw); n.v = Uint8Array.from(sv.vw);
        n.left = { a: Math.max(0, Math.min(WALLS, sv.left.a | 0)), b: Math.max(0, Math.min(WALLS, sv.left.b | 0)) };
        if (dist(n, 'a') === Infinity || dist(n, 'b') === Infinity || n.p.a[0] === GOAL.a || n.p.b[0] === GOAL.b) return false;
        newGame(true);
        st = n; turn = sv.turn === 'b' ? 'b' : 'a';
        anim = { a: { from: st.p.a.slice(), t: -9 }, b: { from: st.p.b.slice(), t: -9 } };
        last = sv.last && (sv.last.type === 'move' || sv.last.type === 'wall') ? sv.last : null;
        if (turn === 'b') cpuTurn();
        return true;
      }

      if (!restore(api.saved)) newGame();
      api.loop(dt => {
        clock += dt;
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) parts.splice(i, 1); }
        render();
      });
      return {
        save() {
          if (api.ended) return null;
          if (winner === 'b') return { v: 1, dead: true };
          if (winner === 'a') return { v: 1, fresh: true, matches, starter: starter === 'a' ? 'b' : 'a' };
          if (!last && !matches) return null;
          return { v: 1, p: { a: st.p.a.slice(), b: st.p.b.slice() }, hw: Array.from(st.h), vw: Array.from(st.v), left: { a: st.left.a, b: st.left.b }, turn, matches, starter, last };
        }
      };
    }
  });
})();
