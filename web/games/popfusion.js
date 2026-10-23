/* Pop Fusion: solo balloon tower defence with fusing. Build towers with three upgrade paths, then fuse two towers
   standing near each other: two of a kind make a twin (stronger, no path limit), two different kinds make a hybrid
   with both towers' tricks and its own upgrade paths. From wave 12 balloons can merge on the track into fused balloons.
   Modes (Classic, Relaxed, Rush, Deflation, Sandbox) are picked from the start menu. Everything is drawn on the canvas. */
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
    ceramic: { hp: 10, sp: 98, ch: ['pink', 'pink'], col: '#b5723e' }, blimp: { hp: 200, sp: 42, ch: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], col: '#3f7fd4', big: 1 },
    // fused balloons: two kinds in one skin, the immunities of both
    smog: { hp: 2, sp: 90, ch: ['black', 'lead'], col: '#1d1f24', col2: '#8b929c', imm: ['boom', 'sharp'] },
    ironclay: { hp: 16, sp: 80, ch: ['lead', 'ceramic'], col: '#b5723e', col2: '#8b929c', imm: 'sharp' },
    claybarge: { hp: 420, sp: 38, ch: ['ironclay', 'ironclay', 'ceramic', 'ceramic'], col: '#3f7fd4', col2: '#b5723e', big: 1 },
    ironside: { hp: 650, sp: 32, ch: ['blimp', 'blimp'], col: '#3f7fd4', col2: '#8b929c', big: 1, imm: 'sharp' },
    twin: { hp: 1500, sp: 26, ch: ['claybarge', 'ironside'], col: '#7a3fd4', col2: '#b5723e', big: 2 }
  };
  // two balloons side by side on the track can merge into one of these (wave 12 on)
  const BMERGE = { 'black+lead': 'smog', 'ceramic+lead': 'ironclay', 'blimp+ceramic': 'claybarge', 'blimp+lead': 'ironside', 'claybarge+ironside': 'twin' };
  const immune = (K, type) => !!K.imm && (Array.isArray(K.imm) ? K.imm.includes(type) : K.imm === type);
  const RBE = {}; function rbe(k) { if (RBE[k]) return RBE[k]; return (RBE[k] = KIND[k].hp + KIND[k].ch.reduce((a, c) => a + rbe(c), 0)); }
  const LABEL = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', pink: 'Pink', black: 'Black', lead: 'Lead', ceramic: 'Ceramic', blimp: 'Blimp', smog: 'Smog', ironclay: 'Ironclay', claybarge: 'Claybarge', ironside: 'Ironside', twin: 'Twin Colossus' };
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
  // A hybrid (two different towers fused) is its own kind: its stats come from the fusion, its upgrades from these paths.
  TW.fuse = { n: 'Hybrid', cost: 0, col: '#888', kind: 'proj', d: 'Two towers fused into one.', base: {},
    paths: [{ n: 'Power', t: [up('Charged Core', 300, '+1 damage', s => { s.dmg = (s.dmg || 0) + 1; }), up('Dense Core', 700, '+1 damage, +3 pierce', s => { s.dmg = (s.dmg || 0) + 1; s.pierce = (s.pierce || 1) + 3; }), up('Singularity', 2200, 'Double damage, triple on blimps', s => { s.dmg = (s.dmg || 1) * 2; s.bigBonus = (s.bigBonus || 1) * 3; })] },
      { n: 'Speed', t: [up('Overclock', 260, 'Attacks 20% faster', s => { s.rate *= 0.8; }), up('Twin Feed', 650, 'Attacks 30% faster again', s => { s.rate *= 0.7; }), up('Chain Reactor', 2000, 'Attacks twice as fast', s => { s.rate *= 0.5; })] },
      { n: 'Reach', t: [up('Long Sight', 180, '+25 range, sees camo', s => { s.range = (s.range || 0) + 25; s.camo = 1; }), up('Wide Field', 420, '+25 range', s => { s.range = (s.range || 0) + 25; }), up('Fusion Burst', 1500, 'Ability: every hybrid fires a ring of 24 shots', s => { s.ability = 'burst'; })] }] };
  const SHORT = { dart: 'Dart', tack: 'Tack', boomer: 'Boomer', bomb: 'Bomber', ice: 'Frost', glue: 'Gluer', sniper: 'Sniper', wizard: 'Wizard', farm: 'Orchard', mech: 'Mechanic', laser: 'Laser', fuse: 'Hybrid' };
  for (const k in TW) TW[k].short = SHORT[k];
  const TKEYS = Object.keys(TW).filter(k => k !== 'fuse');   // the shop: hybrids are made by fusing, never bought
  const ABIL = { burst: { n: 'Fusion Burst', cd: 30 }, spikestorm: { n: 'Spike Storm', cd: 35 }, overclock: { n: 'Overclock', cd: 40 }, storm: { n: 'Blade Storm', cd: 30 }, carpet: { n: 'Carpet Bomb', cd: 40 }, zero: { n: 'Absolute Zero', cd: 40 }, gluestorm: { n: 'Glue Storm', cd: 40 },
    drop: { n: 'Supply Drop', cd: 50 }, meteor: { n: 'Meteor', cd: 35 }, harvest: { n: 'Market Day', cd: 60 }, overcharge: { n: 'Overcharge', cd: 45 } };
  const TGT = ['first', 'last', 'strong', 'close'], TGTN = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };
  const r5 = c => Math.max(5, Math.round(c * 0.8 / 5) * 5);   // everything 20% cheaper than the first version
  for (const k in TW) { TW[k].cost = r5(TW[k].cost); for (const P of TW[k].paths) for (const u of P.t) u.cost = r5(u.cost); }

  /* ---------- fusing ---------- */
  const FUSE_FEE = 150, FUSE_RANGE = 72;
  const ORCH = { 'dart+farm': 1.2, 'farm+tack': 1.2, 'boomer+farm': 1.2, 'bomb+farm': 1.3, 'farm+ice': 1.6, 'farm+glue': 1.4, 'farm+sniper': 1.3, 'farm+wizard': 1.6, 'farm+mech': 1.4, 'farm+laser': 2.2 };
  const RANK = { snipe: 5, proj: 5, tack: 5, bomb: 5, ring: 5, glue: 3, ice: 2, farm: 1 };
  const NAMED = { 'bomb+dart': ['Grenadier', 'Darts explode on impact'], 'dart+ice': ['Frostbite Scout', 'Darts freeze what they hit'],
    'ice+tack': ['Blizzard Wheel', 'Tacks freeze what they hit'], 'bomb+tack': ['Mine Spinner', 'Tacks explode'], 'bomb+ice': ['Cryo Mortar', 'Blasts freeze everything they touch'],
    'bomb+glue': ['Napalm Launcher', 'Blasts set balloons on fire and glue them'], 'sniper+wizard': ['Arc Rifle', 'Shots chain lightning to 6 balloons'],
    'bomb+sniper': ['Artillery', 'Every shot lands as a big explosion'], 'ice+wizard': ['Frost Mage', 'Bolts freeze, burn and pop anything'],
    'tack+wizard': ['Spell Wheel', 'Fires a ring of burning bolts'], 'laser+wizard': ['Prism', 'Beams split into lightning'], 'laser+sniper': ['Railgun', 'Huge damage that tears through blimps'],
    'boomer+glue': ['Tar Glaive', 'Glaives glue everything they cut'], 'dart+sniper': ['Longshot', 'Fast, deadly darts across the whole map'],
    'bomb+boomer': ['Blastrang', 'Boomerangs explode on every hit'], 'glue+ice': ['Slush Gun', 'Glue that freezes solid'], 'dart+tack': ['Porcupine', 'Sprays darts in a ring'],
    'dart+farm': ['Fruit Thrower', 'Throws fruit, 120% orchard income, $1 extra per pop'],
    'farm+tack': ['Seed Spitter', 'Sprays seeds in a ring, 120% income, $1 extra per pop'],
    'boomer+farm': ['Banana Rang', 'Boomerangs that pay: 120% income, $1 extra per pop'],
    'bomb+farm': ['Coconut Mortar', 'Explosive coconuts, 130% income, $1 extra per pop'],
    'farm+ice': ['Cold Storage', 'Freezes balloons, 160% income, $1 extra per pop'],
    'farm+glue': ['Honey Farm', 'Sticky honey slows balloons, 140% income, $1 extra per pop'],
    'farm+sniper': ['Bounty Hunter', 'Long-range shots, 130% income, $1 extra per pop, supply drops'],
    'farm+wizard': ['Alchemist Grove', 'Turns magic into gold: 160% income, $1 extra per pop'],
    'farm+mech': ['Harvester', 'Lays spikes on the track, 140% income, $1 extra per pop'],
    'farm+laser': ['Solar Farm', 'A sun-powered blaster, 220% income, $1 extra per pop'] };
  const TWIN = { dart: 'Twin Scout', tack: 'Tack Cyclone', boomer: 'Double Boomer', bomb: 'Twin Mortar', ice: 'Glacier Heart', glue: 'Glue Tank', sniper: 'Twin Marksman', wizard: 'Archmage', farm: 'Grand Orchard', mech: 'Master Mechanic', laser: 'Twin Sun' };
  // Two different towers: the stronger kind leads and the other adds its trick.
  function fuseStats(A, B) {
    const pa = RANK[A.s.kind] || 0, pb = RANK[B.s.kind] || 0;
    const [P, Q] = pa > pb || (pa === pb && A.spent >= B.spent) ? [A, B] : [B, A];
    const s = JSON.parse(JSON.stringify(P.s)), q = Q.s, qk = Q.k;
    s.range = Math.max(s.range || 0, q.range || 0) * 1.05; s.rate = (s.rate || 1) * 0.85; s.camo = s.camo || q.camo; s.bigBonus = Math.max(s.bigBonus || 1, q.bigBonus || 1);
    if (s.kind !== 'farm' && s.kind !== 'ice') { s.dmg = (s.dmg || 1) + 1; s.pierce = (s.pierce || 1) + Math.max(2, Math.round((q.pierce || 2) / 2)); }
    if (q.type && s.type && q.type !== s.type && q.type !== 'none' && q.type !== 'cold') s.type = 'any';
    if (qk === 'ice') { s.frz = (q.freeze || 1) * 0.6; if (q.aura) s.aura = q.aura; if (q.dmg) s.dmg = (s.dmg || 0) + q.dmg; }
    else if (qk === 'glue') { s.slow = q.slow; s.slowDur = q.slowDur; s.corr = q.corr; s.bigGlue = q.bigGlue; }
    else if (qk === 'bomb') { s.splash = Math.round((q.radius || 38) * 0.85); s.splashDmg = q.dmg || 1; if (q.stun) s.frz = Math.max(s.frz || 0, q.stun); }
    else if (qk === 'wizard') { s.burn = 1; s.chain = Math.max(s.chain || 0, q.chain || 2); s.type = 'any'; }
    else if (qk === 'sniper') { s.range += 60; s.dmg = (s.dmg || 1) + Math.ceil((q.dmg || 2) / 2); }
    else if (qk === 'tack') { if (s.kind === 'snipe') s.shrap = 1; else s.shots = (s.shots || 1) + 2; }
    else if (qk === 'dart') { s.pierce = (s.pierce || 1) + 2; s.rate *= 0.85; }
    else if (qk === 'boomer') { s.pierce = (s.pierce || 1) + 4; s.bigBonus += 1; }
    else if (qk === 'laser') { s.rate *= 0.5; s.dmg = (s.dmg || 1) + 1; }
    else if (qk === 'mech') { s.traps = 1; s.trapP = 8; s.trapRate = 3; s.trapType = 'any'; s.tune = Math.max(s.tune || 1, 1.1); }
    // orchard hybrids keep the full harvest, pay $1 extra per pop, and get Market Day
    const key = [A.k, B.k].sort().join('+'), nm = NAMED[key];
    if (q.income) { s.income = Math.round(q.income * (q.mul || 1) * (ORCH[key] || 1.2)); s.bounty = 1; s.ability = s.ability || 'harvest'; s.mul = 1; }
    s.ability = s.ability || q.ability;
    // named hybrids get an extra trick
    if (key === 'sniper+wizard') s.chain = 6;
    if (key === 'bomb+sniper') { s.splash = 70; s.splashDmg = (s.splashDmg || 1) + 2; }
    if (key === 'laser+sniper') { s.dmg *= 2; s.bigBonus *= 2; s.type = 'any'; }
    if (key === 'tack+wizard') { s.type = 'any'; s.burn = 1; }
    if (key === 'bomb+glue') s.burn = 1;
    if (key === 'dart+sniper') { s.range = 999; s.kind = 'snipe'; s.rate *= 0.6; }
    if (key === 'glue+ice') s.frz = 1.2;
    if (key === 'bomb+ice') s.stun = 1;
    if (key === 'farm+sniper') s.ability = 'drop';
    if (key === 'farm+glue') { s.slow = 0.4; s.slowDur = 6; }
    const name = (A.twin || B.twin ? 'Twin-powered ' : '') + (nm ? nm[0] : TW[P.k].n.split(' ')[0] + '-' + TW[Q.k].n.split(' ').slice(-1)[0]);
    return { s, name, note: nm ? nm[1] : 'Mixes ' + TW[P.k].n + ' with ' + TW[Q.k].n, prim: P.k, sec: Q.k };
  }
  const RULES = { classic: { n: 'Classic', cash: 900, lives: 150, bonus: 110, d: 'Survive as many waves as you can.' },
    relaxed: { n: 'Relaxed', cash: 1000, lives: 250, bonus: 120, spd: 0.85, disc: 0.85, d: 'Slower balloons, more lives, cheaper towers.' },
    rush: { n: 'Rush', cash: 900, lives: 150, bonus: 220, brk: 1.5, spd: 1.1, d: 'No breathers between waves, double pay.' },
    deflation: { n: 'Deflation', cash: 6000, lives: 150, bonus: 0, noIncome: 1, d: '$6,000 now and not a cent more.' },
    sandbox: { n: 'Sandbox', cash: 999999, lives: 999999, bonus: 110, sandbox: 1, d: 'Endless cash and lives. Try any tower or combo.' } };
  const SOLO_KEYS = Object.keys(RULES);
  function stats(t) {
    const T = TW[t.k];
    const s = t.fu ? { tgt: 'first', ...JSON.parse(JSON.stringify(t.fu.base)) } : { kind: T.kind, camo: 0, bigBonus: 1, tgt: 'first', ...T.base };
    for (let p = 0; p < 3; p++) for (let i = 0; i < (t.up ? t.up[p] : 0); i++) T.paths[p].t[i].f(s);
    // twins: two of the same tower fused
    if (t.twin) {
      if (s.rate) s.rate *= 0.75; if (s.dmg) s.dmg += 1; if (s.pierce) s.pierce += 3; if (s.range && s.range < 900) s.range *= 1.12; if (s.freeze) s.freeze *= 1.3; if (s.radius) s.radius *= 1.2; if (s.trapP) s.trapP *= 2;
      if (s.kind !== 'farm') s.camo = 1; s.bigBonus = (s.bigBonus || 1) * 1.5;
      if (s.income) { s.income = Math.round(s.income * 2); s.bounty = 1; s.ability = s.ability || 'harvest'; }
    }
    return s;
  }
  // Two paths at most, only one past tier 1; a twin has no limit.
  function canUp(t, p) { const u = t.up.slice(); if (u[p] >= 3) return false; if (t.twin) return true; u[p]++; return u.filter(x => x > 0).length <= 2 && u.filter(x => x >= 2).length <= 1; }
  const towerName = t => (t.fu ? t.fu.name : t.twin ? TWIN[t.k] : TW[t.k].n);

  /* waves on a fixed clock. A star means camo. */
  const WAVES = [[['red', 14, 0.6]], [['red', 24, 0.45]], [['red', 12, 0.4], ['blue', 10, 0.6]], [['blue', 22, 0.45]], [['blue', 12, 0.4], ['green', 12, 0.5]],
    [['green', 20, 0.4], ['yellow', 4, 0.8]], [['yellow', 14, 0.5]], [['green', 24, 0.3], ['yellow', 12, 0.45]], [['pink', 12, 0.55]], [['black', 8, 0.7], ['yellow', 12, 0.4], ['blue*', 8, 0.5]],
    [['lead', 4, 1.2], ['pink', 14, 0.4]], [['ceramic', 4, 1.2], ['black', 10, 0.45], ['green*', 8, 0.45]], [['lead', 8, 0.8], ['ceramic', 6, 0.9]], [['pink', 40, 0.2], ['yellow*', 10, 0.35]], [['ceramic', 12, 0.7]],
    [['blimp', 1, 1], ['pink', 20, 0.3]], [['lead', 14, 0.5], ['ceramic', 10, 0.6], ['pink*', 12, 0.3]], [['ceramic', 20, 0.45]], [['blimp', 2, 4], ['black', 20, 0.3], ['ceramic*', 4, 1]], [['blimp', 3, 3], ['ceramic', 16, 0.4]],
    [['smog', 10, 0.6], ['ceramic', 10, 0.5]], [['ironclay', 6, 1], ['lead', 12, 0.4]], [['claybarge', 1, 1], ['ceramic', 16, 0.35]], [['smog', 20, 0.35], ['blimp', 2, 3]], [['ironclay', 12, 0.6], ['ceramic*', 10, 0.5]],
    [['claybarge', 2, 4], ['smog', 12, 0.4]], [['ironside', 1, 1], ['ironclay', 10, 0.6]], [['blimp', 5, 2], ['lead', 20, 0.3]], [['claybarge', 3, 3], ['ironclay*', 6, 0.8]], [['ironside', 2, 4], ['smog*', 14, 0.4]],
    [['twin', 1, 1], ['ceramic', 30, 0.25]], [['claybarge', 5, 2.5], ['ironclay', 16, 0.4]], [['ironside', 4, 3], ['smog', 20, 0.3]], [['twin', 2, 6], ['claybarge', 3, 3]], [['ironside', 6, 2.4], ['ironclay*', 20, 0.35]],
    [['twin', 3, 5], ['blimp', 8, 1.2]], [['claybarge*', 6, 2], ['ironside', 5, 2.5]], [['twin', 4, 4], ['smog*', 30, 0.2]], [['twin', 5, 3.5], ['ironside', 6, 2]], [['twin', 8, 2.8], ['claybarge', 8, 1.6]]];
  function wave(n) {
    if (n <= WAVES.length) return WAVES[n - 1];
    const x = n - WAVES.length, base = WAVES[WAVES.length - 4 + ((n - 1) % 4)], m = Math.pow(1.15, x);
    return base.map(([k, c, g]) => [k, Math.ceil(c * m), Math.max(0.12, g * Math.pow(0.93, x))]).concat([['twin', 1 + Math.floor(x / 3), 3], ['ironclay*', 4 + x, 0.4]]);
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
    if (t.twin) { ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.stroke(); }
    ctx.fillStyle = P.shade; ctx.beginPath(); ctx.ellipse(x, y + 10, 12, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = T.col; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    const poly = (n, r, rot) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const q = rot + i * Math.PI * 2 / n; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
    const barrel = (len, wd) => { ctx.strokeStyle = P.ink; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); };
    const dot = r => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
    if (t.fu) {
      // a hybrid: its two parents' colours split down the middle, a star on top
      ctx.fillStyle = t.fu.ca; ctx.beginPath(); ctx.arc(x, y, 13, Math.PI / 2, Math.PI * 1.5); ctx.fill();
      ctx.fillStyle = t.fu.cb; ctx.beginPath(); ctx.arc(x, y, 13, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke(); barrel(16, 4);
      ctx.fillStyle = '#fff'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const q = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 5.5; ctx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); } ctx.closePath(); ctx.fill();
    }
    else if (t.k === 'ice') { poly(6, 12, 0); ctx.strokeStyle = '#fff'; for (let i = 0; i < 3; i++) { const q = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(q) * 7, y - Math.sin(q) * 7); ctx.lineTo(x + Math.cos(q) * 7, y + Math.sin(q) * 7); ctx.stroke(); } }
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
    if (K.col2) {   // a fused balloon: right half in the second colour, a gold seam
      ctx.save(); ctx.clip(); ctx.fillStyle = K.col2; ctx.fillRect(x, y - 10 * s, 9 * s, 20 * s); ctx.restore();
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x, y + 9 * s); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, 7.5 * s, 9 * s, 0, 0, 7);
    }
    if (k === 'lead' || k === 'ceramic' || k === 'black' || k === 'ironclay' || k === 'smog') { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - 2.5 * s, y - 3.5 * s, 2 * s, 3 * s, -0.4, 0, 7); ctx.fill();
  }

  /* ---------- a board: one player's defence ---------- */
  let uid = 0;
  class Board {
    constructor(opt) { this.opt = opt; this.R = opt.rules || RULES.classic; this.human = true; this.reset(); }
    reset() {
      this.t = 0; this.cash = this.R.cash; this.lives = this.R.lives; this.traps = []; this.inc = 0; this.wave = 0; this.towers = []; this.bl = []; this.pr = []; this.fx = []; this.queue = [];
      this.pick = null; this.selT = null; this.fuseFrom = null; this.dead = false; this.deadT = 0; this.pops = 0; this.mergeT = 0; this.seenFz = {};
      this.tab = 'towers'; this.msg = ''; this.msgT = 0;
    }
    sfx(n) { this.opt.sfx(n); }
    price(c) { return Math.max(5, Math.round(c * (this.R.disc || 1) / 5) * 5); }
    free(c, r) { return c >= 0 && r >= 0 && c < GC && r < GR && !PATH.has(c + ',' + r) && !this.towers.some(t => t.c === c && t.r === r); }
    canFuse(a, b) { return !!(a && b && a !== b && !a.fu && !b.fu && !(a.k === b.k && (a.twin || b.twin)) && Math.hypot(a.x - b.x, a.y - b.y) <= FUSE_RANGE); }
    startFuse(t) {
      if (t.fu) { this.say('Hybrids can’t fuse again'); return; }
      this.fuseFrom = t; this.pick = null; this.say('Click a tower nearby: same kind = twin, other kind = hybrid'); this.opt.sfx('click');
    }
    fuse(a, b) {
      const fee = this.price(FUSE_FEE);
      if (!this.canFuse(a, b)) { this.say(b.fu ? 'Hybrids can’t fuse again' : a.k === b.k ? 'A twin can’t take a third copy' : 'Too far away: two squares at most'); return false; }
      if (this.cash < fee) { this.say('Fusing costs $' + fee); return false; }
      this.cash -= fee;
      if (a.k === b.k) {   // twin: keeps the best upgrades of both, no path limit
        a.up = a.up.map((v, i) => Math.max(v, b.up[i])); a.twin = true; a.spent += b.spent + fee; a.abCd = 0; a.s = stats(a);
        this.towers = this.towers.filter(x => x !== b); this.fx.push({ x: a.x, y: a.y, t: 0, kind: 'ring', r: 40 });
        this.sfx('merge'); this.say(TWIN[a.k] + '!'); this.fuseFrom = null; this.selT = a; return true;
      }
      const F = fuseStats(a, b);
      const n = { k: 'fuse', c: a.c, r: a.r, x: a.x, y: a.y, up: [0, 0, 0], cd: 0, spent: a.spent + b.spent + fee, ang: 0, abCd: 0, boost: 0,
        fu: { base: F.s, name: F.name, note: F.note, ca: TW[F.prim].col, cb: TW[F.sec].col, ka: F.prim, kb: F.sec } };
      n.s = stats(n); n.tgt = n.s.tgt;
      this.towers = this.towers.filter(x => x !== a && x !== b); this.towers.push(n);
      this.fx.push({ x: n.x, y: n.y, t: 0, kind: 'ring', r: 40 }); this.sfx('merge'); this.say(F.name + '!');
      this.fuseFrom = null; this.selT = n; return true;
    }
    tap(c, r) {
      if (this.dead) return;
      const hit = this.towers.find(t => t.c === c && t.r === r);
      if (this.fuseFrom) {
        const a = this.fuseFrom;
        if (hit && hit !== a) this.fuse(a, hit); else { this.fuseFrom = null; this.say('Fusion cancelled'); }
        return;
      }
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
    sell(t) { this.cash += Math.floor(t.spent * 0.7); this.towers = this.towers.filter(x => x !== t); this.selT = null; if (this.fuseFrom === t) this.fuseFrom = null; this.sfx('move'); }
    say(m) { this.msg = m; this.msgT = 1.3; }
    spawn(key, d, camo) { const k = key.replace('*', ''), b = { id: ++uid, k, hp: KIND[k].hp, d: d || 0, fz: 0, gl: 0, gs: 1, gc: 0, ca: 0, burn: 0, ba: 0, kb: 0, slowT: 0, camo: camo || key.endsWith('*') }; this.bl.push(b); return b; }
    bounty() { return this.towers.some(t => t.s.bounty); }
    hitB(b, dmg, type) {
      if (b.dead || dmg <= 0) return false; const K = KIND[b.k];
      if (type === 'none') return false;
      if (immune(K, type)) return false;
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
      else if (s.ability === 'burst') { for (const h of this.towers) { if (!h.fu) continue; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; this.pr.push({ k: 'fused', x: h.x, y: h.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, life: 0.6, pierce: 8, dmg: 3, type: 'any', size: 13, hit: new Set(), bigBonus: 2, burn: 1 }); } } }
      else if (s.ability === 'spikestorm') { for (let i = 0; i < 26; i++) { const d = LEN * (i + 0.5) / 26, q = at(d); this.traps.push({ d, x: q[0], y: q[1], p: 10, type: 'any', life: 15, hit: new Set() }); } }
      else if (s.ability === 'overclock') { for (const o of this.towers) if (Math.hypot(o.x - t.x, o.y - t.y) <= s.range) o.boost = 6; }
      else if (s.ability === 'harvest') this.cash += 300;
      else if (s.ability === 'overcharge') t.boost = 8;
      else if (s.ability === 'meteor') { let best = null; for (const b of this.bl) if (!best || rbe(b.k) > rbe(best.k)) best = b; if (best) { const p = at(best.d); this.hitB(best, 300, 'any'); this.fx.push({ x: p[0], y: p[1], t: 0, kind: 'boom', r: 40 }); } }
    }
    hitProj(p, b) {
      const K = KIND[b.k];
      if (p.k !== 'glue' && p.slow && (!K.big || p.bigGlue)) { b.gl = p.slowDur; b.gs = Math.min(b.gs < 1 && b.gl > 0 ? b.gs : 1, p.slow); b.gc = Math.max(b.gc, p.corr || 0); }
      if (p.frz && !K.big) b.fz = Math.max(b.fz, p.frz);
      if (p.k === 'glue') { if (K.big && !p.bigGlue) return true; b.gl = p.slowDur; b.gs = Math.min(b.gs < 1 && b.gl > 0 ? b.gs : 1, p.slow); b.gc = Math.max(b.gc, p.corr || 0); return true; }
      const ok = this.hitB(b, p.dmg * (K.big ? p.bigBonus : 1), p.type);
      if (ok) {
        if (p.burn) b.burn = 3;
        if (p.kb) b.kb = 1;
        if (p.splash) { const q = at(b.d); this.blast(q[0], q[1], p.splash, p.splashDmg || 1, 'any', p.frz, p.bigBonus); }
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
      this.t += dt; this.msgT = Math.max(0, this.msgT - dt);
      if (this.R.sandbox) this.cash = Math.max(this.cash, this.R.cash);
      while (waveStart(this.wave + 1, this.R.brk) <= this.t) {
        this.wave++; this.queueWave(this.wave);
        if (this.wave > 1 && !this.R.noIncome) this.cash += (this.R.bonus ?? 100) + this.inc;
        let farm = 0; if (!this.R.noIncome) for (const t of this.towers) if (t.s.income) farm += Math.round(t.s.income * (t.s.mul || 1));
        if (farm) { this.cash += farm; this.say('+$' + farm + ' from orchards'); }
        const fz = wave(this.wave).map(w => w[0].replace('*', '')).filter(k => KIND[k].col2);
        if (fz.length && !this.seenFz[fz[0]]) { this.seenFz[fz[0]] = 1; this.say('New fused balloon: ' + LABEL[fz[0]]); }
        else if (this.wave === 12) this.say('Balloons can now merge on the track');
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
      this.mergeStep(dt);
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
    // From wave 12 two balloons side by side can merge into a fused balloon (more often as the waves climb).
    mergeStep(dt) {
      this.mergeT -= dt;
      if (this.wave < 12 || this.mergeT > 0) return;
      this.mergeT = 0.5; const ch = Math.min(0.6, 0.12 + (this.wave - 12) * 0.025);
      const live = this.bl.filter(b => !b.dead).sort((a, b) => a.d - b.d);
      for (let i = 0; i + 1 < live.length; i++) {
        const a = live[i], b = live[i + 1];
        if (a.dead || b.dead || Math.abs(a.d - b.d) > 7) continue;
        const res = BMERGE[[a.k, b.k].sort().join('+')]; if (!res || Math.random() > ch) continue;
        a.dead = true; b.dead = true;
        const nb = this.spawn(res, Math.max(a.d, b.d), a.camo || b.camo); nb.fz = 0; const q = at(nb.d);
        this.fx.push({ x: q[0], y: q[1], t: 0, kind: 'ring', r: 26 });
        this.say(LABEL[a.k] + ' + ' + LABEL[b.k] + ' fused into ' + LABEL[res]);
      }
      this.bl = this.bl.filter(b => !b.dead);
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
        this.hitB(tg, s.dmg * (KIND[tg.k].big ? s.bigBonus : 1), s.type); if (s.frz && !KIND[tg.k].big) tg.fz = Math.max(tg.fz, s.frz); if (s.burn) tg.burn = 3;
        if (s.splash) this.blast(tp[0], tp[1], s.splash, s.splashDmg || 1, 'any', s.frz, s.bigBonus);
        if (s.chain) { let n = s.chain; for (const o of this.bl) { if (n <= 0) break; if (o === tg || o.dead) continue; const r = at(o.d); if (Math.hypot(r[0] - tp[0], r[1] - tp[1]) < 80) { this.hitB(o, Math.max(1, Math.ceil(s.dmg / 2)), 'any'); this.fx.push({ x: tp[0], y: tp[1], x2: r[0], y2: r[1], t: 0, kind: 'zap' }); n--; } } }
        this.fx.push({ x: t.x, y: t.y, x2: tp[0], y2: tp[1], t: 0, kind: 'shot' });
        if (s.shrap) for (const o of this.bl.slice()) { if (o === tg || o.dead) continue; const q = at(o.d); if (Math.hypot(q[0] - tp[0], q[1] - tp[1]) < 34) this.hitB(o, 1, 'any'); }
        return;
      }
      if (s.kind === 'bomb') {
        const d = Math.hypot(tp[0] - t.x, tp[1] - t.y) || 1;
        this.pr.push({ k: 'bomb', x: t.x, y: t.y, vx: (tp[0] - t.x) / d * s.speed, vy: (tp[1] - t.y) / d * s.speed, life: d / s.speed, dmg: s.dmg, radius: s.radius, cluster: s.cluster, stun: s.stun, bigBonus: s.bigBonus,
          burn: s.burn, frz: s.frz, slow: s.slow, slowDur: s.slowDur, corr: s.corr, chain: s.chain });
        return;
      }
      if (s.kind === 'tack') {
        for (let i = 0; i < s.shots; i++) { const a = i / s.shots * Math.PI * 2; this.pr.push({ k: t.fu ? 'fused' : 'dart', x: t.x, y: t.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, life: s.range / s.speed, pierce: s.pierce, dmg: s.dmg, type: s.type, size: s.size, hit: new Set(), bigBonus: s.bigBonus,
          splash: s.splash, splashDmg: s.splashDmg, burn: s.burn, chain: s.chain, slow: s.slow, slowDur: s.slowDur, corr: s.corr, frz: s.frz }); }
        return;
      }
      const n = s.shots || 1;
      const look = s.kind === 'glue' ? 'glue' : t.k === 'wizard' ? 'bolt' : t.k === 'boomer' ? 'rang' : t.k === 'laser' ? 'laser' : t.k === 'mech' ? 'nail' : t.fu ? 'fused' : s.ball ? 'ball' : 'dart';
      for (let i = 0; i < n; i++) {
        const a = t.ang + (i - (n - 1) / 2) * 0.2;
        this.pr.push({ k: look, x: t.x, y: t.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, life: s.range * 1.5 / s.speed, pierce: s.pierce, dmg: s.dmg, type: s.type, size: s.size, hit: new Set(),
          bigBonus: s.bigBonus, splash: s.splash, splashDmg: s.splashDmg, burn: s.burn, chain: s.chain, kb: s.kb, slow: s.slow, slowDur: s.slowDur, corr: s.corr, bigGlue: s.bigGlue, frz: s.frz });
      }
    }
    projStep(dt) {
      for (const p of this.pr) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.k === 'bomb') {
          let boom = p.life <= 0;
          if (!boom) for (const b of this.bl) { if (b.dead) continue; const q = at(b.d); if (Math.hypot(q[0] - p.x, q[1] - p.y) < (KIND[b.k].big ? 24 : 12)) { boom = true; break; } }
          if (boom) {
            p.life = 0;
            if (p.burn || p.frz || p.slow) for (const b of this.bl) { if (b.dead) continue; const q = at(b.d); if (Math.hypot(q[0] - p.x, q[1] - p.y) <= p.radius) { if (p.burn) b.burn = 3; if (p.frz && !KIND[b.k].big) b.fz = Math.max(b.fz, p.frz); if (p.slow) { b.gl = p.slowDur || 4; b.gs = p.slow; b.gc = Math.max(b.gc, p.corr || 0); } } }
            this.blast(p.x, p.y, p.radius, p.dmg, p.burn || p.chain ? 'any' : 'boom', p.stun || p.frz, p.bigBonus);
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
  const num = v => typeof v === 'number' && isFinite(v);

  Ludus.register({
    id: 'popfusion', name: 'Pop Fusion', aka: 'balloon tower defence with fusing', tag: 'Arcade', wide: true, tint: '#c4683a',
    hint: 'Pick a tower, click grass to build · click a tower to upgrade or <b>Fuse</b> it with one nearby · <kbd>1</kbd>-<kbd>0</kbd> towers · <kbd>F</kbd> fuse · <kbd>Space</kbd> speed',
    _rules: { TW, KIND, BMERGE, wave, waveStart, canUp, stats, fuseStats, Board },
    art(ctx, w, h) {
      // drawn in a 160 x 110 box scaled evenly, so the cover keeps its shape at every card size
      const s = Math.min(w / 160, h / 110);
      ctx.save(); ctx.translate(w / 2 - 80 * s, h / 2 - 55 * s); ctx.scale(s, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pts = [[-10, 78], [46, 78], [46, 28], [114, 28], [114, 80], [170, 80]];
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
      path(); ctx.strokeStyle = 'rgba(80,40,10,0.25)'; ctx.lineWidth = 22; ctx.stroke();
      path(); ctx.strokeStyle = 'rgba(255,240,222,0.85)'; ctx.lineWidth = 17; ctx.stroke();
      const P = { ink: '#22261f', shade: 'rgba(0,0,0,0.18)' };
      [[14, 78, 'red'], [46, 52, 'smog'], [78, 28, 'ironclay'], [114, 46, 'blue']].forEach(([x, y, k]) => drawBalloon(ctx, x, y - 3, k, P, 0.95));
      drawTower(ctx, { k: 'fuse', x: 80, y: 62, ang: -2.2, up: [1, 1, 0], fu: { ca: TW.bomb.col, cb: TW.wizard.col } }, P);
      drawTower(ctx, { k: 'dart', x: 140, y: 50, ang: 2.6, up: [0, 0, 0], twin: true }, P);
      ctx.restore();
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx, canvas } = view;
      let rule = 'classic', phase = 'menu', clock = 0, speed = 1, B = null, overT = 0, lastPop = 0, menuHover = null;
      let hits = [], mouse = null, restored = false, tipText = '';

      function makeBoard() {
        B = new Board({ rules: RULES[rule], live: () => phase === 'play', sfx: n => api.sfx(n),
          pop: () => { const now = performance.now(); if (now - lastPop > 70) { lastPop = now; api.sfx('tick'); } } });
      }
      function startRun(r) {
        if (r && RULES[r]) rule = r;
        makeBoard(); clock = 0; speed = 1; phase = 'play';
        api.score(0); api.sfx('score');
      }
      makeBoard();

      /* ---------- layout: the track keeps the board's 3:2 shape, the panel takes what is left ---------- */
      const TOP = 56;
      function layout() {
        const w = view.w, h = view.h, wide = w >= 600 && w > h * 1.15;
        if (wide) {
          const pw = Math.max(220, Math.min(300, w * 0.3)), bw = Math.max(60, Math.min(w - 30 - pw, (h - TOP - 8) * 1.5)), bh = bw / 1.5;
          const by = TOP + Math.max(0, (h - TOP - 8 - bh) / 2);
          return { board: { x: 10, y: by, w: bw, h: bh }, panel: { x: 20 + bw, y: TOP, w: w - 30 - bw, h: h - TOP - 8 } };
        }
        const bw = Math.max(60, Math.min(w - 20, (h - TOP - 216) * 1.5)), bh = bw / 1.5;
        return { board: { x: (w - bw) / 2, y: TOP, w: bw, h: bh }, panel: { x: 10, y: TOP + bh + 8, w: w - 20, h: Math.max(40, h - TOP - bh - 16) } };
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
      api.on(canvas, 'contextmenu', e => { e.preventDefault(); if (B) { B.pick = null; B.selT = null; B.fuseFrom = null; } });
      api.keys(e => {
        if (phase !== 'play' || !B) return;
        if (e.key === ' ') { speed = speed >= 3 ? 1 : speed + 1; api.sfx('click'); return; }
        if ((e.key === 'f' || e.key === 'F') && B.selT && B.towers.includes(B.selT)) { if (B.fuseFrom === B.selT) B.fuseFrom = null; else B.startFuse(B.selT); return; }
        const n = '1234567890'.indexOf(e.key);
        if (n >= 0 && TKEYS[n]) { const k = TKEYS[n]; B.pick = B.pick === k ? null : k; B.selT = null; B.fuseFrom = null; B.tab = 'towers'; api.sfx('click'); }
      });

      /* ---------- drawing ---------- */
      let col = api.colors(), P = pal(col);
      const fillBase = () => (col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)');
      const fillHover = () => (col.dark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.08)');
      const GOLD = '#f2c230';

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
      function gridFor(n, cw, ch, gap) {
        for (let cols = 2; cols <= n; cols++) {
          const rows = Math.ceil(n / cols), bh = (ch - (rows - 1) * gap) / rows;
          if (bh >= 33 || cols === n) return { cols, rows, bw: (cw - (cols - 1) * gap) / cols, bh: Math.min(46, bh) };
        }
        return { cols: n, rows: 1, bw: (cw - (n - 1) * gap) / n, bh: Math.min(46, ch) };
      }

      function drawBalloonOnTrack(b) {
        const [x, y] = at(b.d), K = KIND[b.k];
        if (K.big) {
          const bw = K.big > 1 ? 32 : 24, bh = K.big > 1 ? 16 : 12;
          ctx.fillStyle = K.col; ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, 0, 7); ctx.fill();
          if (K.col2) { ctx.save(); ctx.clip(); ctx.fillStyle = K.col2; ctx.fillRect(x - bw, y, bw * 2, bh); ctx.restore(); ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, 0, 7); }
          ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
          if (b.camo) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#2e4a22'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 14, y - bh - 4, 28 * Math.max(0, b.hp / K.hp), 3);
          return;
        }
        drawBalloon(ctx, x, y, b.k, P);
        if (b.camo) { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 7.5, 9, 0, 0, 7); ctx.clip(); ctx.fillStyle = 'rgba(46,74,34,0.55)'; ctx.fillRect(x - 8, y - 6, 6, 4); ctx.fillRect(x + 1, y - 1, 7, 5); ctx.fillRect(x - 6, y + 4, 5, 4); ctx.restore(); }
        if (K.hp > 1 && b.hp < K.hp) { ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 1, y); ctx.lineTo(x - 2, y + 5); ctx.stroke(); }
        if (b.fz > 0) { ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 9.5, 11, 0, 0, 7); ctx.stroke(); }
        if (b.gl > 0) { ctx.fillStyle = 'rgba(214,190,60,0.7)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 6, 3, 0, 0, 7); ctx.fill(); }
        if (b.burn > 0) { ctx.fillStyle = 'rgba(255,120,30,0.8)'; ctx.beginPath(); ctx.arc(x + 5, y - 7, 2.5, 0, 7); ctx.fill(); }
      }
      function drawProjectile(p) {
        const dotP = (c, r, ring) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke(); } };
        if (p.k === 'bomb') return dotP(P.ink, 4.5);
        if (p.k === 'glue') return dotP('#d6be3c', 4);
        if (p.k === 'fused') return dotP(GOLD, 4.5, '#e5483d');
        if (p.k === 'bolt') return dotP('#6f8bff', 4);
        if (p.k === 'ball') return dotP('#555', 7);
        if (p.k === 'rang') { ctx.strokeStyle = '#7a5bc2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI); ctx.stroke(); return; }
        const a = Math.atan2(p.vy, p.vx); ctx.strokeStyle = p.k === 'laser' ? '#f2b81c' : p.k === 'nail' ? '#8a8f98' : P.ink; ctx.lineWidth = p.k === 'laser' ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * 9, p.y - Math.sin(a) * 9); ctx.stroke();
      }
      function drawFx(f) {
        const k = 1 - f.t / 0.35; ctx.globalAlpha = Math.max(0, k);
        if (f.kind === 'pop') { ctx.strokeStyle = f.col; ctx.lineWidth = 2; const rr = (f.big ? 20 : 8) + (1 - k) * 10; for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * rr * 0.5, f.y + Math.sin(a) * rr * 0.5); ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr); ctx.stroke(); } }
        else if (f.kind === 'boom') { ctx.fillStyle = 'rgba(255,150,40,0.45)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.3), 0, 7); ctx.fill(); }
        else if (f.kind === 'ring') { ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.6), 0, 7); ctx.stroke(); }
        else if (f.kind === 'fire') { ctx.strokeStyle = 'rgba(255,110,30,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.4), 0, 7); ctx.stroke(); }
        else if (f.kind === 'zap') { ctx.strokeStyle = '#9fb4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo((f.x + f.x2) / 2 + 6, (f.y + f.y2) / 2 - 6); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        else if (f.kind === 'shot') { ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }

      function drawBoard(R) {
        const s = R.w / W;
        ctx.save();
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        D.roundRect(ctx, R.x, R.y, R.w, R.h, 12); ctx.fillStyle = P.grass; ctx.fill(); ctx.restore();
        D.roundRect(ctx, R.x, R.y, R.w, R.h, 12); ctx.clip();
        ctx.translate(R.x, R.y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.fillStyle = P.grass2; for (let c = 0; c < GC; c++) for (let r = 0; r < GR; r++) if ((c + r) % 2) ctx.fillRect(c * CS, r * CS, CS, CS);
        ctx.beginPath(); WP.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = P.edge; ctx.lineWidth = CS * 0.86; ctx.stroke(); ctx.strokeStyle = P.path; ctx.lineWidth = CS * 0.7; ctx.stroke();
        if (B.pick && mouse && phase === 'play' && inside(mouse, R.x, R.y, R.w, R.h)) {
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
        // fusing: the reach around the first tower, gold rings on every tower it can fuse with
        if (B.fuseFrom && B.towers.includes(B.fuseFrom)) {
          const a = B.fuseFrom; ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(a.x, a.y, FUSE_RANGE, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          for (const b of B.towers) if (B.canFuse(a, b)) { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, 17, 0, 7); ctx.stroke(); }
        }
        for (const t of B.towers) drawTower(ctx, t, P);
        for (const b of B.bl.slice().sort((a, c) => a.d - c.d)) drawBalloonOnTrack(b);
        for (const p of B.pr) drawProjectile(p);
        if (!api.reduceMotion) for (const f of B.fx) drawFx(f);
        ctx.restore();
        if (B.leak > 0) { ctx.save(); D.roundRect(ctx, R.x + 1, R.y + 1, R.w - 2, R.h - 2, 12); ctx.strokeStyle = col.bad; ctx.globalAlpha = B.leak / 0.4; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
        if (phase !== 'menu') drawHud(R);
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
        }
        if (phase === 'play') hit(R.x, R.y, R.w, R.h, p => B.tap(Math.floor((p.x - R.x) / s / CS), Math.floor((p.y - R.y) / s / CS)), B.pick || B.fuseFrom ? 'crosshair' : 'default');
      }
      function drawHud(R) {
        const lv = B.R.sandbox ? '∞ lives' : `${B.lives} lives`, cs = B.R.sandbox ? '$∞' : `$${B.cash}`;
        const s = lv + '  ·  ' + cs;
        ctx.save(); ctx.font = FONT(11, 700);
        const tw = Math.min(R.w - 16, ctx.measureText(s).width + 30);
        D.roundRect(ctx, R.x + 7, R.y + 7, tw, 22, 11); ctx.fillStyle = col.dark ? 'rgba(20,20,20,0.72)' : 'rgba(255,255,255,0.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(R.x + 18, R.y + 18, 4, 0, 7); ctx.fillStyle = col.accent; ctx.fill();
        fit1(ctx, s, R.x + 27, R.y + 18, tw - 26, 11, col.ink, 700, 'left');
        ctx.restore();
      }
      function card(cx, cy, w, big, small) {
        ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        D.roundRect(ctx, cx - w / 2, cy - 26, w, 52, 16); ctx.fill(); ctx.restore();
        fit1(ctx, big, cx, cy - 7, w - 20, 15, col.ink, 800); fit1(ctx, small, cx, cy + 12, w - 20, 11, col.ink2, 650);
      }
      const towerIcon = k => (x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(0.72, 0.72); drawTower(ctx, { k, x: 0, y: 0, up: [0, 0, 0], ang: -0.6 }, P); ctx.restore(); };
      const ownIcon = t => (x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(0.72, 0.72); drawTower(ctx, { ...t, x: 0, y: 0, up: [0, 0, 0], boost: 0, ang: -0.6 }, P); ctx.restore(); };

      function drawPanel(R) {
        tipText = '';
        ctx.save(); D.roundRect(ctx, R.x, R.y, R.w, R.h, 14); ctx.fillStyle = col.surface; ctx.fill();
        ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        const pad = 8, x = R.x + pad, w = R.w - pad * 2;
        const tabs = [['towers', 'Towers']];
        const abs = B.towers.filter(t => t.s.ability), ready = abs.filter(t => t.abCd <= 0).length;
        if (abs.length) tabs.push(['powers', ready ? `Powers ${ready}` : 'Powers']);
        if (!tabs.some(t => t[0] === B.tab)) B.tab = 'towers';
        const ty = R.y + pad, th = 26, tw = Math.min(78, (w * 0.62) / 2);
        tabs.forEach(([id, label], i) => button(x + i * (tw + 4), ty, tw, th, { label, on: !B.selT && B.tab === id, r: 13, size: 11,
          fn: () => { B.tab = id; B.selT = null; B.fuseFrom = null; if (id !== 'towers') B.pick = null; api.sfx('click'); } }));
        const infoX = x + tabs.length * (tw + 4) + 4, infoW = x + w - infoX;
        let info;
        const cy = ty + th + 6, chh = R.y + R.h - pad - cy;
        if (B.selT && B.towers.includes(B.selT)) info = drawUpgrades(B.selT, x, cy, w, chh);
        else if (B.tab === 'powers') info = drawPowers(abs, x, cy, w, chh);
        else info = drawShop(x, cy, w, chh);
        if (B.fuseFrom) info = 'Click a gold-ringed tower to fuse';
        if (infoW > 40) fit1(ctx, tipText || info, infoX + infoW, ty + th / 2, infoW, 10.5, col.ink2, 600, 'right', 8.5);
      }
      function drawShop(x, y, w, h) {
        const g = gridFor(TKEYS.length, w, h, 6);
        TKEYS.forEach((k, i) => {
          const c = i % g.cols, r = Math.floor(i / g.cols), price = B.price(TW[k].cost);
          button(x + c * (g.bw + 6), y + r * (g.bh + 6), g.bw, g.bh, { label: TW[k].n, alt: TW[k].short, sub: '$' + price, on: B.pick === k, dis: B.cash < price && B.pick !== k, icon: towerIcon(k), tip: TW[k].n + ': ' + TW[k].d,
            fn: () => { if (B.cash < price && B.pick !== k) { B.say('Not enough cash'); return; } B.pick = B.pick === k ? null : k; B.selT = null; B.fuseFrom = null; api.sfx('click'); } });
        });
        return B.pick ? 'Click grass to place ' + TW[B.pick].n : 'Pick a tower, then grass';
      }
      function drawPowers(abs, x, y, w, h) {
        const g = gridFor(Math.max(2, abs.length), w, h, 6);
        abs.forEach((t, i) => {
          const c = i % g.cols, r = Math.floor(i / g.cols), cd = t.abCd > 0;
          button(x + c * (g.bw + 6), y + r * (g.bh + 6), g.bw, g.bh, { label: ABIL[t.s.ability].n, sub: cd ? Math.ceil(t.abCd) + 's' : 'Ready', subColor: cd ? null : col.good, on: !cd, dis: cd || B.dead, icon: ownIcon(t), tint: col.good,
            fn: () => B.ability(t) });
        });
        return 'Abilities from tier 3 upgrades';
      }
      function towerNote(t) {
        const s = t.s;
        if (s.kind === 'farm') return '$' + Math.round(s.income * (s.mul || 1)) + ' a wave' + (s.bounty ? ', pops pay $1 extra' : '');
        let n = (s.camo ? 'Sees camo. ' : 'No camo. ') + (s.type === 'any' ? 'Pops lead and black.' : s.type === 'sharp' ? 'Can’t pop lead.' : s.type === 'boom' ? 'Can’t pop black.' : '');
        if (s.income) n += ' Earns $' + Math.round(s.income * (s.mul || 1)) + ' a wave.';
        return n;
      }
      function drawUpgrades(t, x, y, w, h) {
        const T = TW[t.k];
        const tgOk = t.s.kind !== 'farm' && t.s.kind !== 'ice' && t.s.kind !== 'ring';
        const fuseOk = !t.fu, fee = B.price(FUSE_FEE), fusing = B.fuseFrom === t;
        const about = t.fu ? t.fu.note + '. Made from ' + TW[t.fu.ka].n + ' and ' + TW[t.fu.kb].n + '.' : t.twin ? 'Two ' + T.n + 's fused: faster, stronger, sees camo, every path to tier 3.' : T.d;
        const sellBtn = (bx, by, bw, bh) => button(bx, by, bw, bh, { label: 'Sell $' + Math.floor(t.spent * 0.7), r: 12, size: 10.5, fn: () => B.sell(t) });
        const tgBtn = (bx, by, bw, bh) => button(bx, by, bw, bh, { label: 'Target: ' + TGTN[t.tgt], alt: TGTN[t.tgt], tip: 'Target: which balloon this tower shoots first', r: 12, size: 10.5, fn: () => { t.tgt = TGT[(TGT.indexOf(t.tgt) + 1) % 4]; api.sfx('click'); } });
        const fuBtn = (bx, by, bw, bh) => button(bx, by, bw, bh, { label: fusing ? 'Cancel' : 'Fuse $' + fee, tip: 'Fuse with a tower within two squares (F): same kind makes a twin, another kind a hybrid', r: 12, size: 10.5, on: fusing, tint: GOLD, dis: !fusing && B.cash < fee,
          fn: () => { if (fusing) B.fuseFrom = null; else B.startFuse(t); } });
        const btns = [fuseOk && fuBtn, tgOk && tgBtn, sellBtn].filter(Boolean);
        let px, py, pw, ph, mode3;
        if (h < 116) {
          // short dock: name and its buttons on the left, the three paths in a row beside them
          const side = Math.min(200, w * 0.3);
          fit1(ctx, towerName(t), x + 4, y + 10, side - 8, 12.5, col.ink, 800, 'left');
          const bh = Math.max(22, Math.min(28, h - 28)), by = y + h - bh - 2, bw = (side - 4 * (btns.length - 1)) / btns.length;
          btns.forEach((f, i) => f(x + i * (bw + 4), by, bw, bh));
          px = x + side + 8; py = y; pw = w - side - 8; ph = h; mode3 = 'row';
        } else {
          // the name gets a line of its own (hybrid names run long), the buttons share the line under it
          fit1(ctx, towerName(t), x + 2, y + 9, w - 4, 13, col.ink, 800, 'left');
          const bw = Math.min(110, (w - 6 * (btns.length - 1)) / btns.length);
          btns.forEach((f, i) => f(x + i * (bw + 6), y + 22, bw, 24));
          px = x; py = y + 52; pw = w; ph = h - 52; mode3 = w >= 300 ? 'cols' : 'rows';
        }
        if (inside(mouse, x, y, w, 18) && !tipText) tipText = about;
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
            if (inside(mouse, bx, by, bw, bh)) tipText = 'Only two paths, and only one past tier 1 (a twin has no limit)';
            fit1(ctx, bw < 150 ? 'Locked' : 'Locked by your other paths', bx + bw / 2, by + bh / 2, bw - 8, 10, col.ink3, 600);
          } else {
            const nx = Pth.t[lv], nc = B.price(nx.cost);
            const bh2 = Math.max(26, Math.min(60, bh));
            button(bx, by + (bh - bh2) / 2, bw, bh2, { label: nx.n, sub: '$' + nc, dis: B.cash < nc, tip: nx.d, fn: () => B.upgrade(t, p) });
          }
        });
        return fusing ? 'Click a gold-ringed tower to fuse' : towerNote(t);
      }

      function drawHeader() {
        const w = view.w;
        const L = { who: 'you', label: 'You', score: (B.R.sandbox ? '∞' : B.lives) + ' lives' };
        D.duelHeader(ctx, 10, 8, w - 20, { left: L, right: null, turn: null, status: '' }, col);
        const pw = Math.min(132, (w - 20) * 0.34), mx = 10 + pw + 10, mw = w - 20 - 2 * pw - 20;
        if (phase !== 'menu') fit1(ctx, RULES[rule].n, w - 10 - pw / 2, 28, pw, 12, col.ink2, 700);
        let status = 'Choose a mode';
        if (phase === 'play' || phase === 'over') {
          const next = waveStart(B.wave + 1, B.R.brk) - clock;
          status = B.wave === 0 ? `First wave in ${Math.max(1, Math.ceil(next))}s` : `Wave ${B.wave}` + (next > 0 && next < 60 ? ` · next in ${Math.ceil(next)}s` : '');
          if (phase === 'over') status = 'Game over';
        }
        fit1(ctx, status, mx + mw / 2, 20, mw, 12, col.accent, 700);
        if (phase === 'play' && mw > 40) button(mx + mw / 2 - 18, 32, 36, 16, { label: speed + 'x', tip: 'Game speed (Space)', r: 8, size: 9.5, on: speed > 1, fn: () => { speed = speed >= 3 ? 1 : speed + 1; api.sfx('click'); } });
      }

      function drawMenu() {
        const w = view.w, h = view.h, cw = Math.min(380, w - 32), ch = 196, x = (w - cw) / 2, y = TOP + Math.max(8, (h - TOP - ch) / 2 - 10);
        ctx.save(); ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'; ctx.fillRect(0, TOP - 4, w, h - TOP + 4); ctx.restore();
        ctx.save(); ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
        D.roundRect(ctx, x, y, cw, ch, 18); ctx.fill(); ctx.restore();
        fit1(ctx, 'Pop Fusion', x + cw / 2, y + 24, cw - 30, 17, col.ink, 800);
        D.fitText(ctx, 'Fuse two towers into a twin or a hybrid. From wave 12 the balloons fuse too.', x + cw / 2, y + 54, cw - 36, 11.5, col.ink2, 600, 10);
        fit1(ctx, 'Pick a mode', x + cw / 2, y + 86, cw - 36, 10.5, col.ink3, 650);
        const n = SOLO_KEYS.length, bw = (cw - 36 - 6 * (n - 1)) / n;
        menuHover = null;
        SOLO_KEYS.forEach((k, i) => {
          const bx = x + 18 + i * (bw + 6);
          if (inside(mouse, bx, y + 102, bw, 40)) menuHover = k;
          button(bx, y + 102, bw, 40, { label: RULES[k].n, primary: k === 'classic', r: 12, size: 11.5, fn: () => startRun(k) });
        });
        D.fitText(ctx, menuHover ? RULES[menuHover].d : 'Each mode changes lives, cash and wave pace.', x + cw / 2, y + 166, cw - 36, 10.5, col.ink2, 600, 9.5);
      }

      function render() {
        col = api.colors(); P = pal(col);
        hits = [];
        ctx.clearRect(0, 0, view.w, view.h);
        drawHeader();
        const L = layout();
        drawBoard(L.board);
        if (phase === 'play') drawPanel(L.panel);
        else { ctx.save(); D.roundRect(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 14); ctx.fillStyle = col.surface; ctx.fill(); ctx.restore(); }
        if (phase === 'menu') drawMenu();
        if (phase === 'over') card(view.w / 2, view.h - 44, Math.min(300, view.w - 40), 'Overrun on wave ' + B.wave, RULES[rule].n + ' · ' + B.pops + ' balloons popped');
      }

      /* ---------- flow ---------- */
      function update(dt) {
        if (phase === 'over') {
          overT -= dt;
          if (overT <= 0 && !api.ended) api.over({ score: B.wave, title: 'Overrun on wave ' + B.wave, message: RULES[rule].n + ' · ' + B.pops + ' balloons popped' });
          return;
        }
        if (phase !== 'play' || !dt) return;   // menu, or a still frame while paused
        clock += dt * speed;
        B.advance(clock);
        api.score(B.wave);
        if (B.dead) { phase = 'over'; overT = 1.8; B.pick = null; B.selT = null; B.fuseFrom = null; api.sfx('over'); }
      }

      /* ---------- save / restore (everything is checked: a bad snapshot starts a fresh game) ---------- */
      function save() {
        if (phase !== 'play' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, rule, speed, cash: B.cash, lives: B.lives, wave: B.wave, pops: B.pops,
          towers: B.towers.map(t => ({ k: t.k, c: t.c, r: t.r, up: t.up.slice(), spent: t.spent, tgt: t.tgt, abCd: Math.max(0, t.abCd), twin: !!t.twin,
            fu: t.fu ? { base: t.fu.base, name: t.fu.name, note: t.fu.note, ka: t.fu.ka, kb: t.fu.kb } : null })) };
      }
      function okBase(o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
        const ks = Object.keys(o); if (ks.length > 60) return false;
        return ks.every(k => { const v = o[k]; return v === undefined || v === null || num(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length < 24); }) && typeof o.kind === 'string' && RANK[o.kind] !== undefined;
      }
      function okTower(t) {
        if (!t || !TW[t.k] || !Number.isInteger(t.c) || !Number.isInteger(t.r) || !Array.isArray(t.up) || t.up.length !== 3 || !t.up.every(u => Number.isInteger(u) && u >= 0 && u <= 3) || !num(t.spent) || !TGT.includes(t.tgt)) return false;
        if (t.k === 'fuse') { const f = t.fu; return !!(f && okBase(f.base) && typeof f.name === 'string' && f.name.length < 60 && typeof f.note === 'string' && f.note.length < 200 && TW[f.ka] && TW[f.kb] && f.ka !== 'fuse' && f.kb !== 'fuse'); }
        return !t.fu;
      }
      function restore(s) {
        if (!s || s.v !== 1 || !RULES[s.rule] || !['cash', 'lives', 'wave', 'pops'].every(k => num(s[k])) || s.lives <= 0 || s.wave < 0 || s.wave > 10000 || !Array.isArray(s.towers) || s.towers.length > GC * GR) return false;
        if (!s.towers.every(okTower)) return false;
        rule = s.rule; makeBoard();
        speed = [1, 2, 3].includes(s.speed) ? s.speed : 1;
        const wv = Math.floor(s.wave);
        clock = wv > 0 ? waveStart(wv, B.R.brk) : 0;
        Object.assign(B, { cash: s.cash, lives: s.lives, wave: wv, pops: s.pops, t: clock });
        const seen = new Set();
        B.towers = s.towers.filter(t => t.c >= 0 && t.r >= 0 && t.c < GC && t.r < GR && !PATH.has(t.c + ',' + t.r) && !seen.has(t.c + ',' + t.r) && seen.add(t.c + ',' + t.r)).map(t => {
          const q = { k: t.k, c: t.c, r: t.r, x: (t.c + 0.5) * CS, y: (t.r + 0.5) * CS, up: t.up.slice(), cd: 0, spent: t.spent, ang: 0, abCd: num(t.abCd) ? t.abCd : 0, boost: 0, tgt: t.tgt, twin: t.k !== 'fuse' && !!t.twin };
          if (t.k === 'fuse') q.fu = { base: t.fu.base, name: t.fu.name, note: t.fu.note, ka: t.fu.ka, kb: t.fu.kb, ca: TW[t.fu.ka].col, cb: TW[t.fu.kb].col };
          q.s = stats(q); return q;
        });
        if (wv > 0) B.queueWave(wv);   // the wave in progress starts again from the top
        phase = 'play';
        api.score(wv);
        return true;
      }
      try { restored = !!(api.saved && restore(api.saved)); } catch (e) { restored = false; makeBoard(); phase = 'menu'; }

      if (window.ludusDebug) window.ludusDebug.popfusion = () => ({ phase, rule, clock, speed, layout: layout(),
        cash: B.cash, lives: B.lives, wave: B.wave, towers: B.towers.map(t => (t.fu ? 'fuse(' + t.fu.ka + '+' + t.fu.kb + ')' : t.k + (t.twin ? '*2' : '')) + ':' + t.up.join('')), bl: B.bl.length, kinds: [...new Set(B.bl.map(b => b.k))], pops: B.pops, dead: B.dead });
      if (window.ludusDebug) window.ludusDebug.popfusionCtl = { hits: () => hits.map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h, label: z.label })), board: () => B, startRun, setClock(v) { clock = v; } };

      api.loop(dt => { update(dt); render(); });
      return { save };
    }
  });
})();
