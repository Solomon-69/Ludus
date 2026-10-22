/* Stack: isometric 3D slabs. Each slab slides in along X, then Z, back and forth; drop it on the tower.
   The overhang is sliced off and falls away; a perfect drop keeps the full size (and grows it back after a streak).
   World units: base slab is 100 x 100, each slab 14 high. y grows upward; the base plinth's top is y = 0. */
(function () {
  const D = Ludus.draw;
  const BASE = 100, H = 14, PED = 46, RANGE = 128;
  const SPEED = [78, 98, 122], TOL = [5, 4, 3], GROW = 6, GROW_AT = 4;
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;

  // Pure rules (also used by tests): cut the sliding slab against the top one along its axis.
  function cut(top, cur, axis, tol) {
    const sz = axis === 'x' ? 'w' : 'd';
    const delta = cur[axis] - top[axis], size = top[sz], ad = Math.abs(delta);
    const keepBox = { x: top.x, z: top.z, w: top.w, d: top.d };
    if (ad <= tol) return { perfect: true, keep: keepBox, chip: null };
    const keep = size - ad;
    if (keep <= 0) return { miss: true };
    const sgn = Math.sign(delta);
    keepBox[sz] = keep; keepBox[axis] = top[axis] + delta / 2;
    const chip = { x: top.x, z: top.z, w: top.w, d: top.d, sgn };
    chip[sz] = ad; chip[axis] = top[axis] + sgn * size / 2 + delta / 2;
    return { perfect: false, keep: keepBox, chip };
  }

  function hueFromColor(c) {
    let r, g, b, m;
    c = String(c || '').trim();
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c))) {
      let hx = m[1]; if (hx.length === 3) hx = hx.replace(/./g, '$&$&');
      r = parseInt(hx.slice(0, 2), 16); g = parseInt(hx.slice(2, 4), 16); b = parseInt(hx.slice(4, 6), 16);
    } else if ((m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c))) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else return 18;
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 18;
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (hh * 60 + 360) % 360;
  }
  // Smooth hue drift up the tower: starts at the accent and wanders warm, then comes back.
  const layerHue = (base, i) => (base + 36 * (1 - Math.cos(i * 0.12))) % 360;
  // Faces: 0 top (lit), 1 left/+z (mid), 2 right/+x (shade). Same light for every slab.
  function shade(h, dark, face, lift) {
    const s = dark ? 40 : 50, l = (dark ? [62, 48, 37] : [80, 67, 56])[face] + (lift || 0);
    return `hsl(${h.toFixed(1)} ${s}% ${Math.min(96, l)}%)`;
  }

  // Draws one box as three faces, with a hairline highlight on the front top edges.
  function drawBox(ctx, P, b, hue, dark, alpha, lift) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const poly = (pts, fill) => {
      ctx.beginPath();
      pts.forEach((p, i) => { const q = P(p[0], p[1], p[2]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke();
    };
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineJoin = 'round';
    poly([[x0, b.y1, z1], [x1, b.y1, z1], [x1, b.y0, z1], [x0, b.y0, z1]], shade(hue, dark, 1, lift));
    poly([[x1, b.y1, z0], [x1, b.y1, z1], [x1, b.y0, z1], [x1, b.y0, z0]], shade(hue, dark, 2, lift));
    poly([[x0, b.y1, z0], [x1, b.y1, z0], [x1, b.y1, z1], [x0, b.y1, z1]], shade(hue, dark, 0, lift));
    const a = P(x0, b.y1, z1), c = P(x1, b.y1, z1), e = P(x1, b.y1, z0);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]);
    ctx.strokeStyle = dark ? 'rgba(255,240,220,0.22)' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Outline of a slab's top face, grown by pad on each side (used for the perfect ripple).
  function diamond(ctx, P, b, y, pad) {
    const x0 = b.x - b.w / 2 - pad, x1 = b.x + b.w / 2 + pad, z0 = b.z - b.d / 2 - pad, z1 = b.z + b.d / 2 + pad;
    ctx.beginPath();
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach((p, i) => { const q = P(p[0], y, p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
  }

  Ludus.register({
    id: 'stack', name: 'Stack', tag: 'Arcade', tint: '#3f8fb3',
    hint: '<kbd>Space</kbd> <kbd>↓</kbd> or click / tap to drop · line it up exactly for a perfect',
    _rules: { cut, hueFromColor, layerHue },
    art(ctx, w, h, colors) {
      const base = hueFromColor((colors && colors.accent) || '#d97757'), dark = !!(colors && colors.dark);
      const S = Math.min(w / 175, h / 170), cx = w / 2, cy0 = h / 2 + 30 * S;
      const P = (x, y, z) => [cx + (x - z) * C30 * S, cy0 + ((x + z) * S30 - y) * S];
      const slabs = [[0, 0, 80, 80], [0, 0, 80, 80], [4, 0, 72, 80], [4, -3, 72, 74], [4, -3, 72, 74], [26, -3, 72, 74]];
      slabs.forEach((s, i) => {
        const y0 = i === 0 ? -24 : (i - 1) * 12;
        drawBox(ctx, P, { x: s[0], z: s[1], w: s[2], d: s[3], y0, y1: i * 12 }, layerHue(base, i * 4), dark);
      });
      D.spark(ctx, cx + w * 0.3, h * 0.2, Math.min(w, h) * 0.08, '#d97757', 0.3);
    },
    create(stage, api) {
      const lv = api.level, rm = api.reduceMotion;
      const view = api.canvas(() => camera(0, true));
      const { ctx, canvas } = view;
      let layers, cur, combo, perfects, state, missAt = 0, clock = 0;
      let chips = [], fx = [], sparks = [], camY = 0, cy = 0, zoom = 1;

      const axisOf = n => (n % 2 ? 'x' : 'z');
      const score = () => layers.length - 1;
      function fresh() {
        layers = [{ x: 0, z: 0, w: BASE, d: BASE }];
        combo = 0; perfects = 0; state = 'play';
        spawn();
      }
      function spawn() {
        const top = layers[layers.length - 1], axis = axisOf(layers.length);
        cur = { x: top.x, z: top.z, w: top.w, d: top.d, axis, dir: 1 };
        cur[axis] = top[axis] - RANGE;
      }
      const okBox = b => b && [b.x, b.z, b.w, b.d].every(v => typeof v === 'number' && isFinite(v)) &&
        b.w > 0 && b.d > 0 && b.w <= BASE + 0.01 && b.d <= BASE + 0.01 && Math.abs(b.x) < 400 && Math.abs(b.z) < 400;
      function restore(s) {
        if (!s || !Array.isArray(s.layers) || s.layers.length < 1 || s.layers.length > 5000) return false;
        if (!s.layers.every(okBox) || !okBox(s.cur) || (s.cur.axis !== 'x' && s.cur.axis !== 'z')) return false;
        layers = s.layers.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d }));
        cur = { x: s.cur.x, z: s.cur.z, w: s.cur.w, d: s.cur.d, axis: s.cur.axis, dir: s.cur.dir === -1 ? -1 : 1 };
        combo = Math.max(0, s.combo | 0); perfects = Math.max(0, s.perfects | 0); state = 'play';
        return true;
      }
      if (!restore(api.saved)) fresh();
      api.score(score());

      const baseScale = () => Math.min(view.w / 330, view.h / 470);
      function speed() { return SPEED[lv] + Math.min(90, score() * 2.2); }
      // Projection: x runs down-right, z runs down-left, y straight up. camY / cy / zoom are the camera.
      function proj() {
        const S = baseScale() * zoom, cx = view.w / 2;
        return (x, y, z) => [cx + (x - z) * C30 * S, cy + ((x + z) * S30 - (y - camY)) * S];
      }
      function camera(dt, snap) {
        const S = baseScale(), n = score();
        let tCam, tCy, tZoom;
        if (state === 'over') {
          // Pull back until the whole tower, plinth included, fits the stage (the result bar sits under it).
          const top = n * H, avail = view.h - 64, need = (top + PED + 104) * S;
          tZoom = Math.min(1, avail / need);
          tCam = top; tCy = 64 + 52 * S * tZoom + Math.max(0, avail - need * tZoom) / 2;
        } else { tCam = (n + 1) * H; tCy = view.h * 0.46; tZoom = 1; }
        const k = snap || rm ? 1 : 1 - Math.exp(-dt * (state === 'over' ? 3.4 : 5.5));
        camY += (tCam - camY) * k; cy += (tCy - cy) * k; zoom += (tZoom - zoom) * k;
      }
      camera(0, true);

      function mkChip(b, n, sgn, axis) {
        const out = 38 * sgn;
        return { x: b.x, z: b.z, w: b.w, d: b.d, y0: (n - 1) * H, y1: n * H, vy: 0, vx: axis === 'x' ? out : 0, vz: axis === 'z' ? out : 0,
          rot: 0, vr: rm ? 0 : sgn * (axis === 'x' ? 1 : -1) * 1.5, t: clock, i: n };
      }
      function burst(b, y) {
        if (rm) return;
        const q = proj()(b.x, y, b.z);
        for (let i = 0; i < 14; i++) {
          const a = Math.PI * 2 * i / 14 + api.rand(-0.2, 0.2), v = api.rand(70, 150);
          sparks.push({ x: q[0], y: q[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 40, t: clock, r: api.rand(1.6, 3) });
        }
      }

      function drop() {
        if (state !== 'play' || !cur) return;
        const n = layers.length, top = layers[n - 1], res = cut(top, cur, cur.axis, TOL[lv]);
        if (res.miss) return miss(n, top);
        const nb = res.keep;
        if (res.perfect) {
          combo++; perfects++;
          const sz = cur.axis === 'x' ? 'w' : 'd';
          const grew = combo >= GROW_AT && nb[sz] < BASE;
          if (grew) nb[sz] = Math.min(BASE, nb[sz] + GROW);
          layers.push(nb);
          fx.push({ b: nb, y: n * H, t: clock, perfect: true });
          burst(nb, n * H);
          api.sfx(grew ? 'line' : 'score');
          if (combo >= 2) api.toast(grew ? `Perfect x${combo} · slab grows` : `Perfect x${combo}`);
        } else {
          combo = 0;
          chips.push(mkChip(res.chip, n, res.chip.sgn, cur.axis));
          layers.push(nb);
          fx.push({ b: nb, y: n * H, t: clock, perfect: false });
          api.sfx('drop');
        }
        api.score(score());
        spawn();
      }
      function miss(n, top) {
        state = 'over'; missAt = clock;
        const sgn = Math.sign(cur[cur.axis] - top[cur.axis]) || cur.dir;
        chips.push(mkChip(cur, n, sgn, cur.axis));
        cur = null; combo = 0;
        api.sfx('hit');
        const s = score();
        api.timeout(() => api.over({
          score: s, title: s ? `${s} slab${s === 1 ? '' : 's'} high` : 'Missed',
          message: perfects ? `${perfects} perfect drop${perfects === 1 ? '' : 's'}` : 'Drop when it lines up with the tower'
        }), 550);
      }

      api.keys(e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); drop(); } });
      api.on(canvas, 'pointerdown', e => { if (e.button === 0 || e.pointerType === 'touch') drop(); });

      function update(dt) {
        if (state === 'play' && cur) {
          const top = layers[layers.length - 1], a = cur.axis, lo = top[a] - RANGE, hi = top[a] + RANGE;
          cur[a] += cur.dir * speed() * dt;
          if (cur[a] > hi) { cur[a] = 2 * hi - cur[a]; cur.dir = -1; }
          if (cur[a] < lo) { cur[a] = 2 * lo - cur[a]; cur.dir = 1; }
        }
        chips.forEach(c => {
          c.vy -= 560 * dt; c.y0 += c.vy * dt; c.y1 += c.vy * dt;
          c.x += c.vx * dt; c.z += c.vz * dt; c.rot += c.vr * dt;
        });
        chips = chips.filter(c => clock - c.t < 1.7);
        fx = fx.filter(f => clock - f.t < 0.8);
        sparks.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; });
        sparks = sparks.filter(p => clock - p.t < 0.7);
        camera(dt);
      }

      function background(col, hue) {
        const { w, h } = view, g = ctx.createLinearGradient(0, 0, 0, h), h2 = (hue + 24) % 360;
        if (col.dark) { g.addColorStop(0, `hsl(${hue.toFixed(1)} 20% 17%)`); g.addColorStop(1, `hsl(${h2.toFixed(1)} 16% 9%)`); }
        else { g.addColorStop(0, `hsl(${hue.toFixed(1)} 42% 94%)`); g.addColorStop(1, `hsl(${h2.toFixed(1)} 34% 83%)`); }
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
        // soft paper glow behind the tower top
        const rg = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.max(w, h) * 0.6);
        rg.addColorStop(0, col.dark ? 'rgba(255,230,200,0.06)' : 'rgba(255,255,255,0.5)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      }

      const layerBox = (b, i) => ({ x: b.x, z: b.z, w: b.w, d: b.d, y0: i ? (i - 1) * H : -PED, y1: i * H });
      function drawChip(P, c, base, dark, S) {
        const age = clock - c.t, alpha = Math.max(0, Math.min(1, 1 - (age - 0.55) / 1.0));
        if (alpha <= 0) return;
        const q = P(c.x, (c.y0 + c.y1) / 2, c.z);
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(c.rot); ctx.translate(-q[0], -q[1]);
        drawBox(ctx, P, c, layerHue(base, c.i), dark, alpha);
        ctx.restore();
      }

      function render() {
        const col = api.colors(), dark = col.dark, { w, h } = view;
        const base = hueFromColor(col.accent), n = score();
        background(col, layerHue(base, n));
        const P = proj(), S = baseScale() * zoom, top = layers[n];
        const off = (y, lead) => cy + (-(y - camY) + lead) * S;

        // ground shadow under the plinth
        const b0 = layers[0];
        ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,60,30,0.14)';
        diamond(ctx, P, b0, -PED, 10); ctx.fill();

        const behind = c => c.x + c.z < top.x + top.z;
        chips.filter(behind).forEach(c => drawChip(P, c, base, dark, S));
        for (let i = 0; i <= n; i++) {
          const bx = layerBox(layers[i], i);
          if (off(bx.y1, -70) > h + 4 || off(bx.y0, 70) < -4) continue;
          drawBox(ctx, P, bx, layerHue(base, i), dark);
        }
        // glow on freshly placed slabs
        fx.forEach(f => {
          const k = (clock - f.t) / 0.8;
          ctx.globalAlpha = (1 - k) * (f.perfect ? 0.55 : 0.3);
          ctx.fillStyle = dark ? 'rgba(255,236,214,1)' : '#ffffff';
          diamond(ctx, P, f.b, f.y, 0); ctx.fill();
          ctx.globalAlpha = 1;
        });
        if (cur) {
          drawBox(ctx, P, { x: cur.x, z: cur.z, w: cur.w, d: cur.d, y0: n * H, y1: (n + 1) * H }, layerHue(base, n + 1), dark);
        }
        chips.filter(c => !behind(c)).forEach(c => drawChip(P, c, base, dark, S));
        // perfect ripple: rings expanding out from the top face
        fx.forEach(f => {
          if (!f.perfect) return;
          const k = Math.min(1, (clock - f.t) / 0.8);
          for (let r = 0; r < (rm ? 1 : 2); r++) {
            const kk = Math.max(0, k - r * 0.18);
            if (kk <= 0) continue;
            ctx.globalAlpha = (1 - kk) * 0.9; ctx.strokeStyle = col.accent; ctx.lineWidth = 2.2 - r * 0.6;
            diamond(ctx, P, f.b, f.y, (rm ? 6 : 4 + D.ease.outCubic(kk) * 26)); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        sparks.forEach(p => {
          ctx.globalAlpha = 1 - (clock - p.t) / 0.7; ctx.fillStyle = col.accent;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        hud(col, n);
      }

      function hud(col, n) {
        const { w, h } = view;
        if (state === 'over') {
          ctx.globalAlpha = Math.min(1, (clock - missAt) / 0.4);
          D.text(ctx, `${n} slab${n === 1 ? '' : 's'} high`, w / 2, 32, 18, col.ink, 760);
          if (perfects) D.text(ctx, `${perfects} perfect`, w / 2, 52, 12, col.accent, 680);
          ctx.globalAlpha = 1;
          return;
        }
        D.text(ctx, String(n), w / 2, 36, 30, col.ink, 790);
        if (combo >= 2) {
          const label = `Perfect x${combo}`;
          ctx.font = `700 12px ui-rounded, system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          D.spark(ctx, w / 2 - tw / 2 - 9, 62, 5.5, col.accent, rm ? 0 : clock * 1.2);
          D.text(ctx, label, w / 2 + 4, 62, 12, col.accent, 700);
        }
        if (n === 0) D.text(ctx, 'Space or click to drop the slab', w / 2, h - 22, 12, col.ink3, 650);
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      if (window.ludusDebug) Ludus.games.find(g => g.id === 'stack')._peek = () => ({ layers, cur, combo, perfects, state, tol: TOL[lv], camY, zoom });
      return {
        save() {
          if (state !== 'play' || !cur || layers.length < 2) return null;
          return {
            layers: layers.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
            cur: { x: cur.x, z: cur.z, w: cur.w, d: cur.d, axis: cur.axis, dir: cur.dir }, combo, perfects
          };
        }
      };
    }
  });
})();
