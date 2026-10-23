/* Stick Brawl: two stick fighters, one wobbly arena. Grab weapons that fall from the sky, punch, shoot and knock
   the rival off the map. Last one standing takes the round; first to 3 rounds takes the match.
   vs Bot: you are Player 1 (either key set), the bot plays Player 2. vs Friend: two players on one keyboard.
   World units: the arena is 800 x 420, y grows downward; it is scaled (never stretched) to fit the panel. */
(function () {
  const D = Ludus.draw;
  const W = 800, H = 420, G = 1500, RUN = 250, JUMP = 560, TOWIN = 3, PW = 10, PH = 54;

  // platform: [x, y, w, h, lift amplitude, lift period, phase]
  const STAGES = [
    { n: 'Rooftops', sky: ['#f6dcb4', '#e7a67b'], dsky: ['#3a2f27', '#2a211b'], p: [[30, 330, 290, 90], [480, 330, 290, 90], [330, 240, 140, 16], [70, 165, 130, 16], [600, 165, 130, 16]], s: [150, 650] },
    { n: 'Pillars', sky: ['#cfe3ef', '#8fb3cf'], dsky: ['#26323b', '#1b242c'], p: [[80, 300, 110, 120], [350, 250, 100, 170], [610, 300, 110, 120], [195, 165, 120, 14], [485, 165, 120, 14]], s: [135, 665] },
    { n: 'Scaffold', sky: ['#e5e0d0', '#b9b29b'], dsky: ['#33302a', '#25231e'], p: [[110, 360, 580, 22], [150, 270, 180, 14], [470, 270, 180, 14], [300, 180, 200, 14], [50, 115, 100, 14], [650, 115, 100, 14]], s: [200, 600] },
    { n: 'Islands', sky: ['#d6ecd6', '#8fbf98'], dsky: ['#26332a', '#1b251e'], p: [[60, 320, 130, 22], [255, 365, 95, 22], [450, 365, 95, 22], [610, 320, 130, 22], [340, 235, 120, 14], [175, 175, 85, 14], [540, 175, 85, 14]], s: [125, 675] },
    { n: 'Lifts', sky: ['#d9d2ea', '#9a8fc0'], dsky: ['#2e2a3b', '#211e2c'], p: [[30, 350, 170, 70], [600, 350, 170, 70], [245, 290, 100, 14, 85, 3.4, 0], [455, 290, 100, 14, 85, 3.4, Math.PI], [340, 110, 120, 14]], s: [110, 690] }
  ];
  const WEP = {
    pistol: { n: 'Pistol', ammo: 8, cd: 0.3, dmg: 22, kb: 260, spd: 1100, pel: 1, spr: 0 },
    shotgun: { n: 'Shotgun', ammo: 4, cd: 0.75, dmg: 12, kb: 190, spd: 950, pel: 6, spr: 0.3, recoil: 340 },
    rifle: { n: 'Rifle', ammo: 26, cd: 0.085, dmg: 7, kb: 80, spd: 1300, pel: 1, spr: 0.07, auto: 1 },
    sword: { n: 'Sword', melee: 1, cd: 0.42, dmg: 42, kb: 520, reach: 62 },
    bomb: { n: 'Bomb', ammo: 1, bomb: 1, cd: 0.3 }
  };
  const WK = Object.keys(WEP);
  const PUNCH = { cd: 0.32, dmg: 9, kb: 380, reach: 38 };
  const ACT = ['left', 'right', 'up', 'down', 'atk', 'thr'];
  // Player 1: WASD, F attack, G throw. Player 2: arrows or IJKL, Enter / or H attack, right Shift . or Y throw.
  const C1 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'atk', KeyG: 'thr', Space: 'atk' };
  const C2 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyJ: 'left', KeyL: 'right', KeyI: 'up', KeyK: 'down',
    Enter: 'atk', NumpadEnter: 'atk', Slash: 'atk', KeyH: 'atk', ShiftRight: 'thr', Period: 'thr', KeyY: 'thr' };
  const K1 = { a: 'left', d: 'right', w: 'up', s: 'down', f: 'atk', g: 'thr', ' ': 'atk' };
  const K2 = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', j: 'left', l: 'right', i: 'up', k: 'down', enter: 'atk', '/': 'atk', h: 'atk', '.': 'thr', y: 'thr' };

  Ludus.register({
    id: 'stickbrawl', name: 'Stick Brawl', aka: 'stick figure fight brawler', tag: 'Duel', wide: true, versus: true, tint: '#4a6fd8',
    hint: '<kbd>A</kbd><kbd>D</kbd> move <kbd>W</kbd> jump (twice) <kbd>S</kbd> aim down <kbd>F</kbd> attack <kbd>G</kbd> throw · <b>vs Friend</b> P2 <kbd>←</kbd><kbd>→</kbd> move <kbd>↑</kbd> jump <kbd>Enter</kbd> attack <kbd>.</kbd> throw · walk into a weapon to pick it up',
    _rules: { WEP, STAGES, TOWIN },
    art(ctx, w, h) {
      const s = Math.min(w / 160, h / 110);
      ctx.save(); ctx.translate(w / 2 - 80 * s, h / 2 - 55 * s); ctx.scale(s, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
      const fig = (x, c, dir) => {
        ctx.strokeStyle = c; ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, 28, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, 37); ctx.lineTo(x, 66);
        ctx.moveTo(x, 45); ctx.lineTo(x + dir * 24, 40);
        ctx.moveTo(x, 47); ctx.lineTo(x - dir * 12, 58);
        ctx.moveTo(x, 66); ctx.lineTo(x - 10, 92); ctx.moveTo(x, 66); ctx.lineTo(x + 12, 92); ctx.stroke();
      };
      fig(56, '#2b2f3a', 1); fig(108, '#e0563f', -1);
      ctx.fillStyle = '#ffc857'; ctx.beginPath(); ctx.arc(82, 40, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend, reduce = api.reduceMotion;
      const sfx = n => { try { api.sfx(n); } catch (e) {} };

      /* ---------- input ---------- */
      const held = { r: {}, y: {} }, edge = { r: {}, y: {} };
      function find(e) {
        let side = null, a = null;
        if (C1[e.code]) { side = 'r'; a = C1[e.code]; }
        else if (C2[e.code]) { side = 'y'; a = C2[e.code]; }
        else {
          const k = String(e.key || '').toLowerCase();
          if (K1[k]) { side = 'r'; a = K1[k]; } else if (K2[k]) { side = 'y'; a = K2[k]; }
          else if (k === 'shift' && e.location === 2) { side = 'y'; a = 'thr'; }
        }
        if (!side) return null;
        return [friend ? side : 'r', a];   // vs Bot: both key sets drive Player 1
      }
      api.keys(e => {
        const m = find(e); if (!m) return;
        e.preventDefault();
        if (!held[m[0]][m[1]]) edge[m[0]][m[1]] = true;
        held[m[0]][m[1]] = true;
        if (phase === 'intro') begin();
      });
      api.keysUp(e => { const m = find(e); if (m) held[m[0]][m[1]] = false; });
      api.on(window, 'blur', () => { held.r = {}; held.y = {}; });
      api.on(view.canvas, 'pointerdown', () => { if (phase === 'intro') begin(); });
      function readInput(p) {
        const o = {};
        for (const a of ACT) { o[a] = !!held[p][a]; o['_' + a] = !!edge[p][a]; edge[p][a] = false; }
        return o;
      }

      /* ---------- arena ---------- */
      let st = 0, now = 0;
      function rect(i) { const p = STAGES[st].p[i]; let y = p[1]; if (p[4]) y += p[4] * Math.sin(now * 2 * Math.PI / p[5] + p[6]); return [p[0], y, p[2], p[3]]; }
      function spawnY(x) { let best = -1; const n = STAGES[st].p.length; for (let i = 0; i < n; i++) { const r = rect(i); if (x >= r[0] && x <= r[0] + r[2] && r[1] > best) best = r[1]; } return best < 0 ? groundAt(x) : best; }
      function groundAt(x) { let best = H; const n = STAGES[st].p.length; for (let i = 0; i < n; i++) { const r = rect(i); if (x >= r[0] && x <= r[0] + r[2] && r[1] < best) best = r[1]; } return best; }

      /* ---------- state ---------- */
      let phase = 'intro', P = {}, items = [], bullets = [], parts = [], dolls = [], boomFx = [], shake = 0, countT = 0, endT = 0, dropT = 0, firstWep = true;
      let rounds = { r: 0, y: 0 }, banner = null, toastT = 0, toastMsg = '', clock = 0;
      function mk(side) { const x = STAGES[st].s[side === 'r' ? 0 : 1]; return { side, x, y: spawnY(x), vx: 0, vy: 0, face: side === 'r' ? 1 : -1, hp: 100, alive: true, gr: true, on: null, jumps: 2, cd: 0, atkT: 0, hurt: 0, aim: 0, ph: 0, w: null }; }
      const other = p => (p.side === 'r' ? P.y : P.r);
      const NAME = s => (s === 'r' ? (friend ? 'P1' : 'You') : friend ? 'P2' : 'Bot');
      function resetRound() { items = []; bullets = []; dolls = []; P = { r: mk('r'), y: mk('y') }; dropT = 1.2; firstWep = true; ai.t = 0; ai.act = null; ai.graph = null; }

      function burst(x, y, c, n) {
        if (reduce) n = Math.min(n, 8);
        const col = c === 'r' ? colP1() : c === 'y' ? D.P2 : c === 'fire' ? '#ff9a3c' : c === 'spark' ? '#fff2a8' : '#888';
        for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 460, vy: -Math.random() * 380 - 40, life: 0.4 + Math.random() * 0.5, col, s: 2 + Math.random() * 4 });
        if (parts.length > 400) parts.splice(0, parts.length - 400);
      }
      const doShake = v => { if (!reduce) shake = Math.max(shake, v); };
      const toast = m => { toastMsg = m; toastT = 1.1; };

      /* ---------- ragdoll (looks only) ---------- */
      function ragdoll(side, x, y, vx, vy) {
        const pts = [[0, -PH], [0, -PH + 12], [0, -22], [-12, -34], [12, -34], [-8, 0], [8, 0]].map(([dx, dy]) => {
          const j = (Math.random() - 0.5) * 120;
          return { x: x + dx, y: y + dy, ox: x + dx - (vx + j) / 60, oy: y + dy - (vy - Math.random() * 80) / 60 };
        });
        dolls.push({ side, pts, t: 0, st: [[0, 1, 12], [1, 2, 22], [1, 3, 17], [1, 4, 17], [2, 5, 24], [2, 6, 24]] });
        if (dolls.length > 6) dolls.shift();
      }
      function stepDolls(dt) {
        if (dt <= 0) return;
        for (const d of dolls) {
          d.t += dt;
          for (const q of d.pts) {
            const vx = (q.x - q.ox) * 0.995, vy = (q.y - q.oy) * 0.995; q.ox = q.x; q.oy = q.y; q.x += vx; q.y += vy + G * dt * dt;
            const n = STAGES[st].p.length;
            for (let i = 0; i < n; i++) { const r = rect(i); if (q.x > r[0] && q.x < r[0] + r[2] && q.y > r[1] && q.y < r[1] + r[3] && q.oy <= r[1] + 4) { q.y = r[1]; q.ox = q.x - (q.x - q.ox) * 0.6; } }
          }
          for (let k = 0; k < 3; k++) for (const [a, b, l] of d.st) { const A = d.pts[a], B = d.pts[b], dx = B.x - A.x, dy = B.y - A.y, dd = Math.hypot(dx, dy) || 1, f = (dd - l) / dd / 2; A.x += dx * f; A.y += dy * f; B.x -= dx * f; B.y -= dy * f; }
        }
        dolls = dolls.filter(d => d.t < 8);
      }

      /* ---------- fighting ---------- */
      function overlap(p, r) { return p.x + PW > r[0] && p.x - PW < r[0] + r[2] && p.y > r[1] + 0.01 && p.y - PH < r[1] + r[3]; }
      function move(p, dt) {
        const n = STAGES[st].p.length;
        if (p.gr && p.on != null) { const r = rect(p.on); if (p.x + PW > r[0] && p.x - PW < r[0] + r[2]) p.y = r[1]; }
        p.x += p.vx * dt;
        for (let i = 0; i < n; i++) {
          const r = rect(i);
          if (overlap(p, r)) {
            if (p.y - r[1] < 10 && p.vy >= 0) { p.y = r[1]; continue; }
            if (p.vx > 0) p.x = r[0] - PW; else if (p.vx < 0) p.x = r[0] + r[2] + PW;
            p.vx = 0;
          }
        }
        const py = p.y; p.y += p.vy * dt; p.gr = false; p.on = null;
        for (let i = 0; i < n; i++) {
          const r = rect(i);
          if (overlap(p, r)) {
            if (p.vy >= 0 && py <= r[1] + 10) { p.y = r[1]; p.vy = 0; p.gr = true; p.on = i; p.jumps = 2; }
            else if (p.vy < 0) { p.y = r[1] + r[3] + PH; p.vy = 0; }
          }
        }
      }
      function hurt(o, dmg, kx, ky) {
        if (!o.alive) return;
        o.hp -= dmg; const m = 1 + (100 - Math.max(0, o.hp)) / 110;
        o.vx += kx * m; o.vy = Math.min(o.vy, 0) + ky * m; o.gr = false; o.on = null; o.hurt = 0.28;
        burst(o.x, o.y - PH * 0.6, o.side, 6); sfx('hit');
        if (o.hp <= 0) die(o);
      }
      function die(p) {
        if (!p.alive) return; p.alive = false; p.hp = 0;
        if (p.w) { items.push({ k: p.w.k, x: p.x, y: p.y - PH * 0.6, vx: p.vx * 0.3, vy: -200, rot: 0, vr: 6, ammo: p.w.ammo, live: 0, by: '', fuse: 0, rest: 0, on: null, empty: 0, t: 0 }); p.w = null; }
        ragdoll(p.side, p.x, Math.min(p.y, H + 40), p.vx, p.vy);
        burst(p.x, Math.min(p.y, H) - PH / 2, p.side, 22); doShake(0.3); sfx('lose');
      }
      function attack(p) {
        const w = p.w, Dw = w ? WEP[w.k] : PUNCH;
        p.cd = Dw.cd; p.atkT = 0.16;
        if (!w || Dw.melee) {
          sfx(w ? 'click' : 'tap'); const o = other(p);
          if (o.alive) { const dx = (o.x - p.x) * p.face, dy = o.y - p.y; if (dx > -10 && dx < Dw.reach + PW * 2 && Math.abs(dy) < PH * 0.85) hurt(o, Dw.dmg, p.face * Dw.kb, -Dw.kb * 0.45 - 60); }
          return;
        }
        if (Dw.bomb) { throwWep(p); return; }
        const base = p.aim * 0.6;
        for (let i = 0; i < Dw.pel; i++) {
          const a = base + (Dw.pel > 1 ? (i / (Dw.pel - 1) - 0.5) * Dw.spr * 2 : (Math.random() - 0.5) * Dw.spr * 2);
          bullets.push({ x: p.x + p.face * 6, y: p.y - PH * 0.62 + p.aim * 8, vx: Math.cos(a) * Dw.spd * p.face, vy: Math.sin(a) * Dw.spd, dmg: Dw.dmg, kb: Dw.kb, o: p.side, life: 0.8 });
        }
        if (Dw.recoil) { p.vx -= p.face * Dw.recoil; p.vy -= Math.sin(base) * Dw.recoil * 0.6; }
        w.ammo--; sfx(w.k === 'shotgun' ? 'boom' : 'tick');
        if (w.ammo <= 0) { items.push({ k: w.k, x: p.x, y: p.y - PH * 0.6, vx: -p.face * 140, vy: -280, rot: 0, vr: -p.face * 9, ammo: 0, live: 0, by: '', fuse: 0, rest: 0, on: null, empty: 1, t: 2.5 }); p.w = null; }
      }
      function throwWep(p) {
        const w = p.w; if (!w) return; p.w = null; p.cd = 0.25; p.atkT = 0.16;
        items.push({ k: w.k, x: p.x + p.face * 16, y: p.y - PH * 0.65, vx: p.face * 720 + p.vx * 0.3, vy: -160 + p.aim * 260, rot: 0, vr: p.face * 16, ammo: w.ammo, live: 1, by: p.side, fuse: w.k === 'bomb' ? 1.4 : 0, rest: 0, on: null, empty: 0, t: 0 });
        sfx('drop');
      }
      function explode(x, y) {
        boomFx.push({ x, y, t: 0 }); burst(x, y, 'fire', 30); doShake(0.45); sfx('boom');
        for (const s of ['r', 'y']) { const p = P[s]; if (!p.alive) continue; const d = Math.hypot(p.x - x, p.y - PH / 2 - y); if (d < 120) { const f = 1 - d / 120; hurt(p, Math.round(18 + 70 * f), Math.sign(p.x - x || 1) * 820 * f, -700 * f - 120); } }
        for (const it of items) { const d = Math.hypot(it.x - x, it.y - y); if (d < 120) { it.rest = 0; it.vx += Math.sign(it.x - x || 1) * 400; it.vy -= 400; } }
      }
      // movement shared by the fighters and the bot's look-ahead
      function phys(p, inp, dt) {
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), ctrl = p.hurt > 0 ? 0.25 : 1; let jumped = false;
        if (dir) { const acc = (p.gr ? 2800 : 1600) * ctrl; if (dir * p.vx < RUN) p.vx = Math.min(RUN, Math.max(-RUN, p.vx + dir * acc * dt)); p.face = dir; }
        else if (p.gr) p.vx *= Math.max(0, 1 - 14 * dt); else p.vx *= 1 - 0.5 * dt;
        if (p.gr && Math.abs(p.vx) > RUN * 1.05) p.vx *= 1 - 6 * dt;
        if (inp._up && p.jumps > 0) { p.vy = -JUMP * (p.gr ? 1 : 0.85); p.jumps = p.gr ? 1 : p.jumps - 1; p.gr = false; p.on = null; jumped = true; }
        if (!inp.up && p.vy < -200 && p.hurt <= 0) p.vy += G * 1.1 * dt;
        p.aim = inp.up ? -1 : (inp.down && !p.gr ? 1 : 0);
        if (inp.down && !p.gr) p.vy += 900 * dt;
        p.vy = Math.min(950, p.vy + G * dt);
        move(p, dt);
        return jumped;
      }
      function step(p, inp, dt) {
        if (!p.alive) return;
        p.cd = Math.max(0, p.cd - dt); p.atkT = Math.max(0, p.atkT - dt); p.hurt = Math.max(0, p.hurt - dt);
        if (phys(p, inp, dt)) sfx('jump');
        if (p.gr && Math.abs(p.vx) > 20) p.ph += dt * Math.abs(p.vx) / 22;
        const Dw = p.w ? WEP[p.w.k] : null;
        if (p.cd <= 0 && (inp._atk || (inp.atk && Dw && Dw.auto))) attack(p);
        if (inp._thr && p.w) throwWep(p);
        if (!p.w) for (let i = 0; i < items.length; i++) {
          const it = items[i]; if (it.empty || it.fuse > 0 || (it.live && it.by === p.side)) continue;
          if (Math.abs(it.x - p.x) < 24 && it.y > p.y - PH - 12 && it.y < p.y + 14) { p.w = { k: it.k, ammo: it.ammo }; items.splice(i, 1); sfx('merge'); break; }
        }
        if (p.y > H + 70 || p.x < -70 || p.x > W + 70) die(p);
      }
      function pushOut(it, r) { return it.vx > 0 ? r[0] - 1 : r[0] + r[2] + 1; }
      function stepWorld(dt) {
        const n = STAGES[st].p.length;
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; b.life -= dt;
          let gone = b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y > H + 20;
          if (!gone) for (let k = 0; k < n; k++) { const r = rect(k); if (b.x > r[0] && b.x < r[0] + r[2] && b.y > r[1] && b.y < r[1] + r[3]) { gone = true; burst(b.x, b.y, 'spark', 3); break; } }
          if (!gone) { const o = b.o === 'r' ? P.y : P.r; if (o.alive && b.x > o.x - PW - 3 && b.x < o.x + PW + 3 && b.y > o.y - PH && b.y < o.y) { hurt(o, b.dmg, Math.sign(b.vx) * b.kb, -b.kb * 0.35); gone = true; } }
          if (gone) bullets.splice(i, 1);
        }
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it.rest && it.on != null) { const r = rect(it.on); if (it.x > r[0] - 2 && it.x < r[0] + r[2] + 2) it.y = r[1]; else { it.rest = 0; it.on = null; } }
          if (!it.rest) {
            const py = it.y; it.vy = Math.min(900, it.vy + G * dt); it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
            for (let k = 0; k < n; k++) {
              const r = rect(k);
              if (it.x > r[0] && it.x < r[0] + r[2] && it.y >= r[1] && py <= r[1] + 8 && it.vy >= 0) {
                it.y = r[1];
                if (it.k === 'bomb' && it.vy > 160) { it.vy *= -0.35; it.vx *= 0.6; } else { it.rest = 1; it.on = k; it.vx = 0; it.vy = 0; it.vr = 0; it.rot = 0; it.live = 0; }
                break;
              }
              if (it.x > r[0] && it.x < r[0] + r[2] && it.y > r[1] + 2 && it.y < r[1] + r[3]) { it.vx *= -0.4; it.x = pushOut(it, r); }
            }
            if (it.live) {
              const o = it.by === 'r' ? P.y : P.r, sp = Math.hypot(it.vx, it.vy);
              if (sp < 230) it.live = 0;
              else if (o.alive && it.x > o.x - PW - 8 && it.x < o.x + PW + 8 && it.y > o.y - PH - 6 && it.y < o.y + 4) { hurt(o, it.k === 'bomb' ? 6 : 20, Math.sign(it.vx) * 360, -220); it.live = 0; it.vx *= -0.25; it.vy = -200; }
            }
          }
          if (it.fuse > 0) { it.fuse -= dt; if (it.fuse <= 0) { items.splice(i, 1); explode(it.x, it.y - 6); continue; } }
          if (it.empty) { it.t -= dt; if (it.t <= 0) { items.splice(i, 1); continue; } }
          if (it.y > H + 120 || it.x < -150 || it.x > W + 150) items.splice(i, 1);
        }
        dropT -= dt;
        if (dropT <= 0 && items.filter(i => !i.empty).length < 3) {
          const k = firstWep ? (Math.random() < 0.5 ? 'pistol' : 'sword') : WK[Math.floor(Math.random() * WK.length)]; firstWep = false;
          let x = 0; for (let tries = 0; tries < 20; tries++) { x = 60 + Math.random() * (W - 120); if (groundAt(x) < H) break; }
          items.push({ k, x, y: -20, vx: 0, vy: 0, rot: 0, vr: 3, ammo: WEP[k].ammo || 0, live: 0, by: '', fuse: 0, rest: 0, on: null, empty: 0, t: 0 });
          dropT = 4 + Math.random() * 3;
        } else if (dropT <= 0) dropT = 2;
      }

      /* ---------- the bot (plays Player 2) ---------- */
      const ai = { t: 0, jumpT: 0, graph: null, gStage: -1, act: null };
      const AI_REACT = [0.45, 0.25, 0.12][api.level] ?? 0.25;   // extra pause between bot attacks, by difficulty
      function aiSim(me, dir, jump, dbl, steps) {
        const c = Object.assign({}, me, { w: null, hurt: 0 }); const dt = 1 / 60; let used = false;
        for (let i = 0; i < (steps || 110); i++) {
          const inp = { left: dir < 0, right: dir > 0, up: jump, down: false, _up: i === 0 && jump };
          if (dbl && !used && i > 3 && c.vy > -60 && c.jumps > 0) { inp._up = true; used = true; }
          phys(c, inp, dt);
          if (c.gr && i > 1) return c;
          if (c.y > H + 10 || c.x < -40 || c.x > W + 40) return null;
        }
        return null;
      }
      function platUnder(x, y) { let best = -1, bt = 1e9; const n = STAGES[st].p.length; for (let i = 0; i < n; i++) { const r = rect(i); if (x >= r[0] - 4 && x <= r[0] + r[2] + 4 && r[1] >= y - 6 && r[1] < bt) { bt = r[1]; best = i; } } return best; }
      function buildGraph() {
        const n = STAGES[st].p.length, E = []; for (let i = 0; i < n; i++) E.push([]);
        for (let i = 0; i < n; i++) {
          const r = rect(i);
          for (let x = r[0] + PW + 2; x <= r[0] + r[2] - PW - 2; x += 16) {
            const me = { x, y: r[1], vx: 0, vy: 0, gr: true, on: i, jumps: 2, hurt: 0, face: 1 };
            for (const d of [-1, 0, 1]) for (const [j, db] of [[false, false], [true, false], [true, true]]) {
              if (!j && !d) continue;
              const Lnd = aiSim(me, d, j, db, 150); if (!Lnd || Lnd.on == null || Lnd.on === i) continue;
              const tgt = Lnd.on, ex = E[i].find(e => e.to === tgt), cost = (j ? 1 : 0) + (db ? 1 : 0);
              const cand = { to: tgt, x, dir: d, jump: j, dbl: db, cost };
              if (!ex) E[i].push(cand); else if (cost < ex.cost) Object.assign(ex, cand);
            }
          }
        }
        return E;
      }
      function route(from, to) {
        if (from < 0 || to < 0 || from === to) return null;
        if (ai.gStage !== st || !ai.graph) { ai.graph = buildGraph(); ai.gStage = st; }
        const prev = new Map([[from, null]]), q = [from];
        while (q.length) { const c = q.shift(); if (c === to) break; for (const e of ai.graph[c]) if (!prev.has(e.to)) { prev.set(e.to, { from: c, e }); q.push(e.to); } }
        if (!prev.has(to)) return null;
        let c = to, first = null; while (prev.get(c)) { first = prev.get(c).e; c = prev.get(c).from; }
        return first;
      }
      function aiInput(dt) {
        const me = P.y, t = P.r, o = { left: false, right: false, up: false, down: false, atk: false, thr: false, _up: false, _atk: false, _thr: false };
        if (!me.alive) return o;
        ai.t -= dt; ai.jumpT -= dt;
        let gx = t.x, gy = t.y, want = 'fight';
        if (!me.w) {
          let best = null, bd = 1e9;
          for (const it of items) { if (it.empty || it.fuse > 0 || it.live || !it.rest) continue; const d = Math.abs(it.x - me.x) + Math.abs(it.y - me.y) * 1.5; if (d < bd) { bd = d; best = it; } }
          if (best && bd < Math.abs(t.x - me.x) + Math.abs(t.y - me.y) + 200) { gx = best.x; gy = best.y; want = 'item'; }
        }
        if (!t.alive) { gx = W / 2; gy = me.y; }
        const Dw = me.w ? WEP[me.w.k] : PUNCH, gun = me.w && !Dw.melee && !Dw.bomb;
        const dist = Math.abs(t.x - me.x), dyT = t.y - me.y;
        let dir = 0;
        if (me.gr) {
          ai.act = null;
          const mine = me.on != null ? me.on : platUnder(me.x, me.y), goal = platUnder(gx, gy);
          const e = goal >= 0 && goal !== mine ? route(mine, goal) : null;
          if (e) {
            const off = e.x - me.x;
            if (Math.abs(off) > 5) dir = Math.sign(off);
            else if (ai.jumpT <= 0) { dir = e.dir; if (e.jump) { o._up = true; o.up = true; } ai.act = { dir: e.dir, jump: e.jump, dbl: e.dbl }; ai.jumpT = 0.3; }
            else dir = e.dir;
          } else {
            dir = Math.abs(gx - me.x) > 6 ? Math.sign(gx - me.x) : 0;
            if (want === 'fight' && gun && dist < 150 && Math.abs(dyT) < 60) dir = -Math.sign(t.x - me.x);
            if (want === 'fight' && !gun && dist < Dw.reach + 8 && Math.abs(dyT) < 40) dir = 0;
            if (dir && groundAt(me.x + dir * (PW + 6)) > me.y + 20) dir = 0;
            if (want === 'fight' && dyT < -60 && dist < 60 && ai.jumpT <= 0) { const Lnd = aiSim(me, 0, true, true); if (Lnd && Lnd.y < me.y - 20) { o._up = true; o.up = true; ai.act = { dir: 0, jump: true, dbl: true }; ai.jumpT = 0.5; } }
          }
        } else {
          const a = ai.act;
          if (a && me.hurt <= 0) { dir = a.dir; o.up = me.vy < 0; if (a.dbl && me.vy > -60 && me.jumps > 0) { o._up = true; o.up = true; a.dbl = false; } }
          if (me.vy > 0 && !aiSim(me, dir, false, false)) {
            let fixed = false; const c = Math.sign(W / 2 - me.x) || 1;
            for (const d of [c, -c, 0]) { if (aiSim(me, d, false, false)) { dir = d; fixed = true; break; } }
            if (!fixed && me.jumps > 0) for (const d of [c, 0, -c]) { if (aiSim(me, d, true, true)) { dir = d; o._up = true; o.up = true; ai.act = { dir: d, jump: true, dbl: true }; break; } }
            if (!fixed && !o._up) dir = c;
          }
        }
        o.left = dir < 0; o.right = dir > 0;
        if (t.alive && ai.t <= 0) {
          const facing = Math.sign(t.x - me.x) === me.face;
          if (!me.w || Dw.melee) { if (facing && dist < Dw.reach + PW * 2 + 4 && Math.abs(dyT) < PH * 0.8) { o._atk = true; o.atk = true; ai.t = AI_REACT + Math.random() * 0.2; } }
          else if (Dw.bomb) { if (dist < 320 && dist > 90) { if (!facing) { o.left = t.x < me.x; o.right = t.x > me.x; } else { o._thr = true; ai.t = 0.5; } } }
          else {
            const vy = (t.y - PH / 2) - (me.y - PH / 2); if (vy < -60) o.up = true; else if (vy > 60 && !me.gr) o.down = true;
            if (facing && Math.abs(vy) < (o.up || o.down ? 160 : 40) && dist < 520) { o._atk = true; o.atk = true; ai.t = (Dw.auto ? 0.02 : AI_REACT) + Math.random() * 0.2; }
            else if (!facing && dist < 500) { o.left = t.x < me.x; o.right = t.x > me.x; }
          }
          if (me.w && me.w.ammo <= 1 && !Dw.melee && !Dw.bomb && dist < 220 && Math.random() < 0.02) o._thr = true;
        }
        return o;
      }

      /* ---------- rounds ---------- */
      const idle = { left: false, right: false, up: false, down: false, atk: false, thr: false };
      function begin() { if (phase !== 'intro') return; resetRound(); phase = 'count'; countT = 0.9; banner = { t: STAGES[st].n, s: 'Get ready' }; sfx('click'); }
      function sim(dt, ir, iy) {
        if (phase === 'count') { countT -= dt; now += dt; if (countT <= 0) { phase = 'play'; banner = null; toast('Fight'); sfx('jump'); } }
        if (phase === 'play' || phase === 'ending') {
          now += dt;
          const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
          for (let k = 0; k < n; k++) {
            const a = k === 0 ? ir : Object.assign({}, ir, { _up: false, _atk: false, _thr: false });
            const b = k === 0 ? iy : Object.assign({}, iy, { _up: false, _atk: false, _thr: false });
            step(P.r, phase === 'play' ? a : idle, h); step(P.y, phase === 'play' ? b : idle, h);
            if (P.r.alive && P.y.alive && Math.abs(P.r.x - P.y.x) < PW * 2 - 2 && Math.abs(P.r.y - P.y.y) < PH * 0.7) { const s = Math.sign(P.y.x - P.r.x) || 1, o = (PW * 2 - 2 - Math.abs(P.r.x - P.y.x)) / 2; P.r.x -= s * o; P.y.x += s * o; }
            stepWorld(h);
          }
          if (phase === 'play' && (!P.r.alive || !P.y.alive)) { phase = 'ending'; endT = 1.3; }
          if (phase === 'ending') { endT -= dt; if (endT <= 0) roundOver(); }
        } else if (phase === 'round') { countT -= dt; if (countT <= 0) startRound(); }
        else if (phase === 'matchover') { countT -= dt; if (countT <= 0) finishMatch(); }
      }
      function roundOver() {
        const ra = P.r.alive, ya = P.y.alive;
        if (ra === ya) { phase = 'round'; countT = 1.6; banner = { t: 'Nobody survived', s: 'No point. Next arena coming up.' }; return; }
        const w = ra ? 'r' : 'y'; rounds[w]++;
        api.score(rounds.r);
        if (rounds[w] >= TOWIN) {
          phase = 'matchover'; countT = 1.4; sfx(w === 'r' || friend ? 'win' : 'lose');
          banner = { t: (w === 'r' ? (friend ? 'P1 wins' : 'You win') : friend ? 'P2 wins' : 'Bot wins'), s: 'Rounds ' + rounds.r + ' to ' + rounds.y };
        } else {
          phase = 'round'; countT = 1.8; sfx('score');
          banner = { t: NAME(w) + (w === 'r' && !friend ? ' take the round' : ' takes the round'), s: rounds.r + ' to ' + rounds.y + ' · Next: ' + STAGES[(st + 1) % STAGES.length].n };
        }
      }
      function finishMatch() {
        if (api.ended) return;
        const w = rounds.r >= TOWIN ? 'r' : 'y';
        api.over({ score: rounds.r, won: friend || w === 'r', title: banner ? banner.t : 'Match over', message: 'Rounds ' + rounds.r + ' to ' + rounds.y });
      }
      function startRound() { st = (st + 1) % STAGES.length; resetRound(); phase = 'count'; countT = 0.8; banner = { t: STAGES[st].n, s: 'Get ready' }; }

      /* ---------- drawing ---------- */
      function colP1() { try { return api.colors().accent || '#d97757'; } catch (e) { return '#d97757'; } }
      function L(x1, y1, x2, y2, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      function drawWep(k, lit, ink) {
        ctx.fillStyle = ink; ctx.strokeStyle = ink;
        if (k === 'pistol') { ctx.fillRect(-2, -3, 16, 6); ctx.fillRect(-2, 0, 6, 9); }
        else if (k === 'shotgun') { ctx.fillRect(-8, -3, 30, 5); ctx.fillStyle = '#7a4a24'; ctx.fillRect(-10, -3, 10, 8); }
        else if (k === 'rifle') { ctx.fillRect(-8, -3, 32, 5); ctx.fillRect(4, 1, 4, 9); ctx.fillRect(-10, -2, 6, 8); }
        else if (k === 'sword') { ctx.fillStyle = '#d9dde3'; ctx.fillRect(2, -2, 34, 4); ctx.fillStyle = ink; ctx.fillRect(-4, -2, 7, 4); ctx.fillRect(1, -6, 3, 12); }
        else if (k === 'bomb') {
          ctx.beginPath(); ctx.arc(4, 0, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(12, -10); ctx.stroke();
          if (lit) { ctx.fillStyle = Math.random() < 0.5 ? '#ffdf5a' : '#ff7a2a'; ctx.beginPath(); ctx.arc(12, -11, 3, 0, 7); ctx.fill(); }
        }
      }
      function drawFighter(p, col, ink) {
        const f = p.face, x = p.x, y = p.y, run = p.gr ? Math.sin(p.ph) : 0, air = !p.gr;
        const hipY = y - 22, neckY = y - PH + 12, headY = y - PH + 2;
        const lean = Math.max(-0.25, Math.min(0.25, p.vx / 1200)), hx = x + lean * 20;
        const s1 = air ? 0.5 : run * 0.7, s2 = air ? -0.3 : -run * 0.7;
        L(hx, hipY, x + Math.sin(s1) * 14, y - (air ? 4 : Math.max(0, Math.cos(s1) * 2)), 4, col);
        L(hx, hipY, x + Math.sin(s2) * 14, y - (air ? 8 : 0), 4, col);
        L(hx, hipY, hx + lean * 6, neckY, 4, col);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx + lean * 8, headY - 4, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + lean * 8 + f * 4, headY - 6, 2.2, 0, 7); ctx.fill();
        const sx = hx + lean * 4, sy = neckY + 4, ang = p.aim * 0.6, ext = p.atkT > 0 ? (p.w && WEP[p.w.k].melee ? 1 : p.w ? 0.3 : 1) : 0;
        const reach = 16 + ext * 12, ax = sx + Math.cos(ang) * reach * f, ay = sy + Math.sin(ang) * reach;
        L(sx, sy, ax, ay, 4, col);
        L(sx, sy, sx - f * 10, sy + 14 + run * 3, 4, col);
        if (p.w) {
          ctx.save(); ctx.translate(ax, ay); ctx.scale(f, 1);
          let r = ang; if (WEP[p.w.k].melee) r += p.atkT > 0 ? (0.16 - p.atkT) / 0.16 * 1.6 - 1.1 : -1.1;
          ctx.rotate(r); drawWep(p.w.k, false, ink); ctx.restore();
        }
        const bw = 34; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - bw / 2, y - PH - 24, bw, 4);
        ctx.fillStyle = p.hp > 35 ? '#fff' : '#ff6a5a'; ctx.fillRect(x - bw / 2, y - PH - 24, bw * Math.max(0, p.hp) / 100, 4);
        if (p.w && WEP[p.w.k].ammo > 1) D.text(ctx, String(p.w.ammo), x, y - PH - 32, 10, 'rgba(255,255,255,.9)', 700);
      }
      function render() {
        const c = api.colors(), dark = !!c.dark, { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const p1 = colP1(), p2 = D.P2, ink = dark ? '#ece8e0' : '#191a17';
        const top = D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: friend ? 'p1' : 'you', label: friend ? 'P1' : 'You', of: TOWIN, pips: rounds.r },
          right: { who: friend ? 'p2' : 'bot', label: friend ? 'P2' : 'Bot', of: TOWIN, pips: rounds.y },
          turn: null, status: phase === 'intro' ? 'First to 3' : STAGES[st].n
        }, c) || 40;
        const y0 = 8 + top + 8, avail = Math.max(10, h - y0 - 8), s = Math.min((w - 16) / W, avail / H);
        const ox = (w - W * s) / 2, oy = y0 + Math.max(0, (avail - H * s) / 2) * 0.4;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        D.roundRect(ctx, 0, 0, W, H, 16); ctx.save(); ctx.clip();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 24, (Math.random() - 0.5) * shake * 24);
        const S = STAGES[st], sky = dark ? S.dsky : S.sky, g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, H + 60);
        ctx.fillStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)';
        for (let i = 0; i < 12; i++) { const x = i * 72 - 10, hh = 60 + ((i * 53 + st * 31) % 90); ctx.fillRect(x, H - hh, 58, hh); }
        const plat = dark ? '#0f1012' : '#2b2d33', plat2 = dark ? '#3c3f47' : '#4a4d56';
        for (let i = 0; i < S.p.length; i++) {
          const r = rect(i); ctx.fillStyle = plat; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.fillStyle = plat2; ctx.fillRect(r[0], r[1], r[2], 4);
          if (S.p[i][4]) { ctx.strokeStyle = dark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(r[0] + r[2] / 2, 0); ctx.lineTo(r[0] + r[2] / 2, r[1]); ctx.stroke(); ctx.setLineDash([]); }
        }
        for (const it of items) {
          ctx.save(); ctx.translate(it.x, it.y - 6); ctx.rotate(it.rot); ctx.globalAlpha = it.empty ? 0.5 : 1; drawWep(it.k, it.fuse > 0, ink); ctx.restore();
          if (!it.empty && it.rest && !it.live) D.text(ctx, WEP[it.k].n, it.x, it.y - 22, 11, dark ? 'rgba(255,255,255,.8)' : 'rgba(25,26,23,.75)', 650);
        }
        ctx.globalAlpha = 1;
        for (const d of dolls) {
          const p = d.pts, col = d.side === 'r' ? p1 : p2; ctx.globalAlpha = Math.max(0, Math.min(1, (8 - d.t) / 1.5));
          for (const [a, b] of d.st) L(p[a].x, p[a].y, p[b].x, p[b].y, 4, col);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0].x, p[0].y - 4, 8, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (P.r && P.r.alive) drawFighter(P.r, p1, ink);
        if (P.y && P.y.alive) drawFighter(P.y, p2, ink);
        for (const b of bullets) { const a = Math.atan2(b.vy, b.vx); L(b.x, b.y, b.x - Math.cos(a) * 14, b.y - Math.sin(a) * 14, 3, dark ? '#fff6c2' : '#fff2a0'); }
        for (const b of boomFx) { const k = b.t / 0.5; ctx.fillStyle = 'rgba(255,160,60,' + (1 - k) * 0.6 + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, 30 + k * 100, 0, 7); ctx.fill(); }
        for (const q of parts) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2)); ctx.fillStyle = q.col; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.strokeStyle = c.line || 'rgba(0,0,0,.1)'; ctx.lineWidth = 1.5 / s; D.roundRect(ctx, 0.75, 0.75, W - 1.5, H - 1.5, 16); ctx.stroke();
        // banner card and toast, drawn at a readable size whatever the scale
        if (phase === 'intro') drawCard('Stick Brawl', friend ? 'P1 on the left, P2 on the right. Press any key to start.' : 'You are on the left. Press any key to start.', c, s);
        else if (banner) drawCard(banner.t, banner.s, c, s);
        if (toastT > 0 && toastMsg) { ctx.globalAlpha = Math.min(1, toastT * 3); drawPill(toastMsg, c, s); ctx.globalAlpha = 1; }
        ctx.restore();
      }
      function drawCard(title, sub, c, s) {
        const k = Math.min(1 / s, 1.6), cw = Math.min(W - 40, 380 * k), ch = (sub ? 84 : 56) * k, x = (W - cw) / 2, y = (H - ch) / 2;
        ctx.save();
        D.roundRect(ctx, x, y, cw, ch, 16 * k); ctx.fillStyle = c.dark ? 'rgba(30,28,25,.92)' : 'rgba(255,253,249,.94)'; ctx.fill();
        ctx.strokeStyle = c.line || 'rgba(0,0,0,.1)'; ctx.lineWidth = k; ctx.stroke();
        ctx.translate(W / 2, y); ctx.scale(k, k);
        D.fitText(ctx, title, 0, sub ? 30 : 28, cw / k - 28, 22, c.ink, 750, 14);
        if (sub) D.fitText(ctx, sub, 0, 60, cw / k - 28, 12.5, c.ink2 || c.ink, 550, 10);
        ctx.restore();
      }
      function drawPill(text, c, s) {
        const k = Math.min(1 / s, 1.6), pw = 110 * k, ph = 34 * k, x = (W - pw) / 2, y = 18 * k;
        ctx.save(); D.roundRect(ctx, x, y, pw, ph, ph / 2); ctx.fillStyle = c.accent || '#d97757'; ctx.fill();
        ctx.translate(W / 2, y + ph / 2); ctx.scale(k, k); D.text(ctx, text, 0, 1, 15, '#fff', 750); ctx.restore();
      }

      /* ---------- loop ---------- */
      api.loop(dt => {
        clock += dt;
        if (dt > 0) {
          const ir = readInput('r');
          let iy;
          if (!friend) { readInput('y'); iy = phase === 'play' ? aiInput(dt) : Object.assign({}, idle); } else iy = readInput('y');
          sim(dt, ir, iy);
          for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
          for (const b of boomFx) b.t += dt; boomFx = boomFx.filter(b => b.t < 0.5);
          stepDolls(dt); shake = Math.max(0, shake - dt); toastT = Math.max(0, toastT - dt);
        }
        render();
      });

      // Resume a saved match: the round score carries over and the next arena starts.
      try {
        const sv = api.saved;
        if (sv && sv.v === 1) {
          const ok = n => Number.isInteger(n) && n >= 0 && n < TOWIN;
          if (ok(sv.r) && ok(sv.y)) { rounds = { r: sv.r, y: sv.y }; api.score(rounds.r); }
          if (Number.isInteger(sv.st) && sv.st >= 0 && sv.st < STAGES.length) st = sv.st;
        }
      } catch (e) { rounds = { r: 0, y: 0 }; st = 0; }
      resetRound();

      return {
        save() {
          if (api.ended || phase === 'matchover') return null;
          if (rounds.r + rounds.y === 0) return null;
          return { v: 1, r: rounds.r, y: rounds.y, st };
        }
      };
    }
  });
})();
