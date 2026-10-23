/* Snake: smooth interpolated snake on a grid. The Claude spark is the head. Walls and your own body end the run. */
(function () {
  const D = Ludus.draw;
  const FOOD = '#e9a23b';
  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
  };

  function rgba(c, a) {
    if (c && c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (m) { const p = m[1].split(',').map(s => s.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
    return c;
  }

  Ludus.register({
    id: 'snake', name: 'Snake', tag: 'Arcade', tint: '#4f9d69',
    hint: '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or WASD, swipe or click to turn',
    art(ctx, w, h) {
      const u = h / 78;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pts = [[w * 0.14, h * 0.7], [w * 0.14, h * 0.4], [w * 0.36, h * 0.4], [w * 0.36, h * 0.66], [w * 0.6, h * 0.66], [w * 0.6, h * 0.34]];
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
      ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 13 * u; ctx.save(); ctx.translate(0, 2 * u); path(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#fff8f2'; ctx.lineWidth = 13 * u; path(); ctx.stroke();
      const [hx, hy] = pts[pts.length - 1];
      ctx.fillStyle = '#fff8f2'; ctx.beginPath(); ctx.arc(hx, hy, 10 * u, 0, Math.PI * 2); ctx.fill();
      D.spark(ctx, hx, hy, 8 * u, '#d97757', 0.2);
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.34, 6 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(w * 0.82 - 2 * u, h * 0.34 - 2 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      // Seconds per cell. Easy is gentle, speed creeps up a little with every bite.
      const STEP = [0.18, 0.12, 0.088].map(v => v * 1.18)[api.level];   // 18% slower than before at every level, same speed-up curve
      const MIN_STEP = [0.12, 0.078, 0.055].map(v => v * 1.18)[api.level];
      // The grid is fixed for the whole run from the starting size; only the drawing scales on resize.
      const view = api.canvas();
      const { ctx, canvas } = view;
      const vw = view.w > 40 ? view.w : 376, vh = view.h > 40 ? view.h : 440;
      const sv = validSave(api.saved);
      const cols = sv ? sv.cols : Math.max(12, Math.min(20, Math.round(vw / 24)));
      const rows = sv ? sv.rows : Math.max(12, Math.min(26, Math.round(cols * (vh - 20) / Math.max(1, vw - 20))));

      let snake, dir, queue, acc, started, dead, food, eaten, score, particles, shake, headPop, crash, deadAt;
      const lay = { ox: 0, oy: 0, cell: 10 };

      function reset() {
        const y = Math.floor(rows / 2), x = Math.floor(cols / 3);
        snake = [0, 1, 2].map(i => ({ x: x - i, y, px: x - i, py: y }));
        dir = DIRS.right; queue = []; acc = 0; started = false; dead = false;
        eaten = 0; score = 0; particles = []; shake = 0; headPop = 0; crash = null; deadAt = 0;
        spawnFood(); api.score(0);
      }
      function validSave(v) {
        try {
          if (!v || !Array.isArray(v.snake) || v.snake.length < 2 || !(v.cols >= 8 && v.cols <= 40) || !(v.rows >= 8 && v.rows <= 40)) return null;
          if (!v.snake.every(q => Number.isInteger(q.x) && Number.isInteger(q.y) && q.x >= 0 && q.y >= 0 && q.x < v.cols && q.y < v.rows)) return null;
          if (!DIRS[v.dir] || !Number.isFinite(v.score)) return null;
          return v;
        } catch (e) { return null; }
      }
      function restore(v) {
        reset();
        snake = v.snake.map(q => ({ x: q.x, y: q.y, px: q.x, py: q.y }));
        dir = DIRS[v.dir]; queue = []; started = true; acc = 0;
        eaten = v.eaten | 0; score = v.score;
        if (v.food && Number.isInteger(v.food.x) && Number.isInteger(v.food.y)) food = { x: v.food.x, y: v.food.y, born: 0 };
        else spawnFood();
        api.score(score);
      }
      const dirName = d => Object.keys(DIRS).find(k => DIRS[k] === d) || 'right';

      function spawnFood() {
        const used = new Set(snake.map(s => s.x + ',' + s.y));
        const free = [];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!used.has(x + ',' + y)) free.push({ x, y });
        food = free.length ? Object.assign(api.pick(free), { born: performance.now() }) : null;
      }

      const interval = () => Math.max(MIN_STEP, STEP - eaten * 0.0016);

      function turn(name) {
        if (dead) return;
        const d = DIRS[name]; if (!d) return;
        if (!started) {
          // First key starts the run in that direction. Opposite of the start direction: turn the snake around.
          if (d.x === -dir.x && d.y === -dir.y) {
            snake.reverse();
            snake.forEach(s => { s.px = s.x; s.py = s.y; });
          }
          started = true; acc = 0; queue = [];
          if (d !== dir) { dir = d; }
          return;
        }
        const last = queue.length ? queue[queue.length - 1] : dir;
        if (d.x === -last.x && d.y === -last.y) return;
        if (d.x === last.x && d.y === last.y) return;
        if (queue.length < 2) queue.push(d);
      }

      function tick() {
        if (queue.length) dir = queue.shift();
        const h = snake[0];
        const nx = h.x + dir.x, ny = h.y + dir.y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return die(nx, ny);
        const ate = food && food.x === nx && food.y === ny;
        const check = ate ? snake.length : snake.length - 1;
        for (let i = 0; i < check; i++) if (snake[i].x === nx && snake[i].y === ny) return die(nx, ny);
        const old = snake.map(s => ({ x: s.x, y: s.y }));
        snake.forEach((s, i) => {
          s.px = s.x; s.py = s.y;
          const t = i === 0 ? { x: nx, y: ny } : old[i - 1];
          s.x = t.x; s.y = t.y;
        });
        if (ate) {
          const t = old[old.length - 1];
          snake.push({ x: t.x, y: t.y, px: t.x, py: t.y });
          eaten++; score += 10; api.score(score); api.sfx('eat'); headPop = performance.now();
          burst(food.x, food.y);
          spawnFood();
          if (!food) win();
        }
      }

      function burst(cx, cy) {
        if (api.reduceMotion) return;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
          particles.push({ x: cx + 0.5, y: cy + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: 0.08 + Math.random() * 0.1 });
        }
      }

      function die(cx, cy) {
        dead = true; acc = interval(); crash = { x: cx, y: cy }; deadAt = performance.now();
        snake.forEach(s => { s.px = s.x; s.py = s.y; });
        api.sfx('hit'); if (!api.reduceMotion) shake = 1;
        api.timeout(() => api.over({ score, title: 'Game over', won: false, message: `Length ${snake.length}` }), 700);
      }
      function win() {
        dead = true; acc = interval();
        api.timeout(() => api.over({ score, title: 'Board full', won: true, message: `Length ${snake.length}` }), 500);
      }

      // ---------- input ----------
      api.keys(e => { const m = KEYMAP[e.key]; if (m) turn(m); });
      api.swipe((d, e) => {
        if (d !== 'tap') { turn(d); return; }
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const h = snake[0];
        const hx = lay.ox + (h.x + 0.5) * lay.cell, hy = lay.oy + (h.y + 0.5) * lay.cell;
        const last = queue.length ? queue[queue.length - 1] : dir;
        if (!started) {
          // Before the start, a click heads the snake toward the click.
          const dx = px - hx, dy = py - hy;
          turn(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
          return;
        }
        if (last.x !== 0) turn(py < hy ? 'up' : 'down');
        else turn(px < hx ? 'left' : 'right');
      });

      // ---------- render ----------
      function cellPos(s, p) {
        return { x: lay.ox + (D.lerp(s.px, s.x, p) + 0.5) * lay.cell, y: lay.oy + (D.lerp(s.py, s.y, p) + 0.5) * lay.cell };
      }
      function center(x, y) { return { x: lay.ox + (x + 0.5) * lay.cell, y: lay.oy + (y + 0.5) * lay.cell }; }

      function render(t, now) {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const pad = 10;
        const cell = Math.floor(Math.min((w - pad * 2) / cols, (h - pad * 2) / rows) * 2) / 2;
        lay.cell = cell; lay.ox = Math.round((w - cell * cols) / 2); lay.oy = Math.round((h - cell * rows) / 2);
        ctx.save();
        if (shake > 0) { ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 6 * shake); }

        // board
        ctx.fillStyle = col.dark ? '#221e1a' : '#efe7da';
        D.roundRect(ctx, lay.ox - 4, lay.oy - 4, cell * cols + 8, cell * rows + 8, 12); ctx.fill();
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.025)' : 'rgba(255,255,255,0.38)';
        for (let y = 0; y < rows; y++) for (let x = (y % 2); x < cols; x += 2) ctx.fillRect(lay.ox + x * cell, lay.oy + y * cell, cell, cell);

        // food
        if (food) {
          const fc = center(food.x, food.y);
          const b = Math.min(1, (now - food.born) / 320);
          let s = api.reduceMotion ? 1 : Math.max(0, D.ease.outBack(b));
          if (!api.reduceMotion) s *= 1 + Math.sin(t * 5) * 0.05;
          const r = cell * 0.3 * s;
          ctx.fillStyle = rgba(FOOD, 0.22); ctx.beginPath(); ctx.arc(fc.x, fc.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = FOOD; ctx.beginPath(); ctx.arc(fc.x, fc.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(fc.x - r * 0.35, fc.y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
        }

        // snake tube: head (interpolated), every body cell, then the trailing tail end
        const p = started ? Math.min(1, acc / interval()) : 1;
        const pts = [cellPos(snake[0], p)];
        for (let i = 1; i < snake.length; i++) pts.push(center(snake[i].x, snake[i].y));
        pts.push(cellPos(snake[snake.length - 1], p));
        // the crash: the head bumps into the wall or body and recoils back into the snake with a spring, squashing for a moment
        let bumpK = -1, bdx = 0, bdy = 0;
        if (crash && !(dead && !food)) {
          bumpK = (now - deadAt) / 250;
          const a0 = center(snake[0].x, snake[0].y), b0 = center(crash.x, crash.y);
          bdx = Math.sign(b0.x - a0.x); bdy = Math.sign(b0.y - a0.y);
          if (!api.reduceMotion) { const k = Math.min(1, bumpK), off = cell * 0.16 * (1 - Math.exp(-9 * k) * Math.cos(14 * k)); pts[0] = { x: pts[0].x - bdx * off, y: pts[0].y - bdy * off }; }
        }
        const body = dead && !food ? col.good : dead ? col.bad : col.accent;
        const stroke = (style, width, dx, dy) => {
          ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x + dx, q.y + dy) : ctx.moveTo(q.x + dx, q.y + dy))); ctx.stroke();
        };
        stroke(col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(80,50,30,0.14)', cell * 0.66, 0, cell * 0.08);
        stroke(body, cell * 0.66, 0, 0);
        stroke('rgba(255,255,255,0.16)', cell * 0.2, -cell * 0.08, -cell * 0.1);

        // head = the spark
        const hd = pts[0];
        let hs = 1;
        const pop = (now - headPop) / 220;
        if (headPop && pop < 1 && !api.reduceMotion) hs = 1 + Math.sin(pop * Math.PI) * 0.22;
        const sq = bumpK >= 0 && !api.reduceMotion ? Math.exp(-6 * Math.min(1, bumpK)) : 0;
        ctx.save(); ctx.translate(hd.x, hd.y); if (sq) ctx.rotate(Math.atan2(bdy, bdx)); if (sq) ctx.scale(1 - 0.24 * sq, 1 + 0.14 * sq);
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, cell * 0.44 * hs, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        D.spark(ctx, hd.x, hd.y, cell * 0.34 * hs, '#fff8f2', api.reduceMotion ? 0 : t * 1.4);

        // particles
        particles.forEach(q => {
          ctx.globalAlpha = Math.max(0, q.life);
          ctx.fillStyle = FOOD; ctx.beginPath();
          ctx.arc(lay.ox + q.x * cell, lay.oy + q.y * cell, q.size * cell * (0.5 + q.life * 0.5), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;

        // impact burst: short spark lines flying out from the spot of the hit (just this, held still, with reduced motion)
        if (bumpK >= 0) {
          const k = api.reduceMotion ? 0.4 : Math.min(1, bumpK * 1.1);
          const a = center(snake[0].x, snake[0].y), b = center(crash.x, crash.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.strokeStyle = col.bad; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6, cell * 0.09); ctx.globalAlpha = api.reduceMotion ? 0.9 : 1 - k * k;
          const r1 = cell * (0.12 + 0.34 * D.ease.outBack(Math.min(1, k * 1.3))), len = cell * 0.26 * (1 - k * 0.5);
          ctx.beginPath();
          for (let i = 0; i < 9; i++) { const an = (i / 9) * Math.PI * 2 + 0.3; ctx.moveTo(mx + Math.cos(an) * r1, my + Math.sin(an) * r1); ctx.lineTo(mx + Math.cos(an) * (r1 + len), my + Math.sin(an) * (r1 + len)); }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.restore();

        if (!started && !dead) drawStartKeys(w, col, t);
      }

      // Start prompt: a small arrow-key diamond under the snake. The key the snake faces breathes
      // softly (council pick); nothing else moves or fades, and it goes away on the first turn.
      function drawStartKeys(w, col, t) {
        const k = Math.max(24, Math.min(32, lay.cell * 1.25)), gap = 5, r = 7;
        const cx = w / 2, top = lay.oy + lay.cell * rows * 0.7;
        const keys = [['up', cx - k / 2, top], ['left', cx - k * 1.5 - gap, top + k + gap],
          ['down', cx - k / 2, top + k + gap], ['right', cx + k / 2 + gap, top + k + gap]];
        const cardW = k * 3 + gap * 2 + 28, cardH = k * 2 + gap + 46;
        ctx.fillStyle = col.dark ? 'rgba(34,30,26,0.94)' : 'rgba(255,252,247,0.95)';
        ctx.shadowColor = col.dark ? 'rgba(0,0,0,0.4)' : 'rgba(80,50,30,0.14)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
        D.roundRect(ctx, cx - cardW / 2, top - 14, cardW, cardH, 16); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        const facing = Object.keys(DIRS).find(n => DIRS[n] === dir) || 'right';
        const breath = api.reduceMotion ? 0.6 : 0.45 + Math.sin(t * Math.PI) * 0.35;
        const arrow = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
        keys.forEach(([n, x, y]) => {
          const on = n === facing;
          if (on) { ctx.fillStyle = rgba(col.accent, 0.28 * breath); D.roundRect(ctx, x - 4, y - 4, k + 8, k + 8, r + 3); ctx.fill(); }
          ctx.fillStyle = col.dark ? '#3a342d' : '#ece3d6';
          D.roundRect(ctx, x, y + 2, k, k, r); ctx.fill();
          ctx.fillStyle = on ? col.accent : (col.dark ? '#2c2722' : '#fffaf3');
          D.roundRect(ctx, x, y, k, k, r); ctx.fill();
          D.text(ctx, arrow[n], x + k / 2, y + k / 2 + 1, k * 0.46, on ? '#fff8f2' : col.ink2, 700);
        });
        D.text(ctx, 'to start', cx, top + k * 2 + gap + 18, 12, col.ink2, 650);
      }

      reset();
      if (sv) { try { restore(sv); } catch (e) { reset(); } }
      render(0, performance.now()); // first frame now, so a restored board shows behind the Welcome back sheet
      api.loop((dt, t) => {
        if (started && !dead) {
          acc += dt;
          let guard = 0;
          while (acc >= interval() && !dead && guard++ < 4) { acc -= interval(); tick(); }
        }
        particles.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; q.life -= dt * 2.2; });
        particles = particles.filter(q => q.life > 0);
        if (shake > 0) shake = Math.max(0, shake - dt * 4);   // ~250 ms
        render(t, performance.now());
      });
      return {
        save() {
          if (!started || dead) return null;
          return { cols, rows, snake: snake.map(q => ({ x: q.x, y: q.y })), dir: dirName(dir), food: food ? { x: food.x, y: food.y } : null, eaten, score };
        }
      };
    }
  });
})();
