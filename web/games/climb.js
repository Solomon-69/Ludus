/* Hammer Climb: a spark sits in a pot and swings a long hammer. Hook the head on the rocks and lever yourself up.
   World units, y grows upward, x from 0 to WW. Fixed 120 Hz physics, so it feels the same at any frame rate. */
(function () {
  const D = Ludus.draw;
  const WW = 360, G = -1300, PR = 15, HR = 7, HL = 118, HMIN = 34, VMAX = 820, STEP = 1 / 120;
  const SLIP = [0.06, 0.12, 0.2];         // how much the planted head slides along a rock (easy grips best)
  const SUMMIT = 2480;

  // Rocks: boxes [x, y, w, h] (y = bottom) and boulders [x1, y1, x2, y2, radius] (capsules).
  const BOXES = [
    [-120, -300, 600, 300], [-120, -300, 120, 3200], [WW, -300, 120, 3200],
    [190, 0, 170, 84], [0, 150, 140, 24], [215, 238, 145, 24], [30, 330, 120, 22], [190, 420, 120, 22],
    [0, 520, 110, 26], [150, 600, 90, 20], [270, 690, 90, 22], [110, 780, 100, 20], [0, 870, 90, 22],
    [130, 950, 70, 18], [250, 1040, 110, 22], [120, 1140, 80, 18], [0, 1230, 100, 22], [170, 1320, 70, 18],
    [290, 1410, 70, 22], [150, 1500, 80, 18], [20, 1590, 90, 20], [160, 1690, 60, 18], [280, 1780, 80, 20],
    [140, 1880, 70, 16], [10, 1970, 90, 20], [150, 2060, 60, 16], [270, 2150, 90, 20], [130, 2250, 80, 16],
    [0, 2340, 100, 20], [100, SUMMIT - 30, 260, 30]
  ];
  const BOULDERS = [
    [130, 18, 160, 30, 20], [180, 300, 200, 300, 14], [240, 560, 260, 570, 16], [60, 730, 70, 740, 14],
    [230, 900, 250, 900, 13], [60, 1080, 80, 1090, 15], [260, 1240, 270, 1250, 12], [60, 1420, 80, 1430, 14],
    [250, 1610, 260, 1620, 12], [60, 1800, 70, 1810, 12], [250, 1960, 260, 1970, 12], [60, 2190, 70, 2200, 12]
  ];
  // Easy only: small gentle steps between the main ledges.
  const GENTLE = [
    [150, 100, 40, 12], [160, 200, 40, 12], [120, 280, 50, 12], [130, 470, 50, 12], [220, 650, 40, 12],
    [200, 830, 40, 12], [70, 1000, 40, 12], [220, 1190, 40, 12], [240, 1460, 40, 12], [100, 1640, 40, 12],
    [220, 1830, 40, 12], [90, 2010, 40, 12], [220, 2200, 40, 12], [40, 2420, 50, 12]
  ];
  const START = { x: 55, y: PR + 0.5 };

  function makeWorld(level) {
    const shapes = [];
    BOXES.concat(level === 0 ? GENTLE : []).forEach(([x, y, w, h]) => shapes.push({ t: 'b', x, y, w, h, r: Math.min(8, w / 2, h / 2) }));
    BOULDERS.forEach(([x1, y1, x2, y2, r]) => shapes.push({ t: 'c', x1, y1, x2, y2, r }));
    shapes.forEach(s => {
      s.minY = s.t === 'b' ? s.y : Math.min(s.y1, s.y2) - s.r; s.maxY = s.t === 'b' ? s.y + s.h : Math.max(s.y1, s.y2) + s.r;
    });
    return shapes;
  }
  // Pushes a circle out of every rock. Returns the new centre and the summed contact normal.
  function resolve(world, x, y, rad) {
    let hit = false, nx = 0, ny = 0;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const s of world) {
        if (y + rad < s.minY || y - rad > s.maxY) continue;
        let qx, qy, er;
        if (s.t === 'b') {
          const ix0 = s.x + s.r, ix1 = s.x + s.w - s.r, iy0 = s.y + s.r, iy1 = s.y + s.h - s.r;
          qx = Math.max(ix0, Math.min(ix1, x)); qy = Math.max(iy0, Math.min(iy1, y)); er = s.r;
          if (qx === x && qy === y) {               // centre inside the core: leave by the nearest side
            const opts = [[x - s.x, -1, 0], [s.x + s.w - x, 1, 0], [y - s.y, 0, -1], [s.y + s.h - y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
            x += opts[1] * (opts[0] + rad); y += opts[2] * (opts[0] + rad);
            nx += opts[1]; ny += opts[2]; hit = moved = true; continue;
          }
        } else {
          const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy;
          const k = L2 ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / L2)) : 0;
          qx = s.x1 + dx * k; qy = s.y1 + dy * k; er = s.r;
        }
        const ddx = x - qx, ddy = y - qy, d = Math.hypot(ddx, ddy), min = er + rad;
        if (d < min) {
          const ux = d > 1e-6 ? ddx / d : 0, uy = d > 1e-6 ? ddy / d : 1;
          x += ux * (min - d); y += uy * (min - d); nx += ux; ny += uy; hit = moved = true;
        }
      }
      if (!moved) break;
    }
    const nl = Math.hypot(nx, ny) || 1;
    return { x, y, hit, nx: nx / nl, ny: ny / nl };
  }
  // One fixed physics step. s = { p:{x,y}, v:{x,y}, h:{x,y}, d:{x,y}, hc, hn:{x,y}, ground }
  function physics(world, s, target, slip) {
    // the hammer offset follows the input, but with a top speed so it cannot teleport through rock
    const ex = target.x - s.d.x, ey = target.y - s.d.y, el = Math.hypot(ex, ey), maxd = 900 * STEP;
    if (el > maxd) { s.d.x += ex / el * maxd; s.d.y += ey / el * maxd; } else { s.d.x = target.x; s.d.y = target.y; }
    s.v.y += G * STEP;
    const fx = s.p.x + s.v.x * STEP, fy = s.p.y + s.v.y * STEP;
    let hx = fx + s.d.x, hy = fy + s.d.y;
    if (s.hc) {                                   // planted head grips: only slides a little along the surface
      const ddx = hx - s.h.x, ddy = hy - s.h.y, dn = ddx * s.hn.x + ddy * s.hn.y;
      if (dn < 0.6) { const tx = ddx - s.hn.x * dn, ty = ddy - s.hn.y * dn; hx = s.h.x + s.hn.x * dn + tx * slip; hy = s.h.y + s.hn.y * dn + ty * slip; }
    }
    // sweep the head in small steps so it never tunnels through a thin ledge
    const sx = hx - s.h.x, sy = hy - s.h.y, n = Math.min(24, Math.max(1, Math.ceil(Math.hypot(sx, sy) / (HR * 0.7))));
    let cx = s.h.x, cy = s.h.y, contact = null;
    for (let i = 1; i <= n; i++) {
      const r = resolve(world, cx + sx / n, cy + sy / n, HR);
      cx = r.x; cy = r.y; if (r.hit) contact = r;
    }
    const blocked = contact && Math.hypot(cx - hx, cy - hy) > 0.01;
    let px = fx, py = fy;
    if (blocked) { px = cx - s.d.x; py = cy - s.d.y; }
    const b = resolve(world, px, py, PR);
    let vx = (b.x - s.p.x) / STEP, vy = (b.y - s.p.y) / STEP;
    const vl = Math.hypot(vx, vy); if (vl > VMAX) { vx *= VMAX / vl; vy *= VMAX / vl; }
    if (b.hit) {
      const vn = vx * b.nx + vy * b.ny;
      if (vn < 0) { vx -= b.nx * vn; vy -= b.ny * vn; }
      if (b.ny > 0.5) { vx *= 1 - Math.min(1, 9 * STEP); }
    }
    s.p.x = b.x; s.p.y = b.y; s.v.x = vx; s.v.y = vy; s.h.x = cx; s.h.y = cy;
    s.hc = !!blocked; if (blocked) { s.hn.x = contact.nx; s.hn.y = contact.ny; }
    s.ground = b.hit && b.ny > 0.5;
  }

  Ludus.register({
    id: 'climb', name: 'Hammer Climb', tag: 'Arcade', tint: '#7d6a58',
    hint: 'Mouse around the pot swings the hammer: hook a rock, then pull · <kbd>←</kbd><kbd>→</kbd> swing, <kbd>↑</kbd><kbd>↓</kbd> reach',
    _rules: { makeWorld, resolve, physics, START, SUMMIT, HL, HMIN, STEP },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      D.roundRect(ctx, w * 0.55, h * 0.45, w * 0.5, h * 0.6, 10); ctx.fill();
      D.roundRect(ctx, -10, h * 0.8, w * 0.7, h * 0.3, 10); ctx.fill();
      const px = w * 0.34, py = h * 0.68, r = h * 0.11;
      ctx.strokeStyle = '#2b2722'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py - r * 0.6); ctx.lineTo(w * 0.62, h * 0.38); ctx.stroke();
      ctx.fillStyle = '#2b2722'; ctx.save(); ctx.translate(w * 0.62, h * 0.38); ctx.rotate(-0.75); D.roundRect(ctx, -9, -5, 18, 10, 3); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#b8603f'; ctx.beginPath(); ctx.moveTo(px - r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 0.8, py + r * 0.7); ctx.lineTo(px - r * 0.8, py + r * 0.7); ctx.closePath(); ctx.fill();
      D.spark(ctx, px, py - r * 0.9, r * 0.75, '#fffaf2', 0.3);
    },
    create(stage, api) {
      const lv = api.level, slip = SLIP[lv];
      const world = makeWorld(lv);
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let s, maxH, time, state, camY, acc, aim, mouse, keysDown, clock = 0, winAt = 0, fallFrom = 0, fallNote = null;

      function fresh() {
        s = { p: { x: START.x, y: START.y }, v: { x: 0, y: 0 }, h: { x: START.x + 45, y: HR + 0.5 }, d: { x: 45, y: HR + 0.5 - START.y }, hc: false, hn: { x: 0, y: 1 }, ground: true };
        maxH = 0; time = 0;
      }
      const fin = v => typeof v === 'number' && isFinite(v);
      function restore(o) {
        if (!o || !o.p || !o.v || !o.h || !o.d || ![o.p.x, o.p.y, o.v.x, o.v.y, o.h.x, o.h.y, o.d.x, o.d.y].every(fin)) return false;
        if (o.p.x < 0 || o.p.x > WW || o.p.y < 0 || o.p.y > SUMMIT + 200) return false;
        s = { p: { ...o.p }, v: { ...o.v }, h: { ...o.h }, d: { ...o.d }, hc: !!o.hc, hn: o.hn && fin(o.hn.x) ? { ...o.hn } : { x: 0, y: 1 }, ground: !!o.ground };
        maxH = fin(o.maxH) ? o.maxH : 0; time = fin(o.time) ? o.time : 0;
        return true;
      }
      if (!restore(api.saved)) fresh();
      state = 'play'; acc = 0; camY = s.p.y; fallFrom = s.p.y;
      aim = { a: Math.atan2(s.d.y, s.d.x), l: Math.hypot(s.d.x, s.d.y) };
      mouse = null; keysDown = {};
      api.score(Math.floor(maxH / 10));

      // ---------- input ----------
      function scale() { return view.w / WW; }
      function toScreen(x, y) { const k = scale(); return { x: x * k, y: view.h * 0.58 - (y - camY) * k }; }
      api.on(canvas, 'pointermove', e => {
        const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      });
      api.on(canvas, 'pointerdown', e => { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
      api.keys(e => { keysDown[e.key] = true; if (e.key.startsWith('Arrow')) mouse = null; });
      api.keysUp(e => { keysDown[e.key] = false; });
      function target(dt) {
        if (mouse) {
          const c = toScreen(s.p.x, s.p.y), k = scale();
          const dx = (mouse.x - c.x) / k, dy = -(mouse.y - c.y) / k;
          aim.a = Math.atan2(dy, dx); aim.l = Math.max(HMIN, Math.min(HL, Math.hypot(dx, dy)));
        } else {
          if (keysDown.ArrowLeft) aim.a += 3.2 * dt;
          if (keysDown.ArrowRight) aim.a -= 3.2 * dt;
          if (keysDown.ArrowUp) aim.l = Math.min(HL, aim.l + 160 * dt);
          if (keysDown.ArrowDown) aim.l = Math.max(HMIN, aim.l - 160 * dt);
        }
        return { x: Math.cos(aim.a) * aim.l, y: Math.sin(aim.a) * aim.l };
      }

      function update(dt) {
        if (state !== 'play') return;
        time += dt;
        acc = Math.min(acc + dt, STEP * 8);
        const tg = target(dt);
        while (acc >= STEP) { physics(world, s, tg, slip); acc -= STEP; }
        const hgt = s.p.y - PR;
        if (hgt > maxH) { maxH = hgt; api.score(Math.floor(maxH / 10)); }
        if (s.ground || s.hc) {
          const lost = fallFrom - s.p.y;
          if (lost > 120 && s.ground) { fallNote = { text: `-${Math.round(lost / 10)} m`, t: clock, x: s.p.x, y: s.p.y }; api.sfx('hit'); }
          fallFrom = s.p.y;
        } else fallFrom = Math.max(fallFrom, s.p.y);
        if (s.ground && s.p.y > SUMMIT - 10) win();
      }
      function win() {
        state = 'won'; winAt = clock;
        const score = Math.floor(maxH / 10) + Math.max(0, Math.round(600 - time / 2)) * (lv + 1);
        api.score(score); api.sfx('win');
        api.timeout(() => api.over({ score, title: 'Summit', won: true, message: `Climbed in ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}` }), 1200);
      }

      // ---------- render ----------
      function render() {
        const col = api.colors();
        const { w, h } = view, k = scale();
        const tgtCam = state === 'won' ? SUMMIT - 60 : Math.max(s.p.y + 40, (h * 0.42) / k - 50);
        camY += (tgtCam - camY) * (api.reduceMotion ? 1 : 0.12);
        ctx.clearRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        const hk = Math.min(1, camY / SUMMIT);
        g.addColorStop(0, col.dark ? '#211d19' : `hsl(${35 - hk * 10} 45% ${95 - hk * 3}%)`);
        g.addColorStop(1, col.dark ? '#1a1714' : '#ece2d2');
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
        // drifting specks for depth (slow parallax)
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.08)' : 'rgba(120,95,70,0.12)';
        for (let i = 0; i < 36; i++) {
          const yy = ((i * 173 + camY * 0.4 * k) % (h + 40) + h + 40) % (h + 40) - 20;
          ctx.beginPath(); ctx.arc(((i * 97) % WW) * k, yy, 1.2 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        // height ticks every 10 m
        const top = camY + (h * 0.58) / k, bot = camY - (h * 0.42) / k;
        for (let y = Math.max(100, Math.floor(bot / 100) * 100); y < top; y += 100) {
          const p = toScreen(0, y);
          ctx.fillStyle = col.ink3; ctx.fillRect(p.x + 2, p.y, 6, 1);
          D.text(ctx, `${y / 10} m`, p.x + 11, p.y, 9.5, col.ink3, 650, 'left');
        }
        // best line
        if (maxH > 40) {
          const p = toScreen(0, maxH + PR);
          ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = col.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke(); ctx.restore();
        }
        // rocks
        const rock = col.dark ? '#5a5047' : '#d6c6ad', rockTop = col.dark ? '#6c6157' : '#e6d9c4', rockLow = col.dark ? '#463e36' : '#c3b092';
        world.forEach(sh => {
          if (sh.maxY < bot - 20 || sh.minY > top + 20) return;
          if (sh.t === 'b') {
            const a = toScreen(sh.x, sh.y + sh.h), bw = sh.w * k, bh = sh.h * k, r = sh.r * k;
            ctx.fillStyle = rockLow; D.roundRect(ctx, a.x, a.y, bw, bh, r); ctx.fill();
            ctx.fillStyle = rock; D.roundRect(ctx, a.x, a.y, bw, Math.max(2, bh - 3), r); ctx.fill();
            ctx.fillStyle = rockTop; D.roundRect(ctx, a.x + 2, a.y + 1.5, Math.max(0, bw - 4), Math.min(5, bh * 0.3), 3); ctx.fill();
          } else {
            const a = toScreen(sh.x1, sh.y1), b = toScreen(sh.x2, sh.y2);
            ctx.strokeStyle = rockLow; ctx.lineCap = 'round'; ctx.lineWidth = sh.r * 2 * k;
            ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.lineTo(b.x + 0.01, b.y + 2); ctx.stroke();
            ctx.strokeStyle = rock; ctx.lineWidth = sh.r * 2 * k - 3;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
          }
        });
        // summit marker
        const sp = toScreen(300, SUMMIT + 30);
        if (sp.y > -40 && sp.y < h + 40) {
          ctx.strokeStyle = col.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sp.x, sp.y + 30 * k); ctx.lineTo(sp.x, sp.y - 20 * k); ctx.stroke();
          D.spark(ctx, sp.x, sp.y - 26 * k, 14 * k, col.accent, clock * 0.8);
          D.text(ctx, 'Summit', sp.x, sp.y - 48 * k, 11, col.ink2, 700);
        }
        // hammer
        const pc = toScreen(s.p.x, s.p.y), hc = toScreen(s.h.x, s.h.y);
        const ang = Math.atan2(hc.y - pc.y, hc.x - pc.x);
        ctx.strokeStyle = col.dark ? '#cbbfae' : '#5a4a3a'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pc.x, pc.y - 6 * k); ctx.lineTo(hc.x, hc.y); ctx.stroke();
        ctx.save(); ctx.translate(hc.x, hc.y); ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = col.dark ? '#e9e1d4' : '#2f2a24'; D.roundRect(ctx, -HR * 1.6 * k, -HR * 0.85 * k, HR * 3.2 * k, HR * 1.7 * k, 3); ctx.fill();
        ctx.restore();
        // pot + spark
        const r = PR * k;
        D.spark(ctx, pc.x + Math.cos(ang) * 2, pc.y - r * 0.85, r * 0.82, col.accent, state === 'won' ? clock * 4 : ang * 0.2);
        ctx.fillStyle = col.dark ? '#9c5338' : '#b8603f';
        ctx.beginPath(); ctx.moveTo(pc.x - r * 1.15, pc.y - r * 0.45); ctx.lineTo(pc.x + r * 1.15, pc.y - r * 0.45);
        ctx.lineTo(pc.x + r * 0.8, pc.y + r); ctx.lineTo(pc.x - r * 0.8, pc.y + r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.dark ? '#b8674a' : '#cf7752'; D.roundRect(ctx, pc.x - r * 1.25, pc.y - r * 0.62, r * 2.5, r * 0.4, r * 0.18); ctx.fill();
        // aim ghost (where the hammer wants to be)
        if (state === 'play') {
          const t = toScreen(s.p.x + Math.cos(aim.a) * aim.l, s.p.y + Math.sin(aim.a) * aim.l);
          ctx.strokeStyle = col.ink3; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (fallNote && clock - fallNote.t < 1.4) {
          const p = toScreen(fallNote.x, fallNote.y), a = 1 - (clock - fallNote.t) / 1.4;
          ctx.globalAlpha = a; D.text(ctx, fallNote.text, p.x, p.y - 34 - (1 - a) * 16, 13, col.bad, 750); ctx.globalAlpha = 1;
        }
        // HUD
        ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.85)' : 'rgba(255,252,247,0.85)';
        D.roundRect(ctx, w / 2 - 70, 8, 140, 30, 15); ctx.fill();
        D.text(ctx, `${Math.max(0, Math.floor((s.p.y - PR) / 10))} m`, w / 2 - 22, 23, 14, col.ink, 780);
        D.text(ctx, `best ${Math.floor(maxH / 10)}`, w / 2 + 30, 23, 11, col.ink2, 650);
        if (state === 'won') {
          const a = Math.min(1, (clock - winAt) / 0.5);
          ctx.globalAlpha = a; D.text(ctx, 'You made it to the top', w / 2, 62, 16, col.good, 760); ctx.globalAlpha = 1;
        } else if (time < 6 && maxH < 30) {
          ctx.globalAlpha = Math.min(1, 6 - time);
          D.text(ctx, 'Hook the hammer over a rock, then sweep down to pull', w / 2, h - 18, 11, col.ink2, 650);
          ctx.globalAlpha = 1;
        }
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      Ludus.games.find(x => x.id === 'climb')._peek = () => ({ s, maxH, state, aim, camY, time, toScreen });
      return {
        save() {
          if (state !== 'play' || time < 1) return null;
          return { p: s.p, v: s.v, h: s.h, d: s.d, hc: s.hc, hn: s.hn, ground: s.ground, maxH, time };
        },
        resume() { acc = 0; }
      };
    }
  });
})();
