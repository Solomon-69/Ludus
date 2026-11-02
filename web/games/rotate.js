/* Turn Room: a tiny person in a tiled room. Walk to the door, but the room is the puzzle: turn it a quarter and gravity
   pulls you a new way, so floors become walls and walls become floors. Spikes end a try (the room starts again).
   Every room is checked by a solver (QA/online/rotate-solve.js), so each one can be finished. Nothing is fetched. */
(function () {
  const D = Ludus.draw;
  // . air (the room)   # wall   @ you   E door   spikes: u on the floor (points up), d on the ceiling, l on a right wall, r on a left wall
  // Two hand-made lessons, then rooms made on the spot (seeded, so a saved game rebuilds the same room). Every room is
  // solved by the checker below before you see it, so it can always be finished.
  const LEVELS = [
    { hint: 'Arrow keys walk. Up jumps.', m: ['#############', '#...........#', '#...........#', '#.@......#..E#', '#############'] },
    { hint: 'Q and E turn the room. Only an upright door opens.', m: ['############', '##E#########', '#..........#', '#........@.#', '############'] }
  ];
  function makeRng(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
  function genRoom(seed, n) {
    const rnd = makeRng(seed * 7919 + n * 104729 + 17), R = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const target = Math.min(2 + Math.floor((n - 2) / 2), 6), big = Math.min(2, Math.floor((n - 2) / 5)), t0 = Date.now();
    let best = null;
    for (let tries = 0; tries < 20000; tries++) {
      if (tries > 150 && Date.now() - t0 > 220 && best) break;
      const W = R(9 + big, 12 + big), H = R(6 + (big >> 1), 8 + (big >> 1)), g = [];
      for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push('#'); }
      const rooms = [], cnt = R(3, 4 + (big >> 1));
      for (let i = 0; i < cnt; i++) { const w = R(2, 5), h = R(2, 4), x = R(1, W - 1 - w), y = R(1, H - 1 - h); rooms.push({ x, y, w, h }); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = '.'; }
      for (let i = 1; i < rooms.length; i++) { const a = rooms[i - 1], b = rooms[i]; let x = a.x, y = a.y; while (x !== b.x) { g[y][x] = '.'; x += Math.sign(b.x - x); } while (y !== b.y) { g[y][x] = '.'; y += Math.sign(b.y - y); } }
      const air = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === '.') air.push([x, y]);
      if (air.length < 20) continue;
      const st = air[R(0, air.length - 1)], en = air[R(0, air.length - 1)]; if (st === en) continue;
      g[en[1]][en[0]] = 'E';
      let ns = R(2, 4 + Math.min(5, Math.floor(n / 3)));
      for (let i = 0; i < 60 && ns > 0; i++) {
        const [x, y] = air[R(0, air.length - 1)]; if (g[y][x] !== '.') continue;
        const o = []; if (g[y + 1] && g[y + 1][x] === '#') o.push('u'); if (g[y - 1] && g[y - 1][x] === '#') o.push('d'); if (g[y][x + 1] === '#') o.push('l'); if (g[y][x - 1] === '#') o.push('r');
        if (!o.length) continue; g[y][x] = o[R(0, o.length - 1)]; ns--;
      }
      g[st[1]][st[0]] = '@';
      const rows = g.map(r => r.join('')), so = solve(parse(rows));
      if (!so || so.steps > 70) continue;
      const bare = solve(parse(rows.map(r => r.replace(/[udlr]/g, '.'))));
      if (!bare || bare.turns >= so.turns) continue;
      if (!best || Math.abs(so.turns - target) < Math.abs(best.turns - target)) best = { rows, turns: so.turns };
      if (so.turns >= target && so.turns <= target + 1) break;
    }
    return best ? best.rows : LEVELS[1].m;
  }

  const DIRS = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];   // gravity for k = 0..3: down, right, up, left
  const gOf = k => DIRS[((k % 4) + 4) % 4];
  const rOf = k => { const g = gOf(k); return { x: g.y, y: -g.x }; };   // the way the screen's right-hand side points in room coordinates

  function parse(rows) {
    const H = rows.length, W = Math.max(...rows.map(r => r.length)), cells = [];
    let start = null, exit = null;
    for (let y = 0; y < H; y++) {
      cells.push([]);
      for (let x = 0; x < W; x++) {
        let c = rows[y][x] || ' ';
        if (c === '@') { start = { x, y }; c = '.'; }
        if (c === 'E') exit = { x, y };
        if (c === ' ') c = '#';
        cells[y].push(c);
      }
    }
    return { W, H, cells, start, exit };
  }
  const cellAt = (m, x, y) => (x < 0 || y < 0 || x >= m.W || y >= m.H) ? '#' : m.cells[y][x];
  const solid = c => c === '#';
  const upright = k => ((k % 4) + 4) % 4 === 0;   // the door only opens when the room is the right way up
  const hazard = c => c === 'u' || c === 'd' || c === 'l' || c === 'r';

  // Let go at p with gravity k: the cells you pass through until you stand on something. dead / won say how it ended.
  function settle(m, p, k) {
    const g = gOf(k), path = [];
    let x = p.x, y = p.y, dead = false, won = false;
    for (let i = 0; i < 99; i++) {
      const c = cellAt(m, x, y);
      if (hazard(c)) { dead = true; break; }
      if (c === 'E' && upright(k)) { won = true; break; }
      if (solid(cellAt(m, x + g.x, y + g.y))) break;
      x += g.x; y += g.y; path.push({ x, y });
    }
    return { x, y, path, dead, won };
  }
  // One step to the screen's right (dir 1) or left (dir -1). Walks into air, or bumps a wall (a block in the way needs a jump).
  function walk(m, p, k, dir) {
    const r = rOf(k), tx = p.x + r.x * dir, ty = p.y + r.y * dir;
    if (!solid(cellAt(m, tx, ty))) return { x: tx, y: ty, ok: true };
    return { x: p.x, y: p.y, ok: false };
  }
  // A hop: up one, over one, and land (what a jump with a held arrow does over a one-block step).
  function hop(m, p, k, dir) {
    const g = gOf(k), r = rOf(k), ux = p.x - g.x, uy = p.y - g.y, fx2 = ux + r.x * dir, fy2 = uy + r.y * dir;
    if (solid(cellAt(m, ux, uy)) || hazard(cellAt(m, ux, uy)) || solid(cellAt(m, fx2, fy2))) return null;
    return { x: fx2, y: fy2 };
  }
  // Breadth-first search over (cell, turn) for the fewest turns to the door (0-1 weights: walking is free). Returns { turns, steps } or null.
  function solve(m) {
    const key = (p, k) => (p.y * m.W + p.x) * 4 + ((k % 4) + 4) % 4;
    const start = settle(m, m.start, 0);
    if (start.dead) return null;
    if (start.won) return { turns: 0, steps: 0 };
    const best = new Map(); let frontier = [{ x: start.x, y: start.y, k: 0, t: 0, s: 0 }]; best.set(key(start, 0), 0);
    let found = null;
    const push = (n, next, t, s) => { const kk = key(n, n.k), old = best.get(kk); if (old === undefined || t < old) { best.set(kk, t); next.push(Object.assign({}, n, { t, s })); } };
    for (let t = 0; t < 40 && !found; t++) {
      // everything reachable with t turns by walking (free), then every turn from there
      const seen = new Set(), nodes = [], stack = frontier.filter(n => n.t === t), turnNext = [];
      while (stack.length && !found) {
        const n = stack.pop(), kk = key(n, n.k);
        if (seen.has(kk)) continue; seen.add(kk); nodes.push(n);
        for (const dir of [-1, 1]) {
          const w = walk(m, n, n.k, dir), hp = hop(m, n, n.k, dir);
          for (const to of [w.ok ? w : null, hp]) {
            if (!to) continue;
            const s = settle(m, to, n.k); if (s.dead) continue;
            if (s.won) { found = { turns: t, steps: n.s + 1 }; break; }
            const nn = { x: s.x, y: s.y, k: n.k, t, s: n.s + 1 };
            if (!seen.has(key(nn, nn.k))) stack.push(nn);
          }
          if (found) break;
        }
      }
      if (found) break;
      for (const n of nodes) for (const d of [1, -1]) {
        const k2 = n.k + d, s = settle(m, n, k2); if (s.dead) continue;
        if (s.won) { found = { turns: t + 1, steps: n.s + 1 }; break; }
        const nn = { x: s.x, y: s.y, k: ((k2 % 4) + 4) % 4 };
        const kk2 = key(nn, nn.k); if (!best.has(kk2)) { best.set(kk2, t + 1); turnNext.push(Object.assign(nn, { t: t + 1, s: n.s + 1 })); }
      }
      frontier = frontier.filter(n => n.t > t).concat(turnNext);
      if (!frontier.length) break;
    }
    return found;
  }

  const TURN = 0.62;
  const easeBack = u => { const c = 1.25, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };
  const BLOOD = ['#b8352a', '#d4574a'];
  const TILE_A = ['#efe8da', '#e9e1d1'], TILE_A_DARK = ['#3a342c', '#352f28'];

  Ludus.register({
    id: 'rotate', name: 'Turn Room', aka: 'Room turner', tag: 'Puzzle', tint: '#7f9b8f',
    hint: '<kbd>←</kbd><kbd>→</kbd> walk · <kbd>↑</kbd> jump (steer in the air) · <kbd>Q</kbd> <kbd>E</kbd> turn the room · <kbd>R</kbd> restart the room',
    _levels: LEVELS.map(l => l.m), _gen: genRoom, _parse: parse, _solve: solve, _settle: settle, _walk: walk,
    art(ctx, w, h) {
      const s = Math.min(h * 0.27, w / 9), cols = 7, rows = 4;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.28); ctx.translate(-cols * s / 2, -rows * s / 2);
      const m = ['#######', '#.....#', '#@...E#', '#uuu..#'];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const c = m[y][x];
        if (c === '#') { ctx.fillStyle = 'rgba(40,52,48,0.42)'; D.roundRect(ctx, x * s + 0.5, y * s + 0.5, s - 1, s - 1, s * 0.16); ctx.fill(); continue; }
        ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'; ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        if (c === 'u') {
          ctx.fillStyle = '#fff4ec';
          for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(x * s + i * s / 2 + 1, (y + 1) * s); ctx.lineTo(x * s + i * s / 2 + s / 4, y * s + s * 0.38); ctx.lineTo(x * s + (i + 1) * s / 2 - 1, (y + 1) * s); ctx.fill(); }
        }
        if (c === 'E') { ctx.fillStyle = '#d97757'; D.roundRect(ctx, x * s + s * 0.22, y * s + s * 0.08, s * 0.56, s * 0.9, s * 0.12); ctx.fill(); ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(x * s + s * 0.64, y * s + s * 0.55, s * 0.06, 0, 7); ctx.fill(); }
        if (c === '@') {
          ctx.fillStyle = '#fffaf2'; D.roundRect(ctx, x * s + s * 0.3, y * s + s * 0.38, s * 0.4, s * 0.56, s * 0.18); ctx.fill();
          ctx.beginPath(); ctx.arc(x * s + s * 0.5, y * s + s * 0.28, s * 0.17, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    },
    create(stage, api) {
      try { document.fonts.load("17px 'LudusCreep'"); } catch (e) {}
      const view = api.canvas(() => render());
      const { ctx, canvas } = view;
      const FONT = "'LudusCreep', Chiller, Luminari, Herculanum, Papyrus, fantasy";
      let seed = (Math.random() * 1e9) | 0, lvl = 0, m, p, k = 0, score = 0, turns = 0, deaths = 0, par = 0, clock = 0, done = false;
      let angle = 0, fx = 0, fy = 0, timeline = [], endT = 0, ending = null, face = 1, held = 0, bump = 0, shake = 0, flash = 0, squash = 0;
      let air = null, buttons = [], drawAngle = 0, turn = null, parts = [], drops = [], stains = [], phase = 0, hintText = '';
      const lay = { s: 40, cx: 0, cy: 0 };

      function load(i) {
        lvl = Math.max(0, i);
        const rows = lvl < LEVELS.length ? LEVELS[lvl].m : genRoom(seed, lvl);
        hintText = lvl < LEVELS.length ? LEVELS[lvl].hint : '';
        m = parse(rows); p = { x: m.start.x, y: m.start.y }; k = 0; angle = 0; drawAngle = 0; fx = p.x; fy = p.y;
        const sl = solve(m); par = sl ? sl.turns : 0;
        turns = 0; timeline = []; endT = clock; ending = null; held = 0; flash = 0; turn = null; parts = []; drops = []; stains = []; air = null;
        const s0 = settle(m, p, 0); if (s0.path.length) { play(s0.path.map(c => ({ x: c.x, y: c.y })), 0.06, 'fall'); p = { x: s0.x, y: s0.y }; }
      }
      // timeline: [{ t0, t1, type: 'move'|'rot', ... }] played from the moment it is queued
      function play(cells, per, kind) {
        let t = Math.max(clock, endT), from = { x: fx, y: fy };
        if (timeline.length) { const last = timeline[timeline.length - 1]; if (last.type === 'move') from = last.to; }
        cells.forEach(c => { timeline.push({ t0: t, t1: t + per, type: 'move', from, to: { x: c.x, y: c.y }, kind }); from = { x: c.x, y: c.y }; t += per; });
        endT = t;
      }
      function rot(a0, a1) { const t = Math.max(clock, endT); timeline.push({ t0: t, t1: t + TURN, type: 'rot', a0, a1 }); endT = t + TURN; }
      function idle() { return clock >= endT && !ending && !done && !air; }

      function finish(res) {
        if (res.dead) { ending = { type: 'dead', t: Math.max(clock, endT) }; shake = 1; flash = 1; api.sfx('hit'); }
        else if (res.won) {
          const bonus = Math.max(0, 50 - 10 * Math.max(0, turns - par));
          score += 100 + bonus; api.score(score); api.sfx('line');
          ending = { type: 'won', t: Math.max(clock, endT) };
        }
      }
      function doWalk(dir) {
        if (!idle()) return;
        face = dir;
        const w = walk(m, p, k, dir);
        if (!w.ok) { bump = 1; api.sfx('tick'); return; }
        api.sfx('move');
        play([{ x: w.x, y: w.y }], 0.11, 'walk');
        const s = settle(m, w, k);
        if (s.path.length) play(s.path, 0.055, 'fall');
        p = { x: s.x, y: s.y };
        finish(s);
      }
      // ---- jump: real flight. You leave the floor going up, gravity pulls you back, and left and right steer you in the air.
      const HW = 0.26, V0 = 9.6, GRAV = 34, STEER = 4.4;
      const solidAt = (x, y) => solid(cellAt(m, Math.floor(x), Math.floor(y)));
      function bodyHits(x, y, g, r) {
        const cx = x + 0.5, cy = y + 0.5;
        for (const a of [-HW, 0, HW]) for (const b of [-0.34, 0.44]) if (solidAt(cx + r.x * a + g.x * b, cy + r.y * a + g.y * b)) return true;
        return false;
      }
      let queued = null;   // a jump or turn pressed in the middle of a step waits a moment for the step to end
      function doJump(fromQueue) {
        if (!idle()) { if (!fromQueue && !air && !ending && !done) queued = { fn: doJump, until: clock + 0.25 }; return; }
        const g = gOf(k), r = rOf(k);
        if (bodyHits(fx - g.x * 0.3, fy - g.y * 0.3, g, r)) { bump = 1; api.sfx('tick'); return; }
        api.sfx('move'); squash = -1;
        air = { vg: -V0, vr: held ? held * STEER : 0 };
        if (held) face = held;
      }
      function landAt() {
        const cx = Math.round(fx), cy = Math.round(fy);
        air = null; p = { x: cx, y: cy }; squash = 1;
        const t = Math.max(clock, endT);
        timeline.push({ t0: t, t1: t + 0.06, type: 'move', from: { x: fx, y: fy }, to: { x: cx, y: cy }, kind: 'land' }); endT = t + 0.06;
        const s = settle(m, p, k);
        if (s.path.length) play(s.path, 0.055, 'fall');
        p = { x: s.x, y: s.y }; finish(s);
      }
      function stepAir(dt) {
        const g = gOf(k), r = rOf(k);
        const want = held ? held * STEER : 0; air.vr += Math.max(-46 * dt, Math.min(46 * dt, want - air.vr));
        if (held) face = held;
        air.vg += GRAV * dt;
        let nx = fx + r.x * air.vr * dt, ny = fy + r.y * air.vr * dt;
        if (bodyHits(nx, ny, g, r)) air.vr = 0; else { fx = nx; fy = ny; }
        nx = fx + g.x * air.vg * dt; ny = fy + g.y * air.vg * dt;
        if (bodyHits(nx, ny, g, r)) { const down = air.vg > 0; air.vg = down ? 0 : 0.5; if (down) { landAt(); return; } } else { fx = nx; fy = ny; }
        const c = cellAt(m, Math.round(fx), Math.round(fy));
        if (hazard(c) || (c === 'E' && upright(k))) { air = null; p = { x: Math.round(fx), y: Math.round(fy) }; fx = p.x; fy = p.y; finish({ dead: hazard(c), won: c === 'E' }); }
      }
      function doTurn(d, fromQueue) {
        if (!idle()) { if (!fromQueue && !air && !ending && !done) queued = { fn: () => doTurn(d, true), until: clock + 0.25 }; return; }
        const a0 = angle, a1 = angle + d * Math.PI / 2;
        k = k + d; turns++;
        rot(a0, a1); api.sfx('flip');
        const s = settle(m, p, k);
        if (s.path.length) play(s.path, 0.055, 'fall');
        p = { x: s.x, y: s.y };
        angle = a1;
        finish(s);
      }
      function restart(silent) { if (!silent) deaths++; const keepDeaths = deaths; load(lvl); deaths = keepDeaths; }

      function snapshot() { if (done || (!api.touched && lvl === 0 && !score)) return null; return { v: 2, lvl, score, deaths, seed }; }
      function restore(s) {
        if (!s || s.v !== 2 || !(s.lvl >= 0)) return false;
        score = s.score | 0; deaths = s.deaths | 0; seed = s.seed | 0 || seed; load(s.lvl); return true;
      }

      api.keys(e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key;
        if (key === 'ArrowLeft') { held = -1; doWalk(-1); }
        else if (key === 'ArrowRight') { held = 1; doWalk(1); }
        else if (key === 'ArrowUp' || key === ' ') { if (!e.repeat) doJump(); }
        else if (key === 'e' || key === 'E' || key === 'd' || key === 'D') { if (!e.repeat) doTurn(1); }
        else if (key === 'q' || key === 'Q' || key === 'a' || key === 'A') { if (!e.repeat) doTurn(-1); }
        else if (key === 'r' || key === 'R') { if (!ending && !done && !air) restart(false); }
      });
      api.keysUp(e => {
        const key = e.key;
        if ((key === 'ArrowLeft' && held === -1) || (key === 'ArrowRight' && held === 1)) held = 0;
      });
      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const b = buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (!b) return;
        b.act(); if (b.hold) held = b.hold;
      });
      const release = () => { held = 0; };
      api.on(canvas, 'pointerup', release); api.on(canvas, 'pointercancel', release); api.on(canvas, 'pointerleave', release);

      const rnd = (a, b) => a + Math.random() * (b - a);
      function moving() {
        if (air) return 'jump';
        for (const t of timeline) if (t.type === 'move' && clock >= t.t0 && clock < t.t1) return t.kind;
        return null;
      }
      function burst() {
        const x = fx + 0.5, y = fy + 0.5;
        for (let i = 0; i < 6; i++) stains.push({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), r: rnd(0.04, 0.1), c: i & 1 });
        if (api.reduceMotion) return;
        const g = gOf(k);
        for (let i = 0; i < 26; i++) { const a = rnd(0, 6.283), v = rnd(1.5, 7); drops.push({ x, y, vx: Math.cos(a) * v - g.x * 2, vy: Math.sin(a) * v - g.y * 2, r: rnd(0.035, 0.08), c: i & 1 }); }
        ['head', 'torso', 'leg', 'leg', 'arm', 'arm'].forEach(t => { const a = rnd(0, 6.283), v = rnd(2, 5); parts.push({ t, x, y, vx: Math.cos(a) * v - g.x * 2.5, vy: Math.sin(a) * v - g.y * 2.5, rot: rnd(0, 6.283), vr: rnd(-9, 9), rest: false }); });
      }
      function stepBlood(dt) {
        if (!drops.length && !parts.length) return;
        const g = gOf(k), G = 24;
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.vx += g.x * G * dt; d.vy += g.y * G * dt;
          const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
          if (solidAt(nx, ny)) { stains.push({ x: d.x, y: d.y, r: d.r * 1.5, c: d.c }); drops.splice(i, 1); continue; }
          d.x = nx; d.y = ny;
        }
        for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; if (q.rest) { q.restT = (q.restT || 0) + dt; if (q.restT > 0.5) parts.splice(i, 1); } }
        parts.forEach(q => {
          if (q.rest) return;
          q.vx += g.x * G * dt; q.vy += g.y * G * dt;
          const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt, hx = solidAt(nx, q.y), hy = solidAt(q.x, ny);
          if (hx) { q.vx *= -0.35; q.vy *= 0.8; q.vr *= 0.7; } else q.x = nx;
          if (hy) { q.vy *= -0.35; q.vx *= 0.8; q.vr *= 0.6; } else q.y = ny;
          q.rot += q.vr * dt;
          if (hx && hy || (Math.hypot(q.vx, q.vy) < 0.7 && (solidAt(q.x + g.x * 0.3, q.y + g.y * 0.3)))) { q.vx = q.vy = q.vr = 0; q.rest = true; }
        });
      }

      function update(dt) {
        clock += dt; if (queued && queued.until < clock) queued = null; stepBlood(dt); if (air) stepAir(dt); if (moving() === 'walk') phase += dt * 20;
        bump = Math.max(0, bump - dt * 4); shake = Math.max(0, shake - dt * 2.5); flash = Math.max(0, flash - dt * 2.2); squash *= Math.pow(0.0005, dt);
        for (let i = 0; i < timeline.length; i++) {
          const s = timeline[i];
          if (clock >= s.t1) { if (s.type === 'move') { fx = s.to.x; fy = s.to.y; } else { drawAngle = s.a1; turn = null; } continue; }
          if (clock >= s.t0) {
            const u = (clock - s.t0) / (s.t1 - s.t0);
            if (s.type === 'move') { const e = s.kind === 'fall' ? u * u * 0.5 + u * 0.5 : u; fx = D.lerp(s.from.x, s.to.x, e); fy = D.lerp(s.from.y, s.to.y, e); }
            else { drawAngle = D.lerp(s.a0, s.a1, api.reduceMotion ? 1 : easeBack(u)); turn = { u, dir: s.a1 > s.a0 ? 1 : -1 }; }
          }
          break;
        }
        if (clock >= endT && !air) {
          if (timeline.length) { drawAngle = angle; timeline = []; fx = p.x; fy = p.y; turn = null; }
          if (ending) {
            if (ending.type === 'dead' && !ending.burst) { ending.burst = true; burst(); }
            if (clock - ending.t > (ending.type === 'dead' ? 1.5 : 0.55)) {
              if (ending.type === 'dead') {
                if (!done) { done = true; const cleared = Math.max(0, lvl); api.timeout(() => api.over({ score, title: 'Splat', message: cleared === 1 ? 'You cleared 1 room' : 'You cleared ' + cleared + ' rooms' }), 50); }
                ending = { type: 'dead', t: clock, burst: true };
              } else { ending = null; load(lvl + 1); }
            }
          } else if (queued && idle()) { const q = queued; queued = null; if (q.until >= clock) q.fn(true); }
          else if (held) doWalk(held);
        }
      }

      // ---------- drawing ----------
      function roundBtn(x, y, w, h, act, col, text, hold, key) {
        buttons.push({ x, y, w, h, act, hold });
        ctx.save();
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)';
        D.roundRect(ctx, x, y, w, h, 14); ctx.fill();
        ctx.fillStyle = col.ink; ctx.font = '18px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2 + 1);
        if (key) { ctx.fillStyle = col.ink2; ctx.font = '11px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(key, x + 7, y + 4); }
        ctx.restore();
      }
      function spikes(x, y, s, c, col) {
        const n = 3, base = s * 0.5;
        ctx.fillStyle = col.dark ? '#e0745c' : '#c9503a';
        for (let i = 0; i < n; i++) {
          const a = (i + 0.5) / n, w2 = s / n / 2 - 0.5;
          ctx.beginPath();
          if (c === 'u') { ctx.moveTo(x + a * s - w2, y + s); ctx.lineTo(x + a * s, y + s - base); ctx.lineTo(x + a * s + w2, y + s); }
          else if (c === 'd') { ctx.moveTo(x + a * s - w2, y); ctx.lineTo(x + a * s, y + base); ctx.lineTo(x + a * s + w2, y); }
          else if (c === 'l') { ctx.moveTo(x + s, y + a * s - w2); ctx.lineTo(x + s - base, y + a * s); ctx.lineTo(x + s, y + a * s + w2); }
          else { ctx.moveTo(x, y + a * s - w2); ctx.lineTo(x + base, y + a * s); ctx.lineTo(x, y + a * s + w2); }
          ctx.closePath(); ctx.fill();
        }
      }
      function person(x, y, s, col, tilt) {
        const ink = col.ink, w = s * 0.36, mv = moving(), flying = mv === 'jump', falling = mv === 'fall';
        const lean = (mv === 'walk' ? face * 0.1 : 0) + (flying ? face * 0.12 : 0) + (tilt || 0);
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(0, s * 0.47, s * 0.24, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(0, s * 0.46); ctx.scale(1 + 0.14 * squash, 1 - 0.18 * squash); ctx.translate(0, -s * 0.46);
        ctx.translate(0, s * 0.3); ctx.rotate(lean); ctx.translate(0, -s * 0.3);
        ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round';
        const sw = mv === 'walk' ? Math.sin(phase) : 0, rising = air && air.vg < 0;
        ctx.lineWidth = s * 0.075;
        for (const i of [-1, 1]) {
          let hx, hy;
          if (flying) { hx = i * w * 0.38 + i * s * 0.12; hy = rising ? s * 0.02 : s * 0.13; }
          else if (falling) { hx = i * w * 0.38 + i * s * 0.1 + Math.sin(clock * 22 + i) * s * 0.03; hy = s * 0.04; }
          else { hx = i * w * 0.38 + i * sw * s * 0.13; hy = s * 0.2; }
          ctx.beginPath(); ctx.moveTo(i * w * 0.38, s * 0.04); ctx.lineTo(hx, hy); ctx.stroke();
        }
        ctx.lineWidth = s * 0.095;
        for (const i of [-1, 1]) {
          let fx2, fy2;
          if (flying) { fx2 = i * s * 0.09 + (rising ? i * s * 0.02 : i * s * 0.1); fy2 = rising ? s * 0.4 : s * 0.46; }
          else if (falling) { fx2 = i * s * 0.1 + Math.sin(clock * 22 + i * 2) * s * 0.08; fy2 = s * 0.44; }
          else { const ph = sw * -i; fx2 = i * s * 0.07 + ph * s * 0.15; fy2 = s * 0.46 - (mv === 'walk' ? Math.max(0, Math.cos(phase + (i > 0 ? 0 : Math.PI))) * s * 0.06 : 0); }
          ctx.beginPath(); ctx.moveTo(i * s * 0.07, s * 0.26); ctx.lineTo(fx2, fy2); ctx.stroke();
        }
        D.roundRect(ctx, -w / 2, -s * 0.1, w, s * 0.4, w * 0.42); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col.accent; ctx.beginPath(); ctx.arc(face * s * 0.07, -s * 0.21, s * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      function bloodDraw(s, col) {
        ctx.save();
        for (const d of stains) { ctx.globalAlpha = 0.85; ctx.fillStyle = BLOOD[col.dark ? 1 : 0]; ctx.beginPath(); ctx.arc(d.x * s, d.y * s, Math.max(1, d.r * s), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        for (const q of parts) {
          ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (q.restT || 0) / 0.5); ctx.translate(q.x * s, q.y * s); ctx.rotate(q.rot); ctx.fillStyle = col.ink; ctx.strokeStyle = col.ink; ctx.lineCap = 'round';
          if (q.t === 'head') { ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col.accent; ctx.beginPath(); ctx.arc(s * 0.06, -s * 0.01, s * 0.04, 0, Math.PI * 2); ctx.fill(); }
          else if (q.t === 'torso') D.roundRect(ctx, -s * 0.18, -s * 0.2, s * 0.36, s * 0.4, s * 0.15), ctx.fill();
          else { ctx.lineWidth = s * (q.t === 'leg' ? 0.095 : 0.075); ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, s * 0.1); ctx.stroke(); }
          ctx.fillStyle = BLOOD[col.dark ? 1 : 0]; ctx.beginPath(); ctx.arc(0, q.t === 'head' ? s * 0.12 : s * 0.1, s * 0.05, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        for (const d of drops) { ctx.fillStyle = BLOOD[col.dark ? 1 : 0]; ctx.beginPath(); ctx.arc(d.x * s, d.y * s, Math.max(1, d.r * s), 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      function render() {
        const w = view.w, h = view.h; if (!m) return;
        const col = Ludus.colors();
        buttons = [];
        ctx.clearRect(0, 0, w, h);
        // the bottom bar: walk on the left, turn and jump on the right (works wide or tall)
        const bh = 48, by = h - bh - 10, gap = 8, pad = 12, wide = w > h * 1.15;
        const bw = Math.min(wide ? 100 : 80, (w - pad * 2 - gap * 4 - 14) / 5), cg = w - pad * 2 - bw * 5 - gap * 3;
        roundBtn(pad, by, bw, bh, () => doWalk(-1), col, 'left', -1);
        roundBtn(pad + bw + gap, by, bw, bh, () => doWalk(1), col, 'right', 1);
        const rx = w - pad - (bw * 3 + gap * 2);
        roundBtn(rx, by, bw, bh, () => doTurn(-1), col, 'turn', 0, 'Q');
        roundBtn(rx + bw + gap, by, bw, bh, () => doJump(), col, 'jump', 0);
        roundBtn(rx + (bw + gap) * 2, by, bw, bh, () => doTurn(1), col, 'turn', 0, 'E');
        // the room, turned. It is fitted to the space that is left, and to its turned shape, so no room is wasted.
        const hintH = hintText ? 26 : 0, topPad = 10, avW = w - 16, avH = by - 8 - topPad - hintH;
        const ca = Math.abs(Math.cos(drawAngle)), sa = Math.abs(Math.sin(drawAngle)), boxW = m.W * ca + m.H * sa, boxH = m.W * sa + m.H * ca;
        const s = Math.max(10, Math.min(64, Math.min(avW / boxW, avH / boxH)));
        lay.s = s; lay.cx = w / 2; lay.cy = topPad + avH / 2;
        const sx = shake && !api.reduceMotion ? Math.sin(clock * 60) * shake * 3 : 0;
        ctx.save();
        ctx.translate(lay.cx + sx, lay.cy); ctx.rotate(drawAngle); ctx.translate(-m.W * s / 2, -m.H * s / 2);
        const tiles = col.dark ? TILE_A_DARK : TILE_A;
        for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
          if (m.cells[y][x] === '#') continue;
          ctx.fillStyle = tiles[(x + y) & 1]; ctx.fillRect(x * s, y * s, s + 0.6, s + 0.6);
        }
        for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
          if (m.cells[y][x] !== '#') continue;
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { if (cellAt(m, x + dx, y + dy) !== '#') { near = true; break; } }
          if (!near) continue;
          ctx.fillStyle = col.dark ? '#5b5246' : '#c9bba4';
          D.roundRect(ctx, x * s + 0.5, y * s + 0.5, s - 1, s - 1, s * 0.2); ctx.fill();
          ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)';
          D.roundRect(ctx, x * s + s * 0.16, y * s + s * 0.12, s * 0.68, s * 0.18, s * 0.09); ctx.fill();
        }
        const open = upright(k);
        for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
          const c = m.cells[y][x];
          if (hazard(c)) spikes(x * s, y * s, s, c, col);
          else if (c === 'E') {
            const x0 = x * s, y0 = y * s, won = ending && ending.type === 'won';
            ctx.save(); ctx.globalAlpha = open ? 1 : 0.5;
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.3)' : 'rgba(80,50,20,0.14)'; D.roundRect(ctx, x0 + s * 0.2, y0 + s * 0.1, s * 0.6, s * 0.9, s * 0.14); ctx.fill();
            ctx.fillStyle = won ? col.good : (open ? col.accent : col.ink2); D.roundRect(ctx, x0 + s * 0.22, y0 + s * 0.06, s * 0.56, s * 0.88, s * 0.14); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.28)'; D.roundRect(ctx, x0 + s * 0.3, y0 + s * 0.14, s * 0.4, s * 0.16, s * 0.08); ctx.fill();
            ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(x0 + s * 0.64, y0 + s * 0.56, s * 0.06, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
        bloodDraw(s, col);
        const dead = ending && ending.type === 'dead';
        const px = (fx + 0.5) * s, py = (fy + 0.5) * s;
        const tilt = turn && !api.reduceMotion ? turn.dir * 0.55 * Math.sin(turn.u * Math.PI) : 0;
        ctx.save(); ctx.translate(px, py); ctx.rotate(-drawAngle);
        const bx = bump > 0 && !api.reduceMotion ? Math.sin(bump * 30) * bump * 2 : 0;
        if (!(dead && ending.burst)) person(bx, 0, s, col, tilt);
        ctx.restore();
        ctx.restore();
        if (turn && !api.reduceMotion) {
          const R = Math.min(w, h) * 0.2, a1 = -Math.PI / 2 + turn.dir * Math.min(1, turn.u * 1.15) * 4.4;
          ctx.save(); ctx.globalAlpha = Math.sin(turn.u * Math.PI) * 0.5; ctx.strokeStyle = col.accent; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(lay.cx, lay.cy, R, -Math.PI / 2, a1, turn.dir < 0); ctx.stroke();
          ctx.restore();
        }
        if (flash > 0) { ctx.fillStyle = 'rgba(201,80,58,' + (flash * 0.18).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
        if (hintText) { ctx.save(); ctx.font = '17px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col.ink2; ctx.fillText(hintText, w / 2, by - 18); ctx.restore(); }
      }

      score = 0;
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) load(0);
      api.score(score);
      if (window.ludusDebug) window.ludusDebug.rotate = () => ({ s: +lay.s.toFixed(1), vw: view.w, vh: view.h, W: m.W, H: m.H, fx: +fx.toFixed(2), fy: +fy.toFixed(2), lvl, score, k, turns, deaths, par, p, busy: clock < endT, ending: ending && ending.type, done, air: !!air });
      if (window.ludusDebug) window.ludusDebug.rotateAct = (a) => { if (a === 'L') doWalk(-1); else if (a === 'R') doWalk(1); else if (a === 'cw') doTurn(1); else if (a === 'ccw') doTurn(-1); else if (a === 'up') doJump(); };
      if (window.ludusDebug) window.ludusDebug.rotateLoad = i => load(i);
      api.loop(dt => { update(dt); render(); });
      return { save: snapshot };
    }
  });
})();
