/* Pop Duel: balloon tower defence. The same waves run down two tracks; build towers with
   three upgrade paths, fire abilities and send balloons to your rival. The first track to run out of lives loses.
   vs Bot = your track against the computer's; vs Friend = two tracks on one screen, each player clicks their own.
   Solo modes (Classic, Relaxed, Rush, Deflation) are picked from the start menu. Everything is drawn on the canvas. */
(function () {
  const D = Ludus.draw;
  const W = 480, H = 320, CS = 32, GC = 15, GR = 10;

  /* ---------- track ---------- */
  const WP = [[-1, 2], [4, 2], [4, 7], [9, 7], [9, 1], [12, 1], [12, 8], [15, 8]].map(([c, r]) => [(c + 0.5) * CS, (r + 0.5) * CS]);
  const SEG = []; let LEN = 0;
  for (let i = 0; i < WP.length - 1; i++) { const a = WP[i], b = WP[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); SEG.push({ a, b, l, s: LEN }); LEN += l; }
  function at(d) {
    d = Math.max(0, Math.min(LEN, d));
    for (const s of SEG) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k]; }
    return WP[WP.length - 1];
  }
  const PATH = new Set();
  for (let i = 0; i < WP.length - 1; i++) {
    const c0 = Math.round(WP[i][0] / CS - 0.5), r0 = Math.round(WP[i][1] / CS - 0.5), c1 = Math.round(WP[i + 1][0] / CS - 0.5), r1 = Math.round(WP[i + 1][1] / CS - 0.5);
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) PATH.add(c + ',' + r);
  }

  /* ---------- balloons ---------- */
  const KIND = {
    red: { hp: 1, sp: 73, ch: [], col: '#e5483d' }, blue: { hp: 1, sp: 98, ch: ['red'], col: '#2f76e0' }, green: { hp: 1, sp: 120, ch: ['blue'], col: '#36a852' },
    yellow: { hp: 1, sp: 174, ch: ['green'], col: '#f2c230' }, pink: { hp: 1, sp: 210, ch: ['yellow'], col: '#ef6fa8' },
    black: { hp: 1, sp: 120, ch: ['pink', 'pink'], col: '#1d1f24', imm: 'boom' }, lead: { hp: 1, sp: 64, ch: ['black', 'black'], col: '#8b929c', imm: 'sharp' },
    ceramic: { hp: 10, sp: 98, ch: ['pink', 'pink'], col: '#b5723e' }, blimp: { hp: 200, sp: 42, ch: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], col: '#3f7fd4', big: 1 }
  };
  const RBE = {}; function rbe(k) { if (RBE[k]) return RBE[k]; return (RBE[k] = KIND[k].hp + KIND[k].ch.reduce((a, c) => a + rbe(c), 0)); }
  const LABEL = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', pink: 'Pink', black: 'Black', lead: 'Lead', ceramic: 'Ceramic', blimp: 'Blimp' };
  const lbl = k => (k.endsWith('*') ? 'Camo ' : '') + LABEL[k.replace('*', '')];

  /* ---------- towers: three upgrade paths of three tiers. Upgrade at most two paths, only one past tier 1. ---------- */
  const up = (n, cost, d, f) => ({ n, cost, d, f });
  const TW = {
    dart: { n: 'Dart Scout', cost: 170, col: '#1f8a7a', kind: 'proj', d: 'Cheap, quick darts that pierce a couple of balloons.',
      base: { range: 95, rate: 0.85, dmg: 1, pierce: 2, type: 'sharp', shots: 1, speed: 520, size: 12 },
      paths: [{ n: 'Pierce', t: [up('Sharp Darts', 130, '+2 pierce', s => { s.pierce += 2; }), up('Razor Darts', 240, '+4 pierce, +1 damage', s => { s.pierce += 4; s.dmg++; }), up('Spike Ball', 950, 'Huge rolling ball: 20 pierce, 3 damage, pops lead', s => { s.pierce = 20; s.dmg = 3; s.type = 'any'; s.size = 18; s.speed = 360; s.ball = 1; })] },
        { n: 'Speed', t: [up('Quick Hands', 160, 'Throws 20% faster', s => { s.rate *= 0.8; }), up('Hawk Eye', 220, 'Sees camo, +20 range', s => { s.camo = 1; s.range += 20; }), up('Triple Shot', 420, 'Throws three darts at once', s => { s.shots = 3; })] },
        { n: 'Storm', t: [up('Long Range', 100, '+25 range', s => { s.range += 25; }), up('Fan Club', 380, 'Throws 30% faster, one extra dart', s => { s.rate *= 0.7; s.shots += 1; }), up('Blade Storm', 1100, 'Ability: 32 blades in every direction', s => { s.ability = 'storm'; })] }] },
    tack: { n: 'Tack Spinner', cost: 260, col: '#c46a2b', kind: 'tack', d: 'Sprays tacks in a ring. Great on corners.',
      base: { range: 66, rate: 1.1, dmg: 1, pierce: 1, type: 'sharp', shots: 8, speed: 420, size: 11 },
      paths: [{ n: 'Rate', t: [up('Faster Shooting', 150, '25% faster', s => { s.rate *= 0.75; }), up('Even Faster', 320, '30% faster', s => { s.rate *= 0.7; }), up('Blade Ring', 950, '12 blades, 4 pierce, 2 damage', s => { s.shots = 12; s.pierce = 4; s.dmg = 2; })] },
        { n: 'Reach', t: [up('Long Tacks', 100, '+20 range', s => { s.range += 20; }), up('More Tacks', 220, '10 tacks per volley', s => { s.shots = Math.max(s.shots, 10); }), up('Ring of Fire', 1400, 'Burns everything in range, pops lead', s => { s.kind = 'ring'; s.dmg = 2; s.type = 'any'; s.rate *= 0.8; })] },
        { n: 'Heat', t: [up('Hot Tacks', 260, 'Pops lead', s => { s.type = 'any'; }), up('Barbed', 300, '+2 pierce', s => { s.pierce += 2; }), up('Overdrive', 1050, 'Fires 2.5 times faster', s => { s.rate *= 0.4; })] }] },
    boomer: { n: 'Boomer', cost: 300, col: '#7a5bc2', kind: 'proj', d: 'Wide arcing throws that cut through crowds.',
      base: { range: 110, rate: 1.2, dmg: 1, pierce: 6, type: 'sharp', shots: 1, speed: 380, size: 16 },
      paths: [{ n: 'Glaive', t: [up('Multi-target', 200, '+4 pierce', s => { s.pierce += 4; }), up('Glaive', 380, '+1 damage, +4 pierce', s => { s.dmg++; s.pierce += 4; }), up('Glaive Lord', 1600, '40 pierce, +3 damage, faster', s => { s.pierce = 40; s.dmg += 3; s.rate *= 0.6; })] },
        { n: 'Arm', t: [up('Red-Hot Rangs', 260, 'Pops lead', s => { s.type = 'any'; }), up('Bionic Arm', 460, 'Throws 40% faster', s => { s.rate *= 0.6; }), up('Turbo Charge', 1200, 'Throws 3 times faster', s => { s.rate *= 0.35; })] },
        { n: 'Press', t: [up('Long Throw', 120, '+30 range', s => { s.range += 30; }), up('Twin Rangs', 420, 'Throws two at once', s => { s.shots = 2; }), up('Blimp Press', 1100, '4 times damage to blimps', s => { s.bigBonus = 4; })] }] },
    bomb: { n: 'Bombardier', cost: 420, col: '#3b3f47', kind: 'bomb', d: 'Explosions pop crowds, but black balloons shrug them off.',
      base: { range: 105, rate: 1.3, dmg: 1, radius: 38, type: 'boom', speed: 380 },
      paths: [{ n: 'Blast', t: [up('Bigger Bombs', 260, 'Bigger blast, +1 damage', s => { s.radius = 54; s.dmg++; }), up('Heavy Shells', 520, '+2 damage', s => { s.dmg += 2; }), up('Carpet Bomber', 1500, 'Ability: hits every balloon for 12', s => { s.ability = 'carpet'; })] },
        { n: 'Fuse', t: [up('Short Fuse', 300, 'Fires 30% faster', s => { s.rate *= 0.7; }), up('Cluster Bombs', 650, 'Each blast throws four small ones', s => { s.cluster = 4; }), up('Blimp Breaker', 1200, '3 times damage to blimps', s => { s.bigBonus = 3; })] },
        { n: 'Shock', t: [up('Long Barrel', 180, '+30 range', s => { s.range += 30; }), up('Stun Blast', 440, 'Blasts stun balloons briefly', s => { s.stun = 0.6; }), up('Shockwave', 1100, 'Much bigger blast, +2 damage', s => { s.radius += 40; s.dmg += 2; })] }] },
    ice: { n: 'Frost Warden', cost: 300, col: '#5fb8e6', kind: 'ice', d: 'Freezes everything nearby. Blimps only slow down.',
      base: { range: 74, rate: 2.2, freeze: 1, dmg: 0, type: 'cold' },
      paths: [{ n: 'Chill', t: [up('Deep Freeze', 220, 'Freezes for longer', s => { s.freeze = 1.7; }), up('Arctic Wind', 420, '+25 range, slows everything in range', s => { s.range += 25; s.aura = 0.6; }), up('Absolute Zero', 1500, 'Ability: freezes the whole track', s => { s.ability = 'zero'; })] },
        { n: 'Shatter', t: [up('Shatter', 360, 'Freezing deals 1 damage', s => { s.dmg = 1; }), up('Ice Shards', 520, 'Freezing deals 2 damage', s => { s.dmg = 2; }), up('Cryo Cannon', 950, 'Pulses twice as often', s => { s.rate *= 0.5; })] },
        { n: 'Frost', t: [up('Wide Chill', 180, '+15 range', s => { s.range += 15; }), up('Permafrost', 260, 'Thawed balloons stay slow', s => { s.perma = 1; }), up('Glacier', 700, 'Long freezes, faster pulses', s => { s.freeze += 1; s.rate *= 0.8; })] }] },
    glue: { n: 'Gluer', cost: 220, col: '#c2a72b', kind: 'glue', d: 'Slows balloons down. Upgrades make the glue eat through them.',
      base: { range: 90, rate: 1, dmg: 0, pierce: 1, type: 'none', slow: 0.5, slowDur: 4, speed: 420, size: 12 },
      paths: [{ n: 'Sticky', t: [up('Stickier', 120, 'Glue lasts twice as long', s => { s.slowDur = 8; }), up('Stronger Glue', 260, 'Glued balloons crawl', s => { s.slow = 0.3; }), up('Glue Storm', 1200, 'Ability: glues the whole track', s => { s.ability = 'gluestorm'; })] },
        { n: 'Acid', t: [up('Corrosive', 200, 'Glue deals 1 damage a second', s => { s.corr = 1; }), up('Dissolver', 420, '2 damage a second', s => { s.corr = 2; }), up('Liquefier', 1000, '5 damage a second', s => { s.corr = 5; })] },
        { n: 'Spray', t: [up('Splatter', 200, 'Glue hits 4 balloons', s => { s.pierce = 4; }), up('Glue Hose', 360, 'Shoots twice as fast', s => { s.rate *= 0.5; }), up('Blimp Glue', 900, 'Glue sticks to blimps, 8 pierce', s => { s.bigGlue = 1; s.pierce = 8; })] }] },
    sniper: { n: 'Marksman', cost: 360, col: '#6a5a3a', kind: 'snipe', d: 'Hits anything on the map instantly. Aims at the strongest.',
      base: { range: 999, rate: 1.6, dmg: 2, type: 'sharp', tgt: 'strong' },
      paths: [{ n: 'Calibre', t: [up('Full Metal', 320, 'Pops lead, 4 damage', s => { s.type = 'any'; s.dmg = 4; }), up('Large Calibre', 620, '7 damage', s => { s.dmg = 7; }), up('Deadly Precision', 2000, '18 damage, double on blimps', s => { s.dmg = 18; s.bigBonus = 2; })] },
        { n: 'Rate', t: [up('Fast Bolt', 380, 'Fires 35% faster', s => { s.rate *= 0.65; }), up('Semi-automatic', 700, 'Fires 40% faster again', s => { s.rate *= 0.6; }), up('Full Auto', 1800, 'Fires 2.5 times faster', s => { s.rate *= 0.4; })] },
        { n: 'Support', t: [up('Night Scope', 250, 'Sees camo', s => { s.camo = 1; }), up('Shrapnel', 450, 'Hits spray nearby balloons', s => { s.shrap = 1; }), up('Supply Drop', 1300, 'Ability: drops $250', s => { s.ability = 'drop'; })] }] },
    wizard: { n: 'Hexwright', cost: 400, col: '#3d5bd6', kind: 'proj', d: 'Magic bolts pop every kind of balloon.',
      base: { range: 100, rate: 1, dmg: 1, pierce: 3, type: 'any', shots: 1, speed: 450, size: 12 },
      paths: [{ n: 'Arcane', t: [up('Arcane Blast', 200, '+1 damage', s => { s.dmg++; }), up('Arcane Mastery', 520, 'Faster bolts, +20 range', s => { s.rate *= 0.6; s.range += 20; }), up('Arcane Spike', 1500, '+4 damage, 3 times on blimps', s => { s.dmg += 4; s.bigBonus = 3; })] },
        { n: 'Fire', t: [up('Fireball', 300, 'Bolts explode', s => { s.splash = 34; }), up('Wall of Fire', 700, 'Hit balloons burn', s => { s.burn = 1; }), up('Dragon Breath', 1400, 'Casts nearly 3 times faster', s => { s.rate *= 0.35; })] },
        { n: 'Storm', t: [up('Monster Lens', 250, 'Sees camo', s => { s.camo = 1; }), up('Lightning', 620, 'Bolts arc to 4 more balloons', s => { s.chain = 4; }), up('Meteor', 1800, 'Ability: 300 damage to the strongest balloon', s => { s.ability = 'meteor'; })] }] },
    farm: { n: 'Orchard', cost: 600, col: '#3f9a45', kind: 'farm', d: 'Grows $60 at the start of every wave. No attack.',
      base: { income: 60, range: 0 },
      paths: [{ n: 'Trees', t: [up('More Trees', 300, '+$30 a wave', s => { s.income += 30; }), up('Greenhouse', 700, '+$60 a wave', s => { s.income += 60; }), up('Plantation', 1800, '+$180 a wave', s => { s.income += 180; })] },
        { n: 'Bank', t: [up('Fertiliser', 200, '+$15 a wave', s => { s.income += 15; }), up('Bank', 600, '+$40 a wave', s => { s.income += 40; }), up('Market Day', 1200, 'Ability: sell a harvest for $300', s => { s.ability = 'harvest'; })] },
        { n: 'Value', t: [up('Valuable Fruit', 300, 'Income x1.25', s => { s.mul = (s.mul || 1) * 1.25; }), up('Golden Fruit', 500, 'Income x1.25 again', s => { s.mul = (s.mul || 1) * 1.25; }), up('Bounty', 1500, 'Every pop pays an extra $1', s => { s.bounty = 1; })] }] },
    mech: { n: 'Mechanic', cost: 340, col: '#d1782a', kind: 'proj', d: 'Nail gun up close. Upgrades lay spikes on the track and tune up towers.',
      base: { range: 85, rate: 0.7, dmg: 1, pierce: 3, type: 'sharp', shots: 1, speed: 560, size: 11 },
      paths: [{ n: 'Spikes', t: [up('Spike Piles', 220, 'Drops spikes on the track every 3s', s => { s.traps = 1; s.trapP = 6; s.trapRate = 3; s.trapType = 'sharp'; }), up('Hot Spikes', 420, 'Bigger piles, faster, pop lead', s => { s.trapP = 12; s.trapRate = 2; s.trapType = 'any'; }), up('Spike Storm', 1400, 'Ability: spikes along the whole track', s => { s.ability = 'spikestorm'; })] },
        { n: 'Nails', t: [up('Quick Nails', 150, 'Fires 35% faster', s => { s.rate *= 0.65; }), up('Rivet Gun', 380, 'Pops lead and black, +2 pierce', s => { s.type = 'any'; s.pierce += 2; }), up('Nail Swarm', 1100, 'Three nails at once, sees camo', s => { s.shots = 3; s.camo = 1; })] },
        { n: 'Tune-up', t: [up('Toolbox', 180, '+25 range, sees camo', s => { s.range += 25; s.camo = 1; }), up('Oiled Gears', 500, 'Towers in range attack 15% faster', s => { s.tune = 1.15; }), up('Overclock', 1300, 'Ability: towers in range attack 4 times faster for 6s', s => { s.ability = 'overclock'; })] }] },
    laser: { n: 'Lightbringer', cost: 1800, col: '#e0a21c', kind: 'proj', d: 'A storm of fast shots. Expensive, devastating.',
      base: { range: 120, rate: 0.12, dmg: 1, pierce: 1, type: 'sharp', shots: 1, speed: 900, size: 10 },
      paths: [{ n: 'Plasma', t: [up('Laser Blasts', 1200, 'Pops lead, +1 pierce', s => { s.type = 'any'; s.pierce++; }), up('Plasma', 2500, '2 damage, 3 pierce', s => { s.dmg = 2; s.pierce = 3; }), up('Sun Beam', 8000, '5 damage, 6 pierce', s => { s.dmg = 5; s.pierce = 6; })] },
        { n: 'Range', t: [up('Super Range', 600, '+40 range', s => { s.range += 40; }), up('Epic Range', 900, '+40 range', s => { s.range += 40; }), up('Overcharge', 2500, 'Ability: fires 4 times faster for 8 seconds', s => { s.ability = 'overcharge'; })] },
        { n: 'Vision', t: [up('Knockback', 500, 'Hits slow balloons briefly', s => { s.kb = 1; }), up('Ultravision', 900, 'Sees camo', s => { s.camo = 1; }), up('Dark Star', 5000, 'Three shots at once', s => { s.shots = 3; })] }] }
  };
  const SHORT = { dart: 'Dart', tack: 'Tack', boomer: 'Boomer', bomb: 'Bomber', ice: 'Frost', glue: 'Gluer', sniper: 'Sniper', wizard: 'Wizard', farm: 'Orchard', mech: 'Mechanic', laser: 'Laser' };
  for (const k in TW) TW[k].short = SHORT[k];
  const TKEYS = Object.keys(TW);
  const ABIL = { spikestorm: { n: 'Spike Storm', cd: 35 }, overclock: { n: 'Overclock', cd: 40 }, storm: { n: 'Blade Storm', cd: 30 }, carpet: { n: 'Carpet Bomb', cd: 40 }, zero: { n: 'Absolute Zero', cd: 40 }, gluestorm: { n: 'Glue Storm', cd: 40 },
    drop: { n: 'Supply Drop', cd: 50 }, meteor: { n: 'Meteor', cd: 35 }, harvest: { n: 'Market Day', cd: 60 }, overcharge: { n: 'Overcharge', cd: 45 } };
  const TGT = ['first', 'last', 'strong', 'close'], TGTN = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };
  const r5 = c => Math.max(5, Math.round(c * 0.8 / 5) * 5);   // everything 20% cheaper than the first version
  for (const k in TW) { TW[k].cost = r5(TW[k].cost); for (const P of TW[k].paths) for (const u of P.t) u.cost = r5(u.cost); }
  const RULES = { classic: { n: 'Classic', cash: 900, lives: 150, bonus: 110, d: 'Survive as many waves as you can.' },
    relaxed: { n: 'Relaxed', cash: 1000, lives: 250, bonus: 120, spd: 0.85, disc: 0.85, d: 'Slower balloons, more lives, cheaper towers.' },
    rush: { n: 'Rush', cash: 900, lives: 150, bonus: 220, brk: 1.5, spd: 1.1, d: 'No breathers between waves, double pay.' },
    deflation: { n: 'Deflation', cash: 6000, lives: 150, bonus: 0, noIncome: 1, d: '$6,000 now and not a cent more.' },
    sandbox: { n: 'Sandbox', cash: 999999, lives: 999999, bonus: 110, sandbox: 1, d: 'Endless cash and lives. Try any tower or combo.' } };
  const SOLO_KEYS = Object.keys(RULES);
  const DUEL = { cash: 750, lives: 100, bonus: 100 };
  function stats(t) { const T = TW[t.k]; const s = { kind: T.kind, camo: 0, bigBonus: 1, tgt: 'first', ...T.base }; for (let p = 0; p < 3; p++) for (let i = 0; i < (t.up ? t.up[p] : 0); i++) T.paths[p].t[i].f(s); return s; }
  function canUp(t, p) { const u = t.up.slice(); if (u[p] >= 3) return false; u[p]++; return u.filter(x => x > 0).length <= 2 && u.filter(x => x >= 2).length <= 1; }

  const SENDS = [{ k: 'red', n: 8, cost: 60, inc: 3, w: 1 }, { k: 'blue', n: 6, cost: 90, inc: 4, w: 2 }, { k: 'green', n: 6, cost: 140, inc: 6, w: 4 }, { k: 'yellow', n: 5, cost: 200, inc: 8, w: 6 },
    { k: 'black', n: 4, cost: 280, inc: 10, w: 8 }, { k: 'green*', n: 6, cost: 240, inc: 9, w: 9 }, { k: 'lead', n: 3, cost: 340, inc: 11, w: 10 }, { k: 'ceramic', n: 2, cost: 480, inc: 15, w: 12 }, { k: 'blimp', n: 1, cost: 1400, inc: 30, w: 15 }];
  /* waves: identical for both players, on a fixed clock. A star means camo. */
  const WAVES = [[['red', 14, 0.6]], [['red', 24, 0.45]], [['red', 12, 0.4], ['blue', 10, 0.6]], [['blue', 22, 0.45]], [['blue', 12, 0.4], ['green', 12, 0.5]],
    [['green', 20, 0.4], ['yellow', 4, 0.8]], [['yellow', 14, 0.5]], [['green', 24, 0.3], ['yellow', 12, 0.45]], [['pink', 12, 0.55]], [['black', 8, 0.7], ['yellow', 12, 0.4], ['blue*', 8, 0.5]],
    [['lead', 4, 1.2], ['pink', 14, 0.4]], [['ceramic', 4, 1.2], ['black', 10, 0.45], ['green*', 8, 0.45]], [['lead', 8, 0.8], ['ceramic', 6, 0.9]], [['pink', 40, 0.2], ['yellow*', 10, 0.35]], [['ceramic', 12, 0.7]],
    [['blimp', 1, 1], ['pink', 20, 0.3]], [['lead', 14, 0.5], ['ceramic', 10, 0.6], ['pink*', 12, 0.3]], [['ceramic', 20, 0.45]], [['blimp', 2, 4], ['black', 20, 0.3], ['ceramic*', 4, 1]], [['blimp', 3, 3], ['ceramic', 16, 0.4]]];
  function wave(n) {
    if (n <= WAVES.length) return WAVES[n - 1];
    const x = n - WAVES.length, base = WAVES[WAVES.length - 4 + ((n - 1) % 4)], m = Math.pow(1.22, x);
    return base.map(([k, c, g]) => [k, Math.ceil(c * m), Math.max(0.12, g * Math.pow(0.93, x))]).concat([['blimp', 1 + Math.floor(x / 2), 2.4], ['ceramic*', 2 + x, 0.5]]);
  }
  const FIRST = 8, BREAK = 6, WSC = {};
  function waveStart(n, br) {
    br = br ?? BREAK; const WS = WSC[br] || (WSC[br] = [0, FIRST]);
    while (WS.length <= n) { const k = WS.length - 1; const dur = wave(k).reduce((a, [, c, g]) => a + c * g, 0); WS.push(WS[k] + dur + br); }
    return WS[n];
  }

  /* ---------- palette ---------- */
  function pal(c) {
    return c.dark
      ? { grass: '#34472a', grass2: '#2f4126', path: '#5a5038', edge: '#71654a', ink: '#e9ece4', shade: 'rgba(0,0,0,0.35)' }
      : { grass: '#b9d39a', grass2: '#acc98b', path: '#e7d7aa', edge: '#cdb986', ink: '#22261f', shade: 'rgba(0,0,0,0.18)' };
  }
  const PIPS = ['#f2c230', '#5fb8e6', '#e5483d'];

  function drawTower(ctx, t, P) {
    const T = TW[t.k], x = t.x, y = t.y, a = t.ang || 0;
    ctx.fillStyle = P.shade; ctx.beginPath(); ctx.ellipse(x, y + 10, 12, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = T.col; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    const poly = (n, r, rot) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const q = rot + i * Math.PI * 2 / n; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
    const barrel = (len, wd) => { ctx.strokeStyle = P.ink; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); };
    const dot = r => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
    if (t.k === 'ice') { poly(6, 12, 0); ctx.strokeStyle = '#fff'; for (let i = 0; i < 3; i++) { const q = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(q) * 7, y - Math.sin(q) * 7); ctx.lineTo(x + Math.cos(q) * 7, y + Math.sin(q) * 7); ctx.stroke(); } }
    else if (t.k === 'tack') { poly(8, 12, Math.PI / 8); dot(3); }
    else if (t.k === 'farm') { D.roundRect(ctx, x - 12, y - 12, 24, 24, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a6b2f'; ctx.beginPath(); ctx.arc(x, y - 2, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#e5483d'; ctx.beginPath(); ctx.arc(x + 3, y - 3, 2, 0, 7); ctx.fill(); }
    else if (t.k === 'wizard') { ctx.beginPath(); for (let i = 0; i < 10; i++) { const q = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5.5 : 12; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (t.k === 'glue') { ctx.beginPath(); ctx.arc(x, y + 2, 10, 0, Math.PI); ctx.lineTo(x, y - 12); ctx.closePath(); ctx.fill(); ctx.stroke(); barrel(12, 4); }
    else if (t.k === 'laser') { poly(4, 13, 0); barrel(15, 4); ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    else if (t.k === 'mech') { ctx.beginPath(); for (let i = 0; i < 16; i++) { const q = i * Math.PI / 8, r = i % 2 ? 9 : 12.5; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); barrel(14, 4); dot(3.5); }
    else if (t.k === 'boomer') { ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 6, a - 1, a + 1); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.stroke(); barrel(t.k === 'sniper' ? 18 : t.k === 'bomb' ? 12 : 14, t.k === 'bomb' ? 7 : t.k === 'sniper' ? 3 : 4); dot(3); }
    const u = t.up || [0, 0, 0];
    let k = 0;
    for (let p = 0; p < 3; p++) for (let i = 0; i < u[p]; i++) { ctx.fillStyle = PIPS[p]; ctx.beginPath(); ctx.arc(x - 9 + k * 6, y - 15, 2.6, 0, 7); ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 0.8; ctx.stroke(); k++; }
    if (t.boost > 0) { ctx.strokeStyle = '#f2b81c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.stroke(); }
  }
  function drawBalloon(ctx, x, y, k, P, s) {
    s = s || 1; const K = KIND[k];
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 9 * s); ctx.lineTo(x + s, y + 14 * s); ctx.stroke();
    ctx.fillStyle = K.col; ctx.beginPath(); ctx.ellipse(x, y, 7.5 * s, 9 * s, 0, 0, 7); ctx.fill();
    if (k === 'lead' || k === 'ceramic' || k === 'black') { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - 2.5 * s, y - 3.5 * s, 2 * s, 3 * s, -0.4, 0, 7); ctx.fill();
  }

  /* ---------- a board: one player's defence ---------- */
  let uid = 0;
  class Board {
    constructor(opt) { this.opt = opt; this.R = opt.rules || DUEL; this.human = !!opt.human; this.reset(); }
    reset() {
      this.t = 0; this.cash = this.R.cash; this.lives = this.R.lives; this.traps = []; this.inc = 0; this.wave = 0; this.towers = []; this.bl = []; this.pr = []; this.fx = []; this.queue = [];
      this.pick = null; this.selT = null; this.dead = false; this.deadT = 0; this.sendCd = 0; this.pops = 0; this.aiI = 0; this.aiSendT = 0;
      this.tab = 'towers'; this.msg = ''; this.msgT = 0;
    }
    sfx(n) { if (this.human) this.opt.sfx(n); }
    price(c) { return Math.max(5, Math.round(c * (this.R.disc || 1) / 5) * 5); }
    free(c, r) { return c >= 0 && r >= 0 && c < GC && r < GR && !PATH.has(c + ',' + r) && !this.towers.some(t => t.c === c && t.r === r); }
    tap(c, r) {
      if (this.dead) return;
      const hit = this.towers.find(t => t.c === c && t.r === r);
      if (this.pick) {
        if (this.free(c, r)) { this.build(this.pick, c, r); return; }
        if (hit) { this.pick = null; this.selT = hit; this.opt.sfx('click'); return; }
        if (c >= 0 && r >= 0 && c < GC && r < GR) this.say(PATH.has(c + ',' + r) ? 'Not on the track' : 'Square taken');
        return;
      }
      this.selT = hit || null;
      if (hit) this.opt.sfx('click');
    }
    build(k, c, r) {
      const cost = this.price(TW[k].cost); if (this.cash < cost) { this.say('Not enough cash'); return false; }
      if (!this.free(c, r)) return false;
      this.cash -= cost;
      const t = { k, c, r, x: (c + 0.5) * CS, y: (r + 0.5) * CS, up: [0, 0, 0], cd: 0, spent: cost, ang: 0, abCd: 0, boost: 0 };
      t.s = stats(t); t.tgt = t.s.tgt; this.towers.push(t);
      this.sfx('drop');
      if (this.human && this.cash < cost) this.pick = null;
      return t;
    }
    upgrade(t, p) {
      if (!canUp(t, p)) return false; const nx = TW[t.k].paths[p].t[t.up[p]];
      const nc = this.price(nx.cost); if (this.cash < nc) { this.say('Not enough cash'); return false; }
      this.cash -= nc; t.spent += nc; t.up[p]++; t.s = stats(t); this.sfx('merge'); this.say(nx.n); return true;
    }
    sell(t) { this.cash += Math.floor(t.spent * 0.7); this.towers = this.towers.filter(x => x !== t); this.selT = null; this.sfx('move'); }
    send(i) {
      const s = SENDS[i]; if (this.dead || !this.opt.live()) return;
      if (this.wave < s.w) { this.say('Unlocks at wave ' + s.w); return; }
      if (this.cash < s.cost) { this.say('Not enough cash'); return; }
      if (this.sendCd > 0) return;
      this.cash -= s.cost; this.inc += s.inc; this.sendCd = 0.6; this.sfx('power');
      this.opt.onSend(s.k, s.n); this.say(s.n + ' ' + lbl(s.k) + ' sent');
    }
    receive(k, n) { for (let i = 0; i < n; i++) this.queue.push({ t: this.t + 0.8 + i * 0.35, k }); this.say(n + ' ' + lbl(k) + ' incoming'); }
    say(m) { this.msg = m; this.msgT = 1.3; }
    spawn(key, d, camo) { const k = key.replace('*', ''), b = { id: ++uid, k, hp: KIND[k].hp, d: d || 0, fz: 0, gl: 0, gs: 1, gc: 0, ca: 0, burn: 0, ba: 0, kb: 0, slowT: 0, camo: camo || key.endsWith('*') }; this.bl.push(b); return b; }
    bounty() { return this.towers.some(t => t.s.bounty); }
    hitB(b, dmg, type) {
      if (b.dead || dmg <= 0) return false; const K = KIND[b.k];
      if (type === 'none') return false;
      if (K.imm && K.imm === type) return false;
      b.hp -= dmg; if (b.hp > 0) return true;
      const over = -b.hp; b.dead = true; this.cash += 1 + (this.bounty() ? 1 : 0); this.pops++; this.opt.pop(this);
      const p = at(b.d); this.fx.push({ x: p[0], y: p[1], t: 0, col: K.col, kind: 'pop', big: K.big });
      const kids = K.ch.map((k, i) => { const c = this.spawn(k, Math.max(0, b.d - i * 7), b.camo); c.fz = K.big ? 0 : b.fz; c.gl = b.gl; c.gs = b.gs; c.gc = b.gc; return c; });
      if (over > 0 && kids.length) this.hitB(kids[0], over, type);
      return true;
    }
    targets(t, s) {
      const out = [];
      for (const b of this.bl) { if (b.dead || (b.camo && !s.camo)) continue; const p = at(b.d); const dd = Math.hypot(p[0] - t.x, p[1] - t.y); if (dd <= s.range) out.push([b, dd]); }
      if (!out.length) return null;
      const m = t.tgt || 'first';
      out.sort(m === 'last' ? (a, b) => a[0].d - b[0].d : m === 'close' ? (a, b) => a[1] - b[1] : m === 'strong' ? (a, b) => rbe(b[0].k) - rbe(a[0].k) || b[0].d - a[0].d : (a, b) => b[0].d - a[0].d);
      return out[0][0];
    }
    ability(t) {
      const s = t.s; if (!s.ability || t.abCd > 0 || this.dead || !this.opt.live()) return;
      const A = ABIL[s.ability]; t.abCd = A.cd; this.sfx('boom'); this.say(A.n);
      if (s.ability === 'storm') { for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; this.pr.push({ k: 'dart', x: t.x, y: t.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.5, pierce: 6, dmg: 2, type: 'any', size: 13, hit: new Set(), bigBonus: 1 }); } }
      else if (s.ability === 'carpet') { for (const b of this.bl.slice()) this.hitB(b, 12, 'any'); for (let i = 0; i < 14; i++) { const p = at(LEN * i / 14); this.fx.push({ x: p[0], y: p[1], t: 0, kind: 'boom', r: 30 }); } }
      else if (s.ability === 'zero') { for (const b of this.bl) b.fz = KIND[b.k].big ? 2 : 4; this.fx.push({ x: W / 2, y: H / 2, t: 0, kind: 'ring', r: 300 }); }
      else if (s.ability === 'gluestorm') { for (const b of this.bl) { b.gl = 10; b.gs = 0.3; b.gc = Math.max(b.gc, s.corr || 0); } }
      else if (s.ability === 'drop') this.cash += 250;
      else if (s.ability === 'spikestorm') { for (let i = 0; i < 26; i++) { const d = LEN * (i + 0.5) / 26, q = at(d); this.traps.push({ d, x: q[0], y: q[1], p: 10, type: 'any', life: 15, hit: new Set() }); } }
      else if (s.ability === 'overclock') { for (const o of this.towers) if (Math.hypot(o.x - t.x, o.y - t.y) <= s.range) o.boost = 6; }
      else if (s.ability === 'harvest') this.cash += 300;
      else if (s.ability === 'overcharge') t.boost = 8;
      else if (s.ability === 'meteor') { let best = null; for (const b of this.bl) if (!best || rbe(b.k) > rbe(best.k)) best = b; if (best) { const p = at(best.d); this.hitB(best, 300, 'any'); this.fx.push({ x: p[0], y: p[1], t: 0, kind: 'boom', r: 40 }); } }
    }
    hitProj(p, b) {
      const K = KIND[b.k];
      if (p.k === 'glue') { if (K.big && !p.bigGlue) return true; b.gl = p.slowDur; b.gs = Math.min(b.gs < 1 && b.gl > 0 ? b.gs : 1, p.slow); b.gc = Math.max(b.gc, p.corr || 0); return true; }
      const ok = this.hitB(b, p.dmg * (K.big ? p.bigBonus : 1), p.type);
      if (ok) {
        if (p.burn) b.burn = 3;
        if (p.kb) b.kb = 1;
        if (p.splash) { const q = at(b.d); this.blast(q[0], q[1], p.splash, 1, 'any'); }
        if (p.chain) { let n = p.chain; const q = at(b.d); for (const o of this.bl) { if (n <= 0) break; if (o === b || o.dead) continue; const r = at(o.d); if (Math.hypot(r[0] - q[0], r[1] - q[1]) < 70) { this.hitB(o, p.dmg, 'any'); this.fx.push({ x: q[0], y: q[1], x2: r[0], y2: r[1], t: 0, kind: 'zap' }); n--; } } }
      }
      return ok;
    }
    blast(x, y, r, dmg, type, stun, bigBonus) {
      for (const b of this.bl.slice()) { if (b.dead) continue; const q = at(b.d); if (Math.hypot(q[0] - x, q[1] - y) <= r) { const K = KIND[b.k]; if (stun && !K.big) b.fz = Math.max(b.fz, stun); this.hitB(b, dmg * (K.big ? (bigBonus || 1) : 1), type); } }
      this.fx.push({ x, y, t: 0, kind: 'boom', r });
    }
    queueWave(n) {
      const st = waveStart(n, this.R.brk); let off = 0;
      for (const [k, c, g] of wave(n)) for (let i = 0; i < c; i++) { this.queue.push({ t: st + off, k }); off += g; }
    }
    step(dt) {
      if (this.dead) return;
      this.t += dt; this.sendCd = Math.max(0, this.sendCd - dt); this.msgT = Math.max(0, this.msgT - dt);
      if (this.R.sandbox) this.cash = Math.max(this.cash, this.R.cash);
      while (waveStart(this.wave + 1, this.R.brk) <= this.t) {
        this.wave++; this.queueWave(this.wave);
        if (this.wave > 1 && !this.R.noIncome) this.cash += (this.R.bonus ?? 100) + this.inc;
        let farm = 0; if (!this.R.noIncome) for (const t of this.towers) if (t.s.income) farm += Math.round(t.s.income * (t.s.mul || 1));
        if (farm) { this.cash += farm; if (this.human) this.say('+$' + farm + ' from orchards'); }
      }
      if (this.queue.length) { this.queue.sort((a, b) => a.t - b.t); while (this.queue.length && this.queue[0].t <= this.t) this.spawn(this.queue.shift().k, 0); }
      const auras = this.towers.filter(t => t.s.aura);
      for (const b of this.bl) {
        if (b.dead) continue; const K = KIND[b.k]; let f = 1;
        if (b.fz > 0) { b.fz -= dt; f = K.big ? 0.5 : 0; if (b.fz <= 0 && b.perma) b.slowT = 3; }
        if (b.slowT > 0) { b.slowT -= dt; f *= 0.7; }
        if (b.gl > 0) { b.gl -= dt; f *= b.gs; if (b.gc) { b.ca += b.gc * dt; while (b.ca >= 1 && !b.dead) { b.ca--; this.hitB(b, 1, 'any'); } } } else b.gs = 1;
        if (b.burn > 0) { b.burn -= dt; b.ba += dt; while (b.ba >= 1 && !b.dead) { b.ba--; this.hitB(b, 1, 'any'); } }
        if (b.kb > 0) { b.kb -= dt; f *= 0.5; }
        if (auras.length) { const p = at(b.d); for (const t of auras) if (Math.hypot(p[0] - t.x, p[1] - t.y) <= t.s.range) f *= t.s.aura; }
        if (b.dead) continue;
        b.d += K.sp * f * dt * (this.R.spd || 1);
        if (b.d >= LEN) { b.dead = true; if (!this.R.sandbox) this.lives -= rbe(b.k); this.leak = 0.4; this.sfx('hit'); }
      }
      this.leak = Math.max(0, (this.leak || 0) - dt);
      for (const tr of this.traps) {
        tr.life -= dt; if (tr.p <= 0 || tr.life <= 0) continue;
        for (const b of this.bl) { if (b.dead || tr.p <= 0 || tr.hit.has(b.id)) continue; if (Math.abs(b.d - tr.d) < (KIND[b.k].big ? 20 : 9)) { tr.hit.add(b.id); if (this.hitB(b, 1, tr.type)) tr.p--; } }
      }
      this.traps = this.traps.filter(tr => tr.p > 0 && tr.life > 0);
      const tuners = this.towers.filter(t => t.s.tune);
      for (const t of this.towers) this.towerStep(t, dt, tuners);
      this.projStep(dt);
      this.bl = this.bl.filter(b => !b.dead);
      for (const f of this.fx) f.t += dt; this.fx = this.fx.filter(f => f.t < 0.35);
      if (this.lives <= 0) { this.lives = 0; this.dead = true; this.deadT = this.t; this.bl = []; this.pr = []; this.leak = 0; }
    }
    towerStep(t, dt, tuners) {
      const s = t.s; if (t.abCd > 0) t.abCd -= dt; if (t.boost > 0) t.boost -= dt;
      if (s.traps) {
        t.tc = (t.tc ?? 1) - dt;
        if (t.tc <= 0 && this.traps.length < 60) {
          const opts = []; for (let d = 0; d < LEN; d += 10) { const q = at(d); if (Math.hypot(q[0] - t.x, q[1] - t.y) <= s.range) opts.push([d, q]); }
          if (opts.length) { const [d, q] = opts[Math.floor(Math.random() * opts.length)]; this.traps.push({ d, x: q[0] + (Math.random() - 0.5) * 8, y: q[1] + (Math.random() - 0.5) * 8, p: s.trapP, type: s.trapType, life: 25, hit: new Set() }); }
          t.tc = s.trapRate;
        }
      }
      if (s.kind === 'farm') return;
      let tm = 1; for (const u of tuners) if (u !== t && Math.hypot(u.x - t.x, u.y - t.y) <= u.s.range) tm = Math.max(tm, u.s.tune);
      t.cd -= dt * (t.boost > 0 ? 4 : 1) * tm; if (t.cd > 0) return;
      if (s.kind === 'ice' || s.kind === 'ring') {
        let any = false;
        for (const b of this.bl.slice()) {
          if (b.dead || (s.kind === 'ring' && b.camo && !s.camo)) continue; const p = at(b.d);
          if (Math.hypot(p[0] - t.x, p[1] - t.y) > s.range) continue;
          any = true;
          if (s.kind === 'ring') this.hitB(b, s.dmg, 'any');
          else { const K = KIND[b.k]; b.fz = Math.max(b.fz, K.big ? s.freeze * 0.5 : s.freeze); if (s.perma) b.perma = 1; if (s.dmg) this.hitB(b, s.dmg, 'cold'); }
        }
        if (any) { t.cd = s.rate; this.fx.push({ x: t.x, y: t.y, t: 0, kind: s.kind === 'ring' ? 'fire' : 'ring', r: s.range }); }
        return;
      }
      const tg = this.targets(t, s); if (!tg) return;
      t.cd = s.rate; const tp = at(tg.d); t.ang = Math.atan2(tp[1] - t.y, tp[0] - t.x);
      if (s.kind === 'snipe') {
        this.hitB(tg, s.dmg * (KIND[tg.k].big ? s.bigBonus : 1), s.type); this.fx.push({ x: t.x, y: t.y, x2: tp[0], y2: tp[1], t: 0, kind: 'shot' });
        if (s.shrap) for (const o of this.bl.slice()) { if (o === tg || o.dead) continue; const q = at(o.d); if (Math.hypot(q[0] - tp[0], q[1] - tp[1]) < 34) this.hitB(o, 1, 'any'); }
        return;
      }
      if (s.kind === 'bomb') {
        const d = Math.hypot(tp[0] - t.x, tp[1] - t.y) || 1;
        this.pr.push({ k: 'bomb', x: t.x, y: t.y, vx: (tp[0] - t.x) / d * s.speed, vy: (tp[1] - t.y) / d * s.speed, life: d / s.speed, dmg: s.dmg, radius: s.radius, cluster: s.cluster, stun: s.stun, bigBonus: s.bigBonus });
        return;
      }
      if (s.kind === 'tack') {
        for (let i = 0; i < s.shots; i++) { const a = i / s.shots * Math.PI * 2; this.pr.push({ k: 'dart', x: t.x, y: t.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, life: s.range / s.speed, pierce: s.pierce, dmg: s.dmg, type: s.type, size: s.size, hit: new Set(), bigBonus: s.bigBonus }); }
        return;
      }
      const n = s.shots || 1;
      const look = s.kind === 'glue' ? 'glue' : t.k === 'wizard' ? 'bolt' : t.k === 'boomer' ? 'rang' : t.k === 'laser' ? 'laser' : t.k === 'mech' ? 'nail' : s.ball ? 'ball' : 'dart';
      for (let i = 0; i < n; i++) {
        const a = t.ang + (i - (n - 1) / 2) * 0.2;
        this.pr.push({ k: look, x: t.x, y: t.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, life: s.range * 1.5 / s.speed, pierce: s.pierce, dmg: s.dmg, type: s.type, size: s.size, hit: new Set(),
          bigBonus: s.bigBonus, splash: s.splash, burn: s.burn, chain: s.chain, kb: s.kb, slow: s.slow, slowDur: s.slowDur, corr: s.corr, bigGlue: s.bigGlue });
      }
    }
    projStep(dt) {
      for (const p of this.pr) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.k === 'bomb') {
          let boom = p.life <= 0;
          if (!boom) for (const b of this.bl) { if (b.dead) continue; const q = at(b.d); if (Math.hypot(q[0] - p.x, q[1] - p.y) < (KIND[b.k].big ? 24 : 12)) { boom = true; break; } }
          if (boom) {
            p.life = 0; this.blast(p.x, p.y, p.radius, p.dmg, 'boom', p.stun, p.bigBonus);
            if (p.cluster) for (let i = 0; i < p.cluster; i++) { const a = i / p.cluster * Math.PI * 2; this.blast(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, 24, 1, 'boom', 0, p.bigBonus); }
          }
          continue;
        }
        for (const b of this.bl) {
          if (b.dead || p.pierce <= 0 || p.hit.has(b.id)) continue; const q = at(b.d), rr = (KIND[b.k].big ? 22 : 8) + (p.size || 12) * 0.4;
          if (Math.hypot(q[0] - p.x, q[1] - p.y) < rr) { p.hit.add(b.id); if (this.hitProj(p, b)) p.pierce--; else if (p.k !== 'glue') p.pierce = 0; }
        }
        if (p.pierce <= 0) p.life = 0;
      }
      this.pr = this.pr.filter(p => p.life > 0);
    }
    advance(target) { let n = 0; while (this.t < target && n < 900 && !this.dead) { this.step(Math.min(1 / 60, target - this.t)); n++; } }
  }

  /* ---------- computer opponent ---------- */
  const AIPLAN = [['dart', 3, 3], ['dart', 6, 6], ['up', 0, 0], ['up', 1, 0], ['tack', 8, 4], ['up', 2, 0], ['glue', 10, 2], ['up', 0, 1], ['bomb', 5, 4], ['up', 3, 2], ['up', 4, 1], ['ice', 8, 6],
    ['up', 2, 0], ['sniper', 13, 4], ['up', 6, 2], ['up', 6, 0], ['wizard', 10, 5], ['up', 7, 2], ['up', 7, 1], ['farm', 3, 1], ['up', 8, 0], ['up', 0, 1], ['up', 0, 1], ['up', 3, 2], ['up', 5, 0],
    ['boomer', 11, 7], ['up', 9, 1], ['up', 9, 0], ['up', 9, 0], ['up', 7, 1], ['up', 8, 0], ['up', 4, 1], ['up', 4, 1], ['up', 2, 0], ['up', 6, 0], ['up', 6, 0], ['laser', 1, 5], ['up', 11, 0], ['up', 11, 0], ['up', 3, 0], ['up', 11, 0]];
  function aiThink(B, level) {
    if (B.dead) return;
    const margin = [140, 20, 0][level];
    // Stuck on one plan step for 30 seconds (a spot it cannot build on, an upgrade that never opens)? Skip it.
    if (B.aiLastI !== B.aiI) { B.aiLastI = B.aiI; B.aiLastT = B.t; }
    else if (B.aiI < AIPLAN.length && B.t - B.aiLastT > 30) { B.aiI++; B.aiLastT = B.t; }
    const item = AIPLAN[B.aiI];
    if (item) {
      if (item[0] === 'up') {
        const t = B.towers[item[1]];
        if (!t || !canUp(t, item[2])) B.aiI++;
        else { const c = B.price(TW[t.k].paths[item[2]].t[t.up[item[2]]].cost); if (B.cash >= c + margin) { B.upgrade(t, item[2]); B.aiI++; } }
      } else if (B.cash >= B.price(TW[item[0]].cost) + margin) { if (!B.free(item[1], item[2]) || B.build(item[0], item[1], item[2])) B.aiI++; }
    } else if (B.cash > 400 + margin) {
      // Past the plan: buy the cheapest upgrade still open.
      let best = null;
      for (const t of B.towers) for (let p = 0; p < 3; p++) if (canUp(t, p)) { const c = B.price(TW[t.k].paths[p].t[t.up[p]].cost); if (!best || c < best.c) best = { t, p, c }; }
      if (best && B.cash >= best.c + margin + 150) B.upgrade(best.t, best.p);
    }
    for (const t of B.towers) if (t.s.ability && t.abCd <= 0 && (B.bl.length > 25 || t.s.ability === 'drop' || t.s.ability === 'harvest')) B.ability(t);
    if (B.wave >= 3 && B.t > B.aiSendT) {
      B.aiSendT = B.t + [11, 6, 4][level] + Math.random() * 6;
      const ok = SENDS.filter(s => s.w <= B.wave && B.cash > s.cost + (item ? 250 : 80));
      if (ok.length) { const s = ok[ok.length - 1 - Math.floor(Math.random() * Math.min(2, ok.length))]; B.send(SENDS.indexOf(s)); }
    }
  }

  /* ---------- small canvas helpers ---------- */
  const FONT = (sz, wt) => `${wt || 650} ${sz}px ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif`;
  // One line kept inside maxW: shrinks to min, then trims with an ellipsis (never wraps, so it cannot collide).
  function fit1(ctx, s, x, y, maxW, size, color, weight, align, min) {
    min = min || Math.max(8.5, size * 0.78); let sz = size; ctx.font = FONT(sz, weight);
    while (sz > min && ctx.measureText(s).width > maxW) { sz -= 0.5; ctx.font = FONT(sz, weight); }
    if (ctx.measureText(s).width > maxW) { while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); s += '…'; }
    D.text(ctx, s, x, y, sz, color, weight, align);
  }
  const inside = (m, x, y, w, h) => m && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;

  Ludus.register({
    id: 'popduel', name: 'Pop Duel', aka: 'balloon tower defence', tag: 'Duel', wide: true, versus: true, tint: '#4f9a4a',
    hint: 'Pick a tower, click grass to build · click it to upgrade · vs Friend: P1 left track, P2 right · <kbd>1</kbd>-<kbd>0</kbd> towers · <kbd>Space</kbd> speed',
    online: { min: 2, max: 2 },
    onlineHint: '<b>Online</b> You defend your own track, your friend defends theirs · same waves on the same clock · Send balloons at them from the Send tab · <kbd>1</kbd>-<kbd>0</kbd> towers',
    _rules: { TW, SENDS, wave, waveStart, canUp, stats, Board, aiThink },
    art(ctx, w, h) {
      const s = Math.min(w / 160, h / 110);
      ctx.save(); ctx.translate(w / 2 - 80 * s, h / 2 - 55 * s); ctx.scale(s, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pts = [[-10, 30], [52, 30], [52, 82], [108, 82], [108, 26], [170, 26]];
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
      path(); ctx.strokeStyle = 'rgba(80,60,20,0.25)'; ctx.lineWidth = 22; ctx.stroke();
      path(); ctx.strokeStyle = 'rgba(255,246,222,0.85)'; ctx.lineWidth = 17; ctx.stroke();
      const P = { ink: '#22261f', shade: 'rgba(0,0,0,0.18)' };
      [[18, 30, 'red'], [40, 30, 'blue'], [52, 56, 'green'], [80, 82, 'yellow'], [108, 60, 'pink']].forEach(([x, y, k]) => drawBalloon(ctx, x, y - 3, k, P, 0.9));
      drawTower(ctx, { k: 'dart', x: 80, y: 52, ang: 2.0, up: [1, 1, 0] }, P);
      drawTower(ctx, { k: 'ice', x: 136, y: 58, up: [0, 0, 0] }, P);
      ctx.restore();
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx, canvas } = view;
      // Online (api.online): this screen runs its own track only; the rival's track is a copy drawn from their snapshots.
      const on = api.online || null, friend = api.friend && !on;
      const me = on && on.seat === 1 ? 1 : 0, foe = 1 - me;
      let mode = 'duel', rule = 'classic', phase = 'menu', clock = 0, speed = 1, boards = [], active = me, aiT = 0, overT = 0, winner = -1, lastPop = 0, menuHover = null;
      let hits = [], mouse = null, restored = false, netT = 0, foeDead = null, myDeadT = -1;

      function makeBoards() {
        const common = { live: () => phase === 'play', sfx: n => api.sfx(n), pop: B => { const now = performance.now(); if (B.human && now - lastPop > 70) { lastPop = now; api.sfx('tick'); } } };
        if (mode === 'solo') { boards = [new Board({ ...common, human: true, solo: true, rules: RULES[rule], who: 'you', onSend() {} })]; return; }
        if (on) {
          const mine = new Board({ ...common, human: true, who: me ? 'p2' : 'p1', onSend: (k, n) => netSend(k, n) });
          const theirs = new Board({ ...common, human: false, remote: true, who: foe ? 'p2' : 'p1', onSend() {} });
          boards = me ? [theirs, mine] : [mine, theirs];
          return;
        }
        const a = new Board({ ...common, human: true, who: friend ? 'p1' : 'you', onSend: (k, n) => b.receive(k, n) });
        const b = new Board({ ...common, human: friend, who: friend ? 'p2' : 'bot', onSend: (k, n) => a.receive(k, n) });
        boards = [a, b];
      }
      function startRun(m, r) {
        mode = m; if (r) rule = r;
        makeBoards(); clock = 0; phase = 'play'; winner = -1; active = me; aiT = 0; netT = 0; foeDead = null; myDeadT = -1;
        api.score(0); api.sfx('score');
      }
      makeBoards();

      /* ---------- layout ---------- */
      const TOP = 56, PANEL_MIN = 96;
      function layout() {
        const w = view.w, h = view.h, wide = w >= 600 && w > h * 1.15;
        const L = { wide, boards: [], panels: [] };
        if (mode === 'solo' && phase !== 'menu') {
          if (wide) {
            const pw = Math.max(220, Math.min(300, w * 0.3)), bw = Math.min(w - 30 - pw, (h - TOP - 8) * 1.5), bh = bw / 1.5;
            const by = TOP + Math.max(0, (h - TOP - 8 - bh) / 2);
            L.boards.push({ i: 0, x: 10, y: by, w: bw, h: bh });
            L.panels.push({ i: 0, x: 20 + bw, y: TOP, w: w - 30 - bw, h: h - TOP - 8 });
          } else {
            const bw = Math.min(w - 20, (h - TOP - 216) * 1.5), bh = bw / 1.5;
            L.boards.push({ i: 0, x: (w - bw) / 2, y: TOP, w: bw, h: bh });
            L.panels.push({ i: 0, x: 10, y: TOP + bh + 8, w: w - 20, h: h - TOP - bh - 16 });
          }
          return L;
        }
        if (wide) {
          // Two tracks side by side, one dock-style panel under them (in vs Friend it follows the last track clicked).
          const bw = Math.min((w - 30) / 2, (h - TOP - 16 - PANEL_MIN) * 1.5), bh = bw / 1.5, x0 = (w - 2 * bw - 10) / 2;
          L.boards.push({ i: 0, x: x0, y: TOP, w: bw, h: bh }, { i: 1, x: x0 + bw + 10, y: TOP, w: bw, h: bh });
          const py = TOP + bh + 8, ph = h - py - 8, pw = Math.max(2 * bw + 10, Math.min(w - 20, 760));
          L.panels.push({ i: friend ? active : me, x: (w - pw) / 2, y: py, w: pw, h: ph, shared: friend });
        } else if (friend) {
          const bh = Math.min((w - 20) / 1.5, (h - TOP - 24 - 150) / 2), bw = bh * 1.5;
          L.boards.push({ i: 0, x: (w - bw) / 2, y: TOP, w: bw, h: bh }, { i: 1, x: (w - bw) / 2, y: TOP + bh + 8, w: bw, h: bh });
          L.panels.push({ i: active, x: 10, y: TOP + 2 * bh + 16, w: w - 20, h: h - TOP - 2 * bh - 24, shared: true });
        } else {
          const bw = Math.min(w - 20, (h - TOP - 216) * 1.5), bh = bw / 1.5;
          L.boards.push({ i: me, x: (w - bw) / 2, y: TOP, w: bw, h: bh });
          L.panels.push({ i: me, x: 10, y: TOP + bh + 8, w: w - 20, h: h - TOP - bh - 16, rival: true });
        }
        return L;
      }

      /* ---------- input ---------- */
      const hit = (x, y, w, h, fn, cursor, label) => hits.push({ x, y, w, h, fn, cursor, label });
      function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * view.w / (r.width || 1), y: (e.clientY - r.top) * view.h / (r.height || 1) }; }
      api.on(canvas, 'pointerdown', e => {
        const p = pos(e); mouse = p;
        for (let i = hits.length - 1; i >= 0; i--) { const z = hits[i]; if (inside(p, z.x, z.y, z.w, z.h)) { z.fn(p); return; } }
      });
      api.on(canvas, 'pointermove', e => { mouse = pos(e); const z = [...hits].reverse().find(q => inside(mouse, q.x, q.y, q.w, q.h)); canvas.style.cursor = z ? (z.cursor || 'pointer') : 'default'; });
      api.on(canvas, 'pointerleave', () => { mouse = null; });
      api.on(canvas, 'contextmenu', e => { e.preventDefault(); boards.forEach(B => { B.pick = null; B.selT = null; }); });
      api.keys(e => {
        if (phase !== 'play') return;
        if (e.key === ' ') { if (!on) { speed = nextSpeed(); api.sfx('click'); } return; }
        const n = '1234567890'.indexOf(e.key);
        const B = boards[active];
        if (n >= 0 && B && B.human) { const k = TKEYS[n]; B.pick = B.pick === k ? null : k; B.selT = null; B.tab = 'towers'; api.sfx('click'); }
      });

      // Solo goes up to triple speed; a duel on one screen up to double; online keeps both screens on the real clock.
      function nextSpeed() { const top = mode === 'solo' ? 3 : 2; return speed >= top ? 1 : speed + 1; }

      /* ---------- drawing ---------- */
      let col = api.colors(), P = pal(col);
      const fillBase = () => (col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)');
      const fillHover = () => (col.dark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.08)');
      const ownColor = B => (B.opt.who === 'p2' ? D.P2 : B.opt.who === 'bot' ? col.ink3 : col.accent);

      function button(x, y, w, h, o) {
        const hov = inside(mouse, x, y, w, h);
        ctx.save();
        if (o.dis) ctx.globalAlpha = 0.5;
        D.roundRect(ctx, x, y, w, h, o.r || 9);
        ctx.fillStyle = o.primary ? (o.tint || col.accent) : (hov && !o.dis ? fillHover() : fillBase()); ctx.fill();
        if (o.on) { ctx.save(); ctx.globalAlpha *= 0.14; ctx.fillStyle = o.tint || col.accent; ctx.fill(); ctx.restore(); ctx.strokeStyle = o.tint || col.accent; ctx.lineWidth = 1.5; ctx.stroke(); }
        let tx = x + w / 2, tw = w - 10, align = 'center';
        if (o.icon && w >= 92 && h >= 30) { o.icon(x + 17, y + h / 2); tx = x + 34; tw = w - 40; align = 'left'; }
        const ink = o.primary ? '#fff' : col.ink, ink2 = o.primary ? 'rgba(255,255,255,0.85)' : col.ink2;
        let label = o.label;
        if (o.alt) { const sz = o.size || 11; ctx.font = FONT(Math.max(8.5, sz * 0.78), 700); if (ctx.measureText(label).width > tw) label = o.alt; }
        if (o.sub && h >= 28) {
          fit1(ctx, label, tx, y + h / 2 - 7, tw, o.size || 11, ink, 700, align);
          fit1(ctx, o.sub, tx, y + h / 2 + 7.5, tw, 10, o.subColor || ink2, 600, align);
        } else fit1(ctx, label, tx, y + h / 2, tw, o.size || 11, ink, 700, align);
        ctx.restore();
        if (o.fn) hit(x, y, w, h, o.fn, null, o.label);
        if (hov && o.tip) tipText = o.tip;
      }
      let tipText = '';

      function gridFor(n, cw, ch, gap) {
        for (let cols = 2; cols <= n; cols++) {
          const rows = Math.ceil(n / cols), bh = (ch - (rows - 1) * gap) / rows;
          if (bh >= 33 || cols === n) return { cols, rows, bw: (cw - (cols - 1) * gap) / cols, bh: Math.min(46, bh) };
        }
        return { cols: n, rows: 1, bw: (cw - (n - 1) * gap) / n, bh: Math.min(46, ch) };
      }

      function drawBoard(B, R, idx) {
        const s = R.w / W;
        ctx.save();
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        D.roundRect(ctx, R.x, R.y, R.w, R.h, 12); ctx.fillStyle = P.grass; ctx.fill(); ctx.restore();
        D.roundRect(ctx, R.x, R.y, R.w, R.h, 12); ctx.clip();
        ctx.translate(R.x, R.y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.fillStyle = P.grass2; for (let c = 0; c < GC; c++) for (let r = 0; r < GR; r++) if ((c + r) % 2) ctx.fillRect(c * CS, r * CS, CS, CS);
        ctx.beginPath(); WP.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = P.edge; ctx.lineWidth = CS * 0.86; ctx.stroke(); ctx.strokeStyle = P.path; ctx.lineWidth = CS * 0.7; ctx.stroke();
        // hover preview while placing
        if (B.human && B.pick && mouse && phase === 'play' && inside(mouse, R.x, R.y, R.w, R.h)) {
          const c = Math.floor((mouse.x - R.x) / s / CS), r = Math.floor((mouse.y - R.y) / s / CS), ok = B.free(c, r);
          const x = (c + 0.5) * CS, y = (r + 0.5) * CS, st = stats({ k: B.pick });
          ctx.fillStyle = ok ? 'rgba(0,0,0,0.1)' : 'rgba(220,40,50,0.22)'; ctx.beginPath(); ctx.arc(x, y, Math.min(st.range || 14, 600), 0, 7); ctx.fill();
          ctx.globalAlpha = 0.65; drawTower(ctx, { k: B.pick, x, y, up: [0, 0, 0], ang: 0 }, P); ctx.globalAlpha = 1;
        }
        if (B.selT && B.towers.includes(B.selT) && B.selT.s.range) {
          const t = B.selT; ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(t.x, t.y, Math.min(t.s.range, 600), 0, 7); ctx.fill(); ctx.stroke();
        }
        for (const tr of B.traps) { ctx.fillStyle = tr.type === 'any' ? '#c0502a' : '#5a5f68'; for (let i = 0; i < 5; i++) { const a = i * 1.256, px = tr.x + Math.cos(a) * 4, py = tr.y + Math.sin(a) * 4; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py + 2); ctx.lineTo(px - 3, py + 2); ctx.closePath(); ctx.fill(); } }
        for (const t of B.towers) drawTower(ctx, t, P);
        const list = B.bl.slice().sort((a, b) => a.d - b.d);
        for (const b of list) {
          const [x, y] = at(b.d), K = KIND[b.k];
          if (K.big) {
            ctx.fillStyle = K.col; ctx.beginPath(); ctx.ellipse(x, y, 24, 12, 0, 0, 7); ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
            if (b.camo) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#2e4a22'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 14, y - 16, 28 * Math.max(0, b.hp / K.hp), 3); continue;
          }
          drawBalloon(ctx, x, y, b.k, P);
          if (b.camo) { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 7.5, 9, 0, 0, 7); ctx.clip(); ctx.fillStyle = 'rgba(46,74,34,0.55)'; ctx.fillRect(x - 8, y - 6, 6, 4); ctx.fillRect(x + 1, y - 1, 7, 5); ctx.fillRect(x - 6, y + 4, 5, 4); ctx.restore(); }
          if (b.k === 'ceramic' && b.hp < KIND.ceramic.hp) { ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 1, y); ctx.lineTo(x - 2, y + 5); ctx.stroke(); }
          if (b.fz > 0) { ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 9.5, 11, 0, 0, 7); ctx.stroke(); }
          if (b.gl > 0) { ctx.fillStyle = 'rgba(214,190,60,0.7)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 6, 3, 0, 0, 7); ctx.fill(); }
          if (b.burn > 0) { ctx.fillStyle = 'rgba(255,120,30,0.8)'; ctx.beginPath(); ctx.arc(x + 5, y - 7, 2.5, 0, 7); ctx.fill(); }
        }
        for (const p of B.pr) {
          if (p.k === 'bomb') { ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 7); ctx.fill(); continue; }
          if (p.k === 'glue') { ctx.fillStyle = '#d6be3c'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); continue; }
          if (p.k === 'bolt') { ctx.fillStyle = '#6f8bff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); continue; }
          if (p.k === 'ball') { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill(); continue; }
          if (p.k === 'rang') { ctx.strokeStyle = '#7a5bc2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI); ctx.stroke(); continue; }
          const a = Math.atan2(p.vy, p.vx); ctx.strokeStyle = p.k === 'laser' ? '#f2b81c' : p.k === 'nail' ? '#8a8f98' : P.ink; ctx.lineWidth = p.k === 'laser' ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * 9, p.y - Math.sin(a) * 9); ctx.stroke();
        }
        if (!api.reduceMotion) for (const f of B.fx) {
          const k = 1 - f.t / 0.35; ctx.globalAlpha = Math.max(0, k);
          if (f.kind === 'pop') { ctx.strokeStyle = f.col; ctx.lineWidth = 2; const rr = (f.big ? 20 : 8) + (1 - k) * 10; for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * rr * 0.5, f.y + Math.sin(a) * rr * 0.5); ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr); ctx.stroke(); } }
          else if (f.kind === 'boom') { ctx.fillStyle = 'rgba(255,150,40,0.45)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.3), 0, 7); ctx.fill(); }
          else if (f.kind === 'ring') { ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.6), 0, 7); ctx.stroke(); }
          else if (f.kind === 'fire') { ctx.strokeStyle = 'rgba(255,110,30,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.4), 0, 7); ctx.stroke(); }
          else if (f.kind === 'zap') { ctx.strokeStyle = '#9fb4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo((f.x + f.x2) / 2 + 6, (f.y + f.y2) / 2 - 6); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
          else if (f.kind === 'shot') { ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        // leak flash and active outline (stage coordinates)
        if (B.leak > 0) { ctx.save(); D.roundRect(ctx, R.x + 1, R.y + 1, R.w - 2, R.h - 2, 12); ctx.strokeStyle = col.bad; ctx.globalAlpha = B.leak / 0.4; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
        if (friend && mode === 'duel' && boards.length === 2 && idx === active && phase === 'play') { ctx.save(); D.roundRect(ctx, R.x - 2, R.y - 2, R.w + 4, R.h + 4, 14); ctx.strokeStyle = ownColor(B); ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
        if (phase !== 'menu') drawHud(B, R);
        if (B.msgT > 0 && B.msg) {
          ctx.save(); ctx.globalAlpha = Math.min(1, B.msgT / 0.25);
          ctx.font = FONT(11, 650); const tw = Math.min(R.w - 24, ctx.measureText(B.msg).width + 22);
          D.roundRect(ctx, R.x + R.w / 2 - tw / 2, R.y + R.h - 30, tw, 22, 11); ctx.fillStyle = col.dark ? 'rgba(20,20,20,0.82)' : 'rgba(255,255,255,0.92)'; ctx.fill();
          fit1(ctx, B.msg, R.x + R.w / 2, R.y + R.h - 19, tw - 14, 11, col.ink, 650);
          ctx.restore();
        }
        if (B.dead) {
          ctx.save(); D.roundRect(ctx, R.x, R.y, R.w, R.h, 12); ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)'; ctx.fill(); ctx.restore();
          card(R.x + R.w / 2, R.y + R.h / 2, Math.min(220, R.w - 30), 'Overrun', 'Lost on wave ' + B.wave);
        } else if (phase === 'over' && mode === 'duel') card(R.x + R.w / 2, R.y + R.h / 2, Math.min(220, R.w - 30), 'Held the line', 'Still standing on wave ' + B.wave);
        // clicks on the track
        if (B.human && phase === 'play') hit(R.x, R.y, R.w, R.h, p => {
          if (friend && boards.length === 2) active = idx;
          B.tap(Math.floor((p.x - R.x) / s / CS), Math.floor((p.y - R.y) / s / CS));
        }, B.pick ? 'crosshair' : 'default');
      }
      function drawHud(B, R) {
        const name = on ? nameOf(boards.indexOf(B)) : B.opt.who === 'bot' ? 'Bot' : B.opt.who === 'p2' ? 'P2' : B.opt.who === 'p1' ? 'P1' : 'You';
        const lv = B.R.sandbox ? '\u221e lives' : `${B.lives} lives`, cs = B.R.sandbox ? '$\u221e' : `$${B.cash}`;
        const parts = mode === 'solo' || R.w < 280 ? [lv, cs] : [name, lv, cs];
        const s = parts.join('  ·  ');
        ctx.save(); ctx.font = FONT(11, 700);
        const tw = Math.min(R.w - 16, ctx.measureText(s).width + 30);
        D.roundRect(ctx, R.x + 7, R.y + 7, tw, 22, 11); ctx.fillStyle = col.dark ? 'rgba(20,20,20,0.72)' : 'rgba(255,255,255,0.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(R.x + 18, R.y + 18, 4, 0, 7); ctx.fillStyle = ownColor(B); ctx.fill();
        fit1(ctx, s, R.x + 27, R.y + 18, tw - 26, 11, col.ink, 700, 'left');
        ctx.restore();
      }
      function card(cx, cy, w, big, small) {
        ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        D.roundRect(ctx, cx - w / 2, cy - 26, w, 52, 16); ctx.fill(); ctx.restore();
        fit1(ctx, big, cx, cy - 7, w - 20, 15, col.ink, 800); fit1(ctx, small, cx, cy + 12, w - 20, 11, col.ink2, 650);
      }

      function towerIcon(k) { return (x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(0.72, 0.72); drawTower(ctx, { k, x: 0, y: 0, up: [0, 0, 0], ang: -0.6 }, P); ctx.restore(); }; }

      function drawPanel(R) {
        const B = boards[R.i];
        if (!B) return;
        tipText = '';
        ctx.save(); D.roundRect(ctx, R.x, R.y, R.w, R.h, 14); ctx.fillStyle = col.surface; ctx.fill();
        ctx.strokeStyle = R.shared ? ownColor(B) : col.line; ctx.lineWidth = R.shared ? 1.5 : 1; ctx.stroke(); ctx.restore();
        const pad = 8, x = R.x + pad, w = R.w - pad * 2;
        // tabs
        const tabs = [['towers', 'Towers']];
        if (mode !== 'solo') tabs.push(['send', 'Send']);
        const abs = B.towers.filter(t => t.s.ability), ready = abs.filter(t => t.abCd <= 0).length;
        if (abs.length) tabs.push(['powers', ready ? `Powers ${ready}` : 'Powers']);
        if (R.rival) tabs.push(['rival', 'Rival']);
        if (!tabs.some(t => t[0] === B.tab)) B.tab = 'towers';
        const ty = R.y + pad, th = 26, tw = Math.min(78, (w * 0.62) / tabs.length);
        tabs.forEach(([id, label], i) => button(x + i * (tw + 4), ty, tw, th, { label, on: !B.selT && B.tab === id, r: 13, size: 11, tint: ownColor(B),
          fn: () => { B.tab = id; B.selT = null; if (id !== 'towers') B.pick = null; if (friend) active = R.i; api.sfx('click'); } }));
        const infoX = x + tabs.length * (tw + 4) + 4, infoW = x + w - infoX;
        let info = '';
        const cy = ty + th + 6, chh = R.y + R.h - pad - cy;
        if (B.selT && B.towers.includes(B.selT)) info = drawUpgrades(B, x, cy, w, chh, R);
        else if (B.tab === 'send') info = drawSends(B, x, cy, w, chh, R);
        else if (B.tab === 'powers') info = drawPowers(B, abs, x, cy, w, chh, R);
        else if (B.tab === 'rival') info = drawRival(x, cy, w, chh);
        else info = drawShop(B, x, cy, w, chh, R);
        if (R.shared && friend) info = (B.opt.who === 'p2' ? 'P2' : 'P1') + ': ' + info;
        if (infoW > 40) fit1(ctx, tipText || info, infoX + infoW, ty + th / 2, infoW, 10.5, col.ink2, 600, 'right', 8.5);
      }
      function drawShop(B, x, y, w, h, R) {
        const g = gridFor(TKEYS.length, w, h, 6);
        TKEYS.forEach((k, i) => {
          const c = i % g.cols, r = Math.floor(i / g.cols), price = B.price(TW[k].cost);
          button(x + c * (g.bw + 6), y + r * (g.bh + 6), g.bw, g.bh, { label: TW[k].n, alt: TW[k].short, sub: '$' + price, on: B.pick === k, dis: B.cash < price && B.pick !== k, icon: towerIcon(k), tint: ownColor(B), tip: TW[k].n + ': ' + TW[k].d,
            fn: () => { if (friend) active = R.i; if (B.cash < price && B.pick !== k) { B.say('Not enough cash'); return; } B.pick = B.pick === k ? null : k; B.selT = null; api.sfx('click'); } });
        });
        return B.pick ? 'Click grass to place ' + TW[B.pick].n : 'Pick a tower, then grass';
      }
      function drawSends(B, x, y, w, h, R) {
        const g = gridFor(SENDS.length, w, h, 6);
        SENDS.forEach((s, i) => {
          const c = i % g.cols, r = Math.floor(i / g.cols), locked = B.wave < s.w;
          button(x + c * (g.bw + 6), y + r * (g.bh + 6), g.bw, g.bh, { label: s.n + ' ' + lbl(s.k), alt: s.n + ' ' + (s.k.endsWith('*') ? 'Camo' : LABEL[s.k]), sub: locked ? 'Wave ' + s.w : '$' + s.cost + ' · +' + s.inc, dis: locked || B.cash < s.cost || B.dead, tip: (locked ? 'Unlocks at wave ' + s.w : `+$${s.inc} to your wave bonus`) + ' \u00b7 ' + s.n + ' ' + lbl(s.k),
            icon: (bx, by) => drawBalloon(ctx, bx, by - 2, s.k.replace('*', ''), P, 0.95),
            fn: () => { if (friend) active = R.i; B.send(i); } });
        });
        return 'Wave bonus $' + ((B.R.bonus ?? 100) + B.inc);
      }
      function drawPowers(B, abs, x, y, w, h, R) {
        const g = gridFor(Math.max(2, abs.length), w, h, 6);
        abs.forEach((t, i) => {
          const c = i % g.cols, r = Math.floor(i / g.cols), cd = t.abCd > 0;
          button(x + c * (g.bw + 6), y + r * (g.bh + 6), g.bw, g.bh, { label: ABIL[t.s.ability].n, sub: cd ? Math.ceil(t.abCd) + 's' : 'Ready', subColor: cd ? null : col.good, on: !cd, dis: cd || B.dead, icon: towerIcon(t.k), tint: col.good,
            fn: () => { if (friend) active = R.i; B.ability(t); } });
        });
        return 'Abilities from tier 3 upgrades';
      }
      function drawRival(x, y, w, h) {
        const B = boards[foe]; if (!B) return '';
        const bh = Math.min(h, (w * 0.62) / 1.5), bw = bh * 1.5;
        drawBoard(B, { x, y, w: bw, h: bh }, foe);
        const tx = x + bw + 12, tw = x + w - tx;
        if (tw > 50) {
          [['Lives', B.lives], ['Cash', '$' + B.cash], ['Towers', B.towers.length], ['Wave', B.wave]].forEach(([a, b], i) => {
            fit1(ctx, a, tx, y + 10 + i * 30, tw, 10, col.ink2, 600, 'left'); fit1(ctx, String(b), tx, y + 23 + i * 30, tw, 13, col.ink, 700, 'left');
          });
        }
        return on ? nameOf(foe) + '’s track' : 'The bot’s track';
      }
      function drawUpgrades(B, x, y, w, h, R) {
        const t = B.selT, T = TW[t.k];
        const own = () => { if (friend) active = R.i; };
        const tgOk = t.s.kind !== 'farm' && t.s.kind !== 'ice' && t.s.kind !== 'ring';
        const sellBtn = (bx, by, bw, bh) => button(bx, by, bw, bh, { label: 'Sell $' + Math.floor(t.spent * 0.7), r: 12, size: 10.5, fn: () => { own(); B.sell(t); } });
        const tgBtn = (bx, by, bw, bh) => button(bx, by, bw, bh, { label: (h < 92 ? '' : 'Target: ') + TGTN[t.tgt], tip: 'Target: which balloon this tower shoots first', r: 12, size: 10.5, fn: () => { own(); t.tgt = TGT[(TGT.indexOf(t.tgt) + 1) % 4]; api.sfx('click'); } });
        let px, py, pw, ph, mode3;
        if (h < 92) {
          // short dock: tower name and its buttons on the left, the three paths in a row beside them
          const side = Math.min(170, w * 0.24);
          fit1(ctx, T.n, x + 4, y + 10, side - 8, 12.5, col.ink, 800, 'left');
          const bh = Math.max(22, Math.min(28, h - 28)), by = y + h - bh - 2, half = (side - 6) / 2;
          if (tgOk) { tgBtn(x, by, half, bh); sellBtn(x + half + 6, by, half, bh); } else sellBtn(x, by, side, bh);
          px = x + side + 8; py = y; pw = w - side - 8; ph = h; mode3 = 'row';
        } else {
          const sellW = 84, tgW = tgOk ? 96 : 0;
          sellBtn(x + w - sellW, y, sellW, 24);
          if (tgW) tgBtn(x + w - sellW - 6 - tgW, y, tgW, 24);
          fit1(ctx, T.n, x + 2, y + 12, w - sellW - tgW - 20, 13, col.ink, 800, 'left');
          px = x; py = y + 30; pw = w; ph = h - 30; mode3 = w >= 300 ? 'cols' : 'rows';
        }
        T.paths.forEach((Pth, p) => {
          let cx, cyy, cw, chh;
          if (mode3 !== 'rows') { cw = (pw - 12) / 3; cx = px + p * (cw + 6); cyy = py; chh = ph; }
          else { cw = pw; chh = (ph - 12) / 3; cx = px; cyy = py + p * (chh + 6); }
          ctx.save(); D.roundRect(ctx, cx, cyy, cw, chh, 10); ctx.fillStyle = fillBase(); ctx.fill(); ctx.restore();
          const lv = t.up[p], owned = lv > 0 ? Pth.t[lv - 1].n : 'Nothing yet';
          const split = mode3 !== 'cols', headW = split ? cw * 0.42 - 12 : cw - 16;
          const ty1 = split ? cyy + chh / 2 - 8 : cyy + 12, ty2 = split ? cyy + chh / 2 + 8 : cyy + 27;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + 8 + headW - i * 9 - 3, ty1, 3, 0, 7); ctx.fillStyle = 3 - i <= lv ? PIPS[p] : col.line; ctx.fill(); }
          fit1(ctx, Pth.n, cx + 8, ty1, headW - 30, 11, col.ink, 750, 'left');
          fit1(ctx, owned, cx + 8, ty2, headW, 10, col.ink2, 600, 'left');
          let bx, by, bw, bh;
          if (!split) { bx = cx + 5; by = cyy + 37; bw = cw - 10; bh = chh - 42; }
          else { bx = cx + cw * 0.42; by = cyy + 4; bw = cw * 0.58 - 4; bh = chh - 8; }
          if (lv >= 3) fit1(ctx, 'Maxed', bx + bw / 2, by + bh / 2, bw - 8, 11, col.good, 700);
          else if (!canUp(t, p)) {
            if (inside(mouse, bx, by, bw, bh)) tipText = 'Only two paths, and only one past tier 1';
            fit1(ctx, bw < 150 ? 'Locked' : 'Locked by your other paths', bx + bw / 2, by + bh / 2, bw - 8, 10, col.ink3, 600);
          }
          else {
            const nx = Pth.t[lv], nc = B.price(nx.cost);
            const bh2 = Math.max(26, Math.min(60, bh));
            button(bx, by + (bh - bh2) / 2, bw, bh2, { label: nx.n, sub: '$' + nc, dis: B.cash < nc, tip: nx.d, tint: ownColor(B), fn: () => { own(); B.upgrade(t, p); } });
          }
        });
        if (t.s.kind === 'farm') return '$' + Math.round(t.s.income * (t.s.mul || 1)) + ' a wave';
        return (t.s.camo ? 'Sees camo. ' : 'No camo. ') + (t.s.type === 'any' ? 'Pops lead and black.' : t.s.type === 'sharp' ? 'Can’t pop lead.' : t.s.type === 'boom' ? 'Can’t pop black.' : '');
      }

      function drawHeader() {
        const w = view.w;
        const a = boards[0], b = boards[1];
        const lives = B => (B.R.sandbox ? '\u221e' : B.lives) + ' lives';
        const L = a ? { who: a.opt.who, label: on ? nameOf(0) : a.opt.who === 'p1' ? 'P1' : 'You', score: lives(a) } : null;
        let Rt = null;
        if (mode === 'duel' && b) Rt = { who: b.opt.who, label: on ? nameOf(1) : b.opt.who === 'p2' ? 'P2' : 'Bot', score: lives(b) };
        const thinking = !friend && !on && mode === 'duel' && phase === 'play';
        D.duelHeader(ctx, 10, 8, w - 20, { left: L, right: Rt, turn: thinking ? 'right' : null, status: '', thinking }, col);
        const pw = Math.min(132, (w - 20) * 0.34), mx = 10 + pw + 10, mw = w - 20 - 2 * pw - 20;
        if (mode === 'solo') fit1(ctx, RULES[rule].n + ' solo', w - 10 - pw / 2, 28, pw, 12, col.ink2, 700);
        let status = 'Choose a game';
        if (phase === 'play' || phase === 'over') {
          const A = boards[0], R0 = A.R, next = waveStart(A.wave + 1, R0.brk) - clock;
          status = A.wave === 0 ? `First wave in ${Math.max(1, Math.ceil(next))}s` : `Wave ${A.wave}` + (next > 0 && next < 60 ? ` · next in ${Math.ceil(next)}s` : '');
          if (phase === 'over') status = 'Game over';
        }
        fit1(ctx, status, mx + mw / 2, 20, mw, 12, col.accent, 700);
        if (phase === 'play' && mw > 40 && !on) button(mx + mw / 2 - 18, 32, 36, 16, { label: speed + 'x', tip: 'Game speed (Space)', r: 8, size: 9.5, on: speed > 1, fn: () => { speed = nextSpeed(); api.sfx('click'); } });
      }

      function drawMenu() {
        const w = view.w, h = view.h, cw = Math.min(380, w - 32), ch = 214, x = (w - cw) / 2, y = TOP + Math.max(8, (h - TOP - ch) / 2 - 10);
        ctx.save(); ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'; ctx.fillRect(0, TOP - 4, w, h - TOP + 4); ctx.restore();
        ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
        D.roundRect(ctx, x, y, cw, ch, 18); ctx.fill(); ctx.restore();
        fit1(ctx, 'Pop Duel', x + cw / 2, y + 24, cw - 30, 17, col.ink, 800);
        const sub = friend ? 'P1 defends the left track, P2 the right. Same waves; send balloons at each other.' : 'Same waves on both tracks. Send balloons to break the bot’s defence.';
        D.fitText(ctx, sub, x + cw / 2, y + 52, cw - 36, 11.5, col.ink2, 600, 10);
        button(x + 18, y + 76, cw - 36, 36, { label: friend ? 'Start duel: P1 vs P2' : 'Start duel vs bot', primary: true, r: 12, size: 12.5, fn: () => startRun('duel') });
        fit1(ctx, 'Or play solo, endless waves', x + cw / 2, y + 128, cw - 36, 10.5, col.ink3, 650);
        const bw = (cw - 36 - 6 * (SOLO_KEYS.length - 1)) / SOLO_KEYS.length;
        menuHover = null;
        SOLO_KEYS.forEach((k, i) => {
          const bx = x + 18 + i * (bw + 6);
          if (inside(mouse, bx, y + 142, bw, 32)) menuHover = k;
          button(bx, y + 142, bw, 32, { label: RULES[k].n, r: 10, size: 11, fn: () => startRun('solo', k) });
        });
        fit1(ctx, menuHover ? RULES[menuHover].d : 'Lives, cash and wave pace change with each mode.', x + cw / 2, y + 192, cw - 36, 10.5, col.ink2, 600);
      }

      function render() {
        col = api.colors(); P = pal(col);
        hits = [];
        ctx.clearRect(0, 0, view.w, view.h);
        drawHeader();
        const L = layout();
        L.boards.forEach(R => drawBoard(boards[R.i], R, R.i));
        if (phase === 'play') L.panels.forEach(drawPanel);
        else L.panels.forEach(R => { ctx.save(); D.roundRect(ctx, R.x, R.y, R.w, R.h, 14); ctx.fillStyle = col.surface; ctx.fill(); ctx.restore(); });
        if (phase === 'menu') drawMenu();
        if (phase === 'over') {
          const msg = endText();
          card(view.w / 2, view.h - 44, Math.min(300, view.w - 40), msg.title, msg.message);
        }
      }

      /* ---------- flow ---------- */
      function nameOf(i) { return (on && on.names && String(on.names[i] || '').trim()) || 'Player ' + (i + 1); }
      function endText() {
        if (on) { const wv = boards[winner].wave; return winner === me ? { title: 'You win the duel', message: `${nameOf(foe)} fell on wave ${boards[foe].wave || wv}` } : { title: nameOf(foe) + ' wins', message: `Your track fell on wave ${boards[me].wave}` }; }
        if (mode === 'solo') { const B = boards[0]; return { title: 'Overrun on wave ' + B.wave, message: RULES[rule].n + ' solo · ' + B.pops + ' balloons popped' }; }
        const [a, b] = boards, wv = boards[winner].wave;
        if (friend) return { title: (winner ? 'P2' : 'P1') + ' wins the duel', message: `${winner ? 'P2' : 'P1'} held the line to wave ${wv}` };
        return winner === 0 ? { title: 'You win the duel', message: `The bot fell on wave ${b.wave}` } : { title: 'The bot wins', message: `Your track fell on wave ${a.wave}` };
      }
      function update(dt) {
        if (phase !== 'play') {
          if (phase === 'over') { overT -= dt; if (overT <= 0 && !api.ended) { const m = endText(); const sc = mode === 'solo' ? boards[0].wave : boards[winner].wave; api.over({ score: sc, won: on ? winner === me : mode === 'solo' ? undefined : (friend || winner === 0), title: m.title, message: m.message }); } }
          return;
        }
        if (!dt) return;   // a still frame while paused
        clock += dt * speed;
        if (on) { netTick(dt); return; }
        boards.forEach(B => B.advance(clock));
        if (mode === 'duel' && !friend && !on) { aiT -= dt * speed; if (aiT <= 0) { aiT = [0.6, 0.3, 0.2][api.level]; aiThink(boards[1], api.level); } }
        api.score(Math.max(...boards.map(B => B.wave)));
        if (mode === 'solo') { if (boards[0].dead) end(-1); return; }
        const [a, b] = boards;
        if (a.dead || b.dead) end(a.dead && b.dead ? (a.deadT > b.deadT ? 0 : 1) : a.dead ? 1 : 0);
      }
      function end(w) {
        phase = 'over'; winner = w; overT = 1.8;
        boards.forEach(B => { B.pick = null; B.selT = null; });
        api.sfx(mode === 'solo' ? 'over' : (on ? w === me : (friend || w === 0)) ? 'win' : 'lose');
      }

      /* ---------- online: my track runs here, the rival's is a copy from their snapshots ---------- */
      const KK = Object.keys(KIND), SNAP_EVERY = 0.2, MAX_BL = 120, MAX_MSG = 3600;
      const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      function netSend(k, n) {
        const i = SENDS.findIndex(s => s.k === k && s.n === n);
        if (on && i >= 0) on.send('send', { i });
      }
      function snapshot() {
        const B = boards[me];
        const tw = B.towers.slice(0, GC * GR).map(t => [TKEYS.indexOf(t.k), t.c, t.r, t.up[0], t.up[1], t.up[2], Math.round((t.ang || 0) * 10)]);
        let bl = B.bl.filter(b => !b.dead).sort((x, y) => y.d - x.d).slice(0, MAX_BL).map(b => [KK.indexOf(b.k), Math.round(b.d), b.camo ? 1 : 0]);
        const msg = () => ({ l: Math.max(0, Math.round(B.lives)), c: Math.round(B.cash), w: B.wave, d: B.dead ? 1 : 0, tw, bl });
        let m = msg();
        while (bl.length && JSON.stringify(m).length > MAX_MSG) { bl = bl.slice(0, Math.floor(bl.length / 2)); m = msg(); }
        return m;
      }
      function applySnap(m) {
        const R = boards[foe];
        if (!R || !m || typeof m !== 'object' || !int(m.l, 0, 1e7) || !int(m.c, -1e7, 1e7) || !int(m.w, 0, 10000) || !Array.isArray(m.tw) || !Array.isArray(m.bl)) return;
        if (m.tw.length > GC * GR || m.bl.length > MAX_BL) return;
        const towers = [];
        for (const a of m.tw) {
          if (!Array.isArray(a) || a.length !== 7 || !int(a[0], 0, TKEYS.length - 1) || !int(a[1], 0, GC - 1) || !int(a[2], 0, GR - 1) || !a.slice(3, 6).every(u => int(u, 0, 3)) || !int(a[6], -100, 100)) return;
          const t = { k: TKEYS[a[0]], c: a[1], r: a[2], x: (a[1] + 0.5) * CS, y: (a[2] + 0.5) * CS, up: a.slice(3, 6), ang: a[6] / 10, cd: 0, spent: 0, abCd: 0, boost: 0 };
          t.s = stats(t); t.tgt = t.s.tgt; towers.push(t);
        }
        const bl = [];
        for (const a of m.bl) {
          if (!Array.isArray(a) || a.length !== 3 || !int(a[0], 0, KK.length - 1) || !int(a[1], 0, Math.ceil(LEN)) || !int(a[2], 0, 1)) return;
          const k = KK[a[0]]; bl.push({ id: -1, k, hp: KIND[k].hp, d: a[1], fz: 0, gl: 0, gs: 1, burn: 0, kb: 0, camo: !!a[2] });
        }
        if (m.l < R.lives) R.leak = 0.4;
        R.lives = m.l; R.cash = m.c; R.wave = m.w; R.towers = towers; R.bl = bl; R.pr = []; R.traps = []; R.fx = [];
        if (m.d) R.dead = true;
      }
      // Who lost: the first track to fall on its own clock; a dead heat goes to seat 0. Results can cross on the wire,
      // so the end card waits a moment (overT) before api.over and settles the winner again if the rival's result lands.
      function settle() {
        if (myDeadT >= 0 && foeDead) return myDeadT > foeDead.t ? me : myDeadT < foeDead.t ? foe : 0;
        if (foeDead) return me;
        return foe;
      }
      function netTick(dt) {
        const B = boards[me];
        B.advance(clock);
        api.score(B.wave);
        netT -= dt;
        if (netT <= 0) { netT = SNAP_EVERY; try { on.sendFast('st', snapshot()); } catch (e) {} }
        if (B.dead && myDeadT < 0) {
          myDeadT = Math.round(B.deadT * 1000) / 1000;   // the same precision the rival receives, so both screens compare equal numbers
          try { on.sendFast('st', snapshot()); on.send('dead', { t: Math.round(myDeadT * 1000), w: B.wave }); } catch (e) {}
          end(settle());
        } else if (foeDead && phase === 'play') end(settle());
      }
      if (on) {
        on.on('st', d => { try { applySnap(d); } catch (e) {} });
        on.on('send', (d, from) => {
          if (from === me || !d || !int(d.i, 0, SENDS.length - 1) || phase !== 'play') return;
          const B = boards[me]; if (B.dead) return;
          const s = SENDS[d.i]; B.receive(s.k, s.n);
        });
        on.on('dead', (d, from) => {
          if (from === me || foeDead || !d || !int(d.t, 0, 1e9) || !int(d.w, 0, 10000)) return;
          foeDead = { t: d.t / 1000, w: d.w };
          const R = boards[foe]; if (R) { R.dead = true; R.wave = Math.max(R.wave, d.w); R.lives = 0; R.bl = []; }
          if (phase === 'over' && !api.ended) winner = settle();
        });
      }

      /* ---------- save / restore ---------- */
      function save() {
        if (on || phase !== 'play' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, mode, rule, speed, active,
          boards: boards.map(B => ({ cash: B.cash, lives: B.lives, wave: B.wave, inc: B.inc, aiI: B.aiI, pops: B.pops,
            towers: B.towers.map(t => ({ k: t.k, c: t.c, r: t.r, up: t.up.slice(), spent: t.spent, tgt: t.tgt, abCd: Math.max(0, t.abCd) })) })) };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        if (!s || s.v !== 1 || (s.mode !== 'solo' && s.mode !== 'duel') || !Array.isArray(s.boards)) return false;
        if (s.mode === 'solo' && !RULES[s.rule]) return false;
        if (s.boards.length !== (s.mode === 'solo' ? 1 : 2)) return false;
        for (const b of s.boards) {
          if (!['cash', 'lives', 'wave', 'inc', 'aiI', 'pops'].every(k => num(b[k])) || b.lives <= 0 || b.wave < 0 || !Array.isArray(b.towers)) return false;
          if (!b.towers.every(t => TW[t.k] && Number.isInteger(t.c) && Number.isInteger(t.r) && Array.isArray(t.up) && t.up.length === 3 && t.up.every(u => Number.isInteger(u) && u >= 0 && u <= 3) && num(t.spent) && TGT.includes(t.tgt))) return false;
        }
        mode = s.mode; rule = s.mode === 'solo' ? s.rule : 'classic'; makeBoards();
        speed = [1, 2, 3].includes(s.speed) ? Math.min(s.speed, s.mode === 'solo' ? 3 : 2) : 1; active = s.active === 1 && boards.length === 2 ? 1 : 0;
        const wv = s.boards[0].wave;
        clock = wv > 0 ? waveStart(wv, boards[0].R.brk) : 0;
        boards.forEach((B, i) => {
          const o = s.boards[i];
          Object.assign(B, { cash: o.cash, lives: o.lives, wave: wv, inc: o.inc, aiI: o.aiI, pops: o.pops, t: clock, aiSendT: clock + 4 });
          B.towers = o.towers.filter(t => t.c >= 0 && t.r >= 0 && t.c < GC && t.r < GR && !PATH.has(t.c + ',' + t.r)).map(t => { const q = { k: t.k, c: t.c, r: t.r, x: (t.c + 0.5) * CS, y: (t.r + 0.5) * CS, up: t.up.slice(), cd: 0, spent: t.spent, ang: 0, abCd: num(t.abCd) ? t.abCd : 0, boost: 0, tgt: t.tgt }; q.s = stats(q); return q; });
          if (wv > 0) B.queueWave(wv);   // the wave in progress starts again from the top
        });
        phase = 'play';
        api.score(wv);
        return true;
      }
      restored = !on && !!(api.saved && restore(api.saved));
      if (on) startRun('duel');

      if (window.ludusDebug) window.ludusDebug.popduel = () => ({ phase, mode, rule, clock, speed, winner, layout: layout(),
        boards: boards.map(B => ({ who: B.opt.who, cash: B.cash, lives: B.lives, wave: B.wave, towers: B.towers.map(t => t.k + ':' + t.up.join('')), bl: B.bl.length, pops: B.pops, dead: B.dead })) });
      if (window.ludusDebug) window.ludusDebug.popduelCtl = { hits: () => hits.map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h, label: z.label })), boards: () => boards, layout, startRun, setClock(v) { clock = v; } };

      api.loop(dt => { update(dt); render(); });
      return { save };
    }
  });
})();
