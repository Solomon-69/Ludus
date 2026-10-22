/* Minesweeper: first click is always safe and opens an area. Flags are little Claude sparks. */
(function () {
  const D = Ludus.draw;
  const CONF = [{ c: 9, r: 9, m: 10 }, { c: 12, r: 12, m: 24 }, { c: 14, r: 16, m: 40 }];
  const NUM_LIGHT = ['', '#3f78b8', '#3f8a57', '#c8434f', '#6f4fb0', '#a8571c', '#21898b', '#3b342c', '#8a8076'];
  const NUM_DARK = ['', '#8db6ea', '#7fc497', '#f08a8f', '#b49be6', '#e7a46a', '#6fcfd0', '#e8e0d4', '#a99f92'];
  const HEADER = 38;

  // ---------- pure rules (no drawing) ----------
  function makeBoard(cols, rows) {
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y, mine: false, n: 0, open: false, flag: false, openAt: 0, flagAt: 0, boom: false });
    return { cols, rows, cells, opened: 0, mines: 0 };
  }
  function at(b, x, y) { return x < 0 || y < 0 || x >= b.cols || y >= b.rows ? null : b.cells[y * b.cols + x]; }
  function around(b, c) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const o = at(b, c.x + dx, c.y + dy); if (o) out.push(o);
    }
    return out;
  }
  // Mines go anywhere except the first clicked cell and its neighbours, so the first click opens an area.
  function placeMines(b, count, safe, rnd) {
    rnd = rnd || Math.random;
    const banned = new Set([safe, ...around(b, safe)]);
    let pool = b.cells.filter(c => !banned.has(c));
    if (pool.length < count) pool = b.cells.filter(c => c !== safe);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    pool.slice(0, count).forEach(c => { c.mine = true; });
    b.mines = Math.min(count, pool.length);
    b.cells.forEach(c => { c.n = around(b, c).filter(o => o.mine).length; });
  }
  // Opens a cell and floods through zeros. Returns the opened cells with their flood depth.
  function flood(b, start) {
    const out = [];
    if (start.open || start.flag || start.mine) return out;
    const q = [[start, 0]]; start.open = true; b.opened++;
    while (q.length) {
      const [c, d] = q.shift(); out.push([c, d]);
      if (c.n) continue;
      around(b, c).forEach(o => {
        if (o.open || o.flag || o.mine) return;
        o.open = true; b.opened++; q.push([o, d + 1]);
      });
    }
    return out;
  }
  function solved(b) { return b.opened === b.cells.length - b.mines; }

  function mineIcon(ctx, x, y, r, color) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, r * 0.22); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * r * 1.3, y - Math.sin(a) * r * 1.3); ctx.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
  }

  Ludus.register({
    id: 'mines', name: 'Minesweeper', tag: 'Puzzle', tint: '#9b6dd6',
    hint: 'Click: open · right-click or hold: flag · click a number: clear round it · <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> <kbd>Space</kbd> open <kbd>F</kbd> flag',
    _rules: { makeBoard, placeMines, flood, around, at, solved },
    art(ctx, w, h) {
      const s = Math.min(h * 0.2, w * 0.1), gap = s * 0.14;
      const cols = 5, rows = 3;
      const ox = (w - (s * cols + gap * (cols - 1))) / 2, oy = (h - (s * rows + gap * (rows - 1))) / 2;
      const map = ['c1o2f', 'o1oco', 'm1o1c'];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = map[r][c], x = ox + c * (s + gap), y = oy + r * (s + gap);
        ctx.fillStyle = k === 'c' || k === 'f' ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.32)';
        D.roundRect(ctx, x, y, s, s, s * 0.24); ctx.fill();
        if (k === '1' || k === '2') D.text(ctx, k, x + s / 2, y + s / 2 + 1, s * 0.56, k === '1' ? '#3f2a66' : '#fff', 800);
        if (k === 'f') D.spark(ctx, x + s / 2, y + s / 2, s * 0.32, '#d97757', 0.2);
        if (k === 'm') mineIcon(ctx, x + s / 2, y + s / 2, s * 0.2, '#2b2140');
      }
    },
    create(stage, api) {
      const conf = CONF[api.level], mult = api.level + 1;
      const view = api.canvas();
      const { ctx, canvas } = view;
      const b = makeBoard(conf.c, conf.r);
      let state = 'ready', time = 0, clock = 0, flags = 0, flagMode = false, shake = 0;
      let hover = null, press = null, pressSeq = 0, endAt = 0;
      const cursor = { x: Math.floor(conf.c / 2), y: Math.floor(conf.r / 2), show: false };
      const lay = { ox: 0, oy: 0, cell: 20, pill: { x: 0, y: 0, w: 0, h: 0 } };
      api.score(0);
      // Saved game: { conf: [c, r, m], mines: [idx], open: [idx], flags: [idx], time, flagMode }.
      function restore(v) {
        try {
          if (!v || !Array.isArray(v.conf) || v.conf[0] !== conf.c || v.conf[1] !== conf.r || v.conf[2] !== conf.m) return;
          const n = b.cells.length, ok = a => Array.isArray(a) && a.every(i => Number.isInteger(i) && i >= 0 && i < n);
          if (!ok(v.mines) || !ok(v.open) || !ok(v.flags) || new Set(v.mines).size !== conf.m) return;
          if (v.open.some(i => v.mines.includes(i))) return;
          v.mines.forEach(i => { b.cells[i].mine = true; });
          b.mines = conf.m;
          b.cells.forEach(c => { c.n = around(b, c).filter(o => o.mine).length; });
          v.open.forEach(i => { const c = b.cells[i]; c.open = true; c.openAt = -1; b.opened++; });
          v.flags.forEach(i => { const c = b.cells[i]; if (!c.open) { c.flag = true; c.flagAt = -1; flags++; } });
          time = Number.isFinite(v.time) ? v.time : 0; flagMode = !!v.flagMode; state = 'play';
        } catch (e) {
          b.cells.forEach(c => Object.assign(c, { mine: false, n: 0, open: false, flag: false })); b.opened = 0; b.mines = 0;
          flags = 0; time = 0; state = 'ready';
        }
      }
      const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

      function reveal(c) {
        if (state === 'won' || state === 'lost' || c.open || c.flag) return;
        if (state === 'ready') { placeMines(b, conf.m, c); state = 'play'; }
        if (c.mine) { lose(c); return; }
        const opened = flood(b, c);
        opened.forEach(([o, d]) => { o.openAt = clock + Math.min(d * 0.028, 0.6); });
        api.sfx(opened.length > 6 ? 'merge' : 'click');
        if (solved(b)) win();
      }
      function chord(c) {
        if (!c.open || !c.n || state !== 'play') return false;
        const near = around(b, c);
        if (near.filter(o => o.flag).length !== c.n) return false;
        const todo = near.filter(o => !o.open && !o.flag);
        if (!todo.length) return false;
        const bad = todo.find(o => o.mine);
        if (bad) { lose(bad); return true; }
        todo.forEach(o => reveal(o));
        return true;
      }
      function toggleFlag(c) {
        if (state === 'won' || state === 'lost' || c.open) return;
        c.flag = !c.flag; c.flagAt = clock; flags += c.flag ? 1 : -1;
        api.sfx(c.flag ? 'tap' : 'move');
      }
      function act(c, asFlag) {
        if (asFlag) { if (c.open) chord(c); else toggleFlag(c); return; }
        if (c.open) { if (!chord(c)) api.sfx('tick'); return; }
        reveal(c);
      }
      let boomCell = null, boomAt = 0;
      function lose(hit) {
        boomCell = hit; boomAt = clock;
        state = 'lost'; hit.boom = true; hit.open = true; hit.openAt = clock;
        b.cells.forEach(o => {
          if (o.mine && o !== hit && !o.flag) { o.open = true; o.openAt = clock + 0.15 + Math.hypot(o.x - hit.x, o.y - hit.y) * 0.04; }
        });
        api.sfx('boom'); if (!api.reduceMotion) shake = 1;
        api.timeout(() => api.over({ score: 0, title: 'Boom', won: false, message: `Time ${fmt(time)}` }), 1500);
      }
      function win() {
        state = 'won'; endAt = clock;
        b.cells.forEach(o => { if (o.mine && !o.flag) { o.flag = true; o.flagAt = clock + 0.3; flags++; } });
        const score = Math.max(50, Math.round(1000 - time * 5)) * mult;
        api.score(score); api.sfx('line');
        api.timeout(() => api.over({ score, title: 'Cleared', won: true, message: `Time ${fmt(time)}` }), 1100);
      }

      // ---------- input ----------
      function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      function cellAt(p) {
        const x = Math.floor((p.x - lay.ox) / lay.cell), y = Math.floor((p.y - lay.oy) / lay.cell);
        return at(b, x, y);
      }
      function inPill(p) { const q = lay.pill; return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h; }

      api.on(canvas, 'contextmenu', e => e.preventDefault());
      api.on(canvas, 'pointerdown', e => {
        const p = local(e);
        if (inPill(p) && e.button === 0) { flagMode = !flagMode; api.sfx('click'); return; }
        const c = cellAt(p); if (!c) return;
        cursor.show = false;
        const id = ++pressSeq;
        press = { id, sx: e.clientX, sy: e.clientY, c, done: false };
        if (e.button === 2 || e.altKey || e.ctrlKey) { press.done = true; act(c, true); return; }
        if (e.button !== 0) { press = null; return; }
        api.timeout(() => {
          if (press && press.id === id && !press.done) { press.done = true; act(c, !flagMode); }
        }, 350);
      });
      api.on(canvas, 'pointermove', e => {
        const p = local(e); hover = cellAt(p);
        if (press && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 12) press.done = true;
      });
      api.on(canvas, 'pointerleave', () => { hover = null; });
      api.on(window, 'pointerup', () => {
        if (!press) return;
        const pr = press; press = null;
        if (!pr.done) act(pr.c, flagMode);
      });
      api.on(window, 'pointercancel', () => { press = null; });
      api.keys(e => {
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (mv) {
          if (cursor.show) { cursor.x = Math.max(0, Math.min(conf.c - 1, cursor.x + mv[0])); cursor.y = Math.max(0, Math.min(conf.r - 1, cursor.y + mv[1])); }
          cursor.show = true; api.sfx('tick'); return;
        }
        const c = at(b, cursor.x, cursor.y);
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cursor.show = true; act(c, false); }
        else if (e.key === 'f' || e.key === 'F') { cursor.show = true; act(c, true); }
      });

      // ---------- render ----------
      function render(t) {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const pad = 10;
        const cell = Math.floor(Math.min((w - pad * 2) / conf.c, (h - pad * 2 - HEADER) / conf.r));
        lay.cell = cell;
        lay.ox = Math.round((w - cell * conf.c) / 2);
        // Sit the board high, so the result bar at the end covers as little of it as possible.
        const free = Math.max(0, h - HEADER - cell * conf.r - pad);
        lay.oy = Math.round(HEADER + Math.min(free, 8 + free * 0.25));
        const nums = col.dark ? NUM_DARK : NUM_LIGHT;

        // header: mines left, dig/flag mode switch, timer
        const hy = Math.max(20, lay.oy - 22);
        mineIcon(ctx, lay.ox + 8, hy, 4.5, col.ink2);
        D.text(ctx, String(conf.m - flags), lay.ox + 20, hy + 1, 14, col.ink, 700, 'left');
        D.text(ctx, fmt(time), lay.ox + cell * conf.c, hy + 1, 14, col.ink, 700, 'right');
        const pw = 92, ph = 26;
        lay.pill = { x: w / 2 - pw / 2, y: hy - ph / 2, w: pw, h: ph };
        ctx.fillStyle = col.dark ? '#221e1a' : '#efe7da';
        D.roundRect(ctx, lay.pill.x, lay.pill.y, pw, ph, ph / 2); ctx.fill();
        const knobX = lay.pill.x + 3 + (flagMode ? pw / 2 - 3 : 0);
        ctx.fillStyle = flagMode ? col.accent : col.surface;
        D.roundRect(ctx, knobX, lay.pill.y + 3, pw / 2 - 3, ph - 6, (ph - 6) / 2); ctx.fill();
        D.text(ctx, 'Dig', lay.pill.x + pw / 4 + 1, hy + 1, 11.5, flagMode ? col.ink3 : col.ink, 700);
        D.text(ctx, 'Flag', lay.pill.x + pw * 0.75 - 1, hy + 1, 11.5, flagMode ? '#fff8f2' : col.ink3, 700);

        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 7 * shake, (Math.random() - 0.5) * 7 * shake);
        ctx.fillStyle = col.dark ? '#1f1b17' : '#e6dccd';
        D.roundRect(ctx, lay.ox - 4, lay.oy - 4, cell * conf.c + 8, cell * conf.r + 8, 12); ctx.fill();

        const g = Math.max(1, Math.round(cell * 0.06)), rr = Math.max(3, cell * 0.2);
        const cover = col.dark ? '#423b33' : '#fbf6ee';
        const openBg = col.dark ? '#2b2621' : '#efe6d8';
        b.cells.forEach(c => {
          const x = lay.ox + c.x * cell, y = lay.oy + c.y * cell;
          const showOpen = c.open && clock >= c.openAt;
          if (showOpen) {
            ctx.fillStyle = c.boom ? col.bad : openBg;
            D.roundRect(ctx, x + g, y + g, cell - g * 2, cell - g * 2, rr * 0.7); ctx.fill();
            if (c.mine) mineIcon(ctx, x + cell / 2, y + cell / 2, cell * 0.17, c.boom ? '#fff8f2' : col.ink);
            else if (c.n) D.text(ctx, String(c.n), x + cell / 2, y + cell / 2 + 1, cell * 0.56, nums[c.n], 800);
          }
          // the cover tile pops away when a cell opens
          const k = c.open ? (clock - c.openAt) / 0.2 : -1;
          if (!c.open || k < 1) {
            let s = 1, a = 1;
            if (c.open && k >= 0) { if (api.reduceMotion) return; s = 1 - D.ease.outCubic(k) * 0.5; a = 1 - k; }
            ctx.save(); ctx.globalAlpha = a;
            ctx.translate(x + cell / 2, y + cell / 2); ctx.scale(s, s);
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(120,90,60,0.16)';
            D.roundRect(ctx, -cell / 2 + g, -cell / 2 + g + 1.5, cell - g * 2, cell - g * 2, rr); ctx.fill();
            const hot = hover === c && state !== 'won' && state !== 'lost';
            ctx.fillStyle = hot ? (col.dark ? '#4e463c' : '#ffffff') : cover;
            D.roundRect(ctx, -cell / 2 + g, -cell / 2 + g, cell - g * 2, cell - g * 2, rr); ctx.fill();
            ctx.restore();
          }
          if (c.flag && !c.open) {
            const fk = (clock - c.flagAt) / 0.25;
            if (fk >= 0) {
              const s = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, fk));
              const wrong = state === 'lost' && !c.mine;
              D.spark(ctx, x + cell / 2, y + cell / 2, cell * 0.3 * s, wrong ? col.ink3 : col.accent, api.reduceMotion ? 0 : (1 - Math.min(1, fk)) * 1.2);
              if (wrong) {
                ctx.strokeStyle = col.bad; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
                ctx.moveTo(x + cell * 0.25, y + cell * 0.25); ctx.lineTo(x + cell * 0.75, y + cell * 0.75);
                ctx.moveTo(x + cell * 0.75, y + cell * 0.25); ctx.lineTo(x + cell * 0.25, y + cell * 0.75); ctx.stroke();
              }
            }
          }
        });
        if (state === 'lost' && boomCell) {
          const x = lay.ox + boomCell.x * cell, y = lay.oy + boomCell.y * cell;
          ctx.strokeStyle = col.bad; ctx.lineWidth = 2.5;
          const grow = api.reduceMotion ? 0 : (1 - D.ease.outCubic(Math.min(1, (clock - boomAt) / 0.4))) * cell * 0.5;
          D.roundRect(ctx, x - 2 - grow, y - 2 - grow, cell + 4 + grow * 2, cell + 4 + grow * 2, rr + 2); ctx.stroke();
        }
        if (cursor.show && state !== 'won' && state !== 'lost') {
          ctx.strokeStyle = col.accent; ctx.lineWidth = 2;
          D.roundRect(ctx, lay.ox + cursor.x * cell + 1, lay.oy + cursor.y * cell + 1, cell - 2, cell - 2, rr); ctx.stroke();
        }
        if (state === 'won' && !api.reduceMotion) {
          const k = Math.min(1, (clock - endAt) / 0.9);
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.35;
          ctx.fillStyle = col.good;
          D.roundRect(ctx, lay.ox - 4, lay.oy - 4, cell * conf.c + 8, cell * conf.r + 8, 12); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        if (state === 'ready') {
          const a = api.reduceMotion ? 1 : 0.7 + Math.sin(t * 3) * 0.2;
          ctx.globalAlpha = a;
          D.text(ctx, 'Click any tile to start', w / 2, Math.min(h - 8, lay.oy + cell * conf.r + 12), 11.5, col.ink3, 650);
          ctx.globalAlpha = 1;
        }
      }

      restore(api.saved);
      render(0);
      api.loop((dt, t) => {
        clock += dt;
        if (state === 'play') time += dt;
        if (shake > 0) shake = Math.max(0, shake - dt * 2.5);
        render(t);
      });
      return {
        save() {
          if (state !== 'play') return null;
          const idx = f => b.cells.map((c, i) => (f(c) ? i : -1)).filter(i => i >= 0);
          return { conf: [conf.c, conf.r, conf.m], mines: idx(c => c.mine), open: idx(c => c.open), flags: idx(c => c.flag), time: Math.round(time * 10) / 10, flagMode };
        }
      };
    }
  });
})();
