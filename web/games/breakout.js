/* Brick Break: bounce the spark ball off your paddle and clear the bricks. Power-ups: wide paddle, multi-ball, slow. */
(function () {
  const D = Ludus.draw;
  const W = 400, H = 480;            // logical field, scaled to fit the stage
  const TOP = 34;                    // top wall (HUD sits above)
  const COLS = 8, BW = (W - 32 - (COLS - 1) * 6) / COLS, BH = 16, BGAP = 6, BX0 = 16, BY0 = 52;
  const ROW_COLORS = ['#e05d8b', '#d97757', '#e0a526', '#4f9d69', '#2a9d9f', '#3f8fb5', '#9b6dd6'];
  const PADDLE_Y = H - 42, PADDLE_H = 12, PADDLE_W = 74, BALL_R = 7.5;
  const POWER = {
    wide: { color: '#3f8fb5' }, multi: { color: '#9b6dd6' }, slow: { color: '#4f9d69' }
  };

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mix = (...n) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 2246822519); h ^= h >>> 16; } return h >>> 0; };
  const newSeed = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; } catch (e) { return Math.floor(Math.random() * 2147483647); } };
  // The brick shape of a level: one of ten shapes, with its own size and gaps, drawn from the run's seed. Mirrored left and right, so it is fair.
  // Without a seed (tests) the old four shapes in turn are used.
  const SHAPES = 10;
  function shapeMask(seed, levelNo) {
    const r = mulberry(mix(seed, levelNo, 3)), rows = 4 + Math.floor(r() * 5), half = COLS / 2, kind = Math.floor(r() * SHAPES), a = 2 + Math.floor(r() * 3), dens = 0.5 + r() * 0.3, flip = r() < 0.5;
    const noise = Array.from({ length: rows }, () => Array.from({ length: half }, () => r() < dens));
    const mask = [];
    for (let y = 0; y < rows; y++) { mask.push([]); for (let x = 0; x < half; x++) {
      const dx = half - 1 - x, yy = flip ? rows - 1 - y : y; let on;
      switch (kind) {
        case 0: on = true; break;                                  // full wall
        case 1: on = dx <= yy * 0.8 + 0.5; break;                 // pyramid
        case 2: on = (x + y) % 2 === 0 || y === 0; break;         // checker
        case 3: on = noise[y][x]; break;                          // scattered
        case 4: on = (y % a) !== a - 1; break;                    // stripes
        case 5: on = x % 2 === 0 || y === 0; break;               // pillars
        case 6: on = Math.abs(dx - 0.5) + Math.abs(y - (rows - 1) / 2) <= rows / 2; break;   // diamond
        case 7: on = y === 0 || y === rows - 1 || x === 0; break; // frame
        case 8: on = (x + y * a) % 3 !== 0; break;                // diagonal gaps
        default: on = noise[y][x] || y === 0; break;              // scattered with a solid top row
      }
      mask[y].push(on);
    } }
    const rowsOut = mask.map(m => m.concat(m.slice().reverse()));
    return rowsOut.some(m => m.some(Boolean)) ? rowsOut : [Array(COLS).fill(true)];
  }
  // Brick layout for a level (1 based). Pure, so it can be tested.
  function layout(levelNo, rnd, seed) {
    rnd = rnd || (seed === undefined ? Math.random : mulberry(mix(seed, levelNo, 5)));
    const out = [];
    const tough = Math.min(0.5, 0.12 + levelNo * 0.06);
    const pattern = (levelNo - 1) % 4;
    const made = seed === undefined ? null : shapeMask(seed, levelNo);
    const rows = made ? made.length : pattern === 0 ? 5 : 7;
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
      let keep = true;
      if (made) keep = made[r][c];
      else {
        if (pattern === 1) keep = Math.abs(c - 3.5) <= r * 0.62 + 0.5;            // pyramid
        if (pattern === 2) keep = (r + c) % 2 === 0 || r === 0;                    // checker
        if (pattern === 3) keep = rnd() < 0.72;                                    // scattered
      }
      if (!keep) continue;
      const hp = r < 2 && rnd() < tough * 1.6 ? 2 : rnd() < tough * 0.5 ? 2 : 1;
      out.push({ x: BX0 + c * (BW + BGAP), y: BY0 + r * (BH + BGAP), w: BW, h: BH, hp, max: hp, row: r, col: c, hitAt: -9, born: (r * COLS + c) * 0.012 });
    }
    if (!out.length) out.push({ x: BX0, y: BY0, w: BW, h: BH, hp: 1, max: 1, row: 0, col: 0, hitAt: -9, born: 0 });
    return out;
  }

  // Bounce off the paddle: the further from the centre, the steeper the angle (up to 62 degrees).
  function paddleBounce(ballX, paddleX, paddleW) {
    const off = Math.max(-1, Math.min(1, (ballX - paddleX) / (paddleW / 2)));
    const a = off * 62 * Math.PI / 180;
    return { dx: Math.sin(a), dy: -Math.cos(a) };
  }

  Ludus.register({
    id: 'breakout', name: 'Brick Break', aka: 'bricks', tag: 'Arcade', tint: '#e05d8b',
    hint: 'Move the mouse or <kbd>←</kbd><kbd>→</kbd>, click or <kbd>Space</kbd> to launch',
    _rules: { layout, paddleBounce, shapeMask },
    art(ctx, w, h) {
      const cols = 6, gap = 4, bw = (w * 0.8 - gap * (cols - 1)) / cols, bh = h * 0.1;
      const ox = w * 0.1;
      for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) {
        if (r === 2 && (c === 1 || c === 4)) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.95 - r * 0.22})`;
        D.roundRect(ctx, ox + c * (bw + gap), h * 0.14 + r * (bh + gap), bw, bh, bh * 0.4); ctx.fill();
      }
      ctx.fillStyle = '#fff8f2'; D.roundRect(ctx, w * 0.36, h * 0.82, w * 0.28, h * 0.08, h * 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(w * 0.6, h * 0.64, h * 0.11, 0, Math.PI * 2); ctx.fill();
      D.spark(ctx, w * 0.6, h * 0.64, h * 0.08, '#fff8f2', 0.3);
    },
    create(stage, api) {
      const BASE = [250, 310, 375][api.level];
      const view = api.canvas();
      const { ctx, canvas } = view;
      let bricks, balls, drops, particles, lives, levelNo, score, clock, shake, runSeed = newSeed();
      let px, pw, targetX, wideUntil, slowUntil, slowK, hits, squash, over, levelAt, lost = null;
      const held = { left: false, right: false };
      const lay = { s: 1, ox: 0, oy: 0 };

      function reset() {
        runSeed = newSeed(); lives = 3; levelNo = 1; score = 0; clock = 0; shake = 0; over = false;
        px = W / 2; pw = PADDLE_W; targetX = null; wideUntil = 0; slowUntil = 0; slowK = 1; squash = 0;
        particles = []; api.score(0);
        startLevel();
      }
      function startLevel() {
        bricks = layout(levelNo, null, runSeed); drops = []; hits = 0; levelAt = clock;
        bricks.forEach(b => { b.born += clock; });
        serve();
      }
      function serve() { balls = [{ x: px, y: PADDLE_Y - BALL_R - 1, dx: 0, dy: -1, stuck: true, trail: [] }]; }
      const speed = () => Math.min(BASE * 1.6, BASE * (1 + (levelNo - 1) * 0.06) * (1 + Math.min(0.18, hits * 0.006))) * slowK;

      function launch() {
        if (over) return;
        let any = false;
        balls.forEach(b => {
          if (!b.stuck) return;
          const a = (Math.random() - 0.5) * 0.6; b.dx = Math.sin(a); b.dy = -Math.cos(a); b.stuck = false; any = true;
        });
        if (any) api.sfx('jump');
      }

      function normalise(b) {
        if (Math.abs(b.dy) < 0.28) b.dy = b.dy < 0 ? -0.28 : 0.28;
        const m = Math.hypot(b.dx, b.dy); b.dx /= m; b.dy /= m;
      }

      function hitBrick(br, b) {
        br.hp--; br.hitAt = clock; hits++;
        if (br.hp > 0) { api.sfx('tick'); return; }
        bricks.splice(bricks.indexOf(br), 1);
        score += br.max * 10; api.score(score); api.sfx('click');
        const color = ROW_COLORS[br.row % ROW_COLORS.length];
        if (!api.reduceMotion) for (let i = 0; i < 9; i++) {
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
          particles.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, vx: Math.cos(a) * sp + b.dx * 60, vy: Math.sin(a) * sp, life: 1, color, size: 2 + Math.random() * 2.5 });
        }
        if (Math.random() < 0.13 && drops.length < 3) {
          drops.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type: api.pick(Object.keys(POWER)), t: clock });
        }
        if (!bricks.length) levelClear();
      }

      function levelClear() {
        const bonus = 100 * levelNo;
        score += bonus; api.score(score); api.sfx('line');
        levelNo++;
        api.toast(`Level ${levelNo}`);
        balls.forEach(b => { b.stuck = true; });
        api.timeout(() => { if (!over) startLevel(); }, 500);
      }

      function stepBall(b, dist) {
        const steps = Math.max(1, Math.ceil(dist / 3));
        const d = dist / steps;
        for (let i = 0; i < steps; i++) {
          b.x += b.dx * d; b.y += b.dy * d;
          if (b.x < BALL_R) { b.x = BALL_R; b.dx = Math.abs(b.dx); api.sfx('tick'); }
          if (b.x > W - BALL_R) { b.x = W - BALL_R; b.dx = -Math.abs(b.dx); api.sfx('tick'); }
          if (b.y < TOP + BALL_R) { b.y = TOP + BALL_R; b.dy = Math.abs(b.dy); api.sfx('tick'); }
          // paddle
          if (b.dy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H && Math.abs(b.x - px) <= pw / 2 + BALL_R) {
            const v = paddleBounce(b.x, px, pw); b.dx = v.dx; b.dy = v.dy; b.y = PADDLE_Y - BALL_R;
            squash = 1; api.sfx('tap');
          }
          // bricks (one per sub-step)
          for (const br of bricks) {
            if (clock < br.born) continue;
            const cx = Math.max(br.x, Math.min(b.x, br.x + br.w)), cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
            const ox = b.x - cx, oy = b.y - cy;
            if (ox * ox + oy * oy > BALL_R * BALL_R) continue;
            if (ox === 0 && oy === 0) b.dy = -b.dy;
            else if (Math.abs(ox) > Math.abs(oy)) { b.dx = Math.sign(ox) * Math.abs(b.dx); b.x = cx + Math.sign(ox) * BALL_R; }
            else { b.dy = Math.sign(oy) * Math.abs(b.dy); b.y = cy + Math.sign(oy) * BALL_R; }
            normalise(b);
            hitBrick(br, b);
            break;
          }
          if (b.y > H + 30) { b.dead = true; return; }
          if (b.y > PADDLE_Y + PADDLE_H + BALL_R && !b.missX) b.missX = b.x;   // where it slipped past the paddle
          if (!bricks.length) return;
        }
      }

      function loseBall(missX) {
        lives--; api.sfx('hit'); if (!api.reduceMotion) shake = 1;
        wideUntil = 0; slowUntil = 0; drops = [];
        if (lives <= 0) {
          over = true; lost = { x: missX === undefined ? px : missX, t: clock };
          api.timeout(() => api.over({ score, title: 'Game over', won: false, message: `Reached level ${levelNo}` }), 700);
          return;
        }
        serve();
      }

      function catchDrop(d) {
        api.sfx('power');
        if (d.type === 'wide') wideUntil = clock + 12;
        if (d.type === 'slow') slowUntil = clock + 10;
        if (d.type === 'multi') {
          const src = balls.find(b => !b.stuck) || balls[0];
          if (src.stuck) launch();
          const add = [];
          [-0.4, 0.4].forEach(a => {
            if (balls.length + add.length >= 6) return;
            const c = Math.cos(a), s = Math.sin(a);
            const nb = { x: src.x, y: src.y, dx: src.dx * c - src.dy * s, dy: src.dx * s + src.dy * c, stuck: false, trail: [] };
            normalise(nb); add.push(nb);
          });
          balls.push(...add);
        }
      }

      function update(dt) {
        clock += dt;
        // paddle
        const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        if (dir) { px += dir * 520 * dt; targetX = null; }
        else if (targetX !== null) px += (targetX - px) * Math.min(1, dt * 22);
        const wantW = clock < wideUntil ? PADDLE_W * 1.5 : PADDLE_W;
        pw += (wantW - pw) * Math.min(1, dt * 10);
        px = Math.max(pw / 2, Math.min(W - pw / 2, px));
        slowK += ((clock < slowUntil ? 0.68 : 1) - slowK) * Math.min(1, dt * 4);
        squash = Math.max(0, squash - dt * 6);
        if (shake > 0) shake = Math.max(0, shake - dt * 3);

        if (!over) {
          balls.forEach(b => {
            if (b.stuck) { b.x = px; b.y = PADDLE_Y - BALL_R - 1; return; }
            b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 6) b.trail.pop();
            if (bricks.length) stepBall(b, speed() * dt);
          });
          const alive = balls.filter(b => !b.dead);
          if (alive.length !== balls.length) {
            const last = balls.find(b => b.dead);
            balls = alive; if (!balls.length) loseBall(last && last.missX);
          }
          drops.forEach(d => {
            d.y += 120 * dt;
            if (d.y + 7 >= PADDLE_Y && d.y - 7 <= PADDLE_Y + PADDLE_H && Math.abs(d.x - px) <= pw / 2 + 15) { d.done = true; catchDrop(d); }
            if (d.y > H + 20) d.done = true;
          });
          drops = drops.filter(d => !d.done);
        }
        particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt * 1.8; });
        particles = particles.filter(p => p.life > 0);
      }

      // ---------- input ----------
      function toLogical(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - lay.ox) / lay.s, y: (e.clientY - r.top - lay.oy) / lay.s };
      }
      api.on(canvas, 'pointermove', e => { targetX = toLogical(e).x; });
      api.on(canvas, 'pointerdown', e => { targetX = toLogical(e).x; if (e.button === 0) launch(); });
      api.keys(e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') held.left = true;
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') held.right = true;
        else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') launch();
      });
      api.keysUp(e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') held.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') held.right = false;
      });
      api.on(window, 'blur', () => { held.left = held.right = false; });

      // ---------- render ----------
      function drawPower(type, x, y, color) {
        ctx.fillStyle = color; D.roundRect(ctx, x - 15, y - 7, 30, 14, 7); ctx.fill();
        ctx.strokeStyle = '#fff8f2'; ctx.fillStyle = '#fff8f2'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        if (type === 'wide') {
          ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
          ctx.moveTo(x - 8, y); ctx.lineTo(x - 5, y - 3); ctx.moveTo(x - 8, y); ctx.lineTo(x - 5, y + 3);
          ctx.moveTo(x + 8, y); ctx.lineTo(x + 5, y - 3); ctx.moveTo(x + 8, y); ctx.lineTo(x + 5, y + 3); ctx.stroke();
        } else if (type === 'multi') {
          [-6, 0, 6].forEach(o => { ctx.beginPath(); ctx.arc(x + o, y, 2.2, 0, Math.PI * 2); ctx.fill(); });
        } else {
          ctx.beginPath(); ctx.arc(x, y, 4.3, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 2.6); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 1); ctx.stroke();
        }
      }

      function render(t) {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        lay.s = Math.min(w / W, h / H); lay.ox = (w - W * lay.s) / 2; lay.oy = (h - H * lay.s) / 2;
        ctx.save();
        ctx.translate(lay.ox, lay.oy); ctx.scale(lay.s, lay.s);
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

        // HUD: lives as sparks, level on the right
        for (let i = 0; i < 3; i++) D.spark(ctx, 20 + i * 20, 17, 6.5, i < lives ? col.accent : col.line, 0);
        D.text(ctx, `Level ${levelNo}`, W - 14, 17, 13, col.ink2, 700, 'right');
        const fx = [];
        if (clock < wideUntil) fx.push(['wide', wideUntil - clock, 12]);
        if (clock < slowUntil) fx.push(['slow', slowUntil - clock, 10]);
        fx.forEach(([type, left, total], i) => {
          const x = W / 2 + (i - (fx.length - 1) / 2) * 40;
          ctx.globalAlpha = left < 2 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 8)) : 1;
          drawPower(type, x, 17, POWER[type].color);
          ctx.globalAlpha = 1;
          ctx.fillStyle = POWER[type].color; ctx.fillRect(x - 13, 27, 26 * (left / total), 2);
        });
        ctx.fillStyle = col.line; ctx.fillRect(10, TOP - 4, W - 20, 1);

        // bricks
        bricks.forEach(br => {
          const k = Math.min(1, Math.max(0, (clock - br.born) / 0.35));
          if (k <= 0) return;
          const e = api.reduceMotion ? 1 : D.ease.outBack(k);
          const base = ROW_COLORS[br.row % ROW_COLORS.length];
          const tough = br.hp > 1;
          ctx.save();
          ctx.translate(br.x + br.w / 2, br.y + br.h / 2 - (1 - Math.min(1, e)) * 24);
          ctx.globalAlpha = Math.min(1, k * 2);
          const flash = clock - br.hitAt < 0.12;
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; D.roundRect(ctx, -br.w / 2, -br.h / 2 + 2, br.w, br.h, 6); ctx.fill();
          ctx.fillStyle = flash ? '#fff8f2' : tough ? shade(base, -0.18) : base;
          D.roundRect(ctx, -br.w / 2, -br.h / 2, br.w, br.h, 6); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.22)'; D.roundRect(ctx, -br.w / 2 + 3, -br.h / 2 + 2, br.w - 6, 4, 2); ctx.fill();
          if (tough) { ctx.strokeStyle = 'rgba(255,248,242,0.75)'; ctx.lineWidth = 1.5; D.roundRect(ctx, -br.w / 2 + 3, -br.h / 2 + 3, br.w - 6, br.h - 6, 4); ctx.stroke(); }
          else if (br.max > 1) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -br.h / 2 + 2); ctx.lineTo(1, 0); ctx.lineTo(-2, br.h / 2 - 2); ctx.stroke(); }
          ctx.restore();
        });

        drops.forEach(d => drawPower(d.type, d.x, d.y, POWER[d.type].color));

        particles.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        // paddle with a little squash on hits
        const sq = api.reduceMotion ? 0 : squash;
        const ppw = pw * (1 + sq * 0.08), pph = PADDLE_H * (1 - sq * 0.25);
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.15)';
        D.roundRect(ctx, px - ppw / 2, PADDLE_Y + 3, ppw, pph, pph / 2); ctx.fill();
        ctx.fillStyle = lost ? col.ink3 : col.ink; D.roundRect(ctx, px - ppw / 2, PADDLE_Y + (PADDLE_H - pph), ppw, pph, pph / 2); ctx.fill();
        ctx.fillStyle = col.accent; D.roundRect(ctx, px - 9, PADDLE_Y + (PADDLE_H - pph) + pph / 2 - 1.5, 18, 3, 1.5); ctx.fill();

        // balls: a glowing disc with the spark inside
        balls.forEach(b => {
          if (!api.reduceMotion) b.trail.forEach((q, i) => {
            ctx.globalAlpha = 0.18 * (1 - i / b.trail.length); ctx.fillStyle = col.accent;
            ctx.beginPath(); ctx.arc(q.x, q.y, BALL_R * (1 - i * 0.1), 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 0.18; ctx.fillStyle = col.accent; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R * 1.9, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
          D.spark(ctx, b.x, b.y, BALL_R * 0.78, '#fff8f2', api.reduceMotion ? 0 : t * 4);
        });

        // last ball lost: the paddle dims and a red ring marks where the ball got past
        if (lost) {
          const k = api.reduceMotion ? 1 : Math.min(1, (clock - lost.t) / 0.3);
          const y = PADDLE_Y + PADDLE_H / 2;
          ctx.strokeStyle = col.bad; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(lost.x, y, 10 + 12 * D.ease.outCubic(k), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(lost.x, y - 70); ctx.lineTo(lost.x, y - 24); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          ctx.fillStyle = col.bad; ctx.beginPath();
          ctx.moveTo(lost.x - 6, y - 30); ctx.lineTo(lost.x + 6, y - 30); ctx.lineTo(lost.x, y - 22); ctx.closePath(); ctx.fill();
        }
        if (!over && balls.some(b => b.stuck) && bricks.length && clock - levelAt > 0.3) {
          ctx.globalAlpha = api.reduceMotion ? 1 : 0.65 + Math.sin(t * 3) * 0.25;
          D.text(ctx, 'Click or Space to launch', W / 2, H * 0.66, 13, col.ink2, 650);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      function restore(v) {
        try {
          if (!v || !Array.isArray(v.bricks) || !v.bricks.length || !Array.isArray(v.balls) || !v.balls.length) return false;
          if (!(v.lives >= 1 && v.lives <= 3) || !(v.levelNo >= 1) || !Number.isFinite(v.score)) return false;
          const num = o => Object.values(o).every(n => typeof n !== 'number' || Number.isFinite(n));
          if (!v.bricks.every(num) || !v.balls.every(num)) return false;
          if (Number.isInteger(v.seed)) runSeed = v.seed;
          lives = v.lives; levelNo = v.levelNo; score = v.score; clock = Number(v.clock) || 0; hits = v.hits | 0;
          px = Number(v.px) || W / 2; pw = PADDLE_W; wideUntil = Number(v.wideUntil) || 0; slowUntil = Number(v.slowUntil) || 0;
          slowK = clock < slowUntil ? 0.68 : 1; levelAt = clock - 1;
          bricks = v.bricks.map(b => ({ x: b.x, y: b.y, w: BW, h: BH, hp: b.hp, max: b.max, row: b.row, col: b.col, hitAt: -9, born: -9 }));
          balls = v.balls.map(b => ({ x: b.x, y: b.y, dx: b.dx, dy: b.dy, stuck: !!b.stuck, trail: [] }));
          drops = (v.drops || []).filter(d => POWER[d.type]).map(d => ({ x: d.x, y: d.y, type: d.type, t: clock }));
          api.score(score);
          return true;
        } catch (e) { return false; }
      }
      reset();
      if (window.ludusDebug) window.ludusDebug.breakout = () => ({ seed: runSeed, levelNo, rows: bricks.map(b => b.row * 8 + b.col).join(',') });
      if (api.saved && !restore(api.saved)) reset();
      render(0);
      api.loop((dt, t) => { update(dt); render(t); });
      return {
        save() {
          if (over || !bricks.length) return null;
          if (score === 0 && lives === 3 && levelNo === 1 && balls.every(b => b.stuck)) return null;
          const r = n => Math.round(n * 1000) / 1000;
          return {
            seed: runSeed, lives, levelNo, score, clock: r(clock), hits, px: r(px), wideUntil: r(wideUntil), slowUntil: r(slowUntil),
            bricks: bricks.map(b => ({ x: b.x, y: b.y, hp: b.hp, max: b.max, row: b.row, col: b.col })),
            balls: balls.map(b => ({ x: r(b.x), y: r(b.y), dx: r(b.dx), dy: r(b.dy), stuck: b.stuck })),
            drops: drops.map(d => ({ x: r(d.x), y: r(d.y), type: d.type }))
          };
        }
      };
    }
  });
})();
