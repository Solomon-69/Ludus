/* Hammer Climb: a spark sits in a pot and has only a long hammer.
   One long, wide, hand-made mountain that runs to the RIGHT: the tree and rocks, the boulders, the chimney,
   the slide and the orange-hell pit, furniture and pipes, ice mountain, the ridge, then the tall tower to the summit.
   then the sky: rocks floating over a sea of clouds, climbed rock to rock, and from the last one a final push into space.
   One mountain, one difficulty (no levels to pick).
   Control: the mouse offset from the pot is where the hammer head wants to be (clamped to the arm, 1:1 with the view).
   The camera keeps the pot still on screen, so the cursor IS the head target. A free head chases it (stiff spring,
   capped speed). A head pressed into terrain sticks, so further mouse motion moves the POT instead (lever physics).
   World units, y grows upward. Fixed 240 Hz position-based solver, so it feels the same at any frame rate. */
(function () {
  const D = Ludus.draw;
  const G = -1250, PR = 16, HR = 6, HL = 80, HMIN = 18, STEP = 1 / 240, VIEW = 360;
  // the head follows the mouse closely (fast spring, high speed cap: 1300/240 = 5.4 units a step, under the head radius, so it never tunnels)
  const SPRING = 40, HSPD = 1300, VMAX = 1000, FLING = 640, BOUNCE = 0.18, STICK = 1.5, STICKV = 380, SUP = 0.25;
  // Materials: head slip (share of sideways drag that slides), pot friction.
  const MAT = {
    rock: { slip: 0, mu: 0.9 }, float: { slip: 0, mu: 0.9 }, cloud: { slip: 0, mu: 0.95 }, edge: { slip: 1, mu: 0.3 }, orange: { slip: 0, mu: 0.8 }, wall: { slip: 1, mu: 0.3 }, wood: { slip: 0.03, mu: 0.8 },
    metal: { slip: 0.25, mu: 0.45 }, slide: { slip: 0.45, mu: 0.1 }, ice: { slip: 0.8, mu: 0.035 }, nub: { slip: 0, mu: 1 }
  };
  const XMIN = -700;
  const SENS = [0.6, 0.8, 1, 1.25, 1.5];
  // The one mountain (it used to be the middle, "Normal", of four levels). step: height of climbs, gap: width of gaps,
  // slope: steepness, slick: how slippery ice and the slide are, holds: extra rough stones, len: how long each part is.
  const P0 = { step: 1, gap: 1, slope: 1, slick: 1, holds: 2, len: 1 };
  // The sky: floating rocks, each a little higher and to the right of the last (checked climbable by QA/climb-reach.js).
  const SKY = { n: 8, dx: 150, rise: 70, w: 124, th: 54, sumW: 250 };

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
  // a rock floating in the air: a flat top to stand on, a bevelled rim and a tapered underside
  function floater(cx, top, w, th) {
    const a = w / 2;
    return ['float', cx - a, top - 10, cx - a + 10, top, cx + a - 10, top, cx + a, top - 10, cx + a * 0.66, top - th * 0.62,
      cx + a * 0.18, top - th, cx - a * 0.3, top - th * 0.86, cx - a * 0.74, top - th * 0.5];
  }
  function build() {
    // An original mountain in the spirit of the famous pot-and-hammer climb: the start pit under a dead tree, the pipes,
    // orange rocks and a bucket, the chimney, the furniture, the long slide, the mountain, the ice, and a summit in space.
    const P = P0, st = P.step, gp = P.gap, ln = P.len, sl = P.slope, out = [], route = [], marks = [], deco = { snow: [], joints: [] };
    const mark = (x, y, name) => marks.push({ x, y, name });
    const R = (...pts) => { for (let i = 0; i < pts.length; i += 2) route.push([pts[i], pts[i + 1]]); };
    const nub = (x, y, i) => out.push(blob('nub', x, y, 16, 11, 70 + i, 8));
    // 1. the start pit: a dead tree on the left rim (climb it for fun), a boulder and a shelf on the right
    const H1 = 150 * st;
    out.push(['rock', XMIN, 0, -250, 0, -232, 40, -240, 90, XMIN, 90],
      ['wood', -350, 86, -312, 86, -316, 380, -326, 630, -338, 630, -346, 380],
      ['wood', -320, 304, -196, 360, -192, 374, -320, 322], ['wood', -340, 420, -474, 486, -478, 472, -342, 402],
      ['wood', -328, 522, -224, 566, -220, 580, -330, 540],
      blob('rock', 92, 0, 66, 92 * st, 3, 12));
    if (P.holds >= 3) nub(40, 34, 0);
    mark(-80, 16, 'The pit'); R(-80, 16, 92, 92 * st + 16, 260, H1 + 16);
    // 2. the pipes: four metal pipes, each a step above the last and overlapping it, over a rock shelf
    const p0 = 520, pr = 96 * st, pl = 210 * ln, nP = 4;
    let pa = p0, pTop = H1;
    for (let i = 0; i < nP; i++) {
      pTop = H1 + (i + 1) * pr;
      out.push(slab('metal', pa, pTop - 26, pa + pl, pTop, 10), slab('metal', pa + pl - 34, H1 - 4, pa + pl - 16, pTop - 24, 3));
      deco.joints.push([pa + pl - 25, pTop - 13], [pa + pl - 25, H1 + 14]);
      R(pa + pl * 0.5, pTop + 16);
      if (i < nP - 1) pa += pl - 24 * gp;
    }
    const pEnd = pa + pl;
    out.push(['rock', 120, 0, pEnd + 10, 0, pEnd + 10, H1, 150, H1, 132, H1 - 44]);
    mark(p0 - 30, H1 + 16, 'Pipes');
    // 3. orange rocks and the bucket: three orange steps with round lips, a bucket to climb in and out of
    const O = pEnd - 10, h0 = pTop - 30, hs = 100 * st, h2 = h0 + 2 * hs;
    out.push(['orange', O, 0, O + 520, 0, O + 520, h2, O + 340, h2, O + 340, h0 + hs, O + 180, h0 + hs, O + 180, h0, O, h0],
      blob('orange', O + 182, h0 + hs - 8, 30, 20, 31, 10), blob('orange', O + 342, h2 - 8, 30, 20, 32, 10),
      blob('orange', O + 70, h0 + 4, 40, 18, 33, 10));
    const bx0 = O + 380, bx1 = O + 492, bh = 78;
    out.push(['metal', bx0, h2, bx1, h2, bx1 + 6, h2 + bh, bx1 - 6, h2 + bh, bx1 - 12, h2 + 12, bx0 + 12, h2 + 12, bx0 + 6, h2 + bh, bx0 - 6, h2 + bh]);
    deco.bucket = [(bx0 + bx1) / 2, h2 + bh];
    if (P.holds >= 2) nub(O + 260, h0 + hs + 40, 1);
    mark(O + 40, h0 + 16, 'Orange rocks'); R(O + 90, h0 + 40, O + 260, h0 + hs + 16, O + 400, h2 + 30, (bx0 + bx1) / 2, h2 + bh + 16, O + 510, h2 + 16);
    // 4. the chimney: a narrow crack between a pillar and the wall, then furniture on the mesa
    const C = O + 520, g = 92 * gp, rwx = C + 70 + g, Ht = h2 + 560 * ln;
    out.push(['rock', C - 10, 0, rwx + 2, 0, rwx + 2, h2, C - 10, h2], ['rock', C, h2 + 140, C + 70, h2 + 140, C + 70, Ht - 40, C, Ht - 40]);
    const nC = P.holds + 1;
    for (let i = 0; i < nC; i++) out.push(blob('nub', i % 2 ? C + 70 : rwx, h2 + 200 + (i + 0.5) * (Ht - h2 - 260) / nC, 16, 12, 5 + i, 8));
    mark(C + 20, h2 + 16, 'The chimney'); R(C + 70 + g / 2, h2 + 16, C + 70 + g / 2, Ht + 24);
    const F1 = rwx + 560, Hs = Ht + 250 * st;
    out.push(['rock', rwx, 0, F1, 0, F1, Ht, rwx, Ht],
      // a stool, a table with a lamp, a tall bookcase against the next rock wall
      slab('wood', rwx + 120, Ht + 60 * st, rwx + 196, Ht + 74 * st, 4), slab('wood', rwx + 128, Ht - 4, rwx + 138, Ht + 62 * st, 2), slab('wood', rwx + 178, Ht - 4, rwx + 188, Ht + 62 * st, 2),
      slab('wood', rwx + 250, Ht + 140 * st, rwx + 410, Ht + 158 * st, 5), slab('wood', rwx + 258, Ht - 4, rwx + 270, Ht + 142 * st, 2), slab('wood', rwx + 390, Ht - 4, rwx + 402, Ht + 142 * st, 2),
      slab('wood', F1 - 100, Ht - 4, F1 + 4, Hs, 6));
    deco.lamp = [rwx + 330, Ht + 158 * st + 30];
    out.push(slab('metal', rwx + 326, Ht + 156 * st, rwx + 334, Ht + 186 * st, 2));
    if (P.holds >= 3) nub(F1 - 120, Ht + 210 * st, 2);
    mark(rwx + 40, Ht + 16, 'Furniture'); R(rwx + 60, Ht + 16, rwx + 158, Ht + 74 * st + 16, rwx + 290, Ht + 158 * st + 16, F1 - 50, Hs + 16);
    // 5. the slide: a long slick slope down into a valley (slip and it carries you a long way back)
    const Ls = 560 * ln, Ds = Ls * 0.45 * sl, s0 = F1 + 110, sx1 = s0 + Ls, Hl = Hs - Ds, Hv = Hl - 60;
    out.push(['rock', F1, 0, sx1, 0, sx1, Hl - 20, s0, Hs - 10, s0 - 10, Hs, F1, Hs],
      ['slide', s0 - 14, Hs + 4, sx1 + 10, Hl + 4, sx1 + 10, Hl - 24, s0 - 14, Hs - 24]);
    deco.slide = [s0, Hs + 2, sx1, Hl + 2];
    mark(F1 + 40, Hs + 16, 'The slide'); R(s0 + Ls / 2, Hs - Ds / 2 + 20, sx1 + 40, Hv + 16);
    // 6. the mountain: a valley floor, then a long staircase of rock with snow on the upper steps
    const m0 = sx1 + 160 * gp, nM = Math.round(7 * ln), tr = 118, rise = 100 * st;
    const stair = ['rock', m0, Hv - 4];
    let yS = Hv;
    for (let j = 0; j < nM; j++) {
      yS += rise * (j % 2 ? 1.06 : 0.94);
      const y = yS, x = m0 + j * tr;
      stair.push(x, y, x + tr, y);
      if (j >= nM - 3) deco.snow.push([x, x + tr, y]);
      R(x + tr / 2, y + 16);
      if (P.holds >= 2 && j % 3 === 1) out.push(blob('nub', x + 4, y - rise * 0.5, 13, 9, 80 + j, 8));
    }
    const mE = m0 + nM * tr, yT = stair[stair.length - 1];
    stair.push(mE, Hv - 4);
    out.push(['rock', sx1 - 10, 0, mE + 10, 0, mE + 10, Hv, sx1 - 10, Hv], stair);
    mark(m0 - 60, Hv + 16, 'The mountain');
    // 7. the ice: one long icy slope with a few rough stones
    const Li = 560 * ln, Ri = Li * 0.6 * sl, i1 = mE + 80 + Li, Tp = yT + 8 + Ri;
    out.push(['rock', mE, 0, i1 + 140, 0, i1 + 140, Tp, i1, Tp, mE + 80, yT, mE, yT],
      ['ice', mE, yT, mE + 80, yT + 8, i1, Tp, i1 + 10, Tp - 30, mE + 80, yT - 22, mE, yT - 20]);
    const nI = P.holds + 2;
    for (let j = 0; j < nI; j++) { const t = (j + 0.7) / (nI + 0.4); out.push(blob('nub', mE + 80 + t * Li, yT + 12 + t * Ri, 22, 14, 11 + j, 10)); }
    deco.ice = [mE + 80, yT + 8, i1, Tp];
    mark(mE + 40, yT + 24, 'Ice'); R(mE + 80, yT + 24, i1, Tp + 16);
    // 8. the sky: a sea of clouds at the top of the ice (it catches falls), rocks floating above it, rock to rock upward,
    //    and the last, widest rock is the summit. Stand on it and the final push launches you into space.
    const k0 = i1 + 100, fx0 = i1 + 250;
    out.push(['rock', i1, 0, k0 + 40, 0, k0 + 40, Tp, i1, Tp]);
    mark(i1 + 60, Tp + 16, 'The sky'); R(i1 + 60, Tp + 16);
    deco.floats = [];
    let cx = fx0, top = Tp;
    for (let j = 0; j < SKY.n; j++) {
      cx = fx0 + j * SKY.dx; top = Tp + (j + 1) * SKY.rise;
      out.push(floater(cx, top, SKY.w, SKY.th)); deco.floats.push([cx, top, SKY.w]); R(cx, top + 16);
    }
    const sumC = cx + SKY.dx + (SKY.sumW - SKY.w) / 2, sumY = top + SKY.rise;
    out.push(floater(sumC, sumY, SKY.sumW, SKY.th * 1.5)); deco.floats.push([sumC, sumY, SKY.sumW]);
    const sumX0 = sumC - SKY.sumW / 2 + 12, sumX1 = sumC + SKY.sumW / 2 - 12, XMAX = sumC + 900;
    deco.clouds = [k0, XMAX, Tp];
    out.push(['cloud', k0, Tp - 420, XMAX, Tp - 420, XMAX, Tp, k0, Tp], ['rock', k0, 0, XMAX, 0, XMAX, Tp - 420, k0, Tp - 420]);
    deco.flag = [sumC, sumY];
    mark(sumC, sumY + 16, 'Space'); R(sumC, sumY + 16);
    // the ground under it all, and the world's edges (the right one is invisible: past it there is only sky)
    out.push(['rock', XMIN, -300, XMAX, -300, XMAX, 0, XMIN, 0],
      ['wall', XMIN - 400, -300, XMIN, -300, XMIN, 9000, XMIN - 400, 9000],
      ['edge', XMAX, -300, XMAX + 400, -300, XMAX + 400, 99999, XMAX, 99999]);
    deco.backN = route.findIndex(q => q[1] >= Tp + 10);
    return { P, shapes: out, route, marks, deco, XMAX, YTOP: sumY + 2500, skyY: Tp, summit: { y: sumY + 5, x0: sumX0, x1: sumX1 } };
  }

  function makeWorld() {
    const C0 = build(), P = C0.P;
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
    Object.assign(world, { deco: C0.deco, XMAX: C0.XMAX, YTOP: C0.YTOP, skyY: C0.skyY, summit: C0.summit, route: C0.route });
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
      rock: d ? ['#5d534a', '#3e3731'] : ['#ddcdb3', '#bba98e'], float: d ? ['#5b5560', '#3d3842'] : ['#cfc4bd', '#a8998f'],
      cloud: d ? ['#4a4f5e', '#5d6476'] : ['#ffffff', '#e4e9f2'], wall: d ? ['#2e2924', '#2e2924'] : ['#cdbb9f', '#cdbb9f'],
      orange: d ? ['#a3582f', '#c8774a'] : ['#ec9a5e', '#cc7440'], wood: d ? ['#7a5940', '#56402f'] : ['#b5845a', '#8f6441'],
      metal: d ? ['#66737e', '#8b98a3'] : ['#a9b8c4', '#7f909d'], slide: d ? ['#a8873a', '#c9a64e'] : ['#efc65a', '#cc9f32'],
      ice: d ? ['#58788a', '#86a9ba'] : ['#d6edf5', '#a6cddb'], nub: d ? ['#7c6c5c', '#5c4f42'] : ['#bba483', '#9b835f']
    };
  }
  const ORDER = ['wall', 'rock', 'cloud', 'float', 'orange', 'slide', 'wood', 'metal', 'ice', 'nub'];
  const LEAVES = [[-330, 650, 70], [-400, 590, 52], [-250, 600, 50], [-470, 500, 40], [-215, 390, 38], [-210, 570, 36]];
  const GRASS = [[-620, 90], [-520, 90], [-420, 90], [-170, 0], [-20, 0], [200, 0]];

  Ludus.register({
    id: 'climb', name: 'Hammer Climb', tag: 'Arcade', tint: '#3d4f93', resetOnQuit: true,
    hint: 'The mouse moves the hammer head. Plant it, keep moving to lever yourself · <kbd>←</kbd><kbd>→</kbd> swing <kbd>↑</kbd><kbd>↓</kbd> reach · <kbd>-</kbd><kbd>+</kbd> sensitivity',
    _rules: { build, makeWorld, step, newState, clampArm, probe, SKY, START, HL, HMIN, PR, HR, STEP, VIEW },
    art(ctx, w, h) {
      // dusk sky over a rocky slope: a climber in an iron cauldron swings a big hammer, and floating rocks rise
      // away into the stars (the way the climb ends). Fixed colours: the cover reads the same in light and dark.
      const X = v => w * v, Y = v => h * v, u = Math.min(w / 221, h / 78);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#18204a'); sky.addColorStop(0.55, '#3d4f93'); sky.addColorStop(1, '#e49a72');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      // small stars, thicker towards the top
      ctx.fillStyle = '#fff6e8';
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 97.13) % 1) * w, sy = ((i * 0.6180339 * 7) % 1) * h * 0.62;
        ctx.globalAlpha = 0.35 + 0.65 * (1 - sy / (h * 0.62)) * ((i * 37) % 10) / 10;
        ctx.beginPath(); ctx.arc(sx, sy, (0.5 + (i % 3) * 0.35) * u, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // a far range, soft against the glow
      ctx.fillStyle = 'rgba(40,36,70,0.35)';
      ctx.beginPath(); ctx.moveTo(0, h); [[0, 0.78], [0.18, 0.62], [0.3, 0.72], [0.46, 0.56], [0.6, 0.7], [0.76, 0.6], [0.9, 0.72], [1, 0.66]].forEach(([x, y]) => ctx.lineTo(X(x), Y(y))); ctx.lineTo(w, h); ctx.fill();
      // floating rocks rising up and to the right
      const rock = (cx, top, rw) => {
        const a = rw / 2, th = rw * 0.5;
        ctx.fillStyle = '#8b7868';
        ctx.beginPath(); ctx.moveTo(cx - a, top); ctx.lineTo(cx + a, top); ctx.lineTo(cx + a * 0.6, top + th * 0.6); ctx.lineTo(cx + a * 0.1, top + th); ctx.lineTo(cx - a * 0.4, top + th * 0.75); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cbb8a4';
        ctx.beginPath(); ctx.moveTo(cx - a, top); ctx.lineTo(cx + a, top); ctx.lineTo(cx + a * 0.78, top + th * 0.32); ctx.lineTo(cx - a * 0.8, top + th * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#86b874'; D.roundRect(ctx, cx - a, top - 1.6 * u, rw, 3.2 * u, 1.6 * u); ctx.fill();
      };
      rock(X(0.53), Y(0.6), 30 * u); rock(X(0.7), Y(0.4), 26 * u); rock(X(0.85), Y(0.2), 22 * u);
      // the rocky slope in front, with a boulder at the top
      ctx.fillStyle = '#6a5446';
      ctx.beginPath(); ctx.moveTo(-2, Y(0.58)); ctx.lineTo(X(0.12), Y(0.62)); ctx.lineTo(X(0.26), Y(0.74)); ctx.lineTo(X(0.36), Y(0.8)); ctx.lineTo(X(0.46), Y(0.98)); ctx.lineTo(X(0.48), h + 2); ctx.lineTo(-2, h + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9a7c66'; ctx.lineWidth = 1.6 * u; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-2, Y(0.58)); ctx.lineTo(X(0.12), Y(0.62)); ctx.lineTo(X(0.26), Y(0.74)); ctx.lineTo(X(0.36), Y(0.8)); ctx.lineTo(X(0.46), Y(0.98)); ctx.stroke();
      ctx.fillStyle = '#7d6455'; ctx.beginPath(); ctx.ellipse(X(0.06), Y(0.6), 10 * u, 6 * u, -0.2, Math.PI, 0); ctx.fill();
      // the climber in the cauldron, sitting on the slope
      const cx = X(0.22), cy = Y(0.66), r = 9 * u;
      // body: an orange top, a head and dark hair, looking up the climb
      ctx.fillStyle = '#e8794a'; D.roundRect(ctx, cx - 4.2 * u, cy - r - 9 * u, 8.4 * u, 10 * u, 3 * u); ctx.fill();
      ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(cx + 0.6 * u, cy - r - 12.5 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a211c'; ctx.beginPath(); ctx.arc(cx + 0.2 * u, cy - r - 13.6 * u, 3.7 * u, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      // the hammer: long handle from the hands to a head hooked on the first floating rock
      const hx = cx + 3 * u, hy = cy - r - 5 * u, tx = X(0.53) - 13 * u, ty = Y(0.6) - 3 * u;
      ctx.strokeStyle = '#c99a62'; ctx.lineWidth = 2 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = '#e8794a'; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.moveTo(cx + 1 * u, cy - r - 6 * u); ctx.lineTo(hx + 2 * u, hy - 0.6 * u); ctx.stroke();
      const ang = Math.atan2(ty - hy, tx - hx);
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = '#d7dde4'; D.roundRect(ctx, -5.2 * u, -2.6 * u, 10.4 * u, 5.2 * u, 1.4 * u); ctx.fill();
      ctx.fillStyle = '#8e99a5'; ctx.fillRect(-5.2 * u, 0.9 * u, 10.4 * u, 1.7 * u);
      ctx.restore();
      // the cauldron: round iron pot with a bright rim
      ctx.fillStyle = '#23232b'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.55, r, 0.05, Math.PI - 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - r, cy - r * 0.55); ctx.lineTo(cx + r, cy - r * 0.55); ctx.lineTo(cx + r * 0.9, cy - r * 0.2); ctx.lineTo(cx - r * 0.9, cy - r * 0.2); ctx.fill();
      ctx.fillStyle = '#80869a'; D.roundRect(ctx, cx - r * 1.12, cy - r * 0.78, r * 2.24, r * 0.34, r * 0.17); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.45, cy + r * 0.05, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      canvas.style.cursor = 'crosshair'; canvas.style.touchAction = 'none';   // a touch screen or pen drives the hammer too, never scrolls
      let world, s, maxH, maxP, time, state = 'play', cam = { x: 0, y: 0 }, winLift = 0, liftV = 0, acc = 0, aim, mouse = null, keysDown = {}, clock = 0, winAt = 0;
      let fallFrom = 0, fallNote = null, lastTap = 0, wasHc = false, falls = 0, reached = 1, sectionNote = null, back = null;
      let sensI = SENS.indexOf(+Ludus.state.climbSens); if (sensI < 0) sensI = 2;
      // the old difficulty levels are gone: forget the saved pick
      if (Ludus.state.climbDiff !== undefined) { delete Ludus.state.climbDiff; try { Ludus.save(); } catch (e) {} }

      const fin = v => typeof v === 'number' && isFinite(v);
      const pt = q => q && fin(q.x) && fin(q.y);
      function setWorld() {
        world = makeWorld();
        // the mountain mass behind the route, so hanging parts read as one mountain (decor only; it stops where the sky starts)
        const rb = world.route.slice(0, world.deco.backN > 0 ? world.deco.backN : world.route.length);
        back = rb.map(([x, y]) => [x, y - 40]).concat([[rb[rb.length - 1][0], 0], [rb[0][0], 0]]);
      }
      function restore(o) {
        // v2 4 = the one mountain with the sky ending; a v2 3 save from the old middle level ("Normal") is the same mountain
        // up to the ice, so it carries over; saves from the other old levels start fresh
        if (!o || !(o.v2 === 4 || (o.v2 === 3 && o.di === 1)) || !pt(o.p) || !pt(o.v) || !pt(o.o) || !pt(o.h)) return false;
        setWorld();
        if (o.p.x < XMIN || o.p.x > world.XMAX || o.p.y < -100 || o.p.y > world.YTOP || Math.hypot(o.o.x, o.o.y) > HL + 1) return false;
        s = { p: { x: o.p.x, y: o.p.y }, v: { x: o.v.x, y: o.v.y }, o: { x: o.o.x, y: o.o.y }, h: { x: o.h.x, y: o.h.y }, hc: !!o.hc,
          hn: pt(o.hn) ? { x: o.hn.x, y: o.hn.y } : { x: 0, y: 1 }, ground: !!o.ground, air: 0 };
        maxH = fin(o.maxH) ? Math.max(0, o.maxH) : 0; time = fin(o.time) ? o.time : 0; falls = fin(o.falls) ? o.falls : 0;
        maxP = fin(o.maxP) ? Math.max(0, o.maxP) : 0;
        if (o.aim && fin(o.aim.a) && fin(o.aim.l)) aim = { a: o.aim.a, l: o.aim.l };
        state = 'play';
        return true;
      }
      function begin() {
        setWorld(); s = newState(); maxH = 0; maxP = 0; time = 0; falls = 0; aim = null; acc = 0;
        aim = { a: Math.atan2(s.o.y, s.o.x), l: Math.hypot(s.o.x, s.o.y) };
        cam.x = s.p.x; cam.y = s.p.y; fallFrom = s.p.y; reached = 1; state = 'play';
        sectionNote = null; api.score(0);
      }
      if (!restore(api.saved)) begin();
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
      const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      function setSens(i) {
        sensI = Math.max(0, Math.min(SENS.length - 1, i)); Ludus.state.climbSens = SENS[sensI]; Ludus.save();
        sectionNote = { text: `Sensitivity ${SENS[sensI]}×`, t: clock };
      }
      api.on(canvas, 'pointermove', e => {
        const p = local(e);
        mouse = p;
      });
      api.on(canvas, 'pointerdown', e => {
        const p = local(e);
        if (state === 'play' && inBox(sensBox(), p)) { setSens((sensI + 1) % SENS.length); api.sfx('tick'); return; }
        mouse = p;
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
        if (s.p.y > sm.y && s.p.y < sm.y + 60 && (s.ground || s.hc) && s.p.x > sm.x0 && s.p.x < sm.x1) win();
      }
      function win() {
        state = 'won'; winAt = clock; maxP = world.total; reached = world.marks.length;
        const score = Math.floor(world.total / 10) + Math.max(0, Math.round(2400 - time)) * 2;
        api.score(score); api.sfx('win');
        const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
        api.timeout(() => api.over({ score, title: 'Into space', won: true, message: `To the stars in ${mm}:${ss}, ${falls} big fall${falls === 1 ? '' : 's'}` }), 3400);
      }

      // ---------- render ----------
      function pathPts(list) {
        ctx.beginPath();
        list.forEach((q, i) => { const a = toScreen(q[0], q[1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); });
        ctx.closePath();
      }
      function sky(col, w, h, k) {
        const t = Math.max(0, Math.min(1, cam.y / (world.summit.y + 40))), d = col.dark;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        if (d) { g.addColorStop(0, `hsl(${222 + t * 20} ${28 + t * 10}% ${13 - t * 5}%)`); g.addColorStop(1, `hsl(${28 - t * 20} 16% ${12 - t * 3}%)`); }
        else {
          const sp = Math.max(0, t - 0.8) * 5;   // 0..1 over the last stretch: the sky deepens into space
          g.addColorStop(0, `hsl(${36 + t * 190} ${48 - t * 8 - sp * 10}% ${93 - t * 10 - sp * 68}%)`); g.addColorStop(1, `hsl(${34 + t * 170} ${40 - sp * 12}% ${91 - t * 4 - sp * 58}%)`);
        }
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();
        // stars high up (and always a few at night)
        const sa = d ? 0.25 + Math.max(0, t - 0.6) * 1.8 : Math.max(0, t - 0.8) * 5;   // space at the summit
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
        // the final push: the pot launches straight up off the summit rock and the camera rides with it into space
        if (state === 'won') { const dt = Math.min(0.05, clock - (render.t || clock)); liftV = Math.min(2600, liftV + 1500 * dt); winLift += liftV * dt; }
        render.t = clock;
        cam.x = s.p.x; cam.y = s.p.y + winLift;
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
        drawClimber(col, k);
        if (fallNote && clock - fallNote.t < 1.6 && state === 'play') {
          const p = toScreen(fallNote.x, fallNote.y), a = 1 - (clock - fallNote.t) / 1.6;
          ctx.globalAlpha = a; D.text(ctx, fallNote.text, p.x, p.y - 38 - (1 - a) * 16, 13, col.bad, 750); ctx.globalAlpha = 1;
        }
        hud(col, w, h);
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
        // the sea of clouds: soft puffs along its top
        const [cx0, cx1, cy] = world.deco.clouds;
        ctx.fillStyle = d ? '#4a4f5e' : '#ffffff';
        for (let x = cx0 + 24; x < cx1; x += 38) {
          const p = toScreen(x, cy); if (!on(p, 60)) continue;
          const r = (20 + (Math.round(x) % 3) * 4) * k; ctx.beginPath(); ctx.arc(p.x, p.y + r * 0.62, r, Math.PI, 0); ctx.fill();
        }
        // and a soft fade where the cloud sea meets the rock under it
        const cb = toScreen(cx0, cy - 420);
        if (cb.y > -40 && cb.y < view.h + 200) {
          const gr = ctx.createLinearGradient(0, cb.y - 120 * k, 0, cb.y);
          gr.addColorStop(0, d ? 'rgba(74,79,94,0)' : 'rgba(255,255,255,0)'); gr.addColorStop(1, d ? 'rgba(74,79,94,0.9)' : 'rgba(255,255,255,0.9)');
          const c1 = toScreen(cx1, cy); ctx.fillStyle = gr; ctx.fillRect(cb.x, cb.y - 120 * k, c1.x - cb.x, 140 * k);
        }
        // grassy tops and a few hanging roots on the floating rocks
        world.deco.floats.forEach(([fx, ft, fw]) => {
          const a = toScreen(fx - fw / 2 + 8, ft), b = toScreen(fx + fw / 2 - 8, ft); if (!on(a, 300)) return;
          ctx.fillStyle = d ? '#4f7a52' : '#9cc38f'; D.roundRect(ctx, a.x, a.y - 2 * k, b.x - a.x, 6 * k, 3 * k); ctx.fill();
          ctx.strokeStyle = d ? 'rgba(160,190,150,0.45)' : 'rgba(110,150,95,0.6)'; ctx.lineWidth = 1.4;
          for (let i = 0; i < 3; i++) {
            const r0 = toScreen(fx - fw * 0.25 + i * fw * 0.22, ft - 34 - i * 4);
            ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.quadraticCurveTo(r0.x + 5 * k, r0.y + 12 * k, r0.x - 2 * k, r0.y + (20 + i * 6) * k); ctx.stroke();
          }
        });
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
        D.fitText(ctx, `${Math.max(0, Math.floor((s.p.y + (state === 'won' ? winLift : 0) - PR) / 10))} m`, px + pw * 0.3, 23, pw * 0.42, 14, col.ink, 780);
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
        if (sectionNote && clock - sectionNote.t < 2 && state !== 'won') {
          const a = Math.min(1, (2 - (clock - sectionNote.t)) * 2);
          ctx.globalAlpha = a; D.fitText(ctx, sectionNote.text, w / 2, h * 0.22, w - 40, 17, col.ink, 780); ctx.globalAlpha = 1;
        }
        if (state === 'won') {
          const a = Math.min(1, (clock - winAt) / 0.6);
          ctx.globalAlpha = a; D.fitText(ctx, 'Launched into space', w / 2, h * 0.2, w - 40, 17, col.good, 780);
          D.fitText(ctx, `${falls} big fall${falls === 1 ? '' : 's'} on the way`, w / 2, h * 0.2 + 24, w - 40, 12, 'rgba(240,236,250,0.85)', 650); ctx.globalAlpha = 1;
          for (let i = 0; i < 8; i++) {
            const t = clock - winAt + i * 0.3, r = 10 + (t * 60) % 110, p = toScreen(s.p.x, s.p.y + winLift);
            ctx.globalAlpha = Math.max(0, 1 - r / 120); D.spark(ctx, p.x + Math.cos(i * 0.8) * r, p.y - Math.abs(Math.sin(i * 1.7)) * r * 0.7 - 20, 6, col.accent, t);
          }
          ctx.globalAlpha = 1;
        } else if (time < 8 && maxP < 60) {
          ctx.globalAlpha = Math.min(1, 8 - time);
          D.fitText(ctx, 'Hook the rock with the hammer, then pull to climb', w / 2, h - 18, w - 32, 11, col.ink2, 650, 9);
          ctx.globalAlpha = 1;
        }
      }
      function drawClimber(col, k) {
        const lift = state === 'won' ? winLift : 0, pc = toScreen(s.p.x, s.p.y + lift), hc = toScreen(s.h.x, s.h.y + lift);
        if (lift > 1) {                          // the launch trail: sparks streaming out under the pot
          for (let i = 0; i < 9; i++) {
            const f = ((clock * 3 + i / 9) % 1), y = pc.y + PR * k + f * Math.min(160, lift * 0.4) * k;
            ctx.globalAlpha = (1 - f) * 0.9; D.spark(ctx, pc.x + Math.sin(i * 2.3 + clock * 9) * 6 * k, y, (7 - f * 5) * k, col.accent, clock * 5 + i);
          }
          ctx.globalAlpha = 1;
        }
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
      if (window.ludusDebug) Ludus.games.find(x => x.id === 'climb')._peek = () => ({ s, maxH, maxP, state, aim, cam, time, reached, falls, toScreen, scale, anchor, sens: SENS[sensI], world, win,
        teleport(x, y) { Object.assign(s, newState({ x, y })); fallFrom = y; } });
      return {
        save() {
          if (state !== 'play' || time < 1) return null;
          const c = q => ({ x: q.x, y: q.y });
          return { v2: 4, p: c(s.p), v: c(s.v), o: c(s.o), h: c(s.h), hc: s.hc, hn: c(s.hn), ground: s.ground, maxH, maxP, time, falls, aim: { a: aim.a, l: aim.l } };
        },
        resume() { acc = 0; }
      };
    }
  });
})();
