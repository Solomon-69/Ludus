/* Tag: two players, one keyboard. One of you is "it"; touch the other to pass it on.
   Whoever is "it" when the clock hits zero loses the round. First to 3 rounds wins. */
(function () {
  const D = Ludus.draw;
  const T = 18, COLS = 20, ROWS = 22, W = COLS * T, H = ROWS * T;
  const PW = 13, PH = 16, FIRST_TO = 3, ROUND_TIME = 60;
  const GRAV = 1500, JUMP = 455, SPRING = 700, MAX_FALL = 560;
  const COYOTE = 0.1, BUFFER = 0.13, TAG_COOL = 1.4, TAG_STUN = 0.5, COUNT = 2.4;
  const POWERS = {
    speed: { label: 'Speed', color: '#e0a526', time: 5 },
    jump: { label: 'Super jump', color: '#4f9d69', time: 6 },
    ghost: { label: 'Invisible', color: '#9b6dd6', time: 4 },
    freeze: { label: 'Freeze', color: '#3fa7c9', time: 1.8 },
    slow: { label: 'Slow', color: '#e05d8b', time: 4 }
  };
  const PKEYS = Object.keys(POWERS);

  // Maps are written as their left half (10 columns) and mirrored, so both sides are fair.
  // # block  ~ ice block  - jump-through ledge  ^ spring  * power-up spot  1 P1 start (mirrors to 2)
  // An open edge (no wall) is a tunnel: walk out one side, come back on the other.
  const MAPS = [
    { name: 'Yard', tint: '#6aa56b', rows: [
      '##########', '#.........', '#..*......', '#.-----...', '#.........', '#.........', '#......---',
      '#.........', '#.........', '###----...', '#.........', '#.........', '#....-----', '#.........',
      '#.........', '#.----....', '#.......#.', '#.......#.', '.....---#.', '..........', '..1.^.....', '##########'] },
    { name: 'Tower', tint: '#b5895a', rows: [
      '##########', '#.........', '#...*.....', '#.----....', '#........*', '#.......##', '#----...##',
      '#.......##', '#.......##', '#...----##', '#.......##', '#.......##', '#----...##', '#.......##',
      '#......*##', '#...----##', '#.......##', '#.......##', '#----.....', '#.........', '#.1...^...', '##########'] },
    { name: 'Chimney', tint: '#2a9d9f', rows: [
      '##########', '#.........', '#..*......', '#.----....', '#........*', '#......#..', '#...---#..',
      '#......#..', '#......#..', '#----..#..', '#......#..', '#......#..', '#..----#..', '#......#..',
      '#......#..', '#---...#..', '#......#..', '#......#..', '...----...', '..........', '..1......^', '##########'] },
    { name: 'Islands', tint: '#3f8fb5', rows: [
      '#######...', '#.........', '#..*......', '#.----....', '#.........', '#.........', '#.....----',
      '#.........', '#.........', '...---....', '..........', '.........*', '#......---', '#.........',
      '#.*.......', '#####.....', '#.........', '#.........', '#...####..', '#.........', '#.1.......', '#######...'] },
    { name: 'Frost', tint: '#7fb8d6', rows: [
      '##########', '#.........', '#......*..', '#..~~~....', '#.........', '#.........', '#~~~....--',
      '#.........', '#.........', '#....~~~~.', '#.........', '#.........', '#~~~......', '#.........',
      '#..*......', '#....----.', '#.........', '#.........', '#~~~......', '........#.', '..1.^...#.', '~~~~~~~~~~'] }
  ];

  function buildMap(i) {
    const def = MAPS[i];
    const grid = def.rows.map(s => s + s.split('').reverse().map(ch => (ch === '1' ? '2' : ch)).join(''));
    const spawns = {}, spots = [];
    grid.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (ch === '1' || ch === '2') spawns['p' + ch] = { x: c * T + (T - PW) / 2, y: r * T + T - PH };
      if (ch === '*') spots.push({ x: c * T + T / 2, y: r * T + T / 2 });
    }));
    return { name: def.name, tint: def.tint, grid, spawns, spots };
  }

  // Two people, one keyboard: P1 = WASD (+F / left Shift), P2 = arrows (+ / , right Shift, Enter).
  function makePads(api) {
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act', ShiftLeft: 'act' };
    const K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', ShiftRight: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false, hit: {} });
    const pads = { p1: blank(), p2: blank() };
    function find(e) {
      if (e.key === 'Shift') {
        if (e.code === 'ShiftLeft' || e.location === 1) return ['p1', 'act'];
        if (e.code === 'ShiftRight' || e.location === 2) return ['p2', 'act'];
        return null;
      }
      if (C1[e.code]) return ['p1', C1[e.code]];
      if (C2[e.code]) return ['p2', C2[e.code]];
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (K1[k]) return ['p1', K1[k]];
      if (K2[k]) return ['p2', K2[k]];
      return null;
    }
    api.keys(e => {
      const m = find(e); if (!m) return;
      e.preventDefault();
      const p = pads[m[0]];
      if (!p[m[1]]) p.hit[m[1]] = true;
      p[m[1]] = true;
    });
    api.keysUp(e => { const m = find(e); if (m) pads[m[0]][m[1]] = false; });
    pads.clear = () => { Object.assign(pads.p1, blank()); Object.assign(pads.p2, blank()); };
    pads.take = (who, k) => { const h = pads[who].hit[k]; pads[who].hit[k] = false; return !!h; };
    api.on(window, 'blur', pads.clear);
    return pads;
  }

  function powerIcon(ctx, type, x, y, r) {
    ctx.save(); ctx.strokeStyle = '#fffaf3'; ctx.fillStyle = '#fffaf3'; ctx.lineWidth = Math.max(1.2, r * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (type === 'speed') { ctx.moveTo(x + r * 0.2, y - r * 0.7); ctx.lineTo(x - r * 0.35, y + r * 0.08); ctx.lineTo(x + r * 0.2, y + r * 0.08); ctx.lineTo(x - r * 0.2, y + r * 0.72); ctx.stroke(); }
    else if (type === 'jump') { [-0.25, 0.3].forEach(o => { ctx.moveTo(x - r * 0.45, y + o * r + r * 0.2); ctx.lineTo(x, y + o * r - r * 0.25); ctx.lineTo(x + r * 0.45, y + o * r + r * 0.2); }); ctx.stroke(); }
    else if (type === 'ghost') { ctx.arc(x, y - r * 0.05, r * 0.45, Math.PI, 0); ctx.lineTo(x + r * 0.45, y + r * 0.55); ctx.lineTo(x + r * 0.15, y + r * 0.35); ctx.lineTo(x - r * 0.15, y + r * 0.55); ctx.lineTo(x - r * 0.45, y + r * 0.35); ctx.closePath(); ctx.stroke(); }
    else if (type === 'freeze') { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2; ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); ctx.lineTo(x - Math.cos(a) * r * 0.62, y - Math.sin(a) * r * 0.62); } ctx.stroke(); }
    else { ctx.arc(x, y, r * 0.5, 0, Math.PI * 1.6); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  Ludus.register({
    id: 'tag', name: 'Tag', tag: '2 Player', tint: '#6aa56b',
    hint: '<b>P1</b> <kbd>A</kbd><kbd>D</kbd> run <kbd>W</kbd> jump <kbd>S</kbd> drop · <b>P2</b> <kbd>←</kbd><kbd>→</kbd> run <kbd>↑</kbd> jump <kbd>↓</kbd> drop · don\'t be it at 0:00',
    _rules: { MAPS, buildMap, T, COLS, ROWS },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      [[0.1, 0.78, 0.8], [0.14, 0.5, 0.3], [0.56, 0.5, 0.3], [0.32, 0.28, 0.36]].forEach(([x, y, ww]) => { D.roundRect(ctx, w * x, h * y, w * ww, h * 0.06, h * 0.03); ctx.fill(); });
      const blob = (x, y, color) => { ctx.fillStyle = color; D.roundRect(ctx, x - h * 0.07, y - h * 0.18, h * 0.14, h * 0.18, h * 0.05); ctx.fill(); ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(x + h * 0.02, y - h * 0.12, h * 0.015, 0, Math.PI * 2); ctx.fill(); };
      blob(w * 0.3, h * 0.5, '#fff8f2'); blob(w * 0.7, h * 0.78, '#5b8def');
      ctx.fillStyle = '#2b2018'; D.roundRect(ctx, w * 0.3 - h * 0.08, h * 0.13, h * 0.16, h * 0.1, h * 0.04); ctx.fill();
      D.text(ctx, 'IT', w * 0.3, h * 0.18, h * 0.07, '#fff8f2', 800);
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx } = view;
      const pads = makePads(api);
      const BASE = [138, 150, 163][api.level];
      let map, mapStart, mapIdx, round, wins, it, firstIt, timer, phase, phaseT, items, itemT, tagCool, clock = 0;
      let players, parts = [], floaters = [], springs = {}, shake = 0, overCalled = false, lastTick = -1, flash = 0;

      function newPlayer(id) {
        return { id, x: 0, y: 0, vx: 0, vy: 0, face: id === 'p1' ? 1 : -1, ground: false, ice: false, oneWay: false, wallL: false, wallR: false,
          coyote: 0, buffer: 0, lock: 0, dropT: 0, frozen: 0, speedT: 0, jumpT: 0, ghostT: 0, slowT: 0, sq: 1, dead: false };
      }
      function startMatch() {
        mapStart = api.randInt(0, MAPS.length - 1); round = 0; wins = { p1: 0, p2: 0 };
        firstIt = Math.random() < 0.5 ? 'p1' : 'p2';
        players = [newPlayer('p1'), newPlayer('p2')];
        api.score(0); startRound();
      }
      function startRound() {
        mapIdx = (mapStart + round) % MAPS.length; map = buildMap(mapIdx);
        it = round % 2 === 0 ? firstIt : other(firstIt);
        players = [newPlayer('p1'), newPlayer('p2')];
        players.forEach(p => { p.x = map.spawns[p.id].x; p.y = map.spawns[p.id].y; });
        timer = ROUND_TIME; phase = 'count'; phaseT = COUNT; items = []; itemT = 4; tagCool = 0; lastTick = -1;
        pads.clear();
      }
      const other = id => (id === 'p1' ? 'p2' : 'p1');
      const P = id => players[id === 'p1' ? 0 : 1];
      const label = id => (id === 'p1' ? 'P1' : 'P2');

      // ---------- tiles ----------
      function tile(c, r) {
        c = ((c % COLS) + COLS) % COLS; r = ((r % ROWS) + ROWS) % ROWS;
        return map.grid[r][c];
      }
      const solidT = t => t === '#' || t === '~';
      const solid = (c, r) => solidT(tile(c, r));
      function solidBox(x, y, w, h) {
        for (let r = Math.floor(y / T); r <= Math.floor((y + h - 0.01) / T); r++)
          for (let c = Math.floor(x / T); c <= Math.floor((x + w - 0.01) / T); c++) if (solid(c, r)) return true;
        return false;
      }

      // ---------- physics ----------
      function moveX(p, dx) {
        p.x += dx;
        const top = Math.floor((p.y + 0.01) / T), bot = Math.floor((p.y + PH - 0.01) / T);
        if (dx > 0) {
          const c = Math.floor((p.x + PW - 0.01) / T);
          for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = c * T - PW; p.vx = 0; return; }
        } else if (dx < 0) {
          const c = Math.floor((p.x + 0.01) / T);
          for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = (c + 1) * T; p.vx = 0; return; }
        }
      }
      function moveY(p, dy) {
        const prevBottom = p.y + PH;
        p.y += dy;
        const l = Math.floor((p.x + 0.01) / T), rr = Math.floor((p.x + PW - 0.01) / T);
        if (dy > 0) {
          const r = Math.floor((p.y + PH - 0.01) / T);
          for (let c = l; c <= rr; c++) {
            const t = tile(c, r);
            if (solidT(t) || (t === '-' && p.dropT <= 0 && prevBottom <= r * T + 0.5)) {
              p.y = r * T - PH;
              if (p.vy > 330 && !api.reduceMotion) { p.sq = 0.72; dust(p.x + PW / 2, p.y + PH, 4); }
              if (p.vy > 200) api.sfx('drop');
              p.vy = 0; p.ground = true; p.ice = t === '~'; p.oneWay = t === '-';
              return;
            }
          }
        } else if (dy < 0) {
          const r = Math.floor((p.y + 0.01) / T);
          for (let c = l; c <= rr; c++) if (solid(c, r)) { p.y = (r + 1) * T; p.vy = 0; return; }
        }
      }
      function wrap(p) {
        if (p.x + PW / 2 < 0) p.x += W; else if (p.x + PW / 2 >= W) p.x -= W;
        if (p.y + PH / 2 < 0) p.y += H; else if (p.y + PH / 2 >= H) p.y -= H;
      }

      function step(p, live, dt) {
        const pad = pads[p.id];
        const jumpHit = pads.take(p.id, 'up') | pads.take(p.id, 'act');
        pads.take(p.id, 'down');
        const ok = live && p.frozen <= 0 && !p.dead;
        const inp = ok ? pad : { up: false, down: false, left: false, right: false, act: false };
        p.frozen = Math.max(0, p.frozen - dt);
        ['speedT', 'jumpT', 'ghostT', 'slowT', 'dropT'].forEach(k => { p[k] = Math.max(0, p[k] - dt); });
        p.sq += (1 - p.sq) * Math.min(1, dt * 12);
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (dir) p.face = dir;
        const maxV = BASE * (p.speedT > 0 ? 1.45 : 1) * (p.slowT > 0 ? 0.6 : 1) * (p.id === it && phase === 'play' ? 1.06 : 1);
        const ice = p.ground && p.ice;
        let acc = p.ground ? (ice ? 520 : 2600) : 1600;
        if (p.lock > 0) { p.lock -= dt; acc *= 0.2; }
        if (dir) {
          const along = p.vx * dir;
          if (along < maxV) p.vx = dir * Math.min(maxV, along + acc * dt * (along < 0 ? 1.6 : 1));
          else p.vx = dir * Math.max(maxV, along - 900 * dt);
        } else {
          const fr = p.ground ? (ice ? 220 : 2200) : 450;
          p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - fr * dt);
        }
        // jump buffer + coyote time + wall jump
        p.buffer = ok && jumpHit ? BUFFER : Math.max(0, p.buffer - dt);
        p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
        const boost = p.jumpT > 0 ? 1.32 : 1;
        if (p.buffer > 0) {
          if (p.coyote > 0) {
            p.vy = -JUMP * boost; p.buffer = 0; p.coyote = 0; p.ground = false; p.sq = 1.28;
            api.sfx('jump'); dust(p.x + PW / 2, p.y + PH, 3);
          } else if (p.wallL || p.wallR) {
            const away = p.wallL ? 1 : -1;
            p.vx = away * 235; p.vy = -JUMP * 0.95 * (boost > 1 ? 1.15 : 1); p.face = away; p.lock = 0.16; p.buffer = 0; p.sq = 1.22;
            api.sfx('jump'); dust(p.x + (p.wallL ? 0 : PW), p.y + PH / 2, 3);
          }
        }
        if (inp.down && p.ground && p.oneWay) { p.dropT = 0.22; p.ground = false; p.y += 1; }
        let g = GRAV;
        if (p.vy >= 0) p.bounce = false;
        if (p.vy < 0 && !p.bounce && !(inp.up || inp.act)) g *= 2.5;   // let go early = short hop
        else if (p.vy > 0) g *= 1.12;
        p.vy = Math.min(MAX_FALL, p.vy + g * dt);
        if (!p.ground && p.vy > 0 && ((p.wallL && dir < 0) || (p.wallR && dir > 0))) {
          p.vy = Math.min(p.vy, 75);
          if (Math.random() < dt * 14) dust(p.x + (p.wallL ? 0 : PW), p.y + PH * 0.7, 1);
        }
        p.ground = false;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 5));
        for (let i = 0; i < n; i++) { moveX(p, p.vx * dt / n); moveY(p, p.vy * dt / n); wrap(p); }
        p.wallL = solidBox(p.x - 1, p.y + 2, 1, PH - 4);
        p.wallR = solidBox(p.x + PW, p.y + 2, 1, PH - 4);
        // springs
        const sc = Math.floor((p.x + PW / 2) / T), sr = Math.floor((p.y + PH - 1) / T);
        if (tile(sc, sr) === '^' && p.vy >= 0) {
          p.vy = -SPRING * (p.jumpT > 0 ? 1.1 : 1); p.bounce = true; p.ground = false; p.sq = 1.35; springs[sc + ',' + sr] = clock; api.sfx('power');
        }
      }

      const wrapD = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
      function touching(a, b, pad) {
        return Math.abs(wrapD(b.x - a.x, W)) < PW + (pad || 0) && Math.abs(wrapD(b.y - a.y, H)) < PH + (pad || 0);
      }

      function checkTag() {
        if (tagCool > 0) return;
        const a = P('p1'), b = P('p2');
        if (!touching(a, b, -1)) return;
        const oldIt = P(it), newIt = P(other(it));
        it = newIt.id; tagCool = TAG_COOL;
        newIt.frozen = Math.max(newIt.frozen, TAG_STUN);   // the newly tagged player is stunned for a moment
        const push = Math.sign(wrapD(oldIt.x - newIt.x, W)) || 1;
        oldIt.vx = push * 200; oldIt.vy = Math.min(oldIt.vy, -200);
        api.sfx('hit'); flash = 1; if (!api.reduceMotion) shake = 0.5;
        burst(newIt.x + PW / 2, newIt.y + PH / 2, 12, newIt.id === 'p1' ? api.colors().accent : D.P2);
        floaters.push({ text: label(it) + ' is it', x: newIt.x + PW / 2, y: newIt.y - 14, t: 0, color: null });
      }

      function spawnItem() {
        const free = map.spots.filter(s => !items.some(i => i.x === s.x && i.y === s.y) &&
          players.every(p => Math.hypot(p.x + PW / 2 - s.x, p.y + PH / 2 - s.y) > 46));
        if (!free.length) return;
        const s = api.pick(free);
        items.push({ x: s.x, y: s.y, type: api.pick(PKEYS), t: 0 });
      }
      function pickups() {
        items = items.filter(i => {
          const p = players.find(q => !q.dead && Math.abs(q.x + PW / 2 - i.x) < PW / 2 + 7 && Math.abs(q.y + PH / 2 - i.y) < PH / 2 + 7);
          if (!p) return true;
          const o = P(other(p.id)), pw = POWERS[i.type];
          if (i.type === 'speed') p.speedT = pw.time;
          if (i.type === 'jump') p.jumpT = pw.time;
          if (i.type === 'ghost') p.ghostT = pw.time;
          if (i.type === 'freeze') { o.frozen = Math.max(o.frozen, pw.time); o.vx = 0; }
          if (i.type === 'slow') o.slowT = pw.time;
          api.sfx('power');
          burst(i.x, i.y, 10, pw.color);
          floaters.push({ text: i.type === 'freeze' || i.type === 'slow' ? label(o.id) + ' ' + (i.type === 'freeze' ? 'frozen' : 'slowed') : pw.label, x: i.x, y: i.y - 12, t: 0, color: pw.color });
          return false;
        });
      }

      function endRound() {
        timer = 0;
        const loser = P(it), win = other(it);
        wins[win]++;
        api.score(Math.max(wins.p1, wins.p2));
        loser.dead = true;
        burst(loser.x + PW / 2, loser.y + PH / 2, 34, loser.id === 'p1' ? api.colors().accent : D.P2);
        api.sfx('boom'); if (!api.reduceMotion) shake = 1;
        phase = wins[win] >= FIRST_TO ? 'over' : 'end';
        phaseT = phase === 'over' ? 0.9 : 2.3;
        pads.clear();
      }

      function update(dt) {
        clock += dt;
        if (shake > 0) shake = Math.max(0, shake - dt * 2.5);
        flash = Math.max(0, flash - dt * 3);
        if (phase === 'count') {
          phaseT -= dt;
          const n = Math.ceil(phaseT / (COUNT / 3));
          if (n !== lastTick && n > 0) { lastTick = n; api.sfx('tick'); }
          players.forEach(p => step(p, false, dt));
          if (phaseT <= 0) { phase = 'play'; api.sfx('score'); lastTick = -1; floaters.push({ text: 'Go', x: W / 2, y: H / 2, t: 0, color: null, big: true }); }
        } else if (phase === 'play') {
          timer -= dt; tagCool = Math.max(0, tagCool - dt);
          const s = Math.ceil(timer);
          if (s <= 5 && s !== lastTick && s > 0) { lastTick = s; api.sfx('tick'); }
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
        items.forEach(i => { i.t += dt; });
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; q.life -= dt * 1.6; });
        parts = parts.filter(q => q.life > 0);
        floaters.forEach(f => { f.t += dt; });
        floaters = floaters.filter(f => f.t < 1.1);
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

      // ---------- drawing ----------
      function drawTiles(col) {
        const block = col.dark ? '#4a4138' : '#dccbb4', blockHi = col.dark ? '#5a5046' : '#e9dcc8';
        const ice = col.dark ? '#5d8796' : '#bfe3f0';
        const strips = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const t = map.grid[r][c], x = c * T, y = r * T;
          if (t === '#' || t === '~') {
            ctx.fillStyle = t === '#' ? block : ice; ctx.fillRect(x, y, T + 0.5, T + 0.5);
            if (!solid(c, r - 1)) strips.push([x, y, t === '#' ? map.tint : (col.dark ? '#a9dcec' : '#e9f7fc')]);
            else if (t === '#') { ctx.fillStyle = blockHi; ctx.fillRect(x + 3, y + 3, 3, 3); }
            if (t === '~') { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, y + 12); ctx.lineTo(x + 9, y + 7); ctx.stroke(); }
          } else if (t === '-') {
            if (c > 0 && map.grid[r][c - 1] === '-') continue;
            let n = 1; while (c + n < COLS && map.grid[r][c + n] === '-') n++;
            ctx.fillStyle = 'rgba(0,0,0,0.12)'; D.roundRect(ctx, x + 1, y + 2, n * T - 2, 5, 2.5); ctx.fill();
            ctx.fillStyle = map.tint; D.roundRect(ctx, x, y, n * T, 5, 2.5); ctx.fill();
          } else if (t === '^') {
            const k = Math.max(0, 1 - (clock - (springs[c + ',' + r] ?? -9)) * 5);
            const top = y + T - 8 + k * 4;
            ctx.strokeStyle = col.ink3; ctx.lineWidth = 1.6; ctx.beginPath();
            for (let i = 0; i <= 3; i++) { const yy = top + 2 + (y + T - 2 - top - 2) * i / 3; ctx.lineTo(x + (i % 2 ? 5 : 13), yy); }
            ctx.stroke();
            ctx.fillStyle = '#e0a526'; D.roundRect(ctx, x + 2, top - 3, T - 4, 4, 2); ctx.fill();
            ctx.fillStyle = col.ink3; ctx.fillRect(x + 3, y + T - 2, T - 6, 2);
          }
        }
        strips.forEach(([x, y, color]) => { ctx.fillStyle = color; ctx.fillRect(x - 0.25, y, T + 0.5, 4); });
      }

      function drawPlayer(p, col, ox, oy) {
        const color = p.id === 'p1' ? col.accent : D.P2;
        const x = p.x + PW / 2 + ox, yb = p.y + PH + oy;
        if (p.dead) {   // caught when the clock ran out: a flattened splat with crossed eyes
          ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.ellipse(x, yb - 3, PW * 0.95, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fffaf3'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
          [-3, 3].forEach(dx => { ctx.beginPath(); ctx.moveTo(x + dx - 1.5, yb - 4.5); ctx.lineTo(x + dx + 1.5, yb - 1.5); ctx.moveTo(x + dx + 1.5, yb - 4.5); ctx.lineTo(x + dx - 1.5, yb - 1.5); ctx.stroke(); });
          ctx.restore(); return;
        }
        const sh = PH * p.sq, sw = PW / Math.sqrt(p.sq);
        ctx.save();
        if (p.ghostT > 0) ctx.globalAlpha = 0.13 + 0.07 * Math.sin(clock * 12);
        if (p.id === it && phase !== 'over' && phase !== 'end') {
          ctx.fillStyle = col.bad || '#d9534f'; ctx.globalAlpha *= 0.18 + 0.1 * Math.sin(clock * 8);
          ctx.beginPath(); ctx.arc(x, yb - PH / 2, 15, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = p.ghostT > 0 ? 0.2 : 1;
        }
        if (p.speedT > 0 && Math.abs(p.vx) > 40) {
          ctx.strokeStyle = POWERS.speed.color; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - p.face * 9, yb - 4 - i * 4); ctx.lineTo(x - p.face * (16 + i * 3), yb - 4 - i * 4); ctx.stroke(); }
        }
        ctx.fillStyle = color; D.roundRect(ctx, x - sw / 2, yb - sh, sw, sh, 4.5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; D.roundRect(ctx, x - sw / 2 + 2, yb - sh + 2, sw - 4, 3, 1.5); ctx.fill();
        const ex = x + p.face * 2.2, ey = yb - sh * 0.62;
        ctx.fillStyle = '#fffaf3';
        ctx.beginPath(); ctx.arc(ex - 2.4, ey, 2.1, 0, Math.PI * 2); ctx.arc(ex + 2.4, ey, 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2018';
        ctx.beginPath(); ctx.arc(ex - 2.4 + p.face * 0.8, ey + 0.3, 1.05, 0, Math.PI * 2); ctx.arc(ex + 2.4 + p.face * 0.8, ey + 0.3, 1.05, 0, Math.PI * 2); ctx.fill();
        if (p.frozen > 0) {
          ctx.fillStyle = 'rgba(170,220,240,0.55)'; ctx.strokeStyle = '#e9f7fc'; ctx.lineWidth = 1.2;
          D.roundRect(ctx, x - PW / 2 - 3, yb - PH - 3, PW + 6, PH + 4, 3); ctx.fill(); ctx.stroke();
          if (p.frozen <= TAG_STUN + 0.01 && p.id === it) {
            for (let i = 0; i < 3; i++) { const a = clock * 7 + i * 2.1; D.spark(ctx, x + Math.cos(a) * 9, yb - PH - 4 + Math.sin(a) * 2.5, 2.5, '#e0a526', 0); }
          }
        }
        if (p.slowT > 0) { ctx.fillStyle = POWERS.slow.color; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x - 5 + i * 10, yb + 1, 1.6, 0, Math.PI * 2); ctx.fill(); } }
        // "IT" marker + active power icons
        let top = yb - sh - 6;
        if (p.id === it && phase !== 'over') {
          const bob = api.reduceMotion ? 0 : Math.sin(clock * 6) * 1.5;
          const ty = top - 7 + bob;
          ctx.globalAlpha = p.ghostT > 0 ? 0.35 : 1;
          ctx.fillStyle = col.ink; D.roundRect(ctx, x - 9, ty - 6, 18, 12, 4); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 3, ty + 5.5); ctx.lineTo(x + 3, ty + 5.5); ctx.lineTo(x, ty + 9); ctx.fill();
          D.text(ctx, 'IT', x, ty + 0.5, 8.5, col.surface || '#fff', 800);
          top = ty - 9;
        }
        const fx = ['speedT', 'jumpT', 'ghostT'].filter(k => p[k] > 0);
        fx.forEach((k, i) => {
          const type = k.replace('T', ''), ix = x + (i - (fx.length - 1) / 2) * 11, left = p[k] / POWERS[type].time;
          ctx.globalAlpha = p.ghostT > 0 ? 0.2 : 1; ctx.fillStyle = POWERS[type].color;
          ctx.beginPath(); ctx.arc(ix, top - 1, 4.6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = POWERS[type].color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ix, top - 1, 6.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
          powerIcon(ctx, type, ix, top - 1, 3.6);
        });
        ctx.restore();
      }

      function drawField(col) {
        // background + a soft watermark spark
        ctx.fillStyle = col.dark ? '#2a2520' : '#fbf6ee';
        D.roundRect(ctx, 0, 0, W, H, 10); ctx.fill();
        ctx.save(); D.roundRect(ctx, 0, 0, W, H, 10); ctx.clip();
        ctx.globalAlpha = col.dark ? 0.05 : 0.06; D.spark(ctx, W / 2, H / 2, 90, map.tint, 0.2); ctx.globalAlpha = 1;
        drawTiles(col);
        items.forEach(i => {
          const k = Math.min(1, i.t / 0.3), s = api.reduceMotion ? 1 : D.ease.outBack(k);
          const y = i.y + (api.reduceMotion ? 0 : Math.sin(i.t * 3.5) * 2);
          ctx.save(); ctx.translate(i.x, y); ctx.scale(s, s);
          ctx.globalAlpha = 0.22; ctx.fillStyle = POWERS[i.type].color; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
          powerIcon(ctx, i.type, 0, 0, 5.5);
          ctx.restore();
        });
        // players (with wrapped copies near open edges)
        players.forEach(p => {
          const xs = [0], ys = [0];
          if (p.x < PW * 2) xs.push(W); if (p.x > W - PW * 3) xs.push(-W);
          if (p.y < PH * 2) ys.push(H); if (p.y > H - PH * 3) ys.push(-H);
          xs.forEach(ox => ys.forEach(oy => drawPlayer(p, col, ox, oy)));
        });
        parts.forEach(q => {
          ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2)); ctx.fillStyle = q.color || (col.dark ? '#8a7f73' : '#bfae96');
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        floaters.forEach(f => {
          const a = Math.min(1, (1.1 - f.t) * 3);
          ctx.globalAlpha = Math.max(0, a);
          if (f.big) { const s = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, f.t * 4)); D.text(ctx, f.text, f.x, f.y, 44 * s, col.accent, 800); }
          else D.text(ctx, f.text, f.x, f.y - f.t * 22, 10.5, f.color || col.ink, 750);
        });
        ctx.globalAlpha = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.18})`; ctx.fillRect(0, 0, W, H); }
        overlays(col);
        ctx.restore();
      }

      function banner(col, y, big, small) {
        ctx.save();
        ctx.fillStyle = col.surface || '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        const bw = Math.min(W - 40, 250);
        D.roundRect(ctx, W / 2 - bw / 2, y - 26, bw, 52, 16); ctx.fill(); ctx.shadowColor = 'transparent';
        D.text(ctx, big, W / 2, y - 6, 16, col.ink, 800);
        D.text(ctx, small, W / 2, y + 13, 11, col.ink2, 650);
        ctx.restore();
      }

      function overlays(col) {
        if (phase === 'count') {
          const n = Math.max(1, Math.ceil(phaseT / (COUNT / 3)));
          const k = 1 - ((phaseT / (COUNT / 3)) % 1 || 1);
          const s = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, k * 3));
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,250,243,0.35)'; ctx.fillRect(0, 0, W, H);
          ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.scale(s, s);
          D.text(ctx, String(n), 0, 0, 56, col.accent, 800); ctx.restore();
          const itc = it === 'p1' ? col.accent : D.P2;
          D.text(ctx, `${label(it)} is it`, W / 2, H * 0.4 + 44, 15, itc, 800);
          D.text(ctx, `Round ${round + 1} · ${map.name}`, W / 2, H * 0.4 + 64, 11, col.ink2, 650);
        } else if (phase === 'end') {
          const lose = it, win = other(it);
          banner(col, H * 0.36, `${label(win)} takes the round`, `${label(lose)} was it at 0:00 · ${wins.p1} : ${wins.p2}`);
        } else if (phase === 'over') {
          const win = wins.p1 > wins.p2 ? 'p1' : 'p2';
          const wp = P(win);
          // crown spark over the winner
          if (!wp.dead) D.spark(ctx, wp.x + PW / 2, wp.y - 9 + Math.sin(clock * 5) * 1.5, 6, '#e0a526', clock * 2);
          banner(col, H * 0.3, `${label(win)} wins the match`, `Rounds ${wins.p1} : ${wins.p2}`);
        }
      }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: 'p1', label: 'P1', pips: wins.p1, of: FIRST_TO },
          right: { who: 'p2', label: 'P2', pips: wins.p2, of: FIRST_TO },
          turn: phase === 'play' || phase === 'count' ? (it === 'p1' ? 'left' : 'right') : null
        }, col);
        const secs = Math.max(0, Math.ceil(timer));
        const hot = phase === 'play' && secs <= 10;
        const ts = hot && !api.reduceMotion ? 1 + 0.12 * Math.max(0, Math.sin(clock * Math.PI * 2)) : 1;
        D.text(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, w / 2, 22, 17 * ts, hot ? (col.bad || '#d9534f') : col.ink, 800);
        D.text(ctx, map.name, w / 2, 39, 9.5, col.ink3, 650);
        const top = 56, avail = h - top - 8;
        const s = Math.min((w - 16) / W, avail / H);
        const ox = (w - W * s) / 2, oy = top + Math.max(0, (avail - H * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 6 * shake);
        drawField(col);
        ctx.restore();
      }

      // ---------- save / restore ----------
      const PF = ['x', 'y', 'vx', 'vy', 'face', 'frozen', 'speedT', 'jumpT', 'ghostT', 'slowT'];
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        return {
          v: 1, mapStart, round, wins: { p1: wins.p1, p2: wins.p2 }, it, firstIt, timer, phase, phaseT, itemT, tagCool,
          items: items.map(i => ({ x: i.x, y: i.y, type: i.type })),
          ps: players.map(p => { const o = {}; PF.forEach(k => { o[k] = p[k]; }); o.dead = p.dead; return o; })
        };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        if (!s || s.v !== 1 || !num(s.mapStart) || s.mapStart < 0 || s.mapStart >= MAPS.length || !num(s.round) || s.round < 0 || s.round > 8) return false;
        if (!s.wins || !num(s.wins.p1) || !num(s.wins.p2) || s.wins.p1 >= FIRST_TO || s.wins.p2 >= FIRST_TO) return false;
        if (!['p1', 'p2'].includes(s.it) || !['p1', 'p2'].includes(s.firstIt) || !['count', 'play', 'end'].includes(s.phase)) return false;
        if (!Array.isArray(s.ps) || s.ps.length !== 2 || !s.ps.every(p => PF.every(k => num(p[k])))) return false;
        if (!num(s.timer) || !num(s.phaseT) || !num(s.itemT) || !num(s.tagCool) || !Array.isArray(s.items)) return false;
        mapStart = s.mapStart; round = s.round; wins = { p1: s.wins.p1, p2: s.wins.p2 }; firstIt = s.firstIt;
        mapIdx = (mapStart + round) % MAPS.length; map = buildMap(mapIdx);
        it = s.it; timer = s.timer; phase = s.phase; phaseT = s.phaseT; itemT = s.itemT; tagCool = s.tagCool;
        items = s.items.filter(i => num(i.x) && num(i.y) && POWERS[i.type]).slice(0, 3).map(i => ({ x: i.x, y: i.y, type: i.type, t: 1 }));
        players = ['p1', 'p2'].map((id, k) => { const p = newPlayer(id); PF.forEach(f => { p[f] = s.ps[k][f]; }); p.dead = !!s.ps[k].dead; return p; });
        api.score(Math.max(wins.p1, wins.p2));
        return true;
      }

      // A restored match counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) startMatch();
      if (window.ludusDebug) window.ludusDebug.tag = () => ({ phase, it, wins, timer, tagCool, map: map.name, items: items.length, ps: players.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, ground: p.ground, frozen: p.frozen, wallL: p.wallL, wallR: p.wallR, speedT: p.speedT, jumpT: p.jumpT, ghostT: p.ghostT, slowT: p.slowT })) });
      api.loop(dt => { if (!api.ended || phase === 'over') update(dt); render(); });
      return {
        save,
        pause() { pads.clear(); },
        resume() { pads.clear(); }
      };
    }
  });
})();
