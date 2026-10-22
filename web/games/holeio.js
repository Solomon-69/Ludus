/* Hole.io: you are a hole in a soft pastel city seen from an angled top-down camera.
   Swallow whatever is smaller than you (people, cones, benches, trees, cars, buses, houses, towers) to grow; bigger holes
   swallow smaller holes. Two minutes, then the final ranking. Drag / WASD / arrows to move. vs Friend: P1 WASD, P2 arrows. */
(function () {
  const D = Ludus.draw;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif';
  const ROUND = 120, COUNT = 2.0, END_HOLD = 3.4;
  const TILT = 0.64, ZK = 0.9, SHEAR0 = 0.22;
  const N = 6, ROAD = 56, BLOCK = 244, PITCH = BLOCK + ROAD, WORLD = N * PITCH + ROAD;
  const CELL = 100, GC = Math.ceil(WORLD / CELL) + 1;
  const R0 = 12;
  const rOf = m => R0 + 2.1 * Math.sqrt(m);
  const lvOf = m => Math.floor(Math.sqrt(m) / 2) + 1;
  const AI_COLORS = ['#5aa38f', '#e0a526', '#d9779b', '#4aa3c8', '#8f7fd0', '#c9784a', '#7aa84a'];
  const AI_NAMES = ['Moss', 'Bolt', 'Pip', 'Juno', 'Kit', 'Orbit', 'Nova'];
  const UNLOCK = [[18, 'cars'], [30, 'buses'], [38, 'houses'], [52, 'shops'], [80, 'towers']];
  const T = {
    person: { w: 5, d: 5, h: 11, need: 6, val: 1 }, cone: { w: 5, d: 5, h: 8, need: 6, val: 1 },
    lamp: { w: 3, d: 3, h: 30, need: 7, val: 2 }, bench: { w: 15, d: 6, h: 7, need: 9, val: 2 },
    tree: { w: 12, d: 12, h: 30, need: 12, val: 3 }, car: { w: 28, d: 14, h: 11, need: 18, val: 6 },
    bus: { w: 54, d: 16, h: 20, need: 30, val: 14 }, house: { w: 54, d: 46, h: 34, need: 38, val: 24 },
    shop: { w: 84, d: 68, h: 58, need: 52, val: 45 }, tower: { w: 120, d: 120, h: 120, need: 80, val: 100 }
  };

  // ---------- projection: oblique, camera looks from the south; tops lean left so the east side shows ----------
  let SH = SHEAR0, ZV = ZK;
  const px = (x, z) => x - z * SH, py = (y, z) => y * TILT - z * ZV;
  const hsl = (h, s, l) => `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  // [top, south, east] in light and dark
  function tones(h, s, l) {
    return [[hsl(h, s, l + 9), hsl(h, s, l), hsl(h, s, l - 11)], [hsl(h, s * 0.8, (l + 9) * 0.62), hsl(h, s * 0.8, l * 0.62), hsl(h, s * 0.8, (l - 11) * 0.62)]];
  }
  function quad(g, a, b, c, d) {
    g.beginPath(); g.moveTo(px(a[0], a[2]), py(a[1], a[2])); g.lineTo(px(b[0], b[2]), py(b[1], b[2]));
    g.lineTo(px(c[0], c[2]), py(c[1], c[2])); g.lineTo(px(d[0], d[2]), py(d[1], d[2])); g.closePath(); g.fill(); g.stroke();
  }
  function box(g, x0, y0, x1, y1, z0, z1, f) {
    g.lineWidth = 0.45; g.lineJoin = 'round';
    if (SH > 0.02) { g.fillStyle = g.strokeStyle = f[2]; quad(g, [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]); }
    else if (SH < -0.02) { g.fillStyle = g.strokeStyle = f[2]; quad(g, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]); }
    g.fillStyle = g.strokeStyle = f[1]; quad(g, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
    g.fillStyle = g.strokeStyle = f[0]; quad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }
  function winsS(g, x0, x1, y, zA, zB, cols, rows, col) {
    g.fillStyle = col; g.beginPath();
    const cw = (x1 - x0) / cols, rh = (zB - zA) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const xa = x0 + c * cw + cw * 0.2, xb = xa + cw * 0.6, za = zA + r * rh + rh * 0.2, zb = za + rh * 0.6;
      g.moveTo(px(xa, za), py(y, za)); g.lineTo(px(xb, za), py(y, za)); g.lineTo(px(xb, zb), py(y, zb)); g.lineTo(px(xa, zb), py(y, zb)); g.closePath();
    }
    g.fill();
  }
  function winsE(g, x, y0, y1, zA, zB, cols, rows, col) {
    if (SH < 0.02) return;
    g.fillStyle = col; g.beginPath();
    const cw = (y1 - y0) / cols, rh = (zB - zA) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ya = y0 + c * cw + cw * 0.2, yb = ya + cw * 0.6, za = zA + r * rh + rh * 0.2, zb = za + rh * 0.6;
      g.moveTo(px(x, za), py(ya, za)); g.lineTo(px(x, za), py(yb, za)); g.lineTo(px(x, zb), py(yb, zb)); g.lineTo(px(x, zb), py(ya, zb)); g.closePath();
    }
    g.fill();
  }
  function shadow(g, x0, y0, x1, y1, h, dark) {
    g.save(); g.scale(1, TILT); g.fillStyle = dark ? 'rgba(0,0,0,0.28)' : 'rgba(80,60,40,0.13)';
    D.roundRect(g, x0 + 1, y0 + 1, x1 - x0 + h * 0.34, y1 - y0 + h * 0.22, 3); g.fill(); g.restore();
  }
  function blob(g, x, y, rx, dark) {
    g.fillStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(80,60,40,0.14)';
    g.beginPath(); g.ellipse(x, y, rx, rx * TILT, 0, 0, Math.PI * 2); g.fill();
  }

  // Draws one object with its base centre at (0,0), 1 unit = 1 world unit.
  function drawObj(g, o, dark) {
    const k = dark ? 1 : 0, hw = o.w / 2, hd = o.d / 2, f = o.c ? o.c[k] : null;
    switch (o.t) {
      case 'person': {
        blob(g, 0.6, 0.4, 3.4, dark);
        g.fillStyle = g.strokeStyle = o.sh; g.lineWidth = 0.4;
        quad(g, [-2.2, 0, 1], [2.2, 0, 1], [1.8, 0, 8], [-1.8, 0, 8]);
        g.fillStyle = dark ? '#e8c9ae' : '#f1cdb0';
        g.beginPath(); g.arc(px(0, 10.2), py(0, 10.2), 2.5, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'cone': {
        blob(g, 0.6, 0.4, 3.6, dark);
        g.fillStyle = dark ? '#ec9a58' : '#f2994a';
        g.beginPath(); g.moveTo(-3.4, py(1, 0)); g.lineTo(3.4, py(1, 0)); g.lineTo(px(0, 8), py(0, 8)); g.closePath(); g.fill();
        g.fillStyle = '#fffaf3'; g.beginPath(); g.moveTo(px(-2, 3.4), py(1, 3.4)); g.lineTo(px(2, 3.4), py(1, 3.4)); g.lineTo(px(1.2, 5), py(1, 5)); g.lineTo(px(-1.2, 5), py(1, 5)); g.closePath(); g.fill();
        break;
      }
      case 'lamp': {
        blob(g, 0.6, 0.4, 3, dark);
        box(g, -0.8, -0.8, 0.8, 0.8, 0, o.h, dark ? ['#7a756d', '#6a655e', '#59544d'] : ['#d6d0c6', '#bdb6aa', '#a49d91']);
        g.fillStyle = dark ? 'rgba(255,214,140,0.25)' : 'rgba(255,214,140,0.35)';
        g.beginPath(); g.arc(px(0, o.h), py(0, o.h), 5.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = dark ? '#ffd88a' : '#f6c76a'; g.beginPath(); g.arc(px(0, o.h), py(0, o.h), 2.4, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'bench': {
        shadow(g, -hw, -hd, hw, hd, 6, dark);
        box(g, -hw, -hd, hw, hd, 0, 3.4, f);
        box(g, -hw, -hd, hw, -hd + 1.6, 3.4, 7, f);
        break;
      }
      case 'tree': {
        blob(g, 3, 1.5, 9, dark);
        box(g, -1.7, -1.7, 1.7, 1.7, 0, o.h * 0.55, dark ? ['#6b5547', '#5c4639', '#4a372c'] : ['#c9a888', '#b69373', '#9d7b5d']);
        const zc = o.h * 0.7, cx = px(0, zc), cy = py(0, zc);
        g.fillStyle = f[2]; g.beginPath(); g.arc(cx + 1.2, cy + 1.6, hw * 1.02, 0, Math.PI * 2); g.fill();
        g.fillStyle = f[1]; g.beginPath(); g.arc(cx, cy, hw, 0, Math.PI * 2); g.fill();
        g.fillStyle = f[0]; g.beginPath(); g.arc(cx - hw * 0.28, cy - hw * 0.3, hw * 0.58, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'car': {
        shadow(g, -hw, -hd, hw, hd, 8, dark);
        g.fillStyle = dark ? '#1b1815' : '#4a4038';
        if (o.horiz) { [-0.62, 0.62].forEach(s => { g.beginPath(); g.ellipse(hw * s, hd * TILT + 0.3, 2.8, 2.2, 0, 0, Math.PI * 2); g.fill(); }); }
        else { [-0.62, 0.62].forEach(s => { g.beginPath(); g.ellipse(hw, hd * s * TILT, 1.4, 2.8, 0, 0, Math.PI * 2); g.fill(); }); }
        box(g, -hw, -hd, hw, hd, 1.5, 7, f);
        const gl = dark ? '#33414f' : '#bfd4e4';
        if (o.horiz) {
          box(g, -hw * 0.5, -hd * 0.82, hw * 0.28, hd * 0.82, 7, 11.5, o.c2[k]);
          winsS(g, -hw * 0.46, hw * 0.24, hd * 0.82, 7.6, 11, 2, 1, gl);
        } else {
          box(g, -hw * 0.82, -hd * 0.5, hw * 0.82, hd * 0.28, 7, 11.5, o.c2[k]);
          winsS(g, -hw * 0.78, hw * 0.78, hd * 0.28, 7.6, 11, 1, 1, gl);
        }
        break;
      }
      case 'bus': {
        shadow(g, -hw, -hd, hw, hd, 14, dark);
        box(g, -hw, -hd, hw, hd, 2, o.h, f);
        const gl = dark ? '#33414f' : '#cfe0ec';
        if (o.horiz) winsS(g, -hw + 3, hw - 3, hd, 10.5, 17, 7, 1, gl); else winsE(g, hw, -hd + 3, hd - 3, 10.5, 17, 7, 1, gl);
        g.fillStyle = dark ? '#1b1815' : '#4a4038';
        for (let i = 0; i < 2; i++) { g.beginPath(); if (o.horiz) g.ellipse((i ? 0.58 : -0.58) * hw, hd * TILT + 0.3, 3, 2.4, 0, 0, Math.PI * 2); else g.ellipse(hw, (i ? 0.58 : -0.58) * hd * TILT, 1.6, 3, 0, 0, Math.PI * 2); g.fill(); }
        break;
      }
      case 'house': {
        shadow(g, -hw, -hd, hw, hd, o.h, dark);
        const h0 = o.h * 0.56, rf = o.c2[k], e = 3.5;
        box(g, -hw, -hd, hw, hd, 0, h0, f);
        winsS(g, -hw + 4, hw - 4, hd, 5, h0 - 3, 3, 1, dark ? 'rgba(255,224,160,0.55)' : 'rgba(255,255,255,0.7)');
        winsE(g, hw, -hd + 4, hd - 4, 5, h0 - 3, 2, 1, dark ? 'rgba(255,224,160,0.45)' : 'rgba(255,255,255,0.55)');
        const ax0 = -hw - e, ax1 = hw + e, ay0 = -hd - e, ay1 = hd + e, rx = hw * 0.22, ry = hd * 0.16;
        g.lineWidth = 0.45;
        if (SH >= 0) { g.fillStyle = g.strokeStyle = rf[2]; quad(g, [ax1, ay1, h0], [ax1, ay0, h0], [rx, -ry, o.h], [rx, ry, o.h]); }
        else { g.fillStyle = g.strokeStyle = rf[2]; quad(g, [ax0, ay1, h0], [ax0, ay0, h0], [-rx, -ry, o.h], [-rx, ry, o.h]); }
        g.fillStyle = g.strokeStyle = rf[1]; quad(g, [ax0, ay1, h0], [ax1, ay1, h0], [rx, ry, o.h], [-rx, ry, o.h]);
        g.fillStyle = g.strokeStyle = rf[0]; quad(g, [-rx, -ry, o.h], [rx, -ry, o.h], [rx, ry, o.h], [-rx, ry, o.h]);
        break;
      }
      case 'shop': {
        shadow(g, -hw, -hd, hw, hd, o.h, dark);
        box(g, -hw, -hd, hw, hd, 0, o.h, f);
        g.lineWidth = 0.45; g.fillStyle = g.strokeStyle = o.c2[k][1];
        quad(g, [-hw - 2, hd, 22], [hw + 2, hd, 22], [hw + 2, hd + 8, 17], [-hw - 2, hd + 8, 17]);
        if (SH > 0.02) { g.fillStyle = g.strokeStyle = o.c2[k][2]; quad(g, [hw + 2, hd, 22], [hw + 2, hd + 8, 17], [hw + 2, hd + 8, 14], [hw + 2, hd, 18]); }
        winsS(g, -hw + 5, hw - 5, hd, 24, o.h - 4, 5, 2, dark ? 'rgba(255,224,160,0.5)' : 'rgba(255,255,255,0.62)');
        winsS(g, -hw + 5, hw - 5, hd, 3, 14, 5, 1, dark ? 'rgba(160,200,230,0.4)' : 'rgba(150,185,215,0.5)');
        winsE(g, hw, -hd + 5, hd - 5, 6, o.h - 4, 4, 3, dark ? 'rgba(255,224,160,0.4)' : 'rgba(255,255,255,0.5)');
        box(g, -12, -10, 6, 4, o.h, o.h + 6, o.c2[k]);
        break;
      }
      case 'tower': {
        shadow(g, -hw, -hd, hw, hd, o.h, dark);
        const hb = o.h * 0.68, gl = dark ? 'rgba(255,224,160,0.45)' : 'rgba(255,255,255,0.58)', gl2 = dark ? 'rgba(160,200,230,0.35)' : 'rgba(255,255,255,0.4)';
        box(g, -hw, -hd, hw, hd, 0, hb, f);
        winsS(g, -hw + 6, hw - 6, hd, 8, hb - 5, 7, 6, gl); winsE(g, hw, -hd + 6, hd - 6, 8, hb - 5, 7, 6, gl2);
        const u = 0.68; box(g, -hw * u, -hd * u, hw * u, hd * u, hb, o.h, f);
        winsS(g, -hw * u + 5, hw * u - 5, hd * u, hb + 5, o.h - 4, 5, 3, gl); winsE(g, hw * u, -hd * u + 5, hd * u - 5, hb + 5, o.h - 4, 5, 3, gl2);
        g.strokeStyle = dark ? '#8a8378' : '#b3aa9c'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(px(0, o.h), py(0, o.h)); g.lineTo(px(0, o.h + 16), py(0, o.h + 16)); g.stroke();
        g.fillStyle = '#e8715a'; g.beginPath(); g.arc(px(0, o.h + 16), py(0, o.h + 16), 1.8, 0, Math.PI * 2); g.fill();
        break;
      }
    }
  }

  Ludus.register({
    id: 'holeio', name: 'Hole.io', aka: 'black hole city swallow', tag: 'Arcade', tint: '#5f8f94', versus: true, online: { min: 2, max: 4 },
    onlineHint: '<b>Online</b> 2 to 4 players plus bots · drag, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrows to move · biggest hole when time is up wins',
    hint: 'Drag, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> to move · swallow what fits, grow, eat smaller holes · vs Friend: <b>P1</b> WASD, <b>P2</b> arrows',
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(0, h * 0.58, w, h * 0.1); ctx.fillRect(w * 0.62, 0, w * 0.09, h);
      const b = (x, y, bw, bd, bh, c1, c2, c3) => {
        ctx.fillStyle = c3; ctx.beginPath(); ctx.moveTo(x + bw, y); ctx.lineTo(x + bw - bh * 0.22, y - bh * 0.8); ctx.lineTo(x + bw - bh * 0.22, y - bh * 0.8 - bd); ctx.lineTo(x + bw, y - bd); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c2; ctx.fillRect(x, y - bh * 0.8, bw, bh * 0.8);
        ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x, y - bh * 0.8); ctx.lineTo(x + bw, y - bh * 0.8); ctx.lineTo(x + bw - bh * 0.22, y - bh * 0.8 - bd); ctx.lineTo(x - bh * 0.22, y - bh * 0.8 - bd); ctx.closePath(); ctx.fill();
      };
      b(w * 0.08, h * 0.5, w * 0.16, h * 0.09, h * 0.36, '#fff3e6', '#f2dcc6', '#dcc3aa');
      b(w * 0.3, h * 0.46, w * 0.15, h * 0.08, h * 0.26, '#e8f3ee', '#cfe4da', '#b4cdc1');
      b(w * 0.76, h * 0.5, w * 0.15, h * 0.08, h * 0.3, '#e9eef8', '#d3dcee', '#b9c5de');
      const hx = w * 0.5, hy = h * 0.78;
      ctx.fillStyle = 'rgba(255,248,240,0.9)'; ctx.beginPath(); ctx.ellipse(hx, hy, h * 0.28, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1713'; ctx.beginPath(); ctx.ellipse(hx, hy + 1, h * 0.25, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b8def'; ctx.beginPath(); ctx.ellipse(w * 0.86, h * 0.84, h * 0.09, h * 0.056, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1713'; ctx.beginPath(); ctx.ellipse(w * 0.86, h * 0.845, h * 0.075, h * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend, LV = api.level, rm = api.reduceMotion;
      // The city is built from rng: online every screen builds it from the room's shared random stream, so all
      // screens start with the same city and only what changes (eaten things, new cars, the holes) is sent.
      let rng = Math.random;
      const rnd = (a, b) => a + rng() * (b - a);
      const pick = a => a[Math.floor(rng() * a.length)];
      const randI = (a, b) => Math.floor(a + rng() * (b - a + 1));
      const on = api.online, guest = !!(on && !on.isHost), solo = !friend || !!on;
      const HCOL = [null, null, D.P2, '#4f9d69', '#9b6dd6'];
      const TYPES = Object.keys(T);
      const byId = new Map(); let nextObj = 1;
      const goneOut = [], spawnOut = [];   // online host: eaten things and new movers not yet sent
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

      // ---------- input ----------
      const pads = { p1: { up: 0, down: 0, left: 0, right: 0 }, p2: { up: 0, down: 0, left: 0, right: 0 } };
      const ptr = { down: false, x: 0, y: 0 };
      const K1 = { w: 'up', s: 'down', a: 'left', d: 'right' }, K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      function padFor(e) {
        const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (K1[k]) return [pads.p1, K1[k]];
        if (K2[k]) return [solo ? pads.p1 : pads.p2, K2[k]];
        return null;
      }
      api.keys(e => { const m = padFor(e); if (m) { e.preventDefault(); m[0][m[1]] = 1; } });
      api.keysUp(e => { const m = padFor(e); if (m) m[0][m[1]] = 0; });
      const clearPads = () => { Object.keys(pads).forEach(p => Object.keys(pads[p]).forEach(k => { pads[p][k] = 0; })); ptr.down = false; };
      api.on(window, 'blur', clearPads);
      const place = e => { const r = view.canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; };
      view.canvas.style.touchAction = 'none';
      api.on(view.canvas, 'pointerdown', e => { ptr.down = true; place(e); try { view.canvas.setPointerCapture(e.pointerId); } catch (x) {} });
      api.on(view.canvas, 'pointermove', e => { if (ptr.down) place(e); });
      api.on(view.canvas, 'pointerup', () => { ptr.down = false; });
      api.on(view.canvas, 'pointercancel', () => { ptr.down = false; });

      // ---------- the city ----------
      let grid, movers, objs, respawns, holes, parts, pops, notes;
      const gi = v => clamp(Math.floor(v / CELL), 0, GC - 1);
      const roadC = i => i * PITCH + ROAD / 2;
      let parkSet;

      function mk(type, x, y, extra) {
        const t = T[type];
        const o = Object.assign({ t: type, x, y, w: t.w, d: t.d, h: t.h, need: t.need, val: t.val, vx: 0, vy: 0, fall: null, mover: false }, extra || {});
        o.eff = Math.max(o.w, o.d) / 2; o.id = nextObj++; byId.set(o.id, o);
        switch (type) {
          case 'person': o.sh = pick(['#e58f7a', '#7fb3d5', '#a5c98a', '#e8c35d', '#c9a3d6', '#f1a7bb']); break;
          case 'bench': o.c = tones(28, 36, 62); break;
          case 'tree': o.c = tones(rnd(95, 150), rnd(32, 44), rnd(60, 68)); break;
          case 'car': { const hu = pick([8, 38, 170, 205, 340, 100]); o.c = tones(hu, 52, 70); o.c2 = tones(hu, 40, 80); o.horiz = o.w > o.d; break; }
          case 'bus': { const hu = pick([42, 175, 12]); o.c = tones(hu, 55, 68); o.horiz = o.w > o.d; break; }
          case 'house': { const hu = pick([25, 45, 160, 200, 340, 12]); o.c = tones(hu, 42, 82); o.c2 = tones(pick([8, 18, 215, 350]), 38, 64); break; }
          case 'shop': { const hu = pick([35, 190, 150, 270, 345]); o.c = tones(hu, 36, 84); o.c2 = tones(pick([5, 175, 45, 330]), 48, 70); break; }
          case 'tower': { const hu = pick([210, 190, 30, 255]); o.c = tones(hu, 24, 82); break; }
        }
        return o;
      }
      const addStatic = o => { const k = gi(o.y) * GC + gi(o.x); (grid[k] || (grid[k] = [])).push(o); objs++; return o; };

      function laneCar(type) {
        const axisX = rng() < 0.5, k = randI(0, N), dir = rng() < 0.5 ? 1 : -1;
        const along = rnd(0, WORLD), off = dir * 9;
        const t = T[type], len = Math.max(t.w, t.d), wid = Math.min(t.w, t.d);
        const o = mk(type, axisX ? along : roadC(k) + off, axisX ? roadC(k) + off : along, { w: axisX ? len : wid, d: axisX ? wid : len, mover: true });
        o.horiz = axisX; o.axisX = axisX; o.dir = dir; o.sp = (type === 'bus' ? rnd(30, 38) : rnd(42, 64));
        o.vx = axisX ? dir * o.sp : 0; o.vy = axisX ? 0 : dir * o.sp; o.eff = len / 2;
        return o;
      }
      function walker() {
        const axisX = rng() < 0.5, k = randI(0, N), side = rng() < 0.5 ? -1 : 1;
        const o = mk('person', 0, 0, { mover: true }), along = rnd(0, WORLD), off = side * (ROAD / 2 - 7), sp = rnd(7, 14) * (rng() < 0.5 ? 1 : -1);
        o.axisX = axisX; o.x = axisX ? along : roadC(k) + off; o.y = axisX ? roadC(k) + off : along; o.dir = sp > 0 ? 1 : -1; o.sp = Math.abs(sp);
        o.vx = axisX ? sp : 0; o.vy = axisX ? 0 : sp;
        return o;
      }

      function build() {
        grid = []; movers = []; objs = 0; respawns = []; byId.clear(); nextObj = 1;
        if (on) rng = () => on.rand();
        parkSet = new Set();
        while (parkSet.size < 5) { const i = randI(0, N - 1), j = randI(0, N - 1); if (!(i >= 2 && i <= 3 && j >= 2 && j <= 3)) parkSet.add(i + ',' + j); }
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const bx = ROAD + i * PITCH, by = ROAD + j * PITCH, cx = bx + BLOCK / 2, cy = by + BLOCK / 2;
          const d = Math.hypot(cx - WORLD / 2, cy - WORLD / 2) / (WORLD / 2);
          const list = [];
          const fits = (x, y, r) => list.every(q => Math.hypot(q[0] - x, q[1] - y) > q[2] + r);
          const put = (type, x, y, r, extra) => { list.push([x, y, r]); return addStatic(mk(type, x, y, extra)); };
          const scatter = (type, n, rad, margin) => {
            for (let a = 0, c = 0; c < n && a < n * 25; a++) {
              const x = rnd(bx + margin, bx + BLOCK - margin), y = rnd(by + margin, by + BLOCK - margin);
              if (fits(x, y, rad)) { put(type, x, y, rad); c++; }
            }
          };
          // lamps on the corners
          [[14, 14], [BLOCK - 14, 14], [14, BLOCK - 14], [BLOCK - 14, BLOCK - 14]].forEach(c => put('lamp', bx + c[0], by + c[1], 4));
          if (parkSet.has(i + ',' + j)) {
            scatter('tree', randI(13, 18), 11, 20); scatter('bench', 4, 10, 30); scatter('lamp', 3, 6, 24); scatter('person', randI(7, 11), 5, 20);
          } else if (d < 0.52) {
            if (rng() < 0.65) put('tower', cx + rnd(-8, 8), cy + rnd(-8, 8), 86);
            else { scatter('shop', randI(2, 3), 62, 50); }
            scatter('tree', 3, 11, 18); scatter('bench', 1, 10, 22);
          } else if (d < 0.74) {
            scatter('shop', randI(1, 2), 62, 50); scatter('house', randI(1, 3), 38, 34);
            scatter('tree', randI(3, 5), 11, 18); scatter('bench', 1, 10, 22);
          } else {
            scatter('house', randI(3, 5), 38, 34); scatter('tree', randI(4, 7), 11, 18); scatter('bench', 1, 10, 22);
          }
        }
        for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {   // cones at crossings
          if (rng() < 0.55) { const n = randI(1, 3), x = roadC(i) + rnd(-12, 12), y = roadC(j) + rnd(-12, 12); for (let q = 0; q < n; q++) addStatic(mk('cone', x + rnd(-9, 9), y + rnd(-9, 9))); }
        }
        for (let i = 0; i < 46; i++) movers.push(laneCar('car'));
        for (let i = 0; i < 8; i++) movers.push(laneCar('bus'));
        for (let i = 0; i < 100; i++) movers.push(walker());
        rng = Math.random;
      }

      // ---------- holes ----------
      let phase = 'count', phaseT = COUNT, timeLeft = ROUND, clock = 0, lastTick = -1, overCalled = false, result = null;
      function nameFor(h) { return on && h.human ? Ludus.rt.seatName(api, h.human - 1) : h.human === 1 ? (friend ? 'P1' : 'You') : h.human === 2 ? 'P2' : h.name; }
      // this screen's own hole(s): online only the seat's hole; on one keyboard every human hole
      const isMine = h => (on ? h.human === on.seat + 1 : !!h.human);
      const myHole = () => holes.find(isMine) || holes[0];
      function newHole(i, human) {
        return { id: i, human, name: AI_NAMES[i % AI_NAMES.length], color: AI_COLORS[i % AI_COLORS.length], x: 0, y: 0, vx: 0, vy: 0, mass: 0, rr: R0, alive: true, respawn: 0, invuln: 0, pulse: 0, falling: [], dying: null, eatenBy: '', ai: { t: 0, tgt: null, mode: '', wx: 0, wy: 0, spd: 0, aggr: 0, stuck: 0, lx: 0, ly: 0 }, lastLv: 1, unlocked: 0 };
      }
      function crossings() { const a = []; for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) a.push([roadC(i), roadC(j)]); return a; }
      function spawnPos(h) {
        let best = null, bd = -1;
        for (let t = 0; t < 14; t++) {
          const x = roadC(api.randInt(1, N - 1)), y = roadC(api.randInt(1, N - 1));
          let dmin = 1e9;
          holes.forEach(o => { if (o !== h && o.alive) dmin = Math.min(dmin, Math.hypot(o.x - x, o.y - y) - o.rr * 2); });
          if (dmin > bd) { bd = dmin; best = [x, y]; }
          if (dmin > 300) break;
        }
        h.x = best[0]; h.y = best[1];
      }
      function startRound() {
        build(); parts = []; pops = []; notes = [];
        holes = [];
        if (guest) { phase = 'count'; phaseT = COUNT; timeLeft = ROUND; lastTick = -1; result = null; cam.snap = true; api.score(0); return; }   // the host's copy fills in the holes
        const nAI = on ? 2 + LV : (friend ? 4 : 5) + LV;
        if (on) on.seats.forEach(st => holes.push(newHole(holes.length, st + 1)));
        else {
          holes.push(newHole(0, 1));
          if (friend) holes.push(newHole(1, 2));
        }
        for (let i = 0; i < nAI; i++) { const h = newHole(holes.length, 0); h.name = AI_NAMES[i]; h.color = AI_COLORS[i % AI_COLORS.length]; h.ai.spd = [0.7, 0.8, 0.9][LV] * rnd(0.92, 1.04); h.ai.aggr = [0.35, 0.6, 0.85][LV] * rnd(0.8, 1.15); holes.push(h); }
        holes[0].x = roadC(2); holes[0].y = roadC(3);
        if (on) holes.forEach(h => { if (h.human) { const k = h.id; h.x = roadC([2, 4, 2, 4][k] || 3); h.y = roadC([3, 3, 2, 4][k] || 3); } });
        else if (friend) { holes[1].x = roadC(4); holes[1].y = roadC(3); }
        const cs = crossings().filter(c => Math.hypot(c[0] - roadC(3), c[1] - roadC(3)) > PITCH * 1.4);
        for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
        let ci = 0;
        holes.forEach(h => { if (!h.human) { const c = cs[ci++ % cs.length]; h.x = c[0]; h.y = c[1]; } });
        holes.forEach(h => { h.invuln = 0; });
        phase = 'count'; phaseT = COUNT; timeLeft = ROUND; lastTick = -1; result = null;
        cam.snap = true; api.score(0);
      }

      // ---------- camera ----------
      const cam = { x: WORLD / 2, y: WORLD / 2, s: 1.6, snap: true, yoff: 0, top: 52, bot: 56 };
      function humans() { return holes.filter(h => (on ? isMine(h) : h.human)); }
      function singleScale(rmax) {
        const { w, h } = view, zw = 96 + rmax * 4.4;
        return (0.62 * Math.min(w, h * 0.92) + 0.38 * Math.sqrt(w * h * 0.92)) / zw;
      }
      function camLimits() {   // friend: how far apart the two humans may be on screen
        const hs = humans(); if (hs.length < 2) return null;
        const rmax = Math.max(hs[0].rr, hs[1].rr), sMin = singleScale(rmax) * 0.5, playH = view.h - cam.top - cam.bot;
        return { dx: (view.w - 70) / sMin - hs[0].rr - hs[1].rr, dy: (playH - 60) / sMin / TILT - (hs[0].rr + hs[1].rr) };
      }
      function updateCamera(dt) {
        const hs = humans(), live = hs.filter(h => h.alive || h.dying);
        const use = live.length ? live : hs;
        let tx = 0, ty = 0, rmax = 0;
        use.forEach(h => { tx += h.x; ty += h.y; rmax = Math.max(rmax, h.rr); });
        tx /= use.length; ty /= use.length;
        const playH = view.h - cam.top - cam.bot;
        let s = singleScale(Math.max(rmax, ...hs.map(h => h.rr * 0.85)));
        if (use.length > 1) {
          const a = use[0], b = use[1];
          const sx = (view.w - 70) / (Math.abs(a.x - b.x) + a.rr + b.rr), sy = (playH - 60) / (Math.abs(a.y - b.y) * TILT + (a.rr + b.rr) * TILT);
          s = Math.min(s, sx, sy);
        }
        const k = cam.snap ? 1 : 1 - Math.exp(-5 * dt), ks = cam.snap ? 1 : 1 - Math.exp(-2.6 * dt);
        cam.s += (s - cam.s) * ks;
        cam.yoff = (cam.top + (view.h - cam.bot)) / 2 - view.h / 2;
        const halfW = view.w / 2 / cam.s, halfH = (view.h / 2 - cam.yoff) / (cam.s * TILT), halfHb = (view.h / 2 + cam.yoff) / (cam.s * TILT);
        const m = 40;
        let cx = tx, cy = ty;
        cx = WORLD + 2 * m > 2 * halfW ? clamp(cx, halfW - m, WORLD - halfW + m) : WORLD / 2;
        cy = WORLD + 2 * m > halfH + halfHb ? clamp(cy, halfH - m, WORLD - halfHb + m) : WORLD / 2;
        cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k; cam.snap = false;
      }
      // perspective-like lean: tops of tall things lean away from the screen centre (the player's hole); nearer (lower) things are taller
      function setLean(x, y) {
        SH = -clamp((x - cam.x) * cam.s / (view.w * 0.5), -1, 1) * 0.4;
        ZV = ZK * (1 + 0.28 * clamp((y - cam.y) * cam.s * TILT / (view.h * 0.5), -1, 1));
      }
      const sxOf = x => (x - cam.x) * cam.s + view.w / 2, syOf = y => (y - cam.y) * cam.s * TILT + view.h / 2 + cam.yoff;

      // ---------- gameplay ----------
      function canEat(h, o) {
        if (o.need > h.rr) return false;
        const d = Math.hypot(o.x - h.x, o.y - h.y);
        return d < Math.max(h.rr * 0.4, h.rr - o.eff * 0.55);
      }
      let sfxAt = 0;
      function startFall(h, o) {
        o.fall = { h, t: 0, dur: 0.4 + o.eff * 0.006, x0: o.x, y0: o.y, side: o.x >= h.x ? 1 : -1 };
        h.falling.push(o); h.pulse = Math.min(1, 0.35 + o.val / 40);
        if (on && !guest) { goneOut.push([o.id, h.id]); byId.delete(o.id); }
        if (clock - sfxAt > 0.07 && isMine(h)) { sfxAt = clock; api.sfx(o.val >= 14 ? 'score' : 'eat'); }
        if (!rm && o.val >= 6) for (let i = 0; i < Math.min(10, 3 + o.val / 12); i++) { const a = rnd(0, 6.28); parts.push({ x: h.x + Math.cos(a) * h.rr * 0.9, y: h.y + Math.sin(a) * h.rr * 0.9, vx: Math.cos(a) * rnd(10, 40), vy: Math.sin(a) * rnd(10, 40), z: 2, vz: rnd(20, 50), life: 0.6, h }); }
      }
      function finishFall(h, o) {
        if (!h.alive) return;
        const before = h.mass; h.mass += o.val;
        if (isMine(h)) {
          if (o.val >= 3 && pops.length < 14) pops.push({ x: h.x + rnd(-6, 6), y: h.y, z: 0, t: 0, text: '+' + o.val, h });
          grew(h, before);
        }
        if (o.mover && o.t !== 'bus') respawns.push({ t: rnd(14, 26), type: o.t });
        else if (o.t === 'bus') respawns.push({ t: rnd(20, 32), type: 'bus' });
      }
      // unlock messages and level-up sounds when this screen's hole grows
      function grew(h, before) {
        {
          const r0 = rOf(before), r1 = rOf(h.mass);
          UNLOCK.forEach(([need, label], i) => { if (r0 < need && r1 >= need && i >= h.unlocked) { h.unlocked = i + 1; notes.push({ t: 0, text: `${friend && !on ? nameFor(h) + ': ' : ''}Big enough for ${label}`, h }); api.sfx('power'); } });
          const l1 = lvOf(h.mass);
          if (l1 > h.lastLv) { h.lastLv = l1; h.pulse = 1; if (!(notes.length && notes[notes.length - 1].text.startsWith('Level'))) api.sfx('line'); }
        }
      }

      function sweep(h) {
        const q = h.rr, x0 = gi(h.x - q), x1 = gi(h.x + q), y0 = gi(h.y - q), y1 = gi(h.y + q);
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
          const arr = grid[cy * GC + cx]; if (!arr) continue;
          for (let k = arr.length - 1; k >= 0; k--) if (canEat(h, arr[k])) { const o = arr[k]; arr.splice(k, 1); startFall(h, o); }
        }
        for (let k = movers.length - 1; k >= 0; k--) if (canEat(h, movers[k])) { const o = movers[k]; movers.splice(k, 1); startFall(h, o); }
      }

      const remote = {};   // online host: each guest's stick, by human number
      function humanDir(h) {
        if (on && !isMine(h)) return remote[h.human] || [0, 0, 0];
        const p = h.human === 2 && !on ? pads.p2 : pads.p1;
        let dx = p.right - p.left, dy = p.down - p.up;
        const m = Math.hypot(dx, dy);
        if (m) return [dx / m, dy / m, 1];
        if ((on || h.human === 1) && ptr.down) {
          const ex = ptr.x - sxOf(h.x), ey = ptr.y - syOf(h.y), dist = Math.hypot(ex, ey);
          if (dist > 5) { const wx = ex / cam.s, wy = ey / (cam.s * TILT), wm = Math.hypot(wx, wy); return [wx / wm, wy / wm, clamp(dist / 56, 0, 1)]; }
        }
        return [0, 0, 0];
      }

      function think(h, dt) {
        const a = h.ai; a.t -= dt;
        if (a.tgt && (a.tgt.fall || (a.tgt.rr !== undefined && !a.tgt.alive))) a.t = Math.min(a.t, 0);
        if (a.t > 0) return;
        a.t = rnd(0.25, 0.5);
        const keen = [0.6, 0.85, 1][LV];
        // 1. run from bigger holes
        let threat = null, td = 1e9;
        holes.forEach(o => { if (o !== h && o.alive && o.rr > h.rr * 1.12) { const d = Math.hypot(o.x - h.x, o.y - h.y) - o.rr; if (d < td) { td = d; threat = o; } } });
        if (threat && td < (90 + h.rr * 2.2) * keen) {
          a.mode = 'flee'; a.tgt = null;
          let ex = h.x - threat.x, ey = h.y - threat.y, m = Math.hypot(ex, ey) || 1;
          ex /= m; ey /= m;
          const pad = 160;   // do not flee into a wall
          if (h.x < pad) ex += 0.9; if (h.x > WORLD - pad) ex -= 0.9; if (h.y < pad) ey += 0.9; if (h.y > WORLD - pad) ey -= 0.9;
          const tx = ex + -ey * 0.35 * (h.id % 2 ? 1 : -1), ty = ey + ex * 0.35 * (h.id % 2 ? 1 : -1), tm = Math.hypot(tx, ty) || 1;
          a.wx = h.x + tx / tm * 300; a.wy = h.y + ty / tm * 300; return;
        }
        // 2. hunt smaller holes close by
        let prey = null, pd = 1e9;
        holes.forEach(o => { if (o !== h && o.alive && !o.invuln && h.rr > o.rr * 1.22) { const d = Math.hypot(o.x - h.x, o.y - h.y); if (d < pd) { pd = d; prey = o; } } });
        if (prey && pd < 160 + h.rr * 2.4 && (a.mode === 'hunt' || Math.random() < a.aggr)) { a.mode = 'hunt'; a.tgt = prey; return; }
        // 3. best snack
        let best = null, bs = 0;
        const R = 200 + h.rr * 2.4, x0 = gi(h.x - R), x1 = gi(h.x + R), y0 = gi(h.y - R), y1 = gi(h.y + R);
        const consider = o => {
          if (o.need > h.rr * 0.98 || o.fall) return;
          const d = Math.hypot(o.x - h.x, o.y - h.y);
          if (d > R) return;
          const s = (o.val + 1.5) / (d + 40);
          if (s > bs) { bs = s; best = o; }
        };
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const arr = grid[cy * GC + cx]; if (arr) for (let k = 0; k < arr.length; k++) consider(arr[k]); }
        for (let k = 0; k < movers.length; k++) consider(movers[k]);
        if (best) { a.mode = 'eat'; a.tgt = best; return; }
        a.mode = 'wander'; a.tgt = null;
        if (Math.hypot(a.wx - h.x, a.wy - h.y) < 80 || a.wx === 0) { a.wx = rnd(150, WORLD - 150); a.wy = rnd(150, WORLD - 150); }
      }

      function stepHole(h, dt, live) {
        h.pulse = Math.max(0, h.pulse - dt * 3); h.invuln = Math.max(0, h.invuln - dt);
        for (let i = h.falling.length - 1; i >= 0; i--) {
          const o = h.falling[i]; o.fall.t += dt;
          if (o.fall.t >= o.fall.dur) { h.falling.splice(i, 1); finishFall(h, o); }
        }
        if (!h.alive) {
          if (h.dying) { h.dying.t += dt; if (h.dying.t >= 0.4) h.dying = null; }
          else if (live) { h.respawn -= dt; if (h.respawn <= 0) respawn(h); }
          return;
        }
        h.rr += (rOf(h.mass) - h.rr) * Math.min(1, dt * 7);
        if (!live) { h.vx *= 0.85; h.vy *= 0.85; return; }
        let dx = 0, dy = 0, mag = 0;
        if (h.human) { [dx, dy, mag] = humanDir(h); }
        else {
          think(h, dt);
          const a = h.ai;
          let tx = a.wx, ty = a.wy;
          if (a.tgt) { tx = a.tgt.x + (a.tgt.vx || 0) * 0.25; ty = a.tgt.y + (a.tgt.vy || 0) * 0.25; }
          const ex = tx - h.x, ey = ty - h.y, m = Math.hypot(ex, ey);
          if (m > 3) { dx = ex / m; dy = ey / m; mag = 1; }
          if (a.mode === 'wander') mag = 0.7;
        }
        const sp = (116 + h.rr * 0.75) * (h.human ? 1 : h.ai.spd);
        const k = Math.min(1, dt * 9);
        const ox = h.x, oy = h.y;
        h.vx += (dx * mag * sp - h.vx) * k; h.vy += (dy * mag * sp - h.vy) * k;
        h.x = clamp(h.x + h.vx * dt, h.rr * 0.6, WORLD - h.rr * 0.6); h.y = clamp(h.y + h.vy * dt, h.rr * 0.6, WORLD - h.rr * 0.6);
        h.ox = ox; h.oy = oy;
        solids(h);
        sweep(h);
      }

      // Buildings too big to swallow yet are walls: the hole can overlap an edge but not slide under them.
      function solids(h) {
        const q = h.rr + 70, x0 = gi(h.x - q), x1 = gi(h.x + q), y0 = gi(h.y - q), y1 = gi(h.y + q), e = h.rr * 0.5;
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
          const arr = grid[cy * GC + cx]; if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const o = arr[k];
            if (o.w < 40 || o.need <= h.rr) continue;
            const hw = o.w / 2 + e, hd = o.d / 2 + e, dx = h.x - o.x, dy = h.y - o.y;
            if (Math.abs(dx) < hw && Math.abs(dy) < hd) {
              const px_ = hw - Math.abs(dx), py_ = hd - Math.abs(dy);
              if (px_ < py_) { h.x += (dx < 0 ? -px_ : px_); h.vx = 0; } else { h.y += (dy < 0 ? -py_ : py_); h.vy = 0; }
            }
          }
        }
      }

      function respawn(h) {
        spawnPos(h);
        h.mass = Math.min(60, h.mass * 0.25); h.rr = rOf(h.mass); h.alive = true; h.invuln = 2.6; h.vx = h.vy = 0; h.ai.tgt = null; h.ai.t = 0; h.pulse = 1; h.lastLv = lvOf(h.mass);
        if (isMine(h)) api.sfx('power');
      }

      function eatHoles() {
        for (const a of holes) {
          if (!a.alive) continue;
          for (const b of holes) {
            if (a === b || !b.alive || b.invuln > 0 || a.rr < b.rr * 1.18) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) < a.rr - b.rr * 0.5) {
              b.alive = false; b.dying = { t: 0, by: a, x0: b.x, y0: b.y, r0: b.rr }; b.respawn = b.human ? 2.8 : 2.2; b.eatenBy = nameFor(a); b.eatenIdx = a.id;
              a.mass += b.mass * 0.35 + 6; a.pulse = 1; b.mass = b.mass; b.vx = b.vy = 0;
              if (isMine(b) || isMine(a)) api.sfx(isMine(b) ? 'lose' : 'boom');
              if (!rm) for (let i = 0; i < 16; i++) { const an = rnd(0, 6.28); parts.push({ x: b.x, y: b.y, vx: Math.cos(an) * rnd(20, 80), vy: Math.sin(an) * rnd(20, 80), z: 4, vz: rnd(20, 60), life: 0.7, h: b }); }
              if (isMine(a)) pops.push({ x: a.x, y: a.y, z: 0, t: 0, text: 'Ate ' + nameFor(b), h: a });
            }
          }
        }
      }

      function leash() {   // friend mode: the two humans must stay on one screen
        const lim = camLimits(); if (!lim) return;
        const [a, b] = humans(); if (!a.alive || !b.alive) return;
        if (Math.abs(a.x - b.x) > lim.dx) { [a, b].forEach(h => { if (Math.abs(h.x - h.ox) > 0 && Math.abs(h.x - (h === a ? b : a).x) > Math.abs(h.ox - (h === a ? b : a).x)) { h.x = h.ox; h.vx = 0; } }); }
        if (Math.abs(a.y - b.y) > lim.dy) { [a, b].forEach(h => { if (Math.abs(h.y - h.oy) > 0 && Math.abs(h.y - (h === a ? b : a).y) > Math.abs(h.oy - (h === a ? b : a).y)) { h.y = h.oy; h.vy = 0; } }); }
      }

      function stepMovers(dt) {
        for (let i = 0; i < movers.length; i++) {
          const o = movers[i];
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (o.t === 'person') {
            const v = o.axisX ? o.x : o.y;
            if (v < 10 || v > WORLD - 10) { o.dir = -o.dir; o.vx = o.axisX ? o.dir * o.sp : 0; o.vy = o.axisX ? 0 : o.dir * o.sp; }
          } else {
            if (o.axisX) { if (o.x > WORLD + 40) o.x = -40; else if (o.x < -40) o.x = WORLD + 40; }
            else { if (o.y > WORLD + 40) o.y = -40; else if (o.y < -40) o.y = WORLD + 40; }
          }
        }
        for (let i = respawns.length - 1; i >= 0; i--) {
          const r = respawns[i]; r.t -= dt;
          if (r.t <= 0) {
            respawns.splice(i, 1);
            const o = r.type === 'person' ? walker() : laneCar(r.type);
            if (r.type !== 'person') { if (o.axisX) o.x = o.dir > 0 ? -40 : WORLD + 40; else o.y = o.dir > 0 ? -40 : WORLD + 40; }
            movers.push(o);
            if (on && !guest) spawnOut.push([o.id, TYPES.indexOf(o.t), Math.round(o.x), Math.round(o.y), o.axisX ? 1 : 0, o.dir, Math.round(o.sp * 10) / 10]);
          }
        }
      }

      function endRound() {
        phase = 'end'; phaseT = END_HOLD; api.sfx('win');
        const r = ranked();
        const mine = holes.filter(h => h.human);
        if (on) { result = null; return; }   // online: every screen builds its own result when the round ends (finishOnline)
        if (friend) {
          const w = mine[0].mass >= mine[1].mass ? mine[0] : mine[1];
          result = { score: Math.round(w.mass), won: true, title: nameFor(w) + ' wins', message: `P1 ${Math.round(mine[0].mass)}  ·  P2 ${Math.round(mine[1].mass)}` };
        } else {
          const rank = r.indexOf(mine[0]) + 1;
          result = { score: Math.round(mine[0].mass), won: rank === 1, title: rank === 1 ? 'You win' : `You came ${ord(rank)}`, message: `Size ${Math.round(mine[0].mass)}, level ${lvOf(mine[0].mass)} · ${rank} of ${r.length}` };
        }
      }
      const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
      const ranked = () => holes.slice().sort((a, b) => b.mass - a.mass);

      function update(dt) {
        clock += dt;
        if (phase === 'count') { phaseT -= dt; if (phaseT <= 0) { phase = 'play'; api.sfx('score'); } }
        else if (phase === 'play') {
          timeLeft -= dt;
          if (timeLeft <= 10 && Math.ceil(timeLeft) !== lastTick && timeLeft > 0) { lastTick = Math.ceil(timeLeft); api.sfx('tick'); }
          if (timeLeft <= 0) { timeLeft = 0; endRound(); }
        } else if (phase === 'end') {
          phaseT -= dt;
          if (phaseT <= 0 && !overCalled) {
            overCalled = true;
            if (on) { on.send('end', { m: holes.map(x => Math.round(x.mass)) }); finishOnline(holes.map(x => Math.round(x.mass))); }
            else api.over(result);
          }
        }
        const live = phase === 'play';
        stepMovers(live || phase === 'count' ? dt : 0);
        holes.forEach(h => stepHole(h, dt, live));
        if (live) { eatHoles(); if (friend && !on) leash(); }
        holes.forEach(h => { if (h.human && h.alive) { /* keep stats fresh */ } });
        const me = myHole(); if (me) api.score(me.mass);
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 120 * dt; p.life -= dt; if (p.life <= 0) parts.splice(i, 1); }
        for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.9) pops.splice(i, 1); }
        for (let i = notes.length - 1; i >= 0; i--) { notes[i].t += dt; if (notes[i].t > 2.6) notes.splice(i, 1); }
        updateCamera(dt);
      }

      // ---------- drawing ----------
      const hcol = (h, col) => h.human === 1 ? col.accent : h.human >= 2 ? HCOL[h.human] : h.color;
      function drawGround(col) {
        const { w, h } = view, dark = col.dark;
        ctx.fillStyle = dark ? '#171512' : col.bg2 || '#ece6da'; ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2 - cam.x * cam.s, h / 2 + cam.yoff - cam.y * cam.s * TILT); ctx.scale(cam.s, cam.s * TILT);
        ctx.fillStyle = dark ? '#2a2723' : '#f1ebdf'; D.roundRect(ctx, -10, -10, WORLD + 20, WORLD + 20, 28); ctx.fill();
        const road = dark ? '#37332e' : '#ddd6ca';
        ctx.fillStyle = road;
        for (let i = 0; i <= N; i++) { ctx.fillRect(i * PITCH, 0, ROAD, WORLD); ctx.fillRect(0, i * PITCH, WORLD, ROAD); }
        ctx.strokeStyle = dark ? '#58524a' : '#f8f3ea'; ctx.lineWidth = 2; ctx.setLineDash([12, 12]);
        ctx.beginPath();
        for (let i = 0; i <= N; i++) { ctx.moveTo(roadC(i), 0); ctx.lineTo(roadC(i), WORLD); ctx.moveTo(0, roadC(i)); ctx.lineTo(WORLD, roadC(i)); }
        ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const bx = ROAD + i * PITCH, by = ROAD + j * PITCH;
          ctx.fillStyle = dark ? '#312e29' : '#faf6ec'; D.roundRect(ctx, bx, by, BLOCK, BLOCK, 14); ctx.fill();
          const park = parkSet.has(i + ',' + j);
          ctx.fillStyle = park ? (dark ? '#2f3d2c' : '#d3e5c3') : (dark ? '#37332d' : '#efe6d4');
          D.roundRect(ctx, bx + 9, by + 9, BLOCK - 18, BLOCK - 18, 10); ctx.fill();
        }
        ctx.restore();
      }

      function holePass(h, col, dark) {
        if (!h.alive && !h.dying) return;
        let x = h.x, y = h.y, rr = h.rr, alpha = 1;
        if (h.dying) { const k = D.ease.inOut(h.dying.t / 0.4); x = h.dying.x0 + (h.dying.by.x - h.dying.x0) * k; y = h.dying.y0 + (h.dying.by.y - h.dying.y0) * k; rr = h.dying.r0 * (1 - 0.85 * k); alpha = 1 - k * 0.6; }
        else if (h.invuln > 0) alpha = 0.55 + 0.45 * Math.abs(Math.sin(clock * 9));
        const sx = sxOf(x), sy = syOf(y), rx = rr * cam.s * (1 + 0.1 * h.pulse), ry = rx * TILT;
        if (sx + rx < -10 || sx - rx > view.w + 10 || sy + ry < -10 || sy - ry > view.h + 10) {
          if (!h.falling.length) return;
        }
        const c = hcol(h, col);
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.16)'; ctx.beginPath(); ctx.ellipse(sx + rx * 0.06, sy + ry * 0.16, rx * 1.12, ry * 1.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(sx, sy, rx * 1.1, ry * 1.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark ? '#0b0907' : '#1d1814'; ctx.beginPath(); ctx.ellipse(sx, sy, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(sx, sy - ry * 0.1, rx * 0.74, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        // objects dropping in: only the part above the front rim shows
        if (h.falling.length) {
          ctx.save();
          const W = rx * 1.8;
          ctx.beginPath(); ctx.moveTo(sx - W, sy - 900); ctx.lineTo(sx + W, sy - 900); ctx.lineTo(sx + W, sy); ctx.lineTo(sx + rx * 0.97, sy);
          ctx.ellipse(sx, sy, rx * 0.97, ry * 0.97, 0, 0, Math.PI, false); ctx.lineTo(sx - W, sy); ctx.closePath(); ctx.clip();
          for (const o of h.falling) {
            const f = o.fall, p = clamp(f.t / f.dur, 0, 1), e = p * p * (3 - 2 * p);
            const ox = f.x0 + (x - f.x0) * e, oy = f.y0 + (y - f.y0) * e;
            const k = 1 - 0.8 * p * p, sink = p * p * (o.h * ZK + ry * 0.9) * cam.s * 0.9;
            setLean(ox, oy); SH += f.side * 0.45 * Math.sin(Math.min(1, p / 0.4) * Math.PI / 2) * (1 - p * 0.4);
            ctx.save(); ctx.translate(sxOf(ox), syOf(oy) + sink); ctx.scale(cam.s * k, cam.s * k);
            drawObj(ctx, o, dark); ctx.restore();
          }
          SH = SHEAR0; ZV = ZK; ctx.restore();
        }
        // front rim: a bright lip so the drop reads as going down
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, rx * 0.1); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(sx, sy, rx * 1.03, ry * 1.03, 0, 0, Math.PI); ctx.stroke();
        ctx.globalAlpha = alpha * 0.25 * h.pulse; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sx, sy, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.restore();
      }

      const vis = [];
      function worldPass(col, dark) {
        const { w, h } = view;
        const hx = w / 2 / cam.s + 90, yTop = cam.y - (h / 2 - cam.yoff) / (cam.s * TILT) - 30, yBot = cam.y + (h / 2 + cam.yoff) / (cam.s * TILT) + 180;
        const x0 = cam.x - hx, x1 = cam.x + hx;
        vis.length = 0;
        for (let cy = gi(yTop); cy <= gi(yBot); cy++) for (let cx = gi(x0); cx <= gi(x1); cx++) {
          const arr = grid[cy * GC + cx]; if (!arr) continue;
          for (let k = 0; k < arr.length; k++) { const o = arr[k]; if (o.x > x0 - 60 && o.x < x1 + 60 && o.y > yTop - 60 && o.y < yBot) vis.push(o); }
        }
        for (let k = 0; k < movers.length; k++) { const o = movers[k]; if (o.x > x0 && o.x < x1 && o.y > yTop && o.y < yBot) vis.push(o); }
        vis.sort((a, b) => a.y - b.y);
        for (let k = 0; k < vis.length; k++) {
          const o = vis[k];
          setLean(o.x, o.y);
          ctx.save(); ctx.translate(sxOf(o.x), syOf(o.y)); ctx.scale(cam.s, cam.s);
          drawObj(ctx, o, dark); ctx.restore();
        }
        SH = SHEAR0; ZV = ZK;
      }

      function tag(str, x, y, size, fill, line) {
        ctx.font = `700 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.strokeStyle = line; ctx.strokeText(str, x, y);
        ctx.fillStyle = fill; ctx.fillText(str, x, y);
      }
      function labels(col) {
        holes.forEach(hh => {
          if (!hh.alive) return;
          const sx = sxOf(hh.x), sy = syOf(hh.y), rx = hh.rr * cam.s, ry = rx * TILT;
          if (sx < -40 || sx > view.w + 40 || sy < -40 || sy > view.h + 60) return;
          const str = nameFor(hh), y = sy - ry - 11, c = hcol(hh, col);
          if (hh.human) {
            ctx.font = `700 11px ${FONT}`; const tw = ctx.measureText(str).width, total = tw + 15;
            D.spark(ctx, sx - total / 2 + 5, y, 5, c, hh.human === 1 ? clock * 0.8 : -clock * 0.8);
            tag(str, sx + total / 2 - tw / 2, y, 11, col.ink, col.surface);
          } else tag(str, sx, y, 10.5, col.ink2, col.surface);
        });
      }
      function fx(col) {
        parts.forEach(p => {
          const sx = sxOf(p.x), sy = syOf(p.y) - p.z * cam.s * ZK;
          ctx.globalAlpha = Math.max(0, p.life / 0.7); ctx.fillStyle = hcol(p.h, col);
          ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        pops.forEach(p => {
          const sx = sxOf(p.h.x), sy = syOf(p.h.y) - p.h.rr * cam.s * TILT - 22 - p.t * 34;
          ctx.globalAlpha = Math.max(0, 1 - p.t / 0.9);
          tag(p.text, sx + (p.x - p.h.x) * cam.s, sy, 12, col.ink, col.surface);
        });
        ctx.globalAlpha = 1;
      }

      // ---------- HUD ----------
      function pill(x, y, w, h, col, r) {
        ctx.save(); ctx.fillStyle = col.surface; ctx.globalAlpha = 0.93; ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        D.roundRect(ctx, x, y, w, h, r === undefined ? h / 2 : r); ctx.fill(); ctx.restore();
      }
      function clip(s, size, maxW, weight) {
        ctx.font = `${weight || 650} ${size}px ${FONT}`;
        if (ctx.measureText(s).width <= maxW) return s;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
        return s + '…';
      }
      const mmss = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

      function hud(col) {
        const { w, h } = view, r = ranked();
        // timer
        const low = phase === 'play' && timeLeft <= 10;
        pill(10, 10, 66, 28, col);
        D.text(ctx, mmss(phase === 'count' ? ROUND : timeLeft), 43, 24.5, 14, low && Math.floor(clock * 2) % 2 ? col.bad : low ? col.bad : col.ink, 760);
        // leaderboard
        const lw = clamp(w * 0.3, 108, 132), lx = w - 10 - lw, RH = 17;
        const top = r.slice(0, 5), extra = holes.filter(x => isMine(x) && !top.includes(x));
        const rows = top.map(x => [x, r.indexOf(x) + 1]).concat(extra.map(x => [x, r.indexOf(x) + 1]));
        pill(lx, 10, lw, 10 + rows.length * RH, col, 12);
        rows.forEach(([x, rank], i) => {
          const y = 10 + 5 + i * RH + RH / 2 + (i >= top.length ? 0 : 0), c = hcol(x, col);
          if (x.human) { ctx.save(); ctx.fillStyle = c; ctx.globalAlpha = 0.14; D.roundRect(ctx, lx + 4, y - RH / 2 + 1, lw - 8, RH - 2, 7); ctx.fill(); ctx.restore(); }
          D.text(ctx, String(rank), lx + 13, y, 10, col.ink3, 700, 'center');
          if (x.human) D.spark(ctx, lx + 27, y, 4.6, c, 0); else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 27, y, 3.6, 0, Math.PI * 2); ctx.fill(); }
          const sc = String(Math.round(x.mass)); ctx.font = `700 11px ${FONT}`;
          const scw = ctx.measureText(sc).width;
          D.text(ctx, sc, lx + lw - 9, y, 11, x.alive ? col.ink : col.ink3, 700, 'right');
          D.text(ctx, clip(nameFor(x), 11, lw - 44 - scw - 6, x.human ? 750 : 650), lx + 36, y, 11, x.alive ? col.ink : col.ink3, x.human ? 750 : 650, 'left');
        });
        // size / level
        const mine = holes.filter(isMine), n = mine.length, bw = Math.min(n === 1 ? 210 : 170, (w - 20 - (n - 1) * 10) / n), by = h - 48;
        mine.forEach((x, i) => {
          const bx = n === 1 ? (w - bw) / 2 : i === 0 ? 10 : w - 10 - bw, lv = lvOf(x.mass), lo = 4 * (lv - 1) * (lv - 1), hi = 4 * lv * lv, c = hcol(x, col);
          pill(bx, by, bw, 38, col, 14);
          D.spark(ctx, bx + 16, by + 13, 6, c, 0);
          D.text(ctx, clip((friend && !on ? nameFor(x) + '  ' : '') + 'Level ' + lv, 11.5, bw - 80, 750), bx + 28, by + 13, 11.5, col.ink, 750, 'left');
          D.text(ctx, String(Math.round(x.mass)), bx + bw - 12, by + 13, 11.5, col.ink2, 700, 'right');
          ctx.fillStyle = col.line; D.roundRect(ctx, bx + 12, by + 25, bw - 24, 6, 3); ctx.fill();
          ctx.fillStyle = c; D.roundRect(ctx, bx + 12, by + 25, Math.max(6, (bw - 24) * clamp((x.mass - lo) / (hi - lo), 0, 1)), 6, 3); ctx.fill();
        });
        // messages
        notes.forEach((nt, i) => {
          const fade = Math.min(1, nt.t / 0.2, (2.6 - nt.t) / 0.4), txt = nt.text;
          ctx.font = `700 12px ${FONT}`; const tw = Math.min(w - 24, ctx.measureText(txt).width + 28);
          ctx.save(); ctx.globalAlpha = fade; pill((w - tw) / 2, by - 36 - i * 32, tw, 26, col);
          D.text(ctx, clip(txt, 12, tw - 20, 700), w / 2, by - 36 - i * 32 + 13, 12, col.ink, 700); ctx.restore();
        });
        let ey = h * 0.4;
        mine.forEach(x => {
          if (x.alive || x.dying || phase !== 'play') return;
          const txt = `${friend && !on ? nameFor(x) + ' was ' : 'You were '}eaten by ${x.eatenBy}. Back in ${Math.max(1, Math.ceil(x.respawn))}`;
          ctx.font = `700 12.5px ${FONT}`; const tw = Math.min(w - 24, ctx.measureText(txt).width + 32);
          pill((w - tw) / 2, ey - 15, tw, 30, col); D.text(ctx, clip(txt, 12.5, tw - 22, 700), w / 2, ey, 12.5, col.bad, 700); ey += 38;
        });
        if (phase === 'count') {
          const n3 = Math.ceil(phaseT / (COUNT / 3)), txt = n3 > 0 ? String(clamp(n3, 1, 3)) : 'Go';
          const k = 1 - ((phaseT / (COUNT / 3)) % 1);
          pill(w / 2 - 96, h * 0.3 - 40, 192, 80, col, 22);
          ctx.save(); ctx.translate(w / 2, h * 0.3 - 4); const sc = rm ? 1 : 0.8 + 0.2 * D.ease.outBack(Math.min(1, k * 2)); ctx.scale(sc, sc); D.text(ctx, txt, 0, 0, 38, col.accent, 800); ctx.restore();
          D.text(ctx, clip(friend && !on ? 'P1 WASD  ·  P2 arrows' : 'Drag or WASD to move', 11.5, 180, 650), w / 2, h * 0.3 + 26, 11.5, col.ink2, 650);
        }
        if (phase === 'end') {
          const cw = Math.min(w - 32, 270), RH2 = 22, ch = 50 + r.length * RH2 + 10, cx = (w - cw) / 2, cy = Math.max(8, (h - ch) / 2 - 6);
          const k = rm ? 1 : D.ease.outCubic(clamp((END_HOLD - phaseT) / 0.45, 0, 1));
          ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 14);
          pill(cx, cy, cw, ch, col, 20);
          D.text(ctx, "Time's up", w / 2, cy + 22, 17, col.ink, 800);
          r.forEach((x, i) => {
            const y = cy + 50 + i * RH2 + RH2 / 2, c = hcol(x, col);
            if (x.human) { ctx.save(); ctx.fillStyle = c; ctx.globalAlpha = 0.15; D.roundRect(ctx, cx + 10, y - RH2 / 2 + 1, cw - 20, RH2 - 2, 8); ctx.fill(); ctx.restore(); }
            D.text(ctx, String(i + 1), cx + 24, y, 12, i === 0 ? col.accent : col.ink3, 800);
            if (x.human) D.spark(ctx, cx + 44, y, 5.5, c, 0); else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + 44, y, 4.4, 0, Math.PI * 2); ctx.fill(); }
            D.text(ctx, clip(nameFor(x), 12.5, cw - 120, x.human ? 760 : 650), cx + 58, y, 12.5, col.ink, x.human ? 760 : 650, 'left');
            D.text(ctx, String(Math.round(x.mass)), cx + cw - 22, y, 12.5, col.ink2, 720, 'right');
          });
          ctx.restore();
        }
      }

      function render() {
        const col = api.colors(), dark = col.dark;
        ctx.clearRect(0, 0, view.w, view.h);
        drawGround(col);
        holes.forEach(hh => holePass(hh, col, dark));
        worldPass(col, dark);
        // the player's own ring stays visible when a tall building stands in front
        holes.forEach(hh => {
          if (!hh.human || !hh.alive) return;
          const sx = sxOf(hh.x), sy = syOf(hh.y), rx = hh.rr * cam.s;
          ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = hcol(hh, col); ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.ellipse(sx, sy, rx * 1.02, rx * TILT * 1.02, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        });
        labels(col); fx(col); hud(col);
      }

      startRound();
      if (window.ludusDebug) window.ludusDebug.holeio = () => ({ phase, timeLeft, objs, movers: movers.length, cam: { ...cam }, holes: holes.map(x => ({ n: nameFor(x), x: x.x, y: x.y, mass: x.mass, rr: x.rr, alive: x.alive, falling: x.falling.length, mode: x.ai.mode })), _force: (i, m) => { holes[i].mass = m; holes[i].rr = rOf(m); }, _tp: (i, x, y) => { holes[i].x = x; holes[i].y = y; }, _grid: () => grid.flat().filter(Boolean).map(o => [o.t, o.x, o.y]), _end: () => { timeLeft = 0.05; } });
      // ---------- online: the host runs the city; guests steer their own hole and draw the host's copy ----------
      let link = null, overDone = false, mvAt = 0;
      const num = v => typeof v === 'number' && isFinite(v), r1 = v => Math.round(v * 10) / 10;
      function finishOnline(masses) {
        if (overDone) return; overDone = true;
        const me = myHole(), mine = me ? masses[me.id] : 0, order = holes.map((x, k) => [x, masses[k]]).sort((a, b) => b[1] - a[1]);
        const rank = 1 + masses.filter(m => m > mine).length, top = order[0][0];
        api.over({ score: Math.round(mine), won: rank === 1, title: rank === 1 ? 'You win' : `${nameFor(top)} wins`, message: `Size ${Math.round(mine)}, level ${lvOf(mine)} · ${rank} of ${holes.length}` });
      }
      function moverFrom(q) {   // a car, bus or walker the host added after the start
        const type = TYPES[q[1]]; if (!type || !num(q[2]) || !num(q[3]) || !num(q[6])) return null;
        const axisX = q[4] === 1, dir = q[5] < 0 ? -1 : 1, t = T[type];
        let o;
        if (type === 'person') { o = mk('person', q[2], q[3], { mover: true }); }
        else { const len = Math.max(t.w, t.d), wid = Math.min(t.w, t.d); o = mk(type, q[2], q[3], { w: axisX ? len : wid, d: axisX ? wid : len, mover: true }); o.horiz = axisX; o.eff = len / 2; }
        byId.delete(o.id); o.id = q[0]; byId.set(o.id, o);
        o.axisX = axisX; o.dir = dir; o.sp = q[6]; o.vx = axisX ? dir * o.sp : 0; o.vy = axisX ? 0 : dir * o.sp;
        return o;
      }
      function takeOut(o) {   // remove an eaten thing from the guest's city
        if (o.mover) { const k = movers.indexOf(o); if (k >= 0) movers.splice(k, 1); }
        else { const arr = grid[gi(o.y) * GC + gi(o.x)]; const k = arr ? arr.indexOf(o) : -1; if (k >= 0) arr.splice(k, 1); }
        byId.delete(o.id);
      }
      if (on) {
        link = Ludus.rt(api, {
          hz: 18,
          snapshot: () => {
            if (spawnOut.length) { on.send('spawn', spawnOut.splice(0, 60)); }
            while (goneOut.length) on.send('gone', goneOut.splice(0, 120));
            // a few movers' exact positions each time, so small drifts heal
            const mv = []; if (movers.length) for (let k = 0; k < 8; k++) { const o = movers[(mvAt + k) % movers.length]; mv.push([o.id, Math.round(o.x), Math.round(o.y)]); }
            mvAt = (mvAt + 8) % Math.max(1, movers.length);
            return { ph: phase, tl: r1(timeLeft), pt: r1(phaseT), hl: holes.map(x => [x.human, x.name, AI_COLORS.indexOf(x.color)]),
              h: holes.map(x => [r1(x.x), r1(x.y), r1(x.rr), x.alive ? 1 : 0, x.invuln > 0 ? 1 : 0, Math.round(x.mass), r1(x.respawn), x.eatenIdx === undefined ? -1 : x.eatenIdx]), mv };
          },
          input: () => { const me = myHole(); if (!me) return { x: 0, y: 0, m: 0 }; const d = humanDir(me); return { x: Math.round(d[0] * 100) / 100, y: Math.round(d[1] * 100) / 100, m: Math.round(d[2] * 100) / 100 }; },
          onInput: (seat, d) => { if (num(d.x) && num(d.y) && num(d.m)) { const m = clamp(d.m, 0, 1), l = Math.hypot(d.x, d.y); remote[seat + 1] = l > 0.01 ? [d.x / l, d.y / l, m] : [0, 0, 0]; } },
          onState: applyState
        });
        if (!guest) on.onLeave(seat => { const h = holes.find(x => x.human === seat + 1); if (h) remote[h.human] = [0, 0, 0]; });
        else on.queue((type, d) => {
          if (!Array.isArray(d) && type !== 'end') return true;
          if (type === 'spawn') d.forEach(q => { if (Array.isArray(q) && Number.isInteger(q[0]) && !byId.has(q[0])) { const o = moverFrom(q); if (o) movers.push(o); } });
          else if (type === 'gone') {
            if (!holes.length) return false;
            d.forEach(q => {
              if (!Array.isArray(q)) return; const o = byId.get(q[0]), h = holes[q[1]]; if (!o || !h) return;
              takeOut(o); o.fall = { h, t: 0, dur: 0.4 + o.eff * 0.006, x0: o.x, y0: o.y, side: o.x >= h.x ? 1 : -1 }; h.falling.push(o);
              if (isMine(h)) { h.pulse = Math.min(1, 0.35 + o.val / 40); if (clock - sfxAt > 0.07) { sfxAt = clock; api.sfx(o.val >= 14 ? 'score' : 'eat'); } if (o.val >= 3 && pops.length < 14) pops.push({ x: h.x, y: h.y, z: 0, t: 0, text: '+' + o.val, h }); }
            });
          } else if (type === 'end' && d && Array.isArray(d.m) && d.m.length === holes.length && d.m.every(num)) finishOnline(d.m);
          return true;
        });
      }
      function applyState(d) {
        if (!Array.isArray(d.hl) || !Array.isArray(d.h) || d.hl.length !== d.h.length || d.h.length > 12) return;
        if (holes.length !== d.hl.length) {
          holes = d.hl.map((q, k) => { const x = newHole(k, Number.isInteger(q[0]) && q[0] >= 0 && q[0] <= 4 ? q[0] : 0); x.name = String(q[1] || 'Bot').slice(0, 12); x.color = AI_COLORS[q[2]] || AI_COLORS[k % AI_COLORS.length]; return x; });
          cam.snap = true;
        }
        if (['count', 'play', 'end'].includes(d.ph)) { if (phase === 'count' && d.ph === 'play') api.sfx('score'); if (d.ph === 'end' && phase !== 'end') api.sfx('win'); phase = d.ph; }
        if (num(d.tl)) timeLeft = d.tl; if (num(d.pt)) phaseT = d.pt;
        d.h.forEach((q, k) => {
          const x = holes[k]; if (!Array.isArray(q) || !q.slice(0, 3).every(num)) return;
          const was = x.alive; x.alive = q[3] === 1; x.invuln = q[4] === 1 ? 1 : 0;
          if (num(q[5]) && q[5] !== x.mass) { const before = x.mass; x.mass = q[5]; if (isMine(x) && x.mass > before) grew(x, before); }
          if (num(q[6])) x.respawn = q[6];
          if (was && !x.alive) {
            const by = holes[q[7]] || x; x.eatenBy = nameFor(by); x.dying = { t: 0, by, x0: x.x, y0: x.y, r0: x.rr };
            if (isMine(x) || isMine(by)) api.sfx(isMine(x) ? 'lose' : 'boom');
          }
          if (!was && x.alive) { x.x = q[0]; x.y = q[1]; if (isMine(x)) api.sfx('power'); }
        });
        if (Array.isArray(d.mv)) d.mv.forEach(q => { if (!Array.isArray(q)) return; const o = byId.get(q[0]); if (o && o.mover && !o.fall && num(q[1]) && num(q[2])) { o.x = q[1]; o.y = q[2]; } });
      }
      function guestUpdate(dt) {
        clock += dt;
        const sm = link.sample();
        if (sm && Array.isArray(sm.a.h) && Array.isArray(sm.b.h)) {
          const { a, b, t } = sm, M = Ludus.rt.mix;
          holes.forEach((x, k) => {
            const qa = a.h[k], qb = b.h[k]; if (!Array.isArray(qb) || !num(qb[0])) return;
            const ok = Array.isArray(qa) && num(qa[0]) && qa[3] === qb[3];
            x.x = ok ? M(qa[0], qb[0], t, 120) : qb[0]; x.y = ok ? M(qa[1], qb[1], t, 120) : qb[1]; x.rr = ok ? M(qa[2], qb[2], t) : qb[2];
          });
        }
        const live = phase === 'play';
        if (live || phase === 'count') for (const o of movers) {   // the same straight-line moves as the host (stepMovers without new spawns)
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (o.t === 'person') { const v = o.axisX ? o.x : o.y; if (v < 10 || v > WORLD - 10) { o.dir = -o.dir; o.vx = o.axisX ? o.dir * o.sp : 0; o.vy = o.axisX ? 0 : o.dir * o.sp; } }
          else if (o.axisX) { if (o.x > WORLD + 40) o.x = -40; else if (o.x < -40) o.x = WORLD + 40; }
          else { if (o.y > WORLD + 40) o.y = -40; else if (o.y < -40) o.y = WORLD + 40; }
        }
        holes.forEach(x => {
          x.pulse = Math.max(0, x.pulse - dt * 3);
          for (let i = x.falling.length - 1; i >= 0; i--) { const o = x.falling[i]; o.fall.t += dt; if (o.fall.t >= o.fall.dur) x.falling.splice(i, 1); }
          if (x.dying) { x.dying.t += dt; if (x.dying.t >= 0.4) x.dying = null; }
        });
        if (phase === 'play' && timeLeft <= 10 && Math.ceil(timeLeft) !== lastTick && timeLeft > 0) { lastTick = Math.ceil(timeLeft); api.sfx('tick'); }
        const me = myHole(); if (me) api.score(me.mass);
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 120 * dt; p.life -= dt; if (p.life <= 0) parts.splice(i, 1); }
        for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.9) pops.splice(i, 1); }
        for (let i = notes.length - 1; i >= 0; i--) { notes[i].t += dt; if (notes[i].t > 2.6) notes.splice(i, 1); }
        if (holes.length) updateCamera(dt);
      }
      api.loop(dt => {
        if (guest) guestUpdate(dt); else update(dt);
        if (link) link.step();
        if (holes.length) render();
      });
      return { save() { return on ? { phase, n: holes.length, alive: holes.map(x => x.alive), mass: holes.map(x => Math.round(x.mass)), objs: byId.size, movers: movers.length } : null; }, pause: clearPads, resume: clearPads };
    }
  });
})();
