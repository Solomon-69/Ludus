/* Right of Way (id stays 'finalpush'): a spear duel across five screens.
   Three controls only: walk, raise or lower your spear (high, middle, low) and thrust.
   A thrust is blocked when the other spear is held at the same height, so read the bot and change height.
   Kill the bot to take the road, then run right to your gate. Two rounds take the decider.
   Score = deciders won in a row. The run ends when the bot takes one. */
(function () {
  const RUST = '#a4553a';
  const W = 540, H = 262, FLOOR = 222, ZMIN = -2, ZMAX = 2, TOWIN = 2, NZ = ZMAX - ZMIN + 1;
  const AIMY = [24, 52, 80];                       // spear height above the floor: low, middle, high
  const BODY = 13, SPEED = 175, REACH = 112, SPEAR_GAP = 96, MIN_GAP = 42;
  const WIND = 0.16, ACT = 0.08, REC = 0.32, PARRY = 0.18, RESPAWN = 1.1;
  const KEYS = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    atk: ['Space', 'Enter', 'KeyJ', 'KeyX']
  };
  const ACTS = Object.keys(KEYS);
  // vs Friend: each player gets their own half of the keyboard.
  const KEYS1 = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], atk: ['KeyF', 'Space'] };
  const KEYS2 = { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], atk: ['Slash', 'Enter'] };
  // Bot by level: how late it sees you, how often it copies your height, how long it waits after changing height before thrusting
  const AI = [
    { lag: 0.36, guard: 0.5, commit: [0.45, 0.7], gap: [0.35, 0.6], atk: 0.45 },
    { lag: 0.23, guard: 0.74, commit: [0.28, 0.45], gap: [0.22, 0.4], atk: 0.6 },
    { lag: 0.15, guard: 0.88, commit: [0.18, 0.3], gap: [0.14, 0.26], atk: 0.72 }
  ];
  const PADS = [{ a: 'left' }, { a: 'right' }, { a: 'up' }, { a: 'down' }, { a: 'atk', l: 'Thrust' }];

  Ludus.register({
    id: 'finalpush', name: 'Sword Duel', aka: 'Right of Way', tag: 'Duel', tint: RUST, versus: true,
    waitForMove: true,   // stands still until the first move (see engine.js)
    hint: '<kbd>←</kbd><kbd>→</kbd> walk · <kbd>↑</kbd><kbd>↓</kbd> spear · <kbd>Space</kbd> thrust · friend: P1 <kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd><kbd>F</kbd>',
    art(ctx, w, h) {
      const f = h * 0.84;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, f, w, h - f);
      const man = (x, d, c, you) => {
        ctx.strokeStyle = '#2a1a12'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, f - 18); ctx.lineTo(x + d * 7, f); ctx.moveTo(x, f - 18); ctx.lineTo(x - d * 7, f); ctx.stroke();
        ctx.fillStyle = c; Ludus.draw.roundRect(ctx, x - 6, f - 38, 12, 22, 4); ctx.fill();
        if (you) Ludus.draw.spark(ctx, x + d, f - 46, 6.5, '#fff', 0);
        else { ctx.fillStyle = '#2a1a12'; Ludus.draw.roundRect(ctx, x + d - 6, f - 51, 12, 10, 3); ctx.fill(); }
        ctx.strokeStyle = '#f3dcc0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - d * 10, f - 27); ctx.lineTo(x + d * 30, f - 30); ctx.stroke();
      };
      man(w * 0.36, 1, '#f4c9a8', true); man(w * 0.64, -1, '#c9ced6', false);
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      const cfg = AI[api.level] || AI[1];
      const friend = api.friend, BOT = friend ? 'Player 2' : 'The bot', YOU = friend ? 'Player 1' : 'You';
      let clock = 0, now = 0, phase = 'count', countT = 1.6, zone = 0, row = '', parts = [], shake = 0;
      let rounds = { r: 0, y: 0 }, deciders = 0, banner = null, toastM = null, C = {}, endAt = 0;
      const mk = side => ({ side, x: side === 'r' ? 200 : 340, face: side === 'r' ? 1 : -1, h: 1, hAt: -9, atkH: 1, st: 'idle', t: 0, dur: 0,
        alive: true, inv: 0, deadAt: -9, deadX: 0, walk: 0, hit: false, respawnAt: 0, spawnX: null });
      let P = { r: mk('r'), y: mk('y') };
      const opp = p => (p.side === 'r' ? P.y : P.r);
      const runDir = s => (s === 'r' ? 1 : -1);

      // ---------- input: keys + on-screen buttons ----------
      const held = new Set(), edge = {}, pad = {}, padPtr = new Map();
      const K1 = friend ? KEYS1 : KEYS, edgeCodes = new Set();
      const actOf = code => ACTS.find(a => K1[a].includes(code) || (friend && KEYS2[a].includes(code)));
      api.keys(e => {
        const a = actOf(e.code); if (!a) return;
        e.preventDefault();
        if (phase === 'roundover' || (phase === 'matchover' && rounds.y < TOWIN && !friend)) { if (a === 'atk') go(); return; }
        if (!held.has(e.code)) edgeCodes.add(e.code);
        held.add(e.code);
      });
      api.keysUp(e => held.delete(e.code));
      api.on(window, 'blur', () => clearInput());
      function clearInput() { held.clear(); padPtr.clear(); for (const k in pad) pad[k] = false; for (const k in edge) edge[k] = false; edgeCodes.clear(); }
      function readInput(keys, usePad) {
        keys = keys || K1; if (usePad === undefined) usePad = true;
        const o = {};
        for (const a of ACTS) {
          o[a] = keys[a].some(c => held.has(c)) || (usePad && !!pad[a]);
          o['_' + a] = keys[a].some(c => edgeCodes.has(c)) || (usePad && !!edge[a]);
          keys[a].forEach(c => edgeCodes.delete(c)); if (usePad) edge[a] = false;
        }
        return o;
      }
      const noInput = () => { const o = {}; for (const a of ACTS) { o[a] = false; o['_' + a] = false; } return o; };

      // ---------- effects ----------
      function burst(x, y, c, n) { if (api.reduceMotion) n = Math.min(n, 8); for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380 - 60, life: 0.6 + Math.random() * 0.5, c, s: 3 + Math.random() * 4 }); }
      const toast = m => { toastM = { m, t: clock }; };
      const doShake = v => { if (!api.reduceMotion) shake = v; };

      // ---------- mechanics ----------
      function bounds(p) { let lo = 20, hi = W - 20; if (row === p.side && p.alive) { if (p.side === 'r') hi = 1e9; else lo = -1e9; } return [lo, hi]; }
      function clampX(p) { const [lo, hi] = bounds(p); p.x = Math.max(lo, Math.min(hi, p.x)); }
      function shove(p, dir, amt) { p.x += dir * amt; clampX(p); }
      function setSt(p, st, dur) { p.st = st; p.t = 0; p.dur = dur || 0; p.hit = false; }
      const tipX = (p, ext) => p.x + p.face * (BODY + 62 + ext);
      function setH(p, h) { h = Math.max(0, Math.min(2, h)); if (h !== p.h) { p.h = h; p.hAt = now; } }
      function kill(d, a) {
        if (!d.alive) return;
        d.alive = false; d.deadAt = now; d.deadX = d.x; setSt(d, 'idle');
        burst(d.x, FLOOR - 56, d.side, 26); doShake(0.25); api.sfx(d.side === 'r' ? 'boom' : 'hit');
        const had = row; row = a.side; d.respawnAt = now + RESPAWN; d.spawnX = null;
        toast(had !== a.side ? (a.side === 'r' ? YOU + ' take' + (friend ? 's' : '') + ' the road. Run right' : BOT + ' takes the road') : (a.side === 'r' ? 'Got it. Keep running' : BOT + ' got through'));
      }
      const facing = (a, d) => Math.sign(d.x - a.x || a.face) === a.face;
      // what happens when a's thrust lands on d
      function thrustResult(a, d) {
        if (!d.alive || d.inv > 0 || !facing(a, d) || Math.abs(d.x - a.x) > REACH) return 'miss';
        const guarding = d.st !== 'atk' && d.st !== 'stag' && d.face === -a.face && d.h === a.atkH;
        if (!guarding) return 'kill';
        return now - d.hAt <= PARRY ? 'parry' : 'block';
      }
      function applyThrust(a, d, r) {
        if (r === 'miss') return;
        if (r === 'kill') { kill(d, a); return; }
        burst(tipX(a, REACH - 62 - BODY), FLOOR - AIMY[a.atkH], 'steel', 10);
        if (r === 'parry') { setSt(a, 'stag', 0.7); shove(a, -a.face, 26); api.sfx('power'); toast(a.side === 'r' ? 'Parried. Get your guard up' : 'Parried. Strike now'); return; }
        setSt(a, 'stag', 0.32); shove(a, -a.face, 30); shove(d, a.face, 8); api.sfx('click');
        toast(a.side === 'r' ? 'Blocked. Change height' : 'Blocked');
      }
      function step(p, inp, dt) {
        if (!p.alive) { if (now >= p.respawnAt) respawn(p); return; }
        const o = opp(p);
        p.inv = Math.max(0, p.inv - dt); p.t += dt;
        if (o.alive && p.st !== 'atk') p.face = Math.sign(o.x - p.x) || p.face;
        else if (!o.alive && row === p.side && p.st === 'idle') p.face = runDir(p.side);
        if (p.st !== 'atk') { if (inp._up) setH(p, p.h + 1); else if (inp._down) setH(p, p.h - 1); }
        let vx = 0; const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (p.st === 'idle') {
          if (inp._atk) { setSt(p, 'atk'); p.atkH = p.h; api.sfx('jump'); }
          else vx = mv * SPEED;
        }
        if (p.st === 'atk') { if (p.t < WIND + ACT) vx = p.face * 70; if (p.t >= WIND + ACT + REC) setSt(p, 'idle'); }
        else if (p.st === 'stag') { if (p.t >= p.dur) setSt(p, 'idle'); }
        p.x += vx * dt; p.walk += Math.abs(vx) * dt * 0.09; clampX(p);
      }
      function respawn(p) {
        const k = opp(p); let x = p.spawnX;
        if (x == null) {
          if (!k.alive) x = p.side === 'r' ? 140 : W - 140;
          else { x = k.x + runDir(k.side) * 250; if (x > W - 40 || x < 40) { p.respawnAt = now + 0.3; return; } }
        }
        Object.assign(p, mk(p.side), { x, inv: 0.7, face: Math.sign(k.x - x) || p.face });
      }
      function nextZone(runner) {
        zone += runDir(runner.side);
        if (zone > ZMAX || zone < ZMIN) { zone = Math.max(ZMIN, Math.min(ZMAX, zone)); runner.x = runner.side === 'r' ? W - 70 : 70; runner.face = runDir(runner.side); setSt(runner, 'idle'); roundOver(runner.side); return; }
        api.sfx('score');
        runner.x = runner.side === 'r' ? 30 : W - 30;
        const d = opp(runner); d.alive = false; d.deadAt = -9; d.respawnAt = now + 0.7; d.spawnX = runner.side === 'r' ? W - 130 : 130;
      }
      function roundOver(side) {
        rounds[side]++;
        if (rounds[side] >= TOWIN) {
          phase = 'matchover'; endAt = clock;
          if (friend) {
            api.sfx('win'); clearInput();
            const wn = side === 'r' ? 'Player 1' : 'Player 2';
            api.timeout(() => api.over({ score: side === 'r' ? 1 : 0, won: true, title: wn + ' wins', message: 'Rounds ' + rounds.r + ' to ' + rounds.y }), 1400);
          } else if (side === 'r') {
            deciders++; api.score(deciders); api.sfx('win');
            banner = { t: clock, title: 'You take the decider', sub: deciders + ' in a row. Next one starts soon' };
          } else {
            api.sfx('lose'); clearInput();
            api.timeout(() => api.over({ score: deciders, won: false, title: 'Bot wins', message: deciders ? deciders + (deciders === 1 ? ' decider' : ' deciders') + ' won in a row' : 'No deciders won this time' }), 1400);
          }
        } else {
          phase = 'roundover'; endAt = clock; api.sfx(side === 'r' ? 'line' : 'over');
          banner = { t: clock, title: side === 'r' ? YOU + (friend ? ' reached the gate' : ' reached your gate') : BOT + ' reached its gate', sub: 'Rounds ' + rounds.r + ' to ' + rounds.y + '. Next round starts soon' };
        }
      }
      function resetRound() { zone = 0; row = ''; parts = []; P = { r: mk('r'), y: mk('y') }; ai.hist = []; ai.next = 0; ai.thrustAt = 0; ai.idleAt = now; }
      function go() {
        if (phase === 'matchover') { if (rounds.y >= TOWIN || friend) return; rounds = { r: 0, y: 0 }; }
        if (phase === 'roundover' || phase === 'matchover') { resetRound(); phase = 'count'; countT = 1.1; banner = null; clearInput(); api.sfx('tap'); }
      }

      // ---------- the bot (pushes left) ----------
      const ai = { hist: [], next: 0, thrustAt: 0, moveDir: 0, idleAt: 0 };
      // If the bot has done nothing at all for about 3 seconds (pinned or dithering), it walks at the foe or thrusts.
      function aiInput() {
        const o = aiPick(), me = P.y, op = P.r;
        if (o.left || o.right || o._atk || o._up || o._down || ai.thrustAt) ai.idleAt = now;
        else if (now - ai.idleAt > 3 && me.alive && op.alive && me.st === 'idle') {
          ai.idleAt = now - 1.5; ai.next = now;
          if (Math.abs(me.x - op.x) > REACH + 6) o[me.face < 0 ? 'left' : 'right'] = true; else o._atk = true;
        }
        return o;
      }
      function aiPick() {
        const me = P.y, op = P.r, o = noInput();
        ai.hist.push({ t: now, st: op.st, tt: op.t, h: op.h, alive: op.alive });
        while (ai.hist.length > 2 && ai.hist[0].t < now - 1) ai.hist.shift();
        let seen = ai.hist[0]; for (const s of ai.hist) { if (s.t <= now - cfg.lag) seen = s; else break; }
        if (!me.alive) return o;
        const fwd = me.face < 0 ? 'left' : 'right', back = me.face < 0 ? 'right' : 'left';
        if (!op.alive) { if (row === 'y') o.left = true; return o; }
        const d = Math.abs(me.x - op.x);
        const toH = h => { if (h > me.h) o._up = true; else if (h < me.h) o._down = true; };
        if (me.st !== 'idle') return o;
        // punish an opening right away
        if ((op.st === 'stag' || (op.st === 'atk' && op.t > WIND + ACT)) && d < REACH - 4) { o._atk = true; return o; }
        // planned thrust after a height change
        if (ai.thrustAt && now >= ai.thrustAt) {
          ai.thrustAt = 0;
          if (d < REACH + 6 && (seen.h !== me.h || Math.random() < 0.15)) { o._atk = true; return o; }
        }
        // guard: copy the height it saw, if it decides to
        if (seen.h !== me.h && !ai.thrustAt && Math.random() < cfg.guard * 0.25) { toH(seen.h); return o; }
        if (now < ai.next) { if (ai.moveDir) o[ai.moveDir > 0 ? fwd : back] = true; return o; }
        ai.next = now + cfg.gap[0] + Math.random() * (cfg.gap[1] - cfg.gap[0]); ai.moveDir = 0;
        const r = Math.random();
        if (d > REACH + 30) { ai.moveDir = 1; if (r < 0.4) toH(seen.h); return o; }
        if (d < REACH + 6) {
          if (r < cfg.atk) {
            // switch to a height you are not guarding, then thrust a moment later
            const opts = [0, 1, 2].filter(h => h !== seen.h);
            toH(opts[Math.floor(Math.random() * opts.length)]);
            ai.thrustAt = now + cfg.commit[0] + Math.random() * (cfg.commit[1] - cfg.commit[0]);
          } else if (r < cfg.atk + 0.15) ai.moveDir = -1;
          else toH(seen.h);
          return o;
        }
        ai.moveDir = r < 0.75 ? 1 : 0;
        return o;
      }

      // ---------- simulation ----------
      function sim(dt, ir, iy) {
        if (phase === 'count') { countT -= dt; if (countT <= 0) { phase = 'play'; banner = null; toast('Fight'); } }
        if ((phase === 'roundover' || (phase === 'matchover' && rounds.y < TOWIN)) && clock - endAt > 2.4) go();
        if (phase !== 'play') return;
        now += dt;
        const a = P.r, b = P.y;
        step(a, ir, dt); step(b, iy, dt);
        if (a.alive && b.alive) {
          const crossed = a.h === b.h && a.face === -b.face && a.st !== 'atk' && b.st !== 'atk';
          const gapMin = crossed ? SPEAR_GAP : MIN_GAP;
          const s = Math.sign(b.x - a.x) || 1, gap = Math.abs(b.x - a.x);
          if (gap < gapMin) {
            const o = (gapMin - gap) / 2; a.x -= s * o; b.x += s * o; clampX(a); clampX(b);
            if (Math.abs(b.x - a.x) < gapMin) { if (a.x <= bounds(a)[0] + 0.5 || a.x >= bounds(a)[1] - 0.5) b.x = a.x + s * gapMin; else a.x = b.x - s * gapMin; }
          }
        }
        const ta = a.alive && a.st === 'atk' && a.t >= WIND && !a.hit, tb = b.alive && b.st === 'atk' && b.t >= WIND && !b.hit;
        let ra = null, rb = null;
        if (ta) { a.hit = true; ra = thrustResult(a, b); } if (tb) { b.hit = true; rb = thrustResult(b, a); }
        if (ra === 'kill' && rb === 'kill') {
          shove(a, -a.face, 40); shove(b, -b.face, 40); setSt(a, 'stag', 0.25); setSt(b, 'stag', 0.25);
          burst((a.x + b.x) / 2, FLOOR - AIMY[a.atkH], 'steel', 10); api.sfx('click'); toast('Clash');
        } else if (ra === 'kill') applyThrust(a, b, ra);
        else if (rb === 'kill') applyThrust(b, a, rb);
        else { if (ra) applyThrust(a, b, ra); if (rb) applyThrust(b, a, rb); }
        if (row === 'r' && a.alive && a.x > W - 4) nextZone(a);
        else if (row === 'y' && b.alive && b.x < 4) nextZone(b);
      }

      // ---------- layout ----------
      // Tall: the arena fills the height under the cards (zoomed on the action, the camera follows the duel) and the five buttons sit in three
      // zones under it: walk left / right, spear Raise over Lower, and a big Thrust. Wide (the Rotate button): the arena in the middle, walk on its left, spear and thrust on its right.
      let camX = null;
      function layout() {
        const w = view.w, h = view.h, top = 58, strip = 26, gapB = 8, wide = w >= 560 && w >= h * 1.25;
        let pads = [], ww, wx, avail, wy;
        if (wide) {
          const zw = Math.max(112, Math.min(190, w * 0.2));
          ww = w - 2 * (zw + 12); wx = zw + 12; avail = h - top - strip - 12; wy = top;
          const r = Math.max(30, Math.min(52, (avail - 16) / 3.5)), rh = r * 3.5 + 16, ry = top + (avail - rh) / 2, lh = Math.min(avail, Math.max(90, r * 2.6)), ly = top + (avail - lh) / 2;
          const half = (zw - gapB) / 2, rx = w - zw - 8;
          pads = [{ a: 'left', x: 8, y: ly, w: half, h: lh }, { a: 'right', x: 8 + half + gapB, y: ly, w: half, h: lh },
            { a: 'up', x: rx, y: ry, w: zw, h: r }, { a: 'down', x: rx, y: ry + r + gapB, w: zw, h: r }, { a: 'atk', l: 'Thrust', x: rx, y: ry + 2 * r + 2 * gapB, w: zw, h: r * 1.5 }];
        } else {
          const padH = Math.min(128, Math.max(92, h * 0.19));
          ww = w - 16; wx = 8; avail = h - top - padH - strip - 20; wy = top;
          const py = h - padH - 8, tw = w - 16 - 2 * 12, a = tw * 0.4, m = tw * 0.22, t = tw * 0.38, half = (a - gapB) / 2, sh = (padH - gapB) / 2;
          pads = [{ a: 'left', x: 8, y: py, w: half, h: padH }, { a: 'right', x: 8 + half + gapB, y: py, w: half, h: padH },
            { a: 'up', x: 8 + a + 12, y: py, w: m, h: sh }, { a: 'down', x: 8 + a + 12, y: py + sh + gapB, w: m, h: sh },
            { a: 'atk', l: 'Thrust', x: 8 + a + m + 24, y: py, w: t, h: padH }];
        }
        const sFit = Math.min(ww / W, avail / H), s = Math.max(0.2, Math.min(avail / H, sFit * 1.7)), vw = Math.min(W, ww / s);
        const wh = H * s, awW = vw * s;
        wy = top + Math.max(0, (avail - wh) / 2);
        return { w, h, s, wx: wx + (ww - awW) / 2, wy, ww: awW, wh, vw, pads, wide, stripY: wy + wh + 16 };
      }
      function local(e) { const r = view.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
      const padAt = (x, y) => layout().pads.find(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
      api.on(view.canvas, 'pointerdown', e => {
        const [x, y] = local(e), p = padAt(x, y);
        if (phase === 'roundover' || (phase === 'matchover' && rounds.y < TOWIN)) { go(); return; }
        if (!p) return;
        e.preventDefault();
        if (!pad[p.a]) edge[p.a] = true; pad[p.a] = true; padPtr.set(e.pointerId, p.a);
        try { view.canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      });
      const release = e => { const a = padPtr.get(e.pointerId); if (a) { padPtr.delete(e.pointerId); if (![...padPtr.values()].includes(a)) pad[a] = false; } };
      api.on(view.canvas, 'pointerup', release);
      api.on(view.canvas, 'pointercancel', release);
      api.on(view.canvas, 'contextmenu', e => e.preventDefault());

      // ---------- drawing ----------
      function palette() {
        const c = api.colors();
        C = c.dark
          ? { wall: '#25211c', wall2: '#2f2a24', floor: '#3d362e', floor2: '#4a4238', steel: '#d9dce2', wood: '#b08a5c', fg: '#ece4d8', muted: '#9a9085', y: '#9aa3b0' }
          : { wall: '#efe7da', wall2: '#e2d7c5', floor: '#c9bca6', floor2: '#b8aa92', steel: '#3b3e44', wood: '#8a6a44', fg: '#2a241e', muted: '#8a8075', y: '#7d8592' };
        C.r = c.accent; C.ui = c;
        return c;
      }
      const line = (x1, y1, x2, y2, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      function gate(x, col) {
        ctx.fillStyle = C.wood; ctx.fillRect(x - 14, FLOOR - 150, 28, 150);
        ctx.fillStyle = col; ctx.fillRect(x - 14, FLOOR - 150, 28, 10);
        ctx.strokeStyle = C.fg; ctx.lineWidth = 2;
        for (let y = FLOOR - 130; y < FLOOR; y += 22) { ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.stroke(); }
      }
      function drawWorld() {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.fillStyle = C.wall; ctx.fillRect(-20, -20, W + 40, FLOOR + 20);
        ctx.fillStyle = C.wall2; ctx.beginPath(); ctx.moveTo(-20, FLOOR);
        const seed = zone * 1.7 + 3;
        for (let x = -20; x <= W + 20; x += 30) ctx.lineTo(x, FLOOR - 70 - 34 * Math.sin(x * 0.011 + seed) - 18 * Math.sin(x * 0.029 + seed * 2));
        ctx.lineTo(W + 20, FLOOR); ctx.fill();
        ctx.fillStyle = C.floor; ctx.fillRect(-20, FLOOR, W + 40, H - FLOOR + 20);
        ctx.fillStyle = C.floor2; for (let x = -(((zone * 41) % 70) + 70) % 70; x < W; x += 70) ctx.fillRect(x, FLOOR + 12, 34, 4);
        line(0, FLOOR, W, FLOOR, 2, C.fg);
        if (zone === ZMAX) gate(W - 24, C.r);
        if (zone === ZMIN) gate(24, C.y);
        D.text(ctx, zone === 0 ? 'CENTRE' : zone === ZMAX ? 'YOUR GATE' : zone === ZMIN ? 'BOT GATE' : zone > 0 ? 'YOUR SIDE' : 'BOT SIDE', W / 2, 24, 14, C.muted, 700);
        if (row && phase === 'play') {
          const col = row === 'r' ? C.r : C.y, d = runDir(row), ex = d > 0 ? W - (zone === ZMAX ? 48 : 18) : (zone === ZMIN ? 48 : 18);
          ctx.globalAlpha = api.reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(now * 8);
          for (let k = 0; k < 3; k++) { const x = ex - d * k * 16; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - d * 8, FLOOR - 70); ctx.lineTo(x, FLOOR - 56); ctx.lineTo(x - d * 8, FLOOR - 42); ctx.stroke(); }
          ctx.globalAlpha = 1;
        }
        drawFighter(P.r); drawFighter(P.y);
        for (const q of parts) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2)); ctx.fillStyle = C[q.c] || q.c; ctx.fillRect(q.x, q.y, q.s, q.s); }
        ctx.globalAlpha = 1;
      }
      function drawFighter(p) {
        const col = C[p.side], d = p.face, who = p.side === 'r' ? 'you' : friend ? 'p2' : 'bot';
        if (!p.alive) {
          const age = now - p.deadAt; if (age > 1.6 || p.deadAt < 0) return;
          ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
          ctx.fillStyle = col; ctx.fillRect(p.deadX - 20, FLOOR - 12, 40, 12);
          D.avatar(ctx, p.deadX - d * 30, FLOOR - 10, 9, who, C.ui);
          ctx.globalAlpha = 1; return;
        }
        const blink = p.inv > 0 && Math.floor(now * 20) % 2 ? 0.35 : 1;
        ctx.globalAlpha = blink;
        let ext = 0;
        if (p.st === 'atk') { const t = p.t; ext = t < WIND ? -18 * (t / WIND) : t < WIND + ACT ? REACH - 62 - BODY : Math.max(0, (REACH - 62 - BODY) * (1 - (t - WIND - ACT) / REC)); }
        const lean = p.st === 'atk' && p.t >= WIND ? 8 : 0, x = p.x + d * lean, hip = FLOOR - 40, sh = FLOOR - 78, sw = Math.sin(p.walk) * 10;
        line(x, hip, x + d * 14 + sw, FLOOR, 4, C.fg);
        line(x, hip, x - d * 14 - sw, FLOOR, 4, C.fg);
        ctx.fillStyle = col; D.roundRect(ctx, x - 11, sh, 22, hip - sh + 4, 6); ctx.fill();
        D.avatar(ctx, x + d * 2, sh - 14, 12, who, C.ui);
        if (p.st === 'stag') { ctx.strokeStyle = C.muted; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = now * 9 + i * 2.1; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 14, sh - 34 + Math.sin(a) * 4, 2.5, 0, 7); ctx.stroke(); } }
        // height marker: three notches behind the fighter, the lit one is where the spear is
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k === p.h ? col : C.muted; ctx.globalAlpha = blink * (k === p.h ? 1 : 0.35);
          ctx.beginPath(); ctx.arc(x - d * 24, FLOOR - AIMY[k], k === p.h ? 4 : 2.5, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = blink;
        const hh = p.st === 'atk' ? p.atkH : p.h, sy = FLOOR - AIMY[hh], tip = tipX(p, ext) + d * lean, butt = tip - d * 92;
        line(x + d * 4, sh + 10, butt + d * 40, sy + 4, 3, C.fg);
        line(butt, sy + 2, tip, sy, 3, C.wood);
        ctx.fillStyle = C.steel; ctx.beginPath(); ctx.moveTo(tip + d * 10, sy); ctx.lineTo(tip, sy - 5); ctx.lineTo(tip, sy + 5); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      function render() {
        const col = palette(), L = layout(), { w, h } = L;
        ctx.clearRect(0, 0, w, h);
        // header
        let status;
        if (phase === 'matchover') status = rounds.y >= TOWIN ? (friend ? 'Player 2 wins' : 'Bot wins') : (friend ? 'Player 1 wins' : 'You win');
        else if (phase === 'roundover') status = 'Round over';
        else if (phase === 'count') status = 'Get ready';
        else status = !row ? 'Take the road' : friend ? (row === 'r' ? 'P1: run right' : 'P2: run left') : row === 'r' ? 'Run right' : 'Stop the bot';
        D.duelHeader(ctx, 8, 8, w - 16, { left: { who: 'you', label: friend ? 'Player 1' : undefined, pips: rounds.r, of: TOWIN }, right: { who: friend ? 'p2' : 'bot', label: friend ? 'Player 2' : undefined, pips: rounds.y, of: TOWIN },
          turn: phase === 'play' && row ? (row === 'r' ? 'left' : 'right') : null, status }, col);
        // world
        ctx.save();
        D.roundRect(ctx, L.wx, L.wy, L.ww, L.wh, 12); ctx.clip();
        { const mid = (P.r.x + P.y.x) / 2, far = Math.abs(P.r.x - P.y.x) > L.vw - 120, want = Math.max(0, Math.min(W - L.vw, (far ? P.r.x + (P.y.x > P.r.x ? 1 : -1) * L.vw * 0.2 : mid) - L.vw / 2));
          camX = camX === null || api.reduceMotion ? want : camX + (want - camX) * 0.14; }
        ctx.translate(L.wx - camX * L.s, L.wy); ctx.scale(L.s, L.s);
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        drawWorld();
        ctx.restore();
        // where you are on the road: bot gate on the left, your gate on the right
        const zw = Math.min(40, (w - 110) / NZ), zx = w / 2 - (zw * NZ + (NZ - 1) * 4) / 2;
        for (let z = ZMIN; z <= ZMAX; z++) {
          const i = z - ZMIN, x = zx + i * (zw + 4);
          ctx.fillStyle = z === zone ? col.ink : z === ZMAX ? C.r : z === ZMIN ? C.y : col.line;
          D.roundRect(ctx, x, L.stripY - 4, zw, z === zone ? 9 : 7, 3); ctx.fill();
        }
        D.avatar(ctx, zx - 16, L.stripY, 10, friend ? 'p2' : 'bot', col);
        D.avatar(ctx, zx + NZ * (zw + 4) + 12, L.stripY, 10, 'you', col);
        // toast
        if (toastM && clock - toastM.t < 1.3) {
          const k = clock - toastM.t, a = Math.min(1, k / 0.12) * Math.min(1, (1.3 - k) / 0.25);
          ctx.globalAlpha = a; ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
          const tw = ctx.measureText(toastM.m).width + 24;
          const ty = L.wy + Math.max(24, 44 * L.s);
          ctx.fillStyle = col.ink; D.roundRect(ctx, w / 2 - tw / 2, ty - (api.reduceMotion ? 0 : (1 - Math.min(1, k / 0.2)) * 6), tw, 26, 13); ctx.fill();
          D.text(ctx, toastM.m, w / 2, ty + 13, 13, col.bg, 700); ctx.globalAlpha = 1;
        }
        // buttons: walk left / right, spear up / down, thrust
        L.pads.forEach(p => {
          const on = !!pad[p.a] || K1[p.a].some(c => held.has(c));
          ctx.save(); ctx.translate(p.x + p.w / 2, p.y + p.h / 2); const s = on ? 0.96 : 1; ctx.scale(s, s);
          ctx.fillStyle = on ? (p.a === 'atk' ? col.accent : col.ink) : (p.a === 'atk' ? col.ink : col.surface2);
          D.roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 14); ctx.fill();
          ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.stroke();
          const ic = on ? (p.a === 'atk' ? '#fff8f2' : col.bg) : (p.a === 'atk' ? col.bg : col.ink);
          ctx.fillStyle = ic;
          const tri = (dx, dy) => { ctx.beginPath(); ctx.moveTo(dx * 9, dy * 9); ctx.lineTo(-dx * 7 - dy * 9, -dy * 7 - dx * 9); ctx.lineTo(-dx * 7 + dy * 9, -dy * 7 + dx * 9); ctx.closePath(); ctx.fill(); };
          if (p.a === 'left') tri(-1, 0); else if (p.a === 'right') tri(1, 0);
          else if (p.a === 'up' || p.a === 'down') {
            if (p.h < 64) { ctx.save(); ctx.translate(-p.w * 0.24, 0); ctx.scale(0.8, 0.8); tri(0, p.a === 'up' ? -1 : 1); ctx.restore(); D.text(ctx, p.a === 'up' ? 'Raise' : 'Lower', p.w * 0.1, 1, 11.5, ic, 700); }
            else { ctx.save(); ctx.translate(0, -6); ctx.scale(0.8, 0.8); tri(0, p.a === 'up' ? -1 : 1); ctx.restore(); D.text(ctx, p.a === 'up' ? 'Raise' : 'Lower', 0, p.h / 2 - 11, 10, ic, 650); }
          }
          else { D.text(ctx, 'Thrust', 0, -4, 14, ic, 750); D.text(ctx, 'Space', 0, 12, 9.5, ic, 600); }
          ctx.restore();
        });
        // banner (round breaks only; the final board stays clear)
        if (banner) {
          const k = Math.min(1, (clock - banner.t) / 0.3), e = api.reduceMotion ? 1 : D.ease.outBack(k);
          ctx.save(); ctx.translate(w / 2, L.wy + L.wh / 2); ctx.scale(e, e);
          const bw = Math.min(290, L.ww - 20), bh = banner.sub ? 62 : 44;
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16;
          D.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 16); ctx.fill(); ctx.shadowBlur = 0;
          D.text(ctx, banner.title, 0, banner.sub ? -10 : 1, 15, col.ink, 750);
          if (banner.sub) D.text(ctx, banner.sub, 0, 13, 10.5, col.ink2, 560);
          ctx.restore();
        }
      }

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 2 || !sv.rounds) return false;
        const rr = sv.rounds.r | 0, ry = sv.rounds.y | 0;
        if (rr < 0 || ry < 0 || rr >= TOWIN || ry >= TOWIN) return false;
        rounds = { r: rr, y: ry }; deciders = Math.max(0, sv.deciders | 0); api.score(deciders);
        if (Number.isInteger(sv.zone) && sv.zone >= ZMIN && sv.zone <= ZMAX) zone = sv.zone;
        row = sv.row === 'r' || sv.row === 'y' ? sv.row : '';
        ['r', 'y'].forEach(k => {
          const q = sv[k]; if (!q || typeof q.x !== 'number' || q.x < 20 || q.x > W - 20) return;
          P[k].x = q.x; P[k].h = Math.max(0, Math.min(2, q.h | 0));
        });
        if (Math.abs(P.r.x - P.y.x) < MIN_GAP) { P.r = mk('r'); P.y = mk('y'); }
        phase = 'count'; countT = 1.2;
        return true;
      }
      const restored = restore(api.saved);
      if (phase === 'count' && !banner) banner = { t: 0, title: 'Push right to your gate', sub: 'Same spear height blocks. Change height to get through' };

      api.loop(dt => {
        clock += dt;
        const ir = phase === 'play' ? readInput() : (readInput(), noInput());
        const iy = phase === 'play' ? (friend ? readInput(KEYS2, false) : aiInput()) : (friend ? (readInput(KEYS2, false), noInput()) : noInput());
        sim(dt, ir, iy);
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i]; q.life -= dt; q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.y > FLOOR) { q.y = FLOOR; q.vy *= -0.3; q.vx *= 0.6; }
          if (q.life <= 0) parts.splice(i, 1);
        }
        shake = Math.max(0, shake - dt);
        render();
      });
      if (window.ludusDebug) window.ludusDebug.finalpush = () => { const L = layout(); return { wide: L.wide, w: L.w, h: L.h, s: L.s, arena: [L.wx, L.wy, L.ww, L.wh], pads: L.pads.map(p => ({ a: p.a, x: p.x, y: p.y, w: p.w, h: p.h })) }; };
      if (window.ludusDebug) window.ludusDebug.botTest = {   // test hook: positions of both fighters, and a teleport for the bot
        state: () => ({ phase, sig: [rounds.r, rounds.y, P.r.x, P.y.x, P.r.h, P.y.h, P.r.alive ? 1 : 0, P.y.alive ? 1 : 0, zone, P.y.st === 'idle' ? 0 : 1, P.y.t], bot: [P.y.x, 0] }),
        tp: (x) => { P.y.x = x; }
      };
      return {
        resume() { clearInput(); },
        save() {
          if (api.ended) return null;
          if (phase === 'matchover' && rounds.y >= TOWIN) return null;   // the bot won: nothing to resume
          let rr = rounds.r, ry = rounds.y;
          if (phase === 'matchover') { rr = 0; ry = 0; }
          const between = phase === 'roundover' || phase === 'matchover';
          if (!between && !now && !restored && !rr && !ry && !deciders) return null;
          const fighter = q => (q.alive && !between ? { x: Math.max(20, Math.min(W - 20, q.x)), h: q.h } : null);
          return { v: 2, rounds: { r: rr, y: ry }, deciders, zone: between ? 0 : zone, row: between ? '' : row, r: fighter(P.r), y: fighter(P.y) };
        }
      };
    }
  });
})();
