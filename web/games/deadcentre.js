/* Dead Centre: stop the needle on the line. You and the computer each get one shot per round.
   Closest wins the round (within 0.3 is a dead heat). First to 3 takes the match.
   From round 3 the needle surges, from round 5 it may reverse. Score = matches won in a row. */
(function () {
  const TEAL = '#3aa6a6';
  const TARGET = 3, TIE = 0.3;
  const modeOf = n => (n <= 2 ? 'Steady' : n <= 4 ? 'Surging' : 'Erratic');
  const speedOf = n => 70 + n * 16; // % of the bar per second
  // Advance the needle by dt. s = { pos, dir, phase, flipIn }. Pure apart from rnd.
  function stepNeedle(s, n, dt, rnd) {
    const m = modeOf(n);
    let v = speedOf(n);
    if (m !== 'Steady') { s.phase += dt * (2.2 + n * 0.15); v *= 0.45 + 0.9 * Math.abs(Math.sin(s.phase)); }
    if (m === 'Erratic') {
      s.flipIn -= dt;
      if (s.flipIn <= 0) { if (rnd() < 0.55) s.dir *= -1; s.flipIn = 0.35 + rnd() * 0.7; }
    }
    s.pos += s.dir * v * dt;
    if (s.pos > 100) { s.pos = 200 - s.pos; s.dir = -1; }
    if (s.pos < 0) { s.pos = -s.pos; s.dir = 1; }
    return s;
  }
  // How far off the computer aims (normal-ish spread, wider on easy and in later rounds).
  function cpuError(level, n, rnd) {
    const sd = [4.2, 1.9, 0.85][level] * (1 + Math.max(0, n - 2) * 0.12);
    const g = (rnd() + rnd() + rnd() - 1.5) * 2; // roughly normal, sd about 1
    return g * sd;
  }
  const judge = (a, b, t) => {
    const da = Math.abs(a - t), db = Math.abs(b - t);
    return Math.abs(da - db) < TIE ? 0 : da < db ? 1 : -1;
  };

  Ludus.register({
    id: 'deadcentre', name: 'Dead Centre', tag: 'Duel', tint: TEAL, versus: true, online: { min: 2, max: 2 },
    onlineHint: '<kbd>Space</kbd> or a click stops the needle on your turn. Closer to the line than your opponent wins the round. First to 3',
    hint: '<kbd>Space</kbd> or a click stops the needle on your turn. Closer to the line than the bot wins the round. First to 3. vs Friend: take turns, Space stops for whoever is up',
    _rules: { stepNeedle, cpuError, judge, modeOf },
    art(ctx, w, h) {
      const D = Ludus.draw, bx = w * 0.12, bw = w * 0.76, by = h * 0.36, bh = h * 0.3;
      ctx.fillStyle = 'rgba(10,40,40,0.35)'; D.roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.fillStyle = '#eafff8'; ctx.fillRect(bx + bw * 0.58 - 1, by - 4, 2, bh + 8);
      ctx.fillStyle = '#fff'; D.roundRect(ctx, bx + bw * 0.55 - 2, by + 4, 4, bh - 8, 2); ctx.fill();
      ctx.fillStyle = '#d97757'; D.roundRect(ctx, bx + bw * 0.62 - 2, by + 7, 4, bh - 14, 2); ctx.fill();
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend;
      // Online: seat 0 is 'you' (left), seat 1 is 'cpu' (right). The line comes from the shared random stream so both
      // screens see the same one. Each player stops their own needle and sends the spot as 'stop' { v }; the other screen
      // shows the mark and the result. (The needle is only drawn for the player whose shot it is.)
      const on = api.online;
      const mySide = on ? (on.seat === 0 ? 'you' : 'cpu') : '';
      const mayAct = () => !on || turn === mySide;
      const nameOf = k => (on && on.names[k === 'you' ? 0 : 1]) || (k === 'you' ? 'Player 1' : 'Player 2');
      let clock = 0, matches = 0, roundNo = 1, starter = 'you';
      let pts = { you: 0, cpu: 0 }, shot = { you: -1, cpu: -1 }, landT = { you: -9, cpu: -9 };
      let target = 50, turn = 'you', phase = 'ready', phaseT = 0, roundRes = 0;
      const needle = { pos: 0, dir: 1, phase: 0, flipIn: 0.6 };
      let cpuAim = 50, cpuMinT = 0, prevPos = 0, glowT = -9, shake = 0, banner = null, parts = [];
      api.score(0);

      const newTarget = () => Math.round((12 + (on ? on.rand() : Math.random()) * 76) * 10) / 10;
      let counted = false;
      function startRound() {
        counted = false; target = newTarget(); shot = { you: -1, cpu: -1 }; roundRes = 0;
        turn = starter; beginShot();
      }
      function beginShot() {
        phase = 'ready'; phaseT = clock;
        needle.pos = Math.random() < 0.5 ? 0 : 100; needle.dir = needle.pos ? -1 : 1;
        needle.phase = Math.random() * 3; needle.flipIn = 0.6;
        api.timeout(() => {
          phase = 'run'; phaseT = clock; prevPos = needle.pos;
          if (turn === 'cpu' && !friend) { cpuAim = Math.max(0.5, Math.min(99.5, target + cpuError(api.level, roundNo, Math.random))); cpuMinT = clock + api.rand(0.7, 1.5); }
        }, api.reduceMotion ? 250 : 550);
      }
      function stopAt(who, fixed) {
        if (phase !== 'run' || turn !== who) return;
        const v = fixed !== undefined ? fixed : Math.round(needle.pos * 10) / 10;
        if (on && fixed === undefined) on.send('stop', { v });
        shot[who] = v; landT[who] = clock; phase = 'stopped'; api.sfx('drop');
        const off = Math.abs(v - target);
        if (off < 0.1) { glowT = clock; api.sfx('power'); burst(v); }
        const other = who === 'you' ? 'cpu' : 'you';
        if (shot[other] < 0) api.timeout(() => { turn = other; beginShot(); }, 650);
        else api.timeout(finishRound, 500);
      }
      function finishRound() {
        roundRes = judge(shot.you, shot.cpu, target);
        phase = 'result'; phaseT = clock;
        if (roundRes > 0) { pts.you++; api.sfx('score'); }
        else if (roundRes < 0) { pts.cpu++; if (friend) api.sfx('score'); else { api.sfx('hit'); if (!api.reduceMotion) shake = 0.22; } }
        else api.sfx('tap');
        api.timeout(() => {
          if (friend && (pts.you >= TARGET || pts.cpu >= TARGET)) {
            const w = pts.you >= TARGET ? 'you' : 'cpu';
            phase = 'done'; api.sfx('win');
            api.timeout(() => api.over({ score: TARGET, won: true, title: nameOf(w) + ' wins', message: 'Match ' + pts.you + ' to ' + pts.cpu }), 900);
            return;
          }
          if (pts.you >= TARGET) {
            matches++; counted = true; api.score(matches); api.sfx('win');
            banner = { title: 'Match won', sub: matches + (matches === 1 ? ' match' : ' matches') + ' in a row', t: clock };
            api.timeout(() => { banner = null; pts = { you: 0, cpu: 0 }; roundNo = 1; starter = starter === 'you' ? 'cpu' : 'you'; startRound(); }, 1700);
          } else if (pts.cpu >= TARGET) {
            phase = 'done';
            api.timeout(() => api.over({ score: matches, won: false, title: 'Bot wins', message: matches ? matches + (matches === 1 ? ' match' : ' matches') + ' won in a row' : 'No matches won this time' }), 900);
          } else { roundNo++; starter = starter === 'you' ? 'cpu' : 'you'; startRound(); }
        }, 1300);
      }
      function burst(v) {
        if (api.reduceMotion) return;
        const L = layout(), x = L.bx + L.bw * v / 100, y = L.by + L.bh / 2;
        for (let i = 0; i < 26; i++) parts.push({ x, y, vx: api.rand(-200, 200), vy: api.rand(-240, 60), life: api.rand(0.4, 0.8), s: api.rand(2, 4) });
      }

      function layout() {
        const w = view.w, h = view.h;
        const bx = 18, bw = w - 36, bh = Math.min(96, h * 0.2), by = Math.max(84, h * 0.36 - bh / 2);
        const btn = { w: Math.min(220, w - 60), h: 48 };
        btn.x = (w - btn.w) / 2; btn.y = h - btn.h - 16;
        return { w, h, bx, bw, bh, by, btn };
      }
      // vs Friend: Space, Enter or a click stops the needle for whoever is up
      const stopper = () => (on ? mySide : friend ? turn : 'you');
      api.on(view.canvas, 'pointerdown', () => stopAt(stopper()));
      api.keys(e => { if (e.key === ' ' || e.key === 'Enter') stopAt(stopper()); });

      function pips(x, y, n, col, line, left) {
        for (let i = 0; i < TARGET; i++) {
          ctx.fillStyle = i < n ? col : line;
          ctx.beginPath(); ctx.arc(left ? x + i * 14 : x - i * 14, y, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      function render() {
        const col = api.colors(), L = layout(), { w, h } = L;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) ctx.translate(api.rand(-1, 1) * shake * 12, 0);
        // header
        const mode = modeOf(roundNo), BOTC = friend ? D.P2 : '#c9cdd6';
        const going = phase === 'ready' || phase === 'run';
        D.duelHeader(ctx, 8, 8, w - 16, {
          left: friend ? { who: 'you', label: nameOf('you'), pips: pts.you, of: TARGET } : { who: 'you', pips: pts.you, of: TARGET },
          right: friend ? { who: 'p2', label: nameOf('cpu'), pips: pts.cpu, of: TARGET } : { who: 'bot', pips: pts.cpu, of: TARGET },
          turn: going ? (turn === 'you' ? 'left' : 'right') : null,
          status: phase === 'done' ? (friend ? nameOf(pts.you >= TARGET ? 'you' : 'cpu') + ' wins' : 'Bot wins') : 'Round ' + roundNo, thinking: going && turn === 'cpu' && !friend
        }, col);
        D.text(ctx, mode === 'Steady' ? 'Steady needle' : mode === 'Surging' ? 'Surging needle' : 'Erratic needle', w / 2, 64, 11, mode === 'Steady' ? col.ink3 : mode === 'Surging' ? TEAL : col.bad, 650);

        // the bar
        const { bx, bw, bh, by } = L, X = v => bx + bw * v / 100;
        const gk = clock - glowT;
        if (gk < 0.8 && !api.reduceMotion) {
          ctx.fillStyle = TEAL; ctx.globalAlpha = 0.35 * (1 - gk / 0.8);
          D.roundRect(ctx, bx - 14 * gk, by - 14 * gk, bw + 28 * gk, bh + 28 * gk, 14 + 14 * gk); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = col.dark ? '#15171a' : '#2a2622';
        D.roundRect(ctx, bx, by, bw, bh, 14); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        for (let i = 1; i < 10; i++) ctx.fillRect(X(i * 10) - 0.5, by + 6, 1, bh - 12);
        ctx.fillStyle = 'rgba(58,166,166,0.18)'; ctx.fillRect(X(target - TIE), by, Math.max(2, X(target + TIE) - X(target - TIE)), bh);
        ctx.fillStyle = '#5fd6c4'; ctx.shadowColor = '#5fd6c4'; ctx.shadowBlur = 10;
        ctx.fillRect(X(target) - 1, by, 2, bh); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(X(target) - 6, by); ctx.lineTo(X(target) + 6, by); ctx.lineTo(X(target), by + 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(X(target) - 6, by + bh); ctx.lineTo(X(target) + 6, by + bh); ctx.lineTo(X(target), by + bh - 7); ctx.fill();
        // marks
        [['you', col.accent], ['cpu', BOTC]].forEach(([k, c]) => {
          if (shot[k] < 0) return;
          const t = clock - landT[k], sy = t < 0.3 && !api.reduceMotion ? 1 + 0.6 * (1 - D.ease.outCubic(t / 0.3)) : 1;
          const mh = (bh - 28) * sy;
          ctx.fillStyle = c; D.roundRect(ctx, X(shot[k]) - 3, by + bh / 2 - mh / 2, 6, mh, 3); ctx.fill();
          if (k === 'you') D.avatar(ctx, X(shot[k]), by - 14, 10, 'you', col);
          else D.avatar(ctx, X(shot[k]), by + bh + 14, 10, friend ? 'p2' : 'bot', col);
        });
        // needle
        const live = (phase === 'run' || phase === 'ready') && mayAct();
        if (live) {
          ctx.globalAlpha = phase === 'ready' ? 0.35 : 1;
          ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 10;
          D.roundRect(ctx, X(needle.pos) - 2, by + 8, 4, bh - 16, 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }

        // readouts
        const ry = by + bh + 34, cw = (bw - 10) / 2;
        [['you', friend ? nameOf('you') + ' off by' : 'You off by', col.accent, bx], ['cpu', friend ? nameOf('cpu') + ' off by' : 'Bot off by', friend ? D.P2 : col.ink2, bx + cw + 10]].forEach(([k, label, c, x]) => {
          const best = (phase === 'result' || phase === 'done') && ((roundRes > 0 && k === 'you') || (roundRes < 0 && k === 'cpu'));
          ctx.fillStyle = col.surface2; D.roundRect(ctx, x, ry, cw, 46, 12); ctx.fill();
          if (best || (turn === k && (phase === 'ready' || phase === 'run' || phase === 'stopped'))) { ctx.strokeStyle = best ? c : col.line; ctx.lineWidth = best ? 2 : 1.5; ctx.stroke(); }
          D.text(ctx, label, x + 12, ry + 15, 10.5, col.ink3, 600, 'left');
          D.text(ctx, shot[k] >= 0 ? Math.abs(shot[k] - target).toFixed(1) : '--', x + 12, ry + 32, 17, c, 760, 'left');
        });

        // status
        let msg = '';
        if (friend) {
          const other = turn === 'you' ? 'cpu' : 'you';
          if (phase === 'result' || phase === 'done') msg = roundRes === 0 ? 'Dead heat. No point' : (Math.abs((roundRes > 0 ? shot.you : shot.cpu) - target) < 0.1 ? 'Bullseye. ' : '') + nameOf(roundRes > 0 ? 'you' : 'cpu') + ' point';
          else if (phase === 'ready') msg = nameOf(turn) + '\u2019s shot. Get ready';
          else if (phase === 'stopped') msg = nameOf(turn) + ' stopped';
          else msg = nameOf(turn) + ': stop it on the line.' + (shot[other] >= 0 ? ' Beat ' + Math.abs(shot[other] - target).toFixed(1) : '');
        }
        else if (phase === 'result' || phase === 'done') msg = roundRes === 0 ? 'Dead heat. No point' : roundRes > 0 ? (Math.abs(shot.you - target) < 0.1 ? 'Bullseye. ' : '') + 'Your point' : 'Bot was closer. Bot point';
        else if (turn === 'you') {
          const o = shot.cpu >= 0 ? ' Beat ' + Math.abs(shot.cpu - target).toFixed(1) : '';
          msg = phase === 'ready' ? 'Your shot. Get ready' : 'Stop it on the line.' + o;
        } else msg = phase === 'stopped' ? 'Bot stopped' : 'Bot is aiming';
        D.fitText(ctx, msg, w / 2, ry + 72, w - 24, 14, phase === 'result' && roundRes > 0 ? col.accent : phase === 'result' && roundRes < 0 && friend ? D.P2 : col.ink, 680);

        // stop button
        const b = L.btn, can = (turn === 'you' || friend) && mayAct() && phase === 'run';
        ctx.globalAlpha = can ? 1 : 0.4;
        const pulse = can && !api.reduceMotion ? 1 + Math.sin(clock * 6) * 0.015 : 1;
        ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(pulse, pulse);
        ctx.fillStyle = col.ink; D.roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 14); ctx.fill();
        D.fitText(ctx, on ? (turn === mySide ? 'Stop' : 'Waiting for ' + nameOf(turn)) : friend ? 'Stop: ' + nameOf(turn) : 'Stop', 0, 1, b.w - 24, 16, col.bg, 750);
        ctx.restore(); ctx.globalAlpha = 1;

        parts.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = '#5fd6c4'; ctx.fillRect(p.x, p.y, p.s, p.s); });
        ctx.globalAlpha = 1;
        ctx.restore();

        if (banner) {
          const k = Math.min(1, (clock - banner.t) / 0.35), e = api.reduceMotion ? 1 : D.ease.outBack(k);
          ctx.save(); ctx.translate(w / 2, h * 0.42); ctx.scale(e, e);
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16; D.roundRect(ctx, -120, -42, 240, 84, 18); ctx.fill(); ctx.shadowBlur = 0;
          D.text(ctx, banner.title, 0, -10, 20, col.ink, 750);
          D.text(ctx, banner.sub, 0, 18, 12, col.ink2, 560);
          ctx.restore();
        }
      }

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || sv.dead || !sv.pts || !sv.shot) return false;
        const pu = sv.pts.you | 0, pc = sv.pts.cpu | 0;
        if (pu < 0 || pc < 0 || pu >= TARGET || pc >= TARGET) return false;
        matches = Math.max(0, sv.matches | 0); roundNo = Math.max(1, sv.roundNo | 0); starter = sv.starter === 'cpu' ? 'cpu' : 'you';
        pts = { you: pu, cpu: pc }; api.score(matches);
        if (sv.fresh) { startRound(); return true; }
        const okShot = v => typeof v === 'number' && v >= -1 && v <= 100;
        if (!okShot(sv.shot.you) || !okShot(sv.shot.cpu) || typeof sv.target !== 'number' || sv.target < 0 || sv.target > 100) return false;
        target = sv.target; shot = { you: sv.shot.you, cpu: sv.shot.cpu }; roundRes = 0;
        turn = sv.turn === 'cpu' ? 'cpu' : 'you';
        if (shot[turn] >= 0) turn = turn === 'you' ? 'cpu' : 'you';
        if (shot[turn] >= 0) { startRound(); return true; }
        beginShot();
        return true;
      }

      if (!restore(api.saved)) startRound();
      // The other player's shot. Waits until this screen has reached their turn; a repeat is ignored.
      if (on) on.queue((type, d, from) => {
        if (type !== 'stop') return true;
        const who = from === 0 ? 'you' : 'cpu';
        if (!d || typeof d.v !== 'number' || !(d.v >= 0 && d.v <= 100) || shot[who] >= 0) return true;
        if (phase !== 'run' || turn !== who) return false;
        stopAt(who, Math.round(d.v * 10) / 10);
        return true;
      });
      api.loop(dt => {
        clock += dt;
        shake = Math.max(0, shake - dt);
        if (phase === 'run') {
          prevPos = needle.pos;
          stepNeedle(needle, roundNo, dt * [0.88, 1, 1.06][api.level], Math.random);
          if (turn === 'cpu' && !friend && clock >= cpuMinT) {
            const a = prevPos, b = needle.pos;
            const crossed = (a - cpuAim) * (b - cpuAim) <= 0 && Math.abs(a - b) < 50;
            if (crossed || clock - cpuMinT > 4) { needle.pos = crossed ? cpuAim : needle.pos; stopAt('cpu'); }
          }
        }
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.life <= 0) parts.splice(i, 1);
        }
        render();
      });
      if (window.ludusDebug) window.ludusDebug.botTest = {   // test hook: a quick state read and a needle stop on the player's turn
        state: () => ({ turn: turn === 'you' ? 'me' : 'bot', phase: phase === 'done' ? 'end' : 'play', n: pts.you * 10 + pts.cpu + roundNo * 100 + matches * 1000 + (shot.cpu >= 0 ? 1 : 0) + (shot.you >= 0 ? 2 : 0) + (phase === 'run' ? 0.5 : 0) }),
        play: () => { if (phase === 'run' && turn === 'you') { stopAt('you'); return true; } return false; }
      };
      return {
        save() {
          if (api.ended || phase === 'done') return api.ended ? null : { v: 1, dead: true };
          let p = { you: pts.you, cpu: pts.cpu }, m = matches, r = roundNo, sta = starter, t = turn, done = phase === 'result';
          if (phase === 'stopped') {
            const other = turn === 'you' ? 'cpu' : 'you';
            if (shot[other] < 0) t = other;
            else { done = true; const res = judge(shot.you, shot.cpu, target); if (res > 0) p.you++; else if (res < 0) p.cpu++; }
          }
          if (done) {
            if (p.cpu >= TARGET || (friend && p.you >= TARGET)) return { v: 1, dead: true };
            if (p.you >= TARGET) { m = matches + (counted ? 0 : 1); p = { you: 0, cpu: 0 }; r = 1; } else r = roundNo + 1;
            sta = starter === 'you' ? 'cpu' : 'you';
            return { v: 1, fresh: true, matches: m, roundNo: r, starter: sta, pts: p, shot: {} };
          }
          if (roundNo === 1 && shot.you < 0 && shot.cpu < 0 && !matches) return null;
          return { v: 1, matches: m, roundNo: r, starter: sta, pts: p, shot: { you: shot.you, cpu: shot.cpu }, target, turn: t };
        }
      };
    }
  });
})();
