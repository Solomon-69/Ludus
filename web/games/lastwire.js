/* Last Wire: nine wires, one is live. Take turns cutting; whoever cuts the live one loses the round.
   Twist for solo play: each side has two scans a round. A scan (instead of a cut) tells both players
   whether the live wire is that wire or one of its neighbours. First to two rounds. */
(function () {
  const N = 9, TARGET = 2, SCANS = 2, P = 1, C = 2, ALL = (1 << N) - 1;
  const COLORS = ['#e5483d', '#2f6fe0', '#f2c230', '#2fa35a', '#e6e6e6', '#f08a24', '#8a5ad8', '#8a5a3a', '#ef6fa8'];
  const bits = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const nbMask = i => ((1 << i) | (i > 0 ? 1 << (i - 1) : 0) | (i < N - 1 ? 1 << (i + 1) : 0)) & ALL;

  // ---------- pure rules + AI ----------
  // public knowledge: cut mask, cand mask (wires that could still be live), scans left
  const memo = new Map();
  const logic = {
    N, nbMask, bits,
    // probability the side to move wins the round
    value(cut, cand, sMe, sOp) {
      const key = cut | (cand << 9) | (sMe << 18) | (sOp << 21);
      const hit = memo.get(key); if (hit !== undefined) return hit;
      let best = 0;
      for (const m of logic.options(cut, cand, sMe)) { const v = logic.moveValue(cut, cand, sMe, sOp, m); if (v > best) best = v; }
      memo.set(key, best);
      return best;
    },
    options(cut, cand, sMe) {
      const out = [];
      for (let i = 0; i < N; i++) if (!(cut & (1 << i))) { out.push({ type: 'cut', i }); if (sMe > 0) out.push({ type: 'scan', i }); }
      return out;
    },
    moveValue(cut, cand, sMe, sOp, m) {
      const k = bits(cand), b = 1 << m.i;
      if (m.type === 'cut') {
        if (cand & b) {
          if (k === 1) return 0;
          return ((k - 1) / k) * (1 - logic.value(cut | b, cand & ~b, sOp, sMe));
        }
        return 1 - logic.value(cut | b, cand, sOp, sMe);
      }
      const nb = nbMask(m.i), yes = cand & nb, no = cand & ~nb;
      let v = 0;
      if (yes) v += (bits(yes) / k) * (1 - logic.value(cut, yes, sOp, sMe - 1));
      if (no) v += (bits(no) / k) * (1 - logic.value(cut, no, sOp, sMe - 1));
      return v;
    },
    choose(pub, level, rnd) {
      rnd = rnd || Math.random;
      const { cut, cand, sMe, sOp } = pub;
      const uncut = []; for (let i = 0; i < N; i++) if (!(cut & (1 << i))) uncut.push(i);
      const safe = uncut.filter(i => !(cand & (1 << i)));
      const pick = a => a[Math.floor(rnd() * a.length)];
      if (level === 0) {
        if (sMe > 0 && bits(cand) > 1 && rnd() < 0.2) return { type: 'scan', i: pick(uncut) };
        if (safe.length && rnd() < 0.5) return { type: 'cut', i: pick(safe) };
        return { type: 'cut', i: pick(uncut) };
      }
      if (level === 1 && rnd() < 0.6) {
        if (safe.length) return { type: 'cut', i: pick(safe) };
        if (sMe > 0 && bits(cand) > 1) {
          // scan that splits the candidates most evenly
          let best = 99, opts = [];
          for (const i of uncut) { const y = bits(cand & nbMask(i)), d = Math.abs(bits(cand) - 2 * y); if (d < best) { best = d; opts = [i]; } else if (d === best) opts.push(i); }
          return { type: 'scan', i: pick(opts) };
        }
        return { type: 'cut', i: pick(uncut) };
      }
      let best = -1, opts = [];
      for (const m of logic.options(cut, cand, sMe)) {
        const v = logic.moveValue(cut, cand, sMe, sOp, m);
        if (v > best + 1e-9) { best = v; opts = [m]; } else if (Math.abs(v - best) <= 1e-9) opts.push(m);
      }
      // among equal moves, prefer cutting over spending a scan
      const cuts = opts.filter(m => m.type === 'cut');
      return pick(cuts.length ? cuts : opts);
    }
  };

  Ludus.register({
    id: 'lastwire', name: 'Last Wire', tag: 'Duel', tint: '#d1495b', versus: true,
    hint: 'Click a wire (or <kbd>↑</kbd><kbd>↓</kbd> + <kbd>Space</kbd>) to cut. <kbd>S</kbd> then a wire scans it and its neighbours. Cutting the live wire loses the round. Bot or vs Friend (take turns on one keyboard)',
    _logic: logic,
    art(ctx, w, h) {
      const D = Ludus.draw;
      const pw = Math.min(w * 0.82, 150), ph = h * 0.8, px = (w - pw) / 2, py = (h - ph) / 2;
      ctx.fillStyle = '#23262d'; D.roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
      ctx.fillStyle = '#0b0c0e'; D.roundRect(ctx, px + 6, py + 5, pw * 0.4, ph * 0.24, 3); ctx.fill();
      ctx.font = `700 ${ph * 0.2}px ui-monospace, Menlo, monospace`; ctx.fillStyle = '#ff3b30'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('03', px + 10, py + 5 + ph * 0.125);
      const n = 4, top = py + ph * 0.36, gap = (ph * 0.6) / n;
      [0, 1, 2, 5].forEach((ci, k) => {
        const y = top + k * gap + gap / 2, cutw = k === 1 || k === 3;
        ctx.strokeStyle = COLORS[ci]; ctx.lineWidth = gap * 0.36; ctx.lineCap = 'round';
        if (!cutw) { ctx.beginPath(); ctx.moveTo(px + 10, y); ctx.lineTo(px + pw - 10, y); ctx.stroke(); }
        else {
          ctx.beginPath(); ctx.moveTo(px + 10, y); ctx.lineTo(px + pw / 2 - 6, y + 3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + pw / 2 + 6, y - 3); ctx.lineTo(px + pw - 10, y); ctx.stroke();
        }
      });
      D.spark(ctx, px + pw - 18, py + 5 + ph * 0.12, ph * 0.1, '#ffd2c2');
    },
    create(stage, api) {
      const D = Ludus.draw, L = logic;
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend, nameOf = who => (who === P ? 'Player 1' : 'Player 2');
      const sk = who => (who === P ? 'p' : 'c');
      const whoAv = who => (who === P ? 'you' : friend ? 'p2' : 'bot');
      let wins = { p: 0, c: 0 }, starter = P;
      let live, cut, cutBy, cand, scans, turn, phase, scanMode = false, sel = 4, hover = -1;
      let cutT, scanFx = null, boomAt = 0, boomWire = -1, flash = 0, shake = 0, banner = null, cpuAim = -1, thinking = false;
      let geo = null, bounceBtn = 0;

      function newRound(quiet) {
        live = Math.floor(Math.random() * N); cut = 0; cand = ALL; cutBy = new Int8Array(N); cutT = new Float64Array(N);
        scans = { p: SCANS, c: SCANS }; turn = starter; phase = 'play'; scanMode = false; banner = null; boomWire = -1; scanFx = null; cpuAim = -1;

        if (turn === C && !quiet && !friend) cpuTurn();
      }
      const pub = who => ({ cut, cand, sMe: who === P ? scans.p : scans.c, sOp: who === P ? scans.c : scans.p });
      const left = () => N - bits(cut);

      function doCut(i, who) {
        if (cut & (1 << i)) return;
        cut |= 1 << i; cutBy[i] = who; cutT[i] = performance.now();
        if (i === live) return boom(i, who);
        cand &= ~(1 << i);
        api.sfx('click');
        nextTurn(who);
      }
      function doScan(i, who) {
        const k = sk(who);
        if (scans[k] <= 0 || (cut & (1 << i))) return;
        scans[k]--;
        const nb = nbMask(i), near = (nb & (1 << live)) !== 0;
        cand = near ? cand & nb : cand & ~nb;
        scanFx = { i, near, who, t0: performance.now() };
        api.sfx('power');
        api.timeout(() => api.sfx(near ? 'hit' : 'merge'), 260);
        nextTurn(who);
      }
      function nextTurn(who) {
        turn = who === P ? C : P; scanMode = false;
        if (turn === C && !friend) cpuTurn();
      }
      function boom(i, who) {
        phase = 'boom'; boomWire = i; boomAt = performance.now(); flash = 1;
        if (!api.reduceMotion) shake = 0.5;
        api.sfx('boom');
        const winner = who === P ? 'c' : 'p';
        wins[winner]++;
        if (winner === 'p' && !friend) api.score(wins.p);
        banner = friend
          ? { text: nameOf(who) + ' cut it. Boom', sub: winner === 'p' ? 'ROUND TO P1' : 'ROUND TO P2', t0: performance.now() }
          : { text: who === P ? 'You cut it. Boom' : 'Bot cut it. Boom', sub: winner === 'p' ? 'ROUND TO YOU' : 'ROUND TO BOT', t0: performance.now() };
        const done = wins[winner] >= TARGET;
        api.timeout(() => {
          if (done && friend) api.over({ score: TARGET, won: true, title: (winner === 'p' ? 'Player 1' : 'Player 2') + ' wins', message: `Rounds ${wins.p} to ${wins.c}` });
          else if (done) api.over({ score: wins.p, won: winner === 'p', title: winner === 'p' ? 'You win' : 'Bot wins', message: `Rounds ${wins.p} to ${wins.c}` });
          else { starter = starter === P ? C : P; newRound(); }
        }, done ? 1700 : 2100);
      }

      function cpuTurn() {
        thinking = true;
        const move = L.choose(pub(C), api.level);
        // tense hover: drift across a few wires, settle on the target
        const steps = 2 + Math.floor(Math.random() * 3);
        let t = 220;
        for (let s = 0; s < steps; s++) {
          api.timeout(() => {
            const opts = []; for (let i = 0; i < N; i++) if (!(cut & (1 << i))) opts.push(i);
            cpuAim = opts[Math.floor(Math.random() * opts.length)]; api.sfx('tick');
          }, t);
          t += api.rand(170, 280);
        }
        api.timeout(() => { cpuAim = move.i; api.sfx('tick'); }, t);
        t += api.rand(380, 600);
        api.timeout(() => {
          thinking = false; cpuAim = -1;
          if (phase !== 'play' || turn !== C) return;
          if (move.type === 'scan') doScan(move.i, C); else doCut(move.i, C);
        }, t);
      }

      function act(i) {
        if (phase !== 'play' || (turn !== P && !friend) || thinking || i < 0 || (cut & (1 << i))) return;
        if (scanMode && scans[sk(turn)] > 0) doScan(i, turn); else doCut(i, turn);
      }
      function toggleScan() {
        if (phase !== 'play' || (turn !== P && !friend) || scans[sk(turn)] <= 0) { api.sfx('hit'); return; }
        scanMode = !scanMode; bounceBtn = performance.now(); api.sfx('tap');
      }

      // ---------- layout ----------
      function layout() {
        const { w, h } = view, top = 62;
        const px = 10, pw = w - 20, py = top, ph = Math.max(200, h - top - 10);
        const ro = { x: px + 14, y: py + 14, w: pw - 28, h: Math.min(50, ph * 0.13) };
        const btn = { w: Math.min(150, pw * 0.45), h: 32 }; btn.x = px + pw / 2 - btn.w / 2; btn.y = py + ph - btn.h - 12;
        const wy0 = ro.y + ro.h + 12, wy1 = btn.y - 10, row = (wy1 - wy0) / N;
        geo = { px, py, pw, ph, ro, btn, wy0, row, x0: px + 22, x1: px + pw - 22 };
      }
      const local = e => { const r = view.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      function wireAt(x, y) {
        if (!geo || x < geo.px || x > geo.px + geo.pw) return -1;
        const i = Math.floor((y - geo.wy0) / geo.row);
        return i >= 0 && i < N ? i : -1;
      }
      const inBtn = (x, y) => geo && x >= geo.btn.x && x <= geo.btn.x + geo.btn.w && y >= geo.btn.y && y <= geo.btn.y + geo.btn.h;

      // ---------- drawing ----------
      const mono = s => `700 ${s}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      function hud(col) {
        const playing = phase === 'play';
        const status = !playing ? (banner ? banner.text : '') : friend ? (scanMode ? nameOf(turn) + ': pick a wire to scan' : left() === 1 ? 'Only one left' : nameOf(turn) + '\u2019s move') : turn === P ? (scanMode ? 'Pick a wire to scan' : left() === 1 ? 'Only one left' : 'Your move') : 'Bot is thinking';
        D.duelHeader(ctx, 8, 8, view.w - 16, {
          left: friend ? { who: 'you', label: 'Player 1', pips: wins.p, of: TARGET } : { who: 'you', pips: wins.p, of: TARGET },
          right: friend ? { who: 'p2', label: 'Player 2', pips: wins.c, of: TARGET } : { who: 'bot', pips: wins.c, of: TARGET },
          turn: playing ? (turn === P ? 'left' : 'right') : null, status, thinking: playing && turn === C && !friend
        }, col);
      }

      function drawWire(i, col, now) {
        const y = geo.wy0 + geo.row * i + geo.row / 2, x0 = geo.x0, x1 = geo.x1, th = Math.min(10, geo.row * 0.34);
        const isCut = cut & (1 << i), color = COLORS[i];
        const target = (turn === P || friend) && phase === 'play' && (hover === i || (hover < 0 && sel === i));
        // scan bracket preview
        if (target && scanMode && !isCut && i === (hover >= 0 ? hover : sel)) {
          const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
          ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
          D.roundRect(ctx, x0 - 8, geo.wy0 + geo.row * a + 1, x1 - x0 + 16, geo.row * (b - a + 1) - 2, 7); ctx.stroke(); ctx.setLineDash([]);
        }
        if (target && !isCut && !scanMode) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; D.roundRect(ctx, x0 - 8, y - geo.row / 2 + 1, x1 - x0 + 16, geo.row - 2, 7); ctx.fill(); }
        // terminals
        [x0, x1].forEach(tx => { ctx.fillStyle = '#9aa0ad'; D.roundRect(ctx, tx - 8, y - 8, 16, 16, 4); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx - 8, y + 5, 16, 3); });
        // knowledge LED on left terminal: green = ruled out, amber = could be live
        if (phase === 'play' && !isCut) {
          ctx.beginPath(); ctx.arc(x0, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = cand & (1 << i) ? (bits(cand) <= 3 ? '#ff8a1f' : '#6b5a3a') : '#4fdc7a'; ctx.fill();
        }
        const boomHere = boomWire === i;
        ctx.lineCap = 'round'; ctx.lineWidth = th;
        const draw = (ax, ay, bx, by) => {
          ctx.strokeStyle = boomHere ? '#ff8a1f' : color;
          if (boomHere) { ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 14; }
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = th * 0.25;
          ctx.beginPath(); ctx.moveTo(ax, ay - th * 0.2); ctx.lineTo(bx, by - th * 0.2); ctx.stroke(); ctx.lineWidth = th;
        };
        if (!isCut) {
          const aimed = cpuAim === i && thinking;
          const wob = aimed && !api.reduceMotion ? Math.sin(now / 40) * 1.2 : 0;
          draw(x0 + 8, y, x1 - 8, y + wob);
          if (aimed) D.avatar(ctx, (x0 + x1) / 2, y, Math.min(11, geo.row * 0.42), 'bot', Object.assign({}, col, { dark: true }));
          else if (target && !scanMode) {
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo((x0 + x1) / 2 - 4, y - 10); ctx.lineTo((x0 + x1) / 2 + 4, y + 10); ctx.stroke();
          }
        } else {
          const k = api.reduceMotion ? 1 : Math.min(1, (now - cutT[i]) / 380), e = D.ease.outBack(k);
          const mid = (x0 + x1) / 2, gap = 24 * e, dy = 7 * e;
          draw(x0 + 8, y, mid - gap, y + dy);
          draw(mid + gap, y - dy, x1 - 8, y);
          if (!boomHere) D.avatar(ctx, mid, y, Math.min(9, geo.row * 0.36), whoAv(cutBy[i]), Object.assign({}, col, { dark: true }));
        }
        if (phase === 'boom' && i === live && !boomHere) {
          ctx.strokeStyle = '#ff8a1f'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
          D.roundRect(ctx, x0 - 8, y - geo.row / 2 + 1, x1 - x0 + 16, geo.row - 2, 7); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      function render(dt) {
        const col = api.colors(), now = performance.now(), { w, h } = view;
        layout();
        ctx.clearRect(0, 0, w, h);
        hud(col);
        const { px, py, pw, ph, ro, btn } = geo;
        ctx.save();
        if (shake > 0) { shake = Math.max(0, shake - dt); const k = shake * 18; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
        // panel
        ctx.fillStyle = col.dark ? '#1b1e24' : '#23262d'; D.roundRect(ctx, px, py, pw, ph, 16); ctx.fill();
        ctx.strokeStyle = col.dark ? '#343944' : '#3a3e48'; ctx.lineWidth = 2; ctx.stroke();
        [[px + 9, py + 9], [px + pw - 9, py + 9], [px + 9, py + ph - 9], [px + pw - 9, py + ph - 9]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#565b67'; ctx.fill(); });
        // readout
        ctx.fillStyle = '#0b0c0e'; D.roundRect(ctx, ro.x, ro.y, ro.w, ro.h, 8); ctx.fill();
        ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = 1; ctx.stroke();
        const lsz = ro.h * 0.68, blinkOn = phase !== 'boom' || Math.floor(now / 500) % 2 === 0;
        ctx.font = mono(lsz); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const digits = phase === 'boom' ? '88' : String(left()).padStart(2, '0');
        ctx.fillStyle = '#3a1715'; ctx.fillText('88', ro.x + 12, ro.y + ro.h / 2 + 1);
        if (blinkOn) { ctx.fillStyle = '#ff3b30'; ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 10; ctx.fillText(digits[0] === '0' && phase !== 'boom' ? ' ' + digits[1] : digits, ro.x + 12, ro.y + ro.h / 2 + 1); ctx.shadowBlur = 0; }
        // right side: scan result or odds
        ctx.textAlign = 'right';
        const rx = ro.x + ro.w - 12;
        let small = 'ODDS OF BOOM', big;
        const k = bits(cand);
        if (phase === 'boom') { small = 'DETONATED'; big = banner ? banner.sub : ''; }
        else if (scanFx && now - scanFx.t0 < 1800) { small = (friend ? (scanFx.who === P ? 'P1' : 'P2') : scanFx.who === P ? 'YOUR' : 'BOT') + ' SCAN'; big = scanFx.near ? 'LIVE NEAR' : 'ALL CLEAR'; }
        else big = k === 1 ? 'CERTAIN' : '1 IN ' + k;
        ctx.font = mono(Math.max(8, ro.h * 0.17)); ctx.fillStyle = '#7e8594'; ctx.fillText(small, rx, ro.y + ro.h * 0.3);
        ctx.font = mono(Math.max(11, ro.h * 0.3));
        ctx.fillStyle = scanFx && now - scanFx.t0 < 1800 && phase !== 'boom' ? (scanFx.near ? '#ff8a1f' : '#4fdc7a') : '#c9cdd6';
        ctx.fillText(big, rx, ro.y + ro.h * 0.66);
        // wires
        for (let i = 0; i < N; i++) drawWire(i, col, now);
        // scan sweep effect
        if (scanFx && !api.reduceMotion) {
          const t = (now - scanFx.t0) / 700;
          if (t < 1) {
            const a = Math.max(0, scanFx.i - 1), b = Math.min(N - 1, scanFx.i + 1);
            const y0 = geo.wy0 + geo.row * a, y1 = geo.wy0 + geo.row * (b + 1);
            const sx = D.lerp(geo.x0, geo.x1, D.ease.inOut(t));
            const g = ctx.createLinearGradient(sx - 40, 0, sx + 4, 0);
            g.addColorStop(0, 'rgba(127,211,255,0)'); g.addColorStop(1, scanFx.near ? 'rgba(255,138,31,0.55)' : 'rgba(127,211,255,0.55)');
            ctx.fillStyle = g; ctx.fillRect(sx - 40, y0, 44, y1 - y0);
          }
        }
        // scan button
        const mine = friend ? scans[sk(turn)] : scans.p, theirs = friend ? scans[sk(turn === P ? C : P)] : scans.c;
        const active = scanMode, can = phase === 'play' && (turn === P || friend) && mine > 0;
        const bk = api.reduceMotion ? 1 : 1 - 0.06 * Math.max(0, 1 - (now - bounceBtn) / 160);
        ctx.save(); ctx.translate(btn.x + btn.w / 2, btn.y + btn.h / 2); ctx.scale(bk, bk);
        ctx.fillStyle = active ? '#7fd3ff' : can ? '#343944' : '#2a2e36';
        D.roundRect(ctx, -btn.w / 2, -btn.h / 2, btn.w, btn.h, btn.h / 2); ctx.fill();
        D.text(ctx, active ? 'Scanning' : 'Scan', -10, 1, 12.5, active ? '#0b0c0e' : can ? '#e8eaef' : '#6b707c', 700);
        for (let s = 0; s < SCANS; s++) { ctx.beginPath(); ctx.arc(btn.w / 2 - 34 + s * 11, 0, 3.5, 0, Math.PI * 2); ctx.fillStyle = s < mine ? (active ? '#0b0c0e' : '#7fd3ff') : '#4b505c'; ctx.fill(); }
        ctx.restore();
        // computer scans left (small dots at the right of the button row)
        for (let s = 0; s < SCANS; s++) { ctx.beginPath(); ctx.arc(px + pw - 22 - s * 10, btn.y + btn.h / 2, 3, 0, Math.PI * 2); ctx.fillStyle = s < theirs ? '#9aa0ad' : '#3a3e48'; ctx.fill(); }
        ctx.font = mono(9); ctx.fillStyle = '#6b707c'; ctx.textAlign = 'right'; ctx.fillText(friend ? (turn === P ? 'P2' : 'P1') : 'BOT', px + pw - 22 - SCANS * 10, btn.y + btn.h / 2 + 1);
        // flash
        if (flash > 0) {
          flash = Math.max(0, flash - dt * 1.4);
          const g = ctx.createRadialGradient(w / 2, py + ph / 2, 10, w / 2, py + ph / 2, Math.max(w, h) * 0.7);
          g.addColorStop(0, `rgba(255,138,31,${0.85 * flash})`); g.addColorStop(1, 'rgba(255,138,31,0)');
          ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
        }
        ctx.restore();
      }

      // ---------- input ----------
      api.on(view.canvas, 'pointermove', e => { const [x, y] = local(e); hover = inBtn(x, y) ? -1 : wireAt(x, y); view.canvas.style.cursor = hover >= 0 || inBtn(x, y) ? 'pointer' : ''; });
      api.on(view.canvas, 'pointerleave', () => { hover = -1; });
      api.on(view.canvas, 'pointerdown', e => {
        const [x, y] = local(e);
        if (inBtn(x, y)) return toggleScan();
        const i = wireAt(x, y); if (i >= 0) { sel = i; act(i); }
      });
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowUp') { sel = (sel + N - 1) % N; hover = -1; api.sfx('tick'); }
        else if (k === 'ArrowDown') { sel = (sel + 1) % N; hover = -1; api.sfx('tick'); }
        else if (k === 's' || k === 'S') toggleScan();
        else if (k === ' ' || k === 'Enter') { e.preventDefault(); act(sel); }
        else if (k >= '1' && k <= '9') { sel = +k - 1; hover = -1; act(sel); }
      });

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || !sv.wins) return false;
        const wp = sv.wins.p | 0, wc = sv.wins.c | 0;
        if (wp < 0 || wc < 0 || wp >= TARGET || wc >= TARGET) return false;
        wins = { p: wp, c: wc }; starter = sv.starter === C ? C : P; if (!friend) api.score(wins.p);
        if (sv.fresh) { newRound(); return true; }
        const okMask = m => Number.isInteger(m) && m >= 0 && m <= ALL;
        if (!Number.isInteger(sv.live) || sv.live < 0 || sv.live >= N || !okMask(sv.cut) || !okMask(sv.cand) || (sv.cut & (1 << sv.live))) return false;
        if (!Array.isArray(sv.cutBy) || sv.cutBy.length !== N || !sv.scans) return false;
        newRound(true);
        live = sv.live; cut = sv.cut; cand = sv.cand | (1 << live); cutBy = Int8Array.from(sv.cutBy);
        scans = { p: Math.max(0, Math.min(SCANS, sv.scans.p | 0)), c: Math.max(0, Math.min(SCANS, sv.scans.c | 0)) };
        for (let i = 0; i < N; i++) if (cut & (1 << i)) cutT[i] = -1e9;
        sel = Math.max(0, Math.min(N - 1, sv.sel | 0));
        thinking = false; cpuAim = -1; turn = sv.turn === C ? C : P;
        if (turn === C && !friend) cpuTurn();
        return true;
      }

      api.score(0);
      if (!restore(api.saved)) newRound();
      api.loop(dt => render(dt));
      return {
        save() {
          if (api.ended) return null;
          if (phase !== 'play') return { v: 1, fresh: true, wins: { p: wins.p, c: wins.c }, starter: starter === P ? C : P };
          if (!cut && !wins.p && !wins.c && scans.p === SCANS && scans.c === SCANS) return null;
          return { v: 1, live, cut, cand, cutBy: Array.from(cutBy), scans: { p: scans.p, c: scans.c }, turn, wins: { p: wins.p, c: wins.c }, starter, sel };
        }
      };
    }
  });
})();
