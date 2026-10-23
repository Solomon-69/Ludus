/* Rally: two-paddle pong for two people on one keyboard. Where the ball hits the paddle sets the angle,
   every return is a little faster, first to 7 points wins. */
(function () {
  const D = Ludus.draw;
  const PW = 360, H = 440, MAX_W = 1000, PAD_X = 20, PAD_W = 10, PAD_H = 72, BALL_R = 6.5, TARGET = 7;
  const MAX_V = 430, ACC = 3400, MAX_ANGLE = 58 * Math.PI / 180;

  // Two people, one keyboard: P1 = WASD (+F / left Shift), P2 = arrows (+ / , right Shift, Enter).
  function makePads(api) {
    const bot = !api.friend;   // vs Bot: both key sets drive the left paddle
    const mine = api.online ? (api.online.seat === 0 ? 'p1' : 'p2') : null;   // online: both key sets drive my own paddle
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act', ShiftLeft: 'act' };
    const K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', ShiftRight: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false, hit: {} });
    const pads = { p1: blank(), p2: blank() };
    function find(e) {
      const m = find0(e);
      return m && mine ? [mine, m[1]] : m && bot ? ['p1', m[1]] : m;
    }
    function find0(e) {
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

  // Bounce off a paddle: hit point -1 (top edge) .. 1 (bottom edge) sets the angle. Pure, for tests.
  function paddleBounce(ballY, padY, dirX) {
    const off = Math.max(-1, Math.min(1, (ballY - padY) / (PAD_H / 2 + BALL_R)));
    const a = off * MAX_ANGLE;
    return { vx: Math.cos(a) * dirX, vy: Math.sin(a) };
  }

  Ludus.register({
    id: 'pong', name: 'Paddle Duel', aka: 'Rally', tag: '2 Player', wide: true, tint: '#3f8fb5', versus: true, defaultVs: 'friend',
    online: { min: 2, max: 2 },
    onlineHint: '<b>Online</b> <kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd> move your paddle <kbd>F</kbd> or <kbd>/</kbd> power hit · the host has the left paddle',
    hint: '<b>vs Bot</b> <kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd> move <kbd>F</kbd> power hit · <b>vs Friend</b> P1 <kbd>W</kbd><kbd>S</kbd> move <kbd>F</kbd> power hit · P2 <kbd>↑</kbd><kbd>↓</kbd> move <kbd>/</kbd> power hit',
    _rules: { paddleBounce, TARGET },
    art(ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (let y = h * 0.12; y < h * 0.9; y += h * 0.1) { D.roundRect(ctx, w / 2 - 1.5, y, 3, h * 0.05, 1.5); ctx.fill(); }
      ctx.fillStyle = '#fff8f2'; D.roundRect(ctx, w * 0.1, h * 0.3, w * 0.05, h * 0.3, w * 0.025); ctx.fill();
      ctx.fillStyle = '#5b8def'; D.roundRect(ctx, w * 0.85, h * 0.45, w * 0.05, h * 0.3, w * 0.025); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.38, h * 0.1, 0, Math.PI * 2); ctx.fill();
      D.spark(ctx, w * 0.62, h * 0.38, h * 0.07, '#fff8f2', 0.4);
    },
    create(stage, api) {
      const view = api.canvas(onResize);
      const { ctx } = view;
      const pads = makePads(api);
      const on = api.online, guest = !!(on && !on.isHost);
      const nameOf = id => Ludus.rt.seatName(api, id === 'p1' ? 0 : 1);
      // Court width follows the stage: portrait keeps the classic 360 x 440 court, a landscape stage
      // gets a wide court of the same height. Ball and paddle speeds scale so a crossing feels the same.
      const widthFor = (w, h) => w > h ? Math.max(PW, Math.min(MAX_W, Math.round(H * (w - 16) / Math.max(1, h - 64)))) : PW;
      let W, START, TOP, padMax, padAcc;
      function layout(width) {
        W = width;
        const k = 1 + (W / PW - 1) * 0.6;
        START = [240, 280, 320][api.level] * k; TOP = START * 2.1;
        padMax = MAX_V * Math.sqrt(k); padAcc = ACC * Math.sqrt(k);
      }
      // Untransformed stage size (the panel's slide-in scale would skew getBoundingClientRect).
      const dims = () => [stage.clientWidth || view.w, stage.clientHeight || view.h];
      layout(widthFor(...dims()));
      let score, paddles, ball, phase, serveT, serveDir, rally, clock = 0, trail = [], parts = [], flash = null, overCalled = false, lastScorer = null;

      function reset() {
        score = { p1: 0, p2: 0 };
        paddles = { p1: { y: H / 2, v: 0, hitAt: -9, power: 0 }, p2: { y: H / 2, v: 0, hitAt: -9, power: 0 } };
        serveDir = Math.random() < 0.5 ? -1 : 1;
        newServe();
        api.score(0);
      }
      function newServe() {
        ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: START };
        phase = 'serve'; serveT = 1.1; rally = 0; trail = [];
      }
      function launch() {
        const a = api.rand(-0.45, 0.45);
        ball.vx = Math.cos(a) * serveDir; ball.vy = Math.sin(a); ball.speed = START;
        phase = 'play'; api.sfx('jump');
      }

      // Bot (right paddle): sees the ball only every so often, aims at where it will land plus a
      // per-rally error, and keeps up with the same paddle physics as a person.
      const REACT = [0.26, 0.18, 0.12][api.level], ERR = [1.0, 0.8, 0.6][api.level], SLIP = [0.2, 0.12, 0.06][api.level];
      let ai = { target: H / 2, timer: 0, err: 0, rally: -1 };
      function landingY() {
        const dx = (W - PAD_X - PAD_W / 2 - BALL_R) - ball.x;
        let y = ball.y + ball.vy * dx / Math.max(0.2, ball.vx);
        const span = H - BALL_R * 2, m = ((y - BALL_R) % (span * 2) + span * 2) % (span * 2);
        return BALL_R + (m > span ? span * 2 - m : m);
      }
      function botDir(dt) {
        ai.timer -= dt;
        if (ai.rally !== rally) { ai.rally = rally; ai.err = api.rand(-1, 1) * ERR * PAD_H / 2; if (Math.random() < SLIP) ai.err = (Math.random() < 0.5 ? -1 : 1) * api.rand(0.9, 1.4) * PAD_H; }   // now and then it simply misjudges the ball
        if (ai.timer <= 0) {
          ai.timer = REACT;
          ai.target = phase === 'play' && ball.vx > 0 ? landingY() + ai.err : H / 2 + (phase === 'play' ? (ball.y - H / 2) * 0.25 : 0);
        }
        const p = paddles.p2, d = ai.target - p.y;
        // brake early so it does not overshoot: stop when the remaining distance is under its stopping distance
        const stop = p.v * p.v / (2 * padAcc * 1.3);
        if (Math.abs(d) < 5 || (p.v * d > 0 && stop >= Math.abs(d))) return 0;
        if (phase === 'play' && ball.vx > 0 && !p.power && ball.x > W * 0.55 && Math.random() < dt * 0.6) p.power = 0.22;
        return d > 0 ? 1 : -1;
      }
      function movePaddle(id, dt) {
        const p = paddles[id], pad = pads[id], isBot = !api.friend && id === 'p2';
        if (!isBot && pads.take(id, 'act')) p.power = 0.22;
        if (net && id === 'p2' && net.hit) { net.hit = 0; p.power = 0.22; }
        p.power = Math.max(0, p.power - dt);
        const live = phase !== 'over';
        const dir = live ? (isBot ? botDir(dt) : (pad.down ? 1 : 0) - (pad.up ? 1 : 0)) : 0;
        stepPad(p, dir, dt);
      }
      function stepPad(p, dir, dt) {
        if (dir) p.v += dir * padAcc * dt * (p.v * dir < 0 ? 1.8 : 1);
        else p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), padAcc * 1.3 * dt);
        p.v = Math.max(-padMax, Math.min(padMax, p.v));
        p.y += p.v * dt;
        const lim = PAD_H / 2 + 4;
        if (p.y < lim) { p.y = lim; p.v = 0; }
        if (p.y > H - lim) { p.y = H - lim; p.v = 0; }
      }

      function hitPaddle(id) {
        const p = paddles[id], dirX = id === 'p1' ? 1 : -1;
        const b = paddleBounce(ball.y, p.y, dirX);
        ball.vx = b.vx; ball.vy = b.vy + p.v / (1400 * padMax / MAX_V);   // a moving paddle adds a little spin
        const m = Math.hypot(ball.vx, ball.vy); ball.vx /= m; ball.vy /= m;
        if (Math.abs(ball.vx) < 0.5) { ball.vx = 0.5 * dirX; ball.vy = Math.sign(ball.vy) * Math.sqrt(0.75); }
        rally++;
        const power = p.power > 0;
        ball.speed = Math.min(TOP, ball.speed * 1.045 + (power ? START * 0.35 : 0));
        p.hitAt = clock; p.power = 0;
        api.sfx(power ? 'power' : 'tap');
        burst(ball.x, ball.y, power ? 14 : 6, id === 'p1' ? api.colors().accent : D.P2);
      }

      function stepBall(dist) {
        const n = Math.max(1, Math.ceil(dist / 3));
        for (let i = 0; i < n; i++) {
          ball.x += ball.vx * dist / n; ball.y += ball.vy * dist / n;
          if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); api.sfx('tick'); }
          if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); api.sfx('tick'); }
          const l = paddles.p1, r = paddles.p2;
          if (ball.vx < 0 && ball.x - BALL_R <= PAD_X + PAD_W / 2 && ball.x - BALL_R >= PAD_X - PAD_W && Math.abs(ball.y - l.y) <= PAD_H / 2 + BALL_R) {
            ball.x = PAD_X + PAD_W / 2 + BALL_R; hitPaddle('p1');
          } else if (ball.vx > 0 && ball.x + BALL_R >= W - PAD_X - PAD_W / 2 && ball.x + BALL_R <= W - PAD_X + PAD_W && Math.abs(ball.y - r.y) <= PAD_H / 2 + BALL_R) {
            ball.x = W - PAD_X - PAD_W / 2 - BALL_R; hitPaddle('p2');
          }
          if (ball.x < -BALL_R * 2) return point('p2');
          if (ball.x > W + BALL_R * 2) return point('p1');
        }
      }

      function point(who) {
        score[who]++; lastScorer = who;
        api.score(Math.max(score.p1, score.p2));
        flash = { side: who === 'p1' ? 'right' : 'left', t: clock };
        burst(who === 'p1' ? W - 4 : 4, Math.max(10, Math.min(H - 10, ball.y)), 22, who === 'p1' ? api.colors().accent : D.P2);
        if (score[who] >= TARGET) {
          phase = 'over'; serveT = 0.6; api.sfx('line');
          ball.x = who === 'p1' ? W - BALL_R : BALL_R; ball.y = Math.max(BALL_R, Math.min(H - BALL_R, ball.y)); ball.vx = 0; ball.vy = 0; trail = [];
          return;
        }
        api.sfx('score');
        serveDir = who === 'p1' ? 1 : -1;   // the player who lost the point receives the serve
        newServe();
      }

      function burst(x, y, n, color) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 150;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8, color });
        }
      }

      function update(dt) {
        clock += dt;
        movePaddle('p1', dt); movePaddle('p2', dt);
        if (phase === 'serve') { serveT -= dt; if (serveT <= 0) launch(); }
        else if (phase === 'play') {
          trail.unshift({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.pop();
          stepBall(ball.speed * dt);
        } else if (phase === 'over') {
          serveT -= dt;
          if (serveT <= 0 && !overCalled) {
            overCalled = true;
            const win = score.p1 > score.p2 ? 'p1' : 'p2';
            const msg = `${Math.max(score.p1, score.p2)} to ${Math.min(score.p1, score.p2)}`;
            if (on) { on.send('end', { p1: score.p1, p2: score.p2 }); finishOnline(); }
            else api.over({ score: score[win], won: api.friend || win === 'p1', title: api.friend ? (win === 'p1' ? 'P1' : 'P2') + ' wins' : win === 'p1' ? 'You win' : 'Bot wins', message: msg });
          }
        }
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: on ? { who: 'p1', label: nameOf('p1'), score: score.p1 } : api.friend ? { who: 'p1', label: 'P1', score: score.p1 } : { who: 'you', label: 'You', score: score.p1 }, right: on ? { who: 'p2', label: nameOf('p2'), score: score.p2 } : api.friend ? { who: 'p2', label: 'P2', score: score.p2 } : { who: 'bot', label: 'Bot', score: score.p2 },
          turn: phase === 'play' ? (ball.vx < 0 ? 'left' : 'right') : null,
          status: phase === 'serve' ? 'Get ready' : phase === 'over' ? '' : `Rally ${rally}`
        }, col);
        const top = 56, avail = h - top - 8, s = Math.min((w - 16) / W, avail / H);
        const ox = (w - W * s) / 2, oy = top + Math.max(0, (avail - H * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        ctx.fillStyle = col.dark ? '#2a2520' : '#fbf6ee'; D.roundRect(ctx, 0, 0, W, H, 12); ctx.fill();
        ctx.save(); D.roundRect(ctx, 0, 0, W, H, 12); ctx.clip();
        ctx.strokeStyle = col.line; ctx.lineWidth = 1.5; D.roundRect(ctx, 0.75, 0.75, W - 1.5, H - 1.5, 12); ctx.stroke();
        // goal glow when a point is scored
        if (flash && clock - flash.t < 0.7) {
          const k = 1 - (clock - flash.t) / 0.7, g = ctx.createLinearGradient(flash.side === 'left' ? 0 : W, 0, flash.side === 'left' ? 60 : W - 60, 0);
          g.addColorStop(0, `rgba(217,119,87,${0.35 * k})`); g.addColorStop(1, 'rgba(217,119,87,0)');
          ctx.fillStyle = g; ctx.fillRect(flash.side === 'left' ? 0 : W - 60, 0, 60, H);
        }
        // centre line of little sparks + big faint scores
        for (let y = 14; y < H; y += 26) D.spark(ctx, W / 2, y, 3.2, col.line, 0);
        D.text(ctx, String(score.p1), W * 0.25, H * 0.2, 54, col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', 800);
        D.text(ctx, String(score.p2), W * 0.75, H * 0.2, 54, col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', 800);
        // paddles
        [['p1', PAD_X, col.accent], ['p2', W - PAD_X, D.P2]].forEach(([id, x, color]) => {
          const p = paddles[id], k = Math.max(0, 1 - (clock - p.hitAt) * 6);
          const pw = PAD_W * (1 + k * 0.35);
          if (p.power > 0) { ctx.globalAlpha = 0.25; ctx.fillStyle = color; D.roundRect(ctx, x - pw / 2 - 4, p.y - PAD_H / 2 - 4, pw + 8, PAD_H + 8, 8); ctx.fill(); ctx.globalAlpha = 1; }
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.13)'; D.roundRect(ctx, x - pw / 2 + 2, p.y - PAD_H / 2 + 3, pw, PAD_H, pw / 2); ctx.fill();
          ctx.fillStyle = color; D.roundRect(ctx, x - pw / 2, p.y - PAD_H / 2, pw, PAD_H, pw / 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; D.roundRect(ctx, x - 1.5, p.y - PAD_H / 2 + 6, 3, PAD_H - 12, 1.5); ctx.fill();
        });
        // ball with a trail
        const bc = phase === 'play' ? (ball.vx > 0 ? col.accent : D.P2) : phase === 'over' ? (lastScorer === 'p1' ? col.accent : D.P2) : col.ink2;
        if (!api.reduceMotion) trail.forEach((q, i) => { ctx.globalAlpha = 0.16 * (1 - i / trail.length); ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(q.x, q.y, BALL_R * (1 - i * 0.08), 0, Math.PI * 2); ctx.fill(); });
        if (phase === 'serve') {
          const k = 0.6 + 0.4 * Math.sin(clock * 10);
          ctx.globalAlpha = k; ctx.strokeStyle = col.ink3; ctx.lineWidth = 2; ctx.lineCap = 'round';
          const ax = W / 2 + serveDir * 22;
          ctx.beginPath(); ctx.moveTo(ax - serveDir * 6, H / 2 - 7); ctx.lineTo(ax, H / 2); ctx.lineTo(ax - serveDir * 6, H / 2 + 7); ctx.stroke();
        }
        {
          ctx.globalAlpha = 0.2; ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R * 2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
          D.spark(ctx, ball.x, ball.y, BALL_R * 0.75, '#fff8f2', api.reduceMotion ? 0 : clock * 5);
        }
        ctx.globalAlpha = 1;
        parts.forEach(q => { ctx.globalAlpha = Math.max(0, q.life / 0.8); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        if (phase === 'over') {
          const win = score.p1 > score.p2 ? 'p1' : 'p2', bw = 230;
          ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          D.roundRect(ctx, W / 2 - bw / 2, H * 0.3 - 30, bw, 60, 16); ctx.fill(); ctx.restore();
          D.avatar(ctx, W / 2 - bw / 2 + 30, H * 0.3, 16, api.friend ? win : win === 'p1' ? 'you' : 'bot', col);
          D.fitText(ctx, (on ? `${nameOf(win)} wins` : api.friend ? `${win === 'p1' ? 'P1' : 'P2'} wins the match` : win === 'p1' ? 'You win the match' : 'Bot wins the match'), W / 2 + 14, H * 0.3 - 8, bw - 72, 15, col.ink, 800, 11);
          D.text(ctx, `${score.p1} : ${score.p2}`, W / 2 + 14, H * 0.3 + 12, 12, col.ink2, 700);
        }
        ctx.restore(); ctx.restore();
      }

      // ---------- save / restore ----------
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, W, H, score: { ...score }, p: ['p1', 'p2'].map(id => [paddles[id].y, paddles[id].v]), ball: { ...ball }, phase, serveT, serveDir, rally };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        // A save from a court of another shape (e.g. an old portrait session) starts fresh.
        // A wide save may come back on a slightly different wide stage: keep its court and scale it.
        const sw = s && s.W === undefined ? PW : s && s.W;
        if (!s || (s.H === undefined ? H : s.H) !== H || typeof sw !== 'number' || sw < PW || sw > MAX_W || (sw > PW) !== (W > PW)) return false;
        if (s.v !== 1 || !s.score || !num(s.score.p1) || !num(s.score.p2) || s.score.p1 >= TARGET || s.score.p2 >= TARGET) return false;
        if (!Array.isArray(s.p) || s.p.length !== 2 || !s.p.every(a => Array.isArray(a) && num(a[0]) && num(a[1]))) return false;
        const b = s.ball; if (!b || !['x', 'y', 'vx', 'vy', 'speed'].every(k => num(b[k]))) return false;
        if (!['serve', 'play'].includes(s.phase) || !num(s.serveT) || !num(s.serveDir) || !num(s.rally)) return false;
        layout(sw);
        score = { p1: s.score.p1, p2: s.score.p2 };
        paddles = { p1: { y: s.p[0][0], v: s.p[0][1], hitAt: -9, power: 0 }, p2: { y: s.p[1][0], v: s.p[1][1], hitAt: -9, power: 0 } };
        ball = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, speed: b.speed };
        phase = s.phase; serveT = s.serveT; serveDir = s.serveDir > 0 ? 1 : -1; rally = s.rally;
        api.score(Math.max(score.p1, score.p2));
        return true;
      }

      // A restored match counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) reset();
      // The panel may still be turning landscape when the game starts: re-fit an untouched match.
      function onResize(w, h) {
        const nw = widthFor(...dims());
        if (on || nw === W || restored || api.touched || score.p1 || score.p2 || phase !== 'serve') return;
        layout(nw); reset();
      }
      if (window.ludusDebug) window.ludusDebug.pong = () => ({ W, H, phase, score: { ...score }, ball: { ...ball }, p1: paddles.p1.y, p2: paddles.p2.y, rally });
      // ---------- online: the host plays the match, the guest sends its paddle keys and draws the host's copy ----------
      let net = null, link = null, ended = false;
      function finishOnline() {
        if (ended) return; ended = true;
        const win = score.p1 > score.p2 ? 'p1' : 'p2', mineId = on.seat === 0 ? 'p1' : 'p2';
        api.over({ score: score[mineId], won: win === mineId, title: nameOf(win) + ' wins', message: `${Math.max(score.p1, score.p2)} to ${Math.min(score.p1, score.p2)}` });
      }
      if (on) {
        net = { up: false, down: false, hit: 0, n: 0 };
        let lastHits = 0;
        const R2 = v => Math.round(v * 10) / 10;
        link = Ludus.rt(api, {
          hz: 30,
          snapshot: () => ({ W, s: [score.p1, score.p2], y: [R2(paddles.p1.y), R2(paddles.p2.y)], pw: [paddles.p1.power > 0 ? 1 : 0, paddles.p2.power > 0 ? 1 : 0], b: [R2(ball.x), R2(ball.y), Math.round(ball.vx * 1000) / 1000, Math.round(ball.vy * 1000) / 1000], ph: phase, sd: serveDir, r: rally }),
          input: () => { const p = pads.p2; if (pads.take('p2', 'act')) lastHits++; return { u: p.up ? 1 : 0, d: p.down ? 1 : 0, h: lastHits }; },
          onInput: (seat, d) => {
            if (seat !== 1) return;
            pads.p2.up = d.u === 1; pads.p2.down = d.d === 1;
            if (Number.isInteger(d.h) && d.h > net.n) { net.n = d.h; net.hit = 1; }
          },
          onState: d => {
            if (typeof d.W === 'number' && d.W >= PW && d.W <= MAX_W && d.W !== W) layout(d.W);
            if (Array.isArray(d.s) && d.s.length === 2 && d.s.every(Number.isInteger)) {
              if (d.s[0] !== score.p1 || d.s[1] !== score.p2) { api.sfx('score'); flash = { side: d.s[0] > score.p1 ? 'right' : 'left', t: clock }; lastScorer = d.s[0] > score.p1 ? 'p1' : 'p2'; }
              score = { p1: d.s[0], p2: d.s[1] }; api.score(Math.max(score.p1, score.p2));
            }
            if (Number.isInteger(d.r) && d.r > rally) { api.sfx('tap'); burst(ball.x, ball.y, 6, d.r % 2 ? api.colors().accent : D.P2); }
            if (Number.isInteger(d.r)) rally = d.r;
            if (['serve', 'play', 'over'].includes(d.ph)) { if (d.ph === 'play' && phase === 'serve') api.sfx('jump'); phase = d.ph; }
            if (d.sd === 1 || d.sd === -1) serveDir = d.sd;
          }
        });
        if (guest) on.on('end', d => { if (d && Number.isInteger(d.p1) && Number.isInteger(d.p2)) { score = { p1: d.p1, p2: d.p2 }; phase = 'over'; finishOnline(); } });
      }
      const num = v => typeof v === 'number' && isFinite(v);
      // the guest moves its own paddle from its own keys at once; the host's copy only nudges it back into line
      const me = guest && link ? link.predictor({ pick: s => Array.isArray(s.y) && s.y.length === 2 ? [s.y[1]] : null, snap: 70, init: [paddles.p2.y] }) : null;
      let myV = 0;
      function guestFrame(dt) {
        clock += dt;
        const sm = link.sample();
        if (sm) {
          const { a, b, t } = sm, M = Ludus.rt.mix;
          if (Array.isArray(a.y) && Array.isArray(b.y) && a.y.length === 2 && b.y.length === 2 && a.y.concat(b.y).every(num)) { paddles.p1.y = M(a.y[0], b.y[0], t); }
          if (Array.isArray(b.pw)) { paddles.p1.power = b.pw[0] ? 0.1 : 0; paddles.p2.power = b.pw[1] ? 0.1 : 0; }
          if (Array.isArray(a.b) && Array.isArray(b.b) && a.b.concat(b.b).every(num)) {
            ball.x = M(a.b[0], b.b[0], t, 120); ball.y = M(a.b[1], b.b[1], t, 120); ball.vx = b.b[2]; ball.vy = b.b[3];
          }
        }
        const p2 = paddles.p2, pad2 = pads.p2;
        me.frame(dt, v => {
          p2.y = v[0]; p2.v = myV;
          stepPad(p2, phase !== 'over' ? (pad2.down ? 1 : 0) - (pad2.up ? 1 : 0) : 0, dt);
          v[0] = p2.y; myV = p2.v;
        });
        p2.y = me.v[0];
        if (phase === 'play') { trail.unshift({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.pop(); } else trail = [];
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }
      if (window.ludusDebug && on) window.ludusDebug.pongNet = () => ({ seat: on.seat, score: { ...score }, phase, p1: paddles.p1.y, p2: paddles.p2.y });
      api.loop(dt => { if (guest) guestFrame(dt); else update(dt); if (link) link.step(); render(); });
      return { save: on ? () => ({ score: { ...score }, phase, rally, y: [Math.round(paddles.p1.y), Math.round(paddles.p2.y)] }) : save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
