/* Tank Duel: two tanks in a small maze, one keyboard. Shells bounce off walls (and can hit you too).
   Last tank standing takes the round; first to 3 rounds wins. */
(function () {
  const D = Ludus.draw;
  const PMC = 6, PMRW = 7, LROWS = 5, MAX_MC = 14, C = 56, WT = 4, TR = 10, SR = 3;
  const FIRST_TO = 3, MAX_SHELLS = 5, RELOAD = 0.3, SHELL_LIFE = 7, GRACE = 0.25, READY = 1.2, AFTER = 1.8;

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

  // Maze: h[r][c] = wall above cell (r,c) (r 0..MRW), v[r][c] = wall left of cell (r,c) (c 0..MC).
  // Depth-first carve, then knock out some extra walls so there are loops to fight around. Pure, for tests.
  function makeMaze(rnd, MC = PMC, MRW = PMRW) {
    rnd = rnd || Math.random;
    const h = Array.from({ length: MRW + 1 }, () => Array(MC).fill(1));
    const v = Array.from({ length: MRW }, () => Array(MC + 1).fill(1));
    const seen = Array.from({ length: MRW }, () => Array(MC).fill(false));
    const stack = [[Math.floor(rnd() * MRW), Math.floor(rnd() * MC)]];
    seen[stack[0][0]][stack[0][1]] = true;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const opts = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => { const nr = r + dr, nc = c + dc; return nr >= 0 && nc >= 0 && nr < MRW && nc < MC && !seen[nr][nc]; });
      if (!opts.length) { stack.pop(); continue; }
      const [dr, dc] = opts[Math.floor(rnd() * opts.length)], nr = r + dr, nc = c + dc;
      if (dr === -1) h[r][c] = 0; if (dr === 1) h[r + 1][c] = 0; if (dc === -1) v[r][c] = 0; if (dc === 1) v[r][c + 1] = 0;
      seen[nr][nc] = true; stack.push([nr, nc]);
    }
    for (let r = 1; r < MRW; r++) for (let c = 0; c < MC; c++) if (h[r][c] && rnd() < 0.3) h[r][c] = 0;
    for (let r = 0; r < MRW; r++) for (let c = 1; c < MC; c++) if (v[r][c] && rnd() < 0.3) v[r][c] = 0;
    return { h, v };
  }
  function wallRects(maze) {
    const out = [];
    maze.h.forEach((row, r) => row.forEach((on, c) => { if (on) out.push({ x: c * C - WT / 2, y: r * C - WT / 2, w: C + WT, h: WT }); }));
    maze.v.forEach((row, r) => row.forEach((on, c) => { if (on) out.push({ x: c * C - WT / 2, y: r * C - WT / 2, w: WT, h: C + WT }); }));
    return out;
  }

  Ludus.register({
    id: 'tanks', name: 'Tank Duel', tag: '2 Player', wide: true, tint: '#c98a3a',
    hint: '<b>P1</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive <kbd>F</kbd> fire · <b>P2</b> <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> drive <kbd>/</kbd> fire',
    _rules: { makeMaze, wallRects, MC: PMC, MRW: PMRW },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      [[0.1, 0.12, 0.8, 0.04], [0.1, 0.84, 0.8, 0.04], [0.48, 0.12, 0.04, 0.4], [0.1, 0.12, 0.03, 0.76], [0.87, 0.12, 0.03, 0.76], [0.25, 0.5, 0.3, 0.04]].forEach(([x, y, ww, hh]) => { D.roundRect(ctx, w * x, h * y, w * ww, h * hh, 2); ctx.fill(); });
      const tank = (x, y, a, color) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = color; D.roundRect(ctx, -h * 0.09, -h * 0.07, h * 0.18, h * 0.14, h * 0.03); ctx.fill(); ctx.fillRect(0, -h * 0.015, h * 0.13, h * 0.03); ctx.restore(); };
      tank(w * 0.28, h * 0.7, -0.4, '#fff8f2'); tank(w * 0.72, h * 0.32, 2.6, '#5b8def');
      ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.62, h * 0.02, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const view = api.canvas(onResize);
      const { ctx } = view;
      const pads = makePads(api);
      // Maze size follows the stage: portrait keeps the classic 6 x 7 grid; landscape gets 5 rows and
      // as many square cells across as fit the width.
      const gridFor = (w, h) => {
        if (w <= h) return [PMC, PMRW];
        const s = Math.max(1, h - 64) / (LROWS * C + 12);
        return [Math.max(PMC, Math.min(MAX_MC, Math.floor(((w - 16) / s - 12) / C))), LROWS];
      };
      let MC, MRW, W, H;
      const layout = g => { MC = g[0]; MRW = g[1]; W = MC * C; H = MRW * C; };
      // Untransformed stage size (the panel's slide-in scale would skew getBoundingClientRect).
      const dims = () => [stage.clientWidth || view.w, stage.clientHeight || view.h];
      layout(gridFor(...dims()));
      const SPD = [0.9, 1, 1.12][api.level];
      const FWD = 88 * SPD, BACK = 62 * SPD, ROT = 3.1, SHELL_V = 150 * SPD;
      let maze, rects, tanks, shells, wins, round, phase, phaseT, clock = 0, parts = [], scorches = [], overCalled = false, result = null, shake = 0;

      function startMatch() { wins = { p1: 0, p2: 0 }; round = 0; api.score(0); startRound(); }
      function startRound() {
        maze = makeMaze(Math.random, MC, MRW); rects = wallRects(maze);
        const cell = (c0, c1, r0, r1) => [api.randInt(c0, c1), api.randInt(r0, r1)];
        const a = cell(0, 1, MRW - 2, MRW - 1), b = cell(MC - 2, MC - 1, 0, 1);
        const ang = () => api.randInt(0, 3) * Math.PI / 2;
        tanks = [
          { id: 'p1', x: (a[0] + 0.5) * C, y: (a[1] + 0.5) * C, a: ang(), dead: false, cool: 0, tread: 0 },
          { id: 'p2', x: (b[0] + 0.5) * C, y: (b[1] + 0.5) * C, a: ang(), dead: false, cool: 0, tread: 0 }
        ];
        shells = []; scorches = []; result = null;
        phase = 'ready'; phaseT = READY; pads.clear();
      }

      function pushOut(t) {
        for (let it = 0; it < 3; it++) {
          for (const r of rects) {
            const cx = Math.max(r.x, Math.min(t.x, r.x + r.w)), cy = Math.max(r.y, Math.min(t.y, r.y + r.h));
            const dx = t.x - cx, dy = t.y - cy, d = Math.hypot(dx, dy);
            if (d < TR) {
              if (d > 0.0001) { t.x = cx + dx / d * TR; t.y = cy + dy / d * TR; }
              else { t.y += r.w > r.h ? (t.y < r.y + r.h / 2 ? -TR : TR) : 0; t.x += r.w > r.h ? 0 : (t.x < r.x + r.w / 2 ? -TR : TR); }
            }
          }
        }
        t.x = Math.max(TR, Math.min(W - TR, t.x)); t.y = Math.max(TR, Math.min(H - TR, t.y));
      }
      const inWall = (x, y, pad) => rects.some(r => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);

      function drive(t, dt) {
        const p = pads[t.id];
        const fire = pads.take(t.id, 'act');
        t.cool = Math.max(0, t.cool - dt);
        if (t.dead || phase === 'ready' || phase === 'over') return;
        const turn = (p.right ? 1 : 0) - (p.left ? 1 : 0), go = (p.up ? 1 : 0) - (p.down ? 1 : 0);
        t.a += turn * ROT * dt;
        const sp = go > 0 ? FWD : go < 0 ? -BACK : 0;
        t.x += Math.cos(t.a) * sp * dt; t.y += Math.sin(t.a) * sp * dt;
        if (sp || turn) t.tread += dt * (Math.abs(sp) + 40);
        pushOut(t);
        if (fire && t.cool <= 0 && shells.filter(s => s.owner === t.id).length < MAX_SHELLS) {
          t.cool = RELOAD;
          let sx = t.x + Math.cos(t.a) * (TR + 5), sy = t.y + Math.sin(t.a) * (TR + 5);
          if (inWall(sx, sy, SR)) { sx = t.x; sy = t.y; }
          shells.push({ x: sx, y: sy, vx: Math.cos(t.a) * SHELL_V, vy: Math.sin(t.a) * SHELL_V, life: SHELL_LIFE, owner: t.id, age: 0 });
          api.sfx('click');
          t.kick = 1;
        }
      }

      function moveShell(s, dt) {
        const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 2));
        for (let i = 0; i < n; i++) {
          s.x += s.vx * dt / n;
          if (inWall(s.x, s.y, SR) || s.x < SR || s.x > W - SR) { s.x -= s.vx * dt / n; s.vx = -s.vx; s.bounce = clock; }
          s.y += s.vy * dt / n;
          if (inWall(s.x, s.y, SR) || s.y < SR || s.y > H - SR) { s.y -= s.vy * dt / n; s.vy = -s.vy; s.bounce = clock; }
          for (const t of tanks) {
            if (t.dead || (t.id === s.owner && s.age < GRACE)) continue;
            if (Math.hypot(t.x - s.x, t.y - s.y) < TR + SR - 1) { s.life = 0; kill(t); return; }
          }
        }
        if (s.bounce === clock) api.sfx('tick');
      }

      function kill(t) {
        t.dead = true; scorches.push({ x: t.x, y: t.y });
        burst(t.x, t.y, 30, t.id === 'p1' ? api.colors().accent : D.P2);
        api.sfx('boom'); if (!api.reduceMotion) shake = 1;
        if (phase === 'play') { phase = 'end'; phaseT = AFTER; }
      }

      function settle() {
        const alive = tanks.filter(t => !t.dead);
        result = alive.length === 1 ? alive[0].id : null;
        if (result) { wins[result]++; api.score(Math.max(wins.p1, wins.p2)); }
        if (result && wins[result] >= FIRST_TO) { phase = 'over'; phaseT = 0.8; api.sfx('line'); }
        else { phase = 'result'; phaseT = 1.4; if (!result) api.sfx('hit'); else api.sfx('score'); }
      }

      function burst(x, y, n, color) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 150;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9, color: i % 3 ? color : '#e0a526' });
        }
      }

      function update(dt) {
        clock += dt; shake = Math.max(0, shake - dt * 2.5);
        tanks.forEach(t => { drive(t, dt); t.kick = Math.max(0, (t.kick || 0) - dt * 6); });
        // tanks don't drive through each other
        const [a, b] = tanks;
        if (!a.dead && !b.dead) {
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < TR * 2 && d > 0) { const k = (TR * 2 - d) / 2; a.x -= dx / d * k; a.y -= dy / d * k; b.x += dx / d * k; b.y += dy / d * k; pushOut(a); pushOut(b); }
        }
        if (phase === 'play' || phase === 'end') {
          shells.forEach(s => { s.age += dt; s.life -= dt; if (s.life > 0) moveShell(s, dt); });
          shells = shells.filter(s => s.life > 0);
        }
        if (phase === 'ready') { phaseT -= dt; if (phaseT <= 0) { phase = 'play'; api.sfx('score'); } }
        else if (phase === 'end') { phaseT -= dt; if (phaseT <= 0) settle(); }
        else if (phase === 'result') { phaseT -= dt; if (phaseT <= 0) { round++; startRound(); } }
        else if (phase === 'over') {
          phaseT -= dt;
          if (phaseT <= 0 && !overCalled) {
            overCalled = true;
            const win = wins.p1 > wins.p2 ? 'p1' : 'p2';
            api.over({ score: wins[win], won: true, title: (win === 'p1' ? 'P1' : 'P2') + ' wins', message: `Rounds ${Math.max(wins.p1, wins.p2)} to ${Math.min(wins.p1, wins.p2)}` });
          }
        }
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }

      function drawTank(t, col) {
        const color = t.dead ? col.ink3 : t.id === 'p1' ? col.accent : D.P2;
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.a);
        if (t.dead) ctx.globalAlpha = 0.55;
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.15)'; D.roundRect(ctx, -11 + 1.5, -9 + 2, 22, 18, 4); ctx.fill();
        // treads
        ctx.fillStyle = col.dark ? '#1c1916' : '#3b2f26';
        D.roundRect(ctx, -11, -9.5, 22, 5, 2.5); ctx.fill(); D.roundRect(ctx, -11, 4.5, 22, 5, 2.5); ctx.fill();
        ctx.fillStyle = col.dark ? '#4a4138' : '#8a7a68';
        for (let i = 0; i < 4; i++) { const x = -9 + ((i * 5.5 + t.tread * 0.25) % 22); ctx.fillRect(x, -9.5, 1.4, 5); ctx.fillRect(x, 4.5, 1.4, 5); }
        // body + turret
        ctx.fillStyle = color; D.roundRect(ctx, -9, -6, 18, 12, 3.5); ctx.fill();
        const k = t.kick || 0;
        ctx.fillStyle = color; ctx.fillRect(2 - k * 2, -2, 13 - k * 2, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(13 - k * 4, -2, 2, 4);
        ctx.beginPath(); ctx.arc(-1, 0, 5.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.rotate(-t.a); D.spark(ctx, -Math.cos(t.a), -Math.sin(t.a), 3.6, '#fffaf3', 0);
        ctx.restore();
      }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: 'p1', label: 'P1', pips: wins.p1, of: FIRST_TO }, right: { who: 'p2', label: 'P2', pips: wins.p2, of: FIRST_TO },
          turn: null, status: phase === 'over' ? '' : `Round ${round + 1}`
        }, col);
        const top = 56, avail = h - top - 8, s = Math.min((w - 16) / (W + 12), avail / (H + 12));
        const ox = (w - W * s) / 2, oy = top + 6 * s + Math.max(0, (avail - (H + 12) * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 6 * shake);
        ctx.fillStyle = col.dark ? '#2a2520' : '#fbf6ee'; D.roundRect(ctx, -6, -6, W + 12, H + 12, 12); ctx.fill();
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';
        for (let r = 0; r < MRW; r++) for (let c = 0; c < MC; c++) if ((r + c) % 2) ctx.fillRect(c * C, r * C, C, C);
        scorches.forEach(q => { ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.45)' : 'rgba(60,40,20,0.18)'; ctx.beginPath(); ctx.arc(q.x, q.y, 15, 0, Math.PI * 2); ctx.fill(); });
        ctx.fillStyle = col.dark ? '#8a7f73' : '#5c4d40';
        rects.forEach(r => { D.roundRect(ctx, r.x, r.y, r.w, r.h, WT / 2); ctx.fill(); });
        tanks.forEach(t => { if (t.dead) drawTank(t, col); });
        tanks.forEach(t => { if (!t.dead) drawTank(t, col); });
        shells.forEach(sh => {
          const color = sh.owner === 'p1' ? col.accent : D.P2;
          ctx.fillStyle = color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(sh.x, sh.y, SR * 2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = sh.life < 1 ? sh.life : 1; ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(sh.x, sh.y, SR, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        });
        parts.forEach(q => { ctx.globalAlpha = Math.max(0, q.life / 0.9); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        const card = (big, small, y) => {
          const bw = 236;
          ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          D.roundRect(ctx, W / 2 - bw / 2, y - 26, bw, 52, 16); ctx.fill(); ctx.restore();
          D.text(ctx, big, W / 2, y - 6, 15, col.ink, 800); D.text(ctx, small, W / 2, y + 13, 11, col.ink2, 650);
        };
        if (phase === 'ready') {
          card(`Round ${round + 1}`, 'Ready...', H / 2);
          tanks.forEach(t => { ctx.strokeStyle = t.id === 'p1' ? col.accent : D.P2; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 10); ctx.beginPath(); ctx.arc(t.x, t.y, 17, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; });
        } else if (phase === 'result') card(result ? `${result === 'p1' ? 'P1' : 'P2'} takes the round` : 'Both tanks down. Draw', `Rounds ${wins.p1} : ${wins.p2}`, H * 0.4);
        else if (phase === 'over') card(`${result === 'p1' ? 'P1' : 'P2'} wins the match`, `Rounds ${wins.p1} : ${wins.p2}`, H * 0.4);
        ctx.restore();
      }

      // ---------- save / restore ----------
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, mc: MC, mr: MRW, wins: { ...wins }, round, phase, phaseT, result,
          maze: { h: maze.h.map(r => r.join('')), v: maze.v.map(r => r.join('')) },
          tanks: tanks.map(t => ({ x: t.x, y: t.y, a: t.a, dead: t.dead, cool: t.cool })),
          shells: shells.map(s => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, life: s.life, owner: s.owner, age: s.age })),
          scorches: scorches.map(q => ({ x: q.x, y: q.y })) };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        // A save from a maze of another shape (e.g. an old portrait session) starts fresh.
        // A wide save may come back on a slightly different wide stage: keep its maze and scale it.
        const mc = s && (s.mc === undefined ? PMC : s.mc), mr = s && (s.mr === undefined ? PMRW : s.mr);
        if (!s || mr !== MRW || !Number.isInteger(mc) || mc < PMC || mc > MAX_MC || (mr === PMRW && mc !== PMC)) return false;
        if (s.v !== 1 || !s.wins || !num(s.wins.p1) || !num(s.wins.p2) || s.wins.p1 >= FIRST_TO || s.wins.p2 >= FIRST_TO) return false;
        if (!num(s.round) || !['ready', 'play', 'end', 'result'].includes(s.phase) || !num(s.phaseT)) return false;
        const bits = (arr, n, len) => Array.isArray(arr) && arr.length === n && arr.every(r => typeof r === 'string' && r.length === len && /^[01]+$/.test(r));
        if (!s.maze || !bits(s.maze.h, mr + 1, mc) || !bits(s.maze.v, mr, mc + 1)) return false;
        if (!Array.isArray(s.tanks) || s.tanks.length !== 2 || !s.tanks.every(t => num(t.x) && num(t.y) && num(t.a) && num(t.cool))) return false;
        if (!Array.isArray(s.shells) || !s.shells.every(q => ['x', 'y', 'vx', 'vy', 'life', 'age'].every(k => num(q[k])) && (q.owner === 'p1' || q.owner === 'p2'))) return false;
        layout([mc, mr]);
        maze = { h: s.maze.h.map(r => r.split('').map(Number)), v: s.maze.v.map(r => r.split('').map(Number)) };
        rects = wallRects(maze);
        wins = { p1: s.wins.p1, p2: s.wins.p2 }; round = s.round; phase = s.phase; phaseT = s.phaseT;
        result = s.result === 'p1' || s.result === 'p2' ? s.result : null;
        tanks = s.tanks.map((t, i) => ({ id: i ? 'p2' : 'p1', x: t.x, y: t.y, a: t.a, dead: !!t.dead, cool: t.cool, tread: 0 }));
        shells = s.shells.slice(0, MAX_SHELLS * 2).map(q => ({ ...q }));
        scorches = Array.isArray(s.scorches) ? s.scorches.filter(q => num(q.x) && num(q.y)).slice(0, 4) : [];
        api.score(Math.max(wins.p1, wins.p2));
        return true;
      }

      // A restored match counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) startMatch();
      // The panel may still be turning landscape when the game starts: re-fit an untouched match.
      function onResize(w, h) {
        const g = gridFor(...dims());
        if ((g[0] === MC && g[1] === MRW) || restored || api.touched || round || wins.p1 || wins.p2 || phase !== 'ready') return;
        layout(g); startMatch();
      }
      if (window.ludusDebug) window.ludusDebug.tanks = () => ({ MC, MRW, phase, wins: { ...wins }, round, result, shells: shells.length, tanks: tanks.map(t => ({ x: t.x, y: t.y, a: t.a, dead: t.dead })), rects: rects.map(r => [r.x, r.y, r.w, r.h]) });
      api.loop(dt => { update(dt); render(); });
      return { save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
