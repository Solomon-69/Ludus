/* Tag: two players, one keyboard. Pick a scene, then one of you is "it": touch the other to pass it on
   (no tag-backs for a moment). Whoever is "it" when the clock hits zero loses the round. */
(function () {
  const D = Ludus.draw;
  const T = 20, HALF = 18, COLS = 36, ROWS = 18, W = COLS * T, H = ROWS * T;
  const PW = 14, PH = 18, SW = 9, SH = 11;
  const GRAV = 1580, JUMP = 480, SPRING = 780, LAVA = 600, MAX_FALL = 600, CONV = 75, IT_BONUS = 1.1;
  const COYOTE = 0.1, BUFFER = 0.13, TAG_COOL = 1.5, TAG_STUN = 0.6, COUNT = 2.4, END_T = 2.8;
  const TIMES = [60, 90, 120], ROUNDS = [1, 3, 5];
  const POWERS = { speed: { label: 'Speed', color: '#e0a526', time: 5 }, jump: { label: 'Super jump', color: '#4f9d69', time: 6 },
    ghost: { label: 'Invisible', color: '#9b6dd6', time: 5 }, freeze: { label: 'Freeze', color: '#3fa7c9', time: 2.2 }, shrink: { label: 'Shrink', color: '#e05d8b', time: 6 },
    swap: { label: 'Swap', color: '#d9744a', time: 0 }, shield: { label: 'Shield', color: '#6b7a99', time: 10 } };
  const PKEYS = Object.keys(POWERS), TIMED = ['speedT', 'jumpT', 'ghostT', 'shrinkT', 'shieldT'];
  const NONE = { up: false, down: false, left: false, right: false, act: false };
  // Scenes are written as their left half (18 columns) and mirrored, so both sides are fair.
  // # block  ~ ice  < > conveyor  % lava (bounces you)  - jump-through ledge  ^ spring  O teleport door
  // * power-up spot  1 P1 start (mirrors to 2). An open edge is a tunnel: out one side, back on the other.
  // Movers: [x, y, width, dx, dy, seconds] in tiles, a jump-through platform gliding back and forth.
  const MAPS = [
    { name: 'Park', note: 'Springs', top: '#6aa56b', sky: ['#eef5e6', '#1f2822'], block: ['#cdb894', '#4a4136'], decor: 'park', rows: [
      '##################', '#.....*...........', '#...------........', '#.................', '#.............*...', '#..........-------',
      '#.................', '#...*.............', '#.------..........', '#.................', '#..........*......', '#.......------....',
      '..................', '....*.............', '...-----.......---', '..................', '..1.........^.....', '##################'] },
    // Rooftops: the gaps between buildings are one block deep, so nobody can fall through the city.
    { name: 'Rooftops', note: 'Doors, springs', top: '#d97757', sky: ['#f4ece3', '#22232b'], block: ['#bcb0a4', '#41414c'], decor: 'city', rows: [
      '##################', '..................', '.......*..........', '....------........', '..................', '..............*...',
      '............------', '..*...............', '-----.............', '..........O.......', '.......#####......', '.1O............^..',
      '#####..#####..####', '##################', '##################', '##################', '##################', '##################'] },
    { name: 'Ice cave', note: 'Slippery', top: '#e9f7fc', sky: ['#e7f3f7', '#1c2a31'], block: ['#a8d6e6', '#3f6878'], decor: 'ice', rows: [
      '##################', '#.................', '#.....*...........', '#...~~~~~~........', '#.................', '#.............*...',
      '#..........~~~~~~~', '#.................', '#.*...............', '#~~~~~~...........', '#.................', '..........*.......',
      '........~~~~~.....', '..................', '.*................', '~~~~~.............', '......1.....^.....', '~~~~~~~~~~~~~~~~~~'] },
    { name: 'Volcano', note: 'Lava, lifts', top: '#c4553a', sky: ['#f7e6d8', '#2c1f1c'], block: ['#957565', '#4a3530'], decor: 'volcano',
      movers: [[7, 15, 3, 6, 0, 4], [15, 15, 2, 0, -6, 5]], rows: [
      '##################', '#.................', '#.....*...........', '#...######........', '#.................', '#.............*...',
      '#..........-------', '#.................', '#.*...............', '#-----............', '#.................', '#.........*.......',
      '#.......------....', '#.................', '#.1...............', '#####.............', '#####.............', '#####%%%%%%%%%%%%%'] },
    { name: 'Space station', note: 'Low gravity', top: '#7c83d6', sky: ['#e9e8f3', '#15161f'], block: ['#b9bbcb', '#3a3d52'], decor: 'space', grav: 0.55, jumpK: 0.86, rows: [
      '##################', '#.................', '#..*..............', '#.-----.......O...', '#...........------', '#.................',
      '#.................', '#......*..........', '#....######.......', '#.................', '#.............*...', '#..........-------',
      '..................', '..................', '.*O...-----.......', '#####.............', '.......1..........', '##################'] },
    { name: 'Castle', note: 'Wall jumps, lift', top: '#9b7b5b', sky: ['#f1ece2', '#25221f'], block: ['#cbbfab', '#4b463f'], decor: 'castle',
      movers: [[6, 15, 3, 0, -12, 6]], rows: [
      '##################', '#.................', '#.*...........*...', '#----.....#..-----', '#.........#.......', '#.........#.......',
      '#.........#.----..', '#.*.......#.......', '#----.....#.......', '#.........#..-----', '#.........#.......', '#.........#...*...',
      '#.*.......#.----..', '#----.....#.......', '#.........#.......', '#...........-----.', '#.1............^..', '##################'] },
    { name: 'Jungle', note: 'Vines, mushrooms', top: '#3f9a52', sky: ['#e5f1de', '#18241b'], block: ['#97805e', '#3d3326'], decor: 'jungle',
      movers: [[6, 15, 3, 4, 0, 3.6], [11, 6, 3, 0, 6, 5]], rows: [
      '##################', '#.................', '#........*........', '#......-------....', '#.................', '#.*...............',
      '#-----............', '#.................', '#.............*...', '#...........------', '#.................', '.....*............',
      '...------.........', '..................', '...............^..', '..............###.', '..1...............', '##################'] },
    { name: 'Factory', note: 'Conveyors', top: '#e0a526', sky: ['#efece8', '#232222'], block: ['#aba59d', '#45423f'], decor: 'factory',
      movers: [[13, 14, 3, 0, -6, 4]], rows: [
      '##################', '#....*............', '#..>>>>>>.........', '#.................', '#.............*...', '#..........<<<<<<<',
      '#.................', '#.*...............', '#<<<<<<...........', '#.................', '#..........*......', '#........>>>>>>...',
      '#.................', '..................', '..*---............', '..................', '..1..........^....', '#>>>>>>>>>>>>>>>>>'] }
  ];
  const FLIP = { '1': '2', '<': '>', '>': '<' };
  function buildMap(i) {
    const def = MAPS[i];
    const grid = def.rows.map(s => { s = s.padEnd(HALF, '.').slice(0, HALF); return s + s.split('').reverse().map(ch => FLIP[ch] || ch).join(''); });
    const spawns = {}, spots = [], doors = [];
    grid.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (ch === '1' || ch === '2') spawns['p' + ch] = { x: c * T + (T - PW) / 2, y: r * T + T - PH };
      if (ch === '*') spots.push({ x: c * T + T / 2, y: r * T + T / 2 });
      if (ch === 'O') doors.push({ c, r, x: c * T + T / 2, y: r * T + T });
    }));
    doors.forEach((d, k) => { d.to = doors.length - 1 - k; d.hue = Math.min(k, doors.length - 1 - k); });
    const movers = [];
    (def.movers || []).forEach(([x, y, w, dx, dy, per]) => { movers.push({ x, y, w, dx, dy, per }, { x: COLS - x - w, y, w, dx: -dx, dy, per }); });
    return { i, name: def.name, top: def.top, def, grid, spawns, spots, doors, movers, grav: def.grav || 1, jumpK: def.jumpK || 1 };
  }
  const BUILT = MAPS.map((_, i) => buildMap(i)), solidT = t => '#~<>%'.indexOf(t) >= 0;
  // Two people, one keyboard: P1 = WASD (+F), P2 = arrows (+ / or Enter). intercept() can swallow keys (scene menu).
  function makePads(api, intercept) {
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act' }, K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false, hit: {} });
    const pads = { p1: blank(), p2: blank() };
    function find(e) {
      if (C1[e.code]) return ['p1', C1[e.code]]; if (C2[e.code]) return ['p2', C2[e.code]];
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      return K1[k] ? ['p1', K1[k]] : K2[k] ? ['p2', K2[k]] : null;
    }
    api.keys(e => {
      const m = !intercept(e) && find(e); if (!m) return;
      e.preventDefault(); const p = pads[m[0]]; if (!p[m[1]]) p.hit[m[1]] = true; p[m[1]] = true;
    });
    api.keysUp(e => { const m = find(e); if (m) pads[m[0]][m[1]] = false; });
    pads.clear = () => { Object.assign(pads.p1, blank()); Object.assign(pads.p2, blank()); };
    pads.take = (who, k) => { const h = pads[who].hit[k]; pads[who].hit[k] = false; return !!h; };
    api.on(window, 'blur', pads.clear); return pads;
  }
  function powerIcon(g, type, x, y, r) {
    g.save(); g.strokeStyle = '#fffaf3'; g.fillStyle = '#fffaf3'; g.lineWidth = Math.max(1.2, r * 0.22); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (type === 'speed') { g.moveTo(x + r * 0.2, y - r * 0.7); g.lineTo(x - r * 0.35, y + r * 0.08); g.lineTo(x + r * 0.2, y + r * 0.08); g.lineTo(x - r * 0.2, y + r * 0.72); g.stroke(); }
    else if (type === 'jump') { [-0.25, 0.3].forEach(o => { g.moveTo(x - r * 0.45, y + o * r + r * 0.2); g.lineTo(x, y + o * r - r * 0.25); g.lineTo(x + r * 0.45, y + o * r + r * 0.2); }); g.stroke(); }
    else if (type === 'ghost') { g.arc(x, y - r * 0.05, r * 0.45, Math.PI, 0); g.lineTo(x + r * 0.45, y + r * 0.55); g.lineTo(x + r * 0.15, y + r * 0.35); g.lineTo(x - r * 0.15, y + r * 0.55); g.lineTo(x - r * 0.45, y + r * 0.35); g.closePath(); g.stroke(); }
    else if (type === 'freeze') { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2; g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); g.lineTo(x - Math.cos(a) * r * 0.62, y - Math.sin(a) * r * 0.62); } g.stroke(); }
    else if (type === 'shrink') { g.rect(x - r * 0.62, y - r * 0.62, r * 1.24, r * 1.24); g.stroke(); g.beginPath(); g.rect(x - r * 0.22, y - r * 0.05, r * 0.4, r * 0.4); g.fill(); }
    else if (type === 'swap') { [[-0.3, 1], [0.3, -1]].forEach(([o, d]) => { g.moveTo(x - r * 0.6 * d, y + o * r); g.lineTo(x + r * 0.6 * d, y + o * r); g.moveTo(x + r * 0.3 * d, y + o * r - r * 0.25); g.lineTo(x + r * 0.6 * d, y + o * r); g.lineTo(x + r * 0.3 * d, y + o * r + r * 0.25); }); g.stroke(); }
    else { g.moveTo(x, y - r * 0.7); g.lineTo(x + r * 0.58, y - r * 0.45); g.lineTo(x + r * 0.5, y + r * 0.2); g.quadraticCurveTo(x + r * 0.3, y + r * 0.6, x, y + r * 0.75); g.quadraticCurveTo(x - r * 0.3, y + r * 0.6, x - r * 0.5, y + r * 0.2); g.lineTo(x - r * 0.58, y - r * 0.45); g.closePath(); g.stroke(); }
    g.restore();
  }
  // ---------- scenery (field units, faint, drawn under the tiles) ----------
  function decor(g, m, col, t) {
    const ink = col.dark ? '#ffffff' : '#3a2e22', a = col.dark ? 0.06 : 0.07;
    g.save(); g.fillStyle = ink; g.strokeStyle = ink; g.globalAlpha = a;
    const kind = m.def.decor;
    if (kind === 'park') {
      g.globalAlpha = a * 1.6; g.fillStyle = '#e0a526'; g.beginPath(); g.arc(W * 0.82, 60, 26, 0, 7); g.fill(); g.globalAlpha = a; g.fillStyle = ink;
      [[120, 70], [420, 45], [600, 110]].forEach(([x, y]) => { const dx = (t * 6) % W; g.beginPath(); g.ellipse((x + dx) % W, y, 34, 11, 0, 0, 7); g.ellipse((x + dx + 20) % W, y - 8, 20, 10, 0, 0, 7); g.fill(); });
      g.beginPath(); g.ellipse(W * 0.25, H, 220, 70, 0, Math.PI, 0); g.ellipse(W * 0.78, H, 260, 90, 0, Math.PI, 0); g.fill();
    } else if (kind === 'city') {
      for (let i = 0; i < 12; i++) { const bw = 40 + (i * 37) % 30, bh = 90 + (i * 53) % 150, x = i * 62 - 10; g.fillRect(x, H - bh, bw, bh);
        g.fillStyle = m.def.sky[col.dark ? 1 : 0]; g.globalAlpha = 0.85; for (let wy = H - bh + 10; wy < H - 10; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) g.fillRect(wx, wy, 5, 7); g.fillStyle = ink; g.globalAlpha = a; }
    } else if (kind === 'ice') {
      for (let i = 0; i < 18; i++) { const x = i * 41 + 12, l = 18 + (i * 29) % 40; g.beginPath(); g.moveTo(x - 9, 20); g.lineTo(x, 20 + l); g.lineTo(x + 9, 20); g.fill(); }
      for (let i = 0; i < 26; i++) { const x = (i * 97) % W, y = ((i * 61) + t * 14) % H; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    } else if (kind === 'volcano') {
      g.beginPath(); g.moveTo(W * 0.3, H); g.lineTo(W * 0.46, H * 0.35); g.lineTo(W * 0.54, H * 0.35); g.lineTo(W * 0.7, H); g.fill();
      g.globalAlpha = a * 2.2; g.fillStyle = '#e8743b'; for (let i = 0; i < 7; i++) { const k = (t * 0.4 + i / 7) % 1; g.beginPath(); g.arc(W / 2 + Math.sin(i * 2.3) * 30 * k, H * 0.35 - k * 110, 6 * (1 - k) + 2, 0, 7); g.fill(); }
      const gr = g.createLinearGradient(0, H - 60, 0, H); gr.addColorStop(0, 'rgba(232,116,59,0)'); gr.addColorStop(1, 'rgba(232,116,59,0.9)'); g.globalAlpha = a * 2.5; g.fillStyle = gr; g.fillRect(0, H - 60, W, 60);
    } else if (kind === 'space') {
      g.globalAlpha = a * 2.2; for (let i = 0; i < 60; i++) { const x = (i * 173) % W, y = (i * 89) % H, tw = 0.6 + 0.4 * Math.sin(t * 2 + i); g.beginPath(); g.arc(x, y, 1.1 * tw + 0.3, 0, 7); g.fill(); }
      g.globalAlpha = a * 1.4; g.fillStyle = '#7c83d6'; g.beginPath(); g.arc(W * 0.78, 90, 38, 0, 7); g.fill();
      g.strokeStyle = '#7c83d6'; g.lineWidth = 3; g.beginPath(); g.ellipse(W * 0.78, 90, 62, 12, -0.3, 0, 7); g.stroke();
    } else if (kind === 'castle') {
      [[80, 150], [300, 200], [520, 170], [660, 130]].forEach(([x, h]) => { g.fillRect(x, H - h, 46, h); for (let k = 0; k < 4; k++) g.fillRect(x - 4 + k * 14, H - h - 10, 8, 10);
        g.beginPath(); g.moveTo(x + 23, H - h - 10); g.lineTo(x + 23, H - h - 40); g.stroke(); g.fillRect(x + 23, H - h - 40, 16 + Math.sin(t * 4 + x) * 3, 9); });
    } else if (kind === 'jungle') {
      g.lineWidth = 2; for (let i = 0; i < 14; i++) { const x = i * 53 + 20, l = 50 + (i * 37) % 90, sw = Math.sin(t * 1.2 + i) * 6; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + sw, l / 2, x + sw * 1.5, l); g.stroke();
        g.beginPath(); g.ellipse(x + sw * 1.5, l, 7, 4, 0.6, 0, 7); g.fill(); }
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(i * 90 + 30, H - 6, 46, 26, 0, Math.PI, 0); g.fill(); }
    } else if (kind === 'factory') {
      g.lineWidth = 6; [[110, 90, 34], [620, 120, 44], [380, 250, 28]].forEach(([x, y, r], k) => {
        g.save(); g.translate(x, y); g.rotate(t * (k % 2 ? -0.6 : 0.6)); g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
        for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-4, -r - 9, 8, 9); } g.restore(); });
      g.fillRect(0, 40, W, 6); g.fillRect(240, 40, 6, 120);
    }
    g.restore();
  }
  // ---------- tiles (shared by the field and the scene thumbnails) ----------
  function drawTiles(g, m, col, clock, springs) {
    const blk = m.def.block[col.dark ? 1 : 0], hi = col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.35)';
    const ice = col.dark ? '#4f7f90' : '#bfe3f0', strips = [], at = (c, r) => m.grid[((r % ROWS) + ROWS) % ROWS][((c % COLS) + COLS) % COLS];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = m.grid[r][c], x = c * T, y = r * T;
      if (t === '#' || t === '~') {
        g.fillStyle = t === '#' ? blk : ice; g.fillRect(x, y, T + 0.5, T + 0.5);
        if (!solidT(at(c, r - 1))) strips.push([x, y, t === '#' ? m.top : (col.dark ? '#a9dcec' : '#f2fbfe')]);
        else if (t === '#') { g.fillStyle = hi; g.fillRect(x + 4, y + 4, 3, 3); }
        if (t === '~') { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 4, y + 13); g.lineTo(x + 10, y + 7); g.stroke(); }
      } else if (t === '<' || t === '>') {
        g.fillStyle = col.dark ? '#34312e' : '#6d665e'; g.fillRect(x, y, T + 0.5, T + 0.5);
        g.fillStyle = col.dark ? '#57514a' : '#8f877d'; g.fillRect(x, y, T + 0.5, 6);
        const d = t === '>' ? 1 : -1, off = ((clock * CONV * d) % 10 + 10) % 10;
        g.strokeStyle = m.top; g.lineWidth = 1.6; g.beginPath();
        for (let k = -10; k < T + 10; k += 10) { const cx = x + k + off; if (cx < x + 2 || cx > x + T - 2) continue; g.moveTo(cx - 2 * d, y + 1); g.lineTo(cx + 1 * d, y + 3); g.lineTo(cx - 2 * d, y + 5); }
        g.stroke();
      } else if (t === '%') {
        g.fillStyle = col.dark ? '#a8402a' : '#e2603c'; g.fillRect(x, y + 4, T + 0.5, T - 3.5);
        g.fillStyle = '#f2a541'; g.beginPath(); g.moveTo(x, y + 6);
        for (let k = 0; k <= 4; k++) g.lineTo(x + k * 5, y + 4 + Math.sin(clock * 4 + c * 1.3 + k) * 2);
        g.lineTo(x + T, y + 9); g.lineTo(x, y + 9); g.fill();
      } else if (t === '-') {
        if (c > 0 && m.grid[r][c - 1] === '-') continue;
        let n = 1; while (c + n < COLS && m.grid[r][c + n] === '-') n++;
        g.fillStyle = 'rgba(0,0,0,0.12)'; D.roundRect(g, x + 1, y + 2, n * T - 2, 6, 3); g.fill();
        g.fillStyle = m.top; D.roundRect(g, x, y, n * T, 6, 3); g.fill();
      } else if (t === '^') {
        const k = springs ? Math.max(0, 1 - (clock - (springs[c + ',' + r] ?? -9)) * 5) : 0, top = y + T - 9 + k * 4;
        g.strokeStyle = col.ink3; g.lineWidth = 1.6; g.beginPath();
        for (let i = 0; i <= 3; i++) g.lineTo(x + (i % 2 ? 6 : 14), top + 2 + (y + T - 4 - top) * i / 3);
        g.stroke(); g.fillStyle = '#e0a526'; D.roundRect(g, x + 2, top - 3, T - 4, 5, 2.5); g.fill();
        g.fillStyle = col.ink3; g.fillRect(x + 3, y + T - 2, T - 6, 2);
      }
    }
    strips.forEach(([x, y, color]) => { g.fillStyle = color; g.fillRect(x - 0.25, y, T + 0.5, 4); });
    m.doors.forEach(d => {
      const hue = ['#9b6dd6', '#3fa7c9'][d.hue % 2], x = d.x, y = d.y;
      g.fillStyle = col.dark ? '#1b1a22' : '#3b3346'; D.roundRect(g, x - 9, y - 32, 18, 32, 9); g.fill();
      g.strokeStyle = hue; g.lineWidth = 2.5; D.roundRect(g, x - 9, y - 32, 18, 32, 9); g.stroke();
      g.save(); g.globalAlpha = 0.85; D.spark(g, x, y - 15, 6, hue, clock * 2); g.restore();
    });
    m.movers.forEach(mv => {
      g.fillStyle = 'rgba(0,0,0,0.14)'; D.roundRect(g, mv.cx + 1, mv.cy + 2, mv.w * T - 2, 7, 3.5); g.fill();
      g.fillStyle = m.top; D.roundRect(g, mv.cx, mv.cy, mv.w * T, 7, 3.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 1; k < mv.w * 2; k++) g.fillRect(mv.cx + k * T / 2 - 1, mv.cy + 2, 2, 3);
    });
  }
  function placeMovers(m, t) { m.movers.forEach(mv => {
      const k = 0.5 - 0.5 * Math.cos((t / mv.per) * Math.PI * 2), nx = (mv.x + mv.dx * k) * T, ny = (mv.y + mv.dy * k) * T;
      mv.ddx = mv.cx === undefined ? 0 : nx - mv.cx; mv.ddy = mv.cy === undefined ? 0 : ny - mv.cy; mv.cx = nx; mv.cy = ny;
  }); }
  function sky(g, m, col) { g.fillStyle = m.def.sky[col.dark ? 1 : 0]; D.roundRect(g, 0, 0, W, H, 12); g.fill(); }
  BUILT.forEach(m => placeMovers(m, 0));
  Ludus.register({
    id: 'tag', name: 'Tag', tag: '2 Player', wide: true, tint: '#6aa56b',
    hint: '<b>P1</b> <kbd>A</kbd><kbd>D</kbd> run <kbd>W</kbd> jump <kbd>S</kbd> drop <kbd>F</kbd> power · <b>P2</b> same on <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> + <kbd>/</kbd> or <kbd>Enter</kbd> · scenes: arrows/WASD, <kbd>Enter</kbd>/<kbd>Space</kbd> or click',
    _rules: { MAPS, buildMap, T, COLS, ROWS, POWERS },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      [[0.1, 0.78, 0.8], [0.14, 0.5, 0.3], [0.56, 0.5, 0.3], [0.32, 0.28, 0.36]].forEach(([x, y, ww]) => { D.roundRect(ctx, w * x, h * y, w * ww, h * 0.06, h * 0.03); ctx.fill(); });
      const blob = (x, y, color) => { ctx.fillStyle = color; D.roundRect(ctx, x - h * 0.07, y - h * 0.18, h * 0.14, h * 0.18, h * 0.05); ctx.fill(); ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(x + h * 0.02, y - h * 0.12, h * 0.015, 0, Math.PI * 2); ctx.fill(); };
      blob(w * 0.3, h * 0.5, '#fff8f2'); blob(w * 0.7, h * 0.78, '#5b8def');
      ctx.fillStyle = '#2b2018'; D.roundRect(ctx, w * 0.3 - h * 0.08, h * 0.13, h * 0.16, h * 0.1, h * 0.04); ctx.fill();
      D.text(ctx, 'IT', w * 0.3, h * 0.18, h * 0.07, '#fff8f2', 800);
    },
    create(stage, api) {
      const view = api.canvas(), { ctx } = view;
      const pads = makePads(api, e => phase === 'menu' && menuKey(e));
      const BASE = [150, 162, 175][api.level];
      let sel = { map: 0, time: 0, rounds: 1 }, focus = { row: 1, col: 0 }, clicked = null;
      let map = BUILT[0], mapIdx = 0, round = 0, wins = { p1: 0, p2: 0 }, it = 'p1', firstIt = 'p1', timer = 60, phase = 'menu', phaseT = 0;
      let items = [], itemT = 4, tagCool = 0, mt = 0, clock = 0, players = [], parts = [], floaters = [], springs = {};
      let shake = 0, overCalled = false, lastTick = -1, flash = 0, thumbs = null;
      const firstTo = () => ROUNDS[sel.rounds], other = id => (id === 'p1' ? 'p2' : 'p1'), P = id => players[id === 'p1' ? 0 : 1];
      const label = id => (id === 'p1' ? 'P1' : 'P2'), pcol = (id, col) => (id === 'p1' ? col.accent : D.P2);
      function newPlayer(id) {
        return { id, x: 0, y: 0, w: PW, h: PH, vx: 0, vy: 0, face: id === 'p1' ? 1 : -1, ground: false, surf: '', onM: -1, wallL: false, wallR: false, door: -1,
          coyote: 0, buffer: 0, lock: 0, dropT: 0, frozen: 0, speedT: 0, jumpT: 0, ghostT: 0, shrinkT: 0, shieldT: 0, hold: null, sq: 1, dead: false, bounce: false };
      }
      function startMatch() {
        round = 0; wins = { p1: 0, p2: 0 }; firstIt = Math.random() < 0.5 ? 'p1' : 'p2'; overCalled = false;
        api.score(0); startRound(); api.sfx('click');
      }
      function startRound() {
        if (sel.map >= 0) mapIdx = sel.map;
        else { let n = api.randInt(0, MAPS.length - 2); if (round > 0 && n >= mapIdx) n++; mapIdx = round > 0 ? n : api.randInt(0, MAPS.length - 1); }
        map = buildMap(mapIdx); mt = 0; placeMovers(map, mt);
        it = round % 2 === 0 ? firstIt : other(firstIt); players = [newPlayer('p1'), newPlayer('p2')];
        players.forEach(p => { p.x = map.spawns[p.id].x; p.y = map.spawns[p.id].y; });
        timer = TIMES[sel.time]; phase = 'count'; phaseT = COUNT; items = []; itemT = 4; tagCool = 0; lastTick = -1; parts = []; floaters = [];
        pads.clear();
      }
      // ---------- scene menu ----------
      function menuLayout() {
        const w = view.w, h = view.h, pad = 12, chips = [];
        const groups = [{ label: 'Round', opts: TIMES.map(t => t + 's'), cw: 46, key: 'time' }, { label: 'First to', opts: ROUNDS.map(String), cw: 36, key: 'rounds' }];
        const gw = gr => 72 + gr.opts.length * (gr.cw + 8);
        const one = gw(groups[0]) + gw(groups[1]) + 28 <= w - pad * 2;
        let y = 48;
        const place = (gr, gi, x0, yy) => gr.opts.forEach((o, k) => chips.push({ x: x0 + 72 + k * (gr.cw + 8), y: yy, w: gr.cw, h: 28, text: o, key: gr.key, val: k, glabel: k === 0 ? gr.label : null, gx: x0 }));
        if (one) { const tw = gw(groups[0]) + gw(groups[1]) + 28, x0 = (w - tw) / 2; place(groups[0], 0, x0, y); place(groups[1], 1, x0 + gw(groups[0]) + 28, y); y += 28; }
        else { place(groups[0], 0, (w - gw(groups[0])) / 2, y); place(groups[1], 1, (w - gw(groups[1])) / 2, y + 36); y += 64; }
        const top = y + 22, availH = h - top - 16, availW = w - pad * 4, n = MAPS.length + 1, gap = 18, LAB = 54;
        // Eight scenes plus Random make nine tiles: a 3 x 3 grid unless it would make the tiles much smaller.
        const fit = gc => {
          const gr = Math.ceil(n / gc);
          let tw = (availW - (gc - 1) * gap) / gc; const th0 = (availH - (gr - 1) * gap) / gr;
          tw = Math.min(tw, (th0 - LAB) * 2 + 12, 260); return { gc, gr, tw, th: (tw - 12) / 2 + LAB };
        };
        const opts = [3, 4, 5].map(fit), widest = opts.reduce((a, b) => (b.tw > a.tw ? b : a));
        const best = opts[0].tw >= widest.tw * 0.8 ? opts[0] : widest;
        const { gc, gr, tw, th } = best, tiles = [], gy = top + Math.max(0, (availH - (gr * th + (gr - 1) * gap)) * 0.5);
        for (let i = 0; i < n; i++) {
          const r = Math.floor(i / gc), inRow = Math.min(gc, n - r * gc), k = i - r * gc;
          const x0 = (w - (inRow * tw + (inRow - 1) * gap)) / 2;
          tiles.push({ x: x0 + k * (tw + gap), y: gy + r * (th + gap), w: tw, h: th, map: i < MAPS.length ? i : -1 });
        }
        const rows = [chips]; // row 0 = option chips, then the scene tiles
        for (let r = 0; r < gr; r++) rows.push(tiles.slice(r * gc, r * gc + gc));
        return { chips, tiles, rows, tw };
      }
      function focusItem(L) { const row = L.rows[Math.min(focus.row, L.rows.length - 1)]; return row[Math.min(focus.col, row.length - 1)]; }
      function moveFocus(dx, dy) {
        const L = menuLayout(), cur = focusItem(L);
        focus.row = Math.min(focus.row, L.rows.length - 1); focus.col = Math.min(focus.col, L.rows[focus.row].length - 1);
        if (dx) focus.col = Math.max(0, Math.min(L.rows[focus.row].length - 1, focus.col + dx));
        if (dy) {
          const nr = Math.max(0, Math.min(L.rows.length - 1, focus.row + dy));
          if (nr !== focus.row) {
            const cx = cur.x + cur.w / 2; let bi = 0;
            L.rows[nr].forEach((it2, i) => { if (Math.abs(it2.x + it2.w / 2 - cx) < Math.abs(L.rows[nr][bi].x + L.rows[nr][bi].w / 2 - cx)) bi = i; });
            focus.row = nr; focus.col = bi;
          }
        }
        api.sfx('move');
      }
      function choose(item) {
        if (item && item.key) { sel[item.key] = item.val; api.sfx('tap'); } else if (item) { sel.map = item.map; startMatch(); }
      }
      function menuKey(e) {
        const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const dir = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[k];
        if (dir) { e.preventDefault(); moveFocus(dir[0], dir[1]); }
        else if (k === 'Enter' || k === ' ' || k === 'f' || k === '/') { e.preventDefault(); choose(focusItem(menuLayout())); }
        return true;
      }
      api.on(view.canvas, 'pointerdown', e => {
        if (phase !== 'menu') return;
        const r = view.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, L = menuLayout();
        L.rows.forEach((row, ri) => row.forEach((item, ci) => {
          if (x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h) {
            // Scene tiles: first click selects (orange ring), a second click on the same tile opens it.
            const picked = clicked === ri + ':' + ci; clicked = ri + ':' + ci;
            focus = { row: ri, col: ci };
            if (item.key || picked) choose(item); else api.sfx('move');
          }
        }));
      });
      function thumb(i, tw, col) {
        const key = tw + ':' + col.dark + ':' + view.dpr;
        if (!thumbs || thumbs.key !== key) thumbs = { key, list: [] };
        if (thumbs.list[i]) return thumbs.list[i];
        const cw = tw - 12, ch = cw / 2, cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(cw * view.dpr)); cv.height = Math.max(1, Math.round(ch * view.dpr));
        const g = cv.getContext('2d'), m = BUILT[i];
        g.scale(cv.width / W, cv.height / H); sky(g, m, col);
        g.save(); D.roundRect(g, 0, 0, W, H, 12); g.clip(); decor(g, m, col, 0); drawTiles(g, m, col, 0, null); g.restore();
        thumbs.list[i] = cv; return cv;
      }
      function drawMenu(col) {
        const L = menuLayout(), w = view.w, f = focusItem(L);
        D.text(ctx, 'Choose a scene', w / 2, 22, 17, col.ink, 800);
        L.chips.forEach(c => {
          if (c.glabel) D.text(ctx, c.glabel, c.gx + 62, c.y + c.h / 2, 12, col.ink2, 700, 'right');
          const on = sel[c.key] === c.val, foc = c === f;
          D.roundRect(ctx, c.x, c.y, c.w, c.h, 14); ctx.fillStyle = on ? col.accent : (col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'); ctx.fill();
          if (foc) { ctx.strokeStyle = col.ink; ctx.lineWidth = 2; ctx.stroke(); }
          D.text(ctx, c.text, c.x + c.w / 2, c.y + c.h / 2 + 0.5, 12.5, on ? '#fffaf3' : col.ink, 750);
        });
        L.tiles.forEach(t => {
          const foc = t === f, lift = foc && !api.reduceMotion ? 1 + 0.02 * Math.sin(clock * 5) : 1;
          ctx.save(); ctx.translate(t.x + t.w / 2, t.y + t.h / 2); ctx.scale(lift, lift); ctx.translate(-t.w / 2, -t.h / 2);
          ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = foc ? 14 : 6; ctx.shadowOffsetY = foc ? 4 : 2;
          D.roundRect(ctx, 0, 0, t.w, t.h, 12); ctx.fillStyle = col.surface || (col.dark ? '#2f2a25' : '#fff'); ctx.fill(); ctx.shadowColor = 'transparent';
          if (foc) { ctx.strokeStyle = col.accent; ctx.lineWidth = 2.5; ctx.stroke(); }
          const tw = t.w - 12, th = tw / 2;
          if (t.map >= 0) ctx.drawImage(thumb(t.map, L.tw, col), 6, 6, tw, th);
          else {
            ctx.save(); D.roundRect(ctx, 6, 6, tw, th, 6); ctx.clip();
            MAPS.forEach((m, k) => { ctx.fillStyle = m.top; ctx.fillRect(6 + k * tw / MAPS.length, 6, tw / MAPS.length + 1, th); });
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)'; ctx.fillRect(6, 6, tw, th); ctx.restore();
            D.spark(ctx, 6 + tw / 2, 6 + th / 2, th * 0.3, '#fffaf3', api.reduceMotion ? 0 : clock);
          }
          const name = t.map >= 0 ? MAPS[t.map].name : 'Random', note = t.map >= 0 ? MAPS[t.map].note : 'New map each round';
          D.text(ctx, name, t.w / 2, th + 25, Math.min(13.5, t.w / 8.5), col.ink, 750);
          D.text(ctx, note, t.w / 2, th + 43, Math.min(11, t.w / 10.5), col.ink2, 600);
          if (sel.map === t.map && !foc) { ctx.fillStyle = col.accent; ctx.beginPath(); ctx.arc(t.w - 12, 13, 4, 0, 7); ctx.fill(); }
          ctx.restore();
        });
      }
      // ---------- tiles + physics ----------
      function tile(c, r) { c = ((c % COLS) + COLS) % COLS; r = ((r % ROWS) + ROWS) % ROWS; return map.grid[r][c]; }
      const solid = (c, r) => solidT(tile(c, r));
      function solidBox(x, y, w, h) {
        for (let r = Math.floor(y / T); r <= Math.floor((y + h - 0.01) / T); r++)
          for (let c = Math.floor(x / T); c <= Math.floor((x + w - 0.01) / T); c++) if (solid(c, r)) return true;
        return false;
      }
      function applySize(p) {
        const w = p.shrinkT > 0 ? SW : PW, h = p.shrinkT > 0 ? SH : PH;
        if (w === p.w) return;
        const nx = p.x + p.w / 2 - w / 2, ny = p.y + p.h - h;
        if (w > p.w && solidBox(nx, ny, w, h)) { p.shrinkT = 0.05; return; }   // no room to grow yet
        p.x = nx; p.y = ny; p.w = w; p.h = h;
      }
      function moveX(p, dx) {
        p.x += dx;
        const top = Math.floor((p.y + 0.01) / T), bot = Math.floor((p.y + p.h - 0.01) / T);
        if (dx > 0) { const c = Math.floor((p.x + p.w - 0.01) / T); for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = c * T - p.w; p.vx = 0; return; } }
        else if (dx < 0) { const c = Math.floor((p.x + 0.01) / T); for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = (c + 1) * T; p.vx = 0; return; } }
      }
      function landed(p) {
        if (p.vy > 330 && !api.reduceMotion) { p.sq = 0.72; dust(p.x + p.w / 2, p.y + p.h, 4); }
        if (p.vy > 200) api.sfx('drop');
        p.vy = 0; p.ground = true;
      }
      function moveY(p, dy) {
        const prevBottom = p.y + p.h; p.y += dy;
        const l = Math.floor((p.x + 0.01) / T), rr = Math.floor((p.x + p.w - 0.01) / T);
        if (dy > 0) {
          const r = Math.floor((p.y + p.h - 0.01) / T);
          for (let c = l; c <= rr; c++) {
            const t = tile(c, r);
            if (t === '%') {
              p.y = r * T - p.h; p.vy = -LAVA * Math.sqrt(map.grav); p.bounce = true; p.ground = false; p.sq = 1.3;
              burst(p.x + p.w / 2, p.y + p.h, 8, '#f2a541'); api.sfx('jump'); return;
            }
            if (solidT(t) || (t === '-' && p.dropT <= 0 && prevBottom <= r * T + 0.5)) { p.y = r * T - p.h; landed(p); p.surf = t; return; }
          }
          if (p.dropT <= 0) for (let i = 0; i < map.movers.length; i++) {
            const m = map.movers[i];
            if (p.x + p.w > m.cx && p.x < m.cx + m.w * T && prevBottom <= m.cy + 1.5 + Math.max(0, m.ddy || 0) && p.y + p.h >= m.cy) {
              p.y = m.cy - p.h; landed(p); p.onM = i; p.surf = '-'; return;
            }
          }
        } else if (dy < 0) {
          const r = Math.floor((p.y + 0.01) / T);
          for (let c = l; c <= rr; c++) if (solid(c, r)) { p.y = (r + 1) * T; p.vy = 0; return; }
        }
      }
      function wrap(p) {
        if (p.x + p.w / 2 < 0) p.x += W; else if (p.x + p.w / 2 >= W) p.x -= W;
        if (p.y + p.h / 2 < 0) p.y += H; else if (p.y + p.h / 2 >= H) p.y -= H;
      }
      function doorAt(p) {
        return map.doors.findIndex(d => p.x + p.w > d.x - 7 && p.x < d.x + 7 && p.y + p.h > d.y - 30 && p.y < d.y - 2);
      }
      function carry(p) {
        const m = map.movers[p.onM]; if (!m) return;
        moveX(p, m.ddx); if (m.ddy < 0) moveY(p, m.ddy); else p.y += m.ddy;
      }
      function step(p, live, dt) {
        const pad = pads[p.id], jumpHit = pads.take(p.id, 'up'), useHit = pads.take(p.id, 'act'); pads.take(p.id, 'down');
        const ok = live && p.frozen <= 0 && !p.dead, inp = ok ? pad : NONE;
        if (ok && useHit && p.hold) usePower(p);
        p.frozen = Math.max(0, p.frozen - dt);
        TIMED.concat(['dropT']).forEach(k => { p[k] = Math.max(0, p[k] - dt); });
        applySize(p);
        p.sq += (1 - p.sq) * Math.min(1, dt * 12);
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0); if (dir) p.face = dir;
        const maxV = BASE * (p.speedT > 0 ? 1.45 : 1) * (p.id === it && phase === 'play' ? IT_BONUS : 1) * (p.shrinkT > 0 ? 1.06 : 1);
        const surf = p.ground ? p.surf : '', ice = surf === '~';
        let acc = p.ground ? (ice ? 480 : 2600) : 1600;
        if (p.lock > 0) { p.lock -= dt; acc *= 0.2; }
        if (dir) {
          const along = p.vx * dir;
          if (along < maxV) p.vx = dir * Math.min(maxV, along + acc * dt * (along < 0 ? (ice ? 1.2 : 1.6) : 1));
          else p.vx = dir * Math.max(maxV, along - 900 * dt);
        } else {
          const fr = p.ground ? (ice ? 200 : 2200) : 450;
          p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - fr * dt);
        }
        // jump buffer + coyote time + wall jump; letting go early cuts the jump short
        p.buffer = ok && jumpHit ? BUFFER : Math.max(0, p.buffer - dt);
        p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
        const boost = (p.jumpT > 0 ? 1.32 : 1) * map.jumpK;
        if (p.buffer > 0) {
          if (p.coyote > 0) {
            p.vy = -JUMP * boost; p.buffer = 0; p.coyote = 0; p.ground = false; p.onM = -1; p.sq = 1.28;
            api.sfx('jump'); dust(p.x + p.w / 2, p.y + p.h, 3);
          } else if (p.wallL || p.wallR) {
            const away = p.wallL ? 1 : -1;
            p.vx = away * 240; p.vy = -JUMP * 0.95 * boost; p.face = away; p.lock = 0.16; p.buffer = 0; p.sq = 1.22;
            api.sfx('jump'); dust(p.x + (p.wallL ? 0 : p.w), p.y + p.h / 2, 3);
          }
        }
        if (inp.down && p.ground && surf === '-') { p.dropT = 0.22; p.ground = false; p.onM = -1; p.y += 1; }
        let g = GRAV * map.grav;
        if (p.vy >= 0) p.bounce = false;
        if (p.vy < 0 && !p.bounce && !inp.up) g *= 2.5;
        else if (p.vy > 0) g *= 1.12;
        p.vy = Math.min(MAX_FALL * (map.grav < 1 ? 0.7 : 1), p.vy + g * dt);
        if (!p.ground && p.vy > 0 && ((p.wallL && dir < 0) || (p.wallR && dir > 0))) {
          p.vy = Math.min(p.vy, 75);
          if (Math.random() < dt * 14) dust(p.x + (p.wallL ? 0 : p.w), p.y + p.h * 0.7, 1);
        }
        const conv = surf === '>' ? CONV : surf === '<' ? -CONV : 0;
        p.ground = false; p.onM = -1;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx) + Math.abs(conv), Math.abs(p.vy)) * dt / 5));
        for (let i = 0; i < n; i++) { moveX(p, (p.vx + conv) * dt / n); moveY(p, p.vy * dt / n); wrap(p); }
        p.wallL = !p.ground && solidBox(p.x - 1, p.y + 2, 1, p.h - 4);
        p.wallR = !p.ground && solidBox(p.x + p.w, p.y + 2, 1, p.h - 4);
        const sc = Math.floor((p.x + p.w / 2) / T), sr = Math.floor((p.y + p.h - 1) / T);
        if (tile(sc, sr) === '^' && p.vy >= 0 && !p.dead) {
          p.vy = -SPRING * Math.sqrt(map.grav) * (p.jumpT > 0 ? 1.1 : 1); p.bounce = true; p.ground = false; p.onM = -1; p.sq = 1.35;
          springs[sc + ',' + sr] = clock; api.sfx('power');
        }
        const di = doorAt(p);
        if (di >= 0 && di !== p.door && !p.dead) {
          const to = map.doors[map.doors[di].to];
          burst(p.x + p.w / 2, p.y + p.h / 2, 8, '#9b6dd6');
          p.x = to.x - p.w / 2; p.y = to.y - p.h - 1; p.vy = Math.min(p.vy, 0); p.door = map.doors[di].to;
          burst(to.x, to.y - 12, 8, '#3fa7c9'); api.sfx('merge');
        } else if (di < 0) p.door = -1;
      }
      const wrapD = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
      function touching(a, b) {
        return Math.abs(wrapD(b.x + b.w / 2 - a.x - a.w / 2, W)) < (a.w + b.w) / 2 - 1 && Math.abs(wrapD(b.y + b.h / 2 - a.y - a.h / 2, H)) < (a.h + b.h) / 2 - 1;
      }
      function checkTag() {
        if (tagCool > 0) return;
        const a = P(it), b = P(other(it));
        if (a.dead || b.dead || !touching(a, b)) return;
        const push = Math.sign(wrapD(a.x - b.x, W)) || 1;
        if (b.shieldT > 0) {   // a shield soaks up one tag
          b.shieldT = 0; tagCool = 0.9; a.vx = push * 260; a.vy = Math.min(a.vy, -180); b.vx = -push * 200;
          api.sfx('drop'); burst(b.x + b.w / 2, b.y + b.h / 2, 12, POWERS.shield.color);
          floaters.push({ text: 'Blocked', x: b.x + b.w / 2, y: b.y - 14, t: 0, color: POWERS.shield.color }); return;
        }
        it = b.id; tagCool = TAG_COOL;
        b.frozen = Math.max(b.frozen, TAG_STUN);
        a.vx = push * 220; a.vy = Math.min(a.vy, -200);
        api.sfx('hit'); flash = 1; if (!api.reduceMotion) shake = 0.5;
        burst(b.x + b.w / 2, b.y + b.h / 2, 12, pcol(b.id, api.colors()));
        floaters.push({ text: label(it) + ' is it', x: b.x + b.w / 2, y: b.y - 14, t: 0, color: null });
      }
      function usePower(p) {
        const o = P(other(p.id)), type = p.hold, pw = POWERS[type];
        let text = pw.label; p.hold = null;
        if (type === 'speed') p.speedT = pw.time;
        else if (type === 'jump') p.jumpT = pw.time;
        else if (type === 'ghost') p.ghostT = pw.time;
        else if (type === 'shrink') p.shrinkT = pw.time;
        else if (type === 'shield') p.shieldT = pw.time;
        else if (type === 'freeze') {
          if (o.shieldT > 0) { o.shieldT = 0; text = 'Shield blocked it'; }
          else { o.frozen = Math.max(o.frozen, pw.time); o.vx = 0; text = label(o.id) + ' frozen'; }
        } else if (type === 'swap') {
          const ax = p.x + p.w / 2, ay = p.y + p.h, bx = o.x + o.w / 2, by = o.y + o.h;
          burst(ax, ay - 8, 10, pw.color); burst(bx, by - 8, 10, pw.color);
          p.x = bx - p.w / 2; p.y = by - p.h; o.x = ax - o.w / 2; o.y = ay - o.h;
          [p.vx, o.vx, p.vy, o.vy] = [o.vx, p.vx, o.vy, p.vy];
          [p.onM, o.onM] = [o.onM, p.onM]; p.door = doorAt(p); o.door = doorAt(o);
          tagCool = Math.max(tagCool, 0.35); text = 'Swap';
        }
        api.sfx('power'); burst(p.x + p.w / 2, p.y + p.h / 2, 10, pw.color);
        floaters.push({ text, x: p.x + p.w / 2, y: p.y - 14, t: 0, color: pw.color });
      }
      function spawnItem() {
        const free = map.spots.filter(s => !items.some(i => i.x === s.x && i.y === s.y) &&
          players.every(p => Math.hypot(p.x + p.w / 2 - s.x, p.y + p.h / 2 - s.y) > 60));
        if (!free.length) return;
        const s = api.pick(free); items.push({ x: s.x, y: s.y, type: api.pick(PKEYS), t: 0 });
      }
      function pickups() {
        items = items.filter(i => {
          const p = players.find(q => !q.dead && !q.hold && Math.abs(q.x + q.w / 2 - i.x) < q.w / 2 + 8 && Math.abs(q.y + q.h / 2 - i.y) < q.h / 2 + 8);
          if (!p) return true;
          p.hold = i.type; api.sfx('eat'); burst(i.x, i.y, 8, POWERS[i.type].color);
          floaters.push({ text: label(p.id) + ' got ' + POWERS[i.type].label, x: i.x, y: i.y - 12, t: 0, color: POWERS[i.type].color });
          return false;
        });
      }
      function endRound() {
        const loser = P(it), win = other(it);
        timer = 0; wins[win]++; api.score(Math.max(wins.p1, wins.p2)); loser.dead = true;
        burst(loser.x + loser.w / 2, loser.y + loser.h / 2, 34, pcol(loser.id, api.colors()));
        api.sfx('boom'); if (!api.reduceMotion) shake = 1;
        phase = wins[win] >= firstTo() ? 'over' : 'end'; phaseT = phase === 'over' ? 1.0 : END_T; pads.clear();
      }
      function update(dt) {
        clock += dt; shake = Math.max(0, shake - dt * 2.5); flash = Math.max(0, flash - dt * 3);
        if (phase === 'menu') return;
        mt += dt; placeMovers(map, mt);
        players.forEach(p => { if (p.onM >= 0) carry(p); });
        if (phase === 'count') {
          phaseT -= dt;
          const n = Math.ceil(phaseT / (COUNT / 3));
          if (n !== lastTick && n > 0) { lastTick = n; api.sfx('tick'); }
          players.forEach(p => step(p, false, dt));
          if (phaseT <= 0) { phase = 'play'; api.sfx('score'); lastTick = -1; floaters.push({ text: 'Go', x: W / 2, y: H / 2, t: 0, color: null, big: true }); }
        } else if (phase === 'play') {
          timer -= dt; tagCool = Math.max(0, tagCool - dt);
          const s = Math.ceil(timer);
          if (s <= 10 && s !== lastTick && s > 0) { lastTick = s; api.sfx('tick'); }
          players.forEach(p => step(p, true, dt));
          checkTag();
          itemT -= dt;
          if (itemT <= 0) { if (items.length < 2) spawnItem(); itemT = api.rand(5, 8); }
          pickups();
          if (timer <= 0) endRound();
        } else {
          phaseT -= dt;
          players.forEach(p => step(p, phase === 'end' && !p.dead, dt));
          if (phase === 'end' && phaseT <= 0) { round++; startRound(); }
          if (phase === 'over' && phaseT <= 0 && !overCalled) {
            overCalled = true;
            const win = wins.p1 > wins.p2 ? 'p1' : 'p2';
            api.over({ score: wins[win], won: true, title: label(win) + ' wins', message: `Rounds ${Math.max(wins.p1, wins.p2)} to ${Math.min(wins.p1, wins.p2)}` });
          }
        }
        items.forEach(i => { i.t += dt; }); floaters.forEach(f => { f.t += dt; }); floaters = floaters.filter(f => f.t < 1.1);
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; q.life -= dt * 1.6; }); parts = parts.filter(q => q.life > 0);
      }
      function dust(x, y, n) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, life: 0.5, size: 2 + Math.random() * 2, color: null });
      }
      function burst(x, y, n, color) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1, size: 2 + Math.random() * 3, color });
        }
      }
      // ---------- drawing the match ----------
      function drawPlayer(p, col, ox, oy) {
        const color = pcol(p.id, col), x = p.x + p.w / 2 + ox, yb = p.y + p.h + oy, k = p.w / PW;
        if (p.dead) {   // caught when the clock ran out: a flattened splat with crossed eyes
          ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.ellipse(x, yb - 3, PW * 0.95, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fffaf3'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
          [-3, 3].forEach(dx => { ctx.beginPath(); ctx.moveTo(x + dx - 1.5, yb - 4.5); ctx.lineTo(x + dx + 1.5, yb - 1.5); ctx.moveTo(x + dx + 1.5, yb - 4.5); ctx.lineTo(x + dx - 1.5, yb - 1.5); ctx.stroke(); });
          ctx.restore(); return;
        }
        const sh = p.h * p.sq, sw = p.w / Math.sqrt(p.sq), ghost = p.ghostT > 0;
        ctx.save();
        if (p.id === it && !ghost && (phase === 'play' || phase === 'count')) {
          ctx.fillStyle = col.bad || '#d9534f'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(clock * 8);
          ctx.beginPath(); ctx.arc(x, yb - p.h / 2, 16 * k, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        if (p.speedT > 0 && Math.abs(p.vx) > 40 && !ghost) {
          ctx.strokeStyle = POWERS.speed.color; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - p.face * 9, yb - 4 - i * 4); ctx.lineTo(x - p.face * (16 + i * 3), yb - 4 - i * 4); ctx.stroke(); }
        }
        if (ghost) {   // invisible: only a flickery dashed outline
          ctx.globalAlpha = Math.random() < 0.15 ? 0.05 : 0.3 + 0.25 * Math.sin(clock * 17);
          ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.setLineDash([3, 3]); ctx.lineDashOffset = clock * 20;
          D.roundRect(ctx, x - sw / 2, yb - sh, sw, sh, 4.5 * k); ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.fillStyle = color; D.roundRect(ctx, x - sw / 2, yb - sh, sw, sh, 4.5 * k); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.22)'; D.roundRect(ctx, x - sw / 2 + 2, yb - sh + 2, sw - 4, 3 * k, 1.5); ctx.fill();
          const ex = x + p.face * 2.2 * k, ey = yb - sh * 0.62;
          ctx.fillStyle = '#fffaf3'; ctx.beginPath(); ctx.arc(ex - 2.4 * k, ey, 2.1 * k, 0, 7); ctx.arc(ex + 2.4 * k, ey, 2.1 * k, 0, 7); ctx.fill();
          ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(ex - 2.4 * k + p.face * 0.8 * k, ey + 0.3, 1.05 * k, 0, 7); ctx.arc(ex + 2.4 * k + p.face * 0.8 * k, ey + 0.3, 1.05 * k, 0, 7); ctx.fill();
        }
        if (p.shieldT > 0 && !ghost) {
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(clock * 6); ctx.strokeStyle = POWERS.shield.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, yb - p.h / 2, Math.max(p.w, p.h) * 0.8, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (p.frozen > 0) {
          ctx.fillStyle = 'rgba(170,220,240,0.55)'; ctx.strokeStyle = '#e9f7fc'; ctx.lineWidth = 1.2;
          D.roundRect(ctx, x - p.w / 2 - 3, yb - p.h - 3, p.w + 6, p.h + 4, 3); ctx.fill(); ctx.stroke();
          if (p.id === it && p.frozen <= TAG_STUN + 0.01) for (let i = 0; i < 3; i++) { const a = clock * 7 + i * 2.1; D.spark(ctx, x + Math.cos(a) * 9, yb - p.h - 4 + Math.sin(a) * 2.5, 2.5, '#e0a526', 0); }
        }
        // "IT" tag over the head (with the no-tag-back ring while it cools down), then active power timers
        let top = yb - sh - 6;
        if (p.id === it && phase !== 'over') {
          const bob = api.reduceMotion ? 0 : Math.sin(clock * 6) * 1.5, ty = top - 8 + bob;
          ctx.globalAlpha = ghost ? 0.3 : 1;
          ctx.fillStyle = col.bad || '#d9534f'; D.roundRect(ctx, x - 11, ty - 7, 22, 14, 5); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 3.5, ty + 6.5); ctx.lineTo(x + 3.5, ty + 6.5); ctx.lineTo(x, ty + 10.5); ctx.fill();
          D.text(ctx, 'IT', x, ty + 0.5, 9.5, '#fffaf3', 850);
          if (tagCool > 0 && phase === 'play') { ctx.strokeStyle = col.ink3; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, ty, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (tagCool / TAG_COOL)); ctx.stroke(); }
          top = ty - 11;
        }
        const fx = TIMED.filter(f => p[f] > 0 && !(f === 'shrinkT' && p[f] < 0.1));
        fx.forEach((f, i) => {
          const type = f.slice(0, -1), ix = x + (i - (fx.length - 1) / 2) * 13, left = Math.min(1, p[f] / POWERS[type].time);
          ctx.globalAlpha = ghost ? 0.35 : 1; ctx.fillStyle = POWERS[type].color;
          ctx.beginPath(); ctx.arc(ix, top - 2, 4.8, 0, 7); ctx.fill();
          ctx.strokeStyle = POWERS[type].color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(ix, top - 2, 6.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
          powerIcon(ctx, type, ix, top - 2, 3.7);
        });
        ctx.restore();
      }
      function drawField(col) {
        sky(ctx, map, col);
        ctx.save(); D.roundRect(ctx, 0, 0, W, H, 12); ctx.clip();
        decor(ctx, map, col, api.reduceMotion ? 0 : clock);
        drawTiles(ctx, map, col, api.reduceMotion ? 0 : clock, springs);
        items.forEach(i => {
          const k = Math.min(1, i.t / 0.3), s = api.reduceMotion ? 1 : D.ease.outBack(k), y = i.y + (api.reduceMotion ? 0 : Math.sin(i.t * 3.5) * 2);
          ctx.save(); ctx.translate(i.x, y); ctx.scale(s, s);
          ctx.globalAlpha = 0.25; ctx.fillStyle = POWERS[i.type].color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.fill();
          ctx.strokeStyle = '#fffaf3'; ctx.lineWidth = 1.2; ctx.stroke();
          powerIcon(ctx, i.type, 0, 0, 6); ctx.restore();
        });
        players.forEach(p => {   // wrapped copies near open edges
          const xs = [0], ys = [0];
          if (p.x < PW * 2) xs.push(W); if (p.x > W - PW * 3) xs.push(-W);
          if (p.y < PH * 2) ys.push(H); if (p.y > H - PH * 3) ys.push(-H);
          xs.forEach(ox => ys.forEach(oy => drawPlayer(p, col, ox, oy)));
        });
        parts.forEach(q => {
          ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2)); ctx.fillStyle = q.color || (col.dark ? '#8a7f73' : '#bfae96');
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, 7); ctx.fill();
        });
        ctx.globalAlpha = 1;
        floaters.forEach(f => {
          ctx.globalAlpha = Math.max(0, Math.min(1, (1.1 - f.t) * 3));
          if (f.big) { const s = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, f.t * 4)); D.text(ctx, f.text, f.x, f.y, 52 * s, col.accent, 800); }
          else D.text(ctx, f.text, f.x, f.y - f.t * 22, 11, f.color || col.ink, 750);
        });
        ctx.globalAlpha = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.18})`; ctx.fillRect(0, 0, W, H); }
        overlays(col);
        ctx.restore();
      }
      function scoreCard(col, y, big, small) {
        ctx.save();
        const bw = 290, bh = 92, x = W / 2 - bw / 2;
        ctx.fillStyle = col.surface || '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        D.roundRect(ctx, x, y - bh / 2, bw, bh, 18); ctx.fill(); ctx.shadowColor = 'transparent';
        D.text(ctx, big, W / 2, y - 28, 17, col.ink, 800);
        D.text(ctx, small, W / 2, y - 9, 11.5, col.ink2, 650);
        D.avatar(ctx, x + 40, y + 22, 13, 'p1', col); D.avatar(ctx, x + bw - 40, y + 22, 13, 'p2', col);
        D.text(ctx, 'P1', x + 62, y + 22, 11, col.ink2, 700, 'left'); D.text(ctx, 'P2', x + bw - 62, y + 22, 11, col.ink2, 700, 'right');
        D.text(ctx, `${wins.p1}  :  ${wins.p2}`, W / 2, y + 22, 22, col.ink, 850);
        D.text(ctx, `first to ${firstTo()}`, W / 2, y + 39, 9, col.ink3, 650);
        ctx.restore();
      }
      function overlays(col) {
        if (phase === 'count') {
          const n = Math.max(1, Math.ceil(phaseT / (COUNT / 3))), k = 1 - ((phaseT / (COUNT / 3)) % 1 || 1);
          const s = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, k * 3));
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,250,243,0.35)'; ctx.fillRect(0, 0, W, H);
          ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.scale(s, s); D.text(ctx, String(n), 0, 0, 64, col.accent, 800); ctx.restore();
          D.text(ctx, `${label(it)} is it`, W / 2, H * 0.4 + 50, 17, pcol(it, col), 800);
          D.text(ctx, `Round ${round + 1} · ${map.name} · ${MAPS[map.i].note}`, W / 2, H * 0.4 + 72, 12, col.ink2, 650);
        } else if (phase === 'play' && timer <= 10) {   // the last ten seconds count down big
          const n = Math.max(1, Math.ceil(timer)), f = n - timer, s = api.reduceMotion ? 1 : 1.25 - 0.25 * D.ease.outCubic(Math.min(1, f * 2.5));
          ctx.save(); ctx.globalAlpha = 0.28 + 0.12 * (1 - f); ctx.translate(W / 2, H / 2); ctx.scale(s, s);
          D.text(ctx, String(n), 0, 0, 150, col.bad || '#d9534f', 850); ctx.restore();
        } else if (phase === 'end') {
          scoreCard(col, H * 0.42, `${label(other(it))} takes the round`, `${label(it)} was it when time ran out`);
        } else if (phase === 'over') {
          const win = wins.p1 > wins.p2 ? 'p1' : 'p2', wp = P(win);
          if (!wp.dead) D.spark(ctx, wp.x + wp.w / 2, wp.y - 10 + Math.sin(clock * 5) * 1.5, 7, '#e0a526', clock * 2);
          scoreCard(col, H * 0.36, `${label(win)} wins the match`, `${label(it)} was it at the final whistle`);
        }
      }
      function drawHeader(col) {
        const w = view.w;
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: 'p1', label: 'P1', pips: wins.p1, of: firstTo() },
          right: { who: 'p2', label: 'P2', pips: wins.p2, of: firstTo() },
          turn: phase === 'play' || phase === 'count' ? (it === 'p1' ? 'left' : 'right') : null
        }, col);
        const pw = Math.min(132, (w - 20) * 0.34);
        players.forEach(p => {   // held power-up slot next to each player's panel
          const sx = p.id === 'p1' ? 10 + pw + 18 : w - 10 - pw - 18, sy = 28;
          ctx.save();
          if (p.hold) {
            ctx.fillStyle = POWERS[p.hold].color; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fill();
            powerIcon(ctx, p.hold, sx, sy, 7.5);
            D.text(ctx, p.id === 'p1' ? 'F' : '/', sx + (p.id === 'p1' ? 16 : -16), sy + 6, 9, col.ink3, 750);
          } else { ctx.strokeStyle = col.line; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sx, sy, 10, 0, 7); ctx.stroke(); }
          ctx.restore();
        });
        const secs = Math.max(0, Math.ceil(timer)), hot = phase === 'play' && secs <= 10;
        const ts = hot && !api.reduceMotion ? 1 + 0.12 * Math.max(0, Math.sin(clock * Math.PI * 2)) : 1;
        D.text(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, w / 2, 22, 17 * ts, hot ? (col.bad || '#d9534f') : col.ink, 800);
        D.text(ctx, map.name, w / 2, 40, 9.5, col.ink3, 650);
      }
      function render() {
        const col = api.colors(), { w, h } = view; ctx.clearRect(0, 0, w, h);
        if (phase === 'menu') { drawMenu(col); return; }
        drawHeader(col);
        const top = 54, avail = h - top - 8, s = Math.min((w - 16) / W, avail / H);
        const ox = (w - W * s) / 2, oy = top + Math.max(0, (avail - H * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 6 * shake);
        drawField(col); ctx.restore();
      }
      // ---------- save / restore ----------
      const PF = ['x', 'y', 'vx', 'vy', 'face', 'frozen', 'speedT', 'jumpT', 'ghostT', 'shrinkT', 'shieldT'];
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        if (phase === 'menu') return null;   // still picking a scene: nothing to resume
        return { v: 2, phase, sel: { map: sel.map, time: sel.time, rounds: sel.rounds }, focus: { row: focus.row, col: focus.col },
          mapIdx, round, wins: { p1: wins.p1, p2: wins.p2 }, it, firstIt, timer, phaseT, itemT, tagCool, mt,
          items: items.map(i => ({ x: i.x, y: i.y, type: i.type })),
          ps: players.map(p => { const o = { hold: p.hold, dead: p.dead, onM: p.onM }; PF.forEach(k => { o[k] = p[k]; }); return o; })
        };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v), int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
        if (!s || s.v !== 2 || !s.sel || !int(s.sel.map, -1, MAPS.length - 1) || !int(s.sel.time, 0, 2) || !int(s.sel.rounds, 0, 2)) return false;
        if (!['menu', 'count', 'play', 'end'].includes(s.phase)) return false;
        const sl = { map: s.sel.map, time: s.sel.time, rounds: s.sel.rounds }, fc = s.focus && int(s.focus.row, 0, 9) && int(s.focus.col, 0, 9) ? { row: s.focus.row, col: s.focus.col } : { row: 1, col: 0 };
        if (s.phase !== 'menu') {
          const ft = ROUNDS[sl.rounds];
          if (!int(s.mapIdx, 0, MAPS.length - 1) || !int(s.round, 0, 20) || !s.wins || !int(s.wins.p1, 0, ft - 1) || !int(s.wins.p2, 0, ft - 1)) return false;
          if (!['p1', 'p2'].includes(s.it) || !['p1', 'p2'].includes(s.firstIt) || ![s.timer, s.phaseT, s.itemT, s.tagCool, s.mt].every(num)) return false;
          if (!Array.isArray(s.ps) || s.ps.length !== 2 || !s.ps.every(p => p && PF.every(k => num(p[k])) && (p.hold === null || POWERS[p.hold])) || !Array.isArray(s.items)) return false;
          mapIdx = s.mapIdx; map = buildMap(mapIdx); mt = s.mt; placeMovers(map, mt); map.movers.forEach(m => { m.ddx = 0; m.ddy = 0; });
          round = s.round; wins = { p1: s.wins.p1, p2: s.wins.p2 }; it = s.it; firstIt = s.firstIt;
          timer = s.timer; phaseT = s.phaseT; itemT = s.itemT; tagCool = s.tagCool;
          items = s.items.filter(i => i && num(i.x) && num(i.y) && POWERS[i.type]).slice(0, 3).map(i => ({ x: i.x, y: i.y, type: i.type, t: 1 }));
          players = ['p1', 'p2'].map((id, k) => {
            const p = newPlayer(id), q = s.ps[k]; PF.forEach(f => { p[f] = q[f]; });
            p.hold = q.hold || null; p.dead = !!q.dead; p.onM = int(q.onM, -1, map.movers.length - 1) ? q.onM : -1;
            p.w = p.shrinkT > 0 ? SW : PW; p.h = p.shrinkT > 0 ? SH : PH; p.door = doorAt(p); return p;
          });
          api.score(Math.max(wins.p1, wins.p2));
        }
        sel = sl; focus = fc; phase = s.phase;
        return true;
      }
      // A restored game counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (window.ludusDebug) window.ludusDebug.tag = () => ({ phase, focus, sel, mapIdx, map: map.name, it, wins, timer, tagCool, round, mt,
        items: items.map(i => ({ x: i.x, y: i.y, type: i.type })), menu: phase === 'menu' ? menuLayout().tiles.map(t => [t.x, t.y, t.w, t.h, t.map]) : null,
        ps: players.map(p => ({ x: p.x, y: p.y, w: p.w, vx: p.vx, vy: p.vy, ground: p.ground, surf: p.surf, onM: p.onM, frozen: p.frozen, hold: p.hold, dead: p.dead,
          speedT: p.speedT, jumpT: p.jumpT, ghostT: p.ghostT, shrinkT: p.shrinkT, shieldT: p.shieldT })) });
      api.loop(dt => { if (!api.ended || phase === 'over') update(dt); render(); });
      return { save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
