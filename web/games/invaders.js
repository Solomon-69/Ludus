/* Sky Raiders: rows of raiders march side to side and creep down. Shoot them from your spark ship, hide behind the shields. */
(function () {
  const D = Ludus.draw;
  const W = 400, H = 520, TOP = 34;
  const PY = H - 34, PW = 34;                     // player ship centre y and width
  const COLS = 8, GX = 38, GY = 30;               // formation grid spacing
  const SH_Y = H - 112, SH_C = 4.5, SH_W = 12, SH_H = 7;   // shields: cell size and cells per shield
  const KINDS = [
    { pts: 30, color: '#9b6dd6' }, { pts: 20, color: '#3f8fb5' }, { pts: 20, color: '#3f8fb5' },
    { pts: 10, color: '#4f9d69' }, { pts: 10, color: '#4f9d69' }
  ];
  const DIFF = [
    { rows: 4, march: 20, shots: 2, shotSpeed: 170, fireEvery: 1.3, myShots: 2 },
    { rows: 5, march: 26, shots: 3, shotSpeed: 210, fireEvery: 0.95, myShots: 1 },
    { rows: 5, march: 34, shots: 4, shotSpeed: 250, fireEvery: 0.7, myShots: 1 }
  ];

  function shieldShape() {
    // a rounded bunker with an arch cut underneath
    const cells = [];
    for (let y = 0; y < SH_H; y++) for (let x = 0; x < SH_W; x++) {
      let on = true;
      if (y === 0 && (x < 2 || x > SH_W - 3)) on = false;
      if (y === 1 && (x < 1 || x > SH_W - 2)) on = false;
      if (y >= SH_H - 3 && x >= 4 && x <= SH_W - 5) on = y === SH_H - 3 && (x === 4 || x === SH_W - 5);
      cells.push(on ? 1 : 0);
    }
    return cells;
  }

  function drawRaider(ctx, kind, x, y, frame, color) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
    if (kind === 0) {               // scout: a little winged dome
      ctx.beginPath(); ctx.arc(0, 1, 8, Math.PI, 0); ctx.lineTo(8, 4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
      const f = frame ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-13, 2 + f * 4); ctx.moveTo(8, 2); ctx.lineTo(13, 2 + f * 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-4, 8); ctx.moveTo(3, 4); ctx.lineTo(4, 8); ctx.stroke();
    } else if (kind <= 2) {         // drone: rounded box with antennae
      D.roundRect(ctx, -10, -6, 20, 13, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(-7, -11); ctx.moveTo(5, -6); ctx.lineTo(7, -11); ctx.stroke();
      const f = frame ? 3 : -3;
      ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-7 - f, 11); ctx.moveTo(7, 7); ctx.lineTo(7 + f, 11); ctx.stroke();
    } else {                        // blob: wide squishy body with feet
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8 - (frame ? 1 : 0), 0, 0, Math.PI * 2); ctx.fill();
      const f = frame ? 2 : 0;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 7 + (i ? f * i : 0), 8, 2.4, 0, Math.PI * 2); ctx.fill(); }
    }
    // eyes
    ctx.fillStyle = '#fffaf2';
    ctx.beginPath(); ctx.arc(-3.6, kind === 0 ? -2 : 0, 2.3, 0, Math.PI * 2); ctx.arc(3.6, kind === 0 ? -2 : 0, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2520';
    ctx.beginPath(); ctx.arc(-3.3, kind === 0 ? -1.6 : 0.4, 1.1, 0, Math.PI * 2); ctx.arc(3.9, kind === 0 ? -1.6 : 0.4, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawShip(ctx, x, y, col, broken, t) {
    ctx.save(); ctx.translate(x, y);
    const body = broken ? col.ink3 : col.ink;
    ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.14)';
    D.roundRect(ctx, -PW / 2, 2, PW, 10, 5); ctx.fill();
    ctx.fillStyle = body;
    D.roundRect(ctx, -PW / 2, -2, PW, 11, 5.5); ctx.fill();
    D.roundRect(ctx, -5, -10, 10, 10, 4); ctx.fill();
    if (!broken) D.spark(ctx, 0, -12, 8, col.accent, t * 3);
    else { ctx.strokeStyle = col.surface || '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-2, 4); ctx.lineTo(3, -1); ctx.lineTo(9, 6); ctx.stroke(); }
    ctx.restore();
  }

  Ludus.register({
    id: 'skyraiders', name: 'Sky Raiders', tag: 'Arcade', tint: '#5b6ee1',
    hint: '<kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> fire · or move the mouse and click',
    art(ctx, w, h) {
      const s = Math.min(w, h) / 120;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        ctx.save(); ctx.translate(w / 2 + (c - 1.5) * 24 * s, h * 0.28 + r * 20 * s); ctx.scale(s, s);
        drawRaider(ctx, r ? 3 : 1, 0, 0, c % 2, 'rgba(255,255,255,0.85)'); ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(w / 2 - 1, h * 0.55, 2.5, 10 * s);
      ctx.fillStyle = '#fffaf2'; D.roundRect(ctx, w / 2 - 15 * s, h * 0.8, 30 * s, 9 * s, 4 * s); ctx.fill();
      D.spark(ctx, w / 2, h * 0.76, 7 * s, '#fffaf2', 0);
    },
    create(stage, api) {
      const cfg = DIFF[api.level];
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx, canvas } = view;
      const lay = { s: 1, ox: 0, oy: 0 };
      let wave, score, lives, px, fx, fy, dir, alive, shields, shots, bombs, parts, clock, fireT, frameT, frame, hitAt, state, waveAt, bonus, bonusT, deadAt;
      const held = { l: false, r: false };
      let targetX = null;
      const rows = cfg.rows, total = rows * COLS;

      function buildShields() { shields = [0, 1, 2, 3].map(i => ({ x: 34 + i * ((W - 68 - SH_W * SH_C) / 3), cells: shieldShape() })); }
      function startWave(n) {
        wave = n; alive = Array(total).fill(1);
        fx = 26; fy = TOP + 40 + Math.min(5, n - 1) * 10; dir = 1;
        shots = []; bombs = []; fireT = cfg.fireEvery; waveAt = clock; state = 'play'; bonus = null; bonusT = 14 + Math.random() * 8;
        buildShields();
      }
      function reset() {
        score = 0; lives = 3; px = W / 2; parts = []; clock = 0; frameT = 0; frame = 0; hitAt = -9; deadAt = -1;
        startWave(1); api.score(0);
      }
      function enemyPos(i) { return { x: fx + (i % COLS) * GX, y: fy + Math.floor(i / COLS) * GY }; }
      function aliveCount() { return alive.reduce((a, b) => a + b, 0); }

      function fire() {
        if (state !== 'play') return;
        if (shots.length >= cfg.myShots) return;
        shots.push({ x: px, y: PY - 18 }); api.sfx('tap');
      }
      function burst(x, y, color, n) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color }); }
      }
      function chipShield(x, y, radius) {
        for (const sh of shields) {
          const cx = Math.floor((x - sh.x) / SH_C), cy = Math.floor((y - SH_Y) / SH_C);
          if (cx < -1 || cx > SH_W || cy < -1 || cy > SH_H) continue;
          let hit = false;
          if (cx >= 0 && cx < SH_W && cy >= 0 && cy < SH_H && sh.cells[cy * SH_W + cx]) hit = true;
          if (!hit) continue;
          for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= SH_W || ny >= SH_H) continue;
            if (Math.abs(dx) + Math.abs(dy) <= radius && (dx === 0 && dy === 0 || Math.random() < 0.7)) sh.cells[ny * SH_W + nx] = 0;
          }
          return true;
        }
        return false;
      }
      // a raider body wipes out every shield cell it overlaps
      function eraseBox(x0, y0, x1, y1) {
        shields.forEach(sh => sh.cells.forEach((on, j) => {
          if (!on) return;
          const cx = sh.x + (j % SH_W) * SH_C, cy = SH_Y + Math.floor(j / SH_W) * SH_C;
          if (cx + SH_C > x0 && cx < x1 && cy + SH_C > y0 && cy < y1) sh.cells[j] = 0;
        }));
      }
      function loseLife() {
        lives--; hitAt = clock; bombs = []; api.sfx('boom'); burst(px, PY, api.colors().accent, 18);
        if (lives <= 0) gameOver('Shot down');
      }
      function gameOver(title) {
        if (state === 'over') return;
        state = 'over'; deadAt = clock; lives = Math.max(0, lives);
        api.timeout(() => api.over({ score, title, won: false, message: `Reached wave ${wave}` }), 900);
      }

      function update(dt) {
        clock += dt;
        parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt * 1.6; });
        parts = parts.filter(p => p.life > 0);
        if (state === 'over') return;
        // player
        const d = (held.r ? 1 : 0) - (held.l ? 1 : 0);
        if (d) { px += d * 230 * dt; targetX = null; } else if (targetX !== null) px += (targetX - px) * Math.min(1, dt * 14);
        px = Math.max(PW / 2 + 6, Math.min(W - PW / 2 - 6, px));
        if (state === 'clear') { if (clock - waveAt > 1.3) startWave(wave + 1); moveShots(dt); return; }

        // formation march: faster as raiders fall
        const left = aliveCount();
        const speed = (cfg.march + wave * 3) * (1 + (1 - left / total) * 3.2);
        let minX = 1e9, maxX = -1e9, maxY = -1e9;
        alive.forEach((a, i) => { if (!a) return; const p = enemyPos(i); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
        fx += dir * speed * dt;
        if ((dir > 0 && maxX + dir * speed * dt > W - 16) || (dir < 0 && minX + dir * speed * dt < 16)) { dir = -dir; fy += 12; api.sfx('tick'); }
        frameT += dt * (1.6 + (1 - left / total) * 5); if (frameT > 1) { frameT = 0; frame ^= 1; }
        // raiders crush shields they touch, and win if they reach you
        alive.forEach((a, i) => { if (!a) return; const p = enemyPos(i); if (p.y + 11 > SH_Y) eraseBox(p.x - 13, p.y - 11, p.x + 13, p.y + 11); });
        if (maxY + 10 >= PY - 14) { loseLifeQuiet(); return; }

        // enemy fire from the lowest raider in a random column
        fireT -= dt;
        if (fireT <= 0 && bombs.length < cfg.shots) {
          fireT = cfg.fireEvery * (0.6 + Math.random() * 0.8);
          const cols = [];
          for (let c = 0; c < COLS; c++) for (let r = rows - 1; r >= 0; r--) if (alive[r * COLS + c]) { cols.push(r * COLS + c); break; }
          // aim a bit: prefer columns near the player
          cols.sort((a, b) => Math.abs(enemyPos(a).x - px) - Math.abs(enemyPos(b).x - px));
          const pick = cols[Math.min(cols.length - 1, Math.floor(Math.random() * Math.min(cols.length, 3 - api.level + 2)))];
          if (pick !== undefined) { const p = enemyPos(pick); bombs.push({ x: p.x, y: p.y + 10, wob: Math.random() * 6 }); }
        }
        // bonus kite across the top
        bonusT -= dt;
        if (!bonus && bonusT <= 0) { const fromLeft = Math.random() < 0.5; bonus = { x: fromLeft ? -20 : W + 20, v: fromLeft ? 70 : -70 }; }
        if (bonus) { bonus.x += bonus.v * dt; if (bonus.x < -30 || bonus.x > W + 30) { bonus = null; bonusT = 16 + Math.random() * 10; } }

        moveShots(dt);
        bombs.forEach(b => { b.y += cfg.shotSpeed * dt; });
        bombs = bombs.filter(b => {
          if (b.y > H) return false;
          if (b.y > SH_Y - 4 && b.y < SH_Y + SH_H * SH_C + 4 && chipShield(b.x, b.y + 4, 1)) return false;
          const inv = clock - hitAt < 1.5;
          if (!inv && Math.abs(b.x - px) < PW / 2 && b.y > PY - 12 && b.y < PY + 10) { loseLife(); return false; }
          return true;
        });
      }
      function loseLifeQuiet() { lives = 0; api.sfx('boom'); burst(px, PY, api.colors().accent, 18); gameOver('They landed'); }

      function moveShots(dt) {
        shots.forEach(s => { s.y -= 470 * dt; });
        shots = shots.filter(s => {
          if (s.y < TOP) return false;
          if (s.y > SH_Y - 4 && s.y < SH_Y + SH_H * SH_C + 4 && chipShield(s.x, s.y, 1)) return false;
          for (const b of bombs) if (Math.abs(b.x - s.x) < 5 && Math.abs(b.y - s.y) < 10) { b.y = H + 99; burst(s.x, s.y, '#e0a526', 5); return false; }
          if (bonus && Math.abs(bonus.x - s.x) < 16 && Math.abs(s.y - (TOP + 14)) < 10) {
            score += 100 * (1 + api.level); api.score(score); burst(bonus.x, TOP + 14, '#e05d8b', 14); api.sfx('power'); bonus = null; bonusT = 18; return false;
          }
          if (state !== 'play') return true;
          for (let i = 0; i < total; i++) {
            if (!alive[i]) continue;
            const p = enemyPos(i);
            if (Math.abs(p.x - s.x) < 13 && Math.abs(p.y - s.y) < 11) {
              alive[i] = 0; const k = KINDS[Math.floor(i / COLS) + (5 - rows)];
              score += k.pts; api.score(score); api.sfx('click'); burst(p.x, p.y, k.color, 10);
              if (!aliveCount()) { state = 'clear'; waveAt = clock; bombs = []; api.sfx('line'); api.toast(`Wave ${wave + 1}`); }
              return false;
            }
          }
          return true;
        });
      }

      // ---------- input ----------
      const toX = e => { const r = canvas.getBoundingClientRect(); return (e.clientX - r.left - lay.ox) / lay.s; };
      api.on(canvas, 'pointermove', e => { targetX = toX(e); });
      api.on(canvas, 'pointerdown', e => { targetX = toX(e); if (e.button === 0) fire(); });
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = true;
        else if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && !e.repeat) fire();
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = false;
      });
      api.on(window, 'blur', () => { held.l = held.r = false; });

      // ---------- render ----------
      function render() {
        const col = api.colors(), { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        lay.s = Math.min(w / W, h / H); lay.ox = (w - W * lay.s) / 2; lay.oy = (h - H * lay.s) / 2;
        ctx.save(); ctx.translate(lay.ox, lay.oy); ctx.scale(lay.s, lay.s);
        // soft stars
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.18)' : 'rgba(120,90,50,0.13)';
        for (let i = 0; i < 26; i++) { const sx = (i * 97) % W, sy = TOP + ((i * 61 + clock * (6 + (i % 3) * 4)) % (H - TOP - 60)); ctx.beginPath(); ctx.arc(sx, sy, 1 + (i % 3) * 0.4, 0, Math.PI * 2); ctx.fill(); }
        // HUD
        for (let i = 0; i < 3; i++) D.spark(ctx, 18 + i * 20, 16, 6.5, i < lives ? col.accent : col.line, 0);
        D.text(ctx, `Wave ${wave}`, W - 14, 16, 13, col.ink2, 700, 'right');
        ctx.fillStyle = col.line; ctx.fillRect(10, TOP - 4, W - 20, 1);
        // bonus kite
        if (bonus) {
          ctx.save(); ctx.translate(bonus.x, TOP + 14); ctx.rotate(Math.sin(clock * 6) * 0.15);
          ctx.fillStyle = '#e05d8b'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(13, 0); ctx.lineTo(0, 9); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
          D.spark(ctx, 0, 0, 4.5, '#fffaf2', clock * 4); ctx.restore();
        }
        // raiders (dimmed once the run is over)
        const fade = state === 'over' ? 0.55 : 1;
        ctx.globalAlpha = fade;
        alive.forEach((a, i) => {
          if (!a) return;
          const p = enemyPos(i), row = Math.floor(i / COLS) + (5 - rows);
          const born = api.reduceMotion ? 1 : Math.min(1, (clock - waveAt - (i % COLS) * 0.03 - Math.floor(i / COLS) * 0.05) / 0.3);
          if (born <= 0) return;
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(born, born);
          drawRaider(ctx, row, 0, 0, frame, KINDS[row].color);
          ctx.restore();
        });
        ctx.globalAlpha = 1;
        // shields
        ctx.fillStyle = col.dark ? '#b48a5e' : '#d2a774';
        shields.forEach(sh => sh.cells.forEach((on, j) => {
          if (!on) return;
          ctx.fillRect(sh.x + (j % SH_W) * SH_C, SH_Y + Math.floor(j / SH_W) * SH_C, SH_C + 0.8, SH_C + 0.8);
        }));
        // shots
        ctx.fillStyle = col.accent;
        shots.forEach(s => { D.roundRect(ctx, s.x - 1.8, s.y - 7, 3.6, 12, 1.8); ctx.fill(); });
        bombs.forEach(b => {
          ctx.strokeStyle = col.dark ? '#f0c060' : '#c4633f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
          ctx.beginPath(); for (let k = 0; k <= 4; k++) { const yy = b.y - 10 + k * 3, xx = b.x + Math.sin(b.wob + clock * 18 + k) * 2.2; ctx[k ? 'lineTo' : 'moveTo'](xx, yy); } ctx.stroke();
        });
        // player (blinks while safe after a hit)
        const inv = clock - hitAt < 1.5 && state !== 'over';
        ctx.globalAlpha = inv && Math.floor(clock * 8) % 2 === 0 ? 0.35 : 1;
        drawShip(ctx, px, PY, col, state === 'over', clock);
        ctx.globalAlpha = 1;
        parts.forEach(p => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); });
        ctx.globalAlpha = 1;
        if (state === 'clear') D.text(ctx, `Wave ${wave} cleared`, W / 2, H * 0.42, 18, col.ink, 750);
        if (state === 'over') D.text(ctx, `${score} points`, W / 2, TOP + 14, 13, col.ink2, 700);
        ctx.restore();
      }

      // ---------- save / restore ----------
      function restore(s) {
        if (!s || s.v !== 1 || s.rows !== rows || typeof s.alive !== 'string' || s.alive.length !== total || !Array.isArray(s.shields) || s.shields.length !== 4) return false;
        if (!(s.lives >= 1 && s.lives <= 3) || !(s.wave >= 1)) return false;
        reset();
        wave = s.wave | 0; score = s.score | 0; lives = s.lives | 0; px = +s.px || W / 2;
        fx = +s.fx; fy = +s.fy; dir = s.dir === -1 ? -1 : 1;
        alive = s.alive.split('').map(Number);
        shields.forEach((sh, i) => { if (typeof s.shields[i] === 'string' && s.shields[i].length === SH_W * SH_H) sh.cells = s.shields[i].split('').map(Number); });
        if (!aliveCount()) startWave(wave + 1);
        waveAt = -9;
        return true;
      }
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) reset();
      api.score(score);
      api.loop(dt => { update(dt); render(); });
      return {
        save() {
          if (state === 'over' || (!restored && !api.touched)) return null;   // nothing played yet
          return { v: 1, rows, wave, score, lives, px: Math.round(px), fx: Math.round(fx * 10) / 10, fy, dir, alive: alive.join(''), shields: shields.map(sh => sh.cells.join('')) };
        }
      };
    }
  });
})();
