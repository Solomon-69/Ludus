/* Hammer Climb: a spark sits in a pot and has only a long hammer. The mouse places the hammer head around the pot.
   A free head chases the cursor (stiff spring, capped speed). A head pressed into rock sticks, and further mouse
   motion moves the POT instead, the other way round the contact point: push off, pull up, vault, hook ledges.
   World units, y grows upward, x from 0 to WW. Fixed 240 Hz position-based solver, so it feels the same at any frame rate. */
(function () {
  const D = Ludus.draw;
  const WW = 360, G = -1450, PR = 16, HR = 6, HL = 124, HMIN = 22, STEP = 1 / 240;
  const SPRING = 26, HSPD = 720, VMAX = 1000, REACT = 0.06, BOUNCE = 0.18, STICK = 1.5, STICKV = 380;
  // Materials: head slip (share of sideways drag that slides), pot friction.
  const MAT = {
    rock: { slip: 0, mu: 0.9 }, wall: { slip: 1, mu: 0.3 }, wood: { slip: 0.03, mu: 0.8 },
    ice: { slip: 0.9, mu: 0.025 }, nub: { slip: 0, mu: 1 }
  };
  const GRIP = [0.5, 1, 1.35];            // easy: icy things slide less; hard: more
  const TOP = 3000;

  // Hand-made course, bottom to top. [material, x1,y1, x2,y2, ...] simple polygons.
  const COURSE = [
    ['rock', -100, -200, 460, -200, 460, 0, -100, 0],
    ['wall', -100, -200, 0, -200, 0, TOP, -100, TOP],
    ['wall', 360, -200, 460, -200, 460, TOP, 360, TOP],
    // The first rock
    ['rock', 108, -40, 112, 0, 124, 50, 156, 94, 202, 112, 238, 96, 256, 40, 262, 0, 266, -40],
    // The tree: a trunk by the left wall with branches, and roots hanging from the right wall
    ['wood', 22, -40, 50, -40, 46, 700, 24, 700],
    ['rock', 228, 196, 300, 190, 400, 186, 400, 216, 236, 214],
    ['wood', 46, 300, 150, 312, 204, 318, 206, 330, 150, 326, 46, 318],
    ['wood', 400, 404, 230, 410, 156, 416, 154, 428, 230, 426, 400, 428],
    ['wood', 46, 500, 150, 510, 206, 516, 208, 528, 150, 526, 46, 520],
    ['wood', 400, 604, 230, 610, 156, 614, 154, 626, 230, 626, 400, 628],
    ['wood', 10, 676, 90, 680, 162, 690, 182, 702, 166, 720, 70, 726, 10, 718],
    // The slide: an icy ramp with two rough nubs
    ['ice', 230, 742, 400, 842, 400, 892, 236, 766],
    ['nub', 264, 780, 276, 778, 280, 804, 270, 808],
    ['nub', 324, 826, 336, 824, 340, 850, 330, 854],
    // Overhangs: shelves that stick out over the drop, hook their lips from below
    ['rock', -40, 880, 120, 918, 262, 950, 270, 966, 200, 974, -40, 986],
    ['rock', 400, 1000, 250, 1040, 128, 1056, 122, 1072, 230, 1078, 400, 1084],
    ['rock', -40, 1090, 150, 1140, 246, 1154, 252, 1170, 160, 1180, -40, 1186],
    ['rock', 400, 1200, 240, 1240, 128, 1256, 122, 1272, 240, 1278, 400, 1284],
    // Summit shelf
    ['rock', -40, 1300, 160, 1336, 250, 1350, 258, 1366, -40, 1370]
  ];
  const SUMMIT = 1366, START = { x: 72, y: PR + 0.5 };
  // Easy only: a few extra rough holds.
  const EXTRA = [
    ['nub', 150, 230, 170, 228, 172, 240, 150, 242], ['nub', 268, 900, 286, 898, 288, 910, 268, 912]
  ];
  const SECTIONS = [[30, 'The first rock'], [260, 'The tree'], [740, 'The slide'], [960, 'Overhangs'], [1380, 'Summit']];

  function makeWorld(level) {
    return COURSE.concat(level === 0 ? EXTRA : []).map(([k, ...f]) => {
      const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]);
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const m = MAT[k];
      return { k, p, mu: m.mu, slip: Math.min(1, m.slip * GRIP[level]), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
  }
  // Closest point on a polygon's outline, and whether (x, y) is inside it.
  function nearest(sh, x, y) {
    const P = sh.p; let best = Infinity, bx = 0, by = 0, inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const ax = P[j][0], ay = P[j][1], cx = P[i][0], cy = P[i][1];
      if ((ay > y) !== (cy > y) && x < (cx - ax) * (y - ay) / (cy - ay) + ax) inside = !inside;
      const ex = cx - ax, ey = cy - ay, L = ex * ex + ey * ey;
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)) : 0;
      const qx = ax + ex * t, qy = ay + ey * t, d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < best) { best = d2; bx = qx; by = qy; }
    }
    return { qx: bx, qy: by, d: Math.sqrt(best), inside };
  }
  // Pushes a circle out of the terrain. Returns the new centre, push normal, push depth and the deepest material.
  function probe(world, x, y, r) {
    const sx = x, sy = y; let hit = false, deep = 0, sh0 = null;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const sh of world) {
        if (x + r < sh.x0 || x - r > sh.x1 || y + r < sh.y0 || y - r > sh.y1) continue;
        const c = nearest(sh, x, y);
        let push, ux, uy;
        if (c.inside) { push = c.d + r; ux = c.d > 1e-9 ? (c.qx - x) / c.d : 0; uy = c.d > 1e-9 ? (c.qy - y) / c.d : 1; }
        else if (c.d < r) { push = r - c.d; ux = c.d > 1e-9 ? (x - c.qx) / c.d : 0; uy = c.d > 1e-9 ? (y - c.qy) / c.d : 1; }
        else continue;
        x += ux * push; y += uy * push; hit = moved = true;
        if (push > deep) { deep = push; sh0 = sh; }
      }
      if (!moved) break;
    }
    const dx = x - sx, dy = y - sy, L = Math.hypot(dx, dy);
    return { x, y, hit, nx: L > 1e-9 ? dx / L : 0, ny: L > 1e-9 ? dy / L : 1, depth: L, sh: sh0 };
  }
  function newState() {
    return { p: { x: START.x, y: START.y }, v: { x: 0, y: 0 }, o: { x: 32, y: HR + 0.5 - START.y }, h: { x: START.x + 32, y: HR + 0.5 }, hc: false, hn: { x: 0, y: 1 }, ground: true, air: 0 };
  }
  // Clamp a hammer offset to the arm: never longer than HL, never shorter than HMIN.
  function clampArm(x, y) {
    const l = Math.hypot(x, y);
    if (l > HL) return { x: x / l * HL, y: y / l * HL };
    if (l < HMIN) return l > 1e-6 ? { x: x / l * HMIN, y: y / l * HMIN } : { x: 0, y: -HMIN };
    return { x, y };
  }
  // One fixed solver step. T = the wanted head offset from the pot centre (already clamped to the arm).
  function step(world, s, T, dt) {
    const px0 = s.p.x, py0 = s.p.y;
    // 1. the hammer offset chases the target: stiff spring, capped speed (wild flicks cannot teleport it)
    let ox = (T.x - s.o.x) * SPRING, oy = (T.y - s.o.y) * SPRING;
    const ol = Math.hypot(ox, oy); if (ol > HSPD) { ox *= HSPD / ol; oy *= HSPD / ol; }
    const mx = ox * dt, my = oy * dt, no = clampArm(s.o.x + mx, s.o.y + my);
    // 2. the pot falls; swinging a free hammer in the air nudges it a little the other way
    s.v.y += G * dt;
    let px = s.p.x + s.v.x * dt, py = s.p.y + s.v.y * dt;
    if (!s.hc && !s.ground) { px -= mx * REACT; py -= my * REACT; }
    // 3. the head: free, it goes where the arm puts it; pressed into terrain, it holds and the pot moves instead
    const hx = px + no.x, hy = py + no.y;
    let c = probe(world, hx, hy, HR);
    // a planted head clings on through slow moves; only a quick shove (or pulling clearly away) breaks it free
    if (!c.hit && s.hc && Math.hypot(s.v.x, s.v.y) < STICKV) {
      const a = probe(world, hx, hy, HR + STICK);
      if (a.hit) c = { x: a.x - a.nx * STICK, y: a.y - a.ny * STICK, hit: true, nx: a.nx, ny: a.ny, sh: a.sh };
    }
    let nhx = hx, nhy = hy;
    if (c.hit) {
      nhx = c.x; nhy = c.y;
      if (s.hc) {                                   // already planted: only the material's slip share slides along
        const ddx = c.x - s.h.x, ddy = c.y - s.h.y, dn = ddx * c.nx + ddy * c.ny;
        const tx = ddx - c.nx * dn, ty = ddy - c.ny * dn, sl = c.sh ? c.sh.slip : 0;
        const q = probe(world, s.h.x + c.nx * dn + tx * sl, s.h.y + c.ny * dn + ty * sl, HR);
        nhx = q.x; nhy = q.y;
      }
      px += nhx - hx; py += nhy - hy;
      s.hn.x = c.nx; s.hn.y = c.ny;
    }
    s.hc = c.hit; s.o.x = no.x; s.o.y = no.y;
    // 4. the pot against the terrain: slide with friction, bounce a touch on hard hits
    let vx = (px - px0) / dt, vy = (py - py0) / dt;
    const b = probe(world, px, py, PR);
    if (b.hit) {
      px = b.x; py = b.y;
      const vn = vx * b.nx + vy * b.ny;
      if (vn < 0) {
        let tx = vx - vn * b.nx, ty = vy - vn * b.ny;
        const tl = Math.hypot(tx, ty), drop = (b.sh ? b.sh.mu : 0.8) * -vn * 1.1;
        const f = tl > 1e-9 ? Math.max(0, tl - drop) / tl : 0; tx *= f; ty *= f;
        const bn = -vn > 260 ? -vn * BOUNCE : 0;
        vx = tx + b.nx * bn; vy = ty + b.ny * bn;
      }
      // the pot was pushed: a planted head stays put, so the arm takes up the difference (or lets go if overstretched)
      if (s.hc) {
        const ax = nhx - px, ay = nhy - py, al = Math.hypot(ax, ay);
        if (al > HL * 1.06) { s.hc = false; const a = clampArm(ax, ay); s.o.x = a.x; s.o.y = a.y; nhx = px + a.x; nhy = py + a.y; }
        else { const a = clampArm(ax, ay); s.o.x = a.x; s.o.y = a.y; }
      } else { nhx = px + s.o.x; nhy = py + s.o.y; }
    }
    // a planted hammer can only throw the pot as fast as the arm swings (no glitch launches from rock pushes)
    const vcap = s.hc ? HSPD * 1.2 : VMAX, vl = Math.hypot(vx, vy); if (vl > vcap) { vx *= vcap / vl; vy *= vcap / vl; }
    s.p.x = px; s.p.y = py; s.v.x = vx; s.v.y = vy; s.h.x = nhx; s.h.y = nhy;
    s.ground = b.hit && b.ny > 0.45;
    s.air = s.ground || s.hc ? 0 : s.air + dt;
  }

  Ludus.register({
    id: 'climb', name: 'Hammer Climb', tag: 'Arcade', tint: '#7d6a58',
    hint: 'Mouse moves the hammer head. Press it on rock, keep moving to lever yourself · <kbd>←</kbd><kbd>→</kbd> swing <kbd>↑</kbd><kbd>↓</kbd> reach',
    _rules: { makeWorld, step, newState, clampArm, probe, START, SUMMIT, HL, HMIN, PR, HR, STEP, WW },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 1.05); ctx.lineTo(w * 0.62, h * 0.5); ctx.lineTo(w * 0.8, h * 0.4); ctx.lineTo(w * 1.05, h * 0.46); ctx.lineTo(w * 1.05, h * 1.05); ctx.fill();
      D.roundRect(ctx, -10, h * 0.8, w * 0.7, h * 0.3, 10); ctx.fill();
      const px = w * 0.34, py = h * 0.68, r = h * 0.11;
      ctx.strokeStyle = '#2b2722'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py - r * 0.6); ctx.lineTo(w * 0.64, h * 0.42); ctx.stroke();
      ctx.fillStyle = '#2b2722'; ctx.save(); ctx.translate(w * 0.64, h * 0.42); ctx.rotate(-0.75); D.roundRect(ctx, -9, -5, 18, 10, 3); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#b8603f'; ctx.beginPath(); ctx.moveTo(px - r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 0.8, py + r * 0.7); ctx.lineTo(px - r * 0.8, py + r * 0.7); ctx.closePath(); ctx.fill();
      D.spark(ctx, px, py - r * 0.9, r * 0.75, '#fffaf2', 0.3);
    },
    create(stage, api) {
      const lv = api.level, world = makeWorld(lv);
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let s, maxH, time, state = 'play', camY, acc = 0, aim, mouse = null, keysDown = {}, clock = 0, winAt = 0;
      let fallFrom = 0, fallNote = null, lastTap = 0, wasHc = false, falls = 0;

      const fin = v => typeof v === 'number' && isFinite(v);
      const pt = q => q && fin(q.x) && fin(q.y);
      function restore(o) {
        if (!o || !pt(o.p) || !pt(o.v) || !pt(o.o) || !pt(o.h)) return false;
        if (o.p.x < 0 || o.p.x > WW || o.p.y < 0 || o.p.y > TOP || Math.hypot(o.o.x, o.o.y) > HL + 1) return false;
        s = { p: { x: o.p.x, y: o.p.y }, v: { x: o.v.x, y: o.v.y }, o: { x: o.o.x, y: o.o.y }, h: { x: o.h.x, y: o.h.y }, hc: !!o.hc,
          hn: pt(o.hn) ? { x: o.hn.x, y: o.hn.y } : { x: 0, y: 1 }, ground: !!o.ground, air: 0 };
        maxH = fin(o.maxH) ? Math.max(0, o.maxH) : 0; time = fin(o.time) ? o.time : 0; falls = fin(o.falls) ? o.falls : 0;
        if (o.aim && fin(o.aim.a) && fin(o.aim.l)) aim = { a: o.aim.a, l: o.aim.l };
        return true;
      }
      if (!restore(api.saved)) { s = newState(); maxH = 0; time = 0; aim = null; }
      if (!aim) aim = { a: Math.atan2(s.o.y, s.o.x), l: Math.hypot(s.o.x, s.o.y) };
      camY = s.p.y + 60; fallFrom = s.p.y;
      api.score(Math.floor(maxH / 10));

      // ---------- input: the cursor offset from the pot is where the hammer head wants to be ----------
      const scale = () => view.w / WW;
      const toScreen = (x, y) => { const k = scale(); return { x: x * k, y: view.h * 0.5 - (y - camY) * k }; };
      function setMouse(e) { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; }
      api.on(canvas, 'pointermove', setMouse);
      api.on(canvas, 'pointerdown', setMouse);
      api.keys(e => { keysDown[e.key] = true; if (e.key.startsWith('Arrow')) mouse = null; });
      api.keysUp(e => { keysDown[e.key] = false; });
      function target(dt) {
        if (mouse) {
          const c = toScreen(s.p.x, s.p.y), k = scale();
          const dx = (mouse.x - c.x) / k, dy = -(mouse.y - c.y) / k;
          aim.a = Math.atan2(dy, dx); aim.l = Math.max(HMIN, Math.min(HL, Math.hypot(dx, dy)));
        } else {
          if (keysDown.ArrowLeft) aim.a += 3.4 * dt;
          if (keysDown.ArrowRight) aim.a -= 3.4 * dt;
          if (keysDown.ArrowUp) aim.l = Math.min(HL, aim.l + 220 * dt);
          if (keysDown.ArrowDown) aim.l = Math.max(HMIN, aim.l - 220 * dt);
        }
        return { x: Math.cos(aim.a) * aim.l, y: Math.sin(aim.a) * aim.l };
      }

      function update(dt) {
        if (state !== 'play' || dt <= 0) return;
        time += dt;
        acc = Math.min(acc + dt, STEP * 14);
        const tg = target(dt);
        while (acc >= STEP) { step(world, s, tg, STEP); acc -= STEP; }
        if (s.hc && !wasHc && clock - lastTap > 0.12) { api.sfx('click'); lastTap = clock; }
        wasHc = s.hc;
        const hgt = s.p.y - PR;
        if (hgt > maxH) { maxH = hgt; api.score(Math.floor(maxH / 10)); }
        if (s.ground || s.hc) {
          const lost = fallFrom - s.p.y;
          if (lost > 140 && s.ground) { falls++; fallNote = { text: `-${Math.round(lost / 10)} m`, t: clock, x: s.p.x, y: s.p.y }; api.sfx('hit'); }
          fallFrom = s.p.y;
        } else fallFrom = Math.max(fallFrom, s.p.y);
        if (s.p.y > SUMMIT && s.ground && s.p.x < 250) win();
      }
      function win() {
        state = 'won'; winAt = clock;
        const score = Math.floor(maxH / 10) + Math.max(0, Math.round(900 - time)) * (lv + 1);
        api.score(score); api.sfx('win');
        const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
        api.timeout(() => api.over({ score, title: 'Summit', won: true, message: `Climbed in ${mm}:${ss}, ${falls} big fall${falls === 1 ? '' : 's'}` }), 1200);
      }

      // ---------- render ----------
      function shapePath(sh) {
        ctx.beginPath();
        sh.p.forEach((q, i) => { const a = toScreen(q[0], q[1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); });
        ctx.closePath();
      }
      function palette(col) {
        const d = col.dark;
        return {
          rock: [d ? '#5a5047' : '#d6c6ad', d ? '#71665b' : '#e9dcc6'], wall: [d ? '#3a332d' : '#cdbb9f', d ? '#4a4239' : '#dccbb0'],
          wood: [d ? '#6e5038' : '#a7774f', d ? '#8a6648' : '#c08f62'], ice: [d ? '#4f6a78' : '#bcdbe6', d ? '#7d9eae' : '#e6f4f8'],
          nub: [d ? '#7a6c5e' : '#b9a07f', d ? '#94857a' : '#cfb895']
        };
      }
      function render() {
        const col = api.colors(), pal = palette(col);
        const { w, h } = view, k = scale();
        // camera: only moves when the pot leaves the middle band, so the cursor offset stays steady
        const sy = toScreen(s.p.x, s.p.y).y;
        let want = camY;
        if (state === 'won') want = SUMMIT + 40;
        else if (sy < h * 0.36) want = camY + (h * 0.36 - sy) / k;
        else if (sy > h * 0.64) want = camY - (sy - h * 0.64) / k;
        want = Math.max(want, (h * 0.5) / k - 40);
        camY += (want - camY) * (api.reduceMotion ? 1 : 0.14);
        ctx.clearRect(0, 0, w, h);
        const hk = Math.min(1, camY / SUMMIT);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, col.dark ? '#211d19' : `hsl(${36 - hk * 14} 48% ${95 - hk * 4}%)`);
        g.addColorStop(1, col.dark ? '#1a1714' : '#ece2d2');
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.07)' : 'rgba(120,95,70,0.11)';
        for (let i = 0; i < 36; i++) {
          const yy = ((i * 173 + camY * 0.4 * k) % (h + 40) + h + 40) % (h + 40) - 20;
          ctx.beginPath(); ctx.arc(((i * 97) % WW) * k, yy, 1.2 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        const top = camY + (h * 0.5) / k, bot = camY - (h * 0.5) / k;
        SECTIONS.forEach(([y, name]) => {
          if (y < bot - 20 || y > top + 20) return;
          const p = toScreen(WW / 2, y + 40);
          ctx.globalAlpha = 0.5; D.text(ctx, name, p.x, p.y, 13, col.ink3, 720); ctx.globalAlpha = 1;
        });
        if (maxH > 40) {
          const p = toScreen(0, maxH + PR);
          ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = col.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke(); ctx.restore();
        }
        ctx.lineJoin = 'round';
        world.forEach(sh => {
          if (sh.y1 < bot - 20 || sh.y0 > top + 20) return;
          const [fill, edge] = pal[sh.k];
          shapePath(sh); ctx.fillStyle = fill; ctx.fill();
          ctx.strokeStyle = edge; ctx.lineWidth = sh.k === 'wall' ? 1 : 2; ctx.stroke();
          if (sh.k === 'ice') {                  // shine streaks so the slide reads as slippery
            const a = toScreen(sh.p[3][0], sh.p[3][1]), b = toScreen(sh.p[2][0], sh.p[2][1]);
            ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
            for (let t = 0.15; t < 0.95; t += 0.22) {
              ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 6 * k);
              ctx.lineTo(a.x + (b.x - a.x) * (t + 0.08), a.y + (b.y - a.y) * (t + 0.08) + 6 * k); ctx.stroke();
            }
          }
        });
        for (let y = Math.max(100, Math.floor(bot / 100) * 100); y < top; y += 100) {
          const p = toScreen(0, y);
          ctx.fillStyle = col.dark ? 'rgba(33,29,25,0.75)' : 'rgba(255,250,242,0.75)'; D.roundRect(ctx, p.x + 2, p.y - 7, 38, 14, 7); ctx.fill();
          D.text(ctx, `${y / 10} m`, p.x + 8, p.y, 9.5, col.ink2, 650, 'left');
        }
        // summit flag
        const fp = toScreen(60, SUMMIT);
        if (fp.y > -80 && fp.y < h + 40) {
          ctx.strokeStyle = col.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(fp.x, fp.y - 46 * k); ctx.stroke();
          D.spark(ctx, fp.x, fp.y - 52 * k, 11 * k, col.accent, clock * 0.8);
        }
        drawClimber(col, k);
        if (fallNote && clock - fallNote.t < 1.4) {
          const p = toScreen(fallNote.x, fallNote.y), a = 1 - (clock - fallNote.t) / 1.4;
          ctx.globalAlpha = a; D.text(ctx, fallNote.text, p.x, p.y - 34 - (1 - a) * 16, 13, col.bad, 750); ctx.globalAlpha = 1;
        }
        // HUD
        ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.85)' : 'rgba(255,252,247,0.85)';
        D.roundRect(ctx, w / 2 - 74, 8, 148, 30, 15); ctx.fill();
        D.text(ctx, `${Math.max(0, Math.floor((s.p.y - PR) / 10))} m`, w / 2 - 24, 23, 14, col.ink, 780);
        D.text(ctx, `best ${Math.floor(maxH / 10)}`, w / 2 + 32, 23, 11, col.ink2, 650);
        if (state === 'won') {
          const a = Math.min(1, (clock - winAt) / 0.5);
          ctx.globalAlpha = a; D.text(ctx, 'You made it to the top', w / 2, 60, 16, col.good, 760);
          D.text(ctx, `Best height ${Math.floor(maxH / 10)} m`, w / 2, 82, 12, col.ink2, 650); ctx.globalAlpha = 1;
          for (let i = 0; i < 6; i++) {
            const t = clock - winAt + i * 0.3, r = 10 + (t * 60) % 90;
            const a = toScreen(s.p.x, s.p.y);
            ctx.globalAlpha = Math.max(0, 1 - r / 100); D.spark(ctx, a.x + Math.cos(i) * r, a.y - Math.sin(i * 2) * r * 0.6 - 20, 6, col.accent, t);
          }
          ctx.globalAlpha = 1;
        } else if (time < 7 && maxH < 30) {
          ctx.globalAlpha = Math.min(1, 7 - time);
          D.text(ctx, 'Plant the hammer on the rock, then sweep down to lift', w / 2, h - 18, 11, col.ink2, 650);
          ctx.globalAlpha = 1;
        }
      }
      function drawClimber(col, k) {
        const pc = toScreen(s.p.x, s.p.y), hc = toScreen(s.h.x, s.h.y);
        const ang = Math.atan2(hc.y - pc.y, hc.x - pc.x), r = PR * k;
        const sx = pc.x + Math.cos(ang) * r * 0.25, sy = pc.y - r * 0.8;
        ctx.strokeStyle = col.dark ? '#cbbfae' : '#5a4a3a'; ctx.lineWidth = 3.2 * Math.min(1.3, k); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hc.x, hc.y); ctx.stroke();
        ctx.save(); ctx.translate(hc.x, hc.y); ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = col.dark ? '#e9e1d4' : '#2f2a24'; D.roundRect(ctx, -HR * 1.7 * k, -HR * 0.9 * k, HR * 3.4 * k, HR * 1.8 * k, 3); ctx.fill();
        if (s.hc) { ctx.fillStyle = col.accent; D.roundRect(ctx, -HR * 1.7 * k, HR * 0.3 * k, HR * 3.4 * k, HR * 0.6 * k, 2); ctx.fill(); }
        ctx.restore();
        D.spark(ctx, pc.x + Math.cos(ang) * 2, pc.y - r * 0.85, r * 0.82, col.accent, state === 'won' ? clock * 4 : ang * 0.2);
        ctx.fillStyle = col.dark ? '#9c5338' : '#b8603f';
        ctx.beginPath(); ctx.moveTo(pc.x - r * 1.1, pc.y - r * 0.4); ctx.lineTo(pc.x + r * 1.1, pc.y - r * 0.4);
        ctx.lineTo(pc.x + r * 0.78, pc.y + r); ctx.lineTo(pc.x - r * 0.78, pc.y + r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.dark ? '#b8674a' : '#cf7752'; D.roundRect(ctx, pc.x - r * 1.2, pc.y - r * 0.58, r * 2.4, r * 0.38, r * 0.18); ctx.fill();
        if (state === 'play') {                  // where the head wants to be
          const t = toScreen(s.p.x + Math.cos(aim.a) * aim.l, s.p.y + Math.sin(aim.a) * aim.l);
          ctx.strokeStyle = col.ink3; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      if (window.ludusDebug) Ludus.games.find(x => x.id === 'climb')._peek = () => ({ s, maxH, state, aim, camY, time, toScreen });
      return {
        save() {
          if (state !== 'play' || time < 1) return null;
          const c = q => ({ x: q.x, y: q.y });
          return { p: c(s.p), v: c(s.v), o: c(s.o), h: c(s.h), hc: s.hc, hn: c(s.hn), ground: s.ground, maxH, time, falls, aim: { a: aim.a, l: aim.l } };
        },
        resume() { acc = 0; }
      };
    }
  });
})();
