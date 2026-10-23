/* Pairs: flip two cards at a time and find every matching pair. Symbols are drawn in code. */
(function () {
  const D = Ludus.draw;
  const SIZES = [[4, 3], [4, 4], [5, 4]];          // cols x rows per difficulty
  const FLIP_BACK = [950, 800, 600];               // ms a wrong pair stays visible
  const FLIP_T = 0.22;                             // seconds for a flip
  const COLORS = ['#d97757', '#3f8fb5', '#4f9d69', '#9b6dd6', '#e0a526', '#e05d8b', '#2a9d9f', '#c4633f', '#5b8def', '#7a8a3a'];
  const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'star', 'heart', 'moon', 'spark', 'hexagon', 'ring', 'plus', 'wave', 'leaf', 'bolt'];
  const HEAD = 48;

  function layout(w, h, cols, rows) {
    const top = HEAD + 6, pad = 12, gap = Math.max(6, Math.min(10, w * 0.02));
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols, ch = (h - top - pad - 8 - gap * (rows - 1)) / rows;
    const cardW = Math.min(cw, ch * 0.8, 92), cardH = Math.min(ch, cardW * 1.3);
    const gw = cardW * cols + gap * (cols - 1), gh = cardH * rows + gap * (rows - 1);
    const ox = (w - gw) / 2, oy = top + (h - top - pad - gh) / 2;
    return { cardW, cardH, gap, ox, oy, at: i => ({ x: ox + (i % cols) * (cardW + gap), y: oy + Math.floor(i / cols) * (cardH + gap) }) };
  }

  function shape(ctx, kind, x, y, r, color) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = r * 0.24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const poly = (n, rad, rot) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); };
    switch (kind) {
      case 'circle': ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill(); break;
      case 'triangle': poly(3, r * 0.95, -Math.PI / 2); ctx.fill(); ctx.stroke(); break;
      case 'square': D.roundRect(ctx, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.25); ctx.fill(); break;
      case 'diamond': poly(4, r * 0.95, 0); ctx.fill(); break;
      case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); break;
      case 'heart': ctx.beginPath(); ctx.moveTo(0, r * 0.85);
        ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.85); ctx.fill(); break;
      case 'moon': ctx.beginPath(); ctx.arc(0, 0, r * 0.85, Math.PI * 0.3, Math.PI * 1.7); ctx.arc(r * 0.35, -r * 0.0, r * 0.62, Math.PI * 1.55, Math.PI * 0.45, true); ctx.closePath(); ctx.fill(); break;
      case 'spark': D.spark(ctx, 0, 0, r, color, 0); break;
      case 'hexagon': poly(6, r * 0.88, 0); ctx.fill(); break;
      case 'ring': ctx.lineWidth = r * 0.32; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke(); break;
      case 'plus': ctx.lineWidth = r * 0.42; ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.stroke(); break;
      case 'wave': ctx.lineWidth = r * 0.26; for (let k = -1; k <= 1; k += 2) { ctx.beginPath(); for (let i = 0; i <= 16; i++) { const px = -r * 0.85 + i * r * 1.7 / 16; ctx[i ? 'lineTo' : 'moveTo'](px, k * r * 0.32 + Math.sin(i / 16 * Math.PI * 2) * r * 0.22); } ctx.stroke(); } break;
      case 'leaf': ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.8); ctx.quadraticCurveTo(-r * 0.8, -r * 0.8, r * 0.8, -r * 0.8); ctx.quadraticCurveTo(r * 0.8, r * 0.8, -r * 0.8, r * 0.8); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.45, -r * 0.45); ctx.stroke(); break;
      case 'bolt': ctx.beginPath(); ctx.moveTo(r * 0.2, -r); ctx.lineTo(-r * 0.55, r * 0.12); ctx.lineTo(-r * 0.02, r * 0.12); ctx.lineTo(-r * 0.2, r); ctx.lineTo(r * 0.55, -r * 0.12); ctx.lineTo(r * 0.02, -r * 0.12); ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
  }

  // every symbol in a deal gets its own colour (same mapping after a restore)
  function colorMap(ids) {
    const kinds = [...new Set(ids)].sort((a, b) => SHAPES.indexOf(a) - SHAPES.indexOf(b));
    const m = {}; kinds.forEach((k, i) => { m[k] = COLORS[i % COLORS.length]; }); return m;
  }
  function fmtTime(s) { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  Ludus.register({
    id: 'pairs', name: 'Memory', aka: 'Pairs', tag: 'Puzzle', tint: '#c06c9a',
    hint: 'Click two cards, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> to choose and <kbd>Space</kbd> to flip',
    _layout: layout, _sizes: SIZES,
    art(ctx, w, h) {
      const cw = Math.min(w, h) * 0.3, ch = cw * 1.3;
      [[-0.62, -0.12], [0, 0], [0.62, 0.12]].forEach(([dx, rot], i) => {
        ctx.save(); ctx.translate(w / 2 + dx * cw * 1.25, h / 2 + 3); ctx.rotate(rot);
        ctx.fillStyle = i === 1 ? '#fffaf2' : 'rgba(255,255,255,0.35)';
        D.roundRect(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.16); ctx.fill();
        if (i === 1) shape(ctx, 'heart', 0, 0, cw * 0.28, '#c06c9a');
        else D.spark(ctx, 0, 0, cw * 0.22, 'rgba(255,255,255,0.8)', 0);
        ctx.restore();
      });
    },
    create(stage, api) {
      const [COLS, ROWS] = SIZES[api.level];
      const N = COLS * ROWS, PAIRS = N / 2;
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx, canvas } = view;
      let cards, open, moves, time, started, found, score, clock = 0, focus = 0, focusShown = false, wrongTimer = null, endAt = -1;
      let lay = layout(view.w, view.h, COLS, ROWS);

      function deal() {
        const kinds = SHAPES.slice().sort(() => Math.random() - 0.5).slice(0, PAIRS);
        const ids = kinds.flatMap(k => [k, k]);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        const tint = colorMap(ids);
        cards = ids.map((k, i) => ({ k, c: tint[k], up: false, done: false, flipAt: -9, pop: -9, deal: i * 0.025 }));
        open = []; moves = 0; time = 0; started = false; found = 0; score = 0;
      }
      function restore(s) {
        if (!s || s.v !== 1 || !Array.isArray(s.k) || s.k.length !== N || !Array.isArray(s.done) || s.done.length !== N) return false;
        if (!s.k.every(k => SHAPES.includes(k))) return false;
        const counts = {}; s.k.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
        if (!Object.values(counts).every(n => n === 2)) return false;
        const tint = colorMap(s.k);
        cards = s.k.map((k, i) => ({ k, c: tint[k], up: !!s.done[i], done: !!s.done[i], flipAt: -9, pop: -9, deal: -1 }));
        open = []; moves = s.moves | 0; time = +s.time || 0; started = !!s.started; score = s.score | 0;
        found = cards.filter(c => c.done).length / 2;
        return true;
      }

      function hideWrong() {
        if (wrongTimer !== null) { clearTimeout(wrongTimer); wrongTimer = null; }
        open.forEach(i => { if (!cards[i].done) { cards[i].up = false; cards[i].flipAt = clock; } });
        open = [];
      }
      function flip(i) {
        if (endAt >= 0 || i < 0 || i >= N) return;
        const card = cards[i];
        if (card.done || card.up) return;
        if (open.length === 2) hideWrong();
        card.up = true; card.flipAt = clock; open.push(i); started = true;
        api.sfx('tap');
        if (open.length < 2) return;
        moves++;
        const [a, b] = open.map(j => cards[j]);
        if (a.k === b.k) {
          a.done = b.done = true; a.pop = b.pop = clock + FLIP_T; open = []; found++;
          score += 100; api.score(score); api.sfx('merge');
          if (found === PAIRS) finish();
        } else {
          api.sfx('move');
          wrongTimer = api.timeout(() => { wrongTimer = null; if (open.length === 2) hideWrong(); }, FLIP_BACK[api.level]);
        }
      }
      function finish() {
        endAt = clock;
        const bonus = Math.max(0, PAIRS * 30 - Math.max(0, moves - PAIRS) * 12) + Math.max(0, PAIRS * 12 - Math.floor(time)) * 3;
        score += bonus; api.score(score); api.sfx('win');
        api.timeout(() => api.over({ score, title: 'All pairs found', won: true, message: `${moves} moves in ${fmtTime(time)}` }), 900);
      }

      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        for (let i = 0; i < N; i++) {
          const p = lay.at(i);
          if (x >= p.x && x <= p.x + lay.cardW && y >= p.y && y <= p.y + lay.cardH) { focus = i; focusShown = false; flip(i); return; }
        }
      });
      api.keys(e => {
        const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS, a: -1, d: 1, w: -COLS, s: COLS }[e.key];
        if (mv !== undefined) {
          if (!focusShown) { focusShown = true; return; }
          const c = focus % COLS, n = focus + mv;
          if ((mv === -1 && c === 0) || (mv === 1 && c === COLS - 1) || n < 0 || n >= N) return;
          focus = n; api.sfx('tick'); return;
        }
        if (e.key === ' ' || e.key === 'Enter') { focusShown = true; flip(focus); }
      });

      function drawBack(x, y, w, h, col) {
        ctx.fillStyle = col.dark ? '#5a3f4d' : '#c06c9a';
        D.roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.14); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5;
        D.roundRect(ctx, x + 4, y + 4, w - 8, h - 8, Math.min(w, h) * 0.1); ctx.stroke();
        D.spark(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 'rgba(255,248,242,0.85)', 0);
      }
      function drawFront(x, y, w, h, card, col, glow) {
        ctx.fillStyle = col.dark ? '#3a342d' : '#fffaf2';
        D.roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.14); ctx.fill();
        ctx.strokeStyle = card.done ? card.c : (col.dark ? 'rgba(255,255,255,0.12)' : 'rgba(60,40,20,0.12)');
        ctx.lineWidth = card.done ? 2 : 1;
        D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.min(w, h) * 0.14); ctx.stroke();
        if (glow > 0) { ctx.globalAlpha = glow * 0.18; ctx.fillStyle = card.c; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        shape(ctx, card.k, x + w / 2, y + h / 2, Math.min(w, h) * 0.26, card.c);
      }

      function render() {
        const col = api.colors(), { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        lay = layout(w, h, COLS, ROWS);
        // header: moves, pairs, time
        const stat = (label, value, x) => {
          D.text(ctx, value, x, 18, 17, col.ink, 760);
          D.text(ctx, label, x, 36, 10.5, col.ink3, 600);
        };
        stat(moves === 1 ? 'move' : 'moves', String(moves), w * 0.2);
        stat(`of ${PAIRS} pairs`, String(found), w / 2);
        stat('time', fmtTime(time), w * 0.8);
        ctx.fillStyle = col.line; ctx.fillRect(14, HEAD, w - 28, 1);

        cards.forEach((card, i) => {
          const p = lay.at(i), cw = lay.cardW, ch = lay.cardH;
          const dk = api.reduceMotion ? 1 : Math.min(1, Math.max(0, (clock - card.deal) / 0.3));
          if (dk <= 0) return;
          const fk = api.reduceMotion ? 1 : Math.min(1, (clock - card.flipAt) / FLIP_T);
          // scaleX goes 1 -> 0 (old face) -> 1 (new face)
          const showUp = fk < 0.5 ? !card.up : card.up;
          const sx = Math.abs(Math.cos(fk * Math.PI));
          let s = D.ease.outBack(dk);
          const pk = (clock - card.pop) / 0.35;
          if (pk > 0 && pk < 1 && !api.reduceMotion) s *= 1 + Math.sin(pk * Math.PI) * 0.08;
          // final wave over all cards
          if (endAt >= 0 && !api.reduceMotion) { const wk = (clock - endAt - i * 0.04) / 0.4; if (wk > 0 && wk < 1) s *= 1 + Math.sin(wk * Math.PI) * 0.1; }
          ctx.save();
          ctx.translate(p.x + cw / 2, p.y + ch / 2); ctx.scale(Math.max(0.02, sx) * s, s);
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.3)' : 'rgba(80,40,20,0.12)';
          D.roundRect(ctx, -cw / 2, -ch / 2 + 3, cw, ch, Math.min(cw, ch) * 0.14); ctx.fill();
          const glow = card.done ? Math.max(0, 1 - Math.max(0, clock - card.pop) / 0.8) : 0;
          if (showUp) drawFront(-cw / 2, -ch / 2, cw, ch, card, col, endAt >= 0 ? 0.6 : glow);
          else drawBack(-cw / 2, -ch / 2, cw, ch, col);
          ctx.restore();
          if (focusShown && i === focus && endAt < 0) {
            ctx.strokeStyle = col.accent; ctx.lineWidth = 2.5;
            D.roundRect(ctx, p.x - 4, p.y - 4, cw + 8, ch + 8, Math.min(cw, ch) * 0.17); ctx.stroke();
          }
        });
      }

      if (!(api.saved && restore(api.saved))) deal();
      api.score(score);
      api.loop(dt => {
        clock += dt;
        if (started && endAt < 0) time += dt;
        render();
      });
      return {
        save() {
          if (endAt >= 0 || !started) return null;
          return { v: 1, k: cards.map(c => c.k), done: cards.map(c => c.done), moves, time: Math.round(time * 10) / 10, started, score };
        }
      };
    }
  });
})();
