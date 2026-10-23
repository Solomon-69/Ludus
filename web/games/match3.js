/* Spark Match: swap two neighbouring gems to line up three or more. Cascades multiply the points.
   Limited moves; the board reshuffles itself when no swap can make a match. */
(function () {
  const D = Ludus.draw;
  const N = 8;
  const TYPES = [5, 6, 6], MOVES = [30, 25, 20];
  const HUES = ['#d97757', '#5b8def', '#e0a526', '#4f9d69', '#9b6dd6', '#e05d8b', '#3aa6a6'];

  // ---------- pure rules ----------
  function findMatches(g) {
    const hit = new Set(); let best = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      let e = c; while (e + 1 < N && g[r][e + 1] === g[r][c] && g[r][c] >= 0) e++;
      if (e - c >= 2) { for (let k = c; k <= e; k++) hit.add(r * N + k); best = Math.max(best, e - c + 1); }
      c = e + 1;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      let e = r; while (e + 1 < N && g[e + 1][c] === g[r][c] && g[r][c] >= 0) e++;
      if (e - r >= 2) { for (let k = r; k <= e; k++) hit.add(k * N + c); best = Math.max(best, e - r + 1); }
      r = e + 1;
    }
    return { cells: [...hit], longest: best };
  }
  function swapped(g, a, b) {
    const n = g.map(r => r.slice());
    const t = n[a[0]][a[1]]; n[a[0]][a[1]] = n[b[0]][b[1]]; n[b[0]][b[1]] = t;
    return n;
  }
  function findMove(g) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c + 1 < N && findMatches(swapped(g, [r, c], [r, c + 1])).cells.length) return [[r, c], [r, c + 1]];
      if (r + 1 < N && findMatches(swapped(g, [r, c], [r + 1, c])).cells.length) return [[r, c], [r + 1, c]];
    }
    return null;
  }
  function freshGrid(types, rnd) {
    rnd = rnd || Math.random;
    for (let tries = 0; tries < 200; tries++) {
      const g = [];
      for (let r = 0; r < N; r++) {
        g.push([]);
        for (let c = 0; c < N; c++) {
          let t;
          do { t = Math.floor(rnd() * types); }
          while ((c >= 2 && g[r][c - 1] === t && g[r][c - 2] === t) || (r >= 2 && g[r - 1][c] === t && g[r - 2][c] === t));
          g[r].push(t);
        }
      }
      if (findMove(g)) return g;
    }
    return null;
  }

  function gem(ctx, t, x, y, r, dark) {
    const col = HUES[t];
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,60,30,0.16)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.92, r * 0.72, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    if (t === 0) { D.spark(ctx, 0, 0, r * 0.98, col, 0); ctx.restore(); return; }
    if (t === 1) ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    else if (t === 2) { ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.85, 0); ctx.closePath(); }
    else if (t === 3) D.roundRect(ctx, -r * 0.76, -r * 0.76, r * 1.52, r * 1.52, r * 0.34);
    else if (t === 4) { ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.9, r * 0.72); ctx.lineTo(-r * 0.9, r * 0.72); ctx.closePath(); }
    else if (t === 5) { ctx.moveTo(0, r * 0.85); ctx.bezierCurveTo(r * 1.2, 0, r * 0.55, -r * 0.95, 0, -r * 0.4); ctx.bezierCurveTo(-r * 0.55, -r * 0.95, -r * 1.2, 0, 0, r * 0.85); }
    else { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); } ctx.closePath(); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  Ludus.register({
    id: 'sparkmatch', name: 'Sweet Match', aka: 'match three', tag: 'Puzzle', tint: '#e07a3f',
    hint: 'Drag or click to swap · <kbd>←↑→↓</kbd> move · <kbd>Space</kbd> + arrow swaps',
    _rules: { findMatches, findMove, freshGrid, swapped },
    art(ctx, w, h) {
      const s = Math.min(w / 6.5, h / 3.2), ox = (w - s * 5) / 2 + s / 2, oy = (h - s * 2) / 2 + s / 2;
      const map = [[1, 0, 2, 3, 0], [4, 2, 0, 5, 1]];
      map.forEach((row, r) => row.forEach((t, c) => {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; D.roundRect(ctx, ox + c * s - s * 0.45, oy + r * s - s * 0.45, s * 0.9, s * 0.9, s * 0.2); ctx.fill();
        gem(ctx, t, ox + c * s, oy + r * s, s * 0.33, false);
      }));
    },
    create(stage, api) {
      const lv = api.level, types = TYPES[lv];
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let cells, moves, score, phase, phaseT, chain, sel, cursor, showCursor, swapPair, idleT, hintMove, endT, bursts, idSeq = 0;
      const lay = { ox: 0, oy: 0, cell: 40 };

      const mk = t => ({ t, id: idSeq++, y: 0, vy: 0, pop: 0, dying: false });
      function load(g) { cells = g.map((row, r) => row.map(t => { const o = mk(t); o.y = r; return o; })); }
      function types2d() { return cells.map(row => row.map(o => (o ? o.t : -1))); }
      function restore(s) {
        if (!s || !Array.isArray(s.grid) || s.grid.length !== N) return false;
        if (!s.grid.every(row => Array.isArray(row) && row.length === N && row.every(t => Number.isInteger(t) && t >= 0 && t < types))) return false;
        if (findMatches(s.grid).cells.length) return false;
        load(s.grid); moves = Math.max(1, s.moves | 0); score = s.score | 0;
        cursor = Array.isArray(s.cursor) ? [Math.min(N - 1, s.cursor[0] | 0), Math.min(N - 1, s.cursor[1] | 0)] : [3, 3];
        return true;
      }
      if (!restore(api.saved)) { load(freshGrid(types)); moves = MOVES[lv]; score = 0; cursor = [3, 3]; }
      phase = 'idle'; phaseT = 0; chain = 0; sel = null; showCursor = false; swapPair = null; idleT = 0; hintMove = null; endT = 0; bursts = [];
      api.score(score);
      if (!findMove(types2d())) reshuffle();

      const adj = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
      function trySwap(a, b) {
        if (phase !== 'idle' || !adj(a, b)) return;
        sel = null; idleT = 0; hintMove = null;
        swapPair = { a, b, ok: findMatches(swapped(types2d(), a, b)).cells.length > 0 };
        phase = 'swap'; phaseT = 0; api.sfx('move');
      }
      function commitSwap() {
        const { a, b } = swapPair;
        const t = cells[a[0]][a[1]]; cells[a[0]][a[1]] = cells[b[0]][b[1]]; cells[b[0]][b[1]] = t;
        cells[a[0]][a[1]].y = a[0]; cells[b[0]][b[1]].y = b[0];
      }
      function resolve() {
        const m = findMatches(types2d());
        if (!m.cells.length) { settle(); return; }
        chain++;
        const gained = m.cells.length * 10 * chain;
        score += gained; api.score(score);
        if (m.longest >= 5) { moves++; api.toast('Five in a row: +1 move'); }
        m.cells.forEach(k => { const o = cells[Math.floor(k / N)][k % N]; o.dying = true; o.pop = 0; bursts.push({ r: Math.floor(k / N), c: k % N, t: o.t, age: 0 }); });
        api.sfx(chain > 1 ? 'line' : 'merge');
        phase = 'clear'; phaseT = 0;
      }
      function collapse() {
        for (let c = 0; c < N; c++) {
          const keep = [];
          for (let r = N - 1; r >= 0; r--) if (!cells[r][c].dying) keep.push(cells[r][c]);
          let spawnY = -1;
          for (let r = N - 1; r >= 0; r--) {
            const o = keep[N - 1 - r];
            if (o) cells[r][c] = o;
            else { const n = mk(Math.floor(Math.random() * types)); n.y = spawnY--; cells[r][c] = n; }
          }
        }
        phase = 'fall'; phaseT = 0;
      }
      function settle() {
        chain = 0; phase = 'idle'; idleT = 0;
        if (moves <= 0) { end(); return; }
        if (!findMove(types2d())) reshuffle();
      }
      function reshuffle() {
        const flat = cells.flat().map(o => o.t);
        for (let k = 0; k < 100; k++) {
          for (let i = flat.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [flat[i], flat[j]] = [flat[j], flat[i]]; }
          const g = []; for (let r = 0; r < N; r++) g.push(flat.slice(r * N, r * N + N));
          if (!findMatches(g).cells.length && findMove(g)) { load(g); cells.flat().forEach(o => { o.pop = -0.4; }); api.toast('No moves left, shuffled'); return; }
        }
        load(freshGrid(types)); api.toast('No moves left, shuffled');
      }
      function end() {
        phase = 'over'; endT = 0; api.sfx('over');
        api.timeout(() => api.over({ score, title: 'Out of moves', message: score >= 1500 ? 'Sparkling' : 'Chain cascades for big points' }), 500);
      }

      // ---------- input ----------
      let drag = null;
      const cellAt = (x, y) => {
        const c = Math.floor((x - lay.ox) / lay.cell), r = Math.floor((y - lay.oy) / lay.cell);
        return r >= 0 && r < N && c >= 0 && c < N ? [r, c] : null;
      };
      const local = e => { const rc = canvas.getBoundingClientRect(); return [e.clientX - rc.left, e.clientY - rc.top]; };
      api.on(canvas, 'pointerdown', e => {
        if (e.button !== 0 || phase !== 'idle') return;
        const [x, y] = local(e), p = cellAt(x, y);
        showCursor = false;
        if (!p) { sel = null; return; }
        if (sel && adj(sel, p)) { trySwap(sel, p); return; }
        sel = p; cursor = p.slice(); drag = { p, x, y }; api.sfx('tick');
      });
      api.on(canvas, 'pointermove', e => {
        if (!drag || phase !== 'idle') return;
        const [x, y] = local(e), dx = x - drag.x, dy = y - drag.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < lay.cell * 0.4) return;
        const d = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
        const b = [drag.p[0] + d[0], drag.p[1] + d[1]]; drag = null;
        if (b[0] >= 0 && b[0] < N && b[1] >= 0 && b[1] < N) trySwap(sel, b);
      });
      api.on(window, 'pointerup', () => { drag = null; });
      api.keys(e => {
        const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
        if (mv) {
          const n = [Math.max(0, Math.min(N - 1, cursor[0] + mv[0])), Math.max(0, Math.min(N - 1, cursor[1] + mv[1]))];
          if (sel && showCursor) { trySwap(sel, n); return; }
          if (showCursor) cursor = n;
          showCursor = true; api.sfx('tick'); return;
        }
        if (e.key === ' ' || e.key === 'Enter') { showCursor = true; sel = sel ? null : cursor.slice(); api.sfx('tap'); }
      });

      // ---------- update ----------
      function update(dt) {
        phaseT += dt;
        const fast = api.reduceMotion ? 3 : 1;
        bursts.forEach(b => { b.age += dt; }); bursts = bursts.filter(b => b.age < 0.5);
        cells.flat().forEach(o => { if (o.pop < 0) o.pop = Math.min(0, o.pop + dt); });
        if (phase === 'idle') { idleT += dt; if (idleT > 7 && !hintMove) hintMove = findMove(types2d()); }
        if (phase === 'swap' && phaseT * fast >= 0.16) {
          commitSwap();
          if (swapPair.ok) { moves--; chain = 0; swapPair = null; resolve(); }
          else { phase = 'back'; phaseT = 0; api.sfx('tick'); }
        } else if (phase === 'back' && phaseT * fast >= 0.16) { commitSwap(); swapPair = null; phase = 'idle'; }
        else if (phase === 'clear' && phaseT * fast >= 0.22) collapse();
        else if (phase === 'fall') {
          let moving = false;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const o = cells[r][c];
            if (o.y < r) { o.vy += 40 * dt * fast; o.y = Math.min(r, o.y + o.vy * dt * fast); moving = true; if (o.y >= r) { o.vy = 0; } }
            else { o.y = r; o.vy = 0; }
          }
          if (!moving) { api.sfx('drop'); resolve(); }
        } else if (phase === 'over') endT += dt;
      }

      function render(t) {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const head = 40;
        const size = Math.floor(Math.min(w - 20, h - head - 14) / N) * N, cell = size / N;
        lay.cell = cell; lay.ox = Math.round((w - size) / 2); lay.oy = Math.round(head + (h - head - size) * 0.3);
        const ox = lay.ox, oy = lay.oy;
        // header
        const hy = oy - 20;
        D.text(ctx, 'Moves', ox, hy, 12, col.ink2, 650, 'left');
        D.text(ctx, String(moves), ox + 44, hy, 18, moves <= 5 ? col.bad : col.ink, 780, 'left');
        if (chain > 1) D.text(ctx, `Chain x${chain}`, w / 2, hy, 13, col.accent, 750);
        D.text(ctx, String(score), ox + size, hy, 16, col.ink, 760, 'right');
        // board
        ctx.fillStyle = col.dark ? '#24201b' : '#efe6d8';
        D.roundRect(ctx, ox - 5, oy - 5, size + 10, size + 10, 14); ctx.fill();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          ctx.fillStyle = (r + c) % 2 ? (col.dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.55)') : (col.dark ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.85)');
          D.roundRect(ctx, ox + c * cell + 1.5, oy + r * cell + 1.5, cell - 3, cell - 3, cell * 0.2); ctx.fill();
        }
        if (sel && phase === 'idle') {
          ctx.fillStyle = col.dark ? 'rgba(217,119,87,0.28)' : 'rgba(217,119,87,0.22)';
          D.roundRect(ctx, ox + sel[1] * cell + 1.5, oy + sel[0] * cell + 1.5, cell - 3, cell - 3, cell * 0.2); ctx.fill();
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(ox - 5, oy - 5, size + 10, size + 10); ctx.clip();
        const sk = swapPair ? D.ease.inOut(Math.min(1, phaseT * (api.reduceMotion ? 3 : 1) / 0.16)) : 0;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const o = cells[r][c]; if (!o) continue;
          let x = c, y = o.y, s = 1;
          if (swapPair) {
            const { a, b } = swapPair, back = phase === 'back';
            const k = back ? 1 - sk : sk;
            if (r === a[0] && c === a[1]) { x = c + (b[1] - a[1]) * k; y = r + (b[0] - a[0]) * k; }
            if (r === b[0] && c === b[1]) { x = c + (a[1] - b[1]) * k; y = r + (a[0] - b[0]) * k; }
          }
          if (o.dying) s = 1 - D.ease.outCubic(Math.min(1, phaseT / 0.22));
          if (o.pop < 0) s *= api.reduceMotion ? 1 : D.ease.outBack(Math.max(0, 1 + o.pop / 0.4));
          if (hintMove && phase === 'idle' && !api.reduceMotion && hintMove.some(p => p[0] === r && p[1] === c)) s *= 1 + Math.sin(t * 8) * 0.07;
          if (sel && sel[0] === r && sel[1] === c && phase === 'idle' && !api.reduceMotion) s *= 1.06 + Math.sin(t * 6) * 0.04;
          if (s <= 0.01) continue;
          ctx.save();
          if (phase === 'over') ctx.globalAlpha = Math.max(0.35, 1 - endT * 1.5);
          ctx.translate(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell); ctx.scale(s, s);
          gem(ctx, o.t, 0, 0, cell * 0.34, col.dark);
          ctx.restore();
        }
        bursts.forEach(b => {
          const k = b.age / 0.5;
          D.spark(ctx, ox + (b.c + 0.5) * cell, oy + (b.r + 0.5) * cell, cell * (0.25 + k * 0.4), HUES[b.t], k * 2);
        });
        ctx.restore();
        if (showCursor && phase !== 'over') {
          ctx.strokeStyle = col.accent; ctx.lineWidth = 2;
          D.roundRect(ctx, ox + cursor[1] * cell + 1.5, oy + cursor[0] * cell + 1.5, cell - 3, cell - 3, cell * 0.2); ctx.stroke();
        }
        if (phase === 'over') {
          const k = Math.min(1, endT / 0.35);
          ctx.globalAlpha = k;
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.92)' : 'rgba(255,252,247,0.94)';
          D.roundRect(ctx, w / 2 - 90, oy + size * 0.3 - 30, 180, 60, 16); ctx.fill();
          ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.stroke();
          D.text(ctx, 'Out of moves', w / 2, oy + size * 0.3 - 9, 13, col.ink2, 700);
          D.text(ctx, String(score), w / 2, oy + size * 0.3 + 13, 20, col.accent, 800);
          ctx.globalAlpha = 1;
        }
      }

      api.loop((dt, t) => { update(dt); render(t); });
      Ludus.games.find(g => g.id === 'sparkmatch')._peek = () => ({ grid: types2d(), moves, score, phase, cursor, sel, lay });
      return {
        save() {
          if (phase !== 'idle' || (moves === MOVES[lv] && !score)) return null;
          return { grid: types2d(), moves, score, cursor };
        }
      };
    }
  });
})();
