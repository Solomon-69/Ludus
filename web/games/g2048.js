/* 2048: slide tiles, equal tiles merge. Reference implementation of the Ludus game contract. */
Ludus.register({
  id: 'g2048', name: '2048', tag: 'Puzzle', tint: '#e0a526',
  hint: '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or swipe',
  art(ctx, w, h) {
    const vals = [2, 4, 8, 16, 32, 64, 128, 2048];
    const s = Math.min(w, h) * 0.24, gap = s * 0.14;
    const ox = (w - (s * 4 + gap * 3)) / 2, oy = (h - (s * 2 + gap)) / 2;
    vals.forEach((v, i) => {
      const x = ox + (i % 4) * (s + gap), y = oy + Math.floor(i / 4) * (s + gap);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + i * 0.08})`;
      Ludus.draw.roundRect(ctx, x, y, s, s, s * 0.22); ctx.fill();
      Ludus.draw.text(ctx, String(v), x + s / 2, y + s / 2 + 1, s * (v > 999 ? 0.3 : 0.42), '#5a3b10', 750);
    });
  },
  create(stage, api) {
    const N = 4, D = Ludus.draw;
    let grid, tiles, score, won, moving = false, idSeq = 0, stuck = false, stuckAt = 0;
    const view = api.canvas(() => render(0));
    const { ctx } = view;
    const palette = {
      2: '#f4e9d8', 4: '#efdcc0', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b',
      128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#d97757'
    };
    function reset() {
      grid = Array.from({ length: N }, () => Array(N).fill(null)); tiles = []; score = 0; won = false;
      spawn(); spawn(); api.score(0);
    }
    // Restore a saved board: { cells: 16 numbers (0 = empty), score, won }.
    function restore(v) {
      if (!v || !Array.isArray(v.cells) || v.cells.length !== N * N || !Number.isFinite(v.score)) return false;
      if (!v.cells.every(n => n === 0 || (Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0))) return false;
      if (!v.cells.some(Boolean)) return false;
      grid = Array.from({ length: N }, () => Array(N).fill(null)); tiles = [];
      v.cells.forEach((n, i) => {
        if (!n) return;
        const r = Math.floor(i / N), c = i % N;
        const t = { id: idSeq++, v: n, r, c, pr: r, pc: c, born: 0, pop: 0 };
        grid[r][c] = t; tiles.push(t);
      });
      score = v.score; won = !!v.won; api.score(score);
      return true;
    }
    function spawn() {
      const empty = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) empty.push([r, c]);
      if (!empty.length) return;
      const [r, c] = api.pick(empty);
      const t = { id: idSeq++, v: Math.random() < (api.level === 2 ? 0.2 : 0.1) ? 4 : 2, r, c, pr: r, pc: c, born: performance.now(), pop: 0 };
      grid[r][c] = t; tiles.push(t);
    }
    function move(dir) {
      if (moving || stuck) return;
      const vec = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
      if (!vec) return;
      const order = [...Array(N).keys()];
      const rows = vec[0] === 1 ? order.slice().reverse() : order;
      const cols = vec[1] === 1 ? order.slice().reverse() : order;
      let moved = false; const merged = new Set();
      tiles.forEach(t => { t.pr = t.r; t.pc = t.c; });
      const dead = [];
      rows.forEach(r => cols.forEach(c => {
        const t = grid[r][c]; if (!t) return;
        let nr = r, nc = c;
        while (true) {
          const tr = nr + vec[0], tc = nc + vec[1];
          if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
          const o = grid[tr][tc];
          if (!o) { nr = tr; nc = tc; continue; }
          if (o.v === t.v && !merged.has(o.id)) {
            grid[r][c] = null; o.v *= 2; o.pop = performance.now(); merged.add(o.id);
            t.r = tr; t.c = tc; dead.push(t); score += o.v; moved = true;
            if (o.v === 2048 && !won) { won = true; api.timeout(() => api.toast('2048! Keep going'), 200); }
            return;
          }
          break;
        }
        if (nr !== r || nc !== c) { grid[r][c] = null; grid[nr][nc] = t; t.r = nr; t.c = nc; moved = true; }
      }));
      if (!moved) return;
      api.sfx(merged.size ? 'merge' : 'move');
      api.score(score);
      moving = true; const t0 = performance.now();
      api.timeout(() => {
        tiles = tiles.filter(t => !dead.includes(t)); moving = false; spawn();
        if (!canMove()) {
          stuck = true; stuckAt = performance.now(); api.sfx('lose');
          api.timeout(() => api.over({ score, title: won ? 'You made 2048' : 'No more moves', won }), 650);
        }
      }, api.reduceMotion ? 0 : 110);
      anim = { t0, dead };
    }
    let anim = null;
    function canMove() {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = grid[r][c]; if (!t) return true;
        if (c < N - 1 && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
        if (r < N - 1 && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
      }
      return false;
    }
    function render(now) {
      const col = api.colors();
      const { w, h } = view;
      ctx.clearRect(0, 0, w, h);
      const size = Math.min(w, h) - 24, gap = size * 0.03, cell = (size - gap * (N + 1)) / N;
      const ox = (w - size) / 2, oy = (h - size) / 2;
      ctx.fillStyle = col.dark ? '#3a342d' : '#e6dccd';
      D.roundRect(ctx, ox, oy, size, size, 14); ctx.fill();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.45)';
        D.roundRect(ctx, ox + gap + c * (cell + gap), oy + gap + r * (cell + gap), cell, cell, 9); ctx.fill();
      }
      const k = anim && !api.reduceMotion ? Math.min(1, (now - anim.t0) / 110) : 1;
      const e = D.ease.outCubic(k);
      const draw = t => {
        const r = D.lerp(t.pr, t.r, e), c = D.lerp(t.pc, t.c, e);
        let s = 1;
        const born = (now - t.born) / 160; if (born < 1 && !api.reduceMotion) s = D.ease.outBack(Math.max(0, born));
        const pop = (now - t.pop) / 180; if (t.pop && pop < 1 && !api.reduceMotion) s *= 1 + Math.sin(pop * Math.PI) * 0.12;
        const x = ox + gap + c * (cell + gap) + cell / 2, y = oy + gap + r * (cell + gap) + cell / 2;
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
        ctx.fillStyle = palette[t.v] || '#3c3a32';
        D.roundRect(ctx, -cell / 2, -cell / 2, cell, cell, 9); ctx.fill();
        const fs = cell * (t.v >= 1024 ? 0.3 : t.v >= 128 ? 0.36 : 0.44);
        D.text(ctx, String(t.v), 0, 1, fs, t.v <= 4 ? '#6b5a45' : '#fff', 760);
        ctx.restore();
      };
      tiles.forEach(draw);
      // No moves left: the board greys out and the biggest tile stays bright.
      if (stuck) {
        const a = api.reduceMotion ? 1 : Math.min(1, (now - stuckAt) / 350);
        ctx.fillStyle = col.dark ? `rgba(20,17,14,${0.55 * a})` : `rgba(240,234,224,${0.6 * a})`;
        D.roundRect(ctx, ox, oy, size, size, 14); ctx.fill();
        const top = tiles.reduce((m, t) => (t.v > m.v ? t : m), tiles[0]);
        if (top) {
          ctx.globalAlpha = a;
          draw(top);
          ctx.strokeStyle = col.accent; ctx.lineWidth = 3;
          D.roundRect(ctx, ox + gap + top.c * (cell + gap) - 3, oy + gap + top.r * (cell + gap) - 3, cell + 6, cell + 6, 11); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    api.keys(e => {
      const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key];
      if (m) move(m);
    });
    api.swipe(dir => move(dir));
    if (!(api.saved && restore(api.saved))) reset();
    render(performance.now());
    api.loop(() => render(performance.now()));
    return {
      save() {
        if (stuck || !grid) return null;
        const cells = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push(grid[r][c] ? grid[r][c].v : 0);
        if (score === 0 && cells.filter(Boolean).length <= 2) return null; // nothing played yet
        return { cells, score, won };
      }
    };
  }
});
