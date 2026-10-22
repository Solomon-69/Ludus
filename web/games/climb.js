/* Getting Over It (was Hammer Climb): a spark sits in a pot and has only a long hammer.
   A winding, hand-made mountain much wider than the screen: the tree and rocks, the boulders, the chimney,
   the slide, orange hell, furniture and pipes, ice mountain, then the tall climb to the summit.
   Control: the mouse offset from the pot is where the hammer head wants to be (clamped to the arm, 1:1 with the view).
   The camera keeps the pot still on screen, so the cursor IS the head target. A free head chases it (stiff spring,
   capped speed). A head pressed into terrain sticks, so further mouse motion moves the POT instead (lever physics).
   World units, y grows upward. Fixed 240 Hz position-based solver, so it feels the same at any frame rate. */
(function () {
  const D = Ludus.draw;
  const G = -1450, PR = 16, HR = 6, HL = 124, HMIN = 22, STEP = 1 / 240, VIEW = 360;
  const SPRING = 26, HSPD = 720, VMAX = 1000, FLING = 640, REACT = 0.06, BOUNCE = 0.18, STICK = 1.5, STICKV = 380;
  // Materials: head slip (share of sideways drag that slides), pot friction.
  const MAT = {
    rock: { slip: 0, mu: 0.9 }, orange: { slip: 0, mu: 0.8 }, wall: { slip: 1, mu: 0.3 }, wood: { slip: 0.03, mu: 0.8 },
    metal: { slip: 0.25, mu: 0.45 }, slide: { slip: 0.45, mu: 0.1 }, ice: { slip: 0.85, mu: 0.03 }, nub: { slip: 0, mu: 1 }
  };
  const GRIP = [0.5, 1, 1.25];            // easy: slippery things slide less; hard: more
  const XMIN = -700, XMAX = 2000, YTOP = 3800;
  const SENS = [0.6, 0.8, 1, 1.25, 1.5];

  // ---------- the mountain, hand placed. [material, x1,y1, x2,y2, ...] simple polygons ----------
  function blob(k, cx, cy, rx, ry, seed, n) {
    n = n || 14; const f = [k];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, j = 1 + 0.06 * Math.sin(seed * 12.9898 + i * 78.233);
      f.push(+(cx + Math.cos(a) * rx * j).toFixed(1), +(cy + Math.sin(a) * ry * j).toFixed(1));
    }
    return f;
  }
  function slab(k, x0, y0, x1, y1, c) {
    c = c === undefined ? 8 : c;
    return [k, x0 + c, y0, x1 - c, y0, x1, y0 + c, x1, y1 - c, x1 - c, y1, x0 + c, y1, x0, y1 - c, x0, y0 + c];
  }
  const COURSE = [
    // world edges and the ground at the foot of the mountain
    ['wall', XMIN - 400, -300, XMIN, -300, XMIN, YTOP, XMIN - 400, YTOP],
    ['wall', XMAX, -300, XMAX + 400, -300, XMAX + 400, YTOP, XMAX, YTOP],
    ['rock', XMIN, -300, 1000, -300, 1000, 0, 700, 3, 420, 0, 100, -2, -200, 4, -520, 10, XMIN, 40],
    // the tree (a dead end you can climb for fun) and the first small rocks
    ['wood', -350, 0, -312, 0, -316, 300, -326, 540, -338, 540, -346, 300],
    ['wood', -320, 214, -196, 270, -192, 284, -320, 232],
    ['wood', -340, 330, -474, 396, -478, 382, -342, 312],
    ['wood', -328, 432, -224, 476, -220, 490, -330, 450],
    blob('rock', 60, -4, 44, 36, 3, 12),
    // the first climb over boulders
    blob('rock', 240, 10, 96, 108, 1),
    blob('rock', 430, 96, 104, 122, 2),
    ['rock', 480, 0, 1000, 0, 1000, 360, 790, 360, 760, 300, 600, 120],
    blob('rock', 650, 228, 122, 140, 4, 16),
    // the chimney: a narrow crack between a pillar and the mountain wall
    ['rock', 990, -300, 2000, -300, 2000, 1180, 990, 1180],
    ['rock', 822, 500, 900, 500, 900, 962, 822, 962],
    blob('nub', 990, 640, 16, 12, 5, 8), blob('nub', 900, 760, 16, 12, 6, 8),
    blob('nub', 990, 860, 16, 12, 7, 8),
    // the slide: a long slippery ramp back to the left, hanging over the boulders
    ['slide', 330, 1160, 848, 962, 848, 930, 330, 1126],
    // orange hell: boulders hanging over the drop back to the start
    blob('orange', 304, 1196, 72, 56, 8),
    blob('orange', 186, 1306, 78, 66, 9),
    blob('orange', 262, 1414, 76, 62, 10),
    // the shelf with the furniture
    ['rock', 296, 1440, 1150, 1440, 1150, 1500, 310, 1500, 296, 1486],
    slab('wood', 400, 1564, 522, 1580, 4), slab('wood', 404, 1500, 414, 1566, 2), slab('wood', 508, 1500, 518, 1566, 2),
    slab('wood', 600, 1500, 720, 1680, 6), slab('wood', 586, 1590, 600, 1600, 2),
    // the bucket (easy to fall into, hook the rim to get out)
    ['metal', 820, 1500, 900, 1500, 904, 1562, 896, 1562, 890, 1510, 830, 1510, 824, 1562, 816, 1562],
    // the pipes: a long pipe to hook, held up by a riser
    slab('metal', 760, 1770, 1002, 1794, 10), slab('metal', 978, 1500, 1002, 1790, 3),
    // the lamp post
    slab('metal', 1062, 1500, 1080, 1912, 2), slab('metal', 1032, 1910, 1112, 1934, 8),
    // the cliff under ice mountain
    ['rock', 1150, 1100, 2000, 1100, 2000, 2000, 1150, 2000],
    // ice mountain: one long icy slope, a few rough stones to stand on
    ['ice', 1150, 1990, 1250, 2008, 1800, 2400, 2000, 2400, 2000, 1990],
    blob('nub', 1370, 2096, 22, 14, 11, 10), blob('nub', 1490, 2181, 22, 14, 12, 10),
    blob('nub', 1610, 2266, 22, 14, 13, 10), blob('nub', 1720, 2344, 20, 13, 14, 10),
    // the tall climb to the summit: a stacked tower that winds left and right
    slab('rock', 1660, 2396, 1870, 2510, 14),
    slab('rock', 1566, 2504, 1746, 2620, 14),
    slab('rock', 1700, 2614, 1904, 2730, 14),
    slab('rock', 1580, 2724, 1764, 2840, 14),
    slab('rock', 1690, 2834, 1884, 2950, 14),
    slab('rock', 1604, 2944, 1770, 3060, 14),
    ['rock', 1640, 3054, 1830, 3054, 1822, 3110, 1790, 3138, 1700, 3142, 1660, 3120]
  ];
  // Easy only: a few extra rough holds.
  const EXTRA = [
    blob('nub', 945, 520, 14, 10, 15, 8), blob('nub', 1430, 2140, 16, 10, 16, 8), blob('nub', 1550, 2224, 16, 10, 17, 8)
  ];
  const START = { x: -80, y: PR + 0.5 };
  const SUMMIT = { y: 3138, x0: 1650, x1: 1830 };
  // Progress markers: where each part begins (pot centre), and the route the climb follows.
  const SECTIONS = [
    { x: -80, y: 16, name: 'The tree' }, { x: 240, y: 132, name: 'The boulders' }, { x: 900, y: 376, name: 'The chimney' },
    { x: 840, y: 978, name: 'The slide' }, { x: 300, y: 1262, name: 'Orange hell' }, { x: 380, y: 1516, name: 'Furniture' },
    { x: 860, y: 1810, name: 'Pipes' }, { x: 1250, y: 2024, name: 'Ice mountain' }, { x: 1780, y: 2526, name: 'The tower' },
    { x: 1740, y: 3156, name: 'Summit' }
  ];
  const ROUTE = [[-80, 16], [60, 50], [240, 132], [430, 236], [650, 386], [800, 376], [945, 376], [945, 990], [860, 990],
    [330, 1180], [300, 1268], [190, 1388], [262, 1492], [400, 1516], [460, 1596], [660, 1696], [800, 1810], [990, 1810],
    [1070, 1950], [1170, 2016], [1800, 2416], [1850, 2416], [1780, 2526], [1650, 2636], [1800, 2746], [1670, 2856],
    [1790, 2966], [1690, 3076], [1740, 3156]];

  function makeWorld(level) {
    const world = COURSE.concat(level === 0 ? EXTRA : []).map(([k, ...f]) => {
      const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]);
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const m = MAT[k];
      return { k, p, mu: m.mu, slip: Math.min(1, m.slip * GRIP[level]), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    // coarse grid so a probe only looks at nearby shapes
    const grid = new Map(), C = 160, pad = PR + 4;
    world.forEach(sh => {
      for (let cx = Math.floor((sh.x0 - pad) / C); cx <= Math.floor((sh.x1 + pad) / C); cx++)
        for (let cy = Math.floor((sh.y0 - pad) / C); cy <= Math.floor((sh.y1 + pad) / C); cy++) {
          const key = cx * 4096 + cy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(sh);
        }
    });
    world.near = (x, y) => grid.get(Math.floor(x / C) * 4096 + Math.floor(y / C)) || [];
    return world;
  }
  // How far along the route a point is (route length units), looking only near the best progress so far.
  const RLEN = [0]; for (let i = 1; i < ROUTE.length; i++) RLEN.push(RLEN[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
  function progress(x, y) {
    let best = Infinity, out = 0;
    for (let i = 1; i < ROUTE.length; i++) {
      const [ax, ay] = ROUTE[i - 1], [bx, by] = ROUTE[i], ex = bx - ax, ey = by - ay, L = ex * ex + ey * ey;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)), qx = ax + ex * t, qy = ay + ey * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d < best - 1e-6) { best = d; out = RLEN[i - 1] + Math.sqrt(L) * t; }
    }
    return { at: out, off: best };
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
    const list = world.near ? world.near(x, y) : world;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const sh of list) {
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
  function newState(at) {
    const p = at || START;
    return { p: { x: p.x, y: p.y }, v: { x: 0, y: 0 }, o: { x: 40, y: -6 }, h: { x: p.x + 40, y: p.y - 6 }, hc: false, hn: { x: 0, y: 1 }, ground: true, air: 0 };
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
    const vcap = s.hc ? FLING : VMAX, vl = Math.hypot(vx, vy); if (vl > vcap) { vx *= vcap / vl; vy *= vcap / vl; }
    s.p.x = px; s.p.y = py; s.v.x = vx; s.v.y = vy; s.h.x = nhx; s.h.y = nhy;
    s.ground = b.hit && b.ny > 0.45;
    s.air = s.ground || s.hc ? 0 : s.air + dt;
  }

  // ---------- art ----------
  function palette(d) {
    return {   // [fill, rim]
      rock: d ? ['#5d534a', '#3e3731'] : ['#ddcdb3', '#bba98e'], wall: d ? ['#2e2924', '#2e2924'] : ['#cdbb9f', '#cdbb9f'],
      orange: d ? ['#a3582f', '#c8774a'] : ['#ec9a5e', '#cc7440'], wood: d ? ['#7a5940', '#56402f'] : ['#b5845a', '#8f6441'],
      metal: d ? ['#66737e', '#8b98a3'] : ['#a9b8c4', '#7f909d'], slide: d ? ['#a8873a', '#c9a64e'] : ['#efc65a', '#cc9f32'],
      ice: d ? ['#58788a', '#86a9ba'] : ['#d6edf5', '#a6cddb'], nub: d ? ['#7c6c5c', '#5c4f42'] : ['#bba483', '#9b835f']
    };
  }
  const ORDER = ['wall', 'rock', 'orange', 'slide', 'wood', 'metal', 'ice', 'nub'];
  // Behind-the-action mountain mass, so hanging parts read as one mountain (decor only, no collision).
  const BACK = [
    [-700, 0, -700, 260, -560, 420, -420, 470, -300, 380, -200, 300, -100, 180, 40, 120, 100, 0],
    [120, 0, 160, 700, 60, 1120, 40, 1300, 120, 1520, 330, 1520, 420, 1180, 700, 1060, 820, 980, 900, 360, 600, 0],
    [1100, 1300, 1130, 1520, 1180, 2100, 1500, 2300, 1560, 2700, 1540, 3080, 1640, 3200, 1880, 3150, 1960, 2600, 2000, 2000, 2000, 1300],
    [360, 1500, 380, 1700, 560, 1800, 760, 1880, 1000, 1900, 1100, 1700, 1100, 1500]
  ];
  // Tree leaves, grass, snow: decor only.
  const LEAVES = [[-330, 560, 70], [-400, 500, 52], [-250, 510, 50], [-470, 410, 40], [-215, 300, 38], [-210, 480, 36]];
  const GRASS = [[-620, 22], [-520, 12], [-460, 9], [-170, 4], [-20, 1], [120, 0], [330, 0], [560, 108]];
  const SNOW = [[1660, 1870, 2510], [1566, 1746, 2620], [1700, 1904, 2730], [1580, 1764, 2840], [1690, 1884, 2950], [1604, 1770, 3060]];

  Ludus.register({
    id: 'climb', name: 'Getting Over It', aka: 'Hammer Climb', tag: 'Arcade', tint: '#7d6a58',
    hint: 'The mouse moves the hammer head. Plant it, keep moving to lever yourself · <kbd>←</kbd><kbd>→</kbd> swing <kbd>↑</kbd><kbd>↓</kbd> reach · <kbd>-</kbd><kbd>+</kbd> sensitivity',
    _rules: { makeWorld, step, newState, clampArm, probe, progress, START, SUMMIT, SECTIONS, ROUTE, HL, HMIN, PR, HR, STEP, VIEW },
    art(ctx, w, h) {
      // a winding mountain: boulders, an orange ledge, a snowy peak with a flag, and the pot halfway up
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.moveTo(-5, h); ctx.lineTo(w * 0.1, h * 0.8); ctx.lineTo(w * 0.3, h * 0.72); ctx.lineTo(w * 0.42, h * 0.5);
      ctx.lineTo(w * 0.6, h * 0.42); ctx.lineTo(w * 0.72, h * 0.16); ctx.lineTo(w * 0.8, h * 0.08); ctx.lineTo(w * 0.9, h * 0.2); ctx.lineTo(w + 5, h * 0.3); ctx.lineTo(w + 5, h); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.moveTo(w * 0.72, h * 0.16); ctx.lineTo(w * 0.8, h * 0.08); ctx.lineTo(w * 0.86, h * 0.15); ctx.lineTo(w * 0.8, h * 0.13); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      [[0.16, 0.88, 0.1], [0.3, 0.82, 0.08], [0.22, 0.95, 0.12]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(w * x, h * y, w * r, h * r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#e8925a'; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.08, h * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w * 0.8, h * 0.08); ctx.lineTo(w * 0.8, -h * 0.06); ctx.stroke();
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.moveTo(w * 0.8, -h * 0.06); ctx.lineTo(w * 0.87, -h * 0.03); ctx.lineTo(w * 0.8, 0); ctx.fill();
      const px = w * 0.36, py = h * 0.6, r = h * 0.09;
      ctx.strokeStyle = '#2b2722'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py - r * 0.6); ctx.lineTo(w * 0.56, h * 0.36); ctx.stroke();
      ctx.fillStyle = '#2b2722'; ctx.save(); ctx.translate(w * 0.56, h * 0.36); ctx.rotate(-0.7); D.roundRect(ctx, -8, -4.5, 16, 9, 3); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#b8603f'; ctx.beginPath(); ctx.moveTo(px - r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 0.8, py + r * 0.7); ctx.lineTo(px - r * 0.8, py + r * 0.7); ctx.closePath(); ctx.fill();
      D.spark(ctx, px, py - r * 0.9, r * 0.75, '#fffaf2', 0.3);
    },
    create(stage, api) {
      const lv = api.level, world = makeWorld(lv);
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      canvas.style.cursor = 'crosshair';
      let s, maxH, maxP, time, state = 'play', cam = { x: 0, y: 0 }, winLift = 0, acc = 0, aim, mouse = null, keysDown = {}, clock = 0, winAt = 0;
      let fallFrom = 0, fallNote = null, lastTap = 0, wasHc = false, falls = 0, reached = 1, sectionNote = null;
      let sensI = SENS.indexOf(+Ludus.state.climbSens); if (sensI < 0) sensI = 2;

      const fin = v => typeof v === 'number' && isFinite(v);
      const pt = q => q && fin(q.x) && fin(q.y);
      function restore(o) {
        if (!o || o.v2 !== 2 || !pt(o.p) || !pt(o.v) || !pt(o.o) || !pt(o.h)) return false;
        if (o.p.x < XMIN || o.p.x > XMAX || o.p.y < -100 || o.p.y > YTOP || Math.hypot(o.o.x, o.o.y) > HL + 1) return false;
        s = { p: { x: o.p.x, y: o.p.y }, v: { x: o.v.x, y: o.v.y }, o: { x: o.o.x, y: o.o.y }, h: { x: o.h.x, y: o.h.y }, hc: !!o.hc,
          hn: pt(o.hn) ? { x: o.hn.x, y: o.hn.y } : { x: 0, y: 1 }, ground: !!o.ground, air: 0 };
        maxH = fin(o.maxH) ? Math.max(0, o.maxH) : 0; time = fin(o.time) ? o.time : 0; falls = fin(o.falls) ? o.falls : 0;
        maxP = fin(o.maxP) ? o.maxP : 0;
        reached = fin(o.reached) ? Math.max(1, Math.min(SECTIONS.length, Math.round(o.reached))) : 1;
        if (o.aim && fin(o.aim.a) && fin(o.aim.l)) aim = { a: o.aim.a, l: o.aim.l };
        return true;
      }
      if (!restore(api.saved)) { s = newState(); maxH = 0; maxP = 0; time = 0; aim = null; }
      if (!aim) aim = { a: Math.atan2(s.o.y, s.o.x), l: Math.hypot(s.o.x, s.o.y) };
      cam.x = s.p.x; cam.y = s.p.y; fallFrom = s.p.y;
      api.score(Math.floor(maxH / 10));

      // ---------- input: the cursor offset from the pot (which sits still on screen) is where the head wants to be ----------
      const scale = () => Math.min(view.w / VIEW, view.h / (VIEW * 1.25));
      const anchor = () => ({ x: view.w * 0.5, y: view.h * 0.56 });
      const toScreen = (x, y) => { const k = scale(), a = anchor(); return { x: a.x + (x - cam.x) * k, y: a.y - (y - cam.y) * k }; };
      const sensBox = () => ({ x: view.w - 62, y: 8, w: 54, h: 30 });
      const inBox = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      function setSens(i) {
        sensI = Math.max(0, Math.min(SENS.length - 1, i)); Ludus.state.climbSens = SENS[sensI]; Ludus.save();
        sectionNote = { text: `Sensitivity ${SENS[sensI]}×`, t: clock };
      }
      function setMouse(e) { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; }
      api.on(canvas, 'pointermove', setMouse);
      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top };
        if (inBox(sensBox(), p)) { setSens((sensI + 1) % SENS.length); api.sfx('tick'); return; }
        setMouse(e);
      });
      api.keys(e => {
        if (e.key === '-' || e.key === '_') { setSens(sensI - 1); return; }
        if (e.key === '=' || e.key === '+') { setSens(sensI + 1); return; }
        keysDown[e.key] = true; if (e.key.startsWith('Arrow')) mouse = null;
      });
      api.keysUp(e => { keysDown[e.key] = false; });
      function target(dt) {
        if (mouse) {
          const a = anchor(), k = scale() / SENS[sensI];
          const dx = (mouse.x - a.x) / k, dy = -(mouse.y - a.y) / k;
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
        const pr = progress(s.p.x, s.p.y); if (pr.off < 160 && pr.at > maxP) maxP = pr.at;
        // a part counts as reached when the pot gets near its marker
        while (reached < SECTIONS.length) {
          const m = SECTIONS[reached];
          if (Math.hypot(s.p.x - m.x, s.p.y - m.y) > 70) break;
          reached++; sectionNote = { text: m.name, t: clock }; api.sfx('score');
        }
        if (s.ground || s.hc) {
          const lost = fallFrom - s.p.y;
          if (lost > 140 && s.ground) { falls++; fallNote = { text: `-${Math.round(lost / 10)} m`, t: clock, x: s.p.x, y: s.p.y }; api.sfx('hit'); }
          fallFrom = s.p.y;
        } else fallFrom = Math.max(fallFrom, s.p.y);
        if (s.p.y > SUMMIT.y && s.ground && s.p.x > SUMMIT.x0 && s.p.x < SUMMIT.x1) win();
      }
      function win() {
        state = 'won'; winAt = clock; reached = SECTIONS.length;
        const score = Math.floor(maxH / 10) + Math.max(0, Math.round(1800 - time)) * (lv + 1);
        api.score(score); api.sfx('win');
        const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
        api.timeout(() => api.over({ score, title: 'Summit', won: true, message: `Climbed in ${mm}:${ss}, ${falls} big fall${falls === 1 ? '' : 's'}` }), 2200);
      }

      // ---------- render ----------
      function pathOf(f) {
        ctx.beginPath();
        for (let i = 0; i < f.length; i += 2) { const a = toScreen(f[i], f[i + 1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); }
        ctx.closePath();
      }
      function shapePath(sh) {
        ctx.beginPath();
        sh.p.forEach((q, i) => { const a = toScreen(q[0], q[1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); });
        ctx.closePath();
      }
      function sky(col, w, h, k) {
        const t = Math.max(0, Math.min(1, cam.y / 3300)), d = col.dark;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        if (d) { g.addColorStop(0, `hsl(${222 + t * 20} ${28 + t * 10}% ${13 - t * 5}%)`); g.addColorStop(1, `hsl(${28 - t * 20} 16% ${12 - t * 3}%)`); }
        else { g.addColorStop(0, `hsl(${36 + t * 170} ${48 - t * 8}% ${93 - t * 10}%)`); g.addColorStop(1, `hsl(${34 + t * 150} 40% ${91 - t * 4}%)`); }
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
        ctx.save(); D.roundRect(ctx, 0, 0, w, h, 14); ctx.clip();
        // stars high up (and always a few at night)
        const sa = d ? 0.25 + t * 0.6 : Math.max(0, t - 0.55) * 1.6;
        if (sa > 0.01) {
          ctx.fillStyle = d ? '#fff6e6' : '#ffffff';
          for (let i = 0; i < 60; i++) {
            const x = (((i * 211.7 - cam.x * 0.05 * k) % w) + w) % w, y = (((i * 97.3 + cam.y * 0.05 * k) % h) + h) % h;
            ctx.globalAlpha = sa * (0.35 + 0.65 * ((i * 37) % 10) / 10); ctx.beginPath(); ctx.arc(x, y, 0.6 + (i % 3) * 0.45, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        // far ranges, slow parallax
        [[0.12, 0.1, d ? 'rgba(255,240,220,0.04)' : 'rgba(120,96,70,0.08)', 160], [0.25, 0.22, d ? 'rgba(255,240,220,0.05)' : 'rgba(120,96,70,0.09)', 90]].forEach(([px, amp, c, base]) => {
          ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h);
          const yb = h * 0.7 + cam.y * px * k * 0.6 + base * k * 0.3;
          for (let x = 0; x <= w + 8; x += 8) {
            const wx = (x - w / 2) / k + cam.x * px;
            ctx.lineTo(x, yb - (Math.sin(wx * 0.004) * 140 + Math.sin(wx * 0.011 + 1) * 60 + 120) * amp * 4 * k);
          }
          ctx.lineTo(w, h); ctx.fill();
        });
        // clouds in the middle of the climb
        ctx.fillStyle = d ? 'rgba(255,245,230,0.05)' : 'rgba(255,255,255,0.55)';
        [[-300, 900], [700, 1350], [1400, 1700], [300, 2100], [1100, 2600], [1500, 3000], [-200, 2700]].forEach(([x, y], i) => {
          const p = toScreen(x + cam.x * 0.4, y + cam.y * 0.3), r = (36 + (i % 3) * 12) * k;
          if (p.x < -3 * r || p.x > w + 3 * r || p.y < -r || p.y > h + r) return;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.8, r * 0.55, 0, 0, Math.PI * 2); ctx.ellipse(p.x + r * 0.6, p.y - r * 0.3, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }
      function render() {
        const col = api.colors(), pal = palette(col.dark), d = col.dark;
        const { w, h } = view, k = scale();
        if (state === 'won') winLift += (200 - winLift) * (api.reduceMotion ? 1 : 0.03);
        cam.x = s.p.x; cam.y = s.p.y + winLift;
        ctx.clearRect(0, 0, w, h);
        sky(col, w, h, k);
        ctx.save(); D.roundRect(ctx, 0, 0, w, h, 14); ctx.clip();
        const a0 = anchor(), L = cam.x - a0.x / k - 40, R = cam.x + (w - a0.x) / k + 40, B = cam.y - (h - a0.y) / k - 40, T = cam.y + a0.y / k + 40;
        const vis = sh => !(sh.x1 < L || sh.x0 > R || sh.y1 < B || sh.y0 > T);
        // the mountain behind
        ctx.fillStyle = d ? 'rgba(255,240,220,0.045)' : 'rgba(150,120,90,0.12)';
        BACK.forEach(f => { pathOf(f); ctx.fill(); });
        // tree leaves (behind the branches)
        LEAVES.forEach(([x, y, r], i) => {
          const p = toScreen(x, y); if (p.y < -r * 2 * k || p.y > h + r * 2 * k) return;
          ctx.fillStyle = d ? (i % 2 ? '#3d5a3f' : '#46684a') : (i % 2 ? '#9cc38f' : '#b2d3a3');
          ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2); ctx.fill();
        });
        // lamp glow
        const lg = toScreen(1072, 1902);
        if (lg.y > -200 && lg.y < h + 200) {
          const gr = ctx.createRadialGradient(lg.x, lg.y, 2, lg.x, lg.y, 90 * k);
          gr.addColorStop(0, d ? 'rgba(255,214,140,0.45)' : 'rgba(255,200,110,0.4)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lg.x, lg.y, 90 * k, 0, Math.PI * 2); ctx.fill();
        }
        // terrain: rims first, then fills, per material, so overlapping pieces join without seams
        ctx.lineJoin = 'round';
        ORDER.forEach(kind => {
          const list = world.filter(sh => sh.k === kind && vis(sh)); if (!list.length) return;
          const [fill, rim] = pal[kind];
          ctx.strokeStyle = rim; ctx.lineWidth = kind === 'wall' ? 0 : 4;
          if (kind !== 'wall') list.forEach(sh => { shapePath(sh); ctx.stroke(); });
          ctx.fillStyle = fill; list.forEach(sh => { shapePath(sh); ctx.fill(); });
        });
        details(col, k, vis);
        // progress markers
        SECTIONS.forEach((m, i) => {
          const p = toScreen(m.x, m.y - PR); if (p.x < -80 || p.x > w + 80 || p.y < -60 || p.y > h + 40) return;
          if (i === SECTIONS.length - 1) return;
          const on = i < reached;
          ctx.strokeStyle = d ? 'rgba(255,245,230,0.5)' : 'rgba(90,74,58,0.55)'; ctx.lineWidth = 1.5;
          const fx = p.x - 22 * k, fy = p.y;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30 * k); ctx.stroke();
          ctx.fillStyle = on ? col.accent : (d ? 'rgba(255,245,230,0.3)' : 'rgba(90,74,58,0.3)');
          ctx.beginPath(); ctx.moveTo(fx, fy - 30 * k); ctx.lineTo(fx + 14 * k, fy - 25 * k); ctx.lineTo(fx, fy - 20 * k); ctx.fill();
          ctx.globalAlpha = 0.75; D.text(ctx, m.name, fx + 4 * k, fy - 40 * k, 10.5, col.ink2, 700, 'left'); ctx.globalAlpha = 1;
        });
        // summit flag
        const fp = toScreen(1745, 3141);
        if (fp.y > -80 && fp.y < h + 60) {
          ctx.strokeStyle = col.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(fp.x, fp.y - 56 * k); ctx.stroke();
          ctx.fillStyle = col.accent; ctx.beginPath(); ctx.moveTo(fp.x, fp.y - 56 * k); ctx.lineTo(fp.x + 24 * k, fp.y - 48 * k + Math.sin(clock * 3) * 2); ctx.lineTo(fp.x, fp.y - 40 * k); ctx.fill();
          D.spark(ctx, fp.x, fp.y - 64 * k, 8 * k, col.accent, clock * 0.8);
        }
        // best height line
        if (maxH > 40 && state === 'play') {
          const p = toScreen(0, maxH + PR);
          if (p.y > 0 && p.y < h) {
            ctx.save(); ctx.setLineDash([4, 6]); ctx.strokeStyle = col.accent; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke(); ctx.restore();
          }
        }
        drawClimber(col, k);
        if (fallNote && clock - fallNote.t < 1.6) {
          const p = toScreen(fallNote.x, fallNote.y), a = 1 - (clock - fallNote.t) / 1.6;
          ctx.globalAlpha = a; D.text(ctx, fallNote.text, p.x, p.y - 38 - (1 - a) * 16, 13, col.bad, 750); ctx.globalAlpha = 1;
        }
        ctx.restore();
        hud(col, w, h);
      }
      function details(col, k, vis) {
        const d = col.dark;
        // grass by the tree
        ctx.strokeStyle = d ? '#4f7a52' : '#8db57f'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        GRASS.forEach(([x, y]) => {
          const p = toScreen(x, y); if (p.x < -20 || p.x > view.w + 20 || p.y < -20 || p.y > view.h + 20) return;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(p.x + i * 3 * k, p.y); ctx.lineTo(p.x + i * 4.5 * k, p.y - (7 + (i & 1) * 4) * k); ctx.stroke(); }
        });
        // ice shine and snow caps
        world.forEach(sh => {
          if (sh.k !== 'ice' || !vis(sh)) return;
          const a = toScreen(1250, 2008), b = toScreen(1800, 2400);
          ctx.strokeStyle = d ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.5;
          for (let t = 0.06; t < 0.95; t += 0.11) {
            ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 9 * k);
            ctx.lineTo(a.x + (b.x - a.x) * (t + 0.04), a.y + (b.y - a.y) * (t + 0.04) + 9 * k); ctx.stroke();
          }
        });
        ctx.fillStyle = d ? '#dfe8ee' : '#ffffff';
        SNOW.forEach(([x0, x1, y]) => {
          const a = toScreen(x0 + 10, y), b = toScreen(x1 - 10, y); if (a.y < -20 || a.y > view.h + 20) return;
          ctx.beginPath(); ctx.moveTo(a.x, a.y + 1); ctx.lineTo(b.x, b.y + 1);
          for (let x = x1 - 16; x > x0 + 14; x -= 22) { const p = toScreen(x, y); ctx.lineTo(p.x, p.y + (5 + (x % 3) * 2) * k); }
          ctx.closePath(); ctx.fill();
        });
        const pk = toScreen(1700, 3141), pk2 = toScreen(1790, 3138);
        if (pk.y > -20 && pk.y < view.h + 20) { ctx.beginPath(); ctx.moveTo(pk.x - 30 * k, pk.y + 20 * k); ctx.quadraticCurveTo(pk.x + 40 * k, pk.y - 12 * k, pk2.x + 30 * k, pk2.y + 26 * k); ctx.lineTo(pk2.x, pk2.y + 6 * k); ctx.lineTo(pk.x, pk.y + 8 * k); ctx.fill(); }
        // slide stripes
        const s0 = toScreen(330, 1143), s1 = toScreen(848, 946);
        if (Math.max(s0.y, s1.y) > -20 && Math.min(s0.y, s1.y) < view.h + 20) {
          ctx.strokeStyle = d ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3 * k;
          ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
        }
        // pipe joints, bucket handle, lamp bulb
        ctx.fillStyle = d ? '#7f8d98' : '#8c9daa';
        [[990, 1782], [990, 1520], [760, 1782], [1071, 1520]].forEach(([x, y]) => { const p = toScreen(x, y); D.roundRect(ctx, p.x - 15 * k, p.y - 15 * k, 30 * k, 30 * k, 5 * k); ctx.fill(); });
        const bh = toScreen(860, 1562);
        ctx.strokeStyle = d ? '#8b98a3' : '#7f909d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(bh.x, bh.y, 42 * k, 26 * k, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        const lb = toScreen(1072, 1906);
        ctx.fillStyle = d ? '#ffe2a6' : '#ffd27a'; ctx.beginPath(); ctx.ellipse(lb.x, lb.y, 16 * k, 7 * k, 0, 0, Math.PI); ctx.fill();
      }
      function hud(col, w, h) {
        const d = col.dark;
        ctx.fillStyle = d ? 'rgba(42,38,33,0.86)' : 'rgba(255,252,247,0.88)';
        D.roundRect(ctx, w / 2 - 78, 8, 156, 30, 15); ctx.fill();
        D.text(ctx, `${Math.max(0, Math.floor((s.p.y - PR) / 10))} m`, w / 2 - 28, 23, 14, col.ink, 780);
        D.text(ctx, `best ${Math.floor(maxH / 10)}`, w / 2 + 32, 23, 11, col.ink2, 650);
        // part of the mountain, and progress dots
        const sec = SECTIONS[Math.max(0, reached - 1)].name;
        D.text(ctx, sec, w / 2, 50, 10.5, col.ink2, 700);
        for (let i = 0; i < SECTIONS.length; i++) {
          ctx.fillStyle = i < reached ? col.accent : (d ? 'rgba(255,245,230,0.18)' : 'rgba(90,74,58,0.18)');
          ctx.beginPath(); ctx.arc(w / 2 + (i - (SECTIONS.length - 1) / 2) * 9, 62, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        const sb = sensBox();
        ctx.fillStyle = d ? 'rgba(42,38,33,0.86)' : 'rgba(255,252,247,0.88)'; D.roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 15); ctx.fill();
        D.text(ctx, `${SENS[sensI]}×`, sb.x + sb.w / 2, sb.y + 15, 11, col.ink2, 700);
        if (sectionNote && clock - sectionNote.t < 2) {
          const a = Math.min(1, (2 - (clock - sectionNote.t)) * 2);
          ctx.globalAlpha = a; D.text(ctx, sectionNote.text, w / 2, h * 0.22, 17, col.ink, 780); ctx.globalAlpha = 1;
        }
        if (state === 'won') {
          const a = Math.min(1, (clock - winAt) / 0.6);
          ctx.globalAlpha = a; D.text(ctx, 'You made it to the top', w / 2, h * 0.2, 17, col.good, 780);
          D.text(ctx, `Best height ${Math.floor(maxH / 10)} m`, w / 2, h * 0.2 + 24, 12, col.ink2, 650); ctx.globalAlpha = 1;
          for (let i = 0; i < 8; i++) {
            const t = clock - winAt + i * 0.3, r = 10 + (t * 60) % 110, p = toScreen(s.p.x, s.p.y);
            ctx.globalAlpha = Math.max(0, 1 - r / 120); D.spark(ctx, p.x + Math.cos(i * 0.8) * r, p.y - Math.abs(Math.sin(i * 1.7)) * r * 0.7 - 20, 6, col.accent, t);
          }
          ctx.globalAlpha = 1;
        } else if (time < 8 && maxH < 30) {
          ctx.globalAlpha = Math.min(1, 8 - time);
          D.text(ctx, 'Hook the rock with the hammer, then pull down to climb', w / 2, h - 18, 11, col.ink2, 650);
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
          ctx.strokeStyle = col.ink3; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.save(); ctx.setLineDash([2, 6]); ctx.globalAlpha = 0.18; ctx.strokeStyle = col.ink3;
          ctx.beginPath(); ctx.arc(pc.x, pc.y, HL * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      if (window.ludusDebug) Ludus.games.find(x => x.id === 'climb')._peek = () => ({ s, maxH, maxP, state, aim, cam, time, reached, falls, toScreen, scale, anchor, sens: SENS[sensI], world,
        teleport(x, y) { Object.assign(s, newState({ x, y })); fallFrom = y; } });
      return {
        save() {
          if (state !== 'play' || time < 1) return null;
          const c = q => ({ x: q.x, y: q.y });
          return { v2: 2, p: c(s.p), v: c(s.v), o: c(s.o), h: c(s.h), hc: s.hc, hn: c(s.hn), ground: s.ground, maxH, maxP, time, falls, reached, aim: { a: aim.a, l: aim.l } };
        },
        resume() { acc = 0; }
      };
    }
  });
})();
