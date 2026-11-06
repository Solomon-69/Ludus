/* Spark Hop: the spark bounces by itself. Steer it from platform to platform and climb as high as you can. Moving and crumbly platforms show up the higher you go.
   Six modes, picked at the start of a climb (the tab switcher on the board until the first platform):
   Classic. Monsters: little monsters float between the platforms (land on top to bop them, Up or Space fires at them, touch one any other way and you fall) and puffy
   clouds hold you once. Boost: plenty of pick-ups on the platforms (jet, coil, bubble), with a few monsters. Moon: out on the moon with slow, drifting bounces and
   burning rocks falling past. Storm: wind and sudden gusts push you sideways through the rain, and lightning that strikes close knocks you away (never a fall by
   itself; the sky lights up over the spot first). Night: you only see what your own glow lights up, and the glow shrinks as you climb.
   How each world looks lives in jumper-worlds.js. */
(function () {
  const D = Ludus.draw, W = Ludus.hopWorlds;
  const WW = 360;                         // world width; height follows the stage shape
  const PW = 62, PH = 12, R = 11;         // platform size, spark radius
  const GRAV = 1500, BOUNCE = -720, SPRING = -1120, MAXVX = 300, ACC = 1500;
  const DIFF = [
    { gap: [52, 96], dx: 120, grow: 0.018, move: 0.12, brk: 0.12, spring: 0.08 },
    { gap: [60, 112], dx: 150, grow: 0.024, move: 0.2, brk: 0.2, spring: 0.06 },
    { gap: [70, 126], dx: 180, grow: 0.03, move: 0.3, brk: 0.28, spring: 0.05 }
  ];
  const MODES = [['classic', 'Classic'], ['monsters', 'Monsters'], ['boost', 'Boost'], ['moon', 'Moon'], ['storm', 'Storm'], ['night', 'Night']];
  const MODE_IDS = MODES.map(m => m[0]);
  const TAB_CHAR = 6.2, TAB_PAD = 22;     // a tab's width follows its name, so a long name still fits in the sliding bubble
  const tabEdges = w => {
    const raw = MODES.map(m => m[1].length * TAB_CHAR + TAB_PAD), sum = raw.reduce((a, b) => a + b, 0), out = [0];
    raw.forEach(r => out.push(out[out.length - 1] + r * w / sum));
    return out;
  };
  const MOON_G = 640, MOON_BOUNCE = -470, MOON_SPRING = -732;   // same height as a normal bounce, much slower and floatier
  const MOON_DRIFT = 0.3, AIR_DRIFT = 0.02;                     // how much sideways speed is left after a second with no steering
  const JET_T = 2.6, JET_V = -1100, COIL_N = 5, COIL_K = 1.28, BOOST_SPRING = 1.18, SHOT_V = 640, SHOT_GAP = 0.24;
  const ITEM_REACH = 17;                  // how close counts as touching a pick-up
  const BOLT_WARN = 0.7, BOLT_SHOW = 0.4, BOLT_REACH = 130, GUST_T = 1.4, GUST_WIND = 380;
  const NIGHT_STEPS = 14, TRAIL_N = 14, TRAIL_GAP = 0.028;
  const MAX_GAP = 150;                    // a bounce reaches about 172 units, so this is always jumpable

  Ludus.register({
    id: 'sparkhop', name: 'Sky Hop', aka: 'Spark Hop', tag: 'Arcade', tint: '#e08a3c',
    waitForMove: 'tap',   // stands still until a key press or a press on the board: moving the mouse over it must not start it (after Restart it did)
    hint: '<kbd>←</kbd><kbd>→</kbd> steer, or press and hold either side of the board · <kbd>↑</kbd> or <kbd>Space</kbd> fires in Monsters and Boost · <kbd>M</kbd> next mode',
    art(ctx, w, h) {
      const plat = (x, y, pw) => { ctx.fillStyle = 'rgba(255,255,255,0.85)'; D.roundRect(ctx, x - pw / 2, y, pw, 6, 3); ctx.fill(); };
      plat(w * 0.3, h * 0.8, w * 0.26); plat(w * 0.66, h * 0.58, w * 0.22); plat(w * 0.36, h * 0.34, w * 0.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.76); ctx.quadraticCurveTo(w * 0.42, h * 0.3, w * 0.62, h * 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.47, h * 0.09, 0, Math.PI * 2); ctx.fill();
      D.spark(ctx, w * 0.62, h * 0.47, h * 0.07, '#fffaf2', 0.4);
    },
    create(stage, api) {
      const cfg = DIFF[api.level];
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx, canvas } = view;
      let WH = 520;
      let p, plats, camY, topGen, height, clock, state, deadAt, squash, spin, pops, lastChainY, best, mons = [], onFloor = true;
      let mode = 'classic';   // every visit starts on Classic
      let swPos = 0, swLast = performance.now();   // slide position of the mode picker thumb (its index in MODES)
      let power = null, bubble = false, coil = 0, shots = [], rocks = [], rockT = 3, shotT = 0, wind = 0;
      let fx = [], trail = [], trailT = 0, shake = 0, flash = 0, flashRgb = '225,235,255', pulse = 0, zapAt = -9, windX = 0, bolt = null, boltT = 4, boltX = WW / 2, gust = null, gustT = 5;
      const puff = (x, y, opt) => { if (!api.reduceMotion) W.burst(fx, x, y, opt); };
      const wave = (x, y, rgb, size, life) => { if (!api.reduceMotion) W.ring(fx, x, y, rgb, size, life); };
      const jolt = k => { if (!api.reduceMotion) shake = Math.max(shake, k); };
      const light = (k, rgb) => { flash = Math.max(flash, k); flashRgb = rgb; };
      const hasMonsters = () => mode === 'monsters' || mode === 'boost';
      const canFire = hasMonsters;
      const gravity = () => (mode === 'moon' ? MOON_G : GRAV);
      const bounceV = () => (mode === 'moon' ? MOON_BOUNCE : BOUNCE) * (coil > 0 ? COIL_K : 1);
      const springV = () => (mode === 'moon' ? MOON_SPRING : mode === 'boost' ? SPRING * BOOST_SPRING : SPRING);
      const MR = 14;   // monster radius
      const held = { l: false, r: false, pl: false, pr: false };

      const worldH = () => Math.max(360, Math.round(WW * view.h / Math.max(1, view.w)));
      let lastX = WW / 2;
      function addPlat(y, chain) {
        const k = Math.min(1, -y / 12000);           // 0 at the start, 1 high up
        let type = 'still';
        const r = Math.random();
        if (chain) { if (r < cfg.spring) type = 'spring'; else if (r < cfg.spring + cfg.move * (0.4 + k)) type = 'move'; }
        else type = mode === 'monsters' && Math.random() < 0.55 ? 'cloud' : 'break';
        // chain platforms stay within reach sideways of the one below
        const lo = PW / 2 + 6, hi = WW - PW / 2 - 6;
        let x = chain ? lastX + (Math.random() * 2 - 1) * cfg.dx : lo + Math.random() * (hi - lo);
        if (chain) { if (x < lo) x = lo + (lo - x) * 0.5; if (x > hi) x = hi - (x - hi) * 0.5; x = Math.max(lo, Math.min(hi, x)); lastX = x; }
        const sp = (50 + Math.random() * 60) * (1 + k) * (Math.random() < 0.5 ? -1 : 1);
        const q = { x, y, type, vx: type === 'move' ? sp : 0, broken: -1, born: clock };
        if (chain && mode === 'boost' && type === 'still' && y < -200) { const r2 = Math.random(); q.item = r2 < 0.07 ? 'jet' : r2 < 0.17 ? 'coil' : r2 < 0.24 ? 'bubble' : undefined; }
        plats.push(q);
      }
      function generate() {
        // keep platforms coming until well above the screen
        while (lastChainY > camY - WH * 0.6) {
          const climb = Math.max(0, -lastChainY) / 100;
          const lo = Math.min(MAX_GAP - 20, cfg.gap[0] + climb * cfg.grow * 10), hi = Math.min(MAX_GAP, cfg.gap[1] + climb * cfg.grow * 14);
          lastChainY -= lo + Math.random() * (hi - lo);
          addPlat(lastChainY, true);
          // crumbly decoys in between, higher up they get more common
          if (Math.random() < cfg.brk * (0.5 + Math.min(1, climb / 40)) * (mode === 'monsters' ? 1.4 : 1)) addPlat(lastChainY + 30 + Math.random() * 30, false);
          // monsters: from 30 m up, never on the way to the next platform
          if (hasMonsters() && climb > 3 && Math.random() < [0.16, 0.2, 0.24][api.level] * (mode === 'boost' ? 0.5 : 1) * (0.6 + Math.min(1, climb / 50))) {
            let mx = lastX + (lastX < WW / 2 ? 1 : -1) * (110 + Math.random() * 60);
            mx = Math.max(MR + 8, Math.min(WW - MR - 8, mx));
            if (Math.abs(mx - lastX) > 90) mons.push({ x: mx, y: lastChainY + 36 + Math.random() * 20, ox: mx, ph: Math.random() * 6, kind: Math.floor(Math.random() * 3), dead: -1 });
          }
        }
        mons = mons.filter(m => m.y < camY + WH + 60);
        plats = plats.filter(q => q.y < camY + WH + 60);
      }
      function reset() {
        WH = worldH(); clock = 0; state = 'play'; deadAt = -1; onFloor = true; squash = 0; spin = 0; pops = []; height = 0; best = 0;
        power = null; bubble = false; coil = 0; shots = []; rocks = []; rockT = 3; shotT = 0; wind = 0;
        fx = []; trail = []; trailT = 0; shake = 0; flash = 0; pulse = 0; zapAt = -9; windX = 0; bolt = null; boltT = 4; gust = null; gustT = 5;
        plats = []; mons = []; camY = -WH + 40;          // world y grows downward; the start floor sits at y = 0
        p = { x: WW / 2, y: -PH - R, vx: 0, vy: mode === 'moon' ? MOON_BOUNCE : BOUNCE };
        plats.push({ x: WW / 2, y: 0, type: 'still', vx: 0, broken: -1, born: 0, wide: true });
        lastChainY = 0; lastX = WW / 2; generate(); api.score(0);
      }

      // what a bounce kicks up: it is the same bounce everywhere, but each world answers it differently
      function landFx(q) {
        const x = p.x, y = q.y, big = q.type === 'spring' || coil > 0;
        pulse = 1;
        if (mode === 'moon') { puff(x, y, { n: 14, speed: 70, spread: 1.2, g: 34, life: 1.7, r: 5, drag: 0.55, rgb: '190,190,200', kind: 'smoke' }); wave(x, y, '200,205,225', 44, 0.9); }
        else if (mode === 'storm') { puff(x, y, { n: 16, speed: 210, spread: 1.1, vx: wind * 0.25, g: 760, life: 0.5, rgb: '190,215,240', kind: 'drop' }); wave(x, y, '170,200,235', 30, 0.3); }
        else if (mode === 'boost') {
          wave(x, y, big ? '255,214,90' : '255,160,80', big ? 74 : 34, 0.4);
          if (big) { puff(x, y, { n: 18, speed: 240, spread: 1.3, g: 500, life: 0.6, r: 3, rgb: '255,200,90' }); jolt(0.4); }
        } else if (mode === 'monsters') puff(x, y, { n: 8, speed: 80, spread: 1.2, g: -30, life: 0.7, r: 2.6, rgb: '235,120,150' });
        else if (mode === 'night') puff(x, y, { n: 9, speed: 90, spread: 1.3, g: 90, life: 0.9, r: 2.4, rgb: '255,205,130' });
        else puff(x, y, { n: 7, speed: 90, spread: 1.2, g: 300, life: 0.4, r: 3, rgb: api.colors().dark ? '200,190,175' : '255,255,255' });
        if (q.type === 'spring' && mode !== 'boost') jolt(0.25);
      }
      function bopFx(m) {
        puff(m.x, m.y, { n: 18, speed: 210, g: 300, life: 0.6, r: 3.4, rgb: ['190,140,240', '110,210,180', '240,130,145'][m.kind] });
        wave(m.x, m.y, '255,235,200', 46, 0.35); jolt(0.4);
      }
      function land(q) {
        if (!q.wide) onFloor = false;       // first platform above the start floor: the mode choice goes away
        if (q.type === 'break') {
          if (q.broken < 0) { q.broken = clock; api.sfx('drop'); puff(q.x, q.y, { n: 10, speed: 70, g: 240, life: 0.6, r: 3, rgb: mode === 'moon' ? '150,148,156' : '190,155,110' }); }
          return false;                     // crumbly platforms never bounce you
        }
        if (q.type === 'cloud') { p.vy = bounceV(); p.y = q.y - R; squash = 1; q.broken = clock; api.sfx('jump'); landFx(q); return true; }   // holds you once, then puffs away
        p.vy = q.type === 'spring' ? springV() : bounceV();
        if (coil > 0 && q.type !== 'spring') coil--;
        p.y = q.y - R; squash = 1;
        if (q.type === 'spring') { q.sprung = clock; api.sfx('power'); spin += 6; } else api.sfx('jump');
        landFx(q);
        return true;
      }
      function give(it) {
        const rgb = it === 'jet' ? '255,130,60' : it === 'coil' ? '255,214,90' : '130,205,255';
        api.sfx('power'); light(0.5, rgb); jolt(0.5);
        wave(p.x, p.y, rgb, 110, 0.5); wave(p.x, p.y, '255,255,255', 60, 0.3);
        puff(p.x, p.y, { n: 24, speed: 300, g: 260, life: 0.7, r: 3.4, rgb });
        if (it === 'jet') { power = { until: clock + JET_T }; api.sfx('whoosh'); pops.push({ t: clock, text: 'Jet!', big: true }); }
        else if (it === 'coil') { coil = COIL_N; pops.push({ t: clock, text: 'Coil!', big: true }); }
        else { bubble = true; pops.push({ t: clock, text: 'Bubble!', big: true }); }
      }
      function strike() {
        const b = bolt;
        let end = camY + WH;   // it hits the first platform under it, or runs off the bottom of the board
        for (const q of plats) if (Math.abs(q.x - b.x) < PW / 2 && q.y > camY + 40 && q.y < end) end = q.y;
        b.path = W.boltPath(b.x, camY - 30, end); b.hit = clock; boltX = b.x;
        api.sfx('thunder'); light(api.reduceMotion ? 0.25 : 1, '225,235,255'); jolt(1);
        puff(b.x, end, { n: 22, speed: 280, spread: 1.4, g: 520, life: 0.55, r: 2.6, rgb: '205,225,255' });
        wave(b.x, end, '205,225,255', 90, 0.4);
        const d = p.x - b.x;
        if (Math.abs(d) > BOLT_REACH) return;
        p.vx = (d < 0 ? -1 : 1) * MAXVX; p.vy = Math.min(p.vy, p.vy * 0.5 - 200); squash = 1; spin += 8; zapAt = clock;
        pops.push({ t: clock, text: 'Zapped!', big: true });
      }
      function stormStep(dt) {
        gustT -= dt;
        if (gustT <= 0) { gustT = 6 + Math.random() * 4; gust = { t: clock, dir: Math.random() < 0.5 ? -1 : 1 }; api.sfx('whoosh'); }
        if (gust && clock - gust.t > GUST_T) gust = null;
        boltT -= dt;
        if (!bolt && boltT <= 0 && height >= 8) {
          boltT = [8, 6.5, 5][api.level] + Math.random() * 3;
          const x = p.x + (Math.random() * 2 - 1) * 150;   // close to you, so it matters; the sky over it glows first
          bolt = { t: clock, x: Math.max(24, Math.min(WW - 24, x)), hit: 0 };
        }
        if (bolt && !bolt.hit && clock - bolt.t >= BOLT_WARN) strike();
        if (bolt && bolt.hit && clock - bolt.hit > BOLT_SHOW) bolt = null;
        const seen = plats.filter(q => q.y > camY && q.y < camY + WH && q.broken < 0);
        if (seen.length && Math.random() < dt * 22) { const q = seen[Math.floor(Math.random() * seen.length)]; puff(q.x + (Math.random() * 2 - 1) * PW * 0.4, q.y, { n: 3, speed: 70, spread: 0.9, g: 500, life: 0.28, rgb: '190,215,240', kind: 'drop' }); }
        if (Math.random() < dt * 14) puff(p.x, p.y - R, { n: 2, speed: 80, spread: 1, vx: wind * 0.3, g: 500, life: 0.3, rgb: '205,225,250', kind: 'drop' });
      }

      function update(dt) {
        clock += dt;
        const nh = worldH(); if (nh !== WH) WH = nh;
        squash = Math.max(0, squash - dt * 5);
        pulse = Math.max(0, pulse - dt * 2.6); shake = Math.max(0, shake - dt * 3.2); flash = Math.max(0, flash - dt * 3.4);
        W.stepFx(fx, dt);
        pops = pops.filter(o => clock - o.t < (o.big ? 1.1 : 0.8));
        plats.forEach(q => {
          if (q.type === 'move' && state === 'play') { q.x += q.vx * dt; if (q.x < PW / 2 + 4 || q.x > WW - PW / 2 - 4) { q.vx = -q.vx; q.x = Math.max(PW / 2 + 4, Math.min(WW - PW / 2 - 4, q.x)); } }
          if (q.broken >= 0) q.y += (clock - q.broken) * 500 * dt;
        });
        if (state !== 'play') { if (p.y < camY + WH + 200) { p.vy += gravity() * dt; p.y += p.vy * dt; } spin += dt * 4; return; }
        const dir = ((held.r || held.pr) ? 1 : 0) - ((held.l || held.pl) ? 1 : 0);
        if (dir) p.vx += dir * ACC * dt; else p.vx *= Math.pow(mode === 'moon' ? MOON_DRIFT : AIR_DRIFT, dt);
        if (mode === 'storm') {
          const gusting = gust ? gust.dir * GUST_WIND * Math.sin(Math.PI * Math.min(1, (clock - gust.t) / GUST_T)) : 0;
          wind = (Math.sin(clock * 0.7) * 240 + Math.sin(clock * 0.23 + 1) * 170 + gusting) * Math.min(1, 0.35 + height / 150);
          p.vx += wind * dt; windX += wind * dt; stormStep(dt);
        }
        p.vx = Math.max(-MAXVX, Math.min(MAXVX, p.vx));
        p.x += p.vx * dt;
        if (p.x < -R) p.x += WW + 2 * R; if (p.x > WW + R) p.x -= WW + 2 * R;   // wrap side to side
        const prevY = p.y;
        if (power && clock >= power.until) { power = null; wave(p.x, p.y, '255,190,120', 60, 0.4); }
        if (power) { puff(p.x, p.y + R + 8, { n: 3, speed: 90, spread: 0.5, vy: 420, life: 0.4, r: 4, jitter: 7, rgb: '255,160,60' }); puff(p.x, p.y + R + 16, { n: 1, speed: 30, vy: 200, life: 0.8, r: 6, jitter: 8, rgb: '150,140,135', kind: 'smoke' }); jolt(0.16); }
        if (power) p.vy = JET_V; else p.vy += gravity() * dt;
        p.y += p.vy * dt;
        spin += dt * (1.5 + Math.abs(p.vx) / 120);
        trailT -= dt;
        if (trailT <= 0) { trailT = TRAIL_GAP; trail.push({ x: p.x, y: p.y }); if (trail.length > TRAIL_N) trail.shift(); }
        for (const q of plats) {   // pick-ups: touch one and it is yours
          if (!q.item || Math.abs(p.x - q.x) > R + ITEM_REACH || Math.abs(p.y - (q.y - 15)) > R + ITEM_REACH) continue;
          const it = q.item; q.item = undefined; give(it);
        }
        if (p.vy > 0) {
          for (const q of plats) {
            if (q.broken >= 0 && (q.type === 'break' || q.type === 'cloud')) continue;
            const half = q.wide ? WW : PW / 2 + R * 0.6;
            if (prevY + R <= q.y + 2 && p.y + R >= q.y && Math.abs(p.x - q.x) < half) { if (land(q)) break; }
          }
        }
        // camera only moves up
        const want = p.y - WH * 0.42;
        if (want < camY) camY = want;
        height = Math.max(height, Math.round((-p.y - (PH + R)) / 10));   // 0 m while standing on the start floor
        if (height > best) {
          if (Math.floor(height / 100) > Math.floor(best / 100) && height >= 100) { api.sfx('score'); pops.push({ t: clock, text: `${Math.floor(height / 100) * 100} m` }); }
          best = height; api.score(height);
        }
        // monsters drift side to side; bop one from above, any other touch knocks you down
        for (const m of mons) {
          if (m.dead >= 0) { m.y += (clock - m.dead) * 600 * dt; continue; }
          m.x = m.ox + Math.sin(clock * 1.3 + m.ph) * 26;
          const dx = p.x - m.x, dy = p.y - (m.y + Math.sin(clock * 3 + m.ph) * 3);
          if (dx * dx + dy * dy < (R + MR - 3) * (R + MR - 3)) {
            if (power) { m.dead = clock; api.sfx('score'); bopFx(m); continue; }
            if (bubble && !(p.vy > 0 && dy < -MR * 0.35)) { bubble = false; m.dead = clock; api.sfx('drop'); pops.push({ t: clock, text: 'Pop!' }); bopFx(m); puff(p.x, p.y, { n: 20, speed: 200, life: 0.45, r: 2.6, rgb: '170,225,255' }); continue; }
            if (p.vy > 0 && dy < -MR * 0.35) { m.dead = clock; p.vy = bounceV() * 1.05; squash = 1; spin += 4; api.sfx('score'); pops.push({ t: clock, text: 'Bop!' }); bopFx(m); }
            else { state = 'over'; deadAt = clock; p.vy = 120; api.sfx('lose');
              api.timeout(() => api.over({ score: height, title: 'Caught by a monster', won: false, message: `Climbed ${height} m` }), 900); return; }
          }
        }
        // shots fly straight up; one hit bops a monster
        shots.forEach(o => { o.y -= SHOT_V * dt; });
        for (const o of shots) for (const m of mons) if (m.dead < 0 && !o.done && Math.hypot(o.x - m.x, o.y - m.y) < MR + 6) { o.done = true; m.dead = clock; api.sfx('score'); pops.push({ t: clock, text: 'Bop!' }); bopFx(m); }
        shots = shots.filter(o => !o.done && o.y > camY - 20);
        // Moon: burning rocks fall slowly past, always in plain sight first
        if (mode === 'moon') {
          rockT -= dt;
          if (rockT <= 0 && height > 15) { rockT = [3.4, 2.8, 2.2][api.level] + Math.random() * 1.4; rocks.push({ x: 20 + Math.random() * (WW - 40), y: camY - 24, v: 60 + Math.random() * 50, vx: (Math.random() * 2 - 1) * 26, r: 9 + Math.random() * 6, ph: Math.random() * 6 }); }
          for (const o of rocks) {
            o.y += o.v * dt; o.x += o.vx * dt;
            if (Math.random() < dt * 16) puff(o.x, o.y - o.r, { n: 1, speed: 16, g: -8, life: 0.9, r: 2.2, jitter: o.r * 0.6, rgb: '255,150,70' });
            if (!power && Math.hypot(p.x - o.x, p.y - o.y) < R + o.r - 3) {
              state = 'over'; deadAt = clock; p.vy = 120; api.sfx('lose');
              api.timeout(() => api.over({ score: height, title: 'Hit by a rock', won: false, message: `Climbed ${height} m` }), 900); return;
            }
          }
          rocks = rocks.filter(o => o.y < camY + WH + 40);
        }
        generate();
        if (p.y - R > camY + WH + 20 && bubble) {   // the bubble catches one fall
          bubble = false; p.y = camY + WH + R; p.vy = springV(); api.sfx('power'); pops.push({ t: clock, text: 'Saved!', big: true });
          puff(p.x, p.y - 20, { n: 22, speed: 240, spread: 1.2, life: 0.5, r: 2.6, rgb: '170,225,255' }); jolt(0.4);
        }
        if (p.y - R > camY + WH + 20) {
          state = 'over'; deadAt = clock; api.sfx('lose');
          api.timeout(() => api.over({ score: height, title: height >= 500 ? 'What a climb' : 'Down you go', won: false, message: `Climbed ${height} m` }), 900);
        }
      }

      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = true;
        else if ((k === 'ArrowUp' || k === ' ' || k === 'w' || k === 'W') && !e.repeat && canFire() && state === 'play' && clock - shotT >= SHOT_GAP) { shotT = clock; shots.push({ x: p.x, y: p.y - R }); api.sfx('tick'); }
        else if ((k === 'm' || k === 'M') && switchOn()) setMode(MODE_IDS[(MODE_IDS.indexOf(mode) + 1) % MODE_IDS.length]);
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = false;
      });
      // the mode tabs: only in the start state (waiting for the first move, or still on the start floor).
      // Not during the climb and not on the game-over screen; the last choice is remembered (Ludus.state.hopMode).
      const switchOn = () => state === 'play' && onFloor;
      const switchBox = () => ({ x: 8, y: 44, w: WW - 16, h: 36 });
      const inSwitch = e => { const r = canvas.getBoundingClientRect(), k = WW / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, b = switchBox();
        return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? x : null; };
      function setMode(m) {
        if (m === mode) return;
        mode = m; Ludus.state.hopMode = m; api.sfx('click'); reset();
      }
      // a press on the choice picks a mode and is not a move: it neither starts the climb nor steers (capture runs before the game's own listeners)
      const onPick = e => {
        if (!switchOn()) return;
        const x = inSwitch(e); if (x === null) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (e.type === 'pointerdown') { const b = switchBox(), n = tabEdges(b.w).findIndex(v => v > x - b.x) - 1; setMode(MODE_IDS[n < 0 ? MODES.length - 1 : n]); }
      };
      canvas.addEventListener('pointerdown', onPick, true); canvas.addEventListener('pointermove', onPick, true);
      const pointerSide = e => { const r = canvas.getBoundingClientRect(); const left = e.clientX - r.left < r.width / 2; held.pl = left; held.pr = !left; };
      api.on(canvas, 'pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ } pointerSide(e); });
      api.on(canvas, 'pointermove', e => { if (held.pl || held.pr) pointerSide(e); });
      const release = () => { held.pl = held.pr = false; };
      api.on(canvas, 'pointerup', release); api.on(canvas, 'pointercancel', release);
      api.on(window, 'blur', () => { held.l = held.r = false; release(); });

      // pick-ups, drawn small above their platform (the jet, the coil, the bubble)
      function drawItem(k, col) {
        if (k === 'jet') {
          ctx.fillStyle = '#d9604a'; D.roundRect(ctx, -6, -9, 12, 16, 5); ctx.fill();
          ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(0, 13); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(0, -3, 2.6, 0, 7); ctx.fill();
        } else if (k === 'coil') {
          ctx.strokeStyle = col.accent; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
          for (let i = 0; i <= 5; i++) ctx[i ? 'lineTo' : 'moveTo'](i % 2 ? 6 : -6, 7 - i * 3); ctx.stroke();
        } else {
          ctx.strokeStyle = col.dark ? 'rgba(170,220,255,0.95)' : 'rgba(60,130,190,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -1, 8, 0, 7); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-3, -4, 1.8, 0, 7); ctx.fill();
        }
      }

      function render() {
        const base = api.colors(), col = W.palette(mode, base), s = view.w / WW;
        const still = api.reduceMotion;
        const o = { WW, WH, camY, height, dark: base.dark, t: still ? 0 : performance.now() / 1000, speed: -p.vy, jet: !!power, wind, windX, flash, boltX, reduce: still };
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.save(); ctx.scale(s, s);
        W.sky(ctx, mode, o);
        if (shake > 0) ctx.translate((Math.random() * 2 - 1) * shake * 9, (Math.random() * 2 - 1) * shake * 9);
        ctx.translate(0, -camY);
        // height marks every 100 m
        const first = Math.floor(-(camY + WH) / 1000) * 1000;
        for (let m = first; m <= -camY + 1000; m += 1000) {
          const y = -m; if (y < camY - 10 || y > camY + WH + 10 || m <= 0) continue;
          ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(WW - 8, y); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, `${m / 10} m`, WW - 10, y - 9, 10.5, col.ink3, 650, 'right');
        }
        W.ground(ctx, mode, o);
        // platforms
        plats.forEach(q => {
          if (q.y < camY - 20 || q.y > camY + WH + 20) return;
          if (q.wide && W.hideFloor(mode)) return;   // the moon's own ground is the start floor
          const w = q.wide ? WW - 40 : PW;
          const born = 1;   // platforms do not grow in when a run starts
          ctx.save(); ctx.translate(q.x, q.y + PH / 2);
          if (q.broken >= 0) { ctx.rotate((clock - q.broken) * 0.8); ctx.globalAlpha = Math.max(0, 1 - (clock - q.broken) * 1.6); }
          ctx.scale(born, 1);
          let fill = col.dark ? '#7fa889' : '#6fae7f', top = 'rgba(255,255,255,0.3)';
          if (q.type === 'move') fill = col.dark ? '#6f93b5' : '#5b8fc4';
          if (q.type === 'break') fill = col.dark ? '#a08766' : '#c9a77a';
          if (q.wide) fill = col.dark ? '#5c5247' : '#d8cab5';
          fill = W.skin(mode, q) || fill;
          if (q.type === 'cloud') {   // a puffy cloud instead of a slab
            ctx.fillStyle = col.dark ? 'rgba(235,240,250,0.82)' : '#ffffff';
            ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.25)' : 'rgba(120,140,170,0.35)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(-14, 1, 16, 8, 0, 0, Math.PI * 2); ctx.ellipse(4, -3, 18, 10, 0, 0, Math.PI * 2); ctx.ellipse(20, 1, 13, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore(); return;
          }
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.3)' : 'rgba(60,40,20,0.12)';
          D.roundRect(ctx, -w / 2, -PH / 2 + 3, w, PH, PH / 2); ctx.fill();
          ctx.fillStyle = fill; D.roundRect(ctx, -w / 2, -PH / 2, w, PH, PH / 2); ctx.fill();
          ctx.fillStyle = top; D.roundRect(ctx, -w / 2 + 5, -PH / 2 + 2, w - 10, 3, 1.5); ctx.fill();
          W.platform(ctx, mode, q, w, PH, o);
          if (q.item) {
            ctx.save(); ctx.translate(0, -PH / 2 - 15 + Math.sin(clock * 4 + q.x) * 2.5); W.itemBeacon(ctx, q.item, o);
            const beat = 1.5 + Math.sin(clock * 6 + q.x) * 0.1; ctx.scale(beat, beat); drawItem(q.item, col); ctx.restore();
          }
          if (q.type === 'break') {
            ctx.strokeStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,60,30,0.35)'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(-8, -PH / 2); ctx.lineTo(-3, 0); ctx.lineTo(-7, PH / 2); ctx.moveTo(12, -PH / 2); ctx.lineTo(15, PH / 2); ctx.stroke();
          }
          if (q.type === 'spring') {
            const up = q.sprung && clock - q.sprung < 0.25 ? 5 : 0;
            ctx.strokeStyle = col.accent; ctx.lineWidth = 2; ctx.lineCap = 'round';
            ctx.beginPath(); for (let i = 0; i <= 4; i++) ctx[i ? 'lineTo' : 'moveTo'](6 + (i % 2 ? 4 : -4), -PH / 2 - i * (2 + up / 4)); ctx.stroke();
            ctx.fillStyle = col.accent; D.roundRect(ctx, -3, -PH / 2 - 11 - up, 18, 4, 2); ctx.fill();
          }
          ctx.restore();
        });
        // Moon rocks and shots
        rocks.forEach(k => {
          W.meteorTail(ctx, k);
          ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(clock * 0.8 + k.ph);
          ctx.fillStyle = '#8f8a84'; ctx.beginPath();
          for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, rr = k.r * (0.82 + ((i * 37) % 5) * 0.06); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(k.r * 0.25, -k.r * 0.2, k.r * 0.26, 0, 7); ctx.fill();
          ctx.restore();
        });
        ctx.fillStyle = col.accent;
        shots.forEach(k => { D.roundRect(ctx, k.x - 2.5, k.y - 7, 5, 14, 2.5); ctx.fill(); });
        // monsters
        const MC = col.dark ? ['#b58be0', '#6fc0a8', '#e0858f'] : ['#8a5cc8', '#2f9a7c', '#d4566a'];
        mons.forEach(m => {
          if (m.y < camY - 30 || m.y > camY + WH + 30) return;
          const bob = Math.sin(clock * 3 + m.ph) * 3, a = m.dead >= 0 ? Math.max(0, 1 - (clock - m.dead) * 2) : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(m.x, m.y + bob); if (m.dead >= 0) ctx.scale(1, 0.6);
          ctx.fillStyle = MC[m.kind];
          ctx.beginPath(); ctx.arc(0, 0, MR, Math.PI, 0); ctx.lineTo(MR, MR * 0.7);
          for (let i = 0; i < 4; i++) ctx.lineTo(MR - (i + 0.5) * MR / 2, MR * (i % 2 ? 0.7 : 0.35));
          ctx.lineTo(-MR, MR * 0.7); ctx.closePath(); ctx.fill();
          // horns / ears
          ctx.beginPath(); ctx.moveTo(-MR * 0.7, -MR * 0.55); ctx.lineTo(-MR * 0.95, -MR * 1.15); ctx.lineTo(-MR * 0.3, -MR * 0.85); ctx.fill();
          ctx.beginPath(); ctx.moveTo(MR * 0.7, -MR * 0.55); ctx.lineTo(MR * 0.95, -MR * 1.15); ctx.lineTo(MR * 0.3, -MR * 0.85); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-5, -2, 4.2, 0, Math.PI * 2); ctx.arc(5, -2, 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1d1a17'; const lk = Math.max(-1.5, Math.min(1.5, (p.x - m.x) / 40));
          ctx.beginPath(); ctx.arc(-5 + lk, -1.5, 2, 0, Math.PI * 2); ctx.arc(5 + lk, -1.5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        if (bolt && bolt.hit) W.bolt(ctx, bolt, clock - bolt.hit);
        W.drawFx(ctx, fx);
        if (!still) W.trail(ctx, mode, trail);
        // the spark: it squashes on a bounce, stretches with speed and leans into the wind
        const sq = still ? 0 : squash * 0.22, stretch = still ? 0 : Math.min(power ? 0.34 : 0.2, Math.abs(p.vy) / 3600);
        const py = state === 'over' ? Math.min(p.y, camY + WH - R - 6) : p.y, zap = Math.max(0, 1 - (clock - zapAt) / 0.7);
        const b = { R, t: o.t, jet: !!power && !still, coil, bubble, squash, zap: still ? 0 : zap };
        ctx.save(); ctx.translate(p.x, py + R * sq);
        if (mode === 'storm' && !still) ctx.transform(1, 0, Math.max(-0.45, Math.min(0.45, -wind / 1100)), 1, 0, 0);
        ctx.scale(1 + sq - stretch * 0.55, 1 - sq + stretch);
        W.ballBack(ctx, mode, b);
        W.softDot(ctx, '217,119,87', 0, 0, R + 20, col.dark ? 0.55 : 0.4);
        D.spark(ctx, 0, 0, R + 2, state === 'over' ? col.ink3 : col.accent, spin);
        W.ballFront(ctx, mode, b);
        ctx.restore();
        ctx.restore();
        ctx.save(); ctx.scale(s, s);
        if (bolt && !bolt.hit && !still) W.boltWarning(ctx, bolt.x, o, Math.min(1, (clock - bolt.t) / BOLT_WARN));
        // Night: dark everywhere except your own glow, which shrinks as you climb and swells for a moment on each bounce
        if (mode === 'night') {
          const lx = p.x, ly = p.y - camY, rad = Math.max(105, 175 - height / 12) * (1 + pulse * 0.2);
          const g = ctx.createRadialGradient(lx, ly, rad * 0.05, lx, ly, rad * 1.3);
          // eased from the middle right out to the dark, so the glow has no visible edge at either end
          for (let i = 0; i <= NIGHT_STEPS; i++) { const t = i / NIGHT_STEPS; g.addColorStop(t, `rgba(6,7,14,${(0.96 * t * t * (3 - 2 * t)).toFixed(3)})`); }
          ctx.fillStyle = g; ctx.fillRect(0, 0, WW, WH + 4);
          W.softDot(ctx, '255,190,120', lx, ly, rad * 0.8, 0.22 + pulse * 0.1);
        }
        W.weather(ctx, mode, o);
        if (flash > 0.01) { ctx.fillStyle = `rgba(${flashRgb},${(flash * 0.72).toFixed(3)})`; ctx.fillRect(0, 0, WW, WH + 4); }
        ctx.restore();
        // HUD (screen space)
        ctx.save(); ctx.scale(s, s);
        D.text(ctx, `${height} m`, 14, 18, 16, col.ink, 760, 'left');
        if (mode === 'storm') W.compass(ctx, wind, WW / 2, 18);
        const held2 = power ? `Jet ${Math.max(0, power.until - clock).toFixed(1)}s` : coil > 0 ? `Coil ${coil}` : bubble ? 'Bubble' : '';
        if (held2) D.text(ctx, held2, WW - 14, 18, 13, mode === 'night' ? col.ink : col.accent, 720, 'right');
        if (power) { const left = Math.max(0, (power.until - clock) / JET_T); ctx.fillStyle = 'rgba(255,255,255,0.3)'; D.roundRect(ctx, 14, 34, WW - 28, 5, 2.5); ctx.fill(); ctx.fillStyle = '#ff9a3c'; D.roundRect(ctx, 14, 34, (WW - 28) * left, 5, 2.5); ctx.fill(); }
        pops.forEach(k => {
          const life = k.big ? 1.1 : 0.8, a = (clock - k.t) / life, grow = k.big ? 1 + Math.min(1, a * 6) * 0.6 : 1;
          ctx.globalAlpha = 1 - a * a; D.text(ctx, k.text, WW / 2, (k.big ? 104 : 60) - a * 20, 18 * grow, k.big ? col.ink : col.accent, 780);
        });
        ctx.globalAlpha = 1;
        if (state === 'over') {
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.9)' : 'rgba(255,252,247,0.92)';   // dark worlds use the dark card in both themes
          D.roundRect(ctx, WW / 2 - 70, 40, 140, 30, 15); ctx.fill();
          D.text(ctx, `Fell from ${height} m`, WW / 2, 55, 13, col.ink, 700);
        }
        if (switchOn()) {
          // same look as the app's other switches: soft track on a raised slab, a raised thumb that slides
          const b = switchBox(), half = b.w / 2, flat = document.documentElement.classList.contains('flat');
          // real clock, not game time: the game clock stands still while waiting for the first move
          const nowMs = performance.now(), swDt = Math.min(0.05, (nowMs - swLast) / 1000); swLast = nowMs;
          const at = MODE_IDS.indexOf(mode), edges = tabEdges(b.w);
          swPos += (at - swPos) * (1 - Math.exp(-16 * swDt));
          const on = api.reduceMotion ? at : swPos, tr = b.h / 2;
          if (!flat) { ctx.fillStyle = base.dark ? 'rgba(0,0,0,0.38)' : 'rgba(32,28,23,0.14)'; D.roundRect(ctx, b.x, b.y + 3, b.w, b.h, tr); ctx.fill(); }
          ctx.fillStyle = base.surface2; D.roundRect(ctx, b.x, b.y, b.w, b.h, tr); ctx.fill();
          const i0 = Math.min(MODES.length - 1, Math.floor(on)), f = on - i0, i1 = Math.min(MODES.length - 1, i0 + 1);
          const left = edges[i0] + (edges[i1] - edges[i0]) * f, right = edges[i0 + 1] + (edges[i1 + 1] - edges[i0 + 1]) * f;
          const tx = b.x + left + 3, tw = right - left - 6, th = b.h - 8, ty = b.y + 4;
          if (!flat) { ctx.fillStyle = base.dark ? 'rgba(0,0,0,0.45)' : 'rgba(32,28,23,0.2)'; D.roundRect(ctx, tx, ty + 2, tw, th, th / 2); ctx.fill(); }
          ctx.fillStyle = base.surface; D.roundRect(ctx, tx, ty, tw, th, th / 2); ctx.fill();
          MODES.forEach((m, i) => D.text(ctx, m[1], b.x + (edges[i] + edges[i + 1]) / 2, b.y + b.h / 2 + 0.5, 11.5, Math.abs(on - i) < 0.5 ? base.ink : base.ink2, 700));
        }
        ctx.restore();
      }

      // ---------- save ----------
      const r1 = v => Math.round(v * 10) / 10;
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.plats) || !Array.isArray(sv.p) || sv.p.length !== 4) return false;
        if (!sv.plats.every(q => Array.isArray(q) && q.length >= 4 && ['still', 'move', 'break', 'spring', 'cloud'].includes(q[2]))) return false;
        if (MODE_IDS.includes(sv.mode)) mode = sv.mode;
        reset();
        if (sv.wh >= 360 && sv.wh <= 2000) WH = sv.wh;
        camY = +sv.camY; height = sv.height | 0; best = height; onFloor = height <= 3; lastChainY = +sv.lastChainY; lastX = sv.lastX >= 0 && sv.lastX <= WW ? +sv.lastX : WW / 2;
        p = { x: +sv.p[0], y: +sv.p[1], vx: +sv.p[2], vy: +sv.p[3] };
        plats = sv.plats.map(q => ({ x: q[0], y: q[1], type: q[2], vx: q[3], broken: -1, born: -9, wide: !!q[4], item: ['jet', 'coil', 'bubble'].includes(q[5]) ? q[5] : undefined }));
        if (Array.isArray(sv.mons)) mons = sv.mons.filter(m => Array.isArray(m) && m.length === 4 && m.every(isFinite)).map(m => ({ x: m[0], ox: m[0], y: m[1], ph: m[2], kind: m[3] % 3, dead: -1 }));
        if (!isFinite(camY) || !isFinite(p.y)) return false;
        return true;
      }
      if (!(api.saved && restore(api.saved))) reset();
      this._peek = () => ({ p, plats, camY, WH, state, mode, mons, rocks, shots, power, bubble, coil, wind, gust, bolt, flash, shake, fx: fx.length, zapAt, clock, height });   // read-only view for automated play tests
      this._cue = { give, pick: setMode, strike() { bolt = { t: clock, x: Math.max(24, p.x - 40), hit: 0 }; strike(); }, warn() { bolt = { t: clock - BOLT_WARN * 0.7, x: Math.max(24, p.x - 60), hit: 0 }; } };   // automated tests: show a moment on demand
      api.score(height);
      api.loop(dt => { update(dt); render(); });
      return {
        save() {
          if (state !== 'play') return null;
          return {
            v: 1, mode, mons: mons.filter(m => m.dead < 0).map(m => [r1(m.ox), r1(m.y), r1(m.ph), m.kind]), wh: WH, camY: r1(camY), height, lastChainY: r1(lastChainY), lastX: r1(lastX), p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy)],
            plats: plats.filter(q => q.broken < 0).map(q => [r1(q.x), r1(q.y), q.type, r1(q.vx), q.wide ? 1 : 0, q.item || 0])
          };
        }
      };
    }
  });
})();
