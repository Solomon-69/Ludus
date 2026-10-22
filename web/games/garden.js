/* Garden Guard: plant a garden that holds five lanes against waves of creeping weed blobs.
   Positions are in cell units: x = column (0 = the house edge, COLS = far right), lanes 0..4.
   Easy mode is the classic game. Hard mode adds four plants, new weeds, crows, moles and lawn objects. */
(function () {
  const D = Ludus.draw;
  const COLS = 8, ROWS = 5;
  const PLANTS = [
    { name: 'Bloom', cost: 50, cd: 5, hp: 5 },
    { name: 'Sprout', cost: 100, cd: 6, hp: 5 },
    { name: 'Pebble', cost: 50, cd: 18, hp: 36 },
    { name: 'Pop pod', cost: 125, cd: 26, hp: 5 }
  ];
  // Hard mode only (indices 4..7): Frost slows, Twin fires two seeds, Thorn is a spiky wall, Mine blows up the first weed that steps on it.
  const HARD_PLANTS = [
    { name: 'Frost', cost: 150, cd: 8, hp: 5 },
    { name: 'Twin', cost: 200, cd: 8, hp: 5 },
    { name: 'Thorn', cost: 100, cd: 22, hp: 40 },
    { name: 'Mine', cost: 25, cd: 20, hp: 4 }
  ];
  const ALL_PLANTS = PLANTS.concat(HARD_PLANTS);
  const FOES = {
    blob: { hp: 10, sp: 1, r: 0.34 }, tough: { hp: 26, sp: 0.85, r: 0.38 }, quick: { hp: 7, sp: 1.8, r: 0.27 },
    runner: { hp: 12, sp: 2.4, r: 0.28 }, bucket: { hp: 48, sp: 0.8, r: 0.36 }, jumper: { hp: 16, sp: 1.6, r: 0.32 },
    mole: { hp: 12, sp: 1.1, r: 0.3 }, crow: { hp: 6, sp: 2.2, r: 0.26 }
  };
  const DIFF = [
    { sun: 200, sky: 7, speed: 0.15, first: 25, count: 0.8 },
    { sun: 150, sky: 9, speed: 0.18, first: 20, count: 1 },
    { sun: 100, sky: 11, speed: 0.21, first: 15, count: 1.25 }
  ];
  const HARD = { sun: 50, speed: 1.12, gap: 0.8, first: 0.8 };
  const SUN = 25, FIRE = 1.4, SEED_SPEED = 5, BLOOM_EVERY = 10, BITE = 1;
  const SLOW_T = 3, THORN = 1.2, PECK = 1.6, MINE_ARM = 8, MINE_HIT = 45, JUMP_T = 0.6, RISE_T = 1.2, FLOWER_EVERY = 14;
  const SUN_GOLD = '#e8b33a', MODE_KEY = 'ludus.garden.mode';

  function waveSize(n, k) { return Math.round((2 + n * 1.7) * k); }
  function foeFor(n, rnd) {
    const r = rnd();
    if (n >= 4 && r < Math.min(0.35, 0.08 * (n - 3))) return 'tough';
    if (n >= 3 && r > 1 - Math.min(0.3, 0.1 * (n - 2))) return 'quick';
    return 'blob';
  }
  function foeForHard(n, rnd) {
    const r = rnd();
    if (n >= 2 && r < 0.12) return 'crow';
    if (n >= 3 && r < 0.22) return 'mole';
    if (n >= 2 && r < 0.36) return 'runner';
    if (n >= 3 && r < 0.48) return 'jumper';
    if (n >= 3 && r < Math.min(0.66, 0.5 + 0.03 * n)) return 'bucket';
    if (n >= 4 && r > 0.9) return 'tough';
    return n >= 2 && r > 0.82 ? 'quick' : 'blob';
  }
  const plantsFor = m => (m === 'hard' ? ALL_PLANTS : PLANTS);
  const cardExtra = k => (k === 2 || k === 6 || k === 7 ? 1 : 0);

  function sunIcon(ctx, x, y, r, t) {
    D.spark(ctx, x, y, r * 1.35, SUN_GOLD, t || 0);
    ctx.fillStyle = '#f6d36b'; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  function shooterHead(ctx, s, kick, head, nozzles, c) {
    ctx.fillStyle = head; ctx.beginPath(); ctx.arc(-kick, -s * 0.08, s * 0.24, 0, Math.PI * 2); ctx.fill();
    nozzles.forEach(dy => { D.roundRect(ctx, s * 0.08 - kick, -s * 0.17 + dy, s * 0.3, s * 0.18, s * 0.08); ctx.fill(); });
    ctx.fillStyle = c.dark ? '#24301d' : '#2f4a27';
    nozzles.forEach(dy => { ctx.beginPath(); ctx.arc(s * 0.37 - kick, -s * 0.08 + dy, s * 0.06, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(s * 0.02 - kick, -s * 0.16, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(s * 0.04 - kick, -s * 0.16, s * 0.03, 0, Math.PI * 2); ctx.fill();
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
    } else if (k === 1 || k === 4 || k === 5) { // sprout shooter, frost shooter, twin shooter
      ctx.fillStyle = stem; ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.42);
      ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(-s * 0.16, s * 0.3, s * 0.16, s * 0.06, 0.5, 0, Math.PI * 2); ctx.fill();
      const kick = extra > 0 ? extra * s * 0.05 : 0;
      if (k === 4) {
        shooterHead(ctx, s, kick, c.dark ? '#6aa6d0' : '#7fb8de', [0], c);
        ctx.strokeStyle = '#fffaf2'; ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.55, x0 = -kick + Math.cos(a) * s * 0.2, y0 = -s * 0.08 + Math.sin(a) * s * 0.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * s * 0.12, y0 + Math.sin(a) * s * 0.12); ctx.stroke(); }
      } else if (k === 5) {
        shooterHead(ctx, s, kick, c.dark ? '#4f8a43' : '#3f7d39', [-s * 0.09, s * 0.11], c);
      } else shooterHead(ctx, s, kick, leaf, [0], c);
    } else if (k === 2) { // pebble wall
      ctx.fillStyle = c.dark ? '#8c8273' : '#b9ab95';
      D.roundRect(ctx, -s * 0.28, -s * 0.36, s * 0.56, s * 0.78, s * 0.24); ctx.fill();
      ctx.fillStyle = c.dark ? '#a39886' : '#cfc2ad';
      D.roundRect(ctx, -s * 0.2, -s * 0.3, s * 0.22, s * 0.3, s * 0.1); ctx.fill();
      if (extra < 0.66) { ctx.strokeStyle = c.dark ? '#4c463e' : '#7d705e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.36); ctx.lineTo(s * 0.06, -s * 0.12); ctx.lineTo(-s * 0.04, s * 0.05); ctx.stroke(); }
      if (extra < 0.33) { ctx.beginPath(); ctx.moveTo(s * 0.28, s * 0.05); ctx.lineTo(s * 0.08, s * 0.16); ctx.lineTo(s * 0.12, s * 0.38); ctx.stroke(); }
      ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(-s * 0.08, -s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.arc(s * 0.1, -s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.fill();
    } else if (k === 3) { // pop pod
      const pulse = extra > 0 ? 1 + Math.sin(t * 30) * 0.06 + (1 - extra) * 0.25 : 1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = c.dark ? '#c25a4a' : '#cf5f4c'; ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.04, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = stem; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -s * 0.22); ctx.quadraticCurveTo(s * 0.08, -s * 0.36, s * 0.16, -s * 0.38); ctx.stroke();
      if (extra > 0) D.spark(ctx, s * 0.17, -s * 0.39, s * 0.09, SUN_GOLD, t * 8);
    } else if (k === 6) { // thorn: a spiky cactus wall that hurts whoever bites it
      const body = c.dark ? '#5f9a52' : '#4f8f45';
      ctx.strokeStyle = c.dark ? '#e9e1c9' : '#f4ecd6'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) { const yy = -s * 0.32 + i * s * 0.11, side = i % 2 ? 1 : -1; ctx.beginPath(); ctx.moveTo(side * s * 0.2, yy); ctx.lineTo(side * s * 0.32, yy - s * 0.04); ctx.stroke(); }
      ctx.fillStyle = body; D.roundRect(ctx, -s * 0.22, -s * 0.4, s * 0.44, s * 0.82, s * 0.2); ctx.fill();
      ctx.fillStyle = c.dark ? '#74b066' : '#64a457'; D.roundRect(ctx, -s * 0.12, -s * 0.34, s * 0.08, s * 0.66, s * 0.04); ctx.fill();
      if (extra < 0.5) { ctx.strokeStyle = c.dark ? '#2f4a27' : '#2f5a28'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s * 0.18, -s * 0.2); ctx.lineTo(s * 0.04, -s * 0.05); ctx.lineTo(s * 0.12, s * 0.12); ctx.stroke(); }
      ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.14, s * 0.035, 0, Math.PI * 2); ctx.arc(s * 0.09, -s * 0.14, s * 0.035, 0, Math.PI * 2); ctx.fill();
    } else { // mine: buried until armed, then a red cap with a blinking light
      ctx.fillStyle = c.dark ? '#5a4632' : '#9b7a55';
      ctx.beginPath(); ctx.ellipse(0, s * 0.3, s * 0.3, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      if (extra >= 1) {
        ctx.fillStyle = c.dark ? '#b8483c' : '#c9503f';
        ctx.beginPath(); ctx.arc(0, s * 0.26, s * 0.2, Math.PI, 0); ctx.fill();
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ffd76a' : '#7a3a30';
        ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.06, 0, Math.PI * 2); ctx.fill();
      } else {
        const g = s * 0.1 + extra * s * 0.1;
        ctx.strokeStyle = stem; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, s * 0.28); ctx.lineTo(0, s * 0.28 - g); ctx.stroke();
        ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(s * 0.06, s * 0.28 - g, s * 0.07, s * 0.035, -0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawCrow(ctx, f, x, y, s, c, t) {
    const r = FOES.crow.r * s, fly = f.flying !== false;
    const lift = fly ? s * 0.42 + Math.sin(t * 6 + f.seed) * s * 0.05 : s * 0.36;
    ctx.save(); ctx.translate(x, y - lift);
    if (fly) { ctx.fillStyle = c.dark ? 'rgba(0,0,0,0.3)' : 'rgba(60,70,40,0.16)'; ctx.beginPath(); ctx.ellipse(0, lift + r * 0.9, r * 0.8, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
    const ink = f.hit > 0 ? '#fffaf2' : (c.dark ? '#55505e' : '#2f2b33'), wing = c.dark ? '#6d6779' : '#4a4452';
    const flap = fly ? Math.sin(t * 14 + f.seed) : -0.3, peck = !fly && f.eating ? Math.abs(Math.sin(t * 9)) * r * 0.35 : 0;
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.moveTo(r * 0.8, 0); ctx.lineTo(r * 1.6, -r * 0.3); ctx.lineTo(r * 1.6, r * 0.25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.85, -r * 0.35 + peck, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8a33a';
    ctx.beginPath(); ctx.moveTo(-r * 1.25, -r * 0.48 + peck); ctx.lineTo(-r * 1.8, -r * 0.28 + peck); ctx.lineTo(-r * 1.25, -r * 0.16 + peck); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(-r * 0.95, -r * 0.48 + peck, r * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.arc(-r * 1.0, -r * 0.47 + peck, r * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = wing;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.15); ctx.lineTo(r * 0.95, -r * 0.2 - flap * r * 1.1); ctx.lineTo(r * 0.6, r * 0.25); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawFoe(ctx, f, x, y, s, c, t) {
    if (f.k === 'crow') { drawCrow(ctx, f, x, y, s, c, t); return; }
    const def = FOES[f.k], r = def.r * s;
    const fast = f.k === 'quick' || f.k === 'runner';
    let hop = fast && !f.eating ? Math.abs(Math.sin(t * (f.k === 'runner' ? 10 : 7) + f.seed)) * s * 0.14 : 0;
    if (f.jump > 0) hop = Math.sin((1 - f.jump / JUMP_T) * Math.PI) * s * 0.75;
    const wob = Math.sin(t * (f.eating ? 12 : 5) + f.seed) * 0.07;
    const rise = f.rise > 0 ? Math.min(1, f.rise / RISE_T) : 0;
    ctx.save(); ctx.translate(x, y - hop);
    if (rise > 0) { // a mole still digging up: only the part above the dirt shows
      ctx.fillStyle = c.dark ? '#4e3d2c' : '#a07e58';
      ctx.beginPath(); ctx.ellipse(0, r * 0.85, r * 1.2, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.rect(-r * 2, -r * 3, r * 4, r * 3.75); ctx.clip();
      ctx.translate(0, rise * r * 2);
    } else {
      ctx.fillStyle = c.dark ? 'rgba(0,0,0,0.3)' : 'rgba(60,70,40,0.18)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.95 + hop, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (f.k === 'jumper' && !f.jumped) { // vaulting pole held out front
      ctx.strokeStyle = c.dark ? '#c9a46e' : '#9a6b3a'; ctx.lineWidth = Math.max(2, s * 0.04); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.5, r * 0.3); ctx.lineTo(-r * 1.9, -r * 0.7); ctx.stroke();
    }
    ctx.scale(1 + wob, 1 - wob);
    const body = {
      tough: c.dark ? '#6e5a86' : '#7d6799', quick: c.dark ? '#7f9b4d' : '#8fae55', runner: c.dark ? '#c47c45' : '#d98b4a',
      jumper: c.dark ? '#4f8f8c' : '#5aa3a0', mole: c.dark ? '#7a5d45' : '#8a6a4f'
    }[f.k] || (c.dark ? '#8a77a8' : '#a08cc2');
    ctx.beginPath();
    if (f.k === 'tough') {
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * 1.12 : r * 0.92; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath();
    } else {
      ctx.moveTo(-r, r * 0.6);
      ctx.bezierCurveTo(-r * 1.1, -r * 0.9, r * 1.1, -r * 0.9, r, r * 0.6);
      ctx.quadraticCurveTo(0, r * 1.05, -r, r * 0.6);
    }
    ctx.fillStyle = f.hit > 0 ? '#fffaf2' : body; ctx.fill();
    if (f.slow > 0) { ctx.fillStyle = 'rgba(150,205,245,0.5)'; ctx.fill(); }
    if (f.k !== 'tough' && f.k !== 'mole') {
      ctx.strokeStyle = body; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.6); ctx.quadraticCurveTo(r * 0.3, -r * 1.1, r * 0.55, -r * 1.05); ctx.stroke();
    }
    // eyes look left toward the house
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.arc(r * 0.05, -r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2722';
    ctx.beginPath(); ctx.arc(-r * 0.45, -r * 0.08, r * 0.09, 0, Math.PI * 2); ctx.arc(-r * 0.02, -r * 0.08, r * 0.09, 0, Math.PI * 2); ctx.fill();
    if (f.k === 'mole') { ctx.fillStyle = '#e99a9a'; ctx.beginPath(); ctx.arc(-r * 0.75, r * 0.12, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
    if (f.k === 'runner') { ctx.strokeStyle = '#d6453a'; ctx.lineWidth = Math.max(2, r * 0.16); ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.42); ctx.lineTo(r * 0.75, -r * 0.42); ctx.stroke(); }
    if (f.k === 'bucket' && f.hp > (f.mhp || def.hp) * 0.35) { // tin bucket helmet, lost when badly hurt
      ctx.fillStyle = c.dark ? '#8f979e' : '#a7b0b8';
      ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.4); ctx.lineTo(r * 0.75, -r * 0.4); ctx.lineTo(r * 0.55, -r * 1.2); ctx.lineTo(-r * 0.55, -r * 1.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.dark ? '#6c737a' : '#7f878f'; ctx.fillRect(-r * 0.8, -r * 0.5, r * 1.6, r * 0.14);
    }
    if (f.eating) { ctx.fillStyle = '#2b2722'; ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 0.35, r * 0.18, r * (0.06 + Math.abs(Math.sin(t * 12)) * 0.1), 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawObject(ctx, o, x, y, s, c, t) {
    ctx.save(); ctx.translate(x, y);
    if (o.k === 'rock') {
      ctx.fillStyle = c.dark ? '#6f6a63' : '#a59d92';
      ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 0.18, s * 0.3, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.dark ? '#86807a' : '#bdb5a9';
      ctx.beginPath(); ctx.ellipse(s * 0.16, s * 0.24, s * 0.18, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(-s * 0.18, s * 0.1, s * 0.1, s * 0.05, -0.3, 0, Math.PI * 2); ctx.fill();
    } else if (o.k === 'grave') {
      ctx.fillStyle = c.dark ? '#4e3d2c' : '#a07e58';
      ctx.beginPath(); ctx.ellipse(0, s * 0.36, s * 0.32, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.dark ? '#7d7f86' : '#a9abb2';
      ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.36); ctx.lineTo(-s * 0.22, -s * 0.12); ctx.arc(0, -s * 0.12, s * 0.22, Math.PI, 0); ctx.lineTo(s * 0.22, s * 0.36); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.dark ? '#55575e' : '#7c7e86'; ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.22); ctx.lineTo(0, s * 0.1); ctx.moveTo(-s * 0.1, -s * 0.1); ctx.lineTo(s * 0.1, -s * 0.1); ctx.stroke();
    } else { // flower patch: drops a sun now and then
      const ready = o.timer < 1.2;
      [[-0.18, 0.18], [0.16, 0.12], [0, 0.32]].forEach(([dx, dy], i) => {
        ctx.strokeStyle = c.dark ? '#4f7f43' : '#4a8040'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(dx * s, dy * s); ctx.lineTo(dx * s, (dy + 0.14) * s); ctx.stroke();
        ctx.fillStyle = i === 1 ? '#fffaf2' : '#f29bb7';
        for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(dx * s + Math.cos(a) * s * 0.07, dy * s + Math.sin(a) * s * 0.07, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = SUN_GOLD; ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.045, 0, Math.PI * 2); ctx.fill();
      });
      if (ready) D.spark(ctx, 0, s * 0.05, s * 0.12, SUN_GOLD, t * 4);
    }
    ctx.restore();
  }

  Ludus.register({
    id: 'garden', name: 'Plants vs. Zombies', aka: 'Garden Guard', tag: 'Arcade', tint: '#6f9a4a',
    hint: 'Click a card, then a tile · click suns · right-click digs up · Easy / Hard pill: Hard adds new plants, weeds, crows and moles · <kbd>←↑→↓</kbd> move, <kbd>1</kbd>-<kbd>8</kbd> pick, <kbd>Space</kbd> plant, <kbd>X</kbd> dig, <kbd>M</kbd> mode',
    _rules: { waveSize, foeFor, foeForHard, PLANTS, HARD_PLANTS, FOES, DIFF, HARD },
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
      let t, sun, wave, plants, foes, seeds, suns, mowers, cds, score, cleared, skyT, state, picked, cursor, showCursor, booms, banner, lostLane, endT, hover, objects;
      let mode = 'easy';
      try { if (localStorage.getItem(MODE_KEY) === 'hard') mode = 'hard'; } catch (e) {}
      let PL = plantsFor(mode);
      const L = { ox: 0, oy: 0, cw: 40, lh: 56, cards: [], modes: [], barY: 6, barH: 52 };
      const rnd = Math.random;
      const hard = () => mode === 'hard';
      const speedK = () => cfg.speed * (hard() ? HARD.speed : 1);

      function makeObjects() {
        const out = [], used = new Set();
        const add = (k, c0, c1) => {
          for (let i = 0; i < 30; i++) {
            const c = c0 + Math.floor(rnd() * (c1 - c0 + 1)), r = Math.floor(rnd() * ROWS);
            if (used.has(c + ',' + r)) continue;
            used.add(c + ',' + r); out.push({ k, c, r, timer: k === 'flower' ? FLOWER_EVERY * (0.4 + rnd() * 0.6) : 0 }); return;
          }
        };
        add('grave', 4, 7); add('grave', 4, 7); add('rock', 2, 7); add('rock', 2, 7); add('flower', 1, 5);
        return out;
      }
      function fresh() {
        PL = plantsFor(mode);
        t = 0; sun = cfg.sun + (hard() ? HARD.sun : 0); score = 0; cleared = 0; skyT = 4;
        wave = { n: 0, left: 0, spawnT: cfg.first * (hard() ? HARD.first : 1), phase: 'wait' };
        plants = []; foes = []; seeds = []; suns = [];
        objects = hard() ? makeObjects() : [];
        mowers = Array.from({ length: ROWS }, () => ({ x: -0.45, on: false, gone: false }));
        cds = PL.map((p, i) => (i === 2 || i === 3 || i >= 6 ? p.cd * 0.5 : 0));
      }
      function restore(s) {
        if (!s || !Array.isArray(s.plants) || !Array.isArray(s.foes) || !Array.isArray(s.mowers) || s.mowers.length !== ROWS || !s.wave) return false;
        const m = s.mode === 'hard' ? 'hard' : 'easy', pl = plantsFor(m);
        const okCell = p => Number.isInteger(p.c) && Number.isInteger(p.r) && p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS;
        if (!s.plants.every(p => okCell(p) && pl[p.k]) || !s.foes.every(f => FOES[f.k] && f.r >= 0 && f.r < ROWS && isFinite(f.x))) return false;
        mode = m; PL = pl;
        t = +s.t || 0; sun = Math.max(0, s.sun | 0); score = s.score | 0; cleared = s.cleared | 0; skyT = +s.skyT || 5;
        wave = { n: s.wave.n | 0, left: s.wave.left | 0, spawnT: +s.wave.spawnT || 0, phase: ['wait', 'spawn', 'clear'].includes(s.wave.phase) ? s.wave.phase : 'wait' };
        plants = s.plants.map(p => ({ c: p.c, r: p.r, k: p.k, hp: +p.hp || PL[p.k].hp, timer: +p.timer || 0, fuse: +p.fuse || 0, arm: +p.arm || 0, kick: 0 }));
        foes = s.foes.map(f => ({ k: f.k, r: f.r | 0, x: +f.x, hp: +f.hp || FOES[f.k].hp, mhp: +f.mhp || FOES[f.k].hp, seed: rnd() * 6, hit: 0, eating: false, slow: +f.slow || 0, rise: +f.rise || 0, jumped: !!f.jumped, jump: 0, flying: f.k === 'crow' ? f.flying !== false : false }));
        seeds = Array.isArray(s.seeds) ? s.seeds.filter(q => isFinite(q.x)).map(q => ({ r: q.r | 0, x: +q.x, ice: !!q.ice })) : [];
        suns = Array.isArray(s.suns) ? s.suns.filter(q => isFinite(q.x) && isFinite(q.y)).map(q => ({ x: +q.x, y: +q.y, ty: +q.ty, life: +q.life, fly: 0 })) : [];
        mowers = s.mowers.map(mw => ({ x: isFinite(mw.x) ? +mw.x : -0.45, on: !!mw.on, gone: !!mw.gone }));
        objects = Array.isArray(s.objects) ? s.objects.filter(o => okCell(o) && ['rock', 'grave', 'flower'].includes(o.k)).map(o => ({ k: o.k, c: o.c, r: o.r, timer: +o.timer || 0 })) : [];
        cds = Array.isArray(s.cds) && s.cds.length === PL.length ? s.cds.map(v => Math.max(0, +v || 0)) : PL.map(() => 0);
        return true;
      }
      if (!restore(api.saved)) fresh();
      state = 'play'; picked = -1; cursor = { c: 1, r: 2 }; showCursor = false; booms = []; banner = null; lostLane = -1; endT = 0; hover = null;
      api.score(score);

      const plantAt = (c, r) => plants.find(p => p.c === c && p.r === r);
      const objectAt = (c, r) => objects.find(o => o.c === c && o.r === r);
      function place(c, r) {
        if (state !== 'play' || picked < 0) return;
        const def = PL[picked];
        if (plantAt(c, r)) { api.sfx('tick'); return; }
        const o = objectAt(c, r);
        if (o) { api.toast(o.k === 'flower' ? 'Leave the flowers: they drop sun' : `A ${o.k} is in the way. Pop pods clear it`); api.sfx('tick'); return; }
        if (cds[picked] > 0) { api.toast(`${def.name} is still growing`); return; }
        if (sun < def.cost) { api.toast(`Need ${def.cost} sun`); api.sfx('tick'); return; }
        sun -= def.cost; cds[picked] = def.cd;
        plants.push({ c, r, k: picked, hp: def.hp, timer: picked === 0 ? BLOOM_EVERY * 0.5 : 0, fuse: picked === 3 ? 0.9 : 0, arm: picked === 7 ? MINE_ARM : 0, kick: 0 });
        api.sfx('drop'); picked = -1;
      }
      function dig(c, r) {
        const p = plantAt(c, r);
        if (!p || state !== 'play') return;
        plants = plants.filter(q => q !== p); api.sfx('move');
      }
      function pick(i) {
        if (state !== 'play' || i >= PL.length) return;
        picked = picked === i ? -1 : i; api.sfx('click');
      }
      function setMode(m) {
        if (state !== 'play' || m === mode) return;
        mode = m;
        try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
        fresh(); picked = -1; booms = []; api.score(score); api.sfx('power');
        banner = { text: m === 'hard' ? 'Hard mode' : 'Easy mode', t: 0 };
        if (m === 'hard') api.toast('New plants, weeds, crows and moles');
      }
      // mid-game a switch would wipe the garden, so it needs a second press within 3 seconds
      let armT = -1, armM = null;
      function askMode(m) {
        if (state !== 'play' || m === mode) return;
        if (!wave.n || (armM === m && t - armT < 3)) { armM = null; setMode(m); return; }
        armM = m; armT = t; api.sfx('tick');
        api.toast(`Press again to restart in ${m === 'hard' ? 'Hard' : 'Easy'} mode`);
      }
      function collect(s) { if (s.fly) return; s.fly = 0.001; sun += SUN; api.sfx('tap'); }

      // ---------- simulation ----------
      const hittable = f => f.hp > 0 && !f.flying && !(f.rise > 0);
      function spawnFoe() {
        const k = hard() ? foeForHard(wave.n, rnd) : foeFor(wave.n, rnd);
        const hp = FOES[k].hp * (hard() ? 1 + Math.max(0, wave.n - 2) * 0.14 : 1 + Math.max(0, wave.n - 3) * 0.1);
        const f = { k, r: Math.floor(rnd() * ROWS), x: COLS + 0.4, hp, mhp: hp, seed: rnd() * 6, hit: 0, eating: false, slow: 0, rise: 0, jumped: false, jump: 0, flying: k === 'crow' };
        if (k === 'mole') { // moles dig up from a grave, or from open lawn behind the front line
          const graves = objects.filter(o => o.k === 'grave');
          const g = graves.length ? graves[Math.floor(rnd() * graves.length)] : { c: 3 + Math.floor(rnd() * 4), r: f.r };
          f.r = g.r; f.x = g.c + 0.5; f.rise = RISE_T;
        }
        foes.push(f);
      }
      function waves(dt) {
        wave.spawnT -= dt;
        if (wave.phase === 'wait' && wave.spawnT <= 0) {
          wave.n++; wave.left = hard() ? Math.round((3 + wave.n * 2) * cfg.count) : waveSize(wave.n, cfg.count); wave.phase = 'spawn'; wave.spawnT = 0.5;
          banner = { text: `Wave ${wave.n}`, t: 0 }; api.sfx('power');
        } else if (wave.phase === 'spawn' && wave.spawnT <= 0) {
          spawnFoe(); wave.left--;
          wave.spawnT = Math.max(1.4, 5.5 - wave.n * 0.35) * (0.6 + rnd() * 0.8) * (hard() ? HARD.gap : 1);
          if (wave.left <= 0) wave.phase = 'clear';
        } else if (wave.phase === 'clear' && !foes.length) {
          score += 100; api.score(score);
          wave.phase = 'wait'; wave.spawnT = 8;
          banner = { text: `Wave ${wave.n} cleared`, t: 0 }; api.sfx('score');
        }
      }
      function explode(p, reach, dmg, lanes) {
        booms.push({ c: p.c + 0.5, r: p.r + 0.5, t: 0, mid: lanes === 0 }); api.sfx('boom');
        foes.forEach(f => { if (Math.abs(f.r - p.r) <= lanes && Math.abs(f.x - (p.c + 0.5)) <= reach && !(f.rise > 0)) f.hp -= dmg; });
      }
      function plantStep(p, dt) {
        p.kick = Math.max(0, p.kick - dt * 5);
        if (p.k === 0) { p.timer -= dt; if (p.timer <= 0) { p.timer = BLOOM_EVERY; p.kick = 1; suns.push({ x: p.c + 0.5 + (rnd() - 0.5) * 0.4, y: p.r + 0.2, ty: p.r + 0.55, life: 10, fly: 0 }); } }
        else if (p.k === 1 || p.k === 4 || p.k === 5) {
          p.timer -= dt;
          if (p.timer <= 0 && foes.some(f => f.r === p.r && hittable(f) && f.x > p.c + 0.3 && f.x < COLS + 0.2)) {
            p.timer = FIRE; p.kick = 1; seeds.push({ r: p.r, x: p.c + 0.85, ice: p.k === 4 });
            if (p.k === 5) seeds.push({ r: p.r, x: p.c + 0.55 });
          }
        } else if (p.k === 3) {
          p.fuse -= dt;
          if (p.fuse <= 0) {
            p.hp = 0; explode(p, 1.6, 30, 1);
            objects = objects.filter(o => o.k === 'flower' || Math.abs(o.r - p.r) > 1 || Math.abs(o.c + 0.5 - (p.c + 0.5)) > 1.6);
          }
        } else if (p.k === 7) {
          p.arm = Math.max(0, p.arm - dt);
          if (p.arm <= 0 && foes.some(f => f.r === p.r && hittable(f) && Math.abs(f.x - (p.c + 0.5)) < 0.55)) { p.hp = 0; explode(p, 1, MINE_HIT, 0); }
        }
      }
      function foeStep(f, dt) {
        f.hit = Math.max(0, f.hit - dt); f.slow = Math.max(0, (f.slow || 0) - dt);
        if (f.rise > 0) { f.rise -= dt; return; }
        const sp = speedK() * FOES[f.k].sp * (f.slow > 0 ? 0.5 : 1) * (f.k === 'jumper' && f.jumped ? 0.6 : 1);
        if (f.k === 'crow') { // flies over the lane, lands on the first plant it reaches and pecks it
          const under = plants.find(p => p.r === f.r && p.hp > 0 && Math.abs(p.c + 0.5 - f.x) < 0.15);
          if (f.flying) { f.x -= sp * dt; if (under) { f.flying = false; f.x = under.c + 0.5; } if (f.x < -0.6) { f.hp = 0; f.gone = true; } }
          else if (under) { under.hp -= PECK * dt; f.eating = true; }
          else { f.flying = true; f.eating = false; f.x -= 0.2; }
          return;
        }
        if (f.jump > 0) { f.jump -= dt; f.x -= f.jd * dt / JUMP_T; return; }
        const target = plants.find(p => p.r === f.r && p.hp > 0 && f.x > p.c + 0.45 && f.x < p.c + 1.25);
        if (target && f.k === 'jumper' && !f.jumped) { f.jumped = true; f.jump = JUMP_T; f.jd = f.x - (target.c + 0.3); return; }
        f.eating = !!target;
        if (target) {
          target.hp -= BITE * dt * (f.k === 'tough' || f.k === 'bucket' ? 1.5 : 1);
          if (target.k === 6) f.hp -= THORN * dt;
        } else f.x -= sp * dt;
        if (f.x < 0.05) {
          const m = mowers[f.r];
          if (!m.on && !m.gone) { m.on = true; api.sfx('power'); }
          else if (m.gone && f.x < -0.3) lose(f);
        }
      }
      function step(dt) {
        t += dt;
        cds = cds.map(v => Math.max(0, v - dt));
        // sky suns
        skyT -= dt;
        if (skyT <= 0) { skyT = cfg.sky * (0.8 + rnd() * 0.4); suns.push({ x: 0.6 + rnd() * (COLS - 1.2), y: -0.6, ty: 0.4 + rnd() * (ROWS - 0.8), life: 10, fly: 0 }); }
        objects.forEach(o => { if (o.k !== 'flower') return; o.timer -= dt; if (o.timer <= 0) { o.timer = FLOWER_EVERY; suns.push({ x: o.c + 0.5, y: o.r + 0.2, ty: o.r + 0.5, life: 10, fly: 0 }); } });
        suns.forEach(s => { if (s.fly) s.fly += dt; else { if (s.y < s.ty) s.y = Math.min(s.ty, s.y + dt * 1.2); else s.life -= dt; } });
        suns = suns.filter(s => (s.fly ? s.fly < 0.5 : s.life > 0));
        if (showCursor) suns.forEach(s => { if (!s.fly && Math.floor(s.x) === cursor.c && Math.floor(s.y) === cursor.r) collect(s); });
        waves(dt);
        plants.forEach(p => plantStep(p, dt));
        // seeds
        seeds.forEach(s => {
          s.x += SEED_SPEED * dt;
          const f = foes.find(o => o.r === s.r && hittable(o) && Math.abs(o.x - s.x) < FOES[o.k].r + 0.08);
          if (f) { f.hp -= 1; f.hit = 0.08; if (s.ice) f.slow = SLOW_T; s.dead = true; api.sfx('tick'); }
        });
        seeds = seeds.filter(s => !s.dead && s.x < COLS + 0.6);
        foes.forEach(f => foeStep(f, dt));
        plants = plants.filter(p => p.hp > 0);
        mowers.forEach((m, r) => {
          if (!m.on) return;
          m.x += 6 * dt;
          foes.forEach(f => { if (f.r === r && f.x <= m.x + 0.4 && f.hp > 0 && !f.flying) { f.hp = 0; f.mowed = true; } });
          if (m.x > COLS + 0.6) { m.on = false; m.gone = true; }
        });
        let killed = 0;
        foes = foes.filter(f => {
          if (f.hp > 0) return true;
          if (!f.gone) { killed++; booms.push({ c: f.x, r: f.r + 0.5, t: 0, small: true }); }
          return false;
        });
        if (killed) { cleared += killed; score += killed * 10; api.score(score); api.sfx('merge'); }
      }
      function lose(f) {
        if (state !== 'play') return;
        state = 'lost'; lostLane = f.r; endT = 0; api.sfx('lose');
        api.timeout(() => api.over({ score, title: 'The weeds got in', message: `Survived ${Math.max(0, wave.n - 1)} wave${wave.n === 2 ? '' : 's'} · ${cleared} cleared${hard() ? ' · Hard' : ''}` }), 650);
      }

      // ---------- input ----------
      const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const cellOf = p => {
        const c = Math.floor((p.x - L.ox) / L.cw), r = Math.floor((p.y - L.oy) / L.lh);
        return c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
      };
      const inBox = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      api.on(canvas, 'contextmenu', e => e.preventDefault());
      api.on(canvas, 'pointermove', e => { hover = cellOf(local(e)); });
      api.on(canvas, 'pointerleave', () => { hover = null; });
      api.on(canvas, 'pointerdown', e => {
        if (state !== 'play') return;
        const p = local(e); showCursor = false;
        // suns first: they sit above the lawn (and above the mode pill while falling)
        const s = suns.find(q => !q.fly && Math.hypot(L.ox + q.x * L.cw - p.x, L.oy + q.y * L.lh - p.y) < Math.max(18, L.cw * 0.45));
        if (s && e.button === 0) { collect(s); return; }
        const mb = L.modes.find(b => inBox(b, p));
        if (mb) { askMode(mb.m); return; }
        const card = L.cards.findIndex(b => inBox(b, p));
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
        if (/^[1-8]$/.test(e.key)) { if (+e.key <= PL.length) { pick(+e.key - 1); showCursor = true; } return; }
        if (e.key === 'm' || e.key === 'M') { askMode(hard() ? 'easy' : 'hard'); return; }
        if (e.key === ' ' || e.key === 'Enter') { showCursor = true; place(cursor.c, cursor.r); return; }
        if (e.key === 'x' || e.key === 'X' || e.key === 'Backspace') { showCursor = true; dig(cursor.c, cursor.r); }
      });

      // ---------- render ----------
      const plantExtra = p => (p.k === 2 || p.k === 6 ? p.hp / PL[p.k].hp : p.k === 3 ? Math.max(0.01, p.fuse / 0.9) : p.k === 7 ? 1 - p.arm / MINE_ARM : p.kick);
      function drawBar(col, w, pad) {
        ctx.fillStyle = col.dark ? '#2b2621' : '#f6efe3';
        D.roundRect(ctx, pad, L.barY, w - pad * 2, L.barH, 14); ctx.fill();
        const by = L.barY + L.barH / 2;
        sunIcon(ctx, pad + 18, by - 7, 8, t * 0.5);
        D.fitText(ctx, String(sun), pad + 18, by + 14, 32, 12.5, col.ink, 780, 10);
        const n = PL.length, cardW = Math.min(52, (w - pad * 2 - 44 - 6) / n - 5), cardH = L.barH - 10;
        L.cards = [];
        PL.forEach((def, i) => {
          const x = pad + 40 + i * (cardW + 5), y = L.barY + 5;
          L.cards.push({ x, y, w: cardW, h: cardH });
          const ready = cds[i] <= 0, afford = sun >= def.cost;
          ctx.fillStyle = col.dark ? '#3a342d' : '#fffcf7';
          D.roundRect(ctx, x, y, cardW, cardH, Math.min(10, cardW * 0.25)); ctx.fill();
          ctx.globalAlpha = ready && afford ? 1 : 0.45;
          drawPlant(ctx, i, x + cardW / 2, y + cardH * 0.4, Math.min(cardH * 0.62, cardW * 0.95), col, 0, cardExtra(i));
          ctx.globalAlpha = 1;
          D.fitText(ctx, String(def.cost), x + cardW / 2, y + cardH - 8, cardW - 4, 10.5, afford ? col.ink : col.bad, 750, 8.5);
          if (!ready) {
            ctx.save(); D.roundRect(ctx, x, y, cardW, cardH, Math.min(10, cardW * 0.25)); ctx.clip();
            ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.45)' : 'rgba(60,50,40,0.22)';
            ctx.fillRect(x, y, cardW, cardH * (cds[i] / def.cd)); ctx.restore();
          }
          D.fitText(ctx, String(i + 1), x + 7, y + 8, 10, 9, col.ink3, 700, 8);
          if (picked === i) { ctx.strokeStyle = col.accent; ctx.lineWidth = 2.2; D.roundRect(ctx, x - 1, y - 1, cardW + 2, cardH + 2, 11); ctx.stroke(); }
        });
        return by;
      }
      function drawStrip(col, w, pad, y, sh) {
        // Easy / Hard pill on the left, wave status filling the rest
        const segW = 50;
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(60,40,20,0.07)';
        D.roundRect(ctx, pad, y, segW * 2, sh, sh / 2); ctx.fill();
        L.modes = [];
        ['easy', 'hard'].forEach((m, i) => {
          const x = pad + i * segW, on = mode === m;
          L.modes.push({ x, y, w: segW, h: sh, m });
          if (on) { ctx.fillStyle = m === 'hard' ? col.bad : col.accent; D.roundRect(ctx, x + 2, y + 2, segW - 4, sh - 4, (sh - 4) / 2); ctx.fill(); }
          D.fitText(ctx, m === 'easy' ? 'Easy' : 'Hard', x + segW / 2, y + sh / 2 + 0.5, segW - 12, 11.5, on ? '#fffaf2' : col.ink2, 720, 9);
        });
        const left = pad + segW * 2 + 8, right = w - pad - 4;
        const head = wave.n ? `Wave ${wave.n}` : 'Get ready';
        const sub = wave.phase === 'wait' ? `next in ${Math.ceil(Math.max(0, wave.spawnT))}s` : `${foes.filter(f => !f.gone).length + wave.left} left`;
        D.fitText(ctx, `${head} · ${sub}`, (left + right) / 2, y + sh / 2 + 0.5, right - left, 12, col.ink, 720, 9.5);
      }
      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const pad = 8, mower = Math.max(14, w * 0.045), stripH = 22;
        L.barH = Math.max(46, Math.min(58, h * 0.11));
        const stripY = L.barY + L.barH + 5;
        L.cw = (w - pad * 2 - mower) / COLS;
        L.lh = Math.min(L.cw * 1.55, (h - L.barH - stripH - 5 - pad * 3) / ROWS);
        L.ox = pad + mower; L.oy = stripY + stripH + pad + Math.max(0, (h - L.barH - stripH - 5 - pad * 3 - L.lh * ROWS) * 0.12);
        const { cw, lh, ox, oy } = L, s = Math.min(cw, lh);
        const by = drawBar(col, w, pad);
        drawStrip(col, w, pad, stripY, stripH);

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
          if (picked >= 0 && !plantAt(target.c, target.r) && !objectAt(target.c, target.r)) { ctx.globalAlpha = 0.45; drawPlant(ctx, picked, x + cw / 2, y + lh * 0.5, s * 0.9, col, t, cardExtra(picked)); ctx.globalAlpha = 1; }
        }
        // mowers
        mowers.forEach((m, r) => {
          if (m.gone) return;
          const x = m.on ? ox + m.x * cw : pad + mower / 2 + 1, y = oy + (r + 0.62) * lh, mw = Math.max(12, mower * 0.95);
          ctx.fillStyle = col.accent; D.roundRect(ctx, x - mw / 2, y - mw * 0.45, mw, mw * 0.6, 4); ctx.fill();
          ctx.fillStyle = col.dark ? '#151210' : '#3a332b';
          ctx.beginPath(); ctx.arc(x - mw * 0.28, y + mw * 0.2, mw * 0.16, 0, Math.PI * 2); ctx.arc(x + mw * 0.28, y + mw * 0.2, mw * 0.16, 0, Math.PI * 2); ctx.fill();
        });
        // objects, plants, foes and seeds lane by lane so lower lanes overlap upper ones
        for (let r = 0; r < ROWS; r++) {
          objects.filter(o => o.r === r).forEach(o => drawObject(ctx, o, ox + (o.c + 0.5) * cw, oy + (r + 0.48) * lh, s * 0.95, col, t));
          plants.filter(p => p.r === r).forEach(p => drawPlant(ctx, p.k, ox + (p.c + 0.5) * cw, oy + (r + 0.48) * lh, s * 0.95, col, t, plantExtra(p)));
          seeds.filter(q => q.r === r).forEach(q => {
            ctx.fillStyle = q.ice ? (col.dark ? '#a6d4f2' : '#6fb0dc') : (col.dark ? '#9fd27a' : '#79b552');
            ctx.beginPath(); ctx.arc(ox + q.x * cw, oy + (r + 0.4) * lh, Math.max(3, s * 0.08), 0, Math.PI * 2); ctx.fill();
          });
          foes.filter(f => f.r === r).sort((a, b) => b.x - a.x).forEach(f => {
            drawFoe(ctx, f, ox + f.x * cw, oy + (r + 0.5) * lh, s, col, t);
            if (f.hp < (f.mhp || FOES[f.k].hp) && !(f.rise > 0)) {
              const bw = s * 0.5, x = ox + f.x * cw - bw / 2, y = oy + (r + (f.k === 'crow' ? 0.02 : 0.08)) * lh;
              ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'; D.roundRect(ctx, x, y, bw, 3, 1.5); ctx.fill();
              ctx.fillStyle = col.bad; D.roundRect(ctx, x, y, bw * Math.max(0, f.hp / (f.mhp || FOES[f.k].hp)), 3, 1.5); ctx.fill();
            }
          });
        }
        booms.forEach(b => {
          const k = b.t / (b.small ? 0.35 : 0.5);
          ctx.globalAlpha = 1 - k;
          D.spark(ctx, ox + b.c * cw, oy + b.r * lh, (b.small ? s * 0.3 : b.mid ? s * 0.8 : s * 1.3) * (0.4 + k), b.small ? col.ink3 : SUN_GOLD, k * 2);
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
          const bw = Math.min(190, w - 40), bh = 34, bx = w / 2 - bw / 2, byy = oy + lh * ROWS / 2 - bh / 2;
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.94)' : 'rgba(255,252,247,0.95)';
          D.roundRect(ctx, bx, byy, bw, bh, bh / 2); ctx.fill();
          D.fitText(ctx, banner.text, w / 2, byy + bh / 2 + 1, bw - 24, 14, col.ink, 750, 11);
          ctx.globalAlpha = 1;
        }
        if (!wave.n && state === 'play' && t < 12) {
          ctx.globalAlpha = Math.min(1, (12 - t) / 2);
          const tip = hard() ? 'Hard: rocks and graves block tiles, flowers drop sun' : 'Plant Blooms first: they make sun';
          D.fitText(ctx, tip, w / 2, Math.min(h - 10, oy + lh * ROWS + 16), w - 32, 11.5, col.ink2, 650, 9.5);
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
      self._peek = () => ({ t, sun, wave, plants, foes, suns, mowers, cds, score, cleared, state, picked, cursor, L, mode, objects, PL });
      self._setMode = setMode;
      return {
        save() {
          if (state !== 'play' || t < 2) return null;
          return {
            mode, t, sun, score, cleared, skyT, wave: { ...wave }, cds,
            plants: plants.map(p => ({ c: p.c, r: p.r, k: p.k, hp: p.hp, timer: p.timer, fuse: p.fuse, arm: p.arm })),
            foes: foes.map(f => ({ k: f.k, r: f.r, x: f.x, hp: f.hp, mhp: f.mhp, slow: f.slow, rise: f.rise, jumped: f.jumped, flying: f.flying })),
            seeds: seeds.map(q => ({ r: q.r, x: q.x, ice: q.ice })),
            suns: suns.filter(q => !q.fly).map(q => ({ x: q.x, y: q.y, ty: q.ty, life: q.life })),
            objects: objects.map(o => ({ k: o.k, c: o.c, r: o.r, timer: o.timer })),
            mowers: mowers.map(m => ({ x: m.x, on: m.on, gone: m.gone }))
          };
        }
      };
    }
  });
})();
