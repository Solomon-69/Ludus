/* Drift: steer the spark ship through a field of drifting rocks. Shots split big rocks into smaller ones. The screen wraps at every edge. */
(function () {
  const D = Ludus.draw;
  const WW = 400;                                    // world width; height follows the stage shape
  const SIZES = [0, 11, 20, 34];                     // radius by size 1..3
  const POINTS = [0, 100, 50, 20];
  const DIFF = [
    { speed: 26, extra: 0, turn: 3.6, shots: 5, thrust: 210 },
    { speed: 36, extra: 1, turn: 4.0, shots: 4, thrust: 230 },
    { speed: 48, extra: 2, turn: 4.4, shots: 4, thrust: 250 }
  ];
  const SHIP_R = 10, SHOT_SPEED = 390, SHOT_LIFE = 0.85, SAFE_T = 2.2;

  // deterministic wobbly outline from a seed, so a saved rock looks the same after a restore
  function outline(seed) {
    let s = seed % 2147483647 || 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = 9 + Math.floor(rnd() * 4), pts = [];
    for (let i = 0; i < n; i++) pts.push({ a: (i / n) * Math.PI * 2, r: 0.78 + rnd() * 0.3 });
    const dots = [0, 1, 2].map(() => ({ a: rnd() * Math.PI * 2, d: rnd() * 0.5, r: 0.12 + rnd() * 0.1 }));
    return { pts, dots };
  }

  Ludus.register({
    id: 'drift', name: 'Asteroids', aka: 'Drift', tag: 'Arcade', tint: '#6b7a8f',
    hint: '<kbd>←</kbd><kbd>→</kbd> turn · <kbd>↑</kbd> thrust · <kbd>Space</kbd> fire',
    art(ctx, w, h) {
      const rock = (x, y, r, seed) => {
        const o = outline(seed); ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); o.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(p.a) * r * p.r, y + Math.sin(p.a) * r * p.r)); ctx.closePath(); ctx.fill();
      };
      const s = Math.min(w, h);
      rock(w * 0.72, h * 0.32, s * 0.2, 7); rock(w * 0.24, h * 0.7, s * 0.12, 3); rock(w * 0.82, h * 0.76, s * 0.08, 11);
      ctx.save(); ctx.translate(w * 0.4, h * 0.46); ctx.rotate(-0.5);
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.moveTo(s * 0.12, 0); ctx.lineTo(-s * 0.08, -s * 0.08); ctx.lineTo(-s * 0.04, 0); ctx.lineTo(-s * 0.08, s * 0.08); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; [0.52, 0.58].forEach(t => { ctx.beginPath(); ctx.arc(w * t, h * (0.46 - (t - 0.4) * 0.55), 2, 0, Math.PI * 2); ctx.fill(); });
    },
    create(stage, api) {
      const cfg = DIFF[api.level];
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx } = view;
      let WH = 500;
      let ship, rocks, shots, parts, score, lives, wave, clock, state, safeUntil, respawnAt, waveAt, fireCd, deadAt, seedN = 1;
      const held = { l: false, r: false, up: false, fire: false };

      const worldH = () => Math.max(300, Math.round(WW * view.h / Math.max(1, view.w)));
      function wrap(o) { o.x = ((o.x % WW) + WW) % WW; o.y = ((o.y % WH) + WH) % WH; }
      function makeRock(x, y, size, ang) {
        const sp = (cfg.speed + wave * 4) * (1 + (3 - size) * 0.45) * (0.7 + Math.random() * 0.6);
        const a = ang === undefined ? Math.random() * Math.PI * 2 : ang;
        return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, seed: (seedN++ * 7919 + Math.floor(Math.random() * 1e6)) % 2147483646 + 1, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 1.2 };
      }
      function startWave(n) {
        wave = n; rocks = []; waveAt = clock;
        const count = Math.min(10, 2 + n + cfg.extra);
        for (let i = 0; i < count; i++) {
          // spawn along the edges, away from the ship
          let x, y, tries = 0;
          do { const edge = Math.random() < 0.5; x = edge ? Math.random() * WW : (Math.random() < 0.5 ? 0 : WW - 1); y = edge ? (Math.random() < 0.5 ? 0 : WH - 1) : Math.random() * WH; tries++; }
          while (Math.hypot(x - ship.x, y - ship.y) < 120 && tries < 20);
          rocks.push(makeRock(x, y, 3));
        }
        safeUntil = Math.max(safeUntil, clock + 1.2);
      }
      function newShip() { return { x: WW / 2, y: WH / 2, vx: 0, vy: 0, a: -Math.PI / 2, flame: 0 }; }
      function reset() {
        WH = worldH(); clock = 0; score = 0; lives = 3; state = 'play'; shots = []; parts = []; fireCd = 0; deadAt = -1; respawnAt = -1;
        ship = newShip(); safeUntil = SAFE_T; startWave(1); api.score(0);
      }

      function burst(x, y, color, n, speed) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (speed || 90) * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, age: 0, color }); }
      }
      function fire() {
        if (state !== 'play' || respawnAt >= 0 || fireCd > 0 || shots.length >= cfg.shots) return;
        const c = Math.cos(ship.a), s = Math.sin(ship.a);
        shots.push({ x: ship.x + c * 14, y: ship.y + s * 14, vx: c * SHOT_SPEED + ship.vx, vy: s * SHOT_SPEED + ship.vy, life: SHOT_LIFE });
        fireCd = 0.14; api.sfx('tap');
      }
      function splitRock(i, shotVx, shotVy) {
        const r = rocks[i]; rocks.splice(i, 1);
        score += POINTS[r.size]; api.score(score);
        burst(r.x, r.y, api.colors().ink3, 6 + r.size * 3, 60 + r.size * 20);
        api.sfx(r.size === 1 ? 'click' : 'drop');
        if (r.size > 1) {
          const base = Math.atan2(shotVy, shotVx);
          [-0.7, 0.7].forEach(off => { const n = makeRock(r.x, r.y, r.size - 1, base + off + (Math.random() - 0.5) * 0.4); rocks.push(n); });
        }
        if (!rocks.length) { api.sfx('line'); api.toast(`Wave ${wave + 1}`); api.timeout(() => { if (state === 'play') startWave(wave + 1); }, 1200); }
      }
      function crash() {
        lives--; api.sfx('boom'); burst(ship.x, ship.y, api.colors().accent, 22, 140);
        if (lives <= 0) {
          state = 'over'; deadAt = clock;
          api.timeout(() => api.over({ score, title: 'Ship lost', won: false, message: `Reached wave ${wave}` }), 1000);
          return;
        }
        respawnAt = clock + 1.1;
      }
      // dist on a wrapping field
      function wd(ax, ay, bx, by) {
        let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
        dx = Math.min(dx, WW - dx); dy = Math.min(dy, WH - dy); return Math.hypot(dx, dy);
      }

      function update(dt) {
        clock += dt;
        const nh = worldH(); if (nh !== WH) { WH = nh; [ship, ...rocks].forEach(wrap); }
        rocks.forEach(r => { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrap(r); });
        parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt; });
        parts = parts.filter(p => p.age < p.life);
        if (state === 'over') return;
        fireCd = Math.max(0, fireCd - dt);
        if (respawnAt >= 0) {
          if (clock >= respawnAt) {
            const clear = rocks.every(r => wd(r.x, r.y, WW / 2, WH / 2) > SIZES[r.size] + 60);
            if (clear) { ship = newShip(); respawnAt = -1; safeUntil = clock + SAFE_T; }
          }
        } else {
          const turn = (held.r ? 1 : 0) - (held.l ? 1 : 0);
          ship.a += turn * cfg.turn * dt;
          if (held.up) {
            ship.vx += Math.cos(ship.a) * cfg.thrust * dt; ship.vy += Math.sin(ship.a) * cfg.thrust * dt;
            ship.flame = Math.min(1, ship.flame + dt * 8);
            if (!api.reduceMotion && Math.random() < 0.6) parts.push({ x: ship.x - Math.cos(ship.a) * 11, y: ship.y - Math.sin(ship.a) * 11, vx: -Math.cos(ship.a + (Math.random() - 0.5) * 0.6) * 90 + ship.vx, vy: -Math.sin(ship.a + (Math.random() - 0.5) * 0.6) * 90 + ship.vy, life: 0.3, age: 0, color: api.colors().accent });
          } else ship.flame = Math.max(0, ship.flame - dt * 6);
          const sp = Math.hypot(ship.vx, ship.vy), max = 260;
          if (sp > max) { ship.vx *= max / sp; ship.vy *= max / sp; }
          const drag = Math.pow(0.55, dt); ship.vx *= drag; ship.vy *= drag;
          ship.x += ship.vx * dt; ship.y += ship.vy * dt; wrap(ship);
          if (held.fire) fire();
          if (clock > safeUntil) for (const r of rocks) if (wd(r.x, r.y, ship.x, ship.y) < SIZES[r.size] * 0.85 + SHIP_R * 0.8) { crash(); break; }
        }
        shots.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; wrap(s); });
        shots = shots.filter(s => {
          if (s.life <= 0) return false;
          for (let i = 0; i < rocks.length; i++) if (wd(rocks[i].x, rocks[i].y, s.x, s.y) < SIZES[rocks[i].size]) { splitRock(i, s.vx, s.vy); return false; }
          return true;
        });
      }

      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = true;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') held.up = true;
        else if (k === ' ') { if (!e.repeat) { fireCd = 0; fire(); } held.fire = true; }
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = false;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') held.up = false;
        if (k === ' ') held.fire = false;
      });
      api.on(window, 'blur', () => { held.l = held.r = held.up = held.fire = false; });

      // draw something at each wrapped copy that touches the screen
      function wrapped(x, y, r, fn) {
        for (const ox of [-WW, 0, WW]) for (const oy of [-WH, 0, WH]) {
          const px = x + ox, py = y + oy;
          if (px + r < 0 || px - r > WW || py + r < 0 || py - r > WH) continue;
          fn(px, py);
        }
      }
      const shapes = new Map();
      function rockShape(seed) { if (!shapes.has(seed)) { if (shapes.size > 200) shapes.clear(); shapes.set(seed, outline(seed)); } return shapes.get(seed); }

      function render() {
        const col = api.colors(), s = view.w / WW;
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.save(); ctx.scale(s, s);
        // faint dust
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.12)' : 'rgba(120,90,50,0.1)';
        for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 89.3) % WW, (i * 53.7) % WH, 1 + (i % 3) * 0.4, 0, Math.PI * 2); ctx.fill(); }
        // rocks
        const rockFill = col.dark ? '#6d6357' : '#d8cab5', rockEdge = col.dark ? '#867a6b' : '#bba98f', crater = col.dark ? 'rgba(0,0,0,0.22)' : 'rgba(120,90,50,0.16)';
        rocks.forEach(r => {
          const rad = SIZES[r.size], o = rockShape(r.seed);
          const born = api.reduceMotion ? 1 : Math.min(1, (clock - waveAt) / 0.4);
          wrapped(r.x, r.y, rad, (x, y) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot); ctx.scale(born, born);
            ctx.beginPath(); o.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](Math.cos(p.a) * rad * p.r, Math.sin(p.a) * rad * p.r)); ctx.closePath();
            ctx.fillStyle = rockFill; ctx.fill(); ctx.strokeStyle = rockEdge; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
            ctx.fillStyle = crater;
            o.dots.forEach(d => { ctx.beginPath(); ctx.arc(Math.cos(d.a) * d.d * rad, Math.sin(d.a) * d.d * rad, d.r * rad, 0, Math.PI * 2); ctx.fill(); });
            ctx.restore();
          });
        });
        // shots
        ctx.fillStyle = col.accent;
        shots.forEach(sh => { ctx.globalAlpha = Math.min(1, sh.life * 4); ctx.beginPath(); ctx.arc(sh.x, sh.y, 2.6, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        parts.forEach(p => { ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        // ship
        if (state === 'play' && respawnAt < 0) {
          const blink = clock < safeUntil && Math.floor(clock * 8) % 2 === 0;
          ctx.globalAlpha = blink ? 0.35 : 1;
          wrapped(ship.x, ship.y, 16, (x, y) => drawShip(x, y, col));
          ctx.globalAlpha = 1;
        }
        if (state === 'over') {
          // the wreck: three drifting hull pieces
          const k = clock - deadAt;
          ctx.strokeStyle = col.ink3; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
          [0, 2.1, 4.2].forEach((a, i) => {
            const x = ship.x + Math.cos(a) * k * 14, y = ship.y + Math.sin(a) * k * 14, rr = ship.a + k * (i - 1) * 1.5;
            ctx.beginPath(); ctx.moveTo(x - Math.cos(rr) * 7, y - Math.sin(rr) * 7); ctx.lineTo(x + Math.cos(rr) * 7, y + Math.sin(rr) * 7); ctx.stroke();
          });
          D.spark(ctx, ship.x, ship.y, 6, col.ink3, k);
        }
        // HUD
        for (let i = 0; i < 3; i++) D.spark(ctx, 16 + i * 19, 16, 6.2, i < lives ? col.accent : col.line, 0);
        D.text(ctx, `Wave ${wave}`, WW - 12, 16, 13, col.ink2, 700, 'right');
        if (state === 'over') D.text(ctx, `${score} points`, WW / 2, 16, 13, col.ink2, 700);
        ctx.restore();
      }
      function drawShip(x, y, col) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ship.a);
        if (ship.flame > 0) {
          const f = ship.flame * (0.8 + Math.random() * 0.3);
          ctx.fillStyle = col.accent; ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-8 - 12 * f, 0); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = col.ink; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, -10); ctx.quadraticCurveTo(-4, 0, -9, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
        D.spark(ctx, x + Math.cos(ship.a) * 1, y + Math.sin(ship.a) * 1, 4.6, col.accent, clock * 2);
      }

      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.rocks) || !sv.ship || !(sv.lives >= 1 && sv.lives <= 3)) return false;
        if (!sv.rocks.every(r => Array.isArray(r) && r.length === 6 && r[4] >= 1 && r[4] <= 3)) return false;
        reset();
        if (sv.h >= 300 && sv.h <= 2000) WH = sv.h;   // the next frame re-fits the field to the stage
        const k = 1;
        wave = sv.wave | 0 || 1; score = sv.score | 0; lives = sv.lives | 0;
        ship = Object.assign(newShip(), { x: +sv.ship[0], y: +sv.ship[1] * k, vx: +sv.ship[2], vy: +sv.ship[3], a: +sv.ship[4] });
        rocks = sv.rocks.map(r => ({ x: r[0], y: r[1] * k, vx: r[2], vy: r[3], size: r[4], seed: r[5], rot: 0, spin: (r[5] % 7 - 3) * 0.2 }));
        rocks.forEach(wrap); wrap(ship);
        safeUntil = 1.5; waveAt = -9;
        if (!rocks.length) startWave(wave + 1);
        return true;
      }
      const r1 = v => Math.round(v * 10) / 10;
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) reset();
      api.score(score);
      api.loop(dt => { update(dt); render(); });
      return {
        save() {
          if (state === 'over' || (!restored && !api.touched)) return null;   // nothing played yet
          const sh = respawnAt >= 0 ? newShip() : ship;
          return { v: 1, h: WH, wave, score, lives, ship: [r1(sh.x), r1(sh.y), r1(sh.vx), r1(sh.vy), Math.round(sh.a * 1000) / 1000], rocks: rocks.map(r => [r1(r.x), r1(r.y), r1(r.vx), r1(r.vy), r.size, r.seed]) };
        }
      };
    }
  });
})();
