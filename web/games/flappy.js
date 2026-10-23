/* Flap Through: guide the Claude spark through the gaps. World runs in a 440-unit-tall space scaled to the stage. */
(function () {
  const WH = 440;                 // world height in units
  const GROUND = 46;              // ground strip height
  const BIRD_R = 12;
  const PIPE_W = 54;
  const DIFF = [
    { gap: 150, speed: 118, spacing: 200 },
    { gap: 128, speed: 140, spacing: 190 },
    { gap: 110, speed: 165, spacing: 180 }
  ];
  const GRAV = 1400, FLAP = -400, MAXFALL = 620;

  // Circle vs rounded column (treated as rect) collision.
  function hitsRect(cx, cy, r, x, y, w, h) {
    const nx = Math.max(x, Math.min(cx, x + w)), ny = Math.max(y, Math.min(cy, y + h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function hitsPipe(bx, by, r, p, gap) {
    const top = p.gapY - gap / 2, bot = p.gapY + gap / 2;
    return hitsRect(bx, by, r, p.x, -200, PIPE_W, top + 200) || hitsRect(bx, by, r, p.x, bot, PIPE_W, WH - bot);
  }

  Ludus.register({
    id: 'flappy', name: 'Flap Through', tag: 'Arcade', tint: '#3aa6a6',
    hint: '<kbd>Space</kbd> <kbd>↑</kbd> or click to flap',
    _test: { hitsRect, hitsPipe, WH, GROUND, BIRD_R, PIPE_W, DIFF, GRAV, FLAP },
    art(ctx, w, h) {
      const D = Ludus.draw;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h - 14 - Math.sin(x / 22) * 6);
      ctx.lineTo(w, h); ctx.fill();
      const pw = Math.max(16, w * 0.12);
      [[w * 0.56, h * 0.42], [w * 0.86, h * 0.6]].forEach(([x, gy]) => {
        const gap = h * 0.42;
        ctx.fillStyle = '#d97757';
        D.roundRect(ctx, x, -10, pw, gy - gap / 2 + 10, 7); ctx.fill();
        D.roundRect(ctx, x, gy + gap / 2, pw, h, 7); ctx.fill();
        ctx.fillStyle = '#f4e3d0';
        D.roundRect(ctx, x - 3, gy - gap / 2 - 9, pw + 6, 10, 5); ctx.fill();
        D.roundRect(ctx, x - 3, gy + gap / 2 - 1, pw + 6, 10, 5); ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      [[0.14, 0.62, 2], [0.22, 0.55, 2.6], [0.3, 0.5, 3.2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(w * x, h * y, r, 0, 7); ctx.fill(); });
      D.spark(ctx, w * 0.38, h * 0.44, Math.min(w, h) * 0.17, '#fffaf2', 0.4);
    },
    create(stage, api) {
      const D = Ludus.draw;
      const cfg = DIFF[api.level];
      const view = api.canvas(() => {});
      const { ctx } = view;
      let state = 'ready', t = 0, deadT = 0;
      let bird = { x: 0, y: WH * 0.45, vy: 0, rot: 0, spin: 0, squash: 0 };
      let pipes = [], score = 0, scroll = 0, shake = 0, flash = 0;
      let puffs = [], pops = [], smoke = [], hit = null, landed = false, kx = 0, tumble = 0;

      function worldW() { return view.w / (view.h / WH); }
      function speed() { return cfg.speed + Math.min(60, score * 1.6); }
      function addPipe(x) {
        const margin = 56, lo = margin + cfg.gap / 2, hi = WH - GROUND - margin - cfg.gap / 2;
        const prev = pipes.length ? pipes[pipes.length - 1].gapY : (lo + hi) / 2;
        const swing = 150 + api.level * 30;
        const gy = Math.max(lo, Math.min(hi, prev + api.rand(-swing, swing)));
        pipes.push({ x, gapY: gy, passed: false, born: t });
      }
      function flap() {
        if (state === 'dead') return;
        if (state === 'ready') { state = 'play'; pipes = []; addPipe(worldW() + 40); }
        bird.vy = FLAP; bird.squash = 1; bird.spin += 1.4;
        api.sfx('jump');
        if (!api.reduceMotion) for (let i = 0; i < 5; i++) puffs.push({ x: bird.x - 6, y: bird.y + 6, vx: api.rand(-90, -30), vy: api.rand(-20, 60), life: api.rand(0.25, 0.45), age: 0, r: api.rand(2, 4) });
      }
      function puffSmoke(x, y, n, big) {
        for (let i = 0; i < n; i++) smoke.push({ x: x + api.rand(-8, 8), y: y + api.rand(-6, 6), vx: api.rand(-50, 50) * (big ? 1.4 : 1), vy: api.rand(-90, -25), life: api.rand(0.5, 1.0), age: 0, r: api.rand(4, big ? 11 : 8), tone: api.rand(0, 1) });
      }
      // The spark crashes into the pipe, is knocked back, tumbles down to the ground and lands in a puff of smoke.
      function die(hx, hy) {
        if (state === 'dead') return;
        state = 'dead'; deadT = 0; api.sfx('hit'); landed = false;
        hit = { x: hx === undefined ? bird.x : hx, y: hy === undefined ? bird.y : hy };
        if (!api.reduceMotion) { shake = 7; flash = 1; puffSmoke(hit.x, hit.y, 12, false); }
        const onGround = bird.y >= WH - GROUND - BIRD_R - 1;
        bird.vy = onGround ? 0 : -140;
        tumble = bird.vy === 0 ? 0 : (Math.random() < 0.5 ? -1 : 1) * api.rand(5, 9);
        if (onGround) { landed = true; finish(); }
      }
      function finish() {
        api.timeout(() => api.over({ score, title: score ? score + (score === 1 ? ' gap' : ' gaps') : 'Bonk', message: score >= 10 ? 'Nice flying' : 'Aim for the middle of each gap' }), 800);
      }

      function update(dt) {
        t += dt;
        const W = worldW();
        bird.x = Math.min(W * 0.3, 140) + kx;
        if (state === 'ready') {
          bird.y = WH * 0.45 + Math.sin(t * 3) * 7;
          bird.rot = Math.sin(t * 2) * 0.15; bird.spin += dt * 1.2;
          scroll += dt * cfg.speed * 0.6;
        } else {
          if (state === 'play') { bird.vy = Math.min(MAXFALL, bird.vy + GRAV * dt); bird.y += bird.vy * dt; }
          if (state === 'dead' && !landed) {
            bird.vy = Math.min(MAXFALL, bird.vy + GRAV * dt); bird.y += bird.vy * dt;
            kx = Math.max(-60, kx - 90 * dt); bird.spin += tumble * dt; bird.rot += tumble * 0.35 * dt;
          }
          const target = Math.max(-0.5, Math.min(1.25, bird.vy / 520));
          if (state !== 'dead') bird.rot += (target - bird.rot) * Math.min(1, dt * 10);
          if (state === 'play') bird.spin += dt * 1.5;
          if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = Math.max(0, bird.vy); }
          const floor = WH - GROUND - BIRD_R;
          if (bird.y >= floor) {
            bird.y = floor; bird.vy = 0;
            if (state === 'play') die(bird.x, floor + BIRD_R);
            else if (state === 'dead' && !landed) {
              landed = true; api.sfx('lose'); bird.rot = 0.5 * Math.sign(tumble || 1);
              if (!api.reduceMotion) { shake = 5; puffSmoke(bird.x, floor + BIRD_R - 4, 14, true); }
              finish();
            }
          }
        }
        if (state === 'play') {
          const sp = speed();
          scroll += dt * sp;
          pipes.forEach(p => { p.x -= sp * dt; });
          const last = pipes[pipes.length - 1];
          if (!last || last.x < W - cfg.spacing) addPipe((last ? last.x : W) + cfg.spacing);
          pipes = pipes.filter(p => p.x > -PIPE_W - 20);
          for (const p of pipes) {
            if (!p.passed && p.x + PIPE_W / 2 < bird.x) {
              p.passed = true; score++; api.score(score); api.sfx('score');
              pops.push({ x: p.x + PIPE_W / 2, y: p.gapY, t: 0 });
            }
            if (hitsPipe(bird.x, bird.y, BIRD_R - 2, p, cfg.gap)) {
              // mark the point on the pipe nearest the spark
              const top = p.gapY - cfg.gap / 2, bot = p.gapY + cfg.gap / 2;
              const nx = Math.max(p.x, Math.min(bird.x, p.x + PIPE_W));
              const ny = bird.y < p.gapY ? Math.min(bird.y, top) : Math.max(bird.y, bot);
              die(nx, bird.x >= p.x && bird.x <= p.x + PIPE_W ? ny : bird.y);
              break;
            }
          }
        }
        if (state === 'dead') deadT += dt;
        bird.squash = Math.max(0, bird.squash - dt * 5);
        shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 4);
        puffs = puffs.filter(p => (p.age += dt) < p.life);
        puffs.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; });
        pops = pops.filter(p => (p.t += dt) < 0.7);
        smoke = smoke.filter(p => (p.age += dt) < p.life);
        smoke.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; });
        if (state === 'dead' && !landed && !api.reduceMotion && Math.random() < dt * 30) puffSmoke(bird.x, bird.y, 1, false);
      }

      function hills(W, base, amp, freq, par, color) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(0, WH);
        const off = scroll * par;
        for (let x = 0; x <= W + 8; x += 8) {
          const u = (x + off) * freq;
          ctx.lineTo(x, base - (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1.7) * 0.4) * amp);
        }
        ctx.lineTo(W, WH); ctx.closePath(); ctx.fill();
      }

      function render() {
        const col = api.colors(), s = view.h / WH, W = worldW();
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.clearRect(0, 0, view.w, view.h);
        // sky
        const g = ctx.createLinearGradient(0, 0, 0, view.h);
        g.addColorStop(0, col.dark ? '#1e2a2b' : '#e7f1ee');
        g.addColorStop(1, col.dark ? '#2a2621' : '#fbf3e6');
        ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
        ctx.save();
        ctx.scale(s, s);
        if (shake > 0) ctx.translate(api.rand(-shake, shake) * 0.4, api.rand(-shake, shake) * 0.4);
        // sun
        ctx.fillStyle = col.dark ? 'rgba(243,237,227,0.08)' : 'rgba(217,119,87,0.14)';
        ctx.beginPath(); ctx.arc(W * 0.78, 92, 34, 0, Math.PI * 2); ctx.fill();
        // parallax hills
        hills(W, WH - GROUND - 40, 26, 0.012, 0.15, col.dark ? '#26332f' : '#d7e8df');
        hills(W, WH - GROUND - 12, 18, 0.02, 0.4, col.dark ? '#2c3a33' : '#c4ddcf');
        // pipes
        pipes.forEach(p => {
          const top = p.gapY - cfg.gap / 2, bot = p.gapY + cfg.gap / 2;
          const grow = api.reduceMotion ? 1 : D.ease.outCubic(Math.min(1, (t - p.born) / 0.25 + 0.6));
          ctx.fillStyle = col.accent;
          D.roundRect(ctx, p.x, -20, PIPE_W, top + 20, 12); ctx.fill();
          D.roundRect(ctx, p.x, bot, PIPE_W, WH - GROUND - bot + 20, 12); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          D.roundRect(ctx, p.x + 8, -20, 9, top + 6, 4.5); ctx.fill();
          D.roundRect(ctx, p.x + 8, bot + 14, 9, WH - bot, 4.5); ctx.fill();
          ctx.fillStyle = col.dark ? '#efe2cf' : '#f6e8d6';
          const cw = PIPE_W + 10 * grow;
          D.roundRect(ctx, p.x + PIPE_W / 2 - cw / 2, top - 16, cw, 18, 9); ctx.fill();
          D.roundRect(ctx, p.x + PIPE_W / 2 - cw / 2, bot - 2, cw, 18, 9); ctx.fill();
        });
        // ground
        ctx.fillStyle = col.dark ? '#332c25' : '#ead9c2';
        ctx.fillRect(-20, WH - GROUND, W + 40, GROUND + 20);
        ctx.fillStyle = col.dark ? '#3d342b' : '#dfc9ad';
        const off = (scroll % 28);
        for (let x = -off; x < W + 28; x += 28) { D.roundRect(ctx, x, WH - GROUND + 10, 16, 6, 3); ctx.fill(); }
        ctx.fillStyle = col.dark ? '#4a3f34' : '#d4bb9b';
        ctx.fillRect(-20, WH - GROUND, W + 40, 3);
        // puffs
        puffs.forEach(p => {
          ctx.globalAlpha = (1 - p.age / p.life) * 0.6; ctx.fillStyle = col.dark ? '#f3ede3' : '#ffffff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.age * 2), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        // bird: the spark
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rot);
        const sq = api.reduceMotion ? 0 : bird.squash * 0.18;
        ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = col.dark ? 'rgba(217,119,87,0.22)' : 'rgba(217,119,87,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, BIRD_R + 5, 0, Math.PI * 2); ctx.fill();
        D.spark(ctx, 0, 0, BIRD_R + 3, col.accent, bird.spin);
        ctx.restore();
        // crash smoke
        smoke.forEach(p => {
          const k = p.age / p.life;
          ctx.globalAlpha = (1 - k) * 0.7;
          ctx.fillStyle = p.tone > 0.5 ? (col.dark ? '#8a8279' : '#9a928a') : (col.dark ? '#c9c1b6' : '#6f6860');
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 1.8), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        // score pops
        pops.forEach(p => {
          const k = p.t / 0.7;
          ctx.globalAlpha = 1 - k;
          D.text(ctx, '+1', p.x, p.y - k * 30, 16, col.accent, 760);
        });
        ctx.globalAlpha = 1;
        // big score
        if (state !== 'ready') D.text(ctx, String(score), W / 2, 44, 34, col.dark ? 'rgba(243,237,227,0.85)' : 'rgba(32,28,23,0.75)', 780);
        ctx.restore();
        if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.5 + ')'; ctx.fillRect(0, 0, view.w, view.h); }
        if (state === 'ready') {
          const cy = view.h * 0.7, a = 0.75 + Math.sin(t * 4) * 0.25;
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.85)' : 'rgba(255,252,247,0.9)';
          D.roundRect(ctx, view.w / 2 - 74, cy - 19, 148, 38, 19); ctx.fill();
          ctx.globalAlpha = a;
          D.text(ctx, 'Tap to start', view.w / 2, cy, 14, col.ink, 680);
          ctx.globalAlpha = 1;
        }
      }

      api.keys(e => {
        if (e.repeat) return;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'Enter') { e.preventDefault(); flap(); }
      });
      api.on(view.canvas, 'pointerdown', e => { e.preventDefault(); flap(); });

      function restore(v) {
        try {
          if (!v || v.state !== 'play' || !Array.isArray(v.pipes) || !Number.isFinite(v.score) || !Number.isFinite(v.y)) return false;
          if (!v.pipes.every(p => Number.isFinite(p.x) && Number.isFinite(p.gapY))) return false;
          state = 'play'; t = Number(v.t) || 0; score = v.score; scroll = Number(v.scroll) || 0;
          bird.y = Math.max(BIRD_R, Math.min(WH - GROUND - BIRD_R - 1, v.y)); bird.vy = Number(v.vy) || 0;
          bird.rot = Number(v.rot) || 0; bird.spin = Number(v.spin) || 0;
          pipes = v.pipes.map(p => ({ x: p.x, gapY: p.gapY, passed: !!p.passed, born: -9 }));
          api.score(score);
          return true;
        } catch (e) { return false; }
      }
      if (!restore(api.saved)) { state = 'ready'; pipes = []; score = 0; api.score(0); }
      bird.x = Math.min(worldW() * 0.3, 140);
      render();
      api.loop(dt => { update(dt); render(); });
      return {
        // Coming back from a pause the spark does not drop out of the sky mid-fall.
        resume() { if (state === 'play') bird.vy = Math.min(bird.vy, 0); },
        save() {
          if (state !== 'play') return null;
          const r = n => Math.round(n * 100) / 100;
          return { state, t: r(t), score, scroll: r(scroll), y: r(bird.y), vy: r(bird.vy), rot: r(bird.rot), spin: r(bird.spin), pipes: pipes.map(p => ({ x: r(p.x), gapY: r(p.gapY), passed: p.passed })) };
        }
      };
    }
  });
})();
