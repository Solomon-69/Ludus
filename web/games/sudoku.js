/* Sudoku: generated puzzles with exactly one solution. Clue count follows the difficulty.
   Cells are indexed 0..80 (row * 9 + col). Values 0 = empty. Notes are 9-bit masks. */
(function () {
  const D = Ludus.draw;
  const CLUES = [40, 32, 27];
  const MAX_MISTAKES = [0, 5, 3];          // 0 = unlimited
  const ROW = i => Math.floor(i / 9), COL = i => i % 9, BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
    PEERS.push([...s]);
  }

  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function candidates(g, i) {
    let m = 0x1ff;
    for (const p of PEERS[i]) if (g[p]) m &= ~(1 << (g[p] - 1));
    return m;
  }
  // Counts solutions up to `limit` (uses most-constrained-cell first).
  function countSolutions(g, limit) {
    let best = -1, bestM = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = candidates(g, i);
      if (!m) return 0;
      let n = 0; for (let k = m; k; k &= k - 1) n++;
      if (n < bestN) { bestN = n; best = i; bestM = m; if (n === 1) break; }
    }
    if (best < 0) return 1;
    let total = 0;
    for (let v = 1; v <= 9; v++) {
      if (!(bestM & (1 << (v - 1)))) continue;
      g[best] = v;
      total += countSolutions(g, limit - total);
      g[best] = 0;
      if (total >= limit) break;
    }
    return total;
  }
  function fillGrid(g, rnd) {
    const i = g.indexOf(0);
    if (i < 0) return true;
    const m = candidates(g, i);
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
      if (!(m & (1 << (v - 1)))) continue;
      g[i] = v;
      if (fillGrid(g, rnd)) return true;
    }
    g[i] = 0;
    return false;
  }
  function generate(clues, rnd) {
    rnd = rnd || Math.random;
    const sol = Array(81).fill(0);
    fillGrid(sol, rnd);
    const puz = sol.slice();
    let filled = 81;
    for (const i of shuffle([...Array(81).keys()], rnd)) {
      if (filled <= clues) break;
      const keep = puz[i];
      puz[i] = 0;
      if (countSolutions(puz.slice(), 2) !== 1) puz[i] = keep; else filled--;
    }
    return { puzzle: puz, solution: sol };
  }
  function isValidSolution(sol) {
    if (!Array.isArray(sol) || sol.length !== 81) return false;
    for (let i = 0; i < 81; i++) { if (!(sol[i] >= 1 && sol[i] <= 9)) return false; for (const p of PEERS[i]) if (sol[p] === sol[i]) return false; }
    return true;
  }

  Ludus.register({
    id: 'sudoku', name: 'Sudoku', tag: 'Puzzle', tint: '#4b6fae',
    hint: 'Click or <kbd>←↑→↓</kbd> · <kbd>1</kbd>-<kbd>9</kbd> fill · <kbd>N</kbd> notes · <kbd>⌫</kbd> erase · <kbd>Z</kbd> undo',
    _rules: { generate, countSolutions, isValidSolution, PEERS },
    art(ctx, w, h) {
      const s = Math.min(w, h) * 0.7, c = s / 3, ox = (w - s) / 2, oy = (h - s) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; D.roundRect(ctx, ox, oy, s, s, 8); ctx.fill();
      const vals = ['5', '', '3', '', '7', '', '9', '1', ''];
      vals.forEach((v, i) => {
        const x = ox + (i % 3) * c, y = oy + Math.floor(i / 3) * c;
        if (i === 4) { ctx.fillStyle = 'rgba(75,111,174,0.18)'; ctx.fillRect(x + 1, y + 1, c - 2, c - 2); }
        if (v) D.text(ctx, v, x + c / 2, y + c / 2 + 1, c * 0.55, i === 4 ? '#d97757' : '#2b3550', 750);
      });
      ctx.strokeStyle = 'rgba(43,53,80,0.25)'; ctx.lineWidth = 1.5;
      for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(ox + k * c, oy + 4); ctx.lineTo(ox + k * c, oy + s - 4); ctx.moveTo(ox + 4, oy + k * c); ctx.lineTo(ox + s - 4, oy + k * c); ctx.stroke(); }
      D.spark(ctx, ox + s - 2, oy + 2, c * 0.28, '#d97757', 0.2);
    },
    create(stage, api) {
      const lv = api.level;
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let puzzle, solution, vals, notes, mistakes, time, cur, noteMode, state, undo, score, wrongAt, doneAt, flashes;
      const lay = { ox: 0, oy: 0, cell: 30, pad: [], btn: {} };
      let clock = 0;

      function restore(s) {
        if (!s || !isValidSolution(s.solution) || !Array.isArray(s.puzzle) || !Array.isArray(s.vals) || s.vals.length !== 81) return false;
        if (s.puzzle.some((v, i) => v && v !== s.solution[i])) return false;
        puzzle = s.puzzle.slice(); solution = s.solution.slice(); vals = s.vals.map(v => v | 0);
        notes = Array.isArray(s.notes) && s.notes.length === 81 ? s.notes.map(v => v & 0x1ff) : Array(81).fill(0);
        mistakes = s.mistakes | 0; time = +s.time || 0; cur = s.cur >= 0 && s.cur < 81 ? s.cur | 0 : 40;
        noteMode = !!s.noteMode; score = s.score | 0;
        return true;
      }
      if (!restore(api.saved)) {
        const g = generate(CLUES[lv]);
        puzzle = g.puzzle; solution = g.solution; vals = puzzle.slice(); notes = Array(81).fill(0);
        mistakes = 0; time = 0; cur = 40; noteMode = false; score = 0;
      }
      state = 'play'; undo = []; wrongAt = Array(81).fill(-9); doneAt = 0; flashes = [];
      api.score(score);

      const given = i => puzzle[i] !== 0;
      const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      function pushUndo() { undo.push({ v: vals.slice(), n: notes.slice() }); if (undo.length > 120) undo.shift(); }
      function enter(v) {
        if (state !== 'play' || given(cur)) { if (state === 'play') api.sfx('tick'); return; }
        if (noteMode && v) {
          if (vals[cur]) return;
          pushUndo(); notes[cur] ^= 1 << (v - 1); api.sfx('tap'); return;
        }
        if (vals[cur] === v) return;
        pushUndo();
        vals[cur] = v;
        if (!v) { api.sfx('move'); return; }
        notes[cur] = 0;
        if (v !== solution[cur]) {
          mistakes++; wrongAt[cur] = clock; api.sfx('hit');
          const lim = MAX_MISTAKES[lv];
          if (lim && mistakes >= lim) { lose(); return; }
          return;
        }
        // correct: clear this digit from peer notes, award points
        PEERS[cur].forEach(p => { notes[p] &= ~(1 << (v - 1)); });
        score += 10 * (lv + 1); api.score(score);
        const r = ROW(cur), c = COL(cur), b = BOX(cur);
        const full = f => [...Array(81).keys()].filter(f).every(i => vals[i] === solution[i]);
        let groups = 0;
        if (full(i => ROW(i) === r)) { flashes.push({ kind: 'r', k: r, t: clock }); groups++; }
        if (full(i => COL(i) === c)) { flashes.push({ kind: 'c', k: c, t: clock }); groups++; }
        if (full(i => BOX(i) === b)) { flashes.push({ kind: 'b', k: b, t: clock }); groups++; }
        api.sfx(groups ? 'merge' : 'click');
        if (vals.every((x, i) => x === solution[i])) win();
      }
      function win() {
        state = 'won'; doneAt = clock;
        const bonus = Math.max(0, Math.round((900 - time) * (lv + 1)) - mistakes * 40);
        score += Math.max(0, bonus); api.score(score); api.sfx('line');
        api.timeout(() => api.over({ score, title: 'Solved', won: true, message: `Time ${fmt(time)} · ${mistakes} mistake${mistakes === 1 ? '' : 's'}` }), 900);
      }
      function lose() {
        state = 'lost'; doneAt = clock;
        api.timeout(() => api.over({ score, title: 'Too many mistakes', won: false, message: `${vals.filter((x, i) => x && x === solution[i] && !given(i)).length} cells filled` }), 900);
      }
      function doUndo() {
        if (state !== 'play' || !undo.length) return;
        const u = undo.pop(); vals = u.v; notes = u.n; api.sfx('move');
      }
      function moveCur(dx, dy) { cur = ((ROW(cur) + dy + 9) % 9) * 9 + (COL(cur) + dx + 9) % 9; api.sfx('tick'); }

      api.keys(e => {
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (mv) { moveCur(mv[0], mv[1]); return; }
        if (/^[1-9]$/.test(e.key)) { enter(+e.key); return; }
        if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { enter(0); return; }
        if (e.key === 'n' || e.key === 'N') { noteMode = !noteMode; api.sfx('click'); return; }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') doUndo();
      });
      const inR = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      api.on(canvas, 'pointerdown', e => {
        if (e.button !== 0) return;
        const rc = canvas.getBoundingClientRect(), p = { x: e.clientX - rc.left, y: e.clientY - rc.top };
        const cx = Math.floor((p.x - lay.ox) / lay.cell), cy = Math.floor((p.y - lay.oy) / lay.cell);
        if (cx >= 0 && cx < 9 && cy >= 0 && cy < 9) { cur = cy * 9 + cx; api.sfx('tick'); return; }
        const pd = lay.pad.find(b => inR(p, b));
        if (pd) { enter(pd.v); return; }
        if (inR(p, lay.btn.notes)) { noteMode = !noteMode; api.sfx('click'); }
        else if (inR(p, lay.btn.erase)) enter(0);
        else if (inR(p, lay.btn.undo)) doUndo();
      });

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const padH = Math.min(96, h * 0.2), top = 30;
        const size = Math.floor(Math.min(w - 20, h - top - padH - 16) / 9) * 9;
        const cell = size / 9; lay.cell = cell;
        lay.ox = Math.round((w - size) / 2); lay.oy = top + 4 + Math.max(0, Math.floor((h - top - size - padH - 16) / 2));
        const ox = lay.ox, oy = lay.oy;
        // header
        const lim = MAX_MISTAKES[lv];
        const hy = lay.oy - 18;
        D.text(ctx, ['Easy', 'Normal', 'Hard'][lv], ox, hy, 12.5, col.ink2, 700, 'left');
        D.text(ctx, lim ? `Mistakes ${mistakes}/${lim}` : `Mistakes ${mistakes}`, w / 2, hy, 12.5, mistakes ? col.bad : col.ink2, 700);
        D.text(ctx, fmt(time), ox + size, hy, 12.5, col.ink2, 700, 'right');
        // board
        ctx.fillStyle = col.dark ? '#2b2621' : '#fffcf7';
        D.roundRect(ctx, ox - 3, oy - 3, size + 6, size + 6, 12); ctx.fill();
        const cv = vals[cur];
        for (let i = 0; i < 81; i++) {
          const x = ox + COL(i) * cell, y = oy + ROW(i) * cell;
          let bg = null;
          const live = state === 'play';
          if (live && (ROW(i) === ROW(cur) || COL(i) === COL(cur) || BOX(i) === BOX(cur))) bg = col.dark ? 'rgba(255,255,255,0.05)' : 'rgba(75,111,174,0.07)';
          if (live && cv && vals[i] === cv) bg = col.dark ? 'rgba(217,119,87,0.22)' : 'rgba(217,119,87,0.16)';
          if (i === cur && state === 'play') bg = col.dark ? 'rgba(217,119,87,0.38)' : 'rgba(217,119,87,0.3)';
          const wrong = vals[i] && vals[i] !== solution[i];
          if (wrong) bg = col.dark ? 'rgba(209,73,91,0.3)' : 'rgba(209,73,91,0.16)';
          if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, cell, cell); }
          flashes.forEach(f => {
            const k = (clock - f.t) / 0.7; if (k > 1) return;
            const hit = f.kind === 'r' ? ROW(i) === f.k : f.kind === 'c' ? COL(i) === f.k : BOX(i) === f.k;
            if (!hit) return;
            ctx.globalAlpha = Math.sin(k * Math.PI) * 0.35; ctx.fillStyle = col.good; ctx.fillRect(x, y, cell, cell); ctx.globalAlpha = 1;
          });
          if (state === 'won' && !api.reduceMotion) {
            const k = (clock - doneAt) * 2.2 - (ROW(i) + COL(i)) * 0.08;
            if (k > 0 && k < 1) { ctx.globalAlpha = Math.sin(k * Math.PI) * 0.45; ctx.fillStyle = col.good; ctx.fillRect(x, y, cell, cell); ctx.globalAlpha = 1; }
          }
          let v = vals[i], color = given(i) ? col.ink : (wrong ? col.bad : col.accent);
          if (state === 'lost' && !v) { v = solution[i]; color = col.ink3; }
          if (v) {
            const shake = wrong && !api.reduceMotion ? Math.sin((clock - wrongAt[i]) * 40) * Math.max(0, 1 - (clock - wrongAt[i]) / 0.35) * 3 : 0;
            D.text(ctx, String(v), x + cell / 2 + shake, y + cell / 2 + 1, cell * 0.58, color, given(i) ? 700 : 650);
          } else if (notes[i]) {
            for (let d = 0; d < 9; d++) if (notes[i] & (1 << d)) D.text(ctx, String(d + 1), x + (d % 3 + 0.5) * cell / 3, y + (Math.floor(d / 3) + 0.55) * cell / 3, cell * 0.24, col.ink2, 600);
          }
        }
        // grid lines
        for (let k = 0; k <= 9; k++) {
          const thick = k % 3 === 0;
          if (k === 0 || k === 9) continue;
          ctx.strokeStyle = thick ? (col.dark ? 'rgba(255,245,230,0.35)' : 'rgba(32,28,23,0.45)') : col.line;
          ctx.lineWidth = thick ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(ox + k * cell, oy); ctx.lineTo(ox + k * cell, oy + size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox, oy + k * cell); ctx.lineTo(ox + size, oy + k * cell); ctx.stroke();
        }
        ctx.strokeStyle = col.dark ? 'rgba(255,245,230,0.35)' : 'rgba(32,28,23,0.45)'; ctx.lineWidth = 1.6;
        D.roundRect(ctx, ox, oy, size, size, 6); ctx.stroke();
        // number pad + tool buttons
        const py = oy + size + 12, gap = 5;
        const bw = Math.min(40, (size - gap * 8) / 9), rowW = bw * 9 + gap * 8, px = (w - rowW) / 2, bh = Math.min(40, padH * 0.46);
        const counts = Array(10).fill(0); vals.forEach((v, i) => { if (v && v === solution[i]) counts[v]++; });
        lay.pad = [];
        for (let v = 1; v <= 9; v++) {
          const x = px + (v - 1) * (bw + gap), done = counts[v] >= 9;
          lay.pad.push({ x, y: py, w: bw, h: bh, v });
          ctx.fillStyle = col.dark ? '#322d27' : '#f8f3ea';
          D.roundRect(ctx, x, py, bw, bh, 9); ctx.fill();
          D.text(ctx, String(v), x + bw / 2, py + bh / 2 + 1, bh * 0.5, done ? col.ink3 : (noteMode ? col.ink2 : col.ink), 700);
        }
        const ty = py + bh + 7, th = Math.min(28, h - ty - 6), tw = (rowW - gap * 2) / 3;
        const tool = (key, x, label, on) => {
          lay.btn[key] = { x, y: ty, w: tw, h: th };
          ctx.fillStyle = on ? col.accent : (col.dark ? '#322d27' : '#f8f3ea');
          D.roundRect(ctx, x, ty, tw, th, th / 2); ctx.fill();
          D.text(ctx, label, x + tw / 2, ty + th / 2 + 1, 12, on ? '#fff8f2' : col.ink2, 700);
        };
        if (th > 14) {
          tool('notes', px, noteMode ? 'Notes on' : 'Notes off', noteMode);
          tool('erase', px + tw + gap, 'Erase', false);
          tool('undo', px + (tw + gap) * 2, 'Undo', false);
        }
        if (state === 'won') D.spark(ctx, ox + size - 2, oy + 2, 10, col.accent, clock);
      }

      api.loop(dt => { clock += dt; if (state === 'play') time += dt; render(); });
      Ludus.games.find(g => g.id === 'sudoku')._peek = () => ({ puzzle, solution, vals, notes, mistakes, cur, noteMode, state, score, lay });
      return {
        save() {
          if (state !== 'play' || !vals.some((v, i) => v !== puzzle[i]) && !notes.some(Boolean)) return null;
          return { puzzle, solution, vals, notes, mistakes, time: Math.round(time * 10) / 10, cur, noteMode, score };
        }
      };
    }
  });
})();
