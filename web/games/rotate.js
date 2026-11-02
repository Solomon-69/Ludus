/* Turn Room: a tiny person in a tiled room. Walk to the door, but the room is the puzzle: turn it a quarter and gravity
   pulls you a new way, so floors become walls and walls become floors. Spikes end a try (the room starts again).
   Every room is checked by a solver (QA/online/rotate-solve.js), so each one can be finished. Nothing is fetched. */
(function () {
  const D = Ludus.draw;
  // . air (the room)   # wall   @ you   E door   spikes: u on the floor (points up), d on the ceiling, l on a right wall, r on a left wall
  const LEVELS = [
    { hint: 'Walk to the door with the arrow keys.', m: ['##########', '#........#', '#@......E#', '##########'] },
    { hint: 'Turn the room. Gravity follows.', m: ['#########', '#E......#', '#######.#', '#@......#', '#########'] },
    { hint: 'Spikes only hurt where they are.', m: ['###########', '#.........#', '#@..uuu..E#', '###########'] },
    { hint: 'Look for the way round.', m: ['#########', '###E...##', '###r...@#', '###r....#', '###.uu.##', '#########'] },
    { hint: 'Floors become walls.', m: ['##########', '#E.....d##', '#r.....l##', '#.@.....##', '###u...###', '##########'] },
    { hint: 'Take it one turn at a time.', m: ['#########', '#d....###', '#r......#', '#u..@...#', '###.....#', '###...uE#', '#########'] },
    { hint: 'Up is a floor too.', m: ['##########', '#.d..#####', '#@...#####', '#.....Ed.#', '#.......l#', '####....l#', '####.....#', '##########'] },
    { hint: 'Plan before you turn.', m: ['###########', '##........#', '##...###rl#', '##E.@###.l#', '##.u.###..#', '###########'] },
    { hint: 'Spikes hide in corners.', m: ['#########', '##.dE####', '#..@....#', '#.......#', '#....uuu#', '#########'] },
    { hint: 'Slow is fine.', m: ['###########', '#####.dl###', '#####..E###', '#####...###', '#####.....#', '######....#', '######@uu.#', '###########'] },
    { hint: 'Nearly there.', m: ['##########', '##....#####', '#@....#####', '#......####', '#.l#r.l####', '#..#r.E####', '###########'] },
    { hint: 'One last room.', m: ['#########', '##.dd####', '##...E..#', '##.@....#', '###....l#', '###....l#', '#########'] }
  ];

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
  const hazard = c => c === 'u' || c === 'd' || c === 'l' || c === 'r';

  // Let go at p with gravity k: the cells you pass through until you stand on something. dead / won say how it ended.
  function settle(m, p, k) {
    const g = gOf(k), path = [];
    let x = p.x, y = p.y, dead = false, won = false;
    for (let i = 0; i < 99; i++) {
      const c = cellAt(m, x, y);
      if (hazard(c)) { dead = true; break; }
      if (c === 'E') { won = true; break; }
      if (solid(cellAt(m, x + g.x, y + g.y))) break;
      x += g.x; y += g.y; path.push({ x, y });
    }
    return { x, y, path, dead, won };
  }
  // One step to the screen's right (dir 1) or left (dir -1). Walks into air, climbs a one-cell step, or bumps a wall.
  function walk(m, p, k, dir) {
    const r = rOf(k), g = gOf(k), tx = p.x + r.x * dir, ty = p.y + r.y * dir;
    if (!solid(cellAt(m, tx, ty))) return { x: tx, y: ty, ok: true };
    const ux = -g.x, uy = -g.y;   // up
    if (!solid(cellAt(m, p.x + ux, p.y + uy)) && !solid(cellAt(m, tx + ux, ty + uy))) return { x: tx + ux, y: ty + uy, ok: true, climb: true };
    return { x: p.x, y: p.y, ok: false };
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
          const w = walk(m, n, n.k, dir); if (!w.ok) continue;
          const s = settle(m, w, n.k); if (s.dead) continue;
          if (s.won) { found = { turns: t, steps: n.s + 1 }; break; }
          const nn = { x: s.x, y: s.y, k: n.k, t, s: n.s + 1 };
          if (!seen.has(key(nn, nn.k))) stack.push(nn);
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

  const TILE_A = ['#efe8da', '#e9e1d1'], TILE_A_DARK = ['#3a342c', '#352f28'];

  Ludus.register({
    id: 'rotate', name: 'Turn Room', aka: 'Room turner', tag: 'Puzzle', tint: '#7f9b8f',
    hint: '<kbd>←</kbd><kbd>→</kbd> walk · <kbd>↑</kbd>/<kbd>X</kbd> turn the room right · <kbd>Z</kbd> turn it left · <kbd>R</kbd> start the room again',
    _levels: LEVELS.map(l => l.m), _parse: parse, _solve: solve, _settle: settle, _walk: walk,
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
      const view = api.canvas(() => render());
      const { ctx, canvas } = view;
      let lvl = 0, m, p, k = 0, score = 0, turns = 0, deaths = 0, par = 0, clock = 0, done = false;
      let angle = 0, fx = 0, fy = 0, timeline = [], endT = 0, ending = null, face = 1, held = 0, bump = 0, shake = 0, flash = 0;
      let buttons = [], drawAngle = 0;
      const lay = { s: 40, cx: 0, cy: 0 };

      function load(i) {
        lvl = Math.max(0, Math.min(LEVELS.length - 1, i));
        m = parse(LEVELS[lvl].m); p = { x: m.start.x, y: m.start.y }; k = 0; angle = 0; drawAngle = 0; fx = p.x; fy = p.y;
        const sl = solve(m); par = sl ? sl.turns : 0;
        turns = 0; timeline = []; endT = clock; ending = null; held = 0; flash = 0;
        const s0 = settle(m, p, 0); if (s0.path.length) { play(s0.path.map(c => ({ x: c.x, y: c.y })), 0.06, 'fall'); p = { x: s0.x, y: s0.y }; }
      }
      // timeline: [{ t0, t1, type: 'move'|'rot', ... }] played from the moment it is queued
      function play(cells, per, kind) {
        let t = Math.max(clock, endT), from = { x: fx, y: fy };
        if (timeline.length) { const last = timeline[timeline.length - 1]; if (last.type === 'move') from = last.to; }
        cells.forEach(c => { timeline.push({ t0: t, t1: t + per, type: 'move', from, to: { x: c.x, y: c.y }, kind }); from = { x: c.x, y: c.y }; t += per; });
        endT = t;
      }
      function rot(a0, a1) { const t = Math.max(clock, endT); timeline.push({ t0: t, t1: t + 0.34, type: 'rot', a0, a1 }); endT = t + 0.34; }
      function idle() { return clock >= endT && !ending && !done; }

      function finish(res) {
        if (res.dead) { ending = { type: 'dead', t: endT }; shake = 1; flash = 1; api.sfx('hit'); }
        else if (res.won) {
          const bonus = Math.max(0, 50 - 10 * Math.max(0, turns - par));
          score += 100 + bonus; api.score(score); api.sfx('line');
          ending = { type: 'won', t: endT };
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
      function doTurn(d) {
        if (!idle()) return;
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

      function snapshot() { if (done || (!api.touched && lvl === 0 && !score)) return null; return { v: 1, lvl, score, deaths }; }
      function restore(s) {
        if (!s || s.v !== 1 || !(s.lvl >= 0 && s.lvl < LEVELS.length)) return false;
        score = s.score | 0; deaths = s.deaths | 0; load(s.lvl); return true;
      }

      api.keys(e => {
        if (e.metaKey || e.ctrlKey) return;
        const key = e.key;
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') { held = -1; doWalk(-1); }
        else if (key === 'ArrowRight' || key === 'd' || key === 'D') { held = 1; doWalk(1); }
        else if (key === 'ArrowUp' || key === 'x' || key === 'X' || key === 'e' || key === 'E' || key === 'w' || key === 'W') { if (!e.repeat) doTurn(1); }
        else if (key === 'z' || key === 'Z' || key === 'q' || key === 'Q' || key === 'ArrowDown' || key === 's' || key === 'S') { if (!e.repeat) doTurn(-1); }
        else if (key === 'r' || key === 'R') { if (!ending && !done) restart(false); }
      });
      api.keysUp(e => {
        const key = e.key;
        if (((key === 'ArrowLeft' || key === 'a' || key === 'A') && held === -1) || ((key === 'ArrowRight' || key === 'd' || key === 'D') && held === 1)) held = 0;
      });
      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const b = buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (!b) return;
        b.act(); if (b.hold) held = b.hold;
      });
      const release = () => { held = 0; };
      api.on(canvas, 'pointerup', release); api.on(canvas, 'pointercancel', release); api.on(canvas, 'pointerleave', release);

      function update(dt) {
        clock += dt; bump = Math.max(0, bump - dt * 4); shake = Math.max(0, shake - dt * 2.5); flash = Math.max(0, flash - dt * 2.2);
        // play the timeline: moves tween a cell to the next, turns tween the picture's angle
        for (let i = 0; i < timeline.length; i++) {
          const s = timeline[i];
          if (clock >= s.t1) { if (s.type === 'move') { fx = s.to.x; fy = s.to.y; } else drawAngle = s.a1; continue; }
          if (clock >= s.t0) {
            const u = (clock - s.t0) / (s.t1 - s.t0);
            if (s.type === 'move') { const e = s.kind === 'fall' ? u * u * 0.5 + u * 0.5 : u; fx = D.lerp(s.from.x, s.to.x, e); fy = D.lerp(s.from.y, s.to.y, e); }
            else drawAngle = D.lerp(s.a0, s.a1, api.reduceMotion ? 1 : D.ease.outCubic(u));
          }
          break;
        }
        if (clock >= endT) {
          // trim the finished timeline, keep the final angle
          if (timeline.length) { drawAngle = angle; timeline = []; fx = p.x; fy = p.y; }
          if (ending) {
            if (clock - ending.t > 0.55) {
              if (ending.type === 'dead') { ending = null; restart(false); }
              else if (lvl >= LEVELS.length - 1) {
                done = true; ending = null;
                api.timeout(() => api.over({ score, title: 'Every room turned', won: true, message: 'All ' + LEVELS.length + ' rooms cleared' }), 300);
              } else { ending = null; load(lvl + 1); }
            }
          } else if (held) doWalk(held);
        }
      }

      // ---------- drawing ----------
      function layout(w, h) {
        const top = 40, bottom = 74, avW = w - 24, avH = h - top - bottom;
        const side = Math.max(m.W, m.H);
        lay.s = Math.max(14, Math.floor(Math.min(avW / side, avH / side) * 2) / 2);
        lay.cx = w / 2; lay.cy = top + avH / 2;
      }
      function roundBtn(x, y, w, h, on, act, col, icon, hold) {
        buttons.push({ x, y, w, h, act, hold });
        ctx.save(); ctx.globalAlpha = on ? 1 : 0.4;
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)';
        D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
        ctx.strokeStyle = col.ink; ctx.fillStyle = col.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        icon(x + w / 2, y + h / 2);
        ctx.restore();
      }
      function arcArrow(cx, cy, dir) {
        const r = 8;
        ctx.beginPath(); ctx.arc(cx, cy, r, dir > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15, dir > 0 ? Math.PI * 0.35 : Math.PI * 1.15, dir < 0); ctx.stroke();
        const ex = cx + r * Math.cos(dir > 0 ? Math.PI * 0.35 : Math.PI * 1.15), ey = cy + r * Math.sin(dir > 0 ? Math.PI * 0.35 : Math.PI * 1.15);
        ctx.beginPath(); ctx.moveTo(ex - dir * 6, ey - 1); ctx.lineTo(ex, ey); ctx.lineTo(ex + dir * 0.5, ey - 6.5); ctx.stroke();
      }
      function spikes(x, y, s, c, col) {
        // spikes attached to a side of the cell: u floor, d ceiling, l right wall (point left), r left wall (point right)
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
      function person(x, y, s, col, up) {
        // drawn upright on the screen: the caller has already turned the picture back
        const ink = col.ink, w = s * 0.38, hgt = s * 0.5;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(0, s * 0.46, s * 0.26, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        const sway = Math.sin(clock * 14) * (clock < endT && timeline.some(t => t.type === 'move' && t.kind === 'walk' && clock >= t.t0 && clock < t.t1) ? s * 0.04 : 0);
        ctx.fillStyle = ink; D.roundRect(ctx, -w / 2 + sway, -s * 0.06, w, hgt, w * 0.45); ctx.fill();
        ctx.beginPath(); ctx.arc(sway, -s * 0.2, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col.accent; ctx.beginPath(); ctx.arc(sway + face * s * 0.08, -s * 0.2, s * 0.045, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      function render() {
        const w = view.w, h = view.h; if (!m) return;
        const col = Ludus.colors();
        buttons = [];
        ctx.clearRect(0, 0, w, h);
        layout(w, h);
        const s = lay.s, ink = col.ink;
        // header
        D.text(ctx, 'Room ' + (lvl + 1) + ' of ' + LEVELS.length, w / 2, 20, 13, col.ink2, 650);
        // the room, turned
        const sx = shake && !api.reduceMotion ? Math.sin(clock * 60) * shake * 3 : 0;
        ctx.save();
        ctx.translate(lay.cx + sx, lay.cy); ctx.rotate(drawAngle); ctx.translate(-m.W * s / 2, -m.H * s / 2);
        const tiles = col.dark ? TILE_A_DARK : TILE_A;
        for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
          const c = m.cells[y][x];
          if (c === '#') continue;
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
        for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
          const c = m.cells[y][x];
          if (hazard(c)) spikes(x * s, y * s, s, c, col);
          else if (c === 'E') {
            const x0 = x * s, y0 = y * s, won = ending && ending.type === 'won';
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.3)' : 'rgba(80,50,20,0.14)'; D.roundRect(ctx, x0 + s * 0.2, y0 + s * 0.1, s * 0.6, s * 0.9, s * 0.14); ctx.fill();
            ctx.fillStyle = won ? col.good : col.accent; D.roundRect(ctx, x0 + s * 0.22, y0 + s * 0.06, s * 0.56, s * 0.88, s * 0.14); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.28)'; D.roundRect(ctx, x0 + s * 0.3, y0 + s * 0.14, s * 0.4, s * 0.16, s * 0.08); ctx.fill();
            ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(x0 + s * 0.64, y0 + s * 0.56, s * 0.06, 0, Math.PI * 2); ctx.fill();
          }
        }
        // you, turned back upright
        const dead = ending && ending.type === 'dead';
        const px = (fx + 0.5) * s, py = (fy + 0.5) * s;
        ctx.save(); ctx.translate(px, py); ctx.rotate(-drawAngle);
        if (dead && !api.reduceMotion) ctx.globalAlpha = Math.max(0, 1 - (clock - ending.t) / 0.5);
        const bx = bump > 0 && !api.reduceMotion ? Math.sin(bump * 30) * bump * 2 : 0;
        person(bx, 0, s, col);
        ctx.restore();
        ctx.restore();
        if (flash > 0) { ctx.fillStyle = 'rgba(201,80,58,' + (flash * 0.18).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
        // the hint, then the buttons
        D.text(ctx, LEVELS[lvl].hint, w / 2, h - 58, 13, col.ink2, 560);
        const by = h - 44, bw = 54, bh = 34, gap = 10, total = bw * 4 + gap * 3, x0 = (w - total) / 2;
        roundBtn(x0, by, bw, bh, true, () => doTurn(-1), col, (x, y) => arcArrow(x, y, -1));
        roundBtn(x0 + (bw + gap), by, bw, bh, true, () => doWalk(-1), col, (x, y) => { ctx.beginPath(); ctx.moveTo(x + 5, y - 6); ctx.lineTo(x - 3, y); ctx.lineTo(x + 5, y + 6); ctx.stroke(); }, -1);
        roundBtn(x0 + (bw + gap) * 2, by, bw, bh, true, () => doWalk(1), col, (x, y) => { ctx.beginPath(); ctx.moveTo(x - 5, y - 6); ctx.lineTo(x + 3, y); ctx.lineTo(x - 5, y + 6); ctx.stroke(); }, 1);
        roundBtn(x0 + (bw + gap) * 3, by, bw, bh, true, () => doTurn(1), col, (x, y) => arcArrow(x, y, 1));
      }

      score = 0;
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) load(0);
      api.score(score);
      if (window.ludusDebug) window.ludusDebug.rotate = () => ({ lvl, score, k, turns, deaths, par, p, busy: clock < endT, ending: ending && ending.type, done });
      if (window.ludusDebug) window.ludusDebug.rotateAct = (a) => { if (a === 'L') doWalk(-1); else if (a === 'R') doWalk(1); else if (a === 'cw') doTurn(1); else if (a === 'ccw') doTurn(-1); else if (a === 'go') load(+arguments[1] || 0); };
      if (window.ludusDebug) window.ludusDebug.rotateLoad = i => load(i);
      api.loop(dt => { update(dt); render(); });
      return { save: snapshot };
    }
  });
})();
