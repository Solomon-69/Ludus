/* Crates: push every crate onto a marked spot. Every run is different: the levels are made on the page from a random seed by playing
   the puzzle backwards (pulling crates away from their spots), so every level is solvable by construction (and checked by replaying
   the recorded solution). A run is a block of 10 levels, then a completely different block of 15; the dots under the board show the
   current block and start blank for each block. Play again after the end starts a new run with a new seed. Nothing is fetched: it all
   runs offline. The 15 hand-made levels below are only the fallback if a level could ever not be made. */
(function () {
  const D = Ludus.draw;
  // # wall, . spot, $ crate, * crate on spot, @ you, + you on spot. par = moves in a known solution.
  const LEVELS = [
    { m: [' #####', ' #   #', ' #@$.#', ' #   #', ' #####'], par: 1 },
    { m: ['#######', '#     #', '# $ $ #', '#. @ .#', '#######'], par: 13 },
    { m: ['  ####', '###  #', '#. $ #', '# #  #', '#. $ ##', '#  @  #', '#######'], par: 12 },
    { m: ['########', '#  .   #', '# $##$ #', '#  @.  #', '########'], par: 18 },
    { m: [' ######', '##    #', '# $## #', '# .$. #', '#  @ ##', '##.$ #', ' #   #', ' #####'], par: 23 },
    { m: ['  ######', '  #    #', '### $$ #', '#  .$  #', '# #..# #', '#    @ #', '########'], par: 21 },
    { m: [' #######', ' #  .  #', '## $#$ ##', '#   @   #', '# . $ . #', '#       #', '#########'], par: 32 },
    { m: ['  #####', '###   ###', '#   $ $ #', '# #.#.# #', '#  . .  #', '## $#$ ##', ' #  @  #', ' #######'], par: 52 },
    { m: ['#######', '#.   .#', '# $#$ #', '#  @  #', '# $#$ #', '#.   .#', '#######'], par: 49 },
    { m: [' #######', '##  .  ##', '#  $#$  #', '# . @ . #', '#  $#$  #', '##  .  ##', ' #######'], par: 53 },
    { m: ['#######', '#  .  #', '# $$$ #', '#.# #.#', '# $@  #', '#  .  #', '#######'], par: 56 },
    { m: [' ########', ' #   #  #', ' # $  $ #', '##.###. #', '#  $ @  #', '# .###. #', '#  $    #', '#####   #', '    #####'], par: 61 },
    { m: ['#########', '#   #   #', '# $ . $ #', '#  ###  #', '#.  @  .#', '#  ###  #', '# $ . $ #', '#   #   #', '#########'], par: 74 },
    { m: ['########', '#   #  #', '# $  $ #', '#.##.# #', '#  $   #', '#. #.$ #', '#   @  #', '########'], par: 60 },
    { m: ['#########', '#.. #   #', '#.. $ $ #', '#   # $ #', '##  $ @ #', ' #      #', ' ########'], par: 57 }
  ];
  const CRATE = '#c99a5b', CRATE_DARK = '#a77a42';
  const HARD_UNDOS = 5;

  function parse(rows) {
    const H = rows.length, W = Math.max(...rows.map(r => r.length));
    const wall = [], goal = [], floor = []; const boxes = []; let player = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = rows[y][x] || ' ', i = y * W + x;
      wall[i] = ch === '#'; goal[i] = '.*+'.includes(ch);
      if ('$*'.includes(ch)) boxes.push(i);
      if ('@+'.includes(ch)) player = i;
    }
    // floor = reachable inside cells (flood from the player through non-walls)
    const q = [player]; floor[player] = true;
    while (q.length) {
      const c = q.pop();
      [-W, W, -1, 1].forEach(d => { const n = c + d; if (n >= 0 && n < W * H && !wall[n] && !floor[n]) { floor[n] = true; q.push(n); } });
    }
    return { W, H, wall, goal, floor, boxes, player };
  }


  // ---------- level maker (seeded, offline) ----------
  const BLOCK_LENS = [10, 15];
  const blockLen = b => BLOCK_LENS[b % 2];
  const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mix = (...n) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 2246822519); h ^= h >>> 16; } return h >>> 0; };
  const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], DCH = 'UDLR';   // opposite of d is d ^ 1

  // play the solution on a level (own rules): true when every crate ends on a spot
  function replay(rows, sol) {
    const m = parse(rows), W = m.W, boxes = m.boxes.slice(); let p = m.player;
    for (const ch of sol) {
      const d = DCH.indexOf(ch); if (d < 0) return false;
      const delta = DY[d] * W + DX[d], to = p + delta;
      if (m.wall[to]) return false;
      const bi = boxes.indexOf(to);
      if (bi >= 0) { const nb = to + delta; if (m.wall[nb] || boxes.includes(nb)) return false; boxes[bi] = nb; }
      p = to;
    }
    return boxes.every(b => m.goal[b]);
  }
  // fewest moves, searched breadth-first up to a node cap (-1 when the cap is hit)
  function bestMoves(rows, cap) {
    const m = parse(rows), W = m.W, key = (p, bs) => p + ':' + bs.slice().sort((a, b) => a - b).join(',');
    let cur = [{ p: m.player, bs: m.boxes }]; const seen = new Set([key(m.player, m.boxes)]); let n = 0;
    for (let depth = 0; cur.length; depth++) {
      const next = [];
      for (const st of cur) {
        if (st.bs.every(b => m.goal[b])) return depth;
        for (let d = 0; d < 4; d++) {
          const delta = DY[d] * W + DX[d], to = st.p + delta; if (m.wall[to]) continue;
          let bs = st.bs; const bi = bs.indexOf(to);
          if (bi >= 0) { const nb = to + delta; if (m.wall[nb] || bs.includes(nb)) continue; bs = bs.slice(); bs[bi] = nb; }
          const k = key(to, bs); if (seen.has(k)) continue;
          if (++n > cap) return -1;
          seen.add(k); next.push({ p: to, bs });
        }
      }
      cur = next;
    }
    return -1;
  }
  // one try: a room with a few blocks in it, crates on their spots, then random backwards play (walk, or pull a crate along)
  function makeOnce(rnd, W, H, k, obst, minPulls) {
    const wall = new Array(W * H).fill(true);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) wall[y * W + x] = false;
    for (let n = 0; n < obst; n++) wall[(1 + Math.floor(rnd() * (H - 2))) * W + 1 + Math.floor(rnd() * (W - 2))] = true;
    let start = wall.findIndex(w => !w); if (start < 0) return null;
    const seen = new Set([start]), q = [start];
    while (q.length) { const c = q.pop(); for (let d = 0; d < 4; d++) { const n = c + DY[d] * W + DX[d]; if (!wall[n] && !seen.has(n)) { seen.add(n); q.push(n); } } }
    for (let i = 0; i < wall.length; i++) if (!wall[i] && !seen.has(i)) wall[i] = true;
    const free = [...seen]; if (free.length < k * 3 + 4) return null;
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    const goals = free.slice(0, k), boxes = goals.slice(), occ = new Array(W * H).fill(-1);
    boxes.forEach((b, i) => { occ[b] = i; });
    let player = free[k], dir = Math.floor(rnd() * 4), pulls = 0; const rev = [];
    const steps = W * H * 30;
    for (let st = 0; st < steps && (pulls < minPulls || st < W * H * 5); st++) {
      if (rnd() < 0.28) dir = Math.floor(rnd() * 4);
      const delta = DY[dir] * W + DX[dir], to = player + delta, behind = player - delta;
      if (wall[to] || occ[to] >= 0) { dir = Math.floor(rnd() * 4); continue; }
      const pull = occ[behind] >= 0 && rnd() < 0.85;
      if (pull) { const b = occ[behind]; occ[behind] = -1; occ[player] = b; boxes[b] = player; pulls++; }
      player = to; rev.push(dir);
    }
    if (pulls < minPulls || boxes.filter((b, i) => b === goals[i]).length > 0 || new Set(boxes.map(b => (goals.includes(b) ? 1 : 0))).has(1)) return null;
    const sol = rev.reverse().map(d => DCH[d ^ 1]).join('');
    const rows = [];
    for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) { const i = y * W + x, g = goals.includes(i), b = boxes.includes(i), pl = i === player; r += wall[i] ? '#' : b ? (g ? '*' : '$') : pl ? (g ? '+' : '@') : g ? '.' : ' '; } rows.push(r); }
    return { m: rows, sol };
  }
  const levelCache = new Map();
  // level i of block b in the run with this seed (the same everywhere for the same seed)
  function makeLevel(seed, b, i) {
    const ck = seed + '/' + b + '/' + i; if (levelCache.has(ck)) return levelCache.get(ck);
    const n = blockLen(b), t = n > 1 ? i / (n - 1) : 0, d = Math.min(1, 0.05 + t * 0.8 + (b % 2) * 0.15);
    const rnd = mulberry(mix(seed, b, i, 7)); let out = null;
    for (let a = 0; a < 300 && !out; a++) {
      const k = Math.max(1, 1 + Math.floor(d * 3.6) - (a > 150 ? 1 : 0)), W = 6 + Math.round(d * 3) + Math.floor(rnd() * 3), H = 5 + Math.round(d * 2.5) + Math.floor(rnd() * 3);
      const obst = Math.floor((W - 2) * (H - 2) * (0.06 + d * 0.1)) + 1 + Math.floor(rnd() * 2), minPulls = 4 + k * 5 + Math.floor(d * 12);
      const r = makeOnce(rnd, W, H, k, obst, minPulls);
      if (r && replay(r.m, r.sol)) { const best = bestMoves(r.m, 30000); out = { m: r.m, sol: r.sol, par: best > 0 ? best : Math.max(1, Math.floor(r.sol.length * 0.6)) }; }
    }
    if (!out) { const f = LEVELS[(i + b * 7) % LEVELS.length]; out = { m: f.m, sol: '', par: f.par }; }
    levelCache.set(ck, out); if (levelCache.size > 80) levelCache.delete(levelCache.keys().next().value);
    return out;
  }
  const newSeed = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; } catch (e) { return Math.floor(Math.random() * 2147483647); } };

  Ludus.register({
    id: 'crates', name: 'Crate Push', aka: 'Crates', tag: 'Puzzle', tint: '#b5894f',
    hint: '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or click to walk and push · <kbd>Z</kbd> undo · <kbd>R</kbd> restart level · <kbd>B</kbd>/<kbd>N</kbd> previous/next level',
    _levels: LEVELS.map(l => l.m),
    _make: makeLevel, _replay: replay, _blockLen: blockLen,
    art(ctx, w, h) {
      const s = Math.min(h * 0.28, w / 10.5), cols = 9, rows = 3;
      const ox = (w - cols * s) / 2, oy = (h - rows * s) / 2;
      const cell = (c, r) => [ox + c * s, oy + r * s];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const [x, y] = cell(c, r);
        const wall = (r === 0 && c !== 4 && c !== 5) || (r === 2 && (c < 3 || c === 8));
        if (wall) {
          ctx.fillStyle = 'rgba(70,45,20,0.42)'; D.roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.14); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 2, y + s / 2); ctx.lineTo(x + s - 2, y + s / 2); ctx.moveTo(x + s * (r % 2 ? 0.3 : 0.7), y + 2); ctx.lineTo(x + s * (r % 2 ? 0.3 : 0.7), y + s / 2); ctx.stroke();
        } else {
          ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)';
          D.roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.14); ctx.fill();
        }
      }
      const crate = (c, r, on) => {
        const [x, y] = cell(c, r), p = s * 0.12;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; D.roundRect(ctx, x + p, y + p + s * 0.07, s - 2 * p, s - 2 * p, s * 0.16); ctx.fill();
        ctx.fillStyle = on ? '#bfe3a8' : '#f6e3c4'; D.roundRect(ctx, x + p, y + p, s - 2 * p, s - 2 * p, s * 0.16); ctx.fill();
        ctx.strokeStyle = on ? '#4f8d4a' : '#b5894f'; ctx.lineWidth = Math.max(1.5, s * 0.1); ctx.lineCap = 'round';
        const a = x + s * 0.3, b = x + s * 0.7, d = y + s * 0.3, e = y + s * 0.7;
        ctx.beginPath(); ctx.moveTo(a, d); ctx.lineTo(b, e); ctx.moveTo(b, d); ctx.lineTo(a, e); ctx.stroke();
      };
      const [tx, ty] = cell(6, 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.8; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(tx + s / 2, ty + s / 2, s * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      crate(7, 1, true); crate(4, 1, false);
      const [px, py] = cell(1, 1);
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill();
      D.spark(ctx, px + s / 2, py + s / 2, s * 0.3, '#d97757', 0.2);
    },
    create(stage, api) {
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx, canvas } = view;
      let seed = newSeed(), block = 0, solvedN = 0, cur = null, lvl = 0, map, boxes, player, moves, pushes, hist, undos, score, solvedAt = -1, clock = 0, walkQ = [];
      let anim = null, facing = 1, bump = 0, done = false;
      const lay = { cell: 32, ox: 0, oy: 0 };
      let buttons = [];

      function load(i, keep) {
        lvl = Math.max(0, Math.min(blockLen(block) - 1, i));
        cur = makeLevel(seed, block, lvl);
        map = parse(cur.m);
        boxes = map.boxes.slice(); player = map.player;
        if (!keep) { moves = 0; pushes = 0; hist = []; undos = 0; }
        solvedAt = -1; walkQ = []; anim = null;
      }
      function boxAt(i) { return boxes.indexOf(i); }
      function solved() { return boxes.every(b => map.goal[b]); }

      function step(d) {
        if (solvedAt >= 0 || done) return false;
        const W = map.W, delta = { up: -W, down: W, left: -1, right: 1 }[d];
        const to = player + delta;
        if (d === 'left') facing = -1; if (d === 'right') facing = 1;
        if (map.wall[to]) { bump = 1; return false; }
        const bi = boxAt(to);
        if (bi >= 0) {
          const beyond = to + delta;
          if (map.wall[beyond] || boxAt(beyond) >= 0) { bump = 1; api.sfx('tick'); return false; }
          hist.push({ p: player, bi, from: to });
          boxes[bi] = beyond; pushes++;
          anim = { t0: clock, from: player, box: bi, boxFrom: to };
          api.sfx(map.goal[beyond] ? 'merge' : 'drop');
        } else {
          hist.push({ p: player, bi: -1 });
          anim = { t0: clock, from: player, box: -1 };
          api.sfx('move');
        }
        if (hist.length > 400) hist.shift();
        player = to; moves++;
        if (solved()) win();
        return true;
      }
      function undo() {
        if (solvedAt >= 0 || done || !hist.length) return;
        if (api.level === 2 && undos >= HARD_UNDOS) { api.toast('No undos left on this level'); return; }
        const h = hist.pop(); undos++;
        if (h.bi >= 0) { boxes[h.bi] = h.from; pushes--; }
        player = h.p; moves = Math.max(0, moves - 1); anim = null; walkQ = [];
        api.sfx('click');
      }
      function restartLevel() { if (done) return; load(lvl); api.sfx('click'); }
      function goLevel(i) {
        if (done || i < 0 || i >= blockLen(block) || i > solvedN) return;
        load(i); api.sfx('tap');
      }
      function win() {
        solvedAt = clock; walkQ = [];
        const bonus = Math.max(0, 50 - Math.max(0, moves - cur.par));
        score += 100 + bonus; api.score(score);
        solvedN = Math.max(solvedN, lvl + 1);
        api.sfx('line');
        if (lvl === blockLen(block) - 1 && block === BLOCK_LENS.length - 1) {
          done = true;
          api.timeout(() => api.over({ score, title: 'Every crate home', won: true, message: 'All ' + (BLOCK_LENS[0] + BLOCK_LENS[1]) + ' levels solved' }), 700);
        } else if (lvl === blockLen(block) - 1) {
          api.toast('Set complete: ' + blockLen(block) + ' levels. A new set starts');
          api.timeout(() => { if (!done) { block++; solvedN = 0; load(0); } }, 1300);
        } else {
          api.toast(`Level ${lvl + 1} solved`);
          api.timeout(() => { if (!done) load(lvl + 1); }, 1100);
        }
      }

      // click a floor cell: walk there (BFS) or push a crate next to you
      function walkTo(target) {
        const W = map.W;
        const nb = [[-W, 'up'], [W, 'down'], [-1, 'left'], [1, 'right']];
        const d0 = nb.find(([d]) => player + d === target);
        if (d0 && boxAt(target) >= 0) { step(d0[1]); return; }
        if (!map.floor[target] || boxAt(target) >= 0) return;
        const prev = new Map([[player, null]]), q = [player];
        while (q.length) {
          const c = q.shift(); if (c === target) break;
          for (const [d, name] of nb) { const n = c + d; if (map.wall[n] || boxAt(n) >= 0 || prev.has(n)) continue; prev.set(n, [c, name]); q.push(n); }
        }
        if (!prev.has(target)) return;
        const path = []; let c = target;
        while (prev.get(c)) { const [p, name] = prev.get(c); path.unshift(name); c = p; }
        walkQ = path;
      }

      // dead corner: crate not on a spot with walls on two touching sides (easy mode warns)
      function deadCorner(b) {
        if (map.goal[b]) return false;
        const W = map.W, w = i => map.wall[i];
        return (w(b - W) && w(b - 1)) || (w(b - W) && w(b + 1)) || (w(b + W) && w(b - 1)) || (w(b + W) && w(b + 1));
      }

      // ---------- save ----------
      function snapshot() {
        if (done || (!restored && !api.touched)) return null;   // nothing played yet
        return { v: 2, seed, block, solvedN, lvl, boxes: boxes.slice(), player, moves, pushes, undos, score, hist: hist.slice(-120) };
      }
      function restore(s) {
        if (!s || s.v !== 2 || !Number.isInteger(s.seed) || !(s.block === 0 || s.block === 1) || typeof s.lvl !== 'number' || s.lvl < 0 || s.lvl >= blockLen(s.block)) return false;
        const m = parse(makeLevel(s.seed, s.block, s.lvl).m);
        if (!Array.isArray(s.boxes) || s.boxes.length !== m.boxes.length) return false;
        if (!s.boxes.every(b => m.floor[b]) || !m.floor[s.player] || new Set(s.boxes).size !== s.boxes.length) return false;
        seed = s.seed; block = s.block; solvedN = Math.max(0, Math.min(blockLen(block), s.solvedN | 0));
        load(s.lvl);
        boxes = s.boxes.slice(); player = s.player; moves = s.moves | 0; pushes = s.pushes | 0; undos = s.undos | 0;
        hist = Array.isArray(s.hist) ? s.hist.filter(h => h && typeof h.p === 'number') : [];
        score = s.score | 0;
        if (solved() && s.lvl < blockLen(block) - 1) load(s.lvl + 1);
        return true;
      }

      // ---------- input ----------
      api.keys(e => {
        if (e.metaKey || e.ctrlKey) return;
        const k = e.key;
        const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' }[k];
        if (dir) { walkQ = []; step(dir); return; }
        if (k === 'z' || k === 'Z' || k === 'u' || k === 'U' || k === 'Backspace') undo();
        else if (k === 'r' || k === 'R') restartLevel();
        else if (k === 'n' || k === 'N' || k === ']') goLevel(lvl + 1);
        else if (k === 'b' || k === 'B' || k === '[') goLevel(lvl - 1);
      });
      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const b = buttons.find(b => b.on && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (b) { b.act(); return; }
        const cx = Math.floor((x - lay.ox) / lay.cell), cy = Math.floor((y - lay.oy) / lay.cell);
        if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return;
        walkTo(cy * map.W + cx);
      });

      // ---------- drawing ----------
      function pos(i) { return { x: lay.ox + (i % map.W) * lay.cell, y: lay.oy + Math.floor(i / map.W) * lay.cell }; }
      function iconButton(x, y, w, h, label, on, act, col, icon) {
        buttons.push({ x, y, w, h, on, act });
        ctx.save(); ctx.globalAlpha = on ? 1 : 0.4;
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)';
        D.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
        if (icon) icon(x + 15, y + h / 2);
        D.text(ctx, label, x + w / 2 + (icon ? 7 : 0), y + h / 2 + 0.5, 12, col.ink, 650);
        ctx.restore();
      }
      function drawCrate(x, y, s, onGoal, warn, col, glow) {
        const pad = s * 0.1, w = s - pad * 2;
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(80,50,20,0.14)';
        D.roundRect(ctx, x + pad, y + pad + s * 0.06, w, w, s * 0.16); ctx.fill();
        ctx.fillStyle = onGoal ? col.accent : (warn ? col.bad : CRATE);
        D.roundRect(ctx, x + pad, y + pad, w, w, s * 0.16); ctx.fill();
        ctx.strokeStyle = onGoal ? 'rgba(255,248,242,0.55)' : (warn ? 'rgba(255,240,240,0.5)' : CRATE_DARK);
        ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.lineCap = 'round';
        const i = s * 0.24;
        D.roundRect(ctx, x + i, y + i, s - i * 2, s - i * 2, s * 0.08); ctx.stroke();
        if (onGoal) D.spark(ctx, x + s / 2, y + s / 2, s * 0.2 * (1 + glow * 0.3), '#fff8f2', glow * 2);
        else { ctx.beginPath(); ctx.moveTo(x + i, y + i); ctx.lineTo(x + s - i, y + s - i); ctx.stroke(); }
      }

      function render() {
        const col = api.colors(), { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        buttons = [];
        const top = 46, bottom = 50;
        lay.cell = Math.floor(Math.min((w - 24) / map.W, (h - top - bottom - 12) / map.H, 48));
        lay.ox = Math.round((w - lay.cell * map.W) / 2); lay.oy = Math.round(top + (h - top - bottom - lay.cell * map.H) / 2);
        const s = lay.cell;

        // header
        D.text(ctx, `Level ${lvl + 1}`, 14, 16, 15, col.ink, 750, 'left');
        D.text(ctx, `of ${blockLen(block)}`, 14, 33, 11, col.ink3, 600, 'left');
        D.text(ctx, `${moves} ${moves === 1 ? 'move' : 'moves'}`, w / 2, 16, 13, col.ink, 650);
        D.text(ctx, api.level === 2 ? `${pushes} ${pushes === 1 ? 'push' : 'pushes'} · ${Math.max(0, HARD_UNDOS - undos)} undos left` : `${pushes} ${pushes === 1 ? 'push' : 'pushes'}`, w / 2, 33, 11, col.ink3, 600);
        const ink = col.ink;
        iconButton(w - 150, 8, 66, 28, 'Undo', hist.length > 0 && !done, undo, col, (x, y) => {
          ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(x + 1, y + 1, 5, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 5, y - 3); ctx.lineTo(x - 4, y + 2); ctx.lineTo(x, y - 1); ctx.stroke();
        });
        iconButton(w - 78, 8, 66, 28, 'Reset', moves > 0 && !done, restartLevel, col, (x, y) => {
          ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(x, y, 5, -Math.PI * 0.3, Math.PI * 1.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 1, y - 7); ctx.lineTo(x + 3, y - 4.5); ctx.lineTo(x, y - 3); ctx.stroke();
        });

        // floor and walls
        for (let i = 0; i < map.W * map.H; i++) {
          const p = pos(i);
          if (map.floor[i]) {
            ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.045)' : 'rgba(120,90,50,0.07)';
            ctx.fillRect(p.x, p.y, s + 0.5, s + 0.5);
          }
        }
        for (let i = 0; i < map.W * map.H; i++) {
          if (!map.wall[i]) continue;
          const p = pos(i);
          // only draw walls that border the play area
          const W = map.W, near = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1].some(d => map.floor[i + d] && Math.abs(((i + d) % W) - (i % W)) <= 1);
          if (!near) continue;
          ctx.fillStyle = col.dark ? '#4a4239' : '#d9ccb8';
          D.roundRect(ctx, p.x + 1, p.y + 1, s - 2, s - 2, s * 0.22); ctx.fill();
          ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)';
          D.roundRect(ctx, p.x + 4, p.y + 3, s - 8, s * 0.22, s * 0.1); ctx.fill();
        }
        // spots
        for (let i = 0; i < map.W * map.H; i++) {
          if (!map.goal[i]) continue;
          const p = pos(i);
          ctx.strokeStyle = col.accent; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(1.5, s * 0.05);
          ctx.setLineDash([s * 0.08, s * 0.08]);
          ctx.beginPath(); ctx.arc(p.x + s / 2, p.y + s / 2, s * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          D.spark(ctx, p.x + s / 2, p.y + s / 2, s * 0.12, col.accent, 0);
          ctx.globalAlpha = 1;
        }

        // movement tween
        const k = anim && !api.reduceMotion ? Math.min(1, (clock - anim.t0) / 0.09) : 1;
        const e = D.ease.outCubic(k);
        const lerpPos = (a, b) => { const pa = pos(a), pb = pos(b); return { x: D.lerp(pa.x, pb.x, e), y: D.lerp(pa.y, pb.y, e) }; };
        const glow = solvedAt >= 0 ? Math.min(1, (clock - solvedAt) / 0.5) : 0;
        boxes.forEach((b, bi) => {
          const p = anim && anim.box === bi && k < 1 ? lerpPos(anim.boxFrom, b) : pos(b);
          drawCrate(p.x, p.y, s, map.goal[b], api.level === 0 && deadCorner(b), col, glow);
        });
        // you: the spark in a soft disc, with a little bob
        const pp = anim && k < 1 ? lerpPos(anim.from, player) : pos(player);
        const bob = api.reduceMotion ? 0 : Math.sin(clock * 5) * s * 0.025;
        const bx = bump > 0 && !api.reduceMotion ? Math.sin(bump * 30) * bump * 2 : 0;
        ctx.fillStyle = col.dark ? 'rgba(217,119,87,0.22)' : 'rgba(217,119,87,0.16)';
        ctx.beginPath(); ctx.arc(pp.x + s / 2 + bx, pp.y + s / 2 + bob, s * 0.36, 0, Math.PI * 2); ctx.fill();
        D.spark(ctx, pp.x + s / 2 + bx, pp.y + s / 2 + bob, s * 0.3, col.accent, facing * clock * 0.6 + glow * 3);

        // footer: level picker
        const fy = h - 40, n = blockLen(block), unlocked = solvedN;
        iconButton(12, fy, 40, 28, '', lvl > 0 && !done, () => goLevel(lvl - 1), col, (x, y) => {
          ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 8, y - 5); ctx.lineTo(x + 3, y); ctx.lineTo(x + 8, y + 5); ctx.stroke();
        });
        iconButton(w - 52, fy, 40, 28, '', lvl < Math.min(unlocked, n - 1) && !done, () => goLevel(lvl + 1), col, (x, y) => {
          ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 2, y - 5); ctx.lineTo(x + 7, y); ctx.lineTo(x + 2, y + 5); ctx.stroke();
        });
        const span = Math.min(w - 130, n * 16), gap = span / n;
        for (let i = 0; i < n; i++) {
          const dx = w / 2 - span / 2 + gap * (i + 0.5), dy = fy + 14;
          const cur = i === lvl;
          ctx.beginPath(); ctx.arc(dx, dy, cur ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = i < unlocked || (done && i <= lvl) ? col.accent : (cur ? col.ink2 : col.line);
          ctx.fill();
          if (cur) { ctx.strokeStyle = col.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(dx, dy, 7.5, 0, Math.PI * 2); ctx.stroke(); }
        }
      }

      function update(dt) {
        clock += dt;
        bump = Math.max(0, bump - dt * 4);
        if (walkQ.length && (!anim || clock - anim.t0 > 0.075)) { const d = walkQ.shift(); if (!step(d)) walkQ = []; }
      }

      score = 0;
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) {
        seed = newSeed(); block = 0; solvedN = 0;   // a new run (first open, or Play again after the end): new seed, level 1, blank dots
        load(0);
      }
      api.score(score);
      if (window.ludusDebug) window.ludusDebug.crates = () => ({ lvl, score, block, n: blockLen(block), solvedN, seed, rows: cur.m.join('/'), sol: cur.sol });
      api.loop(dt => { update(dt); render(); });
      return { save: snapshot };
    }
  });
})();
