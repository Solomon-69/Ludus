/* Chomp: maze chase. Pellets, power sparks, four chasers with their own chase styles. */
(function () {
  const BASE = [
    '###################',
    '#........#........#',
    '#o##.###.#.###.##o#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.### # ###.####',
    '   #.#       #.#   ',
    '####.# ##-## #.####',
    '    .  #hhh#  .    ',
    '####.# ##### #.####',
    '   #.#       #.#   ',
    '####.# ##### #.####',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o.#.....P.....#.o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '#.................#',
    '###################'
  ];
  const W = 19, H = 21;
  let MAP = BASE;   // the maze of the level being played: the classic frame with a different set of walls in the top and bottom halves every run and level
  const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mix = (...n) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 2246822519); h ^= h >>> 16; } return h >>> 0; };
  const newSeed = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; } catch (e) { return Math.floor(Math.random() * 2147483647); } };
  // Walls are flipped in the left half of the top rows (1-5) and bottom rows (13-19) and mirrored to the right; a flip is kept only when every
  // open cell can still be reached and no cell in those rows is a dead end, so every maze can be played (checked by chomp-maze.js).
  function makeMap(seed, lvl) {
    const rnd = mulberry(mix(seed, lvl, 11)), g = BASE.map(r => r.split('')), zone = y => (y >= 1 && y <= 5) || (y >= 13 && y <= 19);
    const open = (x, y) => g[y] && g[y][((x % W) + W) % W] !== '#';
    const valid = () => {
      const seen = new Set(), st = [[9, 15]];
      while (st.length) { const [x, y] = st.pop(), k = y * W + x; if (seen.has(k)) continue; seen.add(k); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = (x + dx + W) % W, ny = y + dy; if (ny >= 0 && ny < H && g[ny][nx] !== '#' && !seen.has(ny * W + nx)) st.push([nx, ny]); } }
      for (let y = 0; y < H; y++) if (zone(y)) for (let x = 0; x < W; x++) if (g[y][x] !== '#') { if (!seen.has(y * W + x)) return false; let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + dx, y + dy)) n++; if (n < 2) return false; }
      return true;
    };
    for (let a = 0; a < 90; a++) {
      const x = 1 + Math.floor(rnd() * 8), y = 1 + Math.floor(rnd() * 19);
      if (!zone(y) || g[y][x] === 'o' || g[y][x] === 'P') continue;
      const was = g[y][x], was2 = g[y][W - 1 - x], to = was === '#' ? '.' : '#';
      g[y][x] = to; g[y][W - 1 - x] = to;
      if (!valid()) { g[y][x] = was; g[y][W - 1 - x] = was2; }
    }
    return g.map(r => r.join(''));
  }
  const DOOR = { x: 9, y: 8 }, OUT = { x: 9, y: 7 }, HOME = { x: 9, y: 9 };
  const DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  const ORDER = ['up', 'left', 'down', 'right']; // classic tie-break order
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const MODES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, ...
  const GHOSTS = [
    { name: 'ember', color: '#d1495b', corner: { x: W - 2, y: -3 }, start: { x: 9, y: 7 }, release: 0 },
    { name: 'blush', color: '#e58fb0', corner: { x: 1, y: -3 }, start: { x: 9, y: 9 }, release: 1 },
    { name: 'mist', color: '#3aa6c4', corner: { x: W - 1, y: H + 1 }, start: { x: 8, y: 9 }, release: 4.5 },
    { name: 'sunny', color: '#e0a526', corner: { x: 0, y: H + 1 }, start: { x: 10, y: 9 }, release: 8 }
  ];

  const cellAt = (x, y) => (y < 0 || y >= H ? '#' : MAP[y][((x % W) + W) % W]);
  const isWallFor = (x, y, who) => {
    const c = cellAt(x, y);
    if (c === '#') return true;
    if (c === '-' || c === 'h') return who !== 'house';
    return false;
  };
  const wrapX = x => ((x % W) + W) % W;
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  // Chaser body: a soft round-shouldered blob with two stubby feet and two little ears (own design, not a sheet sprite).
  function blobPath(ctx, x, y, r, wv) {
    ctx.beginPath();
    ctx.moveTo(x - r, y + r * 0.2);
    ctx.bezierCurveTo(x - r, y - r * 1.05, x + r, y - r * 1.05, x + r, y + r * 0.2);
    ctx.lineTo(x + r, y + r * 0.62);
    ctx.quadraticCurveTo(x + r, y + r * 0.92 + wv, x + r * 0.62, y + r * 0.92 + wv);
    ctx.lineTo(x + r * 0.3, y + r * 0.92 - wv);
    ctx.lineTo(x - r * 0.3, y + r * 0.92 - wv);
    ctx.lineTo(x - r * 0.62, y + r * 0.92 + wv);
    ctx.quadraticCurveTo(x - r, y + r * 0.92 + wv, x - r, y + r * 0.62);
    ctx.closePath();
    ctx.moveTo(x - r * 0.75, y - r * 0.55); ctx.lineTo(x - r * 0.95, y - r * 1.05); ctx.lineTo(x - r * 0.4, y - r * 0.85); ctx.closePath();
    ctx.moveTo(x + r * 0.75, y - r * 0.55); ctx.lineTo(x + r * 0.95, y - r * 1.05); ctx.lineTo(x + r * 0.4, y - r * 0.85); ctx.closePath();
  }
  // Ghost target tile for chase mode, four personalities.
  function chaseTarget(g, pac, ember) {
    const [dx, dy] = DIRS[pac.dir] || [0, 0];
    if (g.name === 'ember') return { x: pac.tx, y: pac.ty };
    if (g.name === 'blush') return { x: pac.tx + dx * 4, y: pac.ty + dy * 4 };
    if (g.name === 'mist') {
      const px = pac.tx + dx * 2, py = pac.ty + dy * 2;
      return { x: px * 2 - ember.tx, y: py * 2 - ember.ty };
    }
    return dist2(g.tx, g.ty, pac.tx, pac.ty) > 64 ? { x: pac.tx, y: pac.ty } : g.corner;
  }
  // At a tile centre: pick the open non-reverse direction closest to target (or random when frightened).
  function chooseDir(tx, ty, cur, target, who, rand) {
    const opts = ORDER.filter(d => d !== OPP[cur] && !isWallFor(tx + DIRS[d][0], ty + DIRS[d][1], who));
    if (!opts.length) return OPP[cur];
    if (rand) return opts[Math.floor(rand() * opts.length)];
    let best = opts[0], bd = Infinity;
    opts.forEach(d => {
      const v = dist2(tx + DIRS[d][0], ty + DIRS[d][1], target.x, target.y);
      if (v < bd) { bd = v; best = d; }
    });
    return best;
  }
  function countPellets(grid) { let n = 0; grid.forEach(r => r.forEach(c => { if (c === '.' || c === 'o') n++; })); return n; }
  function freshGrid() { return MAP.map(r => r.replace('P', ' ').split('')); }

  Ludus.register({
    id: 'chomp', name: 'Chomp', aka: 'maze chase', tag: 'Arcade', tint: '#2f2a24',
    waitForMove: true,   // stands still until the first move (see engine.js)
    hint: '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or WASD, swipe or click a direction',
    _test: { MAP: BASE, makeMap, W, H, cellAt, isWallFor, chaseTarget, chooseDir, countPellets, freshGrid, OPP, DIRS },
    art(ctx, w, h) {
      // Pac-style chase: open-mouthed chomper, a trail of dots ending in a power dot, a ghost looking back at it.
      const cy = h * 0.52, r = Math.min(w, h) * 0.22, px = w * 0.2;
      ctx.strokeStyle = 'rgba(217,119,87,0.32)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(12, cy - r * 1.75); ctx.lineTo(w - 12, cy - r * 1.75); ctx.moveTo(12, cy + r * 1.75); ctx.lineTo(w - 12, cy + r * 1.75); ctx.stroke();
      const m = 0.34 * Math.PI;
      ctx.fillStyle = '#d97757';
      ctx.beginPath(); ctx.moveTo(px, cy); ctx.arc(px, cy, r, m, -m + Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f2a24'; ctx.beginPath(); ctx.arc(px + r * 0.05, cy - r * 0.52, r * 0.13, 0, 7); ctx.fill();
      ctx.fillStyle = '#f4e3d0';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w * (0.36 + i * 0.1), cy, 2.6, 0, 7); ctx.fill(); }
      const sx = w * 0.66;
      ctx.fillStyle = 'rgba(244,227,208,0.22)'; ctx.beginPath(); ctx.arc(sx, cy, r * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#f4e3d0'; ctx.beginPath(); ctx.arc(sx, cy, r * 0.28, 0, 7); ctx.fill();
      const gx = w * 0.85, gr = r * 0.95, top = cy - gr * 0.1, bot = cy + gr;
      ctx.fillStyle = '#e58fb0';
      ctx.beginPath(); ctx.moveTo(gx - gr, bot); ctx.lineTo(gx - gr, top); ctx.arc(gx, top, gr, Math.PI, 0); ctx.lineTo(gx + gr, bot);
      for (let i = 0; i < 3; i++) { const x1 = gx + gr - (i * 2 + 1) * gr / 3, x2 = gx + gr - (i + 1) * 2 * gr / 3; ctx.quadraticCurveTo(x1, bot - gr * 0.38, x2, bot); }
      ctx.closePath(); ctx.fill();
      [-0.4, 0.4].forEach(o => {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(gx + o * gr, top - gr * 0.05, gr * 0.27, gr * 0.33, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2f2a24'; ctx.beginPath(); ctx.arc(gx + o * gr - gr * 0.1, top - gr * 0.02, gr * 0.13, 0, 7); ctx.fill();
      });
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas(() => {});
      const { ctx } = view;
      const L0 = api.level;
      let grid = freshGrid(), pelletsLeft = countPellets(grid);
      let level = 1, lives = 3, score = 0, t = 0;
      let phase = 'ready', phaseT = 0; // ready | play | dying | clear | over
      let modeIdx = 0, modeT = 0, fright = 0, eatChain = 0;
      let pac, ghosts, pops = [], particles = [], shake = 0, lay = null, catcher = null;

      const ghostBase = () => [5.6, 6.6, 7.3][L0] + Math.min(1.2, (level - 1) * 0.3);
      const pacSpeed = () => 7.4 + Math.min(1, (level - 1) * 0.2);
      const frightTime = () => Math.max(6, [18, 15, 12][L0] - (level - 1) * 1);   // plenty of time to hunt the chasers down

      function resetActors() {
        pac = { x: 9, y: 15, dir: 'left', want: 'left', tx: 9, ty: 15, mouth: 0, moving: true };
        ghosts = GHOSTS.map(g => Object.assign({}, g, {
          x: g.start.x, y: g.start.y, tx: g.start.x, ty: g.start.y,
          dir: g.name === 'ember' ? 'left' : 'up',
          state: g.name === 'ember' ? 'active' : 'house', // house | leaving | active | eaten | entering
          wait: g.release * [1.3, 1, 0.7][L0], fr: false
        }));
        modeIdx = 0; modeT = 0; fright = 0;
      }
      let runSeed = newSeed();
      function startLevel() { MAP = makeMap(runSeed, level); grid = freshGrid(); pelletsLeft = countPellets(grid); resetActors(); phase = 'ready'; phaseT = 0; }

      // Move an actor toward its next tile centre, calling decide() at each centre.
      function step(a, dist, decide) {
        let guard = 0;
        while (dist > 1e-6 && guard++ < 6) {
          const [dx, dy] = DIRS[a.dir];
          const cx = Math.round(a.x), cy = Math.round(a.y);
          // distance to the next centre ahead (0 if exactly on one)
          let toC = dx ? (dx > 0 ? Math.ceil(a.x - 1e-6) - a.x : a.x - Math.floor(a.x + 1e-6)) : (dy > 0 ? Math.ceil(a.y - 1e-6) - a.y : a.y - Math.floor(a.y + 1e-6));
          if (toC < 1e-6) {
            a.x = cx; a.y = cy; a.tx = wrapX(cx); a.ty = cy;
            if (!decide(a)) return; // stopped
            toC = 1;
          }
          const d = Math.min(dist, toC);
          const [ex, ey] = DIRS[a.dir];
          a.x += ex * d; a.y += ey * d; dist -= d;
          if (a.x < -0.5) a.x += W; else if (a.x > W - 0.5) a.x -= W;
          a.tx = wrapX(Math.round(a.x)); a.ty = Math.round(a.y);
        }
      }
      function pacDecide(a) {
        eatAt(a.tx, a.ty);
        const [wx, wy] = DIRS[a.want];
        if (!isWallFor(a.tx + wx, a.ty + wy, 'pac')) a.dir = a.want;
        const [dx, dy] = DIRS[a.dir];
        a.moving = !isWallFor(a.tx + dx, a.ty + dy, 'pac');
        return a.moving;
      }
      function eatAt(x, y) {
        const c = grid[y] && grid[y][x];
        if (c === '.' || c === 'o') {
          grid[y][x] = ' '; pelletsLeft--;
          if (c === '.') { score += 10; if ((pelletsLeft & 1) === 0) api.sfx('tick'); }
          else {
            score += 50; api.sfx('power'); fright = frightTime(); eatChain = 0;
            ghosts.forEach(g => { if (g.state === 'active') { g.fr = true; g.dir = OPP[g.dir]; } });
            burst(x, y, '#d97757', 10);
          }
          api.score(score);
          if (pelletsLeft <= 0) { phase = 'clear'; phaseT = 0; api.sfx('win'); }
        }
      }
      function ghostDecide(g) {
        if (g.state === 'eaten' && g.tx === OUT.x && g.ty === OUT.y) { g.state = 'entering'; return false; }
        let target;
        if (g.state === 'eaten') target = OUT;
        else if (modeIdx % 2 === 0) target = g.corner;
        else target = chaseTarget(g, pac, ghosts[0]);
        g.dir = chooseDir(g.tx, g.ty, g.dir, target, 'ghost', g.fr && g.state === 'active' ? Math.random : null);
        return true;
      }
      function moveGhost(g, dt) {
        const base = ghostBase();
        if (g.state === 'house') {
          g.wait -= dt;
          g.y = HOME.y + Math.sin(t * 6 + g.start.x) * 0.18;
          if (g.wait <= 0) g.state = 'leaving';
          return;
        }
        if (g.state === 'leaving' || g.state === 'entering') {
          const sp = (g.state === 'entering' ? 10 : 3.5) * dt;
          const goal = g.state === 'leaving' && Math.abs(g.x - 9) <= 0.01 ? OUT : { x: 9, y: HOME.y };
          const dx = goal.x - g.x, dy = goal.y - g.y, d = Math.hypot(dx, dy);
          if (d <= sp) { g.x = goal.x; g.y = goal.y; } else { g.x += dx / d * sp; g.y += dy / d * sp; }
          g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          if (g.state === 'leaving' && g.x === OUT.x && g.y === OUT.y) { g.state = 'active'; g.dir = 'left'; g.fr = false; g.tx = OUT.x; g.ty = OUT.y; }
          if (g.state === 'entering' && g.x === 9 && g.y === HOME.y) { g.state = 'leaving'; g.fr = false; }
          return;
        }
        let sp = base;
        if (g.state === 'eaten') sp = 14;
        else if (g.fr) sp = base * 0.6;
        else if (g.ty === 9 && (g.tx < 4 || g.tx > 14)) sp = base * 0.55; // tunnel
        step(g, sp * dt, ghostDecide);
      }
      function burst(x, y, color, n) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) { const a = api.rand(Math.PI * 2), v = api.rand(2, 5); particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: api.rand(0.3, 0.6), c: color }); }
      }
      function collide() {
        for (const g of ghosts) {
          if (g.state !== 'active') continue;
          let dx = Math.abs(g.x - pac.x); dx = Math.min(dx, W - dx);
          if (dx + Math.abs(g.y - pac.y) > 0.75) continue;
          if (g.fr) {
            const pts = 200 * Math.pow(2, Math.min(3, eatChain++));
            score += pts; api.score(score); api.sfx('eat');
            g.state = 'eaten'; g.fr = false;
            pops.push({ x: g.x, y: g.y, text: String(pts), age: 0 });
            burst(g.x, g.y, g.color, 12);
          } else {
            phase = 'dying'; phaseT = 0; lives--; api.sfx('lose');
            if (!api.reduceMotion) shake = 5;
            // Last life: freeze the scene where it happened and ring the ghost that caught you.
            if (lives <= 0) {
              catcher = g; phase = 'over'; api.sfx('over');
              api.timeout(() => api.over({ score, title: 'Caught', message: 'Reached level ' + level }), 500);
            }
            return;
          }
        }
      }

      function update(dt) {
        phaseT += dt;
        if (phase === 'over') return;
        t += dt;
        if (phase === 'ready') { if (phaseT > 1.4) { phase = 'play'; phaseT = 0; } return; }
        if (phase === 'dying') {
          if (phaseT > 1.5) { resetActors(); phase = 'ready'; phaseT = 0; }
          return;
        }
        if (phase === 'clear') {
          if (phaseT > 1.6) { level++; api.toast('Level ' + level); startLevel(); }
          return;
        }
        if (phase !== 'play') return;
        if (fright > 0) {
          fright -= dt;
          if (fright <= 0) { fright = 0; ghosts.forEach(g => { g.fr = false; }); }
        } else {
          modeT += dt;
          if (modeT >= MODES[modeIdx]) { modeT = 0; modeIdx++; ghosts.forEach(g => { if (g.state === 'active') g.dir = OPP[g.dir]; }); }
        }
        // instant reverse is always allowed
        if (pac.want === OPP[pac.dir]) { pac.dir = pac.want; pac.moving = true; }
        if (!pac.moving) { pacDecide(pac); }
        if (pac.moving) step(pac, pacSpeed() * dt, pacDecide);
        if (pac.moving) pac.mouth += dt * 14;
        collide();
        if (phase !== 'play') return;
        ghosts.forEach(g => moveGhost(g, dt));
        collide();
      }

      function computeLayout() {
        const hud = 24, pad = 8;
        const s = Math.floor(Math.min((view.w - pad * 2) / W, (view.h - hud - pad * 2) / H) * 2) / 2;
        return { s, ox: Math.round((view.w - s * W) / 2), oy: Math.round((view.h - hud - s * H) / 2), hud };
      }
      function drawWalls(col, L) {
        const s = L.s, wallC = phase === 'clear' && Math.floor(phaseT * 6) % 2 ? col.ink3 : (col.dark ? '#5a4a3d' : '#d9c6ad');
        ctx.strokeStyle = wallC; ctx.lineWidth = Math.max(2, s * 0.42); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (MAP[y][x] !== '#') continue;
          const cx = L.ox + (x + 0.5) * s, cy = L.oy + (y + 0.5) * s;
          let any = false;
          if (x + 1 < W && MAP[y][x + 1] === '#') { ctx.moveTo(cx, cy); ctx.lineTo(cx + s, cy); any = true; }
          if (y + 1 < H && MAP[y + 1][x] === '#') { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s); any = true; }
          if (!any) { ctx.moveTo(cx, cy); ctx.lineTo(cx + 0.01, cy); }
        }
        ctx.stroke();
        // door
        ctx.strokeStyle = col.accent; ctx.lineWidth = Math.max(1.5, s * 0.16);
        ctx.beginPath(); ctx.moveTo(L.ox + DOOR.x * s + 1, L.oy + (DOOR.y + 0.5) * s); ctx.lineTo(L.ox + (DOOR.x + 1) * s - 1, L.oy + (DOOR.y + 0.5) * s); ctx.stroke();
      }
      function drawGhost(g, col, L) {
        const s = L.s, x = L.ox + (g.x + 0.5) * s, y = L.oy + (g.y + 0.5) * s, r = s * 0.46;
        const blink = fright > 0 && fright < 1.6 && Math.floor(t * 8) % 2 === 0;
        if (g.state !== 'eaten') {
          ctx.fillStyle = g.fr ? (blink ? '#f3ede3' : '#5b6ee1') : g.color;
          blobPath(ctx, x, y, r, Math.sin(t * 14) * r * 0.1); ctx.fill();
        }
        const [dx, dy] = DIRS[g.dir] || [0, 0];
        if (g.fr && g.state !== 'eaten') {
          ctx.fillStyle = blink ? '#d1495b' : '#fff';
          [-0.32, 0.32].forEach(o => { ctx.beginPath(); ctx.arc(x + o * r, y - r * 0.15, r * 0.13, 0, 7); ctx.fill(); });
          return;
        }
        [-0.36, 0.36].forEach(o => {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + o * r, y - r * 0.18, r * 0.27, r * 0.32, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#2b3a67'; ctx.beginPath(); ctx.arc(x + o * r + dx * r * 0.13, y - r * 0.18 + dy * r * 0.15, r * 0.14, 0, 7); ctx.fill();
        });
      }
      function drawPac(col, L) {
        const s = L.s, x = L.ox + (pac.x + 0.5) * s, y = L.oy + (pac.y + 0.5) * s, r = s * 0.48;
        let open = (Math.sin(pac.mouth) * 0.5 + 0.5) * 0.36 + 0.04;
        let scale = 1;
        if (phase === 'dying') {
          const k = Math.min(1, phaseT / 1.2);
          if (phaseT < 0.25) open = 0.2; else open = 0.2 + D.ease.inOut(k) * 0.8;
          if (k >= 1) return;
        }
        if (phase === 'ready' && !api.reduceMotion && !api.waiting) scale = D.ease.outBack(Math.min(1, phaseT / 0.4));
        const ang = { right: 0, down: Math.PI / 2, left: 0, up: -Math.PI / 2 }[pac.dir];
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(pac.dir === 'left' ? -scale : scale, scale);
        ctx.fillStyle = col.accent;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, open * Math.PI, (2 - open) * Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.dark ? '#1b1814' : '#2a231c';
        ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.5, r * 0.11, 0, 7); ctx.fill();
        ctx.restore();
      }

      function render(dt) {
        const col = api.colors();
        lay = computeLayout(); const L = lay, s = L.s;
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.save();
        if (shake > 0) { ctx.translate(api.rand(-shake, shake) * 0.4, api.rand(-shake, shake) * 0.4); shake = Math.max(0, shake - dt * 20); }
        drawWalls(col, L);
        // pellets
        ctx.fillStyle = col.dark ? '#cbbfae' : '#8d7f6f';
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const c = grid[y][x];
          if (c === '.') { ctx.beginPath(); ctx.arc(L.ox + (x + 0.5) * s, L.oy + (y + 0.5) * s, Math.max(1.4, s * 0.1), 0, 7); ctx.fill(); }
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (grid[y][x] !== 'o') continue;
          const pulse = api.reduceMotion ? 1 : 0.85 + Math.sin(t * 6) * 0.15;
          D.spark(ctx, L.ox + (x + 0.5) * s, L.oy + (y + 0.5) * s, s * 0.36 * pulse, col.accent, t * 1.5);
        }
        if (phase !== 'over') {
          ghosts.forEach(g => { if (phase !== 'dying' || phaseT < 0.3) drawGhost(g, col, L); });
          drawPac(col, L);
        } else {
          // Caught: the whole scene dims and only the ghost that caught you (and you) stay bright, like a spotlight.
          const k = api.reduceMotion ? 1 : Math.min(1, phaseT / 0.3);
          ghosts.forEach(g => { if (g !== catcher) drawGhost(g, col, L); });
          drawPac(col, L);
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,' + (0.45 * k) + ')' : 'rgba(30,20,10,' + (0.4 * k) + ')'; ctx.fillRect(0, 0, view.w, view.h);
          if (catcher) drawGhost(catcher, col, L);
          drawPac(col, L);
        }
        particles = particles.filter(p => (p.age += dt) < p.life);
        particles.forEach(p => {
          p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(L.ox + p.x * s, L.oy + p.y * s, Math.max(1.5, s * 0.1), 0, 7); ctx.fill();
        });
        pops = pops.filter(p => (p.age += dt) < 0.9);
        pops.forEach(p => {
          ctx.globalAlpha = 1 - p.age / 0.9;
          D.text(ctx, p.text, L.ox + (p.x + 0.5) * s, L.oy + (p.y + 0.5) * s - p.age * 18, Math.max(11, s * 0.7), col.ink, 760);
        });
        ctx.globalAlpha = 1;
        if (phase === 'ready') D.text(ctx, 'Ready', L.ox + 9.5 * s, L.oy + 11.5 * s, Math.max(13, s * 0.85), col.accent, 760);
        ctx.restore();
        // HUD
        const hy = L.oy + H * s + L.hud / 2 + 2;
        for (let i = 0; i < Math.max(0, lives - 1); i++) {
          const x = L.ox + 8 + i * 18;
          ctx.fillStyle = col.accent;
          ctx.beginPath(); ctx.moveTo(x, hy); ctx.arc(x, hy, 6.5, Math.PI * 1.2, Math.PI * 2.8); ctx.closePath(); ctx.fill();
        }
        D.text(ctx, 'Level ' + level, L.ox + W * s - 4, hy, 11, col.ink3, 650, 'right');
      }

      function setDir(d) { if (d && DIRS[d]) pac.want = d; }
      api.keys(e => {
        const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' }[e.key];
        setDir(d);
      });
      api.swipe((dir, e) => {
        if (dir !== 'tap') return setDir(dir);
        if (!lay || !pac) return;
        const r = view.canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left - lay.ox) / lay.s - 0.5, my = (e.clientY - r.top - lay.oy) / lay.s - 0.5;
        const dx = mx - pac.x, dy = my - pac.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      });

      function restore(v) {
        try {
          if (!v || !Array.isArray(v.grid) || v.grid.length !== H || !v.grid.every(r => typeof r === 'string' && r.length === W)) return false;
          if (!(v.lives >= 1 && v.lives <= 3) || !(v.level >= 1) || !Number.isFinite(v.score) || !v.pac || !Array.isArray(v.ghosts) || v.ghosts.length !== GHOSTS.length) return false;
          if (!['ready', 'play', 'dying', 'clear'].includes(v.phase)) return false;
          const okA = a => Number.isFinite(a.x) && Number.isFinite(a.y) && DIRS[a.dir];
          if (!okA(v.pac) || !DIRS[v.pac.want] || !v.ghosts.every(okA)) return false;
          if (Number.isInteger(v.seed)) { const mm = makeMap(v.seed, v.level); if (!v.grid.every((r, y) => r.split('').every((c, x) => (c === '#') === (mm[y][x] === '#')))) return false; runSeed = v.seed; MAP = mm; } else return false;
          grid = v.grid.map(r => r.split('')); pelletsLeft = countPellets(grid);
          level = v.level; lives = v.lives; score = v.score;
          resetActors();
          Object.assign(pac, { x: v.pac.x, y: v.pac.y, dir: v.pac.dir, want: v.pac.want, moving: !!v.pac.moving, tx: wrapX(Math.round(v.pac.x)), ty: Math.round(v.pac.y) });
          ghosts.forEach((g, i) => {
            const s2 = v.ghosts[i];
            Object.assign(g, { x: s2.x, y: s2.y, dir: s2.dir, state: s2.state, wait: Number(s2.wait) || 0, fr: !!s2.fr, tx: wrapX(Math.round(s2.x)), ty: Math.round(s2.y) });
          });
          phase = v.phase; phaseT = Number(v.phaseT) || 0;
          modeIdx = v.modeIdx | 0; modeT = Number(v.modeT) || 0; fright = Number(v.fright) || 0; eatChain = v.eatChain | 0;
          api.score(score);
          return true;
        } catch (e) { return false; }
      }
      if (!restore(api.saved)) { startLevel(); api.score(0); }
      if (window.ludusDebug) window.ludusDebug.chomp = () => ({ seed: runSeed, level, pellets: pelletsLeft, rows: MAP.join('/') });
      render(0);
      // the first move ends the opening "Ready" at once: the player already said go
      api.onStart(() => { if (phase === 'ready') phaseT = 1.41; });
      api.loop(dt => { update(dt); render(dt); });
      return {
        save() {
          if (phase === 'over') return null;
          if (score === 0 && level === 1 && lives === 3) return null;
          const r = n => Math.round(n * 1000) / 1000;
          return {
            seed: runSeed, grid: grid.map(row => row.join('')), level, lives, score, phase, phaseT: r(phaseT), modeIdx, modeT: r(modeT), fright: r(fright), eatChain,
            pac: { x: r(pac.x), y: r(pac.y), dir: pac.dir, want: pac.want, moving: pac.moving },
            ghosts: ghosts.map(g => ({ x: r(g.x), y: r(g.y), dir: g.dir, state: g.state, wait: r(g.wait), fr: g.fr }))
          };
        }
      };
    }
  });
})();
