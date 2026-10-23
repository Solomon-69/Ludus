/* Hammer Climb: a spark sits in a pot and has only a long hammer.
   One long, wide, hand-made mountain that runs to the RIGHT: the tree and rocks, the boulders, the chimney,
   the slide and the orange-hell pit, furniture and pipes, ice mountain, the ridge, then the tall tower to the summit.
   A menu picks the difficulty (Easy / Normal / Hard / Original): taller steps, wider gaps, steeper and
   slicker slopes and fewer holds as it goes up.
   Control: the mouse offset from the pot is where the hammer head wants to be (clamped to the arm, 1:1 with the view).
   The camera keeps the pot still on screen, so the cursor IS the head target. A free head chases it (stiff spring,
   capped speed). A head pressed into terrain sticks, so further mouse motion moves the POT instead (lever physics).
   World units, y grows upward. Fixed 240 Hz position-based solver, so it feels the same at any frame rate. */
(function () {
  const D = Ludus.draw;
  const G = -1450, PR = 16, HR = 6, HL = 80, HMIN = 18, STEP = 1 / 240, VIEW = 360;
  const SPRING = 26, HSPD = 720, VMAX = 1000, FLING = 580, BOUNCE = 0.18, STICK = 1.5, STICKV = 380, SUP = 0.25;
  // Materials: head slip (share of sideways drag that slides), pot friction.
  const MAT = {
    rock: { slip: 0, mu: 0.9 }, orange: { slip: 0, mu: 0.8 }, wall: { slip: 1, mu: 0.3 }, wood: { slip: 0.03, mu: 0.8 },
    metal: { slip: 0.25, mu: 0.45 }, slide: { slip: 0.45, mu: 0.1 }, ice: { slip: 0.8, mu: 0.035 }, nub: { slip: 0, mu: 1 }
  };
  const XMIN = -700;
  const SENS = [0.6, 0.8, 1, 1.25, 1.5];
  // step: height of climbs, gap: width of gaps, slope: steepness, slick: how slippery ice and the slide are,
  // holds: extra rough stones, len: how long each part is.
  const DIFFS = [
    { key: 'easy', name: 'Easy', sub: 'Lower steps, narrow gaps, extra holds', step: 0.82, gap: 0.78, slope: 0.8, slick: 0.6, holds: 3, len: 0.9 },
    { key: 'normal', name: 'Normal', sub: 'The mountain as it was meant to be', step: 1, gap: 1, slope: 1, slick: 1, holds: 2, len: 1 },
    { key: 'hard', name: 'Hard', sub: 'Taller steps, wider gaps, fewer holds', step: 1.1, gap: 1.12, slope: 1.12, slick: 1.15, holds: 1, len: 1.15 },
    { key: 'original', name: 'Original', sub: 'Long, steep and slick. Falls cost a lot', step: 1.16, gap: 1.2, slope: 1.22, slick: 1.25, holds: 0, len: 1.3 }
  ];

  // ---------- the mountain, laid out left to right. [material, x1,y1, x2,y2, ...] simple polygons ----------
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
  function build(di) {
    const P = DIFFS[di], st = P.step, ln = P.len, out = [], route = [], marks = [], deco = { snow: [], joints: [] };
    const mark = (x, y, name) => marks.push({ x, y, name });
    const R = (...pts) => { for (let i = 0; i < pts.length; i += 2) route.push([pts[i], pts[i + 1]]); };
    // 1. the tree (a dead end you can climb for fun) and the first small rock
    out.push(['wood', -350, 0, -312, 0, -316, 300, -326, 540, -338, 540, -346, 300],
      ['wood', -320, 214, -196, 270, -192, 284, -320, 232], ['wood', -340, 330, -474, 396, -478, 382, -342, 312],
      ['wood', -328, 432, -224, 476, -220, 490, -330, 450], blob('rock', 60, -4, 44, 36, 3, 12));
    mark(-80, 16, 'The tree'); R(-80, 16, 60, 48);
    // 2. the first climb over boulders, up to the chimney floor
    const bx = 160, Hf = 360 * st, cx = bx + 640, g = 92 * P.gap, rwx = cx + 70 + g, Ht = Hf + 600 * ln;
    out.push(blob('rock', bx + 80, -10, 100, 120 * st, 1), blob('rock', bx + 270, 50 * st, 110, 160 * st, 2),
      blob('rock', bx + 480, 150 * st, 125, 190 * st, 4, 16), ['rock', bx + 400, 0, rwx, 0, rwx, Hf, bx + 610, Hf]);
    if (P.holds >= 3) out.push(blob('nub', bx + 180, 100 * st, 18, 12, 40, 8), blob('nub', bx + 380, 220 * st, 18, 12, 41, 8));
    mark(bx + 80, 110 * st + 16, 'The boulders');
    R(bx + 80, 110 * st + 16, bx + 270, 210 * st + 16, bx + 480, 340 * st + 16, bx + 620, Hf + 16);
    // 3. the chimney: a narrow crack between a pillar and the mountain wall
    out.push(['rock', cx, Hf + 140, cx + 70, Hf + 140, cx + 70, Ht - 40, cx, Ht - 40]);
    const nC = P.holds + 1;
    for (let i = 0; i < nC; i++) {
      const y = Hf + 200 + (i + 0.5) * (Ht - Hf - 260) / nC;
      out.push(blob('nub', i % 2 ? cx + 70 : rwx, y, 16, 12, 5 + i, 8));
    }
    mark(cx + 20, Hf + 16, 'The chimney'); R(cx + 70 + g / 2, Hf + 16, cx + 70 + g / 2, Ht + 24, rwx + 60, Ht + 20);
    // 4. the slide down to the edge of the orange-hell pit
    const Ls = 520 * ln, Ds = Ls * 0.42 * P.slope, sx1 = rwx + 160 + Ls, Hl = Ht - Ds;
    out.push(['rock', rwx, 0, sx1, 0, sx1, Hl - 20, rwx + 160, Ht - 10, rwx + 150, Ht, rwx, Ht],
      ['slide', rwx + 140, Ht + 4, sx1 + 10, Hl + 4, sx1 + 10, Hl - 24, rwx + 140, Ht - 24],
      blob('nub', sx1 + 2, Hl + 8, 9, P.holds ? 14 : 10, 21, 8));
    deco.slide = [rwx + 150, Ht + 2, sx1, Hl + 2];
    mark(rwx + 60, Ht + 20, 'The slide'); R(sx1 - 24, Hl + 24);
    // 5. orange hell: hook the hanging boulder across the pit, then climb the orange wall. Fall, and it is all the way down.
    const Gp = 170 * P.gap, ox = sx1 + Gp, To = Ht + 120 * st;
    out.push(blob('orange', ox - 30, Hl + 20, 70, 52, 8), ['orange', ox + 40, 0, ox + 260, 0, ox + 260, To, ox + 40, To]);
    for (let y = 70, i = 0; y < To - 30; y += 118 * st, i++) out.push(blob('orange', ox + (i % 2 ? 10 : 50), y, 72, 58, 30 + i));
    mark(ox - 30, Hl + 88, 'Orange hell'); R(ox - 30, Hl + 90, ox + 30, To - 40, ox + 120, To + 16);
    // 6. furniture and pipes on the mesa: table, cabinet, bucket, a pipe to hook and a lamp post
    const f0 = ox + 330, i0 = f0 + 820, Ti = To + 500 * st;
    out.push(['rock', ox + 250, 0, i0, 0, i0, To, ox + 250, To],
      slab('wood', f0 + 70, To + 64 * st, f0 + 192, To + 80 * st, 4), slab('wood', f0 + 74, To - 4, f0 + 84, To + 66 * st, 2),
      slab('wood', f0 + 178, To - 4, f0 + 188, To + 66 * st, 2), slab('wood', f0 + 270, To - 4, f0 + 390, To + 180 * st, 6),
      ['metal', f0 + 490, To, f0 + 570, To, f0 + 574, To + 62, f0 + 566, To + 62, f0 + 560, To + 10, f0 + 500, To + 10, f0 + 494, To + 62, f0 + 486, To + 62],
      slab('metal', f0 + 430, To + 270 * st, f0 + 672, To + 294 * st, 10), slab('metal', f0 + 648, To - 4, f0 + 672, To + 290 * st, 3),
      slab('metal', f0 + 732, To - 4, f0 + 750, To + 412 * st, 2), slab('metal', f0 + 702, To + 410 * st, f0 + 782, To + 434 * st, 8));
    if (P.holds >= 3) out.push(blob('nub', f0 + 600, To + 160 * st, 14, 10, 42, 8));
    deco.joints.push([f0 + 660, To + 282 * st], [f0 + 660, To + 20], [f0 + 430, To + 282 * st], [f0 + 741, To + 20]);
    deco.lamp = [f0 + 742, To + 402 * st]; deco.bucket = [f0 + 530, To + 62];
    mark(f0, To + 16, 'Furniture'); mark(f0 + 560, To + 294 * st + 16, 'Pipes');
    R(f0, To + 16, f0 + 130, To + 96 * st, f0 + 330, To + 196 * st, f0 + 560, To + 310 * st, f0 + 742, To + 450 * st);
    // 7. ice mountain: one long icy slope with a few rough stones
    const Li = 560 * ln, Ri = Li * 0.62 * P.slope, i1 = i0 + 80 + Li, Tp = Ti + 8 + Ri;
    out.push(['rock', i0, 0, i1 + 140, 0, i1 + 140, Tp, i1, Tp, i0 + 80, Ti, i0, Ti],
      ['ice', i0, Ti, i0 + 80, Ti + 8, i1, Tp, i1 + 10, Tp - 30, i0 + 80, Ti - 22, i0, Ti - 20]);
    const nI = P.holds + 2;
    for (let j = 0; j < nI; j++) { const t = (j + 0.7) / (nI + 0.4); out.push(blob('nub', i0 + 80 + t * Li, Ti + 12 + t * Ri, 22, 14, 11 + j, 10)); }
    deco.ice = [i0 + 80, Ti + 8, i1, Tp];
    mark(i0 + 60, Ti + 24, 'Ice mountain'); R(i0 + 80, Ti + 24, i1, Tp + 16, i1 + 120, Tp + 16);
    // 8. the ridge: humps and steep little valleys, up and down (more of them on harder mountains)
    const nR = 2 + DIFFS.indexOf(P), base = Tp - 200 * st, r0 = i1 + 140, rEnd = r0 + 280 + (nR - 1) * 260 * ln;
    out.push(['rock', r0, 0, rEnd, 0, rEnd, base, r0, base]);
    for (let j = 0; j < nR; j++) {
      const hx = r0 + 140 + j * 260 * ln, ry = (230 + 50 * (j % 2)) * st;
      out.push(blob('rock', hx, base, 112, ry, 50 + j, 16));
      if (P.holds >= 2) out.push(blob('nub', hx - 118, base + ry * 0.45, 14, 10, 60 + j, 8));
      R(hx, base + ry + 16);
    }
    mark(r0 + 140, base + 246 * st, 'The ridge');
    // 9. a saddle, then the tall tower to the summit
    const sd = base + 30, sx = rEnd + 60, tx = sx + 80, n = Math.round(6 * ln), hb = 112 * st;
    let a = 0, b = 0, yT = sd;
    for (let i = 0; i < n; i++) {
      a = tx + i * 24 + (i % 2 ? -100 : 0); b = a + (i % 2 ? 190 : 210); yT = sd + (i + 1) * hb;
      out.push(slab('rock', a, sd + i * hb - 6, b, yT, 14)); deco.snow.push([a, b, yT]);
      R((i % 2 ? a + 40 : b - 40), yT + 16);
    }
    out.push(['rock', a, yT - 6, b, yT - 6, b - 6, yT + 40, b - 40, yT + 70, a + 40, yT + 72, a + 6, yT + 40]);
    const XMAX = b + 600;
    out.push(['rock', rEnd, 0, XMAX, 0, XMAX, sd, rEnd, sd]);
    route.splice(route.length - n, 0, [sx, sd + 16]);
    mark(sx, sd + 16, 'The tower'); mark((a + b) / 2, yT + 88, 'Summit'); R((a + b) / 2, yT + 88);
    deco.flag = [(a + b) / 2, yT + 71];
    // the ground under it all, and the world's edges
    out.push(['rock', XMIN, -300, XMAX, -300, XMAX, 0, 700, 3, 420, 0, 100, -2, -200, 4, -520, 10, XMIN, 40],
      ['wall', XMIN - 400, -300, XMIN, -300, XMIN, 9000, XMIN - 400, 9000],
      ['wall', XMAX, -300, XMAX + 400, -300, XMAX + 400, 9000, XMAX, 9000]);
    return { P, shapes: out, route, marks, deco, XMAX, YTOP: yT + 2000, summit: { y: yT + 75, x0: a, x1: b } };
  }

  function makeWorld(di) {
    const C0 = build(di), P = C0.P;
    const world = C0.shapes.map(([k, ...f]) => {
      const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]);
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const m = MAT[k], slick = k === 'ice' || k === 'slide' ? P.slick : 1;
      return { k, p, mu: Math.min(1, m.mu / slick), slip: Math.min(1, m.slip * slick), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    // coarse grid so a probe only looks at nearby shapes
    const grid = new Map(), C = 160, pad = PR + 4;
    world.forEach(sh => {
      for (let cx = Math.floor((sh.x0 - pad) / C); cx <= Math.floor((sh.x1 + pad) / C); cx++)
        for (let cy = Math.floor((Math.max(sh.y0, -400) - pad) / C); cy <= Math.floor((Math.min(sh.y1, C0.YTOP) + pad) / C); cy++) {
          const key = cx * 4096 + cy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(sh);
        }
    });
    world.near = (x, y) => grid.get(Math.floor(x / C) * 4096 + Math.floor(y / C)) || [];
    // how far along the route each point is
    const rl = [0]; for (let i = 1; i < C0.route.length; i++) rl.push(rl[i - 1] + Math.hypot(C0.route[i][0] - C0.route[i - 1][0], C0.route[i][1] - C0.route[i - 1][1]));
    world.progress = (x, y) => {
      let best = Infinity, out = 0; const Rt = C0.route;
      for (let i = 1; i < Rt.length; i++) {
        const [ax, ay] = Rt[i - 1], [bx, by] = Rt[i], ex = bx - ax, ey = by - ay, L = ex * ex + ey * ey;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)), qx = ax + ex * t, qy = ay + ey * t;
        const d = Math.hypot(x - qx, y - qy);
        if (d < best - 1e-6) { best = d; out = rl[i - 1] + Math.sqrt(L) * t; }
      }
      return { at: out, off: best };
    };
    world.total = rl[rl.length - 1];
    world.marks = C0.marks.map(m => Object.assign({ at: world.progress(m.x, m.y).at }, m));
    Object.assign(world, { di, deco: C0.deco, XMAX: C0.XMAX, YTOP: C0.YTOP, summit: C0.summit, route: C0.route });
    return world;
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
    const list = world.near(x, y);
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
  const START = { x: -80, y: PR + 0.5 };
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
    const mx = ox * dt, my = oy * dt;
    // 2. the pot falls. A hammer swung through the air pushes on nothing, so it does not move the pot: only a head
    //    touching the terrain (below) moves it. In the air the pot flies its own arc, which makes long jumps possible.
    s.v.y += G * dt;
    let px = s.p.x + s.v.x * dt, py = s.p.y + s.v.y * dt;
    // 2b. only a head resting ON TOP of something (normal up) holds the pot up: it stays put while the pot hangs from it.
    //     Free or against a wall/ceiling the head just rides along with the pot (so gravity wins and the pot falls).
    const sup = s.hc && s.hn.y >= SUP;
    let qx = s.o.x, qy = s.o.y, a0 = { hit: false };
    if (!sup) {
      const cq = clampArm(s.h.x - s.p.x, s.h.y - s.p.y); qx = cq.x; qy = cq.y;
      a0 = probe(world, px + qx, py + qy, HR);
      if (a0.hit) {
        if (a0.ny >= SUP) { px += a0.x - (px + qx); py += a0.y - (py + qy); }
        else { const cl = clampArm(a0.x - px, a0.y - py); qx = cl.x; qy = cl.y; }
      }
      s.h.x = px + qx; s.h.y = py + qy;
    }
    const no = clampArm(s.o.x + mx, s.o.y + my);
    // 3. the mouse moves the head: free, it goes where the arm puts it; pressed into terrain, it holds and the pot moves instead
    const hx = px + no.x, hy = py + no.y;
    let c = probe(world, hx, hy, HR);
    // a planted head clings on through slow moves (never to a ceiling); only a quick shove breaks it free
    if (!c.hit && s.hc && Math.hypot(s.v.x, s.v.y) < STICKV) {
      const a = probe(world, hx, hy, HR + STICK);
      if (a.hit && a.ny > -0.3) c = { x: a.x - a.nx * STICK, y: a.y - a.ny * STICK, hit: true, nx: a.nx, ny: a.ny, sh: a.sh };
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
    s.hc = c.hit || a0.hit; s.o.x = no.x; s.o.y = no.y;
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
    // a planted hammer can only throw the pot so fast (flings yes, glitch launches from rock pushes no)
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
  const LEAVES = [[-330, 560, 70], [-400, 500, 52], [-250, 510, 50], [-470, 410, 40], [-215, 300, 38], [-210, 480, 36]];
  const GRASS = [[-620, 22], [-520, 12], [-460, 9], [-170, 4], [-20, 1], [120, 0]];

  Ludus.register({
    id: 'climb', name: 'Hammer Climb', tag: 'Arcade', tint: '#7d6a58',
    hint: 'The mouse moves the hammer head. Plant it, keep moving to lever yourself · <kbd>←</kbd><kbd>→</kbd> swing <kbd>↑</kbd><kbd>↓</kbd> reach · <kbd>-</kbd><kbd>+</kbd> sensitivity',
    _rules: { build, makeWorld, step, newState, clampArm, probe, DIFFS, START, HL, HMIN, PR, HR, STEP, VIEW },
    art(ctx, w, h) {
      // one clear climb: a far range for depth, a stepped mountain with a snowy peak and flag, the pot on the first ledge,
      // the hammer reaching from the pot to hook the next ledge
      const X = v => w * v, Y = v => h * v;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(-5, h); ctx.lineTo(-5, Y(0.5)); ctx.lineTo(X(0.18), Y(0.36)); ctx.lineTo(X(0.34), Y(0.5)); ctx.lineTo(X(0.5), Y(0.3)); ctx.lineTo(X(0.7), Y(0.52)); ctx.lineTo(w + 5, Y(0.4)); ctx.lineTo(w + 5, h); ctx.fill();
      const ridge = [[-0.05, 0.9], [0.14, 0.84], [0.36, 0.78], [0.42, 0.62], [0.64, 0.56], [0.7, 0.4], [0.84, 0.3], [1.05, 0.3]];
      const trace = () => { ctx.beginPath(); ctx.moveTo(X(ridge[0][0]), h + 5); ridge.forEach(([x, y]) => ctx.lineTo(X(x), Y(y))); ctx.lineTo(w + 5, h + 5); ctx.closePath(); };
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; trace(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ridge.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke();
      // an orange boulder on the second ledge and a snowy cap on the peak
      ctx.fillStyle = '#e8925a'; ctx.beginPath(); ctx.ellipse(X(0.56), Y(0.545), w * 0.06, h * 0.075, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath(); ctx.moveTo(X(0.77), Y(0.345)); ctx.lineTo(X(0.84), Y(0.3)); ctx.lineTo(X(1.02), Y(0.3)); ctx.lineTo(X(1.02), Y(0.34)); ctx.lineTo(X(0.94), Y(0.37)); ctx.lineTo(X(0.88), Y(0.345)); ctx.closePath(); ctx.fill();
      // flag on the peak, fully inside the card
      ctx.strokeStyle = '#fffaf2'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(0.88), Y(0.3)); ctx.lineTo(X(0.88), Y(0.1)); ctx.stroke();
      ctx.fillStyle = '#e8925a'; ctx.beginPath(); ctx.moveTo(X(0.88), Y(0.1)); ctx.lineTo(X(0.96), Y(0.14)); ctx.lineTo(X(0.88), Y(0.18)); ctx.fill();
      // the pot, sitting on the first ledge
      const px = X(0.2), by = Y(0.83), r = h * 0.1;
      ctx.fillStyle = '#b8603f';
      ctx.beginPath(); ctx.moveTo(px - r * 1.05, by - r * 1.5); ctx.lineTo(px + r * 1.05, by - r * 1.5); ctx.lineTo(px + r * 0.75, by); ctx.lineTo(px - r * 0.75, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d27650'; ctx.fillRect(px - r * 1.15, by - r * 1.75, r * 2.3, r * 0.4);
      // the hammer: shaft from the pot rim, head hooked over the second ledge
      const hx0 = px + r * 0.9, hy0 = by - r * 1.5, hx1 = X(0.42), hy1 = Y(0.6), ang = Math.atan2(hy1 - hy0, hx1 - hx0);
      ctx.strokeStyle = '#2b2722'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
      ctx.fillStyle = '#2b2722'; ctx.save(); ctx.translate(hx1, hy1); ctx.rotate(ang + Math.PI / 2); D.roundRect(ctx, -h * 0.05, -h * 0.025, h * 0.1, h * 0.05, 3); ctx.fill(); ctx.restore();
    },
    create(stage, api) {
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      canvas.style.cursor = 'crosshair';
      let world, s, maxH, maxP, time, state = 'menu', cam = { x: 0, y: 0 }, winLift = 0, acc = 0, aim, mouse = null, keysDown = {}, clock = 0, winAt = 0;
      let fallFrom = 0, fallNote = null, lastTap = 0, wasHc = false, falls = 0, reached = 1, sectionNote = null, back = null;
      let sensI = SENS.indexOf(+Ludus.state.climbSens); if (sensI < 0) sensI = 2;
      let pick = DIFFS.findIndex(d => d.key === Ludus.state.climbDiff); if (pick < 0) pick = [0, 1, 2][api.level] ?? 1;
      let hover = -1;

      const fin = v => typeof v === 'number' && isFinite(v);
      const pt = q => q && fin(q.x) && fin(q.y);
      function setWorld(di) {
        world = makeWorld(di);
        // the mountain mass behind the route, so hanging parts read as one mountain (decor only)
        back = world.route.map(([x, y]) => [x, y - 40]).concat([[world.route[world.route.length - 1][0], 0], [world.route[0][0], 0]]);
      }
      function restore(o) {
        if (!o || o.v2 !== 2 || !fin(o.di) || !DIFFS[o.di] || !pt(o.p) || !pt(o.v) || !pt(o.o) || !pt(o.h)) return false;
        setWorld(o.di);
        if (o.p.x < XMIN || o.p.x > world.XMAX || o.p.y < -100 || o.p.y > world.YTOP || Math.hypot(o.o.x, o.o.y) > HL + 1) return false;
        s = { p: { x: o.p.x, y: o.p.y }, v: { x: o.v.x, y: o.v.y }, o: { x: o.o.x, y: o.o.y }, h: { x: o.h.x, y: o.h.y }, hc: !!o.hc,
          hn: pt(o.hn) ? { x: o.hn.x, y: o.hn.y } : { x: 0, y: 1 }, ground: !!o.ground, air: 0 };
        maxH = fin(o.maxH) ? Math.max(0, o.maxH) : 0; time = fin(o.time) ? o.time : 0; falls = fin(o.falls) ? o.falls : 0;
        maxP = fin(o.maxP) ? Math.max(0, o.maxP) : 0;
        if (o.aim && fin(o.aim.a) && fin(o.aim.l)) aim = { a: o.aim.a, l: o.aim.l };
        pick = o.di; state = 'play';
        return true;
      }
      function begin(di) {
        pick = di; Ludus.state.climbDiff = DIFFS[di].key; Ludus.save();
        setWorld(di); s = newState(); maxH = 0; maxP = 0; time = 0; falls = 0; aim = null; acc = 0;
        aim = { a: Math.atan2(s.o.y, s.o.x), l: Math.hypot(s.o.x, s.o.y) };
        cam.x = s.p.x; cam.y = s.p.y; fallFrom = s.p.y; reached = 1; state = 'play';
        sectionNote = { text: DIFFS[di].name, t: clock }; api.sfx('tap'); api.score(0);
      }
      if (!restore(api.saved)) { setWorld(pick); s = newState(); maxH = 0; maxP = 0; time = 0; aim = null; state = 'menu'; }
      if (!aim) aim = { a: Math.atan2(s.o.y, s.o.x), l: Math.hypot(s.o.x, s.o.y) };
      cam.x = s.p.x; cam.y = s.p.y; fallFrom = s.p.y;
      const countReached = () => { let n = 0; world.marks.forEach(m => { if (m.at <= maxP + 30) n++; }); return Math.max(1, n); };
      reached = countReached();
      api.score(Math.floor(maxP / 10));

      // ---------- input: the cursor offset from the pot (which sits still on screen) is where the head wants to be ----------
      const scale = () => Math.min(view.w / VIEW, view.h / (VIEW * 1.25));
      const anchor = () => ({ x: view.w * 0.5, y: view.h * 0.56 });
      const toScreen = (x, y) => { const k = scale(), a = anchor(); return { x: a.x + (x - cam.x) * k, y: a.y - (y - cam.y) * k }; };
      const sensBox = () => ({ x: view.w - 62, y: 8, w: 54, h: 30 });
      const inBox = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      function menuLayout() {
        const w = view.w, h = view.h, cw = Math.min(w - 32, 340), ch = Math.max(46, Math.min(58, (h - 170) / 4 - 10));
        const total = 64 + DIFFS.length * (ch + 10) + 26, top = Math.max(12, (h - total) / 2);
        return { title: top + 18, sub: top + 44, cards: DIFFS.map((d, i) => ({ x: (w - cw) / 2, y: top + 64 + i * (ch + 10), w: cw, h: ch })), foot: top + 64 + DIFFS.length * (ch + 10) + 12 };
      }
      const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      function setSens(i) {
        sensI = Math.max(0, Math.min(SENS.length - 1, i)); Ludus.state.climbSens = SENS[sensI]; Ludus.save();
        sectionNote = { text: `Sensitivity ${SENS[sensI]}×`, t: clock };
      }
      api.on(canvas, 'pointermove', e => {
        const p = local(e);
        if (state === 'menu') { hover = menuLayout().cards.findIndex(c => inBox(c, p)); canvas.style.cursor = hover >= 0 ? 'pointer' : 'default'; return; }
        mouse = p;
      });
      api.on(canvas, 'pointerdown', e => {
        const p = local(e);
        if (state === 'menu') { const i = menuLayout().cards.findIndex(c => inBox(c, p)); if (i >= 0) { canvas.style.cursor = 'crosshair'; begin(i); } return; }
        if (state === 'play' && inBox(sensBox(), p)) { setSens((sensI + 1) % SENS.length); api.sfx('tick'); return; }
        mouse = p;
      });
      api.keys(e => {
        if (state === 'menu') {
          if (e.key === 'ArrowUp') pick = (pick + DIFFS.length - 1) % DIFFS.length;
          else if (e.key === 'ArrowDown') pick = (pick + 1) % DIFFS.length;
          else if (e.key === 'Enter' || e.key === ' ') begin(pick);
          else if (/^[1-4]$/.test(e.key)) begin(+e.key - 1);
          if (e.key.startsWith('Arrow')) { setWorld(pick); api.sfx('tick'); }
          return;
        }
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
        const hgt = s.p.y - PR; if (hgt > maxH) maxH = hgt;
        const pr = world.progress(s.p.x, s.p.y);
        if (pr.off < 150 && pr.at > maxP && (s.ground || s.hc)) { maxP = pr.at; api.score(Math.floor(maxP / 10)); }
        const r = countReached();
        if (r > reached) { reached = r; sectionNote = { text: world.marks[r - 1].name, t: clock }; api.sfx('score'); }
        if (s.ground || s.hc) {
          const lost = fallFrom - s.p.y;
          if (lost > 140 && s.ground) { falls++; fallNote = { text: `-${Math.round(lost / 10)} m`, t: clock, x: s.p.x, y: s.p.y }; api.sfx('hit'); }
          fallFrom = s.p.y;
        } else fallFrom = Math.max(fallFrom, s.p.y);
        const sm = world.summit;
        if (s.p.y > sm.y && s.ground && s.p.x > sm.x0 && s.p.x < sm.x1) win();
      }
      function win() {
        state = 'won'; winAt = clock; maxP = world.total; reached = world.marks.length;
        const score = Math.floor(world.total / 10) + Math.max(0, Math.round(2400 - time)) * (world.di + 1);
        api.score(score); api.sfx('win');
        const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
        api.timeout(() => api.over({ score, title: 'Summit', won: true, message: `${DIFFS[world.di].name} mountain in ${mm}:${ss}, ${falls} big fall${falls === 1 ? '' : 's'}` }), 2200);
      }

      // ---------- render ----------
      function pathPts(list) {
        ctx.beginPath();
        list.forEach((q, i) => { const a = toScreen(q[0], q[1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); });
        ctx.closePath();
      }
      function sky(col, w, h, k) {
        const t = Math.max(0, Math.min(1, cam.y / 3400)), d = col.dark;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        if (d) { g.addColorStop(0, `hsl(${222 + t * 20} ${28 + t * 10}% ${13 - t * 5}%)`); g.addColorStop(1, `hsl(${28 - t * 20} 16% ${12 - t * 3}%)`); }
        else { g.addColorStop(0, `hsl(${36 + t * 170} ${48 - t * 8}% ${93 - t * 10}%)`); g.addColorStop(1, `hsl(${34 + t * 150} 40% ${91 - t * 4}%)`); }
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
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
        // clouds drifting past
        ctx.fillStyle = d ? 'rgba(255,245,230,0.05)' : 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 14; i++) {
          const p = toScreen(i * 700 - 400 + cam.x * 0.4, 700 + (i * 530) % 2600 + cam.y * 0.3), r = (36 + (i % 3) * 12) * k;
          if (p.x < -3 * r || p.x > w + 3 * r || p.y < -r || p.y > h + r) continue;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.8, r * 0.55, 0, 0, Math.PI * 2); ctx.ellipse(p.x + r * 0.6, p.y - r * 0.3, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      function render() {
        const col = api.colors(), pal = palette(col.dark), d = col.dark;
        const { w, h } = view, k = scale();
        if (state === 'won') winLift += (200 - winLift) * (api.reduceMotion ? 1 : 0.03);
        if (state === 'menu') { cam.x = 260 + Math.sin(clock * 0.15) * 120; cam.y = 200; }
        else { cam.x = s.p.x; cam.y = s.p.y + winLift; }
        ctx.clearRect(0, 0, w, h);
        ctx.save(); D.roundRect(ctx, 0, 0, w, h, 14); ctx.clip();
        sky(col, w, h, k);
        const a0 = anchor(), L = cam.x - a0.x / k - 40, R = cam.x + (w - a0.x) / k + 40, B = cam.y - (h - a0.y) / k - 40, T = cam.y + a0.y / k + 40;
        const vis = sh => !(sh.x1 < L || sh.x0 > R || sh.y1 < B || sh.y0 > T);
        ctx.fillStyle = d ? 'rgba(255,240,220,0.045)' : 'rgba(150,120,90,0.12)'; pathPts(back); ctx.fill();
        LEAVES.forEach(([x, y, r], i) => {
          const p = toScreen(x, y); if (p.y < -r * 2 * k || p.y > h + r * 2 * k || p.x < -r * 2 * k || p.x > w + r * 2 * k) return;
          ctx.fillStyle = d ? (i % 2 ? '#3d5a3f' : '#46684a') : (i % 2 ? '#9cc38f' : '#b2d3a3');
          ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2); ctx.fill();
        });
        const lg = toScreen(world.deco.lamp[0], world.deco.lamp[1]);
        if (lg.y > -200 && lg.y < h + 200 && lg.x > -200 && lg.x < w + 200) {
          const gr = ctx.createRadialGradient(lg.x, lg.y, 2, lg.x, lg.y, 90 * k);
          gr.addColorStop(0, d ? 'rgba(255,214,140,0.45)' : 'rgba(255,200,110,0.4)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lg.x, lg.y, 90 * k, 0, Math.PI * 2); ctx.fill();
        }
        // terrain: rims first, then fills, per material, so overlapping pieces join without seams
        ctx.lineJoin = 'round';
        ORDER.forEach(kind => {
          const list = world.filter(sh => sh.k === kind && vis(sh)); if (!list.length) return;
          const [fill, rim] = pal[kind];
          if (kind !== 'wall') { ctx.strokeStyle = rim; ctx.lineWidth = 4; list.forEach(sh => { pathPts(sh.p); ctx.stroke(); }); }
          ctx.fillStyle = fill; list.forEach(sh => { pathPts(sh.p); ctx.fill(); });
        });
        details(col, k);
        // progress markers
        world.marks.forEach((m, i) => {
          if (i === world.marks.length - 1) return;
          const p = toScreen(m.x, m.y - PR); if (p.x < -120 || p.x > w + 80 || p.y < -60 || p.y > h + 40) return;
          const on = i < reached;
          ctx.strokeStyle = d ? 'rgba(255,245,230,0.5)' : 'rgba(90,74,58,0.55)'; ctx.lineWidth = 1.5;
          const fx = p.x - 22 * k, fy = p.y;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30 * k); ctx.stroke();
          ctx.fillStyle = on ? col.accent : (d ? 'rgba(255,245,230,0.3)' : 'rgba(90,74,58,0.3)');
          ctx.beginPath(); ctx.moveTo(fx, fy - 30 * k); ctx.lineTo(fx + 14 * k, fy - 25 * k); ctx.lineTo(fx, fy - 20 * k); ctx.fill();
          // no label on the start flag: the pot sits under it and the section pill already names it
          if (i > 0) { ctx.globalAlpha = 0.75; D.text(ctx, m.name, fx + 4 * k, fy - 40 * k, 10.5, col.ink2, 700, 'left'); ctx.globalAlpha = 1; }
        });
        // summit flag
        const fp = toScreen(world.deco.flag[0], world.deco.flag[1]);
        if (fp.y > -80 && fp.y < h + 60 && fp.x > -60 && fp.x < w + 60) {
          ctx.strokeStyle = col.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(fp.x, fp.y - 56 * k); ctx.stroke();
          ctx.fillStyle = col.accent; ctx.beginPath(); ctx.moveTo(fp.x, fp.y - 56 * k); ctx.lineTo(fp.x + 24 * k, fp.y - 48 * k + Math.sin(clock * 3) * 2); ctx.lineTo(fp.x, fp.y - 40 * k); ctx.fill();
          D.spark(ctx, fp.x, fp.y - 64 * k, 8 * k, col.accent, clock * 0.8);
        }
        if (state !== 'menu') drawClimber(col, k);
        if (fallNote && clock - fallNote.t < 1.6 && state === 'play') {
          const p = toScreen(fallNote.x, fallNote.y), a = 1 - (clock - fallNote.t) / 1.6;
          ctx.globalAlpha = a; D.text(ctx, fallNote.text, p.x, p.y - 38 - (1 - a) * 16, 13, col.bad, 750); ctx.globalAlpha = 1;
        }
        if (state === 'menu') menu(col, w, h); else hud(col, w, h);
        ctx.restore();
      }
      function details(col, k) {
        const d = col.dark, on = (p, m) => p.x > -m && p.x < view.w + m && p.y > -m && p.y < view.h + m;
        ctx.strokeStyle = d ? '#4f7a52' : '#8db57f'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        GRASS.forEach(([x, y]) => {
          const p = toScreen(x, y); if (!on(p, 20)) return;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(p.x + i * 3 * k, p.y); ctx.lineTo(p.x + i * 4.5 * k, p.y - (7 + (i & 1) * 4) * k); ctx.stroke(); }
        });
        const line = (q, off, wdt, c, dash) => {
          const a = toScreen(q[0], q[1]), b = toScreen(q[2], q[3]);
          if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > view.w + 20 || Math.max(a.y, b.y) < -40 || Math.min(a.y, b.y) > view.h + 40) return;
          ctx.strokeStyle = c; ctx.lineWidth = wdt;
          if (!dash) { ctx.beginPath(); ctx.moveTo(a.x, a.y + off * k); ctx.lineTo(b.x, b.y + off * k); ctx.stroke(); return; }
          for (let t = 0.04; t < 0.95; t += 0.09) {
            ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + off * k);
            ctx.lineTo(a.x + (b.x - a.x) * (t + 0.035), a.y + (b.y - a.y) * (t + 0.035) + off * k); ctx.stroke();
          }
        };
        line(world.deco.ice, 9, 2.5, d ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.95)', true);
        line(world.deco.slide, 8, 3 * k, d ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.6)', false);
        ctx.fillStyle = d ? '#dfe8ee' : '#ffffff';
        world.deco.snow.forEach(([x0, x1, y]) => {
          const a = toScreen(x0 + 10, y), b = toScreen(x1 - 10, y); if (!on(a, 260)) return;
          ctx.beginPath(); ctx.moveTo(a.x, a.y + 1); ctx.lineTo(b.x, b.y + 1);
          for (let x = x1 - 16; x > x0 + 14; x -= 22) { const p = toScreen(x, y); ctx.lineTo(p.x, p.y + (5 + (Math.round(x) % 3) * 2) * k); }
          ctx.closePath(); ctx.fill();
        });
        const sm = world.summit, pk = toScreen(sm.x0 + 20, sm.y - 30), pk2 = toScreen(sm.x1 - 10, sm.y - 30);
        if (on(pk, 200)) { ctx.beginPath(); ctx.moveTo(pk.x, pk.y); ctx.quadraticCurveTo((pk.x + pk2.x) / 2, pk.y - 60 * k, pk2.x, pk2.y); ctx.lineTo((pk.x + pk2.x) / 2, pk.y - 14 * k); ctx.fill(); }
        ctx.fillStyle = d ? '#7f8d98' : '#8c9daa';
        world.deco.joints.forEach(([x, y]) => { const p = toScreen(x, y); if (on(p, 30)) { D.roundRect(ctx, p.x - 15 * k, p.y - 15 * k, 30 * k, 30 * k, 5 * k); ctx.fill(); } });
        const bh = toScreen(world.deco.bucket[0], world.deco.bucket[1]);
        if (on(bh, 60)) { ctx.strokeStyle = d ? '#8b98a3' : '#7f909d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(bh.x, bh.y, 42 * k, 26 * k, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
        const lb = toScreen(world.deco.lamp[0], world.deco.lamp[1] + 4);
        if (on(lb, 30)) { ctx.fillStyle = d ? '#ffe2a6' : '#ffd27a'; ctx.beginPath(); ctx.ellipse(lb.x, lb.y, 16 * k, 7 * k, 0, 0, Math.PI); ctx.fill(); }
      }
      function pill(x, y, w, h, d) { ctx.fillStyle = d ? 'rgba(42,38,33,0.86)' : 'rgba(255,252,247,0.9)'; D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill(); }
      function hud(col, w, h) {
        const d = col.dark, pct = Math.min(100, Math.floor(maxP / world.total * 100));
        const pw = Math.min(170, w - 150), px = w / 2 - pw / 2;
        pill(px, 8, pw, 30, d);
        D.fitText(ctx, `${Math.max(0, Math.floor((s.p.y - PR) / 10))} m`, px + pw * 0.3, 23, pw * 0.42, 14, col.ink, 780);
        D.fitText(ctx, `best ${pct}%`, px + pw * 0.72, 23, pw * 0.44, 11, col.ink2, 650);
        // part of the mountain, and progress dots
        const nM = world.marks.length, sec = world.marks[Math.max(0, reached - 1)].name;
        D.fitText(ctx, sec, w / 2, 50, Math.min(220, w - 40), 10.5, col.ink2, 700);
        for (let i = 0; i < nM; i++) {
          ctx.fillStyle = i < reached ? col.accent : (d ? 'rgba(255,245,230,0.18)' : 'rgba(90,74,58,0.18)');
          ctx.beginPath(); ctx.arc(w / 2 + (i - (nM - 1) / 2) * 9, 62, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        const sb = sensBox(); pill(sb.x, sb.y, sb.w, sb.h, d);
        D.fitText(ctx, `${SENS[sensI]}×`, sb.x + sb.w / 2, sb.y + 15, sb.w - 12, 11, col.ink2, 700);
        pill(8, 8, 62, 30, d); D.fitText(ctx, DIFFS[world.di].name, 39, 23, 50, 10.5, col.ink2, 700, 8);
        if (sectionNote && clock - sectionNote.t < 2) {
          const a = Math.min(1, (2 - (clock - sectionNote.t)) * 2);
          ctx.globalAlpha = a; D.fitText(ctx, sectionNote.text, w / 2, h * 0.22, w - 40, 17, col.ink, 780); ctx.globalAlpha = 1;
        }
        if (state === 'won') {
          const a = Math.min(1, (clock - winAt) / 0.6);
          ctx.globalAlpha = a; D.fitText(ctx, 'You made it to the top', w / 2, h * 0.2, w - 40, 17, col.good, 780);
          D.fitText(ctx, `${DIFFS[world.di].name} mountain · ${falls} big fall${falls === 1 ? '' : 's'}`, w / 2, h * 0.2 + 24, w - 40, 12, col.ink2, 650); ctx.globalAlpha = 1;
          for (let i = 0; i < 8; i++) {
            const t = clock - winAt + i * 0.3, r = 10 + (t * 60) % 110, p = toScreen(s.p.x, s.p.y);
            ctx.globalAlpha = Math.max(0, 1 - r / 120); D.spark(ctx, p.x + Math.cos(i * 0.8) * r, p.y - Math.abs(Math.sin(i * 1.7)) * r * 0.7 - 20, 6, col.accent, t);
          }
          ctx.globalAlpha = 1;
        } else if (time < 8 && maxP < 60) {
          ctx.globalAlpha = Math.min(1, 8 - time);
          D.fitText(ctx, 'Hook the rock with the hammer, then pull to climb', w / 2, h - 18, w - 32, 11, col.ink2, 650, 9);
          ctx.globalAlpha = 1;
        }
      }
      function menu(col, w, h) {
        const d = col.dark, m = menuLayout();
        ctx.fillStyle = d ? 'rgba(20,18,16,0.55)' : 'rgba(250,246,240,0.55)'; ctx.fillRect(0, 0, w, h);
        D.fitText(ctx, 'Hammer Climb', w / 2, m.title, w - 40, 20, col.ink, 800);
        D.fitText(ctx, 'Pick your mountain', w / 2, m.sub, w - 40, 12, col.ink2, 650);
        m.cards.forEach((c, i) => {
          const sel = i === pick, hov = i === hover;
          ctx.fillStyle = d ? (hov ? 'rgba(60,54,48,0.96)' : 'rgba(42,38,33,0.94)') : (hov ? 'rgba(255,255,255,1)' : 'rgba(255,252,247,0.95)');
          D.roundRect(ctx, c.x, c.y, c.w, c.h, 14); ctx.fill();
          if (sel) { ctx.strokeStyle = col.accent; ctx.lineWidth = 2; D.roundRect(ctx, c.x + 1, c.y + 1, c.w - 2, c.h - 2, 13); ctx.stroke(); }
          // difficulty pips on the left, text centred in the rest
          for (let j = 0; j < 4; j++) {
            ctx.fillStyle = j <= i ? col.accent : (d ? 'rgba(255,245,230,0.16)' : 'rgba(90,74,58,0.16)');
            ctx.beginPath(); ctx.arc(c.x + 18, c.y + c.h / 2 + (j - 1.5) * 8, 2.6, 0, Math.PI * 2); ctx.fill();
          }
          const tx = c.x + 30 + (c.w - 40) / 2, tw = c.w - 52;
          D.fitText(ctx, DIFFS[i].name, tx, c.y + c.h / 2 - 9, tw, 15, col.ink, 760, 11);
          D.fitText(ctx, DIFFS[i].sub, tx, c.y + c.h / 2 + 10, tw, 11, col.ink2, 600, 9);
        });
        D.fitText(ctx, 'Click a mountain to start · ↑ ↓ and Enter work too', w / 2, m.foot, w - 40, 10.5, col.ink3, 650, 9);
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
        if (state === 'play') {                  // where the head wants to be, and how far the arm reaches
          const t = toScreen(s.p.x + Math.cos(aim.a) * aim.l, s.p.y + Math.sin(aim.a) * aim.l);
          ctx.strokeStyle = col.ink3; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;

        }
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      if (window.ludusDebug) Ludus.games.find(x => x.id === 'climb')._peek = () => ({ s, maxH, maxP, state, aim, cam, time, reached, falls, toScreen, scale, anchor, sens: SENS[sensI], world, pick, menuLayout,
        teleport(x, y) { Object.assign(s, newState({ x, y })); fallFrom = y; } });
      return {
        save() {
          if (state !== 'play' || time < 1) return null;
          const c = q => ({ x: q.x, y: q.y });
          return { v2: 2, di: world.di, p: c(s.p), v: c(s.v), o: c(s.o), h: c(s.h), hc: s.hc, hn: c(s.hn), ground: s.ground, maxH, maxP, time, falls, aim: { a: aim.a, l: aim.l } };
        },
        resume() { acc = 0; }
      };
    }
  });
})();
