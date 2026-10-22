/* Blocks: falling tetrominoes, Tetris Guideline rules: 7-bag, SRS wall kicks, ghost, hold once per piece,
   0.5 s lock delay with 15 move resets, guideline gravity and scoring (T-spins, back-to-back). */
(function () {
  const COLS = 10, ROWS = 20, HIDDEN = 2, H = ROWS + HIDDEN;
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
  };
  const TYPES = 'IOTSZJL'.split('');
  const COLORS = { I: '#4fb3bf', O: '#e8b84a', T: '#d97757', S: '#6aa86f', Z: '#d1495b', J: '#5b8def', L: '#e8894a' };
  // SRS kick tables in (x right, y up), keyed "from>to".
  const KJ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  const KI = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
  };
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const TSPIN_SCORE = [400, 800, 1200, 1600], TSPIN_MINI_SCORE = [100, 200, 400];
  const LOCK_DELAY = 0.5, MAX_RESETS = 15;
  // T-spin front corners (relative to the 3x3 box) for each rotation; the back corners are the other two.
  const T_FRONT = [[[0, 0], [2, 0]], [[2, 0], [2, 2]], [[0, 2], [2, 2]], [[0, 0], [0, 2]]];

  function rotateMatrix(m, times) {
    let r = m;
    for (let k = 0; k < ((times % 4) + 4) % 4; k++) {
      const n = r.length;
      r = r.map((row, y) => row.map((_, x) => r[n - 1 - x][y]));
    }
    return r;
  }
  function cellsOf(p) {
    const m = rotateMatrix(SHAPES[p.type], p.rot), out = [];
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) out.push([p.x + x, p.y + y]);
    return out;
  }
  function fits(board, p) {
    return cellsOf(p).every(([x, y]) => x >= 0 && x < COLS && y < H && (y < 0 || !board[y][x]));
  }
  function tryRotate(board, p, dir) {
    if (p.type === 'O') return null;
    const to = (p.rot + dir + 4) % 4, key = p.rot + '>' + to;
    const kicks = (p.type === 'I' ? KI : KJ)[key];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      const q = { type: p.type, rot: to, x: p.x + kx, y: p.y - ky };
      if (fits(board, q)) return { piece: q, kick: i };
    }
    return null;
  }
  function fullRows(board) { const r = []; board.forEach((row, y) => { if (row.every(Boolean)) r.push(y); }); return r; }
  function clearRows(board, rows) {
    const keep = board.filter((_, y) => !rows.includes(y));
    while (keep.length < H) keep.unshift(Array(COLS).fill(null));
    return keep;
  }
  function makeBag(rand) {
    const b = TYPES.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
  function filledAt(board, x, y) { return x < 0 || x >= COLS || y >= H || (y >= 0 && !!board[y][x]); }
  // 3-corner rule: 'full', 'mini' or null. Only call when a T piece locks right after a rotation.
  function tSpinKind(board, p, kick) {
    if (p.type !== 'T') return null;
    const corners = [[0, 0], [2, 0], [0, 2], [2, 2]].filter(([cx, cy]) => filledAt(board, p.x + cx, p.y + cy)).length;
    if (corners < 3) return null;
    const front = T_FRONT[p.rot].filter(([cx, cy]) => filledAt(board, p.x + cx, p.y + cy)).length;
    return front === 2 || kick === 4 ? 'full' : 'mini';
  }
  // Points for a lock: lines cleared, T-spin kind, current level, and whether back-to-back applies.
  function clearPoints(n, spin, level, b2bActive) {
    const base = spin === 'full' ? TSPIN_SCORE[n] : spin === 'mini' ? TSPIN_MINI_SCORE[Math.min(n, 2)] : LINE_SCORE[n];
    const difficult = n === 4 || (spin && n > 0);
    const b2b = difficult && b2bActive;
    return { points: Math.floor(base * level * (b2b ? 1.5 : 1)), difficult, b2b };
  }
  function gravity(level) { return Math.pow(Math.max(0.05, 0.8 - (level - 1) * 0.007), level - 1); }
  function emptyBoard() { return Array.from({ length: H }, () => Array(COLS).fill(null)); }

  Ludus.register({
    id: 'blocks', name: 'Blocks', tag: 'Arcade', tint: '#5b8def',
    hint: '<kbd>←</kbd><kbd>→</kbd> move <kbd>↑</kbd> rotate <kbd>Z</kbd> rotate back <kbd>↓</kbd> soft drop <kbd>Space</kbd> hard drop <kbd>C</kbd> hold · click: rotate or move, swipe down: drop',
    _test: { rotateMatrix, cellsOf, fits, tryRotate, fullRows, clearRows, makeBag, gravity, emptyBoard, tSpinKind, clearPoints, LINE_SCORE, COLS, H, LOCK_DELAY, MAX_RESETS },
    art(ctx, w, h) {
      const s = Math.min(w / 9, h / 5.2), ox = (w - s * 8) / 2, oy = h - s * 4.4;
      const cells = [[0, 3, 'I'], [1, 3, 'I'], [2, 3, 'I'], [3, 3, 'I'], [4, 3, 'O'], [5, 3, 'O'], [4, 2, 'O'], [5, 2, 'O'],
        [6, 3, 'L'], [7, 3, 'L'], [7, 2, 'L'], [7, 1, 'L'], [0, 2, 'S'], [1, 2, 'S'], [1, 1, 'S'], [2, 1, 'S']];
      cells.forEach(([x, y, t]) => {
        ctx.fillStyle = 'rgba(255,255,255,' + (t === 'I' ? 0.9 : t === 'O' ? 0.7 : t === 'L' ? 0.55 : 0.8) + ')';
        Ludus.draw.roundRect(ctx, ox + x * s + 1, oy + y * s + 1, s - 2, s - 2, s * 0.25); ctx.fill();
      });
      // falling T with the spark on top
      const tx = ox + 3 * s, ty = oy - s * 0.6;
      [[0, 0], [1, 0], [2, 0], [1, 1]].forEach(([x, y]) => {
        ctx.fillStyle = '#ffe2d6'; Ludus.draw.roundRect(ctx, tx + x * s + 1, ty + y * s + 1, s - 2, s - 2, s * 0.25); ctx.fill();
      });
      Ludus.draw.spark(ctx, tx + s * 1.5, ty + s * 0.5, s * 0.34, '#d97757', 0.3);
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas(() => {});
      const { ctx } = view;
      let board = emptyBoard(), bag = [], queue = [], cur = null, hold = null, holdUsed = false;
      const startLevel = [1, 4, 7][api.level];
      let level = startLevel, lines = 0, score = 0, fallT = 0, lockT = 0, lockResets = 0, lowestY = 0, dead = false;
      let lastWasRot = false, lastKick = 0, b2b = false;
      let clearing = null, particles = [], shake = 0, pops = [], landFx = null, lastRot = 0;
      const held = { left: false, right: false, down: false }; let das = 0, arr = 0, dasDir = 0;
      let layout = null, deadAt = 0;

      function nextType() {
        while (queue.length < 5) { if (!bag.length) bag = makeBag(Math.random); queue.push(bag.shift()); }
        return queue.shift();
      }
      function spawn(type) {
        const p = { type: type || nextType(), rot: 0, x: 3, y: 0 };
        if (p.type === 'O') p.x = 4;
        if (!fits(board, p)) { cur = p; return gameOver(); }
        p.spawnT = performance.now();
        cur = p; fallT = 0; lockT = 0; lockResets = 0; lastWasRot = false;
        if (fits(board, Object.assign({}, p, { y: p.y + 1 }))) cur.y += 1; // enter the visible area quickly
        lowestY = cur.y;
      }
      function isGrounded() { return !!cur && !fits(board, Object.assign({}, cur, { y: cur.y + 1 })); }
      // Guideline extended placement: reaching a new lowest row clears the lock timer and the reset counter.
      function noteRow() { if (cur && cur.y > lowestY) { lowestY = cur.y; lockResets = 0; lockT = 0; } }
      function gameOver() {
        if (dead) return; dead = true; deadAt = performance.now(); api.sfx('over');
        if (!api.reduceMotion) shake = 6;
        api.timeout(() => api.over({ score, title: 'Stacked out', message: 'Level ' + level + ', ' + lines + ' lines' }), 650);
      }
      // Move reset: a successful move or rotation while grounded restarts the lock timer, at most MAX_RESETS times.
      function moved(q) {
        if (!q || !fits(board, q)) return false;
        const wasGrounded = isGrounded();
        cur = { type: q.type, rot: q.rot, x: q.x, y: q.y, spawnT: cur.spawnT };
        noteRow();
        if ((wasGrounded || isGrounded()) && lockResets < MAX_RESETS) { lockT = 0; lockResets++; }
        return true;
      }
      function shift(dx) {
        if (!cur || clearing || dead) return false;
        const ok = moved(Object.assign({}, cur, { x: cur.x + dx }));
        if (ok) { api.sfx('move'); lastWasRot = false; }
        return ok;
      }
      function rotate(dir) {
        if (!cur || clearing || dead) return;
        const r = tryRotate(board, cur, dir);
        if (r && moved(r.piece)) { api.sfx('click'); lastRot = performance.now(); lastWasRot = true; lastKick = r.kick; }
      }
      function softDrop() {
        if (!cur || clearing || dead) return false;
        const q = Object.assign({}, cur, { y: cur.y + 1 });
        if (fits(board, q)) { cur.y++; fallT = 0; score += 1; api.score(score); lastWasRot = false; noteRow(); return true; }
        return false;
      }
      function ghostY() { let y = cur.y; while (fits(board, Object.assign({}, cur, { y: y + 1 }))) y++; return y; }
      function hardDrop() {
        if (!cur || clearing || dead) return;
        const gy = ghostY(), d = gy - cur.y;
        cur.y = gy; score += d * 2; api.score(score);
        if (d > 0) lastWasRot = false;
        if (!api.reduceMotion) shake = Math.min(4, 1.5 + d * 0.15);
        lock(true);
      }
      function doHold() {
        if (!cur || clearing || dead || holdUsed) return;
        const t = cur.type; holdUsed = true; api.sfx('tap');
        if (hold) { const h = hold; hold = t; spawn(h); } else { hold = t; spawn(); }
      }
      function lock(hard) {
        const cells = cellsOf(cur);
        const spin = lastWasRot ? tSpinKind(board, cur, lastKick) : null;
        if (cells.every(([, y]) => y < HIDDEN)) { cells.forEach(([x, y]) => { if (y >= 0) board[y][x] = cur.type; }); return gameOver(); }
        cells.forEach(([x, y]) => { if (y >= 0) board[y][x] = cur.type; });
        landFx = { cells, t: performance.now() };
        api.sfx(hard ? 'drop' : 'tap');
        const lockRow = Math.min(...cells.map(c => c[1]));
        cur = null; holdUsed = false; lastWasRot = false;
        const rows = fullRows(board), n = rows.length;
        const pts = clearPoints(n, spin, level, b2b);
        if (pts.points) { score += pts.points; api.score(score); }
        const name = (spin ? (spin === 'mini' ? 'T-Spin Mini' : 'T-Spin') + (n ? ' ' : '') : '') + ['', 'Single', 'Double', 'Triple', 'Tetris'][n];
        if (spin && !n && layout) pops.push({ text: name + ' +' + pts.points, y: Math.max(HIDDEN + 1, lockRow), t: performance.now() });
        if (n) b2b = pts.difficult;
        if (rows.length) {
          clearing = { rows, t: performance.now() };
          api.sfx('line');
          if (layout) pops.push({ text: (pts.b2b ? 'B2B ' : '') + name + ' +' + pts.points, y: rows[0], t: performance.now() });
          if (!api.reduceMotion && layout) {
            if (n === 4) shake = 6;
            rows.forEach(r => { for (let x = 0; x < COLS; x++) for (let k = 0; k < 2; k++) {
              particles.push({ x: x + 0.5, y: r - HIDDEN + 0.5, vx: api.rand(-6, 6), vy: api.rand(-9, -2), life: api.rand(0.4, 0.8), age: 0, c: COLORS[board[r][x]] || '#fff' });
            } });
          }
          api.timeout(finishClear, api.reduceMotion ? 120 : 280);
        } else spawn();
      }
      function finishClear() {
        if (!clearing) return;
        const n = clearing.rows.length;
        board = clearRows(board, clearing.rows); clearing = null;
        const before = level;
        lines += n; level = Math.max(level, startLevel + Math.floor(lines / 10));
        if (level > before) { api.sfx('power'); api.toast('Level ' + level); }
        spawn();
      }

      function tick(dt) {
        if (dead || clearing || !cur) return;
        // auto-repeat for held left/right
        const dir = held.left && !held.right ? -1 : held.right && !held.left ? 1 : 0;
        if (dir !== dasDir) { dasDir = dir; das = 0; arr = 0; }
        if (dir) { das += dt; if (das > 0.16) { arr += dt; while (arr > 0.045) { arr -= 0.045; if (!shift(dir)) { arr = 0; break; } } } }
        if (!cur) return;
        let g = gravity(level);
        if (held.down) g = Math.min(g, 0.035);
        if (isGrounded()) {
          // Lock delay: 0.5 s on the ground; once the resets are used up the piece locks as soon as it touches down.
          lockT += dt;
          if (lockT >= LOCK_DELAY || lockResets >= MAX_RESETS) lock(false);
        } else {
          fallT += dt;
          while (fallT >= g && cur) {
            fallT -= g;
            if (held.down) { if (!softDrop()) break; } else if (!isGrounded()) { cur.y++; lastWasRot = false; noteRow(); } else break;
          }
        }
      }

      function computeLayout(w, h) {
        const pad = 12;
        const cell = Math.floor(Math.min((h - pad * 2) / ROWS, (w - pad * 3) / (COLS + 4.6)));
        const bw = cell * COLS, bh = cell * ROWS;
        const side = Math.round(cell * 4.2);
        const ox = Math.round((w - bw - side - pad) / 2), oy = Math.round((h - bh) / 2);
        return { cell, bw, bh, ox, oy, sx: ox + bw + pad, side, w, h };
      }
      function block(x, y, s, color, alpha, spark) {
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.fillStyle = color;
        D.roundRect(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        D.roundRect(ctx, x + s * 0.18, y + s * 0.14, s * 0.64, s * 0.2, s * 0.1); ctx.fill();
        ctx.globalAlpha = 1;
        if (spark) D.spark(ctx, x + s / 2, y + s / 2, s * 0.3, 'rgba(255,255,255,0.9)', spark);
      }
      // Stacked out: the stack turns grey row by row from the top, the piece that did not fit stays red-outlined.
      function deadGrey(col, y) {
        const k = api.reduceMotion ? 1 : (performance.now() - deadAt) / 500 - (y - HIDDEN) / ROWS * 0.6;
        if (k <= 0) return null;
        return col.dark ? '#4a443d' : '#cfc6b8';
      }
      function mini(type, cx, cy, s, alpha) {
        const m = SHAPES[type], cells = [];
        for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) cells.push([x, y]);
        const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const ox = cx - (maxX - minX + 1) * s / 2, oy = cy - (maxY - minY + 1) * s / 2;
        cells.forEach(([x, y]) => block(ox + (x - minX) * s, oy + (y - minY) * s, s, COLORS[type], alpha));
      }

      function render(dt) {
        const col = api.colors(), { w, h } = view, now = performance.now();
        layout = computeLayout(w, h);
        const L = layout, c = L.cell;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) { ctx.translate(api.rand(-shake, shake) * 0.5, api.rand(-shake, shake) * 0.5); shake = Math.max(0, shake - dt * 30); }
        // well
        ctx.fillStyle = col.dark ? '#1f1c18' : '#efe8dc';
        D.roundRect(ctx, L.ox - 5, L.oy - 5, L.bw + 10, L.bh + 10, 12); ctx.fill();
        ctx.strokeStyle = col.line; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 1; x < COLS; x++) { ctx.moveTo(L.ox + x * c + 0.5, L.oy); ctx.lineTo(L.ox + x * c + 0.5, L.oy + L.bh); }
        for (let y = 1; y < ROWS; y++) { ctx.moveTo(L.ox, L.oy + y * c + 0.5); ctx.lineTo(L.ox + L.bw, L.oy + y * c + 0.5); }
        ctx.stroke();
        // locked cells
        const flashK = clearing ? Math.min(1, (now - clearing.t) / 280) : 0;
        for (let y = HIDDEN; y < H; y++) for (let x = 0; x < COLS; x++) {
          const t = board[y][x]; if (!t) continue;
          const px = L.ox + x * c, py = L.oy + (y - HIDDEN) * c;
          if (clearing && clearing.rows.includes(y)) {
            const s = 1 - D.ease.outCubic(flashK);
            ctx.save(); ctx.translate(px + c / 2, py + c / 2); ctx.scale(s, s);
            block(-c / 2, -c / 2, c, flashK < 0.35 ? '#fffaf2' : COLORS[t]);
            ctx.restore();
          } else block(px, py, c, (dead && deadGrey(col, y)) || COLORS[t]);
        }
        // landing glow
        if (landFx && now - landFx.t < 220 && !api.reduceMotion) {
          const a = 1 - (now - landFx.t) / 220;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.45 * a) + ')';
          landFx.cells.forEach(([x, y]) => { if (y >= HIDDEN) { D.roundRect(ctx, L.ox + x * c + 1, L.oy + (y - HIDDEN) * c + 1, c - 2, c - 2, c * 0.24); ctx.fill(); } });
        }
        // stacked out: the top of the well glows red, and the piece that could not fit is outlined in red
        if (dead) {
          const k = api.reduceMotion ? 1 : Math.min(1, (now - deadAt) / 300);
          const g = ctx.createLinearGradient(0, L.oy - 5, 0, L.oy + c * 2.5);
          g.addColorStop(0, col.bad); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.45 * k; ctx.fillStyle = g;
          ctx.fillRect(L.ox - 5, L.oy - 5, L.bw + 10, c * 2.5 + 5);
          ctx.globalAlpha = k; ctx.fillStyle = col.bad;
          D.roundRect(ctx, L.ox - 5, L.oy - 5, L.bw + 10, 4, 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (dead && cur) {
          ctx.strokeStyle = col.bad; ctx.lineWidth = 2.5;
          cellsOf(cur).forEach(([x, y]) => {
            if (y < HIDDEN) return;
            const px = L.ox + x * c, py = L.oy + (y - HIDDEN) * c;
            ctx.fillStyle = col.bad; ctx.globalAlpha = 0.35;
            D.roundRect(ctx, px + 2, py + 2, c - 4, c - 4, c * 0.22); ctx.fill();
            ctx.globalAlpha = 1; ctx.stroke();
          });
        }
        // ghost + active piece
        if (cur && !clearing && !dead) {
          const gy = ghostY();
          ctx.strokeStyle = COLORS[cur.type]; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
          cellsOf(Object.assign({}, cur, { y: gy })).forEach(([x, y]) => {
            if (y < HIDDEN) return;
            D.roundRect(ctx, L.ox + x * c + 2.5, L.oy + (y - HIDDEN) * c + 2.5, c - 5, c - 5, c * 0.22); ctx.stroke();
          });
          ctx.globalAlpha = 1;
          const pc = cellsOf(cur);
          const pivot = pc[Math.min(2, pc.length - 1)];
          const born = Math.min(1, (now - (cur.spawnT || 0)) / 140);
          const rotK = Math.min(1, (now - lastRot) / 120);
          const squash = api.reduceMotion ? 1 : D.lerp(0.9, 1, D.ease.outBack(rotK));
          // Lock cue: a grounded piece dims and gently pulses as its lock timer runs out.
          const lockK = isGrounded() ? Math.min(1, lockResets >= MAX_RESETS ? 1 : lockT / LOCK_DELAY) : 0;
          const pulse = api.reduceMotion ? 0 : 0.06 * Math.sin(now / 70) * lockK;
          const pieceAlpha = 1 - 0.42 * lockK + pulse;
          pc.forEach(([x, y]) => {
            if (y < HIDDEN) return;
            const px = L.ox + x * c, py = L.oy + (y - HIDDEN) * c;
            ctx.save(); ctx.translate(px + c / 2, py + c / 2);
            const s = (api.reduceMotion ? 1 : D.ease.outBack(born)) * squash; ctx.scale(s, s);
            block(-c / 2, -c / 2, c, COLORS[cur.type], pieceAlpha, x === pivot[0] && y === pivot[1] ? now / 900 : 0);
            ctx.restore();
          });
        }
        // particles
        particles = particles.filter(p => (p.age += dt) < p.life);
        particles.forEach(p => {
          p.vy += 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c;
          ctx.fillRect(L.ox + p.x * c - 2, L.oy + p.y * c - 2, 4, 4);
        });
        ctx.globalAlpha = 1;
        // pops
        pops = pops.filter(p => now - p.t < 900);
        pops.forEach(p => {
          const k = (now - p.t) / 900;
          ctx.globalAlpha = 1 - k;
          D.text(ctx, p.text, L.ox + L.bw / 2, L.oy + (p.y - HIDDEN) * c - k * 26, Math.max(12, c * 0.7), col.accent, 760);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        // side panel: hold, next, stats
        const sx = L.sx, sw = L.side, ms = c * 0.62;
        let y = L.oy;
        const box = (label, hgt) => {
          ctx.fillStyle = col.dark ? '#1f1c18' : '#efe8dc';
          D.roundRect(ctx, sx, y, sw, hgt, 10); ctx.fill();
          D.text(ctx, label, sx + sw / 2, y + 11, 10, col.ink3, 650);
        };
        const hh = ms * 2.2 + 22;
        L.holdBox = { x: sx, y, w: sw, h: hh };
        box('HOLD', hh);
        if (hold) mini(hold, sx + sw / 2, y + 20 + ms * 1.1, ms, holdUsed ? 0.35 : 1);
        y += hh + 8;
        const roomForNext = L.oy + L.bh - y - 70;
        const nCount = Math.max(1, Math.min(3, Math.floor((roomForNext - 22) / (ms * 2.4))));
        const nh = 22 + nCount * ms * 2.4;
        box('NEXT', nh);
        for (let i = 0; i < nCount && i < queue.length; i++) mini(queue[i], sx + sw / 2, y + 22 + ms * 1.1 + i * ms * 2.4, i ? ms * 0.85 : ms, i ? 0.75 : 1);
        y += nh + 8;
        const stat = (label, val) => {
          D.text(ctx, label, sx + sw / 2, y + 7, 10, col.ink3, 650);
          D.text(ctx, String(val), sx + sw / 2, y + 23, 17, col.ink, 760);
          y += 36;
        };
        if (y + 72 <= L.oy + L.bh + 4) { stat('LEVEL', level); stat('LINES', lines); }
      }

      // keyboard
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a') { if (!e.repeat) { held.left = true; shift(-1); dasDir = -1; das = 0; } }
        else if (k === 'ArrowRight' || k === 'd') { if (!e.repeat) { held.right = true; shift(1); dasDir = 1; das = 0; } }
        else if (k === 'ArrowDown' || k === 's') { if (!e.repeat) { held.down = true; softDrop(); } }
        else if (k === 'ArrowUp' || k === 'x' || k === 'X' || k === 'w') { if (!e.repeat) rotate(1); }
        else if (k === 'z' || k === 'Z') { if (!e.repeat) rotate(-1); }
        else if (k === ' ') { e.preventDefault(); if (!e.repeat) hardDrop(); }
        else if (k === 'c' || k === 'C' || k === 'Shift') { if (!e.repeat) doHold(); }
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a') held.left = false;
        if (k === 'ArrowRight' || k === 'd') held.right = false;
        if (k === 'ArrowDown' || k === 's') held.down = false;
      });
      api.on(window, 'blur', () => { held.left = held.right = held.down = false; });
      // mouse / trackpad
      api.swipe((dir, e) => {
        if (dead || !layout) return;
        if (dir === 'down') return hardDrop();
        if (dir === 'up') return doHold();
        if (dir === 'left') return shift(-1);
        if (dir === 'right') return shift(1);
        const r = view.canvas.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top, L = layout;
        const hb = L.holdBox;
        if (hb && mx >= hb.x && mx <= hb.x + hb.w && my >= hb.y && my <= hb.y + hb.h) return doHold();
        if (!cur) return;
        const cells = cellsOf(cur);
        const xs = cells.map(c => L.ox + (c[0] + 0.5) * L.cell), ys = cells.map(c => L.oy + (c[1] - HIDDEN + 0.5) * L.cell);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const near = cells.some((_, i) => Math.abs(xs[i] - mx) < L.cell * 0.9 && Math.abs(ys[i] - my) < L.cell * 0.9);
        if (near) rotate(1); else shift(mx < cx ? -1 : 1);
      });

      function restore(v) {
        try {
          if (!v || !Array.isArray(v.board) || v.board.length !== H || !Number.isFinite(v.score)) return false;
          const okT = t => t === null || TYPES.includes(t);
          if (!v.board.every(r => Array.isArray(r) && r.length === COLS && r.every(okT))) return false;
          if (!Array.isArray(v.queue) || !v.queue.every(t => TYPES.includes(t)) || !Array.isArray(v.bag) || !v.bag.every(t => TYPES.includes(t))) return false;
          if (v.hold !== null && !TYPES.includes(v.hold)) return false;
          board = v.board.map(r => r.slice()); queue = v.queue.slice(); bag = v.bag.slice();
          hold = v.hold; holdUsed = !!v.holdUsed;
          level = Math.max(startLevel, v.level | 0); lines = v.lines | 0; score = v.score; b2b = !!v.b2b;
          const vc = v.cur && TYPES.includes(v.cur.type) ? { type: v.cur.type, rot: v.cur.rot & 3, x: v.cur.x | 0, y: v.cur.y | 0 } : null;
          if (vc && fits(board, vc)) {
            cur = Object.assign(vc, { spawnT: 0 });
            fallT = 0;
            lockResets = Math.min(MAX_RESETS, Math.max(0, v.lockResets | 0));
            lockT = Number.isFinite(v.lockT) ? Math.min(LOCK_DELAY, Math.max(0, v.lockT)) : 0;
            lowestY = Number.isFinite(v.lowestY) ? Math.max(cur.y, v.lowestY | 0) : cur.y;
          } else {
            const nt = queue[0] || 'T';
            if (!fits(board, { type: nt, rot: 0, x: nt === 'O' ? 4 : 3, y: 0 })) return false;
            spawn();
          }
          api.score(score);
          return !dead;
        } catch (e) { return false; }
      }
      if (!restore(api.saved)) {
        board = emptyBoard(); bag = []; queue = []; hold = null; holdUsed = false; dead = false;
        level = startLevel; lines = 0; score = 0;
        spawn(); api.score(0);
      }
      render(0);
      api.loop(dt => { tick(dt); render(dt); });
      return {
        save() {
          if (dead) return null;
          let b = board, ln = lines, lv = level, piece = cur;
          // Mid line clear: save the board as it will be once the rows are gone.
          if (clearing) { b = clearRows(board, clearing.rows); ln += clearing.rows.length; lv = Math.max(level, startLevel + Math.floor(ln / 10)); piece = null; }
          if (score === 0 && !b.some(r => r.some(Boolean))) return null;
          return {
            board: b.map(r => r.slice()), queue: queue.slice(), bag: bag.slice(), hold, holdUsed,
            cur: piece ? { type: piece.type, rot: piece.rot, x: piece.x, y: piece.y } : null,
            lockT: piece ? Math.round(lockT * 1000) / 1000 : 0, lockResets: piece ? lockResets : 0, lowestY: piece ? lowestY : 0,
            level: lv, lines: ln, score, b2b
          };
        }
      };
    }
  });
})();
