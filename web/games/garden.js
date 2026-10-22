/* Garden Guard: plant a garden that holds five lanes against waves of creeping weed blobs.
   Positions are in cell units: x = column (0 = the house edge, COLS = far right), lanes 0..4. */
(function () {
  const D = Ludus.draw;
  const COLS = 8, ROWS = 5;
  const PLANTS = [
    { name: 'Bloom', cost: 50, cd: 5, hp: 5 },
    { name: 'Sprout', cost: 100, cd: 6, hp: 5 },
    { name: 'Pebble', cost: 50, cd: 18, hp: 36 },
    { name: 'Pop pod', cost: 125, cd: 26, hp: 5 }
  ];
  const FOES = { blob: { hp: 10, sp: 1, r: 0.34 }, tough: { hp: 26, sp: 0.85, r: 0.38 }, quick: { hp: 7, sp: 1.8, r: 0.27 } };
  const DIFF = [
    { sun: 200, sky: 7, speed: 0.15, first: 25, count: 0.8 },
    { sun: 150, sky: 9, speed: 0.18, first: 20, count: 1 },
    { sun: 100, sky: 11, speed: 0.21, first: 15, count: 1.25 }
  ];
  const SUN = 25, FIRE = 1.4, SEED_SPEED = 5, BLOOM_EVERY = 10, BITE = 1;
  const SUN_GOLD = '#e8b33a';

  function waveSize(n, k) { return Math.round((2 + n * 1.7) * k); }
  function foeFor(n, rnd) {
    const r = rnd();
    if (n >= 4 && r < Math.min(0.35, 0.08 * (n - 3))) return 'tough';
    if (n >= 3 && r > 1 - Math.min(0.3, 0.1 * (n - 2))) return 'quick';
    return 'blob';
  }

  function sunIcon(ctx, x, y, r, t) {
    D.spark(ctx, x, y, r * 1.35, SUN_GOLD, t || 0);
    ctx.fillStyle = '#f6d36b'; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  function drawPlant(ctx, k, x, y, s, c, t, extra) {
    ctx.save(); ctx.translate(x, y);
    const sway = Math.sin(t * 2 + x) * 0.04;
    ctx.rotate(sway);
    const leaf = c.dark ? '#6aa35a' : '#5d9a4c', stem = c.dark ? '#4f7f43' : '#4a8040';
    if (k === 0) { // bloom: petals round a spark heart
      ctx.fillStyle = stem; ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.42);
      for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + t * 0.3; ctx.fillStyle = SUN_GOLD; ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.22, -s * 0.08 + Math.sin(a) * s * 0.22, s * 0.13, s * 0.08, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = c.dark ? '#5a3b22' : '#8a5a33'; ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.14, 0, Math.PI * 2); ctx.fill();
      if (extra > 0) D.spark(ctx, 0, -s * 0.08, s * 0.1 + extra * s * 0.1, '#fff1c4', t * 3);
    } else if (k === 1) { // sprout shooter
      ctx.fillStyle = stem; ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.42);
      ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(-s * 0.16, s * 0.3, s * 0.16, s * 0.06, 0.5, 0, Math.PI * 2); ctx.fill();
      const kick = extra > 0 ? extra * s * 0.05 : 0;
      ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(-kick, -s * 0.08, s * 0.24, 0, Math.PI * 2); ctx.fill();
      D.roundRect(ctx, s * 0.08 - kick, -s * 0.17, s * 0.3, s * 0.18, s * 0.08); ctx.fill();
      ctx.fillStyle = c.dark ? '#24301d' : '#2f4a27'; ctx.beginPath(); ctx.arc(s * 0.37 - kick, -s * 0.08, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(s * 0.02 - kick, -s * 0.16, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(s * 0.04 - kick, -s * 0.16, s * 0.03, 0, Math.PI * 2); ctx.fill();
    } else if (k === 2) { // pebble wall
      ctx.fillStyle = c.dark ? '#8c8273' : '#b9ab95';
      D.roundRect(ctx, -s * 0.28, -s * 0.36, s * 0.56, s * 0.78, s * 0.24); ctx.fill();
      ctx.fillStyle = c.dark ? '#a39886' : '#cfc2ad';
      D.roundRect(ctx, -s * 0.2, -s * 0.3, s * 0.22, s * 0.3, s * 0.1); ctx.fill();
      if (extra < 0.66) { ctx.strokeStyle = c.dark ? '#4c463e' : '#7d705e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.36); ctx.lineTo(s * 0.06, -s * 0.12); ctx.lineTo(-s * 0.04, s * 0.05); ctx.stroke(); }
      if (extra < 0.33) { ctx.beginPath(); ctx.moveTo(s * 0.28, s * 0.05); ctx.lineTo(s * 0.08, s * 0.16); ctx.lineTo(s * 0.12, s * 0.38); ctx.stroke(); }
      ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(-s * 0.08, -s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.arc(s * 0.1, -s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.fill();
    } else { // pop pod
      const pulse = extra > 0 ? 1 + Math.sin(t * 30) * 0.06 + (1 - extra) * 0.25 : 1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = c.dark ? '#c25a4a' : '#cf5f4c'; ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.04, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = stem; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -s * 0.22); ctx.quadraticCurveTo(s * 0.08, -s * 0.36, s * 0.16, -s * 0.38); ctx.stroke();
      if (extra > 0) D.spark(ctx, s * 0.17, -s * 0.39, s * 0.09, SUN_GOLD, t * 8);
    }
    ctx.restore();
  }
  function drawFoe(ctx, f, x, y, s, c, t) {
    const def = FOES[f.k], r = def.r * s;
    const hop = f.k === 'quick' && !f.eating ? Math.abs(Math.sin(t * 7 + f.seed)) * s * 0.14 : 0;
    const wob = Math.sin(t * (f.eating ? 12 : 5) + f.seed) * 0.07;
    ctx.save(); ctx.translate(x, y - hop);
    ctx.fillStyle = c.dark ? 'rgba(0,0,0,0.3)' : 'rgba(60,70,40,0.18)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.95 + hop, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(1 + wob, 1 - wob);
    const body = f.k === 'tough' ? (c.dark ? '#6e5a86' : '#7d6799') : f.k === 'quick' ? (c.dark ? '#7f9b4d' : '#8fae55') : (c.dark ? '#8a77a8' : '#a08cc2');
    ctx.fillStyle = f.hit > 0 ? '#fffaf2' : body;
    if (f.k === 'tough') {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * 1.12 : r * 0.92; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-r, r * 0.6);
      ctx.bezierCurveTo(-r * 1.1, -r * 0.9, r * 1.1, -r * 0.9, r, r * 0.6);
      ctx.quadraticCurveTo(0, r * 1.05, -r, r * 0.6); ctx.fill();
      ctx.strokeStyle = body; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.6); ctx.quadraticCurveTo(r * 0.3, -r * 1.1, r * 0.55, -r * 1.05); ctx.stroke();
    }
    // eyes look left toward the house
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.arc(r * 0.05, -r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2722';
    ctx.beginPath(); ctx.arc(-r * 0.45, -r * 0.08, r * 0.09, 0, Math.PI * 2); ctx.arc(-r * 0.02, -r * 0.08, r * 0.09, 0, Math.PI * 2); ctx.fill();
    if (f.eating) { ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 0.35, r * 0.18, r * (0.06 + Math.abs(Math.sin(t * 12)) * 0.1), 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  Ludus.register({
    id: 'garden', name: 'Plants vs. Zombies', aka: 'Garden Guard', tag: 'Arcade', tint: '#6f9a4a',
    hint: 'Click a plant card, then a tile · click suns to collect · right-click digs up · <kbd>←↑→↓</kbd> move, <kbd>1</kbd>-<kbd>4</kbd> pick, <kbd>Space</kbd> plant, <kbd>X</kbd> dig',
    _rules: { waveSize, foeFor, PLANTS, FOES, DIFF },
    art(ctx, w, h) {
      const c = { dark: false };
      for (let r = 0; r < 3; r++) { ctx.fillStyle = r % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.26)'; ctx.fillRect(0, h * (0.1 + r * 0.28), w, h * 0.28); }
      const s = h * 0.32;
      drawPlant(ctx, 0, w * 0.18, h * 0.3, s, c, 0, 0);
      drawPlant(ctx, 1, w * 0.36, h * 0.58, s, c, 0, 0);
      drawPlant(ctx, 2, w * 0.2, h * 0.82, s * 0.8, c, 0, 1);
      ctx.fillStyle = '#a7d77a'; ctx.beginPath(); ctx.arc(w * 0.52, h * 0.52, s * 0.08, 0, Math.PI * 2); ctx.fill();
      drawFoe(ctx, { k: 'blob', seed: 0, hit: 0 }, w * 0.78, h * 0.55, s, c, 0);
      drawFoe(ctx, { k: 'tough', seed: 1, hit: 0 }, w * 0.66, h * 0.86, s * 0.8, c, 0);
      sunIcon(ctx, w * 0.6, h * 0.22, s * 0.16, 0.2);
    },
    create(stage, api) {
      const lv = api.level, cfg = DIFF[lv];
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let t, sun, wave, plants, foes, seeds, suns, mowers, cds, score, cleared, skyT, state, picked, cursor, showCursor, booms, banner, lostLane, endT, hover;
      const L = { ox: 0, oy: 0, cw: 40, lh: 56, cards: [], barY: 6, barH: 52 };
      const rnd = Math.random;

      function fresh() {
        t = 0; sun = cfg.sun; score = 0; cleared = 0; skyT = 4;
        wave = { n: 0, left: 0, spawnT: cfg.first, phase: 'wait' };
        plants = []; foes = []; seeds = []; suns = [];
        mowers = Array.from({ length: ROWS }, () => ({ x: -0.45, on: false, gone: false }));
        cds = PLANTS.map((p, i) => (i >= 2 ? p.cd * 0.5 : 0));
      }
      function restore(s) {
        if (!s || !Array.isArray(s.plants) || !Array.isArray(s.foes) || !Array.isArray(s.mowers) || s.mowers.length !== ROWS || !s.wave) return false;
        const okCell = p => Number.isInteger(p.c) && Number.isInteger(p.r) && p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS && PLANTS[p.k];
        if (!s.plants.every(okCell) || !s.foes.every(f => FOES[f.k] && f.r >= 0 && f.r < ROWS && isFinite(f.x))) return false;
        t = +s.t || 0; sun = Math.max(0, s.sun | 0); score = s.score | 0; cleared = s.cleared | 0; skyT = +s.skyT || 5;
        wave = { n: s.wave.n | 0, left: s.wave.left | 0, spawnT: +s.wave.spawnT || 0, phase: ['wait', 'spawn', 'clear'].includes(s.wave.phase) ? s.wave.phase : 'wait' };
        plants = s.plants.map(p => ({ c: p.c, r: p.r, k: p.k, hp: +p.hp || PLANTS[p.k].hp, timer: +p.timer || 0, fuse: +p.fuse || 0, kick: 0 }));
        foes = s.foes.map(f => ({ k: f.k, r: f.r | 0, x: +f.x, hp: +f.hp || FOES[f.k].hp, mhp: +f.mhp || FOES[f.k].hp, seed: rnd() * 6, hit: 0, eating: false }));
        seeds = Array.isArray(s.seeds) ? s.seeds.filter(q => isFinite(q.x)).map(q => ({ r: q.r | 0, x: +q.x })) : [];
        suns = Array.isArray(s.suns) ? s.suns.filter(q => isFinite(q.x) && isFinite(q.y)).map(q => ({ x: +q.x, y: +q.y, ty: +q.ty, life: +q.life, fly: 0 })) : [];
        mowers = s.mowers.map(m => ({ x: isFinite(m.x) ? +m.x : -0.45, on: !!m.on, gone: !!m.gone }));
        cds = Array.isArray(s.cds) && s.cds.length === 4 ? s.cds.map(v => Math.max(0, +v || 0)) : PLANTS.map(() => 0);
        return true;
      }
      if (!restore(api.saved)) fresh();
      state = 'play'; picked = -1; cursor = { c: 1, r: 2 }; showCursor = false; booms = []; banner = null; lostLane = -1; endT = 0; hover = null;
      api.score(score);

      const plantAt = (c, r) => plants.find(p => p.c === c && p.r === r);
      function place(c, r) {
        if (state !== 'play' || picked < 0) return;
        const def = PLANTS[picked];
        if (plantAt(c, r)) { api.sfx('tick'); return; }
        if (cds[picked] > 0) { api.toast(`${def.name} is still growing`); return; }
        if (sun < def.cost) { api.toast(`Need ${def.cost} sun`); api.sfx('tick'); return; }
        sun -= def.cost; cds[picked] = def.cd;
        plants.push({ c, r, k: picked, hp: def.hp, timer: picked === 0 ? BLOOM_EVERY * 0.5 : 0, fuse: picked === 3 ? 0.9 : 0, kick: 0 });
        api.sfx('drop'); picked = -1;
      }
      function dig(c, r) {
        const p = plantAt(c, r);
        if (!p || state !== 'play') return;
        plants = plants.filter(q => q !== p); api.sfx('move');
      }
      function pick(i) {
        if (state !== 'play') return;
        picked = picked === i ? -1 : i; api.sfx('click');
      }
      function collect(s) { if (s.fly) return; s.fly = 0.001; sun += SUN; api.sfx('tap'); }

      // ---------- simulation ----------
      function spawnFoe() {
        const k = foeFor(wave.n, rnd), hp = FOES[k].hp * (1 + Math.max(0, wave.n - 3) * 0.1);
        foes.push({ k, r: Math.floor(rnd() * ROWS), x: COLS + 0.4, hp, mhp: hp, seed: rnd() * 6, hit: 0, eating: false });
      }
      function waves(dt) {
        wave.spawnT -= dt;
        if (wave.phase === 'wait' && wave.spawnT <= 0) {
          wave.n++; wave.left = waveSize(wave.n, cfg.count); wave.phase = 'spawn'; wave.spawnT = 0.5;
          banner = { text: `Wave ${wave.n}`, t: 0 }; api.sfx('power');
        } else if (wave.phase === 'spawn' && wave.spawnT <= 0) {
          spawnFoe(); wave.left--;
          wave.spawnT = Math.max(1.4, 5.5 - wave.n * 0.35) * (0.6 + rnd() * 0.8);
          if (wave.left <= 0) wave.phase = 'clear';
        } else if (wave.phase === 'clear' && !foes.length) {
          score += 100; api.score(score);
          wave.phase = 'wait'; wave.spawnT = 8;
          banner = { text: `Wave ${wave.n} cleared`, t: 0 }; api.sfx('score');
        }
      }
      function step(dt) {
        t += dt;
        cds = cds.map(v => Math.max(0, v - dt));
        // sky suns
        skyT -= dt;
        if (skyT <= 0) { skyT = cfg.sky * (0.8 + rnd() * 0.4); suns.push({ x: 0.6 + rnd() * (COLS - 1.2), y: -0.6, ty: 0.4 + rnd() * (ROWS - 0.8), life: 10, fly: 0 }); }
        suns.forEach(s => { if (s.fly) s.fly += dt; else { if (s.y < s.ty) s.y = Math.min(s.ty, s.y + dt * 1.2); else s.life -= dt; } });
        suns = suns.filter(s => (s.fly ? s.fly < 0.5 : s.life > 0));
        if (showCursor) suns.forEach(s => { if (!s.fly && Math.floor(s.x) === cursor.c && Math.floor(s.y) === cursor.r) collect(s); });
        waves(dt);
        // plants
        plants.forEach(p => {
          p.kick = Math.max(0, p.kick - dt * 5);
          if (p.k === 0) { p.timer -= dt; if (p.timer <= 0) { p.timer = BLOOM_EVERY; p.kick = 1; suns.push({ x: p.c + 0.5 + (rnd() - 0.5) * 0.4, y: p.r + 0.2, ty: p.r + 0.55, life: 10, fly: 0 }); } }
          else if (p.k === 1) {
            p.timer -= dt;
            if (p.timer <= 0 && foes.some(f => f.r === p.r && f.x > p.c + 0.3 && f.x < COLS + 0.2)) { p.timer = FIRE; p.kick = 1; seeds.push({ r: p.r, x: p.c + 0.85 }); }
          } else if (p.k === 3) {
            p.fuse -= dt;
            if (p.fuse <= 0) {
              p.hp = 0; booms.push({ c: p.c + 0.5, r: p.r + 0.5, t: 0 }); api.sfx('boom');
              foes.forEach(f => { if (Math.abs(f.r - p.r) <= 1 && Math.abs(f.x - (p.c + 0.5)) <= 1.6) f.hp -= 30; });
            }
          }
        });
        // seeds
        seeds.forEach(s => {
          s.x += SEED_SPEED * dt;
          const f = foes.find(o => o.r === s.r && o.hp > 0 && Math.abs(o.x - s.x) < FOES[o.k].r + 0.08);
          if (f) { f.hp -= 1; f.hit = 0.08; s.dead = true; api.sfx('tick'); }
        });
        seeds = seeds.filter(s => !s.dead && s.x < COLS + 0.6);
        // foes
        foes.forEach(f => {
          f.hit = Math.max(0, f.hit - dt);
          const target = plants.find(p => p.r === f.r && p.hp > 0 && f.x > p.c + 0.45 && f.x < p.c + 1.25);
          f.eating = !!target;
          if (target) target.hp -= BITE * dt * (f.k === 'tough' ? 1.5 : 1);
          else f.x -= cfg.speed * FOES[f.k].sp * dt;
          if (f.x < 0.05) {
            const m = mowers[f.r];
            if (!m.on && !m.gone) { m.on = true; api.sfx('power'); }
            else if (m.gone && f.x < -0.3) lose(f);
          }
        });
        plants = plants.filter(p => p.hp > 0);
        mowers.forEach((m, r) => {
          if (!m.on) return;
          m.x += 6 * dt;
          foes.forEach(f => { if (f.r === r && f.x <= m.x + 0.4 && f.hp > 0) { f.hp = 0; f.mowed = true; } });
          if (m.x > COLS + 0.6) { m.on = false; m.gone = true; }
        });
        const before = foes.length;
        foes = foes.filter(f => {
          if (f.hp > 0) return true;
          booms.push({ c: f.x, r: f.r + 0.5, t: 0, small: true });
          return false;
        });
        const killed = before - foes.length;
        if (killed) { cleared += killed; score += killed * 10; api.score(score); api.sfx('merge'); }
      }
      function lose(f) {
        if (state !== 'play') return;
        state = 'lost'; lostLane = f.r; endT = 0; api.sfx('lose');
        api.timeout(() => api.over({ score, title: 'The weeds got in', message: `Survived ${Math.max(0, wave.n - 1)} wave${wave.n === 2 ? '' : 's'} · ${cleared} cleared` }), 650);
      }

      // ---------- input ----------
      const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const cellOf = p => {
        const c = Math.floor((p.x - L.ox) / L.cw), r = Math.floor((p.y - L.oy) / L.lh);
        return c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
      };
      api.on(canvas, 'contextmenu', e => e.preventDefault());
      api.on(canvas, 'pointermove', e => { hover = cellOf(local(e)); });
      api.on(canvas, 'pointerleave', () => { hover = null; });
      api.on(canvas, 'pointerdown', e => {
        if (state !== 'play') return;
        const p = local(e); showCursor = false;
        // suns first: they sit above the lawn
        const s = suns.find(q => !q.fly && Math.hypot(L.ox + q.x * L.cw - p.x, L.oy + q.y * L.lh - p.y) < Math.max(18, L.cw * 0.45));
        if (s && e.button === 0) { collect(s); return; }
        const card = L.cards.findIndex(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
        if (card >= 0) { pick(card); return; }
        const cell = cellOf(p); if (!cell) { picked = -1; return; }
        if (e.button === 2 || e.altKey) { dig(cell.c, cell.r); return; }
        if (picked >= 0) place(cell.c, cell.r);
      });
      api.keys(e => {
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (mv) {
          if (showCursor) { cursor.c = Math.max(0, Math.min(COLS - 1, cursor.c + mv[0])); cursor.r = Math.max(0, Math.min(ROWS - 1, cursor.r + mv[1])); }
          showCursor = true; api.sfx('tick'); return;
        }
        if (/^[1-4]$/.test(e.key)) { pick(+e.key - 1); showCursor = true; return; }
        if (e.key === ' ' || e.key === 'Enter') { showCursor = true; place(cursor.c, cursor.r); return; }
        if (e.key === 'x' || e.key === 'X' || e.key === 'Backspace') { showCursor = true; dig(cursor.c, cursor.r); }
      });

      // ---------- render ----------
      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const pad = 8, mower = Math.max(14, w * 0.045);
        L.barH = Math.max(46, Math.min(58, h * 0.11));
        L.cw = (w - pad * 2 - mower) / COLS;
        L.lh = Math.min(L.cw * 1.55, (h - L.barH - pad * 3) / ROWS);
        L.ox = pad + mower; L.oy = L.barY + L.barH + pad + Math.max(0, (h - L.barH - pad * 3 - L.lh * ROWS) * 0.12);
        const { cw, lh, ox, oy } = L, s = Math.min(cw, lh);
        // top bar: sun, cards, wave
        ctx.fillStyle = col.dark ? '#2b2621' : '#f6efe3';
        D.roundRect(ctx, pad, L.barY, w - pad * 2, L.barH, 14); ctx.fill();
        const by = L.barY + L.barH / 2;
        sunIcon(ctx, pad + 18, by - 7, 8, t * 0.5);
        D.text(ctx, String(sun), pad + 18, by + 14, 12.5, col.ink, 780);
        const cardW = Math.min(52, (w - pad * 2 - 44 - 64) / 4 - 5), cardH = L.barH - 10;
        L.cards = [];
        PLANTS.forEach((def, i) => {
          const x = pad + 40 + i * (cardW + 5), y = L.barY + 5;
          L.cards.push({ x, y, w: cardW, h: cardH });
          const ready = cds[i] <= 0, afford = sun >= def.cost;
          ctx.fillStyle = col.dark ? '#3a342d' : '#fffcf7';
          D.roundRect(ctx, x, y, cardW, cardH, 10); ctx.fill();
          ctx.globalAlpha = ready && afford ? 1 : 0.45;
          drawPlant(ctx, i, x + cardW / 2, y + cardH * 0.4, cardH * 0.62, col, 0, i === 2 ? 1 : 0);
          ctx.globalAlpha = 1;
          D.text(ctx, String(def.cost), x + cardW / 2, y + cardH - 8, 10.5, afford ? col.ink : col.bad, 750);
          if (!ready) {
            ctx.save(); D.roundRect(ctx, x, y, cardW, cardH, 10); ctx.clip();
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.45)' : 'rgba(60,50,40,0.22)';
            ctx.fillRect(x, y, cardW, cardH * (cds[i] / def.cd)); ctx.restore();
          }
          D.text(ctx, String(i + 1), x + 7, y + 8, 9, col.ink3, 700);
          if (picked === i) { ctx.strokeStyle = col.accent; ctx.lineWidth = 2.2; D.roundRect(ctx, x - 1, y - 1, cardW + 2, cardH + 2, 11); ctx.stroke(); }
        });
        const wx = w - pad - 10;
        D.text(ctx, wave.n ? `Wave ${wave.n}` : 'Get ready', wx, by - 8, 12, col.ink, 750, 'right');
        const sub = wave.phase === 'wait' ? `next in ${Math.ceil(Math.max(0, wave.spawnT))}s` : `${foes.length + wave.left} left`;
        D.text(ctx, sub, wx, by + 9, 10.5, col.ink2, 650, 'right');

        // lawn
        ctx.save();
        D.roundRect(ctx, pad, oy - 4, w - pad * 2, lh * ROWS + 8, 14); ctx.clip();
        ctx.fillStyle = col.dark ? '#26221d' : '#ebe2d3'; ctx.fillRect(pad, oy - 4, mower + 2, lh * ROWS + 8);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const a = (r + c) % 2;
          ctx.fillStyle = col.dark ? (a ? '#2a3322' : '#2f3926') : (a ? '#dfe8cc' : '#e7eed7');
          if (lostLane === r) ctx.fillStyle = col.dark ? (a ? '#4a2a2a' : '#532f2f') : (a ? '#f0d0c8' : '#f5dcd5');
          ctx.fillRect(ox + c * cw, oy + r * lh - (r === 0 ? 4 : 0), cw + 0.5, lh + 0.5 + (r === 0 || r === ROWS - 1 ? 4 : 0));
        }
        ctx.restore();
        // hover ghost / keyboard cursor
        const target = showCursor ? cursor : hover;
        if (target && state === 'play') {
          const x = ox + target.c * cw, y = oy + target.r * lh;
          ctx.strokeStyle = showCursor ? col.accent : (col.dark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.95)');
          ctx.lineWidth = 2; if (showCursor) ctx.setLineDash([4, 3]);
          D.roundRect(ctx, x + 2, y + 2, cw - 4, lh - 4, 8); ctx.stroke(); ctx.setLineDash([]);
          if (picked >= 0 && !plantAt(target.c, target.r)) { ctx.globalAlpha = 0.45; drawPlant(ctx, picked, x + cw / 2, y + lh * 0.5, s * 0.9, col, t, picked === 2 ? 1 : 0); ctx.globalAlpha = 1; }
        }
        // mowers
        mowers.forEach((m, r) => {
          if (m.gone) return;
          const x = m.on ? ox + m.x * cw : pad + mower / 2 + 1, y = oy + (r + 0.62) * lh, mw = Math.max(12, mower * 0.95);
          ctx.fillStyle = col.accent; D.roundRect(ctx, x - mw / 2, y - mw * 0.45, mw, mw * 0.6, 4); ctx.fill();
          ctx.fillStyle = col.dark ? '#151210' : '#3a332b';
          ctx.beginPath(); ctx.arc(x - mw * 0.28, y + mw * 0.2, mw * 0.16, 0, Math.PI * 2); ctx.arc(x + mw * 0.28, y + mw * 0.2, mw * 0.16, 0, Math.PI * 2); ctx.fill();
        });
        // plants, foes and seeds lane by lane so lower lanes overlap upper ones
        for (let r = 0; r < ROWS; r++) {
          plants.filter(p => p.r === r).forEach(p => {
            const extra = p.k === 0 ? p.kick : p.k === 1 ? p.kick : p.k === 2 ? p.hp / PLANTS[2].hp : Math.max(0.01, p.fuse / 0.9);
            drawPlant(ctx, p.k, ox + (p.c + 0.5) * cw, oy + (r + 0.48) * lh, s * 0.95, col, t, extra);
          });
          seeds.filter(q => q.r === r).forEach(q => {
            ctx.fillStyle = col.dark ? '#9fd27a' : '#79b552';
            ctx.beginPath(); ctx.arc(ox + q.x * cw, oy + (r + 0.4) * lh, Math.max(3, s * 0.08), 0, Math.PI * 2); ctx.fill();
          });
          foes.filter(f => f.r === r).sort((a, b) => b.x - a.x).forEach(f => {
            drawFoe(ctx, f, ox + f.x * cw, oy + (r + 0.5) * lh, s, col, state === 'play' ? t : endT * 0 + t);
            if (f.hp < (f.mhp || FOES[f.k].hp)) {
              const bw = s * 0.5, x = ox + f.x * cw - bw / 2, y = oy + (r + 0.08) * lh;
              ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'; D.roundRect(ctx, x, y, bw, 3, 1.5); ctx.fill();
              ctx.fillStyle = col.bad; D.roundRect(ctx, x, y, bw * Math.max(0, f.hp / (f.mhp || FOES[f.k].hp)), 3, 1.5); ctx.fill();
            }
          });
        }
        booms.forEach(b => {
          const k = b.t / (b.small ? 0.35 : 0.5);
          ctx.globalAlpha = 1 - k;
          D.spark(ctx, ox + b.c * cw, oy + b.r * lh, (b.small ? s * 0.3 : s * 1.3) * (0.4 + k), b.small ? col.ink3 : SUN_GOLD, k * 2);
          ctx.globalAlpha = 1;
        });
        suns.forEach(q => {
          let x = ox + q.x * cw, y = oy + q.y * lh;
          if (q.fly) { const k = D.ease.outCubic(Math.min(1, q.fly / 0.5)); x = D.lerp(x, pad + 18, k); y = D.lerp(y, by - 7, k); }
          const blink = !q.fly && q.life < 2.5 && Math.sin(t * 14) > 0.3 ? 0.35 : 1;
          ctx.globalAlpha = blink; sunIcon(ctx, x, y, Math.max(7, s * 0.2), t * 0.8); ctx.globalAlpha = 1;
        });
        if (state === 'lost') {
          const y = oy + (lostLane + 0.5) * lh, k = (Math.sin(endT * 8) + 1) / 2;
          ctx.strokeStyle = col.bad; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5 + k * 0.5;
          ctx.beginPath(); ctx.arc(pad + mower / 2 + 4, y, s * (0.5 + k * 0.15), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (banner) {
          const k = banner.t / 1.8;
          ctx.globalAlpha = Math.min(1, (1 - k) * 3, banner.t * 6);
          const bw = 168, bh = 34, bx = w / 2 - bw / 2, byy = oy + lh * ROWS / 2 - bh / 2;
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.94)' : 'rgba(255,252,247,0.95)';
          D.roundRect(ctx, bx, byy, bw, bh, bh / 2); ctx.fill();
          D.text(ctx, banner.text, w / 2, byy + bh / 2 + 1, 14, col.ink, 750);
          ctx.globalAlpha = 1;
        }
        if (!wave.n && state === 'play' && t < 12) {
          ctx.globalAlpha = Math.min(1, (12 - t) / 2);
          D.text(ctx, 'Plant Blooms first: they make sun', w / 2, Math.min(h - 10, oy + lh * ROWS + 16), 11.5, col.ink2, 650);
          ctx.globalAlpha = 1;
        }
      }

      api.loop(dt => {
        if (state === 'play') step(dt); else endT += dt;
        booms.forEach(b => { b.t += dt; }); booms = booms.filter(b => b.t < 0.5);
        if (banner) { banner.t += dt; if (banner.t > 1.8) banner = null; }
        render();
      });
      const self = Ludus.games.find(g => g.id === 'garden');
      self._sim = secs => { for (let i = 0; i < secs * 60 && state === 'play'; i++) step(1 / 60); };   // test helper: run the simulation faster than real time
      self._peek = () => ({ t, sun, wave, plants, foes, suns, mowers, cds, score, cleared, state, picked, cursor, L });
      return {
        save() {
          if (state !== 'play' || t < 2) return null;
          return {
            t, sun, score, cleared, skyT, wave: { ...wave }, cds,
            plants: plants.map(p => ({ c: p.c, r: p.r, k: p.k, hp: p.hp, timer: p.timer, fuse: p.fuse })),
            foes: foes.map(f => ({ k: f.k, r: f.r, x: f.x, hp: f.hp, mhp: f.mhp })),
            seeds: seeds.map(q => ({ r: q.r, x: q.x })),
            suns: suns.filter(q => !q.fly).map(q => ({ x: q.x, y: q.y, ty: q.ty, life: q.life })),
            mowers: mowers.map(m => ({ x: m.x, on: m.on, gone: m.gone }))
          };
        }
      };
    }
  });
})();
