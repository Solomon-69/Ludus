/* Worm Arena: a big round arena full of glowing food and AI worms. Steer with the pointer (or the keys), hold click / Space to boost
   (costs length, drops food). Touch another worm's body with your head and you pop into food. Length = score.
   vs Friend: two people on one keyboard in the same arena, one camera that zooms to keep both in view; first to die loses. */
(function () {
  const D = Ludus.draw;
  const R = 2600;                       // arena radius
  const FC = 120, FN = Math.ceil(2 * R / FC) + 2;           // food grid
  const SC = 150, SO = R + 300, SN = Math.ceil((2 * R + 600) / SC) + 2;   // segment grid (collision + AI)
  const MAXN = 460, SEG_CAP = 24000;
  const BASE_V = 175, BOOST_V = 320, START_MASS = 10, MIN_BOOST = 12;
  const WILD_FOOD = 1750, EPHEM_MAX = 1500;
  const TAU = Math.PI * 2;
  const PALETTE = ['#6aa56b', '#d3a136', '#8e6bbf', '#3f9fa6', '#d4688a', '#8d9a3b', '#c9a27e', '#3aa07c', '#a35c9a', '#7a8696', '#e0875a', '#5f9acb'];
  const NAMES = ['Pip', 'Moss', 'Juno', 'Kiwi', 'Bean', 'Orbit', 'Nimbus', 'Fig', 'Tofu', 'Sol', 'Echo', 'Pebble', 'Mango', 'Ziggy', 'Olive', 'Wren', 'Dot', 'Sprout', 'Fable', 'Miso', 'Ash', 'Poppy', 'Rue', 'Taro'];
  const P2COL = D.P2;

  // ---------- small helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };   // a - b wrapped to (-PI, PI]
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const toCss = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const tint = (c, k) => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
  const palCache = {};
  function palette(hex) {
    if (palCache[hex]) return palCache[hex];
    const b = rgb(hex);
    return (palCache[hex] = { base: toCss(b), dark: toCss(shade(b, 0.62)), light: toCss(tint(b, 0.55), 0.5), glow: toCss(b, 0.2), rgb: b });
  }
  const sprites = {};
  function foodSprite(hex) {   // soft glowing pellet, baked once per colour
    if (sprites[hex]) return sprites[hex];
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), b = rgb(hex), h = S / 2;
    const halo = g.createRadialGradient(h, h, h * 0.3, h, h, h);
    halo.addColorStop(0, toCss(b, 0.55)); halo.addColorStop(0.42, toCss(b, 0.3)); halo.addColorStop(1, toCss(b, 0));
    g.fillStyle = halo; g.fillRect(0, 0, S, S);
    const core = g.createRadialGradient(h - 3, h - 4, 1, h, h, h * 0.42);
    core.addColorStop(0, toCss(tint(b, 0.6))); core.addColorStop(1, toCss(b));
    g.fillStyle = core; g.beginPath(); g.arc(h, h, h * 0.42, 0, TAU); g.fill();
    return (sprites[hex] = c);
  }
  const sizeFor = mass => {
    const r = 12 + Math.sqrt(mass) * 0.6, L = 5.2 * mass + 40;
    let sp = r * 0.78, n = Math.round(L / sp) + 1;
    if (n > MAXN) { n = MAXN; sp = L / (n - 1); }
    return { r, sp, n: Math.max(6, n) };
  };

  // keyboard: normalise to a code so tests and odd layouts work
  function keyName(e) {
    if (e.code) return e.code === 'NumpadEnter' ? 'Enter' : e.code;
    const k = e.key;
    if (k === ' ') return 'Space'; if (k === '/') return 'Slash';
    if (k && k.length === 1) return 'Key' + k.toUpperCase();
    return k;
  }

  Ludus.register({
    id: 'slither', name: 'Worm Arena', aka: 'snake worm arena', tag: 'Arcade', versus: true, tint: '#7c6bb5',
    hint: 'Pointer steers, hold click or <kbd>Space</kbd> to boost · <kbd>←</kbd><kbd>→</kbd> turn · vs Friend: <b>P1</b> A D + Space, <b>P2</b> ← → + /',
    art(ctx, w, h, colors) {
      // A smooth worm: evenly spaced round segments along a gentle S-curve, tapering to the tail, eyes on the head.
      const u = h / 78;
      [[0.92, 0.2, '#ffd36b'], [0.74, 0.14, '#fff8f2'], [0.14, 0.3, '#ffd36b'], [0.6, 0.86, '#fff8f2'], [0.9, 0.8, '#ffd36b'], [0.3, 0.12, '#fff8f2']].forEach(([x, y, c]) => {
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(w * x, h * y, 6 * u, 0, TAU); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w * x, h * y, 3 * u, 0, TAU); ctx.fill();
      });
      const len = Math.min(w * 0.72, h * 2.6), x0 = (w - len) / 2;
      const at = t => [x0 + len * t, h * (0.54 + 0.2 * Math.sin(t * TAU * 1.05 - 0.5))];
      const dense = []; for (let i = 0; i <= 400; i++) dense.push(at(i / 400));
      const seg = [], gap = 4.2 * u; let acc = 0; seg.push(dense[0]);
      for (let i = 1; i < dense.length; i++) { acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); if (acc >= gap) { seg.push(dense[i]); acc = 0; } }
      const n = seg.length, rad = i => (4.2 + 4.6 * Math.pow(i / (n - 1), 0.6)) * u;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      seg.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0], p[1] + 2 * u, rad(i), 0, TAU); ctx.fill(); });
      seg.forEach((p, i) => { ctx.fillStyle = Math.floor((n - 1 - i) / 3) % 2 ? '#efe4ff' : '#fff8f2'; ctx.beginPath(); ctx.arc(p[0], p[1], rad(i), 0, TAU); ctx.fill(); });
      const hd = seg[n - 1], pr = seg[n - 2], a = Math.atan2(hd[1] - pr[1], hd[0] - pr[0]), hr = rad(n - 1);
      [-1, 1].forEach(k => {
        const ex = hd[0] + Math.cos(a + k * 0.75) * hr * 0.5, ey = hd[1] + Math.sin(a + k * 0.75) * hr * 0.5;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, hr * 0.34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2140'; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * hr * 0.12, ey + Math.sin(a) * hr * 0.12, hr * 0.18, 0, TAU); ctx.fill();
      });
    },

    create(stage, api) {
      const view = api.canvas();
      const { ctx, canvas } = view;
      const friend = api.friend, LV = api.level;
      const AI = [
        { think: 0.2, aggr: false, margin: 0.8, noise: 0.28, bots: 15 },
        { think: 0.12, aggr: true, margin: 1, noise: 0.1, bots: 19 },
        { think: 0.07, aggr: true, margin: 1.2, noise: 0.02, bots: 23 }
      ][LV] || { think: 0.12, aggr: true, margin: 1, noise: 0.1, bots: 19 };

      // ---------- world: food ----------
      const fcells = new Array(FN * FN);
      let foodCount = 0, wildCount = 0, ephem = [];
      const fIdx = (x, y) => clamp(((x + R) / FC) | 0, 0, FN - 1) + clamp(((y + R) / FC) | 0, 0, FN - 1) * FN;
      function addFood(x, y, v, r, hex, wild) {
        const f = { x, y, v, r, hex, ph: Math.random() * 6.28, wild, gone: false, cell: fIdx(x, y) };
        (fcells[f.cell] || (fcells[f.cell] = [])).push(f);
        foodCount++; if (wild) wildCount++; else ephem.push(f);
        return f;
      }
      function removeFood(f) {
        if (f.gone) return; f.gone = true;
        const a = fcells[f.cell], i = a.indexOf(f);
        if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
        foodCount--; if (f.wild) wildCount--;
      }
      function spawnWild() {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (R - 60);
        const roll = Math.random(), big = roll > 0.97 ? 2 : roll > 0.86 ? 1 : 0;
        addFood(Math.cos(a) * d, Math.sin(a) * d, [1, 2, 4][big], [4.2, 5.6, 7.6][big], PALETTE[(Math.random() * PALETTE.length) | 0], true);
      }

      // ---------- world: worms ----------
      const W = [];             // every worm, humans first
      let segN = 0;
      const gHead = new Int32Array(SN * SN), sNext = new Int32Array(SEG_CAP), sI = new Int16Array(SEG_CAP), sO = new Int16Array(SEG_CAP);
      const sX = new Float32Array(SEG_CAP), sY = new Float32Array(SEG_CAP), sR = new Float32Array(SEG_CAP);
      const sIdx = (x, y) => clamp(((x + SO) / SC) | 0, 0, SN - 1) + clamp(((y + SO) / SC) | 0, 0, SN - 1) * SN;

      function newWorm(o) {
        const z = sizeFor(o.mass);
        const w = {
          idx: W.length, name: o.name, human: o.human || 0, hex: o.hex, c: palette(o.hex), mass: o.mass, ang: o.ang || 0, tgt: o.ang || 0,
          v: BASE_V, boost: false, alive: true, prot: 0, r: z.r, sp: z.sp, n: z.n, drop: 0, deadLen: 0, killer: '', respawn: 0, rank: 0,
          px: new Float32Array(MAXN + 4), py: new Float32Array(MAXN + 4), bb: [0, 0, 0, 0], eatT: 0, born: 0,
          ai: { t: Math.random() * 0.2, wa: Math.random() * TAU, food: null, side: Math.random() < 0.5 ? -1 : 1, ga: 0, boostWant: false, hold: 0 }
        };
        W.push(w); return w;
      }
      function place(w, x, y, ang, mass) {
        w.mass = mass; const z = sizeFor(mass); w.r = z.r; w.sp = z.sp; w.n = z.n; w.ang = w.tgt = ang; w.v = BASE_V; w.boost = false; w.alive = true; w.drop = 0; w.killer = '';
        for (let i = 0; i < w.n; i++) { w.px[i] = x - Math.cos(ang) * w.sp * i; w.py[i] = y - Math.sin(ang) * w.sp * i; }
        updateBB(w);
      }
      function updateBB(w) {
        let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
        for (let i = 0; i < w.n; i++) { const x = w.px[i], y = w.py[i]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
        w.bb[0] = a; w.bb[1] = b; w.bb[2] = c; w.bb[3] = d;
      }
      function rebuildGrid() {
        gHead.fill(-1); let k = 0;
        for (let wi = 0; wi < W.length; wi++) {
          const w = W[wi]; if (!w.alive) continue;
          for (let i = 0; i < w.n && k < SEG_CAP; i++, k++) {
            sX[k] = w.px[i]; sY[k] = w.py[i]; sR[k] = w.r; sO[k] = wi; sI[k] = i;
            const c = sIdx(sX[k], sY[k]); sNext[k] = gHead[c]; gHead[c] = k;
          }
        }
        segN = k;
      }
      const farFromWorms = (x, y, d) => { for (const w of W) if (w.alive && Math.hypot(w.px[0] - x, w.py[0] - y) < d) return false; return true; };
      function safeSpot(minD) {
        let best = null, bd = -1;
        for (let t = 0; t < 14; t++) {
          const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * R * 0.86, x = Math.cos(a) * d, y = Math.sin(a) * d;
          let m = 1e9; for (const w of W) if (w.alive) m = Math.min(m, Math.hypot(w.px[0] - x, w.py[0] - y));
          if (m > bd) { bd = m; best = [x, y]; }
          if (m > minD + 200) break;
        }
        return best;
      }

      // ---------- input ----------
      const keys = new Set();
      const ptr = { on: false, x: 0, y: 0, down: false, btn: false };
      const KEYMAP = friend
        ? [{ left: ['KeyA'], right: ['KeyD'], boost: ['Space', 'KeyW'] }, { left: ['ArrowLeft'], right: ['ArrowRight'], boost: ['Slash', 'Enter', 'ArrowUp'] }]
        : [{ left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], boost: ['Space', 'ArrowUp', 'KeyW'] }];
      const anyKey = (list) => list.some(k => keys.has(k));
      api.keys(e => { keys.add(keyName(e)); if (!friend) ptr.on = ptr.on && !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(keyName(e)); });
      api.keysUp(e => keys.delete(keyName(e)));
      api.on(window, 'blur', () => { keys.clear(); ptr.down = false; ptr.btn = false; });
      const local = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * view.w / Math.max(1, r.width), (e.clientY - r.top) * view.h / Math.max(1, r.height)]; };
      const btnGeom = () => { const s = Math.max(0.85, Math.min(1.2, Math.min(view.w, view.h) / 420)), rad = 27 * s; return { x: 12 + rad, y: view.h - 12 - rad, r: rad }; };
      api.on(canvas, 'pointermove', e => {
        const [x, y] = local(e); ptr.x = x; ptr.y = y;
        if (!friend) { const g = btnGeom(); if (!(ptr.btn && Math.hypot(x - g.x, y - g.y) < g.r * 1.6) && !(e.pointerType === 'touch' && Math.hypot(x - g.x, y - g.y) < g.r * 1.2)) ptr.on = true; }
      });
      api.on(canvas, 'pointerdown', e => {
        const [x, y] = local(e); ptr.x = x; ptr.y = y;
        if (friend) return;
        const g = btnGeom();
        if (Math.hypot(x - g.x, y - g.y) < g.r * 1.25) { ptr.btn = true; return; }
        ptr.on = true;
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen' && (e.button === undefined || e.button === 0)) ptr.down = true;
      });
      const up = () => { ptr.down = false; ptr.btn = false; };
      api.on(window, 'pointerup', up); api.on(window, 'pointercancel', up);

      // ---------- setup ----------
      let phase = 'play', phaseT = 0, clock = 0, board = [], boardT = 0, eatSfxT = 0, intro = 6, shake = 0;
      const parts = [], gulps = [];
      const humans = [];
      function setup() {
        W.length = 0; humans.length = 0; ephem = []; fcells.fill(undefined); foodCount = 0; wildCount = 0; parts.length = 0; gulps.length = 0;
        for (let i = 0; i < WILD_FOOD; i++) spawnWild();
        const hs = friend ? [['P1', null, 1], ['P2', P2COL, 2]] : [['You', null, 1]];
        const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97757';
        hs.forEach(([name, hex, id], i) => {
          const a = Math.random() * TAU, off = friend ? (i ? 1 : -1) * 90 : 0;
          const w = newWorm({ name, hex: hex || acc, human: id, mass: START_MASS, ang: a });
          place(w, Math.cos(a + 1.57) * off + (Math.random() - 0.5) * 300, Math.sin(a + 1.57) * off + (Math.random() - 0.5) * 300, a, START_MASS);
          w.prot = 1.6; humans.push(w);
        });
        const hx = humans[0].px[0], hy = humans[0].py[0];
        for (let i = 0; i < AI.bots; i++) {
          const mass = START_MASS + Math.pow(Math.random(), 2.4) * 420;
          const w = newWorm({ name: NAMES[i % NAMES.length], hex: PALETTE[i % PALETTE.length], mass, ang: 0 });
          let x, y, t = 0; do { const s = safeSpot(300); x = s[0]; y = s[1]; t++; } while (Math.hypot(x - hx, y - hy) < 520 && t < 30);
          place(w, x, y, Math.random() * TAU, mass);
        }
        rebuildGrid(); phase = 'play'; phaseT = 0; clock = 0; intro = 6;
        cam.x = hx; cam.y = hy; cam.s = 0; camSnap = true;
      }

      // ---------- killing / food ----------
      function dropFood(w, big) {
        const total = w.mass * 0.85 + 3, count = clamp(Math.floor(w.n / 2), 8, 64), per = total / count;
        for (let i = 0; i < count; i++) {
          const k = Math.min(w.n - 1, Math.floor(i * w.n / count)), a = Math.random() * TAU, d = Math.random() * w.r * 0.9;
          const v = per * (0.7 + Math.random() * 0.6), r = clamp(4.5 + Math.sqrt(v) * 1.5, 5, 11.5);
          const x = w.px[k] + Math.cos(a) * d, y = w.py[k] + Math.sin(a) * d;
          if (x * x + y * y < R * R) addFood(x, y, v, r, w.hex, false);
        }
        while (ephem.length > EPHEM_MAX) { const f = ephem.shift(); removeFood(f); }
        ephem = ephem.filter(f => !f.gone);
      }
      function burst(w) {
        if (api.reduceMotion) return;
        const n = Math.min(26, 8 + (w.n >> 3));
        for (let i = 0; i < n; i++) {
          const k = Math.floor(Math.random() * w.n), a = Math.random() * TAU, sp = 40 + Math.random() * 120;
          parts.push({ x: w.px[k], y: w.py[k], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, r: 2 + Math.random() * 3, hex: w.hex });
        }
      }
      function kill(w, by) {
        if (!w.alive) return;
        w.alive = false; w.deadLen = Math.round(w.mass); w.killer = by || '';
        dropFood(w); burst(w);
        if (w.human) {
          api.sfx('lose'); shake = api.reduceMotion ? 0 : 0.7;
          let rk = 1; for (const o of W) if (o !== w && o.alive && o.mass > w.mass) rk++;
          w.rank = rk;
        } else {
          w.respawn = 2.4 + Math.random() * 2.5;
          if (humans.some(h => h.alive && Math.hypot(h.px[0] - w.px[0], h.py[0] - w.py[0]) < 700)) api.sfx('hit');
        }
        rebuildGrid();
      }
      function hitTest(w) {
        const hx = w.px[0], hy = w.py[0], hr = w.r * 0.72;
        if (hx * hx + hy * hy > (R - w.r * 0.4) * (R - w.r * 0.4)) return -2;
        const cx = ((hx + SO) / SC) | 0, cy = ((hy + SO) / SC) | 0;
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(SN - 1, cy + 1); yy++) {
          for (let xx = Math.max(0, cx - 1); xx <= Math.min(SN - 1, cx + 1); xx++) {
            for (let k = gHead[xx + yy * SN]; k >= 0; k = sNext[k]) {
              if (sO[k] === w.idx || sI[k] === 0) continue;
              const dx = sX[k] - hx, dy = sY[k] - hy, rr = sR[k] + hr;
              if (dx * dx + dy * dy < rr * rr) return sO[k];
            }
          }
        }
        return -1;
      }
      function eatNear(w, dt) {
        const hx = w.px[0], hy = w.py[0], reach = w.r + 26 + (w.boost ? 8 : 0);
        const c0 = clamp(((hx - reach + R) / FC) | 0, 0, FN - 1), c1 = clamp(((hx + reach + R) / FC) | 0, 0, FN - 1);
        const r0 = clamp(((hy - reach + R) / FC) | 0, 0, FN - 1), r1 = clamp(((hy + reach + R) / FC) | 0, 0, FN - 1);
        let ate = 0;
        for (let ry = r0; ry <= r1; ry++) for (let cx = c0; cx <= c1; cx++) {
          const a = fcells[cx + ry * FN]; if (!a) continue;
          for (let i = a.length - 1; i >= 0; i--) {
            const f = a[i], dx = f.x - hx, dy = f.y - hy, rr = reach + f.r * 0.6;
            if (dx * dx + dy * dy < rr * rr) {
              w.mass += f.v; ate += f.v;
              if (w.human && gulps.length < 90) gulps.push({ x: f.x, y: f.y, w, r: f.r, hex: f.hex, t: 0 });
              removeFood(f);
            }
          }
        }
        if (ate && w.human && eatSfxT <= 0) { api.sfx('tick'); eatSfxT = 0.07; }
      }
      function dropBoostFood(w) {
        const k = w.n - 1; const a = Math.random() * TAU;
        addFood(w.px[k] + Math.cos(a) * 4, w.py[k] + Math.sin(a) * 4, w.drop, 3.4, w.hex, false);
        w.drop = 0;
        if (ephem.length > EPHEM_MAX) { const f = ephem.shift(); removeFood(f); }
      }

      // ---------- AI ----------
      function probeHits(px, py, rad, me) {
        const cx = ((px + SO) / SC) | 0, cy = ((py + SO) / SC) | 0; let hits = 0;
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(SN - 1, cy + 1); yy++) for (let xx = Math.max(0, cx - 1); xx <= Math.min(SN - 1, cx + 1); xx++) {
          for (let k = gHead[xx + yy * SN]; k >= 0; k = sNext[k]) {
            if (sO[k] === me) continue;
            const dx = sX[k] - px, dy = sY[k] - py, rr = sR[k] + rad;
            if (dx * dx + dy * dy < rr * rr) { if (++hits >= 3) return 3; }
          }
        }
        return hits;
      }
      const wallPen = (x, y, r) => { const d = Math.sqrt(x * x + y * y); return d > R - r - 70 ? 3 : d > R - r - 190 ? 0.9 : 0; };
      function findFood(b) {
        const hx = b.px[0], hy = b.py[0], reach = 330;
        const c0 = clamp(((hx - reach + R) / FC) | 0, 0, FN - 1), c1 = clamp(((hx + reach + R) / FC) | 0, 0, FN - 1);
        const r0 = clamp(((hy - reach + R) / FC) | 0, 0, FN - 1), r1 = clamp(((hy + reach + R) / FC) | 0, 0, FN - 1);
        let best = null, bs = 0;
        for (let ry = r0; ry <= r1; ry++) for (let cx = c0; cx <= c1; cx++) {
          const a = fcells[cx + ry * FN]; if (!a) continue;
          for (let i = 0; i < a.length; i++) {
            const f = a[i], d = Math.hypot(f.x - hx, f.y - hy);
            const s = (f.v * (f.v >= 3 ? 1.8 : 1)) / (d + 70);
            if (s > bs && d < reach) { bs = s; best = f; }
          }
        }
        return best;
      }
      function think(b) {
        const ai = b.ai, hx = b.px[0], hy = b.py[0], r = b.r;
        let threat = null, td = 1e9, prey = null, pd = 1e9;
        for (const o of W) {
          if (o === b || !o.alive) continue;
          const d = Math.hypot(o.px[0] - hx, o.py[0] - hy);
          if (o.mass > b.mass * 1.2 && d < 360 + o.r * 2 && d < td) { threat = o; td = d; }
          else if (AI.aggr && o.mass * 1.3 < b.mass && b.mass > 22 && d < 480 && d < pd && o.prot <= 0) { prey = o; pd = d; }
        }
        let ga, gw = 1, boost = false;
        if (threat) {
          ga = Math.atan2(hy - threat.py[0], hx - threat.px[0]) + ai.side * 0.25; gw = 1.6;
          boost = td < 200 + threat.r * 2 && b.mass > 30;
        } else if (prey) {
          const lead = Math.min(pd, 340) * 0.85, tx = prey.px[0] + Math.cos(prey.ang) * lead, ty = prey.py[0] + Math.sin(prey.ang) * lead;
          ga = Math.atan2(ty - hy, tx - hx);
          if (pd < 260 && b.mass > prey.mass * 1.7) ga += ai.side * 0.85;       // wrap around it
          boost = pd < 320 && b.mass > 45 && Math.abs(angDiff(ga, b.ang)) < 0.5;
          gw = 1.3;
        } else {
          let f = ai.food;
          if (!f || f.gone || Math.hypot(f.x - hx, f.y - hy) > 520) f = ai.food = findFood(b);
          if (f) ga = Math.atan2(f.y - hy, f.x - hx);
          else {
            ai.wa += (Math.random() - 0.5) * 1.1;
            ga = ai.wa; gw = 0.6;
          }
        }
        const dc = Math.hypot(hx, hy);
        if (dc > R * 0.78) { ga = Math.atan2(-hy, -hx) + (dc > R * 0.9 ? 0 : ai.side * 0.4); gw = 2.2; ai.wa = ga; }
        const rel0 = angDiff(ga, b.ang);
        let best = 0, bs = -1e9;
        const d1 = 60 + r * 2.4, d2 = 170 + r * 4.2, pr = r * 0.9 * AI.margin;
        for (let k = -6; k <= 6; k++) {
          const rel = k * Math.PI / 8, a = b.ang + rel, ca = Math.cos(a), sa = Math.sin(a);
          let pen = 0;
          const x1 = hx + ca * d1, y1 = hy + sa * d1, x2 = hx + ca * d2, y2 = hy + sa * d2;
          pen += probeHits(x1, y1, pr, b.idx) * 2.6 + wallPen(x1, y1, r);
          pen += probeHits(x2, y2, pr, b.idx) * 1.1 + wallPen(x2, y2, r) * 0.8;
          const s = gw * Math.cos(angDiff(rel, rel0)) - pen - Math.abs(rel) * 0.04;
          if (s > bs) { bs = s; best = rel; }
        }
        b.tgt = b.ang + best + (Math.random() - 0.5) * AI.noise;
        // never boost into a wall of body
        ai.boostWant = boost && bs > 0.2;
      }

      // ---------- update ----------
      const cam = { x: 0, y: 0, s: 0.6 };
      let camSnap = true;
      function wormUpdate(w, dt) {
        // steering
        if (w.human) {
          const map = KEYMAP[w.human - 1] || KEYMAP[0], ax = (anyKey(map.right) ? 1 : 0) - (anyKey(map.left) ? 1 : 0);
          if (ax) w.tgt = w.ang + ax * 1.1;
          else if (!friend && ptr.on) {
            const sx = (w.px[0] - cam.x) * cam.s + view.w / 2, sy = (w.py[0] - cam.y) * cam.s + view.h / 2;
            if (Math.hypot(ptr.x - sx, ptr.y - sy) > 6) w.tgt = Math.atan2(ptr.y - sy, ptr.x - sx);
          } else w.tgt = w.ang;
          w.boost = anyKey(map.boost) || (!friend && (ptr.down || ptr.btn));
        } else {
          w.ai.t -= dt;
          if (w.ai.t <= 0) { w.ai.t = AI.think * (0.8 + Math.random() * 0.4); think(w); }
          w.boost = w.ai.boostWant;
        }
        if (w.prot > 0) w.prot -= dt;
        if (w.boost && w.mass <= MIN_BOOST) w.boost = false;
        const omega = 4.5 / (1 + w.mass / 1100) * (w.boost ? 0.85 : 1);
        const da = angDiff(w.tgt, w.ang), mt = omega * dt;
        w.ang += clamp(da, -mt, mt);
        const tv = w.boost ? BOOST_V : BASE_V;
        w.v += (tv - w.v) * Math.min(1, dt * 9);
        if (w.boost) {
          const cost = (3.2 + w.mass * 0.016) * dt;
          w.mass -= cost; w.drop += cost * 0.7;
          if (w.drop >= 0.6) dropBoostFood(w);
        }
        // size from mass
        const z = sizeFor(w.mass); w.r = z.r; w.sp = z.sp;
        if (z.n > w.n) { for (let i = w.n; i < z.n; i++) { w.px[i] = w.px[w.n - 1]; w.py[i] = w.py[w.n - 1]; } w.n = z.n; } else if (z.n < w.n) w.n = z.n;
        // move: head then the chain follows
        const px = w.px, py = w.py, sp = w.sp, n = w.n;
        px[0] += Math.cos(w.ang) * w.v * dt; py[0] += Math.sin(w.ang) * w.v * dt;
        let a = px[0], b = py[0], c = a, d = b;
        for (let i = 1; i < n; i++) {
          const dx = px[i - 1] - px[i], dy = py[i - 1] - py[i], dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > sp) { const k = (dist - sp) / dist; px[i] += dx * k; py[i] += dy * k; }
          const x = px[i], y = py[i];
          if (x < a) a = x; else if (x > c) c = x;
          if (y < b) b = y; else if (y > d) d = y;
        }
        const bb = w.bb; bb[0] = a; bb[1] = b; bb[2] = c; bb[3] = d;
        eatNear(w, dt);
        w.eatT = Math.max(0, w.eatT - dt);
      }

      function update(dt) {
        clock += dt; eatSfxT -= dt; shake = Math.max(0, shake - dt * 2.2);
        if (intro > 0 && (api.touched || ptr.on)) intro -= dt * 2.5; else if (intro > 0) intro -= dt * 0.35;
        for (let i = 0; i < 4 && wildCount < WILD_FOOD; i++) spawnWild();
        if (phase !== 'over') {
          rebuildGrid();
          for (const w of W) if (w.alive) wormUpdate(w, dt);
          rebuildGrid();
          for (const w of W) {
            if (!w.alive || w.prot > 0) continue;
            const h = hitTest(w);
            if (h !== -1) kill(w, h === -2 ? 'the wall' : W[h].name);
          }
          for (const w of W) if (!w.alive && !w.human && w.respawn > 0) {
            w.respawn -= dt;
            if (w.respawn <= 0) {
              let s, t = 0; do { s = safeSpot(350); t++; } while (humans.some(h => h.alive && Math.hypot(h.px[0] - s[0], h.py[0] - s[1]) < 800) && t < 20);
              place(w, s[0], s[1], Math.random() * TAU, START_MASS + Math.random() * 30); w.prot = 1.2; w.ai.food = null;
            }
          }
        }
        // humans: end of run
        if (phase === 'play') {
          const dead = humans.filter(h => !h.alive);
          if (dead.length && (!friend || dead.length)) { phase = 'dying'; phaseT = 1.15; }
        } else if (phase === 'dying') {
          phaseT -= dt;
          if (phaseT <= 0) {
            phase = 'over';
            if (!friend) {
              const h = humans[0];
              api.over({ score: h.deadLen, title: h.killer === 'the wall' ? 'Hit the wall' : 'Eaten by ' + h.killer, message: `Length ${h.deadLen} · rank ${h.rank} of ${W.filter(o => o.alive).length + 1}` });
            } else {
              const [a, b] = humans, la = a.alive ? Math.round(a.mass) : a.deadLen, lb = b.alive ? Math.round(b.mass) : b.deadLen;
              const win = a.alive && !b.alive ? a : b.alive && !a.alive ? b : la >= lb ? a : b;
              api.over({ score: Math.max(la, lb), won: true, title: win.name + ' wins', message: `P1 ${la} · P2 ${lb}` });
            }
          }
        }
        // lists
        boardT -= dt;
        if (boardT <= 0) { boardT = 0.25; board = W.filter(w => w.alive).sort((a, b) => b.mass - a.mass); }
        parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt; });
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        for (const g of gulps) g.t += dt * 9;
        for (let i = gulps.length - 1; i >= 0; i--) if (gulps[i].t >= 1) gulps.splice(i, 1);
        // score
        const alive = humans.filter(h => h.alive);
        api.score(friend ? Math.max(...humans.map(h => (h.alive ? h.mass : h.deadLen))) : (humans[0].alive ? humans[0].mass : humans[0].deadLen));
        // camera
        const ref = alive.length ? alive : humans;
        let tx = 0, ty = 0, rmax = 0;
        ref.forEach(h => { tx += h.px[0]; ty += h.py[0]; rmax = Math.max(rmax, h.r); });
        tx /= ref.length; ty /= ref.length;
        const span = 520 + 10 * (rmax - 12), base = Math.sqrt(view.w * view.h) * 0.78 / span;
        let ts = base;
        if (ref.length > 1) {
          const dx = Math.abs(ref[0].px[0] - ref[1].px[0]), dy = Math.abs(ref[0].py[0] - ref[1].py[0]), m = rmax * 2 + 160;
          ts = Math.min(base, view.w * 0.84 / (dx + m * 2), view.h * 0.84 / (dy + m * 2));
        }
        ts = Math.max(0.12, ts);
        if (camSnap || cam.s === 0) { cam.s = ts; cam.x = tx; cam.y = ty; camSnap = false; }
        else {
          cam.s += (ts - cam.s) * Math.min(1, dt * 3);
          const k = 1 - Math.exp(-dt * 16); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
        }
      }

      // ---------- drawing ----------
      function truncate(s, maxW) { if (ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
      const FONT = '"SF Pro Rounded", ui-rounded, system-ui, sans-serif';
      function label(s, x, y, size, color, weight, align, maxW) {
        ctx.font = `${weight || 650} ${size}px ${FONT}`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
        ctx.fillText(maxW ? truncate(s, maxW) : s, x, y);
      }
      const pill = (x, y, w, h, fill, r) => { D.roundRect(ctx, x, y, w, h, r === undefined ? h / 2 : r); ctx.fillStyle = fill; ctx.fill(); };

      function drawWorm(w, col, S) {
        const bb = w.bb, r = w.r, pad = r * 1.6 + 6;
        const x0 = cam.x - view.w / 2 / S, x1 = cam.x + view.w / 2 / S, y0 = cam.y - view.h / 2 / S, y1 = cam.y + view.h / 2 / S;
        if (bb[2] + pad < x0 || bb[0] - pad > x1 || bb[3] + pad < y0 || bb[1] - pad > y1) return;
        const step = Math.max(1, Math.floor(3 / (w.sp * S))), n = w.n, px = w.px, py = w.py;
        const path = new Path2D();
        path.moveTo(px[n - 1], py[n - 1]);
        for (let i = n - 2; i > 0; i -= step) path.lineTo(px[i], py[i]);
        path.lineTo(px[0], py[0]);
        const c = w.c, blink = w.prot > 0 && Math.floor(clock * 10) % 2 === 0;
        ctx.save();
        if (blink) ctx.globalAlpha = 0.55;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (w.boost) { ctx.strokeStyle = c.glow; ctx.lineWidth = r * 3.1; ctx.stroke(path); }
        ctx.strokeStyle = col.dark ? 'rgba(0,0,0,0.5)' : c.dark; ctx.lineWidth = r * 2 + 2.2 / S; ctx.stroke(path);
        ctx.strokeStyle = c.base; ctx.lineWidth = r * 2; ctx.stroke(path);
        if (r * S > 3) {
          ctx.save(); ctx.translate(-r * 0.16, -r * 0.24); ctx.strokeStyle = c.light; ctx.lineWidth = r * 0.78; ctx.stroke(path); ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = r * 0.5; ctx.setLineDash([0, w.sp * 2.4]); ctx.stroke(path); ctx.setLineDash([]);
        }
        // head
        const hx = px[0], hy = py[0], ca = Math.cos(w.ang), sa = Math.sin(w.ang);
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.5)' : c.dark; ctx.beginPath(); ctx.arc(hx, hy, r * 1.06 + 1.1 / S, 0, TAU); ctx.fill();
        ctx.fillStyle = c.base; ctx.beginPath(); ctx.arc(hx, hy, r * 1.04, 0, TAU); ctx.fill();
        if (w.human) {
          ctx.fillStyle = '#fffaf3'; ctx.beginPath(); ctx.arc(hx, hy, r * 0.8, 0, TAU); ctx.fill();
          D.spark(ctx, hx - ca * r * 0.12, hy - sa * r * 0.12, r * 0.62, c.base, w.ang + clock * (w.boost ? 5 : 0.8));
          // nose notch so the heading is readable
          ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(hx + ca * r * 0.98, hy + sa * r * 0.98, r * 0.17, 0, TAU); ctx.fill();
        } else {
          for (const sgn of [-1, 1]) {
            const ex = hx + ca * r * 0.42 - sa * r * 0.5 * sgn, ey = hy + sa * r * 0.42 + ca * r * 0.5 * sgn;
            ctx.fillStyle = '#fffaf3'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.34, 0, TAU); ctx.fill();
            ctx.fillStyle = '#2b2620'; ctx.beginPath(); ctx.arc(ex + ca * r * 0.12, ey + sa * r * 0.12, r * 0.17, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
      }

      function render() {
        const col = api.colors(), w = view.w, h = view.h, dpr = view.dpr;
        const S = cam.s;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        let shx = 0, shy = 0; if (shake > 0) { shx = (Math.random() - 0.5) * 7 * shake; shy = (Math.random() - 0.5) * 7 * shake; }
        // arena floor and the dark outside
        ctx.fillStyle = col.dark ? '#201c18' : '#f3ede1'; ctx.fillRect(0, 0, w, h);
        const ox = w / 2 - cam.x * S + shx, oy = h / 2 - cam.y * S + shy;
        ctx.beginPath(); ctx.arc(ox, oy, R * S, 0, TAU); ctx.fillStyle = col.surface; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(ox, oy, R * S, 0, TAU); ctx.clip();
        // dot grid, anchored to the world
        let gs = 80; while (gs * S < 22) gs *= 2;
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.07)' : 'rgba(60,45,30,0.09)';
        const gx0 = Math.floor((cam.x - w / 2 / S) / gs) * gs, gy0 = Math.floor((cam.y - h / 2 / S) / gs) * gs, dsz = Math.max(1.6, 2.4 * Math.min(1, S * 1.4));
        for (let gy = gy0; gy < cam.y + h / 2 / S + gs; gy += gs) for (let gx = gx0; gx < cam.x + w / 2 / S + gs; gx += gs) {
          const sx = (gx - cam.x) * S + w / 2 + shx, sy = (gy - cam.y) * S + h / 2 + shy; ctx.fillRect(sx - dsz / 2, sy - dsz / 2, dsz, dsz);
        }
        ctx.restore();
        // wall ring
        const near = (() => { let m = 1e9; for (const hh of humans) if (hh.alive) m = Math.min(m, R - Math.hypot(hh.px[0], hh.py[0])); return m; })();
        const warn = clamp(1 - near / 420, 0, 1);
        ctx.beginPath(); ctx.arc(ox, oy, R * S, 0, TAU);
        ctx.lineWidth = Math.max(60 * S, 10); ctx.strokeStyle = toCss([209, 73, 91], 0.05 + 0.1 * warn); ctx.stroke();
        ctx.lineWidth = Math.max(4, 12 * S); ctx.strokeStyle = toCss([209, 73, 91], 0.45 + 0.4 * warn); ctx.stroke();

        // world transform
        ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * ox, dpr * oy);
        // food
        const c0 = clamp(((cam.x - w / 2 / S + R) / FC) | 0, 0, FN - 1), c1 = clamp(((cam.x + w / 2 / S + R) / FC) | 0, 0, FN - 1);
        const r0 = clamp(((cam.y - h / 2 / S + R) / FC) | 0, 0, FN - 1), r1 = clamp(((cam.y + h / 2 / S + R) / FC) | 0, 0, FN - 1);
        for (let ry = Math.max(0, r0 - 1); ry <= Math.min(FN - 1, r1 + 1); ry++) for (let cx = Math.max(0, c0 - 1); cx <= Math.min(FN - 1, c1 + 1); cx++) {
          const a = fcells[cx + ry * FN]; if (!a) continue;
          for (let i = 0; i < a.length; i++) {
            const f = a[i], pulse = api.reduceMotion ? 1 : 1 + 0.1 * Math.sin(clock * 3 + f.ph), hs = f.r * 2.4 * pulse;
            ctx.drawImage(foodSprite(f.hex), f.x - hs, f.y - hs, hs * 2, hs * 2);
          }
        }
        // worms: small first so big ones sit on top, humans last
        const order = W.filter(o => o.alive && !o.human).sort((a, b) => a.mass - b.mass);
        order.forEach(o => drawWorm(o, col, S));
        humans.forEach(o => { if (o.alive) drawWorm(o, col, S); });
        // eaten pellets sliding into the mouth
        gulps.forEach(g => {
          if (!g.w.alive) return;
          const t = g.t * g.t, x = g.x + (g.w.px[0] - g.x) * t, y = g.y + (g.w.py[0] - g.y) * t, hs = g.r * 2.4 * (1 - 0.6 * t);
          ctx.globalAlpha = 1 - t * 0.5; ctx.drawImage(foodSprite(g.hex), x - hs, y - hs, hs * 2, hs * 2);
        });
        ctx.globalAlpha = 1;
        parts.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = palette(p.hex).base; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); });
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHud(col, S, ox, oy);
      }

      function drawHud(col, S, ox, oy) {
        const w = view.w, h = view.h, u = Math.max(0.85, Math.min(1.2, Math.min(w, h) / 420));
        const ink = col.ink, soft = col.dark ? 'rgba(42,38,33,0.94)' : 'rgba(255,252,247,0.95)';
        const edge = 10;
        // partner arrow when off screen
        if (friend) humans.forEach(o => {
          if (!o.alive) return;
          const sx = (o.px[0] - cam.x) * S + w / 2, sy = (o.py[0] - cam.y) * S + h / 2;
          if (sx > 14 && sx < w - 14 && sy > 14 && sy < h - 14) return;
          const cx = w / 2, cy = h / 2, a = Math.atan2(sy - cy, sx - cx), k = Math.min((w / 2 - 22) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - 22) / Math.abs(Math.sin(a) || 1e-6));
          const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = o.c.base; ctx.strokeStyle = soft; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
        });
        // top-left: lengths
        const lineH = 34 * u;
        humans.forEach((o, i) => {
          const y = edge + i * (lineH + 6), len = o.alive ? Math.round(o.mass) : o.deadLen, bw = (friend ? 104 : 112) * u;
          pill(edge, y, bw, lineH, soft, 12 * u);
          const dot = o.c.base;
          ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(edge + 14 * u, y + lineH / 2, 5 * u, 0, TAU); ctx.fill();
          if (friend) {
            label(o.name, edge + 25 * u, y + lineH / 2, 11 * u, col.ink2, 650, 'left');
            label(o.alive ? String(len) : 'out', edge + bw - 10 * u, y + lineH / 2, 15 * u, o.alive ? ink : col.ink3, 750, 'right');
          } else {
            label(String(len), edge + 26 * u, y + lineH * 0.38, 15 * u, ink, 750, 'left');
            const rk = Math.max(1, board.indexOf(o) + 1) || 1;
            label(`Length · #${rk}`, edge + 26 * u, y + lineH * 0.76, 9.5 * u, col.ink3, 600, 'left', bw - 32 * u);
          }
        });
        // top-right: leaderboard
        const lbW = Math.min(138 * u, w * 0.36), rows = h < 520 ? 5 : 6, rh = 16 * u, lbH = rows * rh + 24 * u, lx = w - edge - lbW, ly = edge;
        pill(lx, ly, lbW, lbH, soft, 12 * u);
        label('Leaders', lx + 10 * u, ly + 12 * u, 9.5 * u, col.ink3, 700, 'left');
        let shown = board.slice(0, rows);
        const me = humans.find(o => o.alive) || humans[0];
        let extra = null;
        if (board.indexOf(me) >= rows && me.alive) { shown = board.slice(0, rows - 1); extra = me; }
        const row = (o, rank, i) => {
          const y = ly + 24 * u + i * rh + rh / 2 - 1, isH = !!o.human;
          if (isH) { pill(lx + 4 * u, y - rh / 2 + 1, lbW - 8 * u, rh - 2, col.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)', 7 * u); }
          label(String(rank), lx + 18 * u, y, 9.5 * u, col.ink3, 650, 'right');
          ctx.fillStyle = o.c.base; ctx.beginPath(); ctx.arc(lx + 27 * u, y, 3.6 * u, 0, TAU); ctx.fill();
          const scoreS = String(Math.round(o.mass));
          ctx.font = `700 ${10.5 * u}px ${FONT}`; const sw = ctx.measureText(scoreS).width;
          label(o.name, lx + 35 * u, y, 10.5 * u, isH ? ink : col.ink2, isH ? 750 : 620, 'left', lbW - 35 * u - sw - 18 * u);
          label(scoreS, lx + lbW - 10 * u, y, 10.5 * u, ink, 700, 'right');
        };
        shown.forEach((o, i) => row(o, i + 1, i));
        if (extra) row(extra, board.indexOf(extra) + 1, rows - 1);
        // bottom-right: minimap
        const mr = clamp(Math.min(w, h) * 0.115, 34, 62), mx = w - edge - mr, my = h - edge - mr, k = (mr - 4) / R;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fillStyle = soft; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = toCss([209, 73, 91], 0.5); ctx.stroke();
        for (const o of W) if (o.alive && !o.human) { ctx.fillStyle = o.c.base; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(mx + o.px[0] * k, my + o.py[0] * k, 1.7 + Math.min(1.6, o.mass / 400), 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        const vx = cam.x - w / 2 / S, vy = cam.y - h / 2 / S;
        ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr - 1, 0, TAU); ctx.clip();
        ctx.strokeStyle = col.ink3; ctx.lineWidth = 1; ctx.strokeRect(mx + vx * k, my + vy * k, w / S * k, h / S * k);
        ctx.restore();
        humans.forEach(o => { if (!o.alive) return; ctx.fillStyle = soft; ctx.beginPath(); ctx.arc(mx + o.px[0] * k, my + o.py[0] * k, 4.6, 0, TAU); ctx.fill(); ctx.fillStyle = o.c.base; ctx.beginPath(); ctx.arc(mx + o.px[0] * k, my + o.py[0] * k, 3.2, 0, TAU); ctx.fill(); });
        // bottom-left: boost button (pointer play)
        let bottomRow = mr * 2 + edge;
        if (!friend) {
          const g = btnGeom(), act = ptr.down || ptr.btn || anyKey(KEYMAP[0].boost);
          ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fillStyle = act ? me.c.base : soft; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = act ? me.c.dark : col.line; ctx.stroke();
          ctx.save(); ctx.translate(g.x, g.y); ctx.strokeStyle = act ? '#fffaf3' : ink; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const dy of [-5.5, 2.5]) { ctx.beginPath(); ctx.moveTo(-6.5 * u, (dy + 4) * u); ctx.lineTo(0, (dy - 2) * u); ctx.lineTo(6.5 * u, (dy + 4) * u); ctx.stroke(); }
          ctx.restore();
          bottomRow = Math.max(bottomRow, g.r * 2 + edge);
        }
        // opening caption
        if (intro > 0 && phase === 'play') {
          ctx.save(); ctx.globalAlpha = clamp(intro, 0, 1);
          const msg = friend ? 'P1: A D + Space    P2: ← → + /' : 'Move to steer · hold click or Space to boost';
          ctx.font = `650 ${12 * u}px ${FONT}`;
          const tw = Math.min(w - 24, ctx.measureText(msg).width + 28 * u), cy = h - bottomRow - 22 * u;
          pill(w / 2 - tw / 2, cy - 15 * u, tw, 30 * u, soft, 15 * u);
          label(msg, w / 2, cy, 12 * u, col.ink2, 650, 'center', tw - 18);
          ctx.restore();
        }
        if (phase === 'dying') {
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,252,247,0.2)'; ctx.fillRect(0, 0, w, h);
        }
      }

      setup();
      if (window.ludusDebug) window.ludusDebug.slither = () => ({ W, humans, cam, ptr, keys, board, phase, foodCount, wildCount, parts, view, kill, rebuildGrid, addFood, place, segN, R, AI });
      api.loop(dt => { update(dt); render(); });
      return { save: () => null, pause() { keys.clear(); ptr.down = false; ptr.btn = false; }, resume() { keys.clear(); } };
    }
  });
})();
