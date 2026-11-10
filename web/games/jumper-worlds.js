/* Sky Hop's six worlds: the skies, the ground under the start floor, the weather and the effects on the ball.
   Everything here only draws (and moves the little particles); the rules of the game stay in jumper.js.
   Moon, Storm, Monsters and Night are dark in both themes, like the places they show. Classic and Boost follow the theme. */
(function () {
  const TAU = Math.PI * 2;
  const MAX_FX = 180;
  const DARK_WORLDS = ['moon', 'storm', 'monsters', 'night'];
  const hash = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const wrap = (v, n) => ((v % n) + n) % n;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function sprite(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c;
  }
  // a soft round light: eased all the way out, so it has no edge anywhere
  const glows = {};
  function glow(rgb) {
    if (glows[rgb]) return glows[rgb];
    glows[rgb] = sprite(96, 96, g => {
      const r = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      for (let i = 0; i <= 12; i++) { const t = i / 12, e = 1 - t * t * (3 - 2 * t); r.addColorStop(t, `rgba(${rgb},${(e * e).toFixed(3)})`); }
      g.fillStyle = r; g.fillRect(0, 0, 96, 96);
    });
    return glows[rgb];
  }
  function softDot(ctx, rgb, x, y, r, alpha) {
    ctx.globalAlpha = alpha; ctx.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
  }
  // a long bank of cloud that tiles side to side
  const banks = {};
  function bank(rgb, seed, puffs) {
    const key = rgb + seed;
    if (banks[key]) return banks[key];
    banks[key] = sprite(640, 240, (g, w, h) => {
      for (let i = 0; i < puffs; i++) {
        const x = hash(i, seed) * w, y = h * (0.42 + 0.34 * hash(i, seed + 1)), r = 42 + hash(i, seed + 2) * 70;
        for (const dx of [-w, 0, w]) g.drawImage(glow(rgb), x + dx - r, y - r * 0.62, r * 2, r * 1.24);
      }
    });
    return banks[key];
  }
  function drawBank(ctx, img, x, y, width, alpha, size) {
    const w = 640 * size, h = 240 * size;
    ctx.globalAlpha = alpha;
    for (let px = wrap(x, w) - w; px < width; px += w) ctx.drawImage(img, px, y, w, h);
    ctx.globalAlpha = 1;
  }
  const fill = (ctx, o, stops) => {
    const g = ctx.createLinearGradient(0, 0, 0, o.WH);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, o.WW, o.WH + 4);
  };
  function stars(ctx, o, n, drift, alpha) {
    const H = o.WH + 20, shift = -o.camY * drift;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < n; i++) {
      const y = wrap(hash(i, 2) * H + shift, H) - 10, big = hash(i, 5) > 0.86 ? 2 : 1.2;
      ctx.globalAlpha = alpha * (0.3 + hash(i, 4) * 0.7) * (0.65 + 0.35 * Math.sin(o.t * (0.8 + hash(i, 3) * 2) + i));
      ctx.fillRect(hash(i, 1) * o.WW, y, big, big);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- skies ----------
  const earth = () => banks.earth || (banks.earth = sprite(220, 220, g => {
    const c = 110, r = 84;
    g.drawImage(glow('110,170,255'), 0, 0, 220, 220);
    g.save(); g.beginPath(); g.arc(c, c, r, 0, TAU); g.clip();
    const sea = g.createRadialGradient(c - 30, c - 30, 8, c, c, r * 1.1);
    sea.addColorStop(0, '#5fb2ee'); sea.addColorStop(0.6, '#2470c4'); sea.addColorStop(1, '#0f3a78'); g.fillStyle = sea; g.fillRect(0, 0, 220, 220);
    g.fillStyle = '#5a9a58';
    [[70, 86, 34, 22, 0.5], [92, 118, 18, 30, 0.2], [146, 96, 30, 42, -0.3], [158, 150, 18, 12, 0.4], [60, 150, 24, 12, 0.9]].forEach(e => { g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], e[4], 0, TAU); g.fill(); });
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 7; g.lineCap = 'round';
    [[40, 72, 120, 60], [90, 140, 180, 124], [60, 170, 130, 182], [120, 40, 180, 56]].forEach(l => { g.beginPath(); g.moveTo(l[0], l[1]); g.quadraticCurveTo((l[0] + l[2]) / 2, l[1] - 12, l[2], l[3]); g.stroke(); });
    const night = g.createLinearGradient(c - 60, c - 60, c + r, c + r); night.addColorStop(0.45, 'rgba(3,6,18,0)'); night.addColorStop(1, 'rgba(3,6,18,0.92)');
    g.fillStyle = night; g.fillRect(0, 0, 220, 220); g.restore();
  }));
  const sky = {
    classic(ctx, o) {
      fill(ctx, o, o.dark ? ['#0f1a2e', '#1c2a40', '#3a2f33'] : ['#a9daf5', '#dcf1f7', '#fff4e0']);
      softDot(ctx, '255,214,140', o.WW * 0.2, 96 + (-o.camY - o.WH) * 0.03, 130, o.dark ? 0.25 : 0.9);
      const img = bank(o.dark ? '120,135,165' : '255,255,255', 11, 16), H = o.WH + 240;
      for (let i = 0; i < 3; i++) drawBank(ctx, img, o.t * (4 + i * 3) + i * 170, wrap(i * 230 - o.camY * (0.18 + i * 0.12), H) - 200, o.WW, o.dark ? 0.3 : 0.85, 0.5 + i * 0.16);
      ctx.fillStyle = `rgba(10,16,48,${(0.55 * clamp01(o.height / 1500)).toFixed(3)})`; ctx.fillRect(0, 0, o.WW, o.WH + 4);
    },
    moon(ctx, o) {
      fill(ctx, o, ['#03040b', '#080a18', '#12142a']);
      ctx.save(); ctx.translate(o.WW / 2, o.WH / 2); ctx.rotate(-0.5); ctx.scale(1, 0.2);
      softDot(ctx, '150,160,215', 0, 0, o.WH * 0.8, 0.2); ctx.restore();
      stars(ctx, o, 120, 0.06, 0.95);
      const span = o.WH + 280, y = wrap(250 + (-o.camY - o.WH) * 0.05, span) - 140;
      ctx.drawImage(earth(), o.WW * 0.72 - 66, y - 66, 132, 132);
    },
    storm(ctx, o) {
      fill(ctx, o, o.dark ? ['#0a0f19', '#141c2a', '#232c3a'] : ['#1a2433', '#2a3648', '#414c5c']);
      const lit = o.flash * 0.75, H = o.WH + 320, far = bank('74,88,110', 21, 26), near = bank('38,46,60', 22, 30);
      for (let i = 0; i < 3; i++) drawBank(ctx, far, o.windX * 0.14 + i * 210, wrap(i * 260 - o.camY * 0.14, H) - 240, o.WW, 0.75 + lit * 0.25, 0.9);
      if (lit > 0.01) { softDot(ctx, '205,220,255', o.boltX, 90, 330, lit); }
      for (let i = 0; i < 3; i++) drawBank(ctx, near, o.windX * 0.34 + i * 140, wrap(i * 300 + 120 - o.camY * 0.34, H) - 240, o.WW, 0.95, 1.2);
      drawBank(ctx, near, o.windX * 0.5, -110, o.WW, 1, 1.2);
    },
    boost(ctx, o) {
      fill(ctx, o, o.dark ? ['#110e1e', '#2b1530', '#6a2f24'] : ['#fff0d6', '#ffcf94', '#ff9450']);
      const rush = clamp01((o.speed - 300) / 700), H = o.WH + 140, travel = -o.camY * 0.7;
      // 1.12.76 (council pick): soft warm glow orbs drifting past at three depths, no arrows
      const DEPTH = [0.15, 0.3, 0.5];
      for (let i = 0; i < 9; i++) {
        const d = DEPTH[i % 3], r = 26 + hash(i, 3) * 30 + d * 24;
        const x = hash(i, 1) * o.WW + Math.sin(o.t * 0.4 + i) * 10, y = wrap(hash(i, 2) * H - o.camY * d, H) - 70;
        const a = (o.dark ? 0.14 + d * 0.14 : 0.2 + d * 0.2) * (1 + rush * 0.3);
        softDot(ctx, o.dark ? (i % 2 ? '255,148,80' : '255,196,120') : (i % 2 ? '255,255,255' : '255,150,70'), x, y, r, a);
      }
      ctx.globalAlpha = 1;
      speedLines(ctx, o, 26, rush * 0.5);
    },
    monsters(ctx, o) {
      fill(ctx, o, ['#0e0917', '#231029', '#5a1f38']);
      const y = 118 + (-o.camY - o.WH) * 0.03;
      softDot(ctx, '240,130,70', o.WW * 0.68, y, 170, 0.55);
      ctx.fillStyle = '#efa35e'; ctx.beginPath(); ctx.arc(o.WW * 0.68, y, 44, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,70,50,0.5)'; [[-14, -10, 9], [12, 8, 12], [18, -18, 5]].forEach(c => { ctx.beginPath(); ctx.arc(o.WW * 0.68 + c[0], y + c[1], c[2], 0, TAU); ctx.fill(); });
      const H = o.WH + 280, img = bank('30,14,38', 31, 22);
      for (let i = 0; i < 2; i++) drawBank(ctx, img, o.t * 5 + i * 220, wrap(i * 330 - o.camY * 0.22, H) - 220, o.WW, 0.9, 1);
      for (let i = 0; i < 7; i++) {   // something is watching from the dark
        const ex = 26 + hash(i, 7) * (o.WW - 52), ey = wrap(hash(i, 8) * H - o.camY * 0.3, H) - 40;
        const open = Math.sin(o.t * (0.5 + hash(i, 9)) + i * 2) > -0.72 ? 1 : 0.12;
        ctx.fillStyle = 'rgba(255,214,120,0.8)';
        for (const d of [-5, 5]) { ctx.beginPath(); ctx.ellipse(ex + d, ey, 2.6, 2.6 * open, 0, 0, TAU); ctx.fill(); }
      }
    },
    night(ctx, o) { fill(ctx, o, ['#0a1024', '#111a33', '#1b2340']); }
  };
  function speedLines(ctx, o, n, alpha) {
    if (alpha < 0.01) return;
    ctx.strokeStyle = o.dark ? '#ffd9a8' : '#ffffff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const len = 40 + hash(i, 3) * 90, y = wrap(hash(i, 2) * o.WH + o.t * (900 + hash(i, 4) * 700), o.WH + len) - len, x = hash(i, 1) * o.WW;
      ctx.moveTo(x, y); ctx.lineTo(x, y + len);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  // ---------- the ground under the start floor ----------
  function ridge(ctx, o, color, top) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-4, o.camY + o.WH + 8);
    for (let x = -4; x <= o.WW + 12; x += 8) ctx.lineTo(x, top(x));
    ctx.lineTo(o.WW + 12, o.camY + o.WH + 8); ctx.closePath(); ctx.fill();
  }
  function lander(ctx, x) {
    ctx.save(); ctx.translate(x, 0);
    ctx.strokeStyle = '#c9c7cf'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(-20, 0); ctx.moveTo(9, -14); ctx.lineTo(20, 0); ctx.moveTo(-24, 0); ctx.lineTo(-16, 0); ctx.moveTo(16, 0); ctx.lineTo(24, 0); ctx.stroke();
    ctx.fillStyle = '#d6a84a'; ctx.fillRect(-11, -20, 22, 10);
    ctx.fillStyle = '#b9b7c0'; ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-6, -32); ctx.lineTo(6, -32); ctx.lineTo(9, -20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#23263a'; ctx.fillRect(-3, -29, 6, 5);
    ctx.restore();
  }
  const ground = {
    classic(ctx, o) {
      ridge(ctx, o, o.dark ? '#25332c' : '#a8d69a', x => -18 - Math.abs(Math.sin(x * 0.017 + 1)) * 40);
      ridge(ctx, o, o.dark ? '#1c2823' : '#7fbf78', x => 8 + Math.sin(x * 0.03) * 3);
    },
    moon(ctx, o) {
      ridge(ctx, o, '#23253a', x => -30 - Math.abs(Math.sin(x * 0.021 + 1)) * 52 - Math.sin(x * 0.063) * 8);
      ridge(ctx, o, '#3a3c52', x => -8 - Math.abs(Math.sin(x * 0.034 + 2)) * 24);
      lander(ctx, 312);
      ctx.strokeStyle = '#d6d4da'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(46, -36); ctx.stroke();
      ctx.fillStyle = '#d9604a'; ctx.fillRect(46, -36, 20, 12); ctx.fillStyle = '#f4efe7'; ctx.fillRect(46, -32, 20, 3);
      const g = ctx.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#a6a5ae'); g.addColorStop(1, '#5d5d6a');
      ridge(ctx, o, g, x => Math.sin(x * 0.05) * 1.2);
      [[52, 22, 26, 7], [150, 30, 34, 8], [262, 16, 20, 5], [318, 48, 30, 8], [96, 66, 22, 6]].forEach(c => {
        ctx.fillStyle = '#74737f'; ctx.beginPath(); ctx.ellipse(c[0], c[1], c[2], c[3], 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8d8c97'; ctx.beginPath(); ctx.ellipse(c[0] + 3, c[1] + 2, c[2] * 0.82, c[3] * 0.7, 0, 0, TAU); ctx.fill();
      });
    },
    storm(ctx, o) {
      [['#1b2a3a', 10, 6, 0.024, 1.5], ['#14212f', 20, 7, 0.031, -2], ['#0c1622', 30, 8, 0.02, 2.6]].forEach(w => {
        ridge(ctx, o, w[0], x => w[1] + Math.sin(x * w[3] + o.t * w[4]) * w[2] + Math.sin(x * 0.09 - o.t * 1.4) * 2);
      });
    },
    boost(ctx, o) {
      ridge(ctx, o, o.dark ? '#26222e' : '#5b5560', () => 11);
      for (let x = 12; x < o.WW; x += 34) softDot(ctx, '255,160,70', x, 22, 12, 0.5 + 0.5 * Math.sin(o.t * 6 + x));
    },
    monsters(ctx, o) {
      ridge(ctx, o, '#2a1630', x => -22 - Math.abs(Math.sin(x * 0.04 + 1)) * 34 - (Math.floor(x / 8) % 2) * 7);
      ctx.strokeStyle = '#120a18'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(66, 0); ctx.lineTo(62, -40); ctx.moveTo(63, -24); ctx.lineTo(48, -38); ctx.moveTo(62, -32); ctx.lineTo(74, -48); ctx.stroke();
      ctx.fillStyle = '#120a18'; [[286, 16], [316, 12]].forEach(g => { ctx.beginPath(); ctx.arc(g[0], -g[1], 7, Math.PI, 0); ctx.lineTo(g[0] + 7, 0); ctx.lineTo(g[0] - 7, 0); ctx.closePath(); ctx.fill(); });
      ridge(ctx, o, '#150c1c', x => 9 + Math.sin(x * 0.05) * 2);
    },
    night(ctx, o) { ridge(ctx, o, '#141a30', x => -14 - Math.abs(Math.sin(x * 0.02 + 1)) * 30); ridge(ctx, o, '#0c1022', () => 9); }
  };

  // ---------- platforms ----------
  const SKINS = {
    moon: { still: '#8e8d97', move: '#7f93ad', break: '#5d5a5e', spring: '#8e8d97' },
    storm: { still: '#4f7468', move: '#4a6f96', break: '#75614d', spring: '#4f7468', wide: '#39424f' },
    monsters: { still: '#5f8466', move: '#57769e', break: '#7c6652', spring: '#5f8466', wide: '#2c2334' },
    boost: { still: '#22b98a', move: '#2f8ff2', break: '#e29a45', spring: '#22b98a', wide: '#3b3640' }
  };
  function platform(ctx, mode, q, w, h, o) {
    if (mode === 'moon') {
      ctx.fillStyle = 'rgba(40,40,52,0.38)';
      [[-w * 0.28, 1, 4], [w * 0.05, 2, 3], [w * 0.3, 0, 3.4]].forEach(c => { ctx.beginPath(); ctx.ellipse(c[0], c[1], c[2], c[2] * 0.6, 0, 0, TAU); ctx.fill(); });
    } else if (mode === 'storm') {
      const x = wrap(o.t * 90 + q.y, w + 40) - w / 2 - 20;   // wet shine running along the top
      ctx.fillStyle = 'rgba(205,225,255,0.42)'; ctx.fillRect(Math.max(-w / 2 + 4, x), -h / 2 + 2, Math.min(16, w / 2 - 4 - x > 0 ? 16 : 0), 2);
    } else if (mode === 'boost') {
      softDot(ctx, q.type === 'move' ? '90,170,255' : '70,235,180', 0, h / 2 + 2, w * 0.62, 0.45);
      if (q.wide) { ctx.fillStyle = '#f2c230'; for (let x = -w / 2 + 12; x < w / 2 - 12; x += 24) { ctx.beginPath(); ctx.moveTo(x, h / 2 - 1); ctx.lineTo(x + 7, -h / 2 + 1); ctx.lineTo(x + 14, -h / 2 + 1); ctx.lineTo(x + 7, h / 2 - 1); ctx.closePath(); ctx.fill(); } }
    }
  }
  // the light that lifts a pick-up out of the scene, so it can be seen from far off
  const ITEM_RGB = { jet: '255,130,60', coil: '255,214,90', bubble: '120,200,255' };
  function itemBeacon(ctx, item, o) {
    const rgb = ITEM_RGB[item], beat = 0.8 + 0.2 * Math.sin(o.t * 5);
    const g = ctx.createLinearGradient(0, -86, 0, 0); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},0.5)`);
    ctx.fillStyle = g; ctx.fillRect(-7, -86, 14, 86);
    softDot(ctx, rgb, 0, -2, 30 * beat, 0.9);
  }

  // ---------- meteors and lightning ----------
  function meteorTail(ctx, o) {
    const sp = Math.hypot(o.vx, o.v) || 1, ux = -o.vx / sp, uy = -o.v / sp, len = o.r * 5.2;
    const g = ctx.createLinearGradient(o.x, o.y, o.x + ux * len, o.y + uy * len);
    g.addColorStop(0, 'rgba(255,190,110,0.85)'); g.addColorStop(0.45, 'rgba(240,96,50,0.4)'); g.addColorStop(1, 'rgba(200,50,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o.x - uy * o.r, o.y + ux * o.r); ctx.lineTo(o.x + ux * len, o.y + uy * len); ctx.lineTo(o.x + uy * o.r, o.y - ux * o.r); ctx.closePath(); ctx.fill();
    softDot(ctx, '255,150,80', o.x, o.y, o.r * 2.6, 0.75);
  }
  function boltPath(x, top, bottom) {
    const pts = [], steps = 13, branches = [];
    for (let i = 0; i <= steps; i++) {
      const y = top + (bottom - top) * i / steps, px = x + (i === steps ? 0 : (Math.random() * 2 - 1) * 26);
      pts.push([px, y]);
      if (i > 1 && i < steps - 1 && Math.random() < 0.3) {
        const dir = Math.random() < 0.5 ? -1 : 1, arm = [[px, y]];
        for (let k = 1; k <= 4; k++) arm.push([px + dir * k * (9 + Math.random() * 8), y + k * (11 + Math.random() * 8)]);
        branches.push(arm);
      }
    }
    return { pts, branches };
  }
  function strokePath(ctx, pts) { ctx.beginPath(); pts.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](v[0], v[1])); ctx.stroke(); }
  function bolt(ctx, b, age) {
    const a = age < 0.06 ? 1 : age < 0.1 ? 0.3 : age < 0.17 ? 1 : Math.max(0, 1 - (age - 0.17) / 0.2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    [[16, 'rgba(120,160,255,0.14)'], [6, 'rgba(170,200,255,0.5)'], [2.4, '#ffffff']].forEach(s => {
      ctx.globalAlpha = a; ctx.lineWidth = s[0]; ctx.strokeStyle = s[1]; strokePath(ctx, b.path.pts);
      ctx.lineWidth = s[0] * 0.5; b.path.branches.forEach(arm => strokePath(ctx, arm));
    });
    ctx.globalAlpha = 1;
  }
  function boltWarning(ctx, x, o, k) {   // the sky gathers over the spot first, so a strike is never a surprise
    const g = ctx.createLinearGradient(0, 0, 0, o.WH); g.addColorStop(0, `rgba(190,215,255,${(0.42 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(190,215,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 18, 0, 36, o.WH);
    softDot(ctx, '205,225,255', x, 8, 56, 0.7 * k);
  }

  // ---------- weather, in front of everything ----------
  function rain(ctx, o) {
    const lean = Math.max(-0.75, Math.min(0.75, o.wind / 620));
    [[86, 1, 'rgba(180,205,235,0.26)', 18, 760], [44, 1.7, 'rgba(205,225,250,0.42)', 30, 1120]].forEach((l, n) => {
      ctx.strokeStyle = l[2]; ctx.lineWidth = l[1]; ctx.beginPath();
      for (let i = 0; i < l[0]; i++) {
        const x = wrap(hash(i, 1 + n * 7) * (o.WW + 80) + o.windX * (0.5 + n * 0.4) + o.t * l[4] * lean * 0.2, o.WW + 80) - 40;
        const y = wrap(hash(i, 2 + n * 7) * (o.WH + 40) + o.t * l[4], o.WH + 40) - 20;
        ctx.moveTo(x, y); ctx.lineTo(x + lean * l[3], y + l[3]);
      }
      ctx.stroke();
    });
    const gale = clamp01((Math.abs(o.wind) - 120) / 420);
    if (gale > 0) {
      ctx.strokeStyle = 'rgba(225,235,250,0.5)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.globalAlpha = gale; ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = wrap(hash(i, 21) * o.WW + o.windX * 2.6, o.WW + 120) - 60, y = hash(i, 22) * o.WH, len = 34 + hash(i, 23) * 60;
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sign(o.wind) * len * 0.5, y - 5, x + Math.sign(o.wind) * len, y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function weather(ctx, mode, o) {
    if (mode === 'storm' && !o.reduce) rain(ctx, o);
    if (mode === 'boost' && o.jet) {
      speedLines(ctx, o, 18, 0.85);
      const g = ctx.createRadialGradient(o.WW / 2, o.WH / 2, o.WH * 0.25, o.WW / 2, o.WH / 2, o.WH * 0.75);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, 'rgba(255,110,30,0.42)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, o.WW, o.WH + 4);
    }
    if (mode === 'night') {
      stars(ctx, o, 70, 0.05, 0.6);
      for (let i = 0; i < 9; i++) {   // fireflies, drifting in the dark
        const x = o.WW * hash(i, 41) + Math.sin(o.t * 0.7 + i * 2) * 26, y = wrap(o.WH * hash(i, 42) + Math.cos(o.t * 0.5 + i) * 30 - o.camY * 0.5, o.WH);
        softDot(ctx, '200,240,120', x, y, 7, 0.4 + 0.4 * Math.sin(o.t * 2.2 + i * 3));
      }
    }
  }
  function compass(ctx, wind, x, y) {   // how hard and which way the wind is blowing
    const n = Math.abs(wind) < 90 ? 0 : Math.abs(wind) < 320 ? 1 : Math.abs(wind) < 560 ? 2 : 3, d = Math.sign(wind);
    ctx.strokeStyle = '#f4efe7'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) { const cx = x + d * (i - (n - 1) / 2) * 9; ctx.beginPath(); ctx.moveTo(cx - d * 3, y - 5); ctx.lineTo(cx + d * 3, y); ctx.lineTo(cx - d * 3, y + 5); ctx.stroke(); }
  }

  // ---------- the ball ----------
  function ballBack(ctx, mode, b) {
    if (b.jet) {   // the pack and its flame
      const f = 26 + Math.sin(b.t * 48) * 6;
      softDot(ctx, '255,150,50', 0, b.R + f * 0.6, f * 1.3, 0.9);
      for (const x of [-7, 7]) {
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(x - 4.5, b.R + 3); ctx.quadraticCurveTo(x, b.R + f * 2.8, x + 4.5, b.R + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.moveTo(x - 2.2, b.R + 3); ctx.quadraticCurveTo(x, b.R + f * 1.5, x + 2.2, b.R + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d9604a'; ctx.fillRect(x - 4, b.R - 9, 8, 13);
      }
    }
    if (b.coil > 0) {
      ctx.strokeStyle = '#ffd65a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
      const h = 3 + (1 - b.squash) * 3;
      for (let i = 0; i <= 6; i++) ctx[i ? 'lineTo' : 'moveTo'](i % 2 ? 8 : -8, b.R + 1 + i * h);
      ctx.stroke();
    }
  }
  function ballFront(ctx, mode, b) {
    if (mode === 'moon') {   // a little space helmet
      const r = b.R + 6;
      ctx.strokeStyle = 'rgba(225,235,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r - 3, -2.6, -1.7); ctx.stroke();
    }
    if (b.bubble) {
      const r = b.R + 12 + Math.sin(b.t * 5) * 1.4, sq = 1 + Math.sin(b.t * 7) * 0.035;
      ctx.save(); ctx.scale(sq, 2 - sq);
      const g = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
      g.addColorStop(0, 'rgba(130,205,255,0)'); g.addColorStop(0.82, 'rgba(130,205,255,0.2)'); g.addColorStop(1, 'rgba(170,225,255,0.7)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r - 4, -2.5, -1.8); ctx.stroke();
      ctx.restore();
    }
    if (b.zap > 0) {   // still fizzing from the lightning
      softDot(ctx, '190,215,255', 0, 0, b.R * 3.4, b.zap * 0.9);
      ctx.strokeStyle = '#eaf2ff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.globalAlpha = b.zap;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * b.R, Math.sin(a) * b.R);
        for (let k = 1; k <= 3; k++) { const q = a + (Math.random() - 0.5) * 0.9, r = b.R + k * 6; ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  const TRAILS = { moon: '205,215,255', boost: '255,150,60', night: '255,200,130', monsters: '230,110,150' };
  function trail(ctx, mode, list) {
    const rgb = TRAILS[mode]; if (!rgb) return;
    list.forEach((v, i) => softDot(ctx, rgb, v.x, v.y, 7 + i * 0.75, (i + 1) / list.length * (mode === 'boost' ? 0.32 : 0.16)));
  }

  // ---------- particles ----------
  function burst(fx, x, y, opt) {
    for (let i = 0; i < (opt.n || 1) && fx.length < MAX_FX; i++) {
      const a = opt.spread === undefined ? Math.random() * TAU : -Math.PI / 2 + (Math.random() * 2 - 1) * opt.spread, v = (opt.speed || 80) * (0.4 + Math.random() * 0.8);
      fx.push({ x: x + (Math.random() * 2 - 1) * (opt.jitter || 0), y, vx: Math.cos(a) * v + (opt.vx || 0), vy: Math.sin(a) * v + (opt.vy || 0), t: 0,
        life: (opt.life || 0.6) * (0.7 + Math.random() * 0.6), r: (opt.r || 3) * (0.7 + Math.random() * 0.6), g: opt.g || 0, drag: opt.drag === undefined ? 0.2 : opt.drag, rgb: opt.rgb, kind: opt.kind || 'dot' });
    }
  }
  function ring(fx, x, y, rgb, size, life) {
    if (fx.length < MAX_FX) fx.push({ x, y, vx: 0, vy: 0, t: 0, life: life || 0.4, r: size, g: 0, drag: 1, rgb, kind: 'ring' });
  }
  function stepFx(fx, dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      if (f.t >= f.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
      const k = Math.pow(f.drag, dt); f.vx *= k; f.vy = f.vy * k + f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    }
  }
  function drawFx(ctx, fx) {
    for (const f of fx) {
      const k = 1 - f.t / f.life;
      if (f.kind === 'ring') {
        ctx.globalAlpha = k * 0.45; ctx.strokeStyle = `rgb(${f.rgb})`; ctx.lineWidth = 1 + k * 3.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * k), 0, TAU); ctx.stroke();
      } else if (f.kind === 'drop') {
        ctx.globalAlpha = k * 0.6; ctx.strokeStyle = `rgb(${f.rgb})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke();
      } else softDot(ctx, f.rgb, f.x, f.y, f.r * (0.8 + (1 - k) * (f.kind === 'smoke' ? 3 : 0.5)) * 2, k * (f.kind === 'smoke' ? 0.3 : 0.6));
    }
    ctx.globalAlpha = 1;
  }

  Ludus.hopWorlds = {
    isDark: mode => DARK_WORLDS.includes(mode),
    palette(mode, col) {
      return DARK_WORLDS.includes(mode) ? Object.assign({}, col, { dark: true, ink: '#f4efe7', ink2: 'rgba(244,239,231,0.78)', ink3: 'rgba(244,239,231,0.55)', line: 'rgba(255,255,255,0.16)' }) : col;
    },
    sky: (ctx, mode, o) => sky[mode](ctx, o),
    ground: (ctx, mode, o) => { if (o.camY + o.WH > -110) ground[mode](ctx, o); },
    skin: (mode, q) => (SKINS[mode] ? SKINS[mode][q.wide ? 'wide' : q.type] : null),
    hideFloor: mode => mode === 'moon',
    platform, itemBeacon, meteorTail, boltPath, bolt, boltWarning, weather, compass, ballBack, ballFront, trail, burst, ring, stepFx, drawFx, softDot
  };
})();
