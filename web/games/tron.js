/* Light Trails: light-cycles for two people on one keyboard. Don't hit a wall or any trail.
   Best of 5 rounds; a crash at the same moment is a drawn round. Each round is a little faster. */
(function () {
  const D = Ludus.draw;
  const PCOLS = 30, PROWS = 36, LROWS = 24, MAX_COLS = 64, CELL = 12, FIRST_TO = 3, COUNT = 1.8;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Two people, one keyboard: P1 = WASD (+F / left Shift), P2 = arrows (+ / , right Shift, Enter).
  function makePads(api, onPress) {
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act', ShiftLeft: 'act' };
    const K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', ShiftRight: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false });
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
      if (!pads[m[0]][m[1]]) onPress(m[0], m[1]);
      pads[m[0]][m[1]] = true;
    });
    api.keysUp(e => { const m = find(e); if (m) pads[m[0]][m[1]] = false; });
    pads.clear = () => { Object.assign(pads.p1, blank()); Object.assign(pads.p2, blank()); };
    api.on(window, 'blur', pads.clear);
    return pads;
  }

  // One simultaneous step for both riders. Pure, for tests. Returns { crashed: { p1, p2 } }.
  function stepRiders(grid, riders, COLS = PCOLS, ROWS = PROWS) {
    const next = riders.map(r => ({ x: r.x + DIRS[r.dir][0], y: r.y + DIRS[r.dir][1] }));
    const out = (n) => n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS;
    const crashed = next.map(n => out(n) || grid[n.y * COLS + n.x] !== 0);
    if (next[0].x === next[1].x && next[0].y === next[1].y) { crashed[0] = true; crashed[1] = true; }
    if (next[0].x === riders[1].x && next[0].y === riders[1].y && next[1].x === riders[0].x && next[1].y === riders[0].y) { crashed[0] = true; crashed[1] = true; }
    return { next, crashed: { p1: crashed[0], p2: crashed[1] } };
  }

  Ludus.register({
    id: 'tron', name: 'Tron', aka: 'Light Trails', tag: '2 Player', wide: true, tint: '#2a9d9f',
    hint: '<b>P1</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> turn · <b>P2</b> <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> turn · don\'t hit walls or trails',
    _rules: { stepRiders, COLS: PCOLS, ROWS: PROWS },
    art(ctx, w, h) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = h * 0.05;
      ctx.strokeStyle = '#fff8f2'; ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.85); ctx.lineTo(w * 0.15, h * 0.4); ctx.lineTo(w * 0.45, h * 0.4); ctx.lineTo(w * 0.45, h * 0.2); ctx.stroke();
      ctx.strokeStyle = '#5b8def'; ctx.beginPath(); ctx.moveTo(w * 0.85, h * 0.15); ctx.lineTo(w * 0.85, h * 0.62); ctx.lineTo(w * 0.55, h * 0.62); ctx.lineTo(w * 0.55, h * 0.78); ctx.stroke();
      D.spark(ctx, w * 0.45, h * 0.2, h * 0.08, '#fff8f2', 0); D.spark(ctx, w * 0.55, h * 0.78, h * 0.08, '#5b8def', 0);
    },
    create(stage, api) {
      const view = api.canvas(onResize);
      const { ctx } = view;
      // Arena size follows the stage: portrait keeps the classic 30 x 36 grid; landscape gets 24 rows
      // and as many square cells across as fit the width.
      const gridFor = (w, h) => {
        if (w <= h) return [PCOLS, PROWS];
        const s = Math.max(1, h - 64) / (LROWS * CELL + 6);
        return [Math.max(PCOLS, Math.min(MAX_COLS, Math.floor(((w - 16) / s - 6) / CELL))), LROWS];
      };
      let COLS, ROWS, W, H;
      const layout = g => { COLS = g[0]; ROWS = g[1]; W = COLS * CELL; H = ROWS * CELL; };
      // Untransformed stage size (the panel's slide-in scale would skew getBoundingClientRect).
      const dims = () => [stage.clientWidth || view.w, stage.clientHeight || view.h];
      layout(gridFor(...dims()));
      const BASE = [0.1, 0.082, 0.066][api.level];
      let grid, riders, queues, wins, round, phase, phaseT, acc, interval, crash, clock = 0, parts = [], overCalled = false, result = null;
      const pads = makePads(api, (who, k) => {
        if (!DIRS[k] || phase === 'over' || phase === 'end') return;
        const q = queues[who]; if (q.length < 3) q.push(k);
      });

      function startMatch() { wins = { p1: 0, p2: 0 }; round = 0; api.score(0); startRound(); }
      function startRound() {
        grid = new Array(COLS * ROWS).fill(0);
        // portrait: P1 starts low heading up, P2 high heading down; landscape: P1 left heading right, P2 right heading left
        riders = COLS > ROWS ? [
          { id: 'p1', x: Math.floor(COLS * 0.2), y: Math.floor(ROWS * 0.68), dir: 'right', trail: [] },
          { id: 'p2', x: Math.floor(COLS * 0.8) - 1, y: Math.floor(ROWS * 0.32), dir: 'left', trail: [] }
        ] : [
          { id: 'p1', x: Math.floor(COLS * 0.25), y: Math.floor(ROWS * 0.72), dir: 'up', trail: [] },
          { id: 'p2', x: Math.floor(COLS * 0.75) - 1, y: Math.floor(ROWS * 0.28), dir: 'down', trail: [] }
        ];
        riders.forEach((r, i) => { grid[r.y * COLS + r.x] = i + 1; r.trail.push([r.x, r.y]); });
        queues = { p1: [], p2: [] };
        interval = BASE * Math.pow(0.95, round);
        phase = 'count'; phaseT = COUNT; acc = 0; crash = null; result = null;
      }

      function turn(r) {
        const q = queues[r.id];
        while (q.length) {
          const d = q.shift();
          if (d !== r.dir && d !== OPP[r.dir]) { r.dir = d; return; }
        }
      }

      function tick() {
        riders.forEach(turn);
        const { next, crashed } = stepRiders(grid, riders, COLS, ROWS);
        if (crashed.p1 || crashed.p2) {
          crash = { p1: crashed.p1 ? next[0] : null, p2: crashed.p2 ? next[1] : null };
          ['p1', 'p2'].forEach((id, i) => { if (crashed[id]) burst(next[i].x, next[i].y, i === 0 ? api.colors().accent : D.P2); });
          endRound(crashed.p1 && crashed.p2 ? null : crashed.p1 ? 'p2' : 'p1');
          return;
        }
        riders.forEach((r, i) => { r.x = next[i].x; r.y = next[i].y; grid[r.y * COLS + r.x] = i + 1; r.trail.push([r.x, r.y]); });
        interval = Math.max(BASE * 0.6, interval * 0.998);   // the ride slowly speeds up
        api.sfx('tick');
      }

      function endRound(winner) {
        result = winner;
        api.sfx(winner ? 'boom' : 'hit');
        if (winner) { wins[winner]++; api.score(Math.max(wins.p1, wins.p2)); }
        phase = winner && wins[winner] >= FIRST_TO ? 'over' : 'end';
        phaseT = phase === 'over' ? 0.8 : 2;
      }

      function burst(cx, cy, color) {
        if (api.reduceMotion) return;
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
          parts.push({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9, color });
        }
      }

      function update(dt) {
        clock += dt;
        if (phase === 'count') {
          phaseT -= dt;
          if (phaseT <= 0) { phase = 'play'; acc = 0; api.sfx('score'); }
        } else if (phase === 'play') {
          acc += dt;
          let guard = 0;
          while (acc >= interval && phase === 'play' && guard++ < 4) { acc -= interval; tick(); }
        } else {
          phaseT -= dt;
          if (phase === 'end' && phaseT <= 0) { round++; startRound(); }
          if (phase === 'over' && phaseT <= 0 && !overCalled) {
            overCalled = true;
            const win = wins.p1 > wins.p2 ? 'p1' : 'p2';
            api.over({ score: wins[win], won: true, title: (win === 'p1' ? 'P1' : 'P2') + ' wins', message: `Rounds ${Math.max(wins.p1, wins.p2)} to ${Math.min(wins.p1, wins.p2)}` });
          }
        }
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }

      function drawTrail(r, color, col) {
        const t = r.trail; if (!t.length) return;
        const path = () => {
          ctx.beginPath();
          t.forEach(([x, y], i) => { const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = col.dark ? 0.28 : 0.18; ctx.strokeStyle = color; ctx.lineWidth = CELL * 0.95; path(); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = CELL * 0.42; path(); ctx.stroke();
        // the rider: a spinning spark at the head of the trail
        const [hx, hy] = t[t.length - 1];
        const px = (hx + 0.5) * CELL, py = (hy + 0.5) * CELL;
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, CELL * 0.62, 0, Math.PI * 2); ctx.fill();
        D.spark(ctx, px, py, CELL * 0.45, '#fffaf3', api.reduceMotion ? 0 : clock * 4);
      }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: 'p1', label: 'P1', pips: wins.p1, of: FIRST_TO }, right: { who: 'p2', label: 'P2', pips: wins.p2, of: FIRST_TO },
          turn: null, status: phase === 'over' ? '' : `Round ${round + 1}`
        }, col);
        const top = 56, avail = h - top - 8, s = Math.min((w - 16) / W, avail / H);
        const ox = (w - W * s) / 2, oy = top + Math.max(0, (avail - H * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        ctx.fillStyle = col.dark ? '#22201d' : '#fbf6ee'; D.roundRect(ctx, -3, -3, W + 6, H + 6, 12); ctx.fill();
        ctx.strokeStyle = col.line; ctx.lineWidth = 2; D.roundRect(ctx, -3, -3, W + 6, H + 6, 12); ctx.stroke();
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL - 0.75, y * CELL - 0.75, 1.5, 1.5);
        drawTrail(riders[0], col.accent, col);
        drawTrail(riders[1], D.P2, col);
        // crash marks
        if (crash) ['p1', 'p2'].forEach(id => {
          const c = crash[id]; if (!c) return;
          const x = (Math.max(0, Math.min(COLS - 1, c.x)) + 0.5) * CELL, y = (Math.max(0, Math.min(ROWS - 1, c.y)) + 0.5) * CELL;
          ctx.strokeStyle = col.bad || '#d9534f'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(clock * 8); ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        });
        parts.forEach(q => { ctx.globalAlpha = Math.max(0, q.life / 0.9); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        // countdown + direction arrows
        if (phase === 'count') {
          const n = Math.max(1, Math.ceil(phaseT / (COUNT / 3)));
          D.text(ctx, String(n), W / 2, H / 2, 54, col.accent, 800);
          D.text(ctx, `Round ${round + 1}`, W / 2, H / 2 + 40, 13, col.ink2, 700);
          riders.forEach((r, i) => {
            const [dx, dy] = DIRS[r.dir];
            const x = (r.x + 0.5 + dx * 2.2) * CELL, y = (r.y + 0.5 + dy * 2.2) * CELL;
            ctx.strokeStyle = i ? D.P2 : col.accent; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
            // chevron pointing along (dx, dy)
            ctx.beginPath(); ctx.moveTo(x - dx * 4 - dy * 6, y - dy * 4 - dx * 6); ctx.lineTo(x + dx * 3, y + dy * 3); ctx.lineTo(x - dx * 4 + dy * 6, y - dy * 4 + dx * 6); ctx.stroke();
          });
        }
        if (phase === 'end' || phase === 'over') {
          const big = result ? `${result === 'p1' ? 'P1' : 'P2'} ${phase === 'over' ? 'wins the match' : 'takes the round'}` : 'Both crashed. Draw';
          const bw = 240;
          ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          D.roundRect(ctx, W / 2 - bw / 2, H * 0.32 - 26, bw, 52, 16); ctx.fill(); ctx.restore();
          D.text(ctx, big, W / 2, H * 0.32 - 6, 15, col.ink, 800);
          D.text(ctx, `Rounds ${wins.p1} : ${wins.p2}`, W / 2, H * 0.32 + 13, 11, col.ink2, 650);
        }
        ctx.restore();
      }

      // ---------- save / restore ----------
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, cols: COLS, rows: ROWS, wins: { ...wins }, round, phase, phaseT, acc, result, crash, interval,
          riders: riders.map(r => ({ dir: r.dir, trail: r.trail.map(c => c.slice()) })) };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        // A save from an arena of another shape (e.g. an old portrait session) starts fresh.
        // A wide save may come back on a slightly different wide stage: keep its arena and scale it.
        const cols = s && (s.cols === undefined ? PCOLS : s.cols), rows = s && (s.rows === undefined ? PROWS : s.rows);
        if (!s || rows !== ROWS || !Number.isInteger(cols) || cols < PCOLS || cols > MAX_COLS || (rows === PROWS && cols !== PCOLS)) return false;
        if (s.v !== 1 || !s.wins || !num(s.wins.p1) || !num(s.wins.p2) || s.wins.p1 >= FIRST_TO || s.wins.p2 >= FIRST_TO) return false;
        if (!num(s.round) || !['count', 'play', 'end'].includes(s.phase) || !num(s.phaseT) || !num(s.acc)) return false;
        if (!Array.isArray(s.riders) || s.riders.length !== 2) return false;
        const g = new Array(cols * rows).fill(0);
        for (let i = 0; i < 2; i++) {
          const r = s.riders[i];
          if (!r || !DIRS[r.dir] || !Array.isArray(r.trail) || !r.trail.length) return false;
          for (const c of r.trail) {
            if (!Array.isArray(c) || !num(c[0]) || !num(c[1]) || c[0] < 0 || c[1] < 0 || c[0] >= cols || c[1] >= rows) return false;
            g[c[1] * cols + c[0]] = i + 1;
          }
        }
        layout([cols, rows]);
        grid = g; wins = { p1: s.wins.p1, p2: s.wins.p2 }; round = s.round; phase = s.phase; phaseT = s.phaseT; acc = s.acc;
        result = s.result === 'p1' || s.result === 'p2' ? s.result : null;
        crash = s.crash && typeof s.crash === 'object' ? s.crash : null;
        riders = s.riders.map((r, i) => { const t = r.trail.map(c => [c[0], c[1]]); const last = t[t.length - 1]; return { id: i ? 'p2' : 'p1', x: last[0], y: last[1], dir: r.dir, trail: t }; });
        queues = { p1: [], p2: [] };
        interval = num(s.interval) && s.interval > 0.02 && s.interval < 0.2 ? s.interval : BASE * Math.pow(0.95, round);
        api.score(Math.max(wins.p1, wins.p2));
        return true;
      }

      // A restored match counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) startMatch();
      // The panel may still be turning landscape when the game starts: re-fit an untouched match.
      function onResize(w, h) {
        const g = gridFor(...dims());
        if ((g[0] === COLS && g[1] === ROWS) || restored || api.touched || round || wins.p1 || wins.p2 || phase !== 'count') return;
        layout(g); startMatch();
      }
      if (window.ludusDebug) window.ludusDebug.tron = () => ({ COLS, ROWS, phase, wins: { ...wins }, round, result, riders: riders.map(r => ({ x: r.x, y: r.y, dir: r.dir, len: r.trail.length })), interval });
      api.loop(dt => { update(dt); render(); });
      return { save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
