/* Patience (Klondike): build four suit piles from Ace to King. Tableau builds down in alternating colours.
   Cards are numbers 0..51: suit = floor(n / 13) (0 spade, 1 heart, 2 club, 3 diamond), rank = n % 13 (0 = Ace). */
(function () {
  const D = Ludus.draw;
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suit = n => Math.floor(n / 13), rank = n => n % 13, red = n => suit(n) % 2 === 1;
  const PASSES = [0, 0, 3];                 // 0 = unlimited redeals

  // ---------- pure rules ----------
  function deal(rnd) {
    rnd = rnd || Math.random;
    const deck = [...Array(52).keys()];
    for (let i = 51; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const tab = [];
    for (let c = 0; c < 7; c++) { tab.push([]); for (let k = 0; k <= c; k++) tab[c].push({ n: deck.pop(), up: k === c }); }
    return { stock: deck.map(n => ({ n, up: false })), waste: [], found: [[], [], [], []], tab };
  }
  function canFound(g, n) {
    const f = g.found[suit(n)];
    return f.length ? rank(f[f.length - 1].n) === rank(n) - 1 : rank(n) === 0;
  }
  function canTab(g, c, n) {
    const t = g.tab[c];
    if (!t.length) return rank(n) === 12;
    const top = t[t.length - 1];
    return top.up && red(top.n) !== red(n) && rank(top.n) === rank(n) + 1;
  }
  function pileArr(g, id) {
    if (id === 's') return g.stock; if (id === 'w') return g.waste;
    return id[0] === 'f' ? g.found[+id[1]] : g.tab[+id[1]];
  }

  function suitShape(ctx, s, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    if (s === 1) { // heart
      ctx.moveTo(x, y + r * 0.9);
      ctx.bezierCurveTo(x + r * 1.25, y + r * 0.05, x + r * 0.75, y - r * 1.05, x, y - r * 0.38);
      ctx.bezierCurveTo(x - r * 0.75, y - r * 1.05, x - r * 1.25, y + r * 0.05, x, y + r * 0.9);
    } else if (s === 3) { // diamond
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.72, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.72, y); ctx.closePath();
    } else if (s === 0) { // spade
      ctx.moveTo(x, y - r);
      ctx.bezierCurveTo(x + r * 1.25, y - r * 0.15, x + r * 0.7, y + r * 0.85, x, y + r * 0.3);
      ctx.bezierCurveTo(x - r * 0.7, y + r * 0.85, x - r * 1.25, y - r * 0.15, x, y - r);
      ctx.fill(); ctx.beginPath();
      ctx.moveTo(x, y + r * 0.2); ctx.lineTo(x + r * 0.32, y + r); ctx.lineTo(x - r * 0.32, y + r); ctx.closePath();
    } else { // club
      ctx.arc(x, y - r * 0.45, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.beginPath();
      ctx.arc(x - r * 0.48, y + r * 0.12, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.beginPath();
      ctx.arc(x + r * 0.48, y + r * 0.12, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + r * 0.3, y + r); ctx.lineTo(x - r * 0.3, y + r); ctx.closePath();
    }
    ctx.fill();
  }

  Ludus.register({
    id: 'patience', name: 'Solitaire', aka: 'Patience Klondike', tag: 'Puzzle', tint: '#2e7a5f',
    hint: 'Click a card then its spot, or drag · double-click or <kbd>Enter</kbd>: to suit pile · <kbd>←↑→↓</kbd> <kbd>Space</kbd> pick/drop · <kbd>D</kbd> draw · <kbd>Z</kbd> undo',
    _rules: { deal, canFound, canTab },
    art(ctx, w, h) {
      const cw = Math.min(w * 0.17, h * 0.5), ch = cw * 1.4, y = (h - ch) / 2;
      [[0, 1], [12, 0], [24, 3], [36, 2]].forEach(([n, s], i) => {
        const x = w / 2 - cw * 1.9 + i * cw * 0.95, rot = (i - 1.5) * 0.12;
        ctx.save(); ctx.translate(x + cw / 2, y + ch / 2); ctx.rotate(rot);
        ctx.fillStyle = '#fffaf2'; D.roundRect(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.14); ctx.fill();
        const col = s % 2 ? '#c8434f' : '#2b2722';
        D.text(ctx, ['A', 'K', 'Q', 'J'][i], -cw * 0.28, -ch * 0.32, cw * 0.28, col, 750);
        suitShape(ctx, s, 0, ch * 0.05, cw * 0.22, col);
        ctx.restore();
      });
    },
    create(stage, api) {
      const lv = api.level, drawN = lv === 0 ? 1 : 3;
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let g, score, moves, passes, time, state, undo, sel, drag, focus, lastClick, autoT, winAt, flipAt;
      const disp = new Map();                  // card -> {x, y} drawn position (eases toward its slot)
      const L = { cw: 40, ch: 56, gap: 6, top: 30, tabY: 100, slots: {}, hits: [], undoBtn: null };
      let clock = 0;

      function valid(s) {
        if (!s || !Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.found) || s.found.length !== 4 || !Array.isArray(s.tab) || s.tab.length !== 7) return false;
        const all = [...s.stock, ...s.waste, ...s.found.flat(), ...s.tab.flat()].map(c => c && c.n);
        return all.length === 52 && new Set(all).size === 52 && all.every(n => Number.isInteger(n) && n >= 0 && n < 52);
      }
      const clone = x => JSON.parse(JSON.stringify(x));
      if (valid(api.saved)) {
        const s = api.saved;
        g = clone({ stock: s.stock, waste: s.waste, found: s.found, tab: s.tab });
        score = s.score | 0; moves = s.moves | 0; passes = s.passes | 0; time = +s.time || 0;
      } else { g = deal(); score = 0; moves = 0; passes = 0; time = 0; }
      state = 'play'; undo = []; sel = null; drag = null; focus = null; lastClick = null; autoT = 0; winAt = 0; flipAt = {};
      api.score(score);

      function pushUndo() { undo.push(clone({ g, score, moves, passes })); if (undo.length > 200) undo.shift(); }
      function doUndo() {
        if (state !== 'play' || !undo.length) return;
        const u = undo.pop(); g = u.g; score = u.score; moves = u.moves; passes = u.passes; sel = null;
        api.score(score); api.sfx('move');
      }
      function addScore(d) { score = Math.max(0, score + d); api.score(score); }
      function flipTops() {
        g.tab.forEach(t => { const top = t[t.length - 1]; if (top && !top.up) { top.up = true; flipAt[top.n] = clock; addScore(5); } });
      }
      function drawStock() {
        if (state !== 'play') return;
        sel = null;
        if (!g.stock.length) {
          if (!g.waste.length) return;
          if (PASSES[lv] && passes >= PASSES[lv] - 1) { api.toast('No redeals left'); api.sfx('tick'); return; }
          pushUndo();
          g.stock = g.waste.reverse().map(c => ({ n: c.n, up: false })); g.waste = []; passes++;
          if (lv > 0 && passes > 3) addScore(-20);
          api.sfx('move'); return;
        }
        pushUndo();
        for (let k = 0; k < drawN && g.stock.length; k++) { const c = g.stock.pop(); c.up = true; g.waste.push(c); flipAt[c.n] = clock; }
        moves++; api.sfx('click');
      }
      // Moves cards from (pile, index) to target pile id. Returns true when done.
      function tryMove(from, idx, to) {
        if (state !== 'play' || from === to) return false;
        const src = pileArr(g, from);
        if (idx < 0 || idx >= src.length || !src[idx].up) return false;
        const run = src.slice(idx), head = run[0].n;
        if (to[0] === 'f') {
          if (run.length !== 1 || suit(head) !== +to[1] || !canFound(g, head)) return false;
        } else if (to[0] === 't') {
          if (!canTab(g, +to[1], head)) return false;
        } else return false;
        pushUndo();
        src.splice(idx);
        pileArr(g, to).push(...run);
        moves++;
        if (to[0] === 'f') addScore(10);
        else if (from === 'w') addScore(5);
        else if (from[0] === 'f') addScore(-15);
        flipTops();
        api.sfx(to[0] === 'f' ? 'score' : 'drop');
        checkWin();
        return true;
      }
      function toFoundation(from) {
        const src = pileArr(g, from); if (!src || !src.length) return false;
        const c = src[src.length - 1];
        return c.up && tryMove(from, src.length - 1, 'f' + suit(c.n));
      }
      // Best place for a run when the player only says "this pile" (keyboard), deepest fitting card first.
      function moveToPile(from, to) {
        const src = pileArr(g, from);
        if (to[0] === 'f') return src.length && tryMove(from, src.length - 1, to);
        for (let i = 0; i < src.length; i++) if (src[i].up && tryMove(from, i, to)) return true;
        return false;
      }
      function canAuto() { return !g.stock.length && !g.waste.length && g.tab.every(t => t.every(c => c.up)); }
      function checkWin() {
        if (g.found.every(f => f.length === 13)) {
          state = 'won'; winAt = clock; sel = null;
          const bonus = Math.max(0, Math.round((900 - time) * (lv + 1)));
          addScore(bonus);
          api.sfx('win');
          api.timeout(() => api.over({ score, title: 'Solved', won: true, message: `${moves} moves · ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}` }), 1200);
        }
      }

      // ---------- layout ----------
      function layout() {
        const { w, h } = view;
        const gap = Math.max(4, Math.round(w * 0.016));
        const cw = Math.floor(Math.min((w - gap * 8) / 7, (h - 60) / 7.2));
        const ch = Math.round(cw * 1.4);
        const ox = Math.round((w - (cw * 7 + gap * 6)) / 2);
        Object.assign(L, { cw, ch, gap, ox, top: 32, tabY: 32 + ch + gap * 2 });
        const colX = c => ox + c * (cw + gap);
        L.slots = { s: { x: colX(0), y: L.top }, w: { x: colX(1), y: L.top } };
        for (let i = 0; i < 4; i++) L.slots['f' + i] = { x: colX(3 + i), y: L.top };
        for (let c = 0; c < 7; c++) L.slots['t' + c] = { x: colX(c), y: L.tabY };
        // target positions for every card, plus hit boxes in draw order
        const pos = new Map(), hits = [];
        const put = (c, x, y, pile, idx) => { pos.set(c.n, { x, y }); hits.push({ x, y, w: cw, h: ch, pile, idx, c }); };
        g.stock.forEach((c, i) => put(c, L.slots.s.x - Math.min(i, 3) * 0.6, L.top - Math.min(i, 3) * 0.6, 's', i));
        const wn = g.waste.length, fan = Math.round(cw * 0.26);
        g.waste.forEach((c, i) => { const k = Math.max(0, i - (wn - Math.min(drawN, wn))); put(c, L.slots.w.x + k * fan, L.top, 'w', i); });
        g.found.forEach((f, s) => f.forEach((c, i) => put(c, L.slots['f' + s].x, L.top, 'f' + s, i)));
        const avail = h - L.tabY - 8;
        g.tab.forEach((t, ci) => {
          const downs = t.filter(c => !c.up).length, ups = t.length - downs;
          let fd = Math.round(ch * 0.13), fu = Math.round(ch * 0.3);
          if (ups > 1 && downs * fd + (ups - 1) * fu + ch > avail) fu = Math.max(8, (avail - ch - downs * fd) / (ups - 1));
          let y = L.tabY;
          t.forEach((c, i) => { put(c, L.slots['t' + ci].x, y, 't' + ci, i); y += c.up ? fu : fd; });
        });
        L.hits = hits;
        L.undoBtn = { x: ox + cw * 7 + gap * 6 - 62, y: 5, w: 62, h: 22 };
        return pos;
      }

      // ---------- input ----------
      const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const inR = (p, r) => r && p.x >= r.x && p.x <= r.x + (r.w || L.cw) && p.y >= r.y && p.y <= r.y + (r.h || L.ch);
      function hitAt(p) { let h = null; L.hits.forEach(o => { if (inR(p, o)) h = o; }); return h; }
      function pileAt(p) {
        for (const id of Object.keys(L.slots)) {
          const s = L.slots[id];
          const tall = id[0] === 't' ? { x: s.x, y: s.y, w: L.cw, h: view.h - s.y } : { x: s.x, y: s.y, w: L.cw, h: L.ch };
          if (inR(p, tall)) return id;
        }
        return null;
      }
      function clickCard(hit, p) {
        if (hit && hit.pile === 's') { drawStock(); return; }
        const target = hit ? hit.pile : pileAt(p);
        if (!target) { sel = null; return; }
        if (target === 's') { drawStock(); return; }
        const now = performance.now();
        const dbl = hit && lastClick && lastClick.n === hit.c.n && now - lastClick.t < 380;
        lastClick = hit ? { n: hit.c.n, t: now } : null;
        if (dbl) { sel = null; if (hit.idx === pileArr(g, hit.pile).length - 1 && toFoundation(hit.pile)) return; }
        if (sel && sel.pile !== target) {
          if (tryMove(sel.pile, sel.idx, target)) { sel = null; return; }
        }
        if (hit && hit.c.up && hit.pile !== 's' && (hit.pile[0] === 't' || hit.idx === pileArr(g, hit.pile).length - 1)) {
          sel = sel && sel.pile === hit.pile && sel.idx === hit.idx && !dbl ? null : { pile: hit.pile, idx: hit.idx };
          api.sfx('tick');
        } else { if (sel) api.sfx('tick'); sel = null; }
      }
      api.on(canvas, 'pointerdown', e => {
        if (e.button !== 0 || state !== 'play') return;
        const p = local(e);
        if (inR(p, L.undoBtn)) { doUndo(); return; }
        const hit = hitAt(p);
        focus = null;
        if (hit && hit.c.up && hit.pile !== 's' && (hit.pile[0] === 't' || hit.idx === pileArr(g, hit.pile).length - 1)) {
          drag = { hit, sx: p.x, sy: p.y, x: p.x, y: p.y, moving: false };
        } else clickCard(hit, p);
      });
      api.on(window, 'pointermove', e => {
        if (!drag) return;
        const p = local(e); drag.x = p.x; drag.y = p.y;
        if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moving = true;
      });
      api.on(window, 'pointerup', e => {
        if (!drag) return;
        const d = drag; drag = null;
        if (!d.moving) { clickCard(d.hit, { x: d.sx, y: d.sy }); return; }
        const cx = d.hit.x + (d.x - d.sx) + L.cw / 2, cy = d.hit.y + (d.y - d.sy) + L.ch * 0.3;
        const to = pileAt({ x: cx, y: cy });
        sel = null;
        if (!to || !tryMove(d.hit.pile, d.hit.idx, to)) api.sfx('tick');
      });
      const ROW0 = ['s', 'w', 'f0', 'f1', 'f2', 'f3'], ROW1 = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
      const focusId = () => (focus.row ? ROW1 : ROW0)[focus.i];
      api.keys(e => {
        if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') { doUndo(); return; }
        if (e.key === 'd' || e.key === 'D') { drawStock(); return; }
        if (!focus) focus = { row: 1, i: 0 };
        const mv = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (mv) { const row = focus.row ? ROW1 : ROW0; focus.i = (focus.i + mv + row.length) % row.length; api.sfx('tick'); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const down = e.key === 'ArrowDown';
          if (down && !focus.row) focus.i = [0, 1, 3, 4, 5, 6][focus.i];
          else if (!down && focus.row) focus.i = [0, 1, 1, 2, 3, 4, 5][focus.i];
          focus.row = down ? 1 : 0;
          api.sfx('tick'); return;
        }
        const id = focusId();
        if (e.key === 'Enter') { if (id !== 's') toFoundation(id); return; }
        if (e.key === ' ') {
          if (id === 's') { drawStock(); return; }
          if (sel) { const ok = sel.pile !== id && moveToPile(sel.pile, id); if (!ok) api.sfx('tick'); sel = null; return; }
          const arr = pileArr(g, id);
          if (!arr.length) return;
          const first = id[0] === 't' ? arr.findIndex(c => c.up) : arr.length - 1;
          if (first >= 0 && arr[first].up) { sel = { pile: id, idx: first }; api.sfx('tick'); }
        }
      });

      // ---------- render ----------
      function cardFace(c, x, y, col, lift) {
        const { cw, ch } = L;
        const fk = flipAt[c.n] !== undefined ? Math.min(1, (clock - flipAt[c.n]) / 0.18) : 1;
        const sx = api.reduceMotion ? 1 : Math.abs(Math.cos(fk * Math.PI));
        const showUp = c.up && (fk >= 0.5 || api.reduceMotion);
        ctx.save(); ctx.translate(x + cw / 2, y + ch / 2); ctx.scale(Math.max(0.05, sx), 1);
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.4)' : 'rgba(70,50,30,0.16)';
        D.roundRect(ctx, -cw / 2, -ch / 2 + (lift ? 4 : 1.2), cw, ch, cw * 0.12); ctx.fill();
        if (showUp) {
          ctx.fillStyle = col.dark ? '#3b352e' : '#fffdf8';
          D.roundRect(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.12); ctx.fill();
          ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.stroke();
          const ink = red(c.n) ? (col.dark ? '#f08a8f' : '#c8434f') : col.ink;
          const r = rank(c.n), fs = cw * (r === 9 ? 0.3 : 0.34);
          D.text(ctx, RANKS[r], -cw / 2 + cw * 0.24, -ch / 2 + ch * 0.14, fs, ink, 750);
          suitShape(ctx, suit(c.n), cw / 2 - cw * 0.22, -ch / 2 + ch * 0.14, cw * 0.12, ink);
          if (r >= 10) {
            suitShape(ctx, suit(c.n), 0, ch * 0.1, cw * 0.24, ink);
            D.spark(ctx, 0, ch * 0.1 - cw * 0.36, cw * 0.1, col.accent, 0);
          } else suitShape(ctx, suit(c.n), 0, ch * 0.1, cw * 0.26, ink);
        } else {
          ctx.fillStyle = col.accent;
          D.roundRect(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.12); ctx.fill();
          ctx.strokeStyle = 'rgba(255,248,242,0.55)'; ctx.lineWidth = 1.2;
          D.roundRect(ctx, -cw / 2 + 3, -ch / 2 + 3, cw - 6, ch - 6, cw * 0.09); ctx.stroke();
          D.spark(ctx, 0, 0, cw * 0.2, 'rgba(255,248,242,0.85)', 0.2);
        }
        ctx.restore();
      }
      function render(dt) {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const pos = layout();
        const { cw, ch } = L;
        // header
        D.text(ctx, `Moves ${moves}`, L.ox, 16, 12, col.ink2, 650, 'left');
        D.text(ctx, `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`, w / 2, 16, 12, col.ink2, 650);
        const ub = L.undoBtn;
        ctx.fillStyle = col.dark ? '#322d27' : '#f1e9dc'; D.roundRect(ctx, ub.x, ub.y, ub.w, ub.h, 11); ctx.fill();
        D.text(ctx, 'Undo', ub.x + ub.w / 2, ub.y + ub.h / 2 + 1, 11.5, undo.length && state === 'play' ? col.ink : col.ink3, 700);
        // empty slots
        const slot = (id, label) => {
          const s = L.slots[id];
          ctx.strokeStyle = col.dark ? 'rgba(255,245,230,0.14)' : 'rgba(32,28,23,0.12)'; ctx.lineWidth = 1.5;
          ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)';
          D.roundRect(ctx, s.x, s.y, cw, ch, cw * 0.12); ctx.fill(); ctx.stroke();
          if (label !== undefined) suitShape(ctx, label, s.x + cw / 2, s.y + ch / 2, cw * 0.2, col.dark ? 'rgba(255,245,230,0.13)' : 'rgba(32,28,23,0.1)');
        };
        slot('s'); slot('w'); for (let i = 0; i < 4; i++) slot('f' + i, i); for (let c = 0; c < 7; c++) slot('t' + c);
        if (!g.stock.length && g.waste.length) {
          const s = L.slots.s; ctx.strokeStyle = col.ink3; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(s.x + cw / 2, s.y + ch / 2, cw * 0.2, -0.3, Math.PI * 1.5); ctx.stroke();
        }
        // focus ring (keyboard)
        if (focus && state === 'play') {
          const s = L.slots[focusId()], arr = pileArr(g, focusId());
          const last = arr.length ? pos.get(arr[arr.length - 1].n) : s;
          ctx.strokeStyle = col.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
          D.roundRect(ctx, s.x - 3, s.y - 3, cw + 6, last.y - s.y + ch + 6, cw * 0.15); ctx.stroke(); ctx.setLineDash([]);
        }
        // cards (ease toward slots), dragged run on top
        const k = api.reduceMotion ? 1 : Math.min(1, dt * 16);
        const dragSet = drag && drag.moving ? pileArr(g, drag.hit.pile).slice(drag.hit.idx).map(c => c.n) : [];
        const late = [];
        L.hits.forEach(hb => {
          const c = hb.c, tgt = pos.get(c.n);
          let d = disp.get(c.n);
          if (!d) { d = { x: tgt.x, y: tgt.y }; disp.set(c.n, d); }
          d.x += (tgt.x - d.x) * k; d.y += (tgt.y - d.y) * k;
          if (Math.abs(tgt.x - d.x) < 0.3) d.x = tgt.x; if (Math.abs(tgt.y - d.y) < 0.3) d.y = tgt.y;
          const moving = Math.abs(tgt.x - d.x) + Math.abs(tgt.y - d.y) > 2;
          if (dragSet.includes(c.n)) { late.push([c, tgt.x + drag.x - drag.sx, tgt.y + drag.y - drag.sy]); d.x = tgt.x + drag.x - drag.sx; d.y = tgt.y + drag.y - drag.sy; return; }
          if (moving) { late.push([c, d.x, d.y]); return; }
          cardFace(c, d.x, d.y, col, false);
          if (sel && hb.pile === sel.pile && hb.idx >= sel.idx) {
            ctx.strokeStyle = col.accent; ctx.lineWidth = 2.2;
            D.roundRect(ctx, d.x - 1, d.y - 1, cw + 2, ch + 2, cw * 0.13); ctx.stroke();
          }
        });
        late.forEach(([c, x, y]) => cardFace(c, x, y, col, true));
        if (state === 'won') {
          for (let i = 0; i < 4; i++) {
            const s = L.slots['f' + i], t = clock - winAt - i * 0.12;
            if (t > 0) D.spark(ctx, s.x + cw / 2, s.y + ch + 14, Math.min(10, t * 30), col.accent, t * 3);
          }
          const a = Math.min(1, (clock - winAt) / 0.5);
          ctx.globalAlpha = a; D.text(ctx, 'All four suits home', w / 2, L.tabY + ch * 0.5 + Math.max(0, (h - L.tabY) * 0.25), 16, col.good, 750); ctx.globalAlpha = 1;
        }
      }

      api.loop(dt => {
        clock += dt;
        if (state === 'play') {
          time += dt;
          if (canAuto() && !drag) {
            autoT += dt;
            if (autoT > 0.09) {
              autoT = 0;
              let best = null;
              g.tab.forEach((t, ci) => { const c = t[t.length - 1]; if (c && canFound(g, c.n) && (!best || rank(c.n) < rank(best.n))) best = { n: c.n, ci }; });
              if (best) tryMove('t' + best.ci, g.tab[best.ci].length - 1, 'f' + suit(best.n));
            }
          }
        }
        render(dt);
      });
      Ludus.games.find(x => x.id === 'patience')._peek = () => ({ g, score, moves, state, sel, L, undo: undo.length, passes });
      return {
        save() {
          if (state !== 'play' || !moves) return null;
          return { stock: g.stock, waste: g.waste, found: g.found, tab: g.tab, score, moves, passes, time: Math.round(time) };
        }
      };
    }
  });
})();
