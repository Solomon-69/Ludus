/* Box It: dots and boxes against the computer. 5 x 5 boxes, close a box and go again. */
(function () {
  const N = 5, H = (N + 1) * N, V = N * (N + 1), E = H + V, P = 1, C = 2;

  // ---------- geometry tables ----------
  // edges 0..H-1 are horizontal (row r 0..N, col c 0..N-1) ; H..E-1 vertical (row r 0..N-1, col c 0..N)
  const edgeBoxes = [], boxEdges = [];
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N;
    boxEdges.push([r * N + c, (r + 1) * N + c, H + r * (N + 1) + c, H + r * (N + 1) + c + 1]);
  }
  for (let e = 0; e < E; e++) {
    const out = [];
    if (e < H) { const r = Math.floor(e / N), c = e % N; if (r > 0) out.push((r - 1) * N + c); if (r < N) out.push(r * N + c); }
    else { const k = e - H, r = Math.floor(k / (N + 1)), c = k % (N + 1); if (c > 0) out.push(r * N + c - 1); if (c < N) out.push(r * N + c); }
    edgeBoxes.push(out);
  }

  // ---------- pure rules + AI ----------
  const logic = {
    N, H, V, E, edgeBoxes, boxEdges,
    newState: () => ({ edges: new Int8Array(E), boxes: new Int8Array(N * N) }),
    sides(edges, b) { let n = 0; for (const e of boxEdges[b]) if (edges[e]) n++; return n; },
    // draw edge e for `who`; returns list of boxes completed
    play(st, e, who) {
      st.edges[e] = who;
      const done = [];
      for (const b of edgeBoxes[e]) if (!st.boxes[b] && logic.sides(st.edges, b) === 4) { st.boxes[b] = who; done.push(b); }
      return done;
    },
    free(edges) { const out = []; for (let e = 0; e < E; e++) if (!edges[e]) out.push(e); return out; },
    completes(edges, e) { return edgeBoxes[e].some(b => logic.sides(edges, b) === 3); },
    // a move is safe when it closes nothing and gives no box a third side
    safe(edges, e) { return edgeBoxes[e].every(b => logic.sides(edges, b) < 2); },
    // how many boxes the opponent can take in a row right after we draw e
    gift(edges, e) {
      const ed = Int8Array.from(edges); ed[e] = 1;
      let taken = 0, again = true;
      const boxes = new Int8Array(N * N);
      for (let b = 0; b < N * N; b++) if (logic.sides(ed, b) === 4) boxes[b] = 1;
      while (again) {
        again = false;
        for (let b = 0; b < N * N; b++) {
          if (boxes[b] || logic.sides(ed, b) !== 3) continue;
          const fe = boxEdges[b].find(x => !ed[x]);
          ed[fe] = 1;
          for (const bb of edgeBoxes[fe]) if (!boxes[bb] && logic.sides(ed, bb) === 4) { boxes[bb] = 1; taken++; }
          again = true;
        }
      }
      return taken;
    },
    // boxes `who` could capture now by chaining completions; returns edited copy too
    captureAll(edges) {
      const ed = Int8Array.from(edges); let n = 0, again = true;
      while (again) {
        again = false;
        for (let e = 0; e < E; e++) if (!ed[e] && logic.completes(ed, e)) {
          for (const b of edgeBoxes[e]) if (logic.sides(ed, b) === 3) n++;
          ed[e] = 1; again = true;
        }
      }
      return { n, edges: ed };
    },
    // double-deal: box A has 3 sides, open edge e joins it to B (2 sides) whose other open edge f
    // affects no other box badly. Playing f hands the pair over and keeps control.
    doubleDeal(edges) {
      for (let a = 0; a < N * N; a++) {
        if (logic.sides(edges, a) !== 3) continue;
        const e = boxEdges[a].find(x => !edges[x]);
        const b = edgeBoxes[e].find(x => x !== a);
        if (b === undefined || logic.sides(edges, b) !== 2) continue;
        const f = boxEdges[b].find(x => !edges[x] && x !== e);
        if (f === undefined) continue;
        const other = edgeBoxes[f].find(x => x !== b);
        if (other !== undefined && logic.sides(edges, other) >= 2) continue;
        return { take: e, deal: f };
      }
      return null;
    },
    choose(edges, level, rnd) {
      rnd = rnd || Math.random;
      const pick = arr => arr[Math.floor(rnd() * arr.length)];
      const free = logic.free(edges);
      const caps = free.filter(e => logic.completes(edges, e));
      const safes = free.filter(e => logic.safe(edges, e));
      if (level === 0) {
        if (caps.length && rnd() < 0.85) return pick(caps);
        if (safes.length && rnd() < 0.5) return pick(safes);
        return pick(free);
      }
      if (caps.length) {
        if (level === 2) {
          const after = logic.captureAll(edges).edges;
          const restSafe = logic.free(after).some(e => logic.safe(after, e));
          const dd = logic.doubleDeal(edges);
          // only the final pair of a chain left to grab: decide whether to keep control
          if (dd && !restSafe && caps.every(e => e === dd.take)) {
            const rest = logic.free(after);
            const bigRest = rest.some(e => logic.gift(after, e) >= 3);
            if (bigRest) return dd.deal;
          }
          // take boxes that are not the domino first
          const nonDd = dd ? caps.filter(e => e !== dd.take) : caps;
          if (nonDd.length) return nonDd[0];
        }
        return caps[0];
      }
      if (safes.length) {
        if (level === 2) {
          // prefer safe moves that keep the most safe moves for us later (gentle parity sense)
          return pick(safes);
        }
        return pick(safes);
      }
      // forced to hand something over: give the fewest boxes, and for pairs use the middle edge
      let best = Infinity, cand = [];
      for (const e of free) {
        let g = logic.gift(edges, e);
        if (level === 2 && g === 2 && edgeBoxes[e].length === 2 && edgeBoxes[e].every(b => logic.sides(edges, b) === 2)) g -= 0.5;
        if (g < best) { best = g; cand = [e]; } else if (g === best) cand.push(e);
      }
      return pick(cand);
    }
  };

  Ludus.register({
    id: 'boxit', name: 'Box It', tag: 'Duel', versus: true, tint: '#e0a526',
    hint: 'Click a gap between two dots, or <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> + <kbd>Space</kbd>. Close a box to score and go again. Most boxes wins. vs Friend: take turns',
    _logic: logic,
    art(ctx, w, h) {
      const D = Ludus.draw, n = 4, s = Math.min(w / 6.2, h / 4.8);
      const ox = (w - s * n) / 2, oy = (h - s * 3) / 2;
      const fill = [[0, 0, 'P'], [1, 0, 'P'], [2, 1, 'C'], [1, 1, 'P']];
      fill.forEach(([c, r, who]) => {
        ctx.fillStyle = who === 'P' ? 'rgba(255,255,255,0.55)' : 'rgba(70,45,10,0.28)';
        D.roundRect(ctx, ox + c * s + 3, oy + r * s + 3, s - 6, s - 6, 5); ctx.fill();
        if (who === 'P') D.spark(ctx, ox + c * s + s / 2, oy + r * s + s / 2, s * 0.22, '#b8641c');
      });
      ctx.lineCap = 'round'; ctx.lineWidth = 3.5;
      const seg = (x1, y1, x2, y2, col) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ox + x1 * s, oy + y1 * s); ctx.lineTo(ox + x2 * s, oy + y2 * s); ctx.stroke(); };
      const W = '#fff8ec', K = '#5a3b10';
      seg(0, 0, 2, 0, W); seg(0, 1, 2, 1, W); seg(0, 0, 0, 1, W); seg(1, 0, 1, 1, W); seg(2, 0, 2, 1, K);
      seg(1, 2, 2, 2, W); seg(1, 1, 1, 2, K); seg(2, 1, 3, 1, K); seg(2, 2, 3, 2, K); seg(3, 1, 3, 2, K); seg(2, 1, 2, 2, W);
      seg(3, 0, 4, 0, W); seg(0, 3, 1, 3, K);
      for (let r = 0; r <= 3; r++) for (let c = 0; c <= n; c++) { ctx.beginPath(); ctx.arc(ox + c * s, oy + r * s, 3, 0, Math.PI * 2); ctx.fillStyle = '#4a300c'; ctx.fill(); }
    },
    create(stage, api) {
      const D = Ludus.draw, L = logic;
      // vs Friend: two people take turns on this keyboard; C is Player 2 and the bot never moves.
      const friend = api.friend;
      const nameOf = who => (who === P ? 'Player 1' : 'Player 2');
      const view = api.canvas();
      const { ctx } = view;
      let st = L.newState(), turn = P, phase = 'play', thinking = false, last = -1;
      let hover = -1, cur = { r: 0, c: 1 }, useCursor = false;
      const edgeT = new Float64Array(E), boxT = new Float64Array(N * N);
      let pops = [], geo = null, shake = 0, endBanner = null, again = false;

      const count = who => { let n = 0; for (let b = 0; b < N * N; b++) if (st.boxes[b] === who) n++; return n; };

      function doMove(e, who) {
        if (st.edges[e]) return;
        const done = L.play(st, e, who);
        last = e; edgeT[e] = performance.now(); again = done.length > 0 && (who === P || friend);
        if (done.length) {
          done.forEach(b => { boxT[b] = performance.now(); if (!api.reduceMotion) burst(b, who); });
          api.sfx(who === P || friend ? 'score' : 'merge');
          if (who === P) api.score(count(P));
        } else api.sfx(who === P || friend ? 'tap' : 'click');
        if (!L.free(st.edges).length) return finish();
        if (!done.length) turn = who === P ? C : P;
        if (turn === C && !friend) cpuStep(done.length > 0);
      }

      function finish() {
        phase = 'end';
        const p = count(P), c = count(C);
        const won = p > c;
        const title = p === c ? 'Draw' : friend ? nameOf(p > c ? P : C) + ' wins' : won ? 'You win' : 'Bot wins';
        endBanner = { text: title };
        if (!won && !friend && !api.reduceMotion) shake = 0.2;
        api.sfx(won || (friend && p !== c) ? 'win' : p === c ? 'over' : 'lose');
        api.timeout(() => api.over({ score: friend ? Math.max(p, c) : p, won: friend ? p !== c : won, title, message: `Boxes ${p} to ${c}` }), 1400);
      }

      function cpuStep(chain) {
        thinking = true;
        const delay = chain ? api.rand(260, 380) : api.rand(420, 680);
        api.timeout(() => {
          thinking = false;
          if (phase !== 'play' || turn !== C) return;
          doMove(L.choose(st.edges, api.level), C);
        }, delay);
      }

      function playerMove(e) {
        if (phase !== 'play' || (turn !== P && !friend) || thinking || e < 0 || st.edges[e]) return;
        doMove(e, turn);
      }

      function burst(b, who) {
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 70;
          pops.push({ b, x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, who });
        }
      }

      // ---------- layout + hit testing ----------
      function layout() {
        const { w, h } = view, top = 56;
        const s = Math.max(12, Math.min((w - 40) / N, (h - top - 22) / N));
        geo = { s, ox: (w - s * N) / 2, oy: top + Math.max(4, (h - top - 10 - s * N) / 2) };
      }
      function edgePos(e) {
        if (e < H) { const r = Math.floor(e / N), c = e % N; return { x1: c, y1: r, x2: c + 1, y2: r }; }
        const k = e - H, r = Math.floor(k / (N + 1)), c = k % (N + 1); return { x1: c, y1: r, x2: c, y2: r + 1 };
      }
      function edgeAt(px, py) {
        if (!geo) return -1;
        const { s, ox, oy } = geo;
        const gx = (px - ox) / s, gy = (py - oy) / s;
        let best = -1, bd = 0.32;
        for (let e = 0; e < E; e++) {
          const p = edgePos(e), mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2;
          const dx = Math.abs(gx - mx), dy = Math.abs(gy - my);
          const d = e < H ? (dx < 0.5 ? dy : 9) : (dy < 0.5 ? dx : 9);
          if (d < bd) { bd = d; best = e; }
        }
        return best;
      }
      const localXY = e => { const r = view.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      // keyboard cursor lives on a (2N+1) lattice: even row + odd col = horizontal edge, odd row + even col = vertical
      function curEdge() {
        const { r, c } = cur;
        if (r % 2 === 0 && c % 2 === 1) return (r / 2) * N + (c - 1) / 2;
        if (r % 2 === 1 && c % 2 === 0) return H + ((r - 1) / 2) * (N + 1) + c / 2;
        return -1;
      }
      function moveCur(dr, dc) {
        let r = cur.r + dr, c = cur.c + dc;
        if (r % 2 === 0 && c % 2 === 0) { r += dr; c += dc; }
        else if (r % 2 === 1 && c % 2 === 1) { if (dc === 0) c -= 1; else r -= 1; }
        if (r < 0 || c < 0 || r > 2 * N || c > 2 * N) return;
        cur = { r, c }; useCursor = true; hover = -1; api.sfx('tick');
      }

      // ---------- drawing ----------
      function hud(col) {
        const ended = phase !== 'play';
        const status = ended ? (endBanner ? endBanner.text : '')
          : friend ? nameOf(turn) + (again ? ' goes again' : '\u2019s move')
          : turn === P ? (again ? 'Go again' : 'Your move') : 'Bot is thinking';
        D.duelHeader(ctx, 8, 8, view.w - 16, {
          left: { who: 'you', label: friend ? 'Player 1' : undefined, score: count(P) },
          right: friend ? { who: 'p2', label: 'Player 2', score: count(C) } : { who: 'bot', score: count(C) },
          turn: ended ? null : (turn === P ? 'left' : 'right'),
          status,
          thinking: !ended && turn === C && !friend
        }, col);
      }

      function render(dt) {
        const col = api.colors(), now = performance.now(), { w, h } = view;
        layout();
        const { s, ox, oy } = geo;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) { shake = Math.max(0, shake - dt); const k = shake * 12; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
        hud(col);
        // claimed boxes
        for (let b = 0; b < N * N; b++) {
          const who = st.boxes[b]; if (!who) continue;
          const r = Math.floor(b / N), c = b % N;
          const k = api.reduceMotion ? 1 : Math.max(0.01, D.ease.outBack(Math.max(0, Math.min(1, (now - boxT[b]) / 320))));
          const x = ox + c * s + s / 2, y = oy + r * s + s / 2, sz = (s - 8) * k;
          ctx.fillStyle = who === P ? (col.dark ? 'rgba(217,119,87,0.30)' : 'rgba(217,119,87,0.20)') : friend ? 'rgba(91,141,239,0.24)' : (col.dark ? 'rgba(243,237,227,0.12)' : 'rgba(32,28,23,0.09)');
          D.roundRect(ctx, x - sz / 2, y - sz / 2, sz, sz, s * 0.16); ctx.fill();
          if (who === P) D.spark(ctx, x, y, s * 0.2 * k, col.accent, (now - boxT[b]) / 2000);
          else if (friend) D.spark(ctx, x, y, s * 0.2 * k, D.P2, (now - boxT[b]) / 2000);
          else D.avatar(ctx, x, y, s * 0.24 * k, 'bot', col);
        }
        // guide lines + drawn edges
        ctx.lineCap = 'round';
        const target = useCursor ? curEdge() : hover;
        for (let e = 0; e < E; e++) {
          const p = edgePos(e);
          const x1 = ox + p.x1 * s, y1 = oy + p.y1 * s, x2 = ox + p.x2 * s, y2 = oy + p.y2 * s;
          const who = st.edges[e];
          if (!who) {
            const hot = e === target && phase === 'play' && (turn === P || friend);
            ctx.strokeStyle = hot ? (turn === P ? col.accent : D.P2) : col.line; ctx.globalAlpha = hot ? 0.55 : 1;
            ctx.lineWidth = hot ? 5 : 2; ctx.setLineDash(hot ? [] : [2, 5]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
            continue;
          }
          const k = api.reduceMotion ? 1 : D.ease.outCubic(Math.min(1, (now - edgeT[e]) / 180));
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          ctx.strokeStyle = who === P ? col.accent : friend ? D.P2 : col.ink;
          ctx.lineWidth = e === last ? 5.5 : 4.5;
          ctx.beginPath(); ctx.moveTo(D.lerp(mx, x1, k), D.lerp(my, y1, k)); ctx.lineTo(D.lerp(mx, x2, k), D.lerp(my, y2, k)); ctx.stroke();
          if (e === last) {
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 200);
            ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        // dots
        for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) {
          ctx.beginPath(); ctx.arc(ox + c * s, oy + r * s, Math.max(3, s * 0.07), 0, Math.PI * 2); ctx.fillStyle = col.ink; ctx.fill();
        }
        // particles
        pops = pops.filter(p => (p.life -= dt) > 0);
        pops.forEach(p => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
          const r = Math.floor(p.b / N), c = p.b % N;
          ctx.globalAlpha = p.life / 0.6; ctx.fillStyle = p.who === P ? col.accent : friend ? D.P2 : col.ink2;
          ctx.beginPath(); ctx.arc(ox + c * s + s / 2 + p.x, oy + r * s + s / 2 + p.y, 2.2, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ---------- input ----------
      api.on(view.canvas, 'pointermove', e => { const [x, y] = localXY(e); hover = edgeAt(x, y); if (hover >= 0) useCursor = false; });
      api.on(view.canvas, 'pointerleave', () => { hover = -1; });
      api.on(view.canvas, 'pointerdown', e => { const [x, y] = localXY(e); const t = edgeAt(x, y); if (t >= 0) { useCursor = false; hover = t; playerMove(t); } });
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a') moveCur(0, -1);
        else if (k === 'ArrowRight' || k === 'd') moveCur(0, 1);
        else if (k === 'ArrowUp' || k === 'w') moveCur(-1, 0);
        else if (k === 'ArrowDown' || k === 's') moveCur(1, 0);
        else if (k === ' ' || k === 'Enter') { e.preventDefault(); useCursor = true; playerMove(curEdge()); }
      });

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.edges) || sv.edges.length !== E || !Array.isArray(sv.boxes) || sv.boxes.length !== N * N) return false;
        const ok = v => v === 0 || v === P || v === C;
        if (!sv.edges.every(ok) || !sv.boxes.every(ok)) return false;
        st = { edges: Int8Array.from(sv.edges), boxes: Int8Array.from(sv.boxes) };
        if (!L.free(st.edges).length) return false;
        turn = sv.turn === C ? C : P; last = Number.isInteger(sv.last) ? sv.last : -1;
        if (sv.cur && Number.isInteger(sv.cur.r) && Number.isInteger(sv.cur.c)) cur = { r: sv.cur.r, c: sv.cur.c };
        api.score(count(P));
        if (turn === C && !friend) cpuStep(false);
        return true;
      }

      api.score(0);
      restore(api.saved);
      api.loop(dt => render(dt));
      return {
        save() {
          if (api.ended) return null;
          if (phase !== 'play' || !L.free(st.edges).length) return { v: 1, dead: true };
          if (L.free(st.edges).length === E) return null;
          return { v: 1, edges: Array.from(st.edges), boxes: Array.from(st.boxes), turn, last, cur: { r: cur.r, c: cur.c } };
        }
      };
    }
  });
})();
