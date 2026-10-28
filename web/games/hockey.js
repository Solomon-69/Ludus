/* Air Puck: air hockey for two people on one keyboard. P1 guards the bottom goal, P2 the top one
   (on a landscape stage the rink is drawn turned on its side: P1 left, P2 right).
   Mallets glide with smooth acceleration; first to 5 goals wins.
   Physics always run in rink space: x across (0..W), y along (0 = P2 goal, H = P1 goal). */
(function () {
  const D = Ludus.draw;
  const W = 300, PH = 440, MAX_H = 680, GOAL = 112, MR = 21, PR = 12, TARGET = 5;
  const ACC = 2600, MAX_M = 410, SUB = 4;

  // Two people, one keyboard: P1 = WASD (+F / left Shift), P2 = arrows (+ / , right Shift, Enter).
  function makePads(api) {
    const bot = !api.friend;   // vs Bot: both key sets drive P1
    const mine = api.online ? (api.online.seat === 0 ? 'p1' : 'p2') : null;   // online: both key sets drive my own mallet
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act', ShiftLeft: 'act' };
    const K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', ShiftRight: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false });
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
    api.keys(e => { const m = find(e); if (!m) return; e.preventDefault(); pads[m[0]][m[1]] = true; });
    api.keysUp(e => { const m = find(e); if (m) pads[m[0]][m[1]] = false; });
    pads.clear = () => { Object.assign(pads.p1, blank()); Object.assign(pads.p2, blank()); };
    api.on(window, 'blur', pads.clear);
    return pads;
  }

  // Mallet hits puck (mallet treated as very heavy). Pure, for tests: returns the new puck velocity.
  function strike(puck, mallet, e) {
    const dx = puck.x - mallet.x, dy = puck.y - mallet.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const rvx = puck.vx - mallet.vx, rvy = puck.vy - mallet.vy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return { vx: puck.vx, vy: puck.vy };
    return { vx: puck.vx - (1 + e) * vn * nx, vy: puck.vy - (1 + e) * vn * ny };
  }

  Ludus.register({
    id: 'hockey', name: 'Air Hockey', aka: 'Air Puck', tag: '2 Player', wide: true, tint: '#e05d8b', versus: true, defaultVs: 'friend',
    online: { min: 2, max: 2 },
    onlineHint: '<b>Online</b> you guard the goal on your side (left, or bottom when turned) · mouse, trackpad, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows',
    hint: '<b>vs Bot</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move · <b>vs Friend</b> P1 (left) <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · P2 (right) <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>',
    _rules: { strike },
    art(ctx, w, h) {
      // A side-on rink in play: boards, centre line and circle, two goals, two mallets and the puck with a short trail.
      const DR = Ludus.draw, u = h / 78, rx = w * 0.07, ry = h * 0.12, rw = w * 0.86, rh = h * 0.76, cy = ry + rh / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; DR.roundRect(ctx, rx, ry, rw, rh, rh * 0.32); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2 * u; DR.roundRect(ctx, rx, ry, rw, rh, rh * 0.32); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.moveTo(w / 2, ry); ctx.lineTo(w / 2, ry + rh); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, cy, rh * 0.22, 0, Math.PI * 2); ctx.stroke();
      [rx, rx + rw].forEach((gx, k) => { ctx.beginPath(); ctx.arc(gx, cy, rh * 0.26, k ? Math.PI / 2 : -Math.PI / 2, k ? Math.PI * 1.5 : Math.PI / 2); ctx.stroke(); });
      ctx.fillStyle = '#2b2018'; [rx, rx + rw].forEach(gx => { DR.roundRect(ctx, gx - 2.5 * u, cy - rh * 0.17, 5 * u, rh * 0.34, 2.5 * u); ctx.fill(); });
      const mallet = (x, y, col) => {
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.arc(x, y + 1.6 * u, rh * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rh * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x, y, rh * 0.07, 0, Math.PI * 2); ctx.fill();
      };
      mallet(rx + rw * 0.2, cy + rh * 0.12, '#fff8f2'); mallet(rx + rw * 0.8, cy - rh * 0.14, '#5b8def');
      const px = rx + rw * 0.6, py = cy + rh * 0.16, pr = rh * 0.085;
      for (let i = 4; i >= 1; i--) { ctx.fillStyle = `rgba(43,32,24,${0.08 * (5 - i)})`; ctx.beginPath(); ctx.arc(px - i * pr * 1.1, py + i * pr * 0.32, pr * (1 - i * 0.12), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const view = api.canvas(onResize);
      const { ctx } = view;
      const pads = makePads(api);
      const on = api.online, guest = !!(on && !on.isHost);
      const nameOf = id => Ludus.rt.seatName(api, id === 'p1' ? 0 : 1);
      let net = null;   // host: the guest's mallet keys, already turned into rink directions
      // Rink length follows the stage: portrait keeps the classic 300 x 440 rink; landscape lays it on
      // its side and stretches it to fill the width (P1 goal left, P2 goal right).
      const lengthFor = (w, h) => w > h ? Math.max(PH, Math.min(MAX_H, Math.round((W + 16) * (w - 16) / Math.max(1, h - 64) - 16))) : PH;
      // Untransformed stage size (the panel's slide-in scale would skew getBoundingClientRect).
      const dims = () => [stage.clientWidth || view.w, stage.clientHeight || view.h];
      let H = lengthFor(...dims());
      // Side-on (wide) unless the player turned it with the Rotate button (remembered); never chosen by the panel's shape.
      const flat = () => !(Ludus.state && Ludus.state.orient && Ludus.state.orient.hockey === false);
      // Online, the guest sees the rink turned round, so everyone has their own goal on their side: left when wide, bottom when tall.
      const flip = () => guest;
      // Keys in rink space. On the side-on rink, screen right is towards P2's goal (rink up),
      // screen up is rink left, so WASD and the arrows still move each mallet the way they point (turned round for the guest).
      const dirs = p => flat() ? (flip() ? { up: p.left, down: p.right, left: p.down, right: p.up } : { up: p.right, down: p.left, left: p.up, right: p.down })
        : flip() ? { up: p.down, down: p.up, left: p.right, right: p.left } : p;
      // Mouse / trackpad: the mallet follows the pointer inside its own half. A key press hands control back to the keys.
      let aim = null, lay = null;
      const mineId = on ? (on.seat === 0 ? 'p1' : 'p2') : 'p1';
      const anyKey = p => p.up || p.down || p.left || p.right;
      function pointerAim(e) {
        if (!lay) return;
        const r = view.canvas.getBoundingClientRect(), kx = view.w / (r.width || view.w), ky = view.h / (r.height || view.h);
        const sx = ((e.clientX - r.left) * kx - lay.ox) / lay.s, sy = ((e.clientY - r.top) * ky - lay.oy) / lay.s;
        let x = sx, y = sy;
        if (lay.side) { x = sy; y = H - sx; } else { x = sx; y = sy; }
        if (lay.flip) { x = W - x; y = H - y; }
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        aim = { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
      }
      api.on(view.canvas, 'pointermove', e => { if (e.pointerType !== 'touch' || e.buttons) pointerAim(e); });
      api.on(view.canvas, 'pointerdown', e => pointerAim(e));
      const myAim = () => { if (aim && anyKey(pads[mineId])) aim = null; return aim; };
      if (window.ludusDebug) window.ludusDebug.hockeyAim = (x, y) => { aim = x === null ? null : { x, y }; };   // test hook: rink coordinates
      const MAX_P = [520, 600, 690][api.level];
      let score, mallets, puck, phase, phaseT, clock = 0, parts = [], trail = [], lastGoal = null, overCalled = false, hitFx = { p1: -9, p2: -9 };

      function reset() { score = { p1: 0, p2: 0 }; api.score(0); faceoff(Math.random() < 0.5 ? 'p1' : 'p2'); }
      function faceoff(side) {
        mallets = { p1: { x: W / 2, y: H - 60, vx: 0, vy: 0 }, p2: { x: W / 2, y: 60, vx: 0, vy: 0 } };
        puck = { x: W / 2, y: side === 'p1' ? H * 0.68 : H * 0.32, vx: 0, vy: 0 };
        phase = 'ready'; phaseT = 0.9; trail = [];
      }

      // Bot (P2, the top / right mallet): sees the puck only every so often with a little aiming error,
      // defends its goal line, and hits the puck towards P1's goal when it gets the chance.
      // It never traps the puck: by a wall it banks the shot off that wall from the goal side, in a corner it waits on the goal
      // side (off the puck's way out) until the corner nudge frees it, and a puck sitting slow in its half for 1.5 s makes it back off and shoot.
      const REACT = [0.2, 0.13, 0.08][api.level], ERR = [34, 20, 10][api.level], DEF_Y = 66;
      let ai = { tx: W / 2, ty: DEF_Y, timer: 0, ex: 0, slow: 0, back: 0 };
      const axisDir = (pos, v, t) => { const d = t - pos; return Math.abs(d) < 4 || (v * d > 0 && Math.abs(v) / 9 >= Math.abs(d)) ? 0 : d > 0 ? 1 : -1; };
      const clampHalf = (x, y) => [Math.max(MR, Math.min(W - MR, x)), Math.max(MR, Math.min(H / 2 - MR - 8, y))];
      // The line to hit the puck along: towards P1's goal, or banked off the wall the bot cannot get behind. corner = no clean line.
      function shotLine(px, py) {
        const R = MR + PR + 12;
        let dx = W / 2 + ai.ex - px, dy = H - py; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const fx = px - dx * R < MR + 2 || px - dx * R > W - MR - 2, fy = py - dy * R < MR + 2;
        if (fx && fy) return { corner: true };
        if (fx || fy) {
          // strike into the wall at a good angle so it comes off towards the open rink and misses the mallet on the way out
          if (fx) { dx = px < W / 2 ? -0.62 : 0.62; dy = 0.78; }   // side wall: into it and down, mallet above (goal side)
          else { dx = px < W / 2 ? 0.66 : -0.66; dy = -0.75; }      // back wall: up into it, comes off towards the middle
        }
        return { dx, dy, corner: false };
      }
      // A spot on the goal side of the puck, along the bot's back wall towards its goal, well clear of the puck's way out.
      const goalSide = (px, py, gap) => clampHalf(px + (px < W / 2 ? gap : -gap), Math.max(MR, py - gap * 0.5));
      function botAxes(dt) {
        const m = mallets.p2;
        ai.timer -= dt;
        const speed = Math.hypot(puck.vx, puck.vy), mineHalf = puck.y < H / 2 - PR;
        // Stall timer: the puck slow in the bot's half for 1.5 s means the bot is not getting it out; back off, then shoot.
        if (phase === 'play' && mineHalf && speed < 80) ai.slow += dt; else ai.slow = 0;
        if (ai.slow > 1.5) { ai.slow = 0; ai.back = 0.5; }
        if (ai.back > 0) {
          ai.back -= dt;
          [ai.tx, ai.ty] = goalSide(puck.x, puck.y, 80);
          if (ai.back <= 0) ai.timer = 0;   // then attack straight away
          return [axisDir(m.x, m.vx, ai.tx), axisDir(m.y, m.vy, ai.ty)];
        }
        if (ai.timer <= 0) {
          ai.timer = REACT; ai.ex = api.rand(-ERR, ERR);
          const px = puck.x, py = puck.y;
          if (mineHalf && (speed < 90 || puck.vy > 0 || py < m.y + 4)) {
            const L = shotLine(px, py);
            if (L.corner) {
              // a puck in the corner cannot be hit out cleanly (it comes straight back off both walls): wait on the goal side
              [ai.tx, ai.ty] = goalSide(px, py, 76);
            } else {
              // attack: line up behind the puck on the shot line, then drive through it
              const R = MR + PR + 12, bx = px - L.dx * R, by = py - L.dy * R;
              const along = (m.x - px) * -L.dx + (m.y - py) * -L.dy, off = Math.abs((m.x - px) * -L.dy + (m.y - py) * L.dx);
              if (along > 0 && off < (MR + PR) * 0.6) [ai.tx, ai.ty] = clampHalf(px + L.dx * 30, py + L.dy * 30);
              else [ai.tx, ai.ty] = clampHalf(bx, by);
              // going round the puck to get behind it: never cut across it (that pins it on the wall)
              if (!(along > 0 && off < (MR + PR) * 0.6) && Math.hypot(m.x - px, m.y - py) < MR + PR + 16 && along < 0) {
                [ai.tx, ai.ty] = clampHalf(m.x + (m.x - px), m.y + (m.y - py));
              }
            }
          } else if (puck.vy < -20) {
            // incoming: predict where it crosses the defence line (bounces off the side walls folded in)
            let x = puck.x + puck.vx * ((DEF_Y - puck.y) / puck.vy);
            const span = W - 2 * PR, q = ((x - PR) % (span * 2) + span * 2) % (span * 2);
            x = PR + (q > span ? span * 2 - q : q);
            ai.tx = x + ai.ex; ai.ty = DEF_Y;
          } else { ai.tx = W / 2 + (puck.x - W / 2) * 0.3; ai.ty = DEF_Y + 14; }
        }
        return [axisDir(m.x, m.vx, ai.tx), axisDir(m.y, m.vy, ai.ty)];
      }
      function moveMallet(id, dt) {
        const m = mallets[id], p = net && id === 'p2' ? net : dirs(pads[id]), live = phase === 'play' || phase === 'ready';
        let ax = live ? (p.right ? 1 : 0) - (p.left ? 1 : 0) : 0, ay = live ? (p.down ? 1 : 0) - (p.up ? 1 : 0) : 0;
        if (id === 'p2' && !api.friend) { [ax, ay] = live ? botAxes(dt) : [0, 0]; }
        const target = !live ? null : net && id === 'p2' ? net.aim : id === mineId && !(id === 'p2' && !api.friend && !on) ? myAim() : null;
        stepMallet(id, m, ax, ay, dt, ax || ay ? null : target);
      }
      function stepMallet(id, m, ax, ay, dt, target) {
        if (target) {
          // follow the pointer: head for it at up to full speed, easing in as it gets close (no overshoot, no jitter)
          const dvx = Math.max(-MAX_M, Math.min(MAX_M, (target.x - m.x) * 16)), dvy = Math.max(-MAX_M, Math.min(MAX_M, (target.y - m.y) * 16));
          const ex = dvx - m.vx, ey = dvy - m.vy, el = Math.hypot(ex, ey), lim = ACC * 2.2 * dt;
          if (el > lim) { m.vx += ex / el * lim; m.vy += ey / el * lim; } else { m.vx = dvx; m.vy = dvy; }
          ax = ay = 0;
        } else if (ax && ay) { ax *= Math.SQRT1_2; ay *= Math.SQRT1_2; }
        const damp = Math.exp(-9 * dt);
        if (target) { /* velocity set above */ }
        else {
          if (ax) m.vx += ax * ACC * dt * (m.vx * ax < 0 ? 1.7 : 1); else m.vx *= damp;
          if (ay) m.vy += ay * ACC * dt * (m.vy * ay < 0 ? 1.7 : 1); else m.vy *= damp;
        }
        const sp = Math.hypot(m.vx, m.vy); if (sp > MAX_M) { m.vx *= MAX_M / sp; m.vy *= MAX_M / sp; }
        m.x += m.vx * dt; m.y += m.vy * dt;
        const y0 = id === 'p1' ? H / 2 + 6 : MR, y1 = id === 'p1' ? H - MR : H / 2 - 6;
        if (m.x < MR) { m.x = MR; m.vx = 0; } if (m.x > W - MR) { m.x = W - MR; m.vx = 0; }
        if (m.y < y0) { m.y = y0; m.vy = 0; } if (m.y > y1) { m.y = y1; m.vy = 0; }
      }

      const inMouth = x => Math.abs(x - W / 2) < GOAL / 2 - PR * 0.4;
      function collide(id) {
        const m = mallets[id], dx = puck.x - m.x, dy = puck.y - m.y, d = Math.hypot(dx, dy);
        if (d >= MR + PR || d === 0) return;
        const v = strike(puck, m, 0.9);
        const hard = Math.hypot(v.vx - puck.vx, v.vy - puck.vy);
        puck.vx = v.vx; puck.vy = v.vy;
        puck.x = m.x + dx / d * (MR + PR); puck.y = m.y + dy / d * (MR + PR);
        if (hard > 30 && clock - hitFx[id] > 0.08) { api.sfx(hard > 380 ? 'hit' : 'tap'); hitFx[id] = clock; }
      }
      function walls() {
        let bump = false;
        if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx) * 0.9; bump = true; }
        if (puck.x > W - PR) { puck.x = W - PR; puck.vx = -Math.abs(puck.vx) * 0.9; bump = true; }
        if (!inMouth(puck.x)) {
          if (puck.y < PR) { puck.y = PR; puck.vy = Math.abs(puck.vy) * 0.9; bump = true; }
          if (puck.y > H - PR) { puck.y = H - PR; puck.vy = -Math.abs(puck.vy) * 0.9; bump = true; }
        }
        // goal posts
        [[W / 2 - GOAL / 2, 0], [W / 2 + GOAL / 2, 0], [W / 2 - GOAL / 2, H], [W / 2 + GOAL / 2, H]].forEach(([px, py]) => {
          const dx = puck.x - px, dy = puck.y - py, d = Math.hypot(dx, dy);
          if (d < PR + 3 && d > 0) {
            const nx = dx / d, ny = dy / d, vn = puck.vx * nx + puck.vy * ny;
            puck.x = px + nx * (PR + 3); puck.y = py + ny * (PR + 3);
            if (vn < 0) { puck.vx -= 1.8 * vn * nx; puck.vy -= 1.8 * vn * ny; bump = true; }
          }
        });
        if (bump && Math.hypot(puck.vx, puck.vy) > 60) api.sfx('tick');
        if (puck.y < -PR) goal('p1');
        else if (puck.y > H + PR) goal('p2');
      }
      // a mallet must never push the puck through a wall: if they still overlap, the mallet gives way
      function unpin(id) {
        const m = mallets[id], dx = m.x - puck.x, dy = m.y - puck.y, d = Math.hypot(dx, dy);
        if (d < MR + PR && d > 0) {
          const nx = dx / d, ny = dy / d, vn = m.vx * nx + m.vy * ny;
          m.x = puck.x + nx * (MR + PR); m.y = puck.y + ny * (MR + PR);
          if (vn < 0) { m.vx -= vn * nx; m.vy -= vn * ny; }
        }
      }

      // A puck almost still against a wall gets a small push towards the middle (after 1 s); if nothing has moved it for 3 s
      // (a mallet parked on it, both players waiting), the puck is faced off again on the side it was stuck on.
      let still = 0, wallStill = 0, cornerStill = 0;
      function unstall(dt) {
        const sp = Math.hypot(puck.vx, puck.vy);
        const byWall = puck.x < PR + 6 || puck.x > W - PR - 6 || (!inMouth(puck.x) && (puck.y < PR + 6 || puck.y > H - PR - 6));
        const held = ['p1', 'p2'].some(id => Math.hypot(puck.x - mallets[id].x, puck.y - mallets[id].y) < MR + PR + 6);
        // only a stuck puck counts (by a wall or under a mallet); a still puck in the open is simply waiting to be hit
        still = sp < 25 && (byWall || held) ? still + dt : 0;
        wallStill = byWall && sp < 25 ? wallStill + dt : 0;
        if (wallStill > 1) {
          wallStill = 0;
          const dx = W / 2 - puck.x, dy = H / 2 - puck.y, d = Math.hypot(dx, dy) || 1;
          puck.vx += dx / d * 70; puck.vy += dy / d * 70;
        }
        // A slow puck in a corner (two walls) cannot be hit out cleanly by anyone, so it is eased out towards the middle after 0.5 s.
        const nearX = puck.x < PR + 40 || puck.x > W - PR - 40, nearY = (puck.y < PR + 40 || puck.y > H - PR - 40) && !inMouth(puck.x);
        cornerStill = nearX && nearY && sp < 60 ? cornerStill + dt : 0;
        if (cornerStill > 0.5) {
          cornerStill = 0;
          const dx = W / 2 - puck.x, dy = H / 2 - puck.y, d = Math.hypot(dx, dy) || 1;
          puck.vx = dx / d * 170; puck.vy = dy / d * 170;
        }
        if (still > 3) { still = 0; faceoff(puck.y < H / 2 ? 'p2' : 'p1'); }
      }
      if (window.ludusDebug) window.ludusDebug.hockeySet = (x, y, vx, vy) => { puck.x = x; puck.y = y; puck.vx = vx || 0; puck.vy = vy || 0; phase = 'play'; still = wallStill = cornerStill = 0; ai.slow = ai.back = ai.timer = 0; };
      if (window.ludusDebug) window.ludusDebug.hockeyBot = (x, y) => { Object.assign(mallets.p2, { x, y, vx: 0, vy: 0 }); };
      function goal(who) {
        score[who]++; lastGoal = { who, x: Math.max(W / 2 - GOAL / 2, Math.min(W / 2 + GOAL / 2, puck.x)), y: who === 'p1' ? 0 : H, t: clock };
        api.score(Math.max(score.p1, score.p2));
        burst(lastGoal.x, lastGoal.y, 26, who === 'p1' ? api.colors().accent : D.P2);
        puck.vx = 0; puck.vy = 0; puck.y = who === 'p1' ? 0 : H; puck.x = lastGoal.x; trail = [];
        if (score[who] >= TARGET) { phase = 'over'; phaseT = 0.7; api.sfx('line'); }
        else { phase = 'goal'; phaseT = 1.3; api.sfx('score'); }
      }

      function burst(x, y, n, color) {
        if (api.reduceMotion) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 160;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9, color });
        }
      }

      function update(dt) {
        clock += dt;
        const h = dt / SUB;
        for (let i = 0; i < SUB; i++) {
          moveMallet('p1', h); moveMallet('p2', h);
          if (phase === 'play') {
            const f = Math.exp(-0.32 * h);
            puck.vx *= f; puck.vy *= f;
            puck.x += puck.vx * h; puck.y += puck.vy * h;
            collide('p1'); collide('p2');
            const sp = Math.hypot(puck.vx, puck.vy); if (sp > MAX_P) { puck.vx *= MAX_P / sp; puck.vy *= MAX_P / sp; }
            walls();
            if (phase === 'play') { unpin('p1'); unpin('p2'); }
          } else { unpin('p1'); unpin('p2'); }
        }
        if (phase === 'play') { trail.unshift({ x: puck.x, y: puck.y }); if (trail.length > 7) trail.pop(); }
        if (phase === 'play') unstall(dt);
        if (phase === 'ready') { phaseT -= dt; if (phaseT <= 0) phase = 'play'; }
        else if (phase === 'goal') { phaseT -= dt; if (phaseT <= 0) faceoff(lastGoal.who === 'p1' ? 'p2' : 'p1'); }
        else if (phase === 'over') {
          phaseT -= dt;
          if (phaseT <= 0 && !overCalled) {
            overCalled = true;
            const win = score.p1 > score.p2 ? 'p1' : 'p2';
            if (on) { on.send('end', { p1: score.p1, p2: score.p2 }); finishOnline(); return; }
            api.over({ score: score[win], won: api.friend || win === 'p1', title: api.friend ? (win === 'p1' ? 'P1' : 'P2') + ' wins' : win === 'p1' ? 'You win' : 'Bot wins', message: `${Math.max(score.p1, score.p2)} to ${Math.min(score.p1, score.p2)}` });
          }
        }
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }

      function drawMallet(m, color, col) {
        ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.15)'; ctx.beginPath(); ctx.arc(m.x + 2, m.y + 3, MR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m.x, m.y, MR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.arc(m.x, m.y + 1.5, MR * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m.x, m.y, MR * 0.58, 0, Math.PI * 2); ctx.fill();
        D.spark(ctx, m.x, m.y, MR * 0.38, '#fffaf3', 0);
      }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const side = flat();
        const hl = on ? { who: 'p1', label: nameOf('p1'), score: score.p1 } : api.friend ? { who: 'p1', label: side ? 'P1 left' : 'P1 bottom', score: score.p1 } : { who: 'you', label: 'You', score: score.p1 };
        const hr = on ? { who: 'p2', label: nameOf('p2'), score: score.p2 } : api.friend ? { who: 'p2', label: side ? 'P2 right' : 'P2 top', score: score.p2 } : { who: 'bot', label: 'Bot', score: score.p2 };
        // the guest's own name on the left, on the same side as their goal
        D.duelHeader(ctx, 10, 8, w - 20, { left: flip() ? hr : hl, right: flip() ? hl : hr, turn: null, status: phase === 'goal' ? 'Goal' : '' }, col);
        // RW x RH = the rink as it appears on screen
        const RW = side ? H : W, RH = side ? W : H;
        const top = 56, avail = h - top - 8, s = Math.min((w - 16) / (RW + 16), avail / (RH + 16));
        const ox = (w - RW * s) / 2, oy = top + 8 * s + Math.max(0, (avail - (RH + 16) * s) / 2) * 0.3;
        lay = { ox, oy, s, side, flip: flip() };
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        ctx.fillStyle = col.dark ? '#3a332b' : '#e4d6c2'; D.roundRect(ctx, -8, -8, RW + 16, RH + 16, 26); ctx.fill();
        ctx.save();
        // side-on: rink (x, y) is drawn at screen (H - y, x), a quarter turn
        if (side) ctx.transform(0, 1, -1, 0, H, 0);
        if (lay.flip) ctx.transform(-1, 0, 0, -1, W, H);   // the guest's view: turned round, own goal on their side
        // ice
        ctx.fillStyle = col.dark ? '#23211f' : '#fbf8f3'; D.roundRect(ctx, 0, 0, W, H, 20); ctx.fill();
        ctx.save(); D.roundRect(ctx, 0, 0, W, H, 20); ctx.clip();
        ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
        for (let y = 16; y < H; y += 22) for (let x = 16 + ((y / 22) % 2) * 11; x < W; x += 22) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = col.dark ? 'rgba(217,119,87,0.35)' : 'rgba(217,119,87,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 38, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = col.dark ? 'rgba(91,141,239,0.4)' : 'rgba(91,141,239,0.45)';
        ctx.beginPath(); ctx.arc(W / 2, 0, GOAL / 2 + 8, 0, Math.PI); ctx.stroke();
        ctx.strokeStyle = col.dark ? 'rgba(217,119,87,0.45)' : 'rgba(217,119,87,0.5)';
        ctx.beginPath(); ctx.arc(W / 2, H, GOAL / 2 + 8, Math.PI, Math.PI * 2); ctx.stroke();
        D.spark(ctx, W / 2, H / 2, 7, col.line, 0);
        ctx.restore();
        // goal mouths
        const glow = lastGoal && phase === 'over' ? 0.75 + 0.25 * Math.sin(clock * 8) : lastGoal && clock - lastGoal.t < 1 ? 1 - (clock - lastGoal.t) : 0;
        [[0, 'p2', D.P2], [H, 'p1', col.accent]].forEach(([gy, owner, color]) => {
          ctx.fillStyle = col.dark ? '#141210' : '#3b2f26';
          D.roundRect(ctx, W / 2 - GOAL / 2, gy - 6, GOAL, 12, 6); ctx.fill();
          if (glow && lastGoal.who !== owner) { ctx.globalAlpha = glow; ctx.fillStyle = col.bad || '#d9534f'; D.roundRect(ctx, W / 2 - GOAL / 2, gy - 6, GOAL, 12, 6); ctx.fill(); ctx.globalAlpha = 1; }
          ctx.fillStyle = color; [W / 2 - GOAL / 2, W / 2 + GOAL / 2].forEach(px => { ctx.beginPath(); ctx.arc(px, gy, 4.5, 0, Math.PI * 2); ctx.fill(); });
        });
        // puck
        if (!api.reduceMotion) trail.forEach((q, i) => { ctx.globalAlpha = 0.12 * (1 - i / trail.length); ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(q.x, q.y, PR, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        {
          ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.4)' : 'rgba(60,40,20,0.18)'; ctx.beginPath(); ctx.arc(puck.x + 1.5, puck.y + 2.5, PR, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col.dark ? '#e9e1d6' : '#2f2620'; ctx.beginPath(); ctx.arc(puck.x, puck.y, PR, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col.dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(puck.x, puck.y, PR * 0.62, 0, Math.PI * 2); ctx.stroke();
        }
        drawMallet(mallets.p2, D.P2, col);
        drawMallet(mallets.p1, col.accent, col);
        parts.forEach(q => { ctx.globalAlpha = Math.max(0, q.life / 0.9); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
        ctx.restore();
        // text stays upright: drawn in screen-rink space (RW x RH)
        if (phase === 'goal' || phase === 'over') {
          const who = lastGoal.who, label = on ? nameOf(who) : api.friend ? (who === 'p1' ? 'P1' : 'P2') : who === 'p1' ? 'You' : 'Bot';
          const big = phase === 'over' ? (on ? `${label} wins` : `${label} ${label === 'You' ? 'win' : 'wins'} the match`) : `${label} ${label === 'You' ? 'score' : 'scores'}`;
          const k = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, (clock - lastGoal.t) * 4)), bw = 220, by = RH / 2;
          ctx.save(); ctx.translate(RW / 2, by); ctx.scale(k, k);
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          D.roundRect(ctx, -bw / 2, -26, bw, 52, 16); ctx.fill(); ctx.shadowColor = 'transparent';
          D.fitText(ctx, big, 0, -6, bw - 24, 15, col.ink, 800, 11);
          D.text(ctx, `${score.p1} : ${score.p2}`, 0, 13, 11.5, col.ink2, 700);
          ctx.restore();
        } else if (phase === 'ready') {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 9); D.text(ctx, 'Ready', RW / 2, RH / 2 - 54, 13, col.ink2, 700); ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // ---------- save / restore ----------
      function save() {
        if (phase === 'over' || api.ended || (!restored && !api.touched)) return null;
        return { v: 1, W, H, score: { ...score }, m1: { ...mallets.p1 }, m2: { ...mallets.p2 }, puck: { ...puck }, phase, phaseT, lastGoal: lastGoal ? { who: lastGoal.who } : null };
      }
      function restore(s) {
        const num = v => typeof v === 'number' && isFinite(v);
        const pt = o => o && ['x', 'y', 'vx', 'vy'].every(k => num(o[k]));
        // A save from a rink of another length (e.g. an old portrait session) starts fresh.
        // A side-on save may come back on a slightly different wide stage: keep its rink length and scale it.
        const sh = s && s.H === undefined ? PH : s && s.H;
        if (!s || (s.W === undefined ? W : s.W) !== W || typeof sh !== 'number' || sh < PH || sh > MAX_H || (sh > PH) !== (H > PH)) return false;
        if (s.v !== 1 || !s.score || !num(s.score.p1) || !num(s.score.p2) || s.score.p1 >= TARGET || s.score.p2 >= TARGET) return false;
        if (!pt(s.m1) || !pt(s.m2) || !pt(s.puck) || !['ready', 'play', 'goal'].includes(s.phase) || !num(s.phaseT)) return false;
        if (s.phase === 'goal' && !(s.lastGoal && (s.lastGoal.who === 'p1' || s.lastGoal.who === 'p2'))) return false;
        H = sh;
        score = { p1: s.score.p1, p2: s.score.p2 };
        mallets = { p1: { ...s.m1 }, p2: { ...s.m2 } }; puck = { ...s.puck };
        phase = s.phase; phaseT = s.phaseT;
        lastGoal = s.lastGoal ? { who: s.lastGoal.who, x: W / 2, y: s.lastGoal.who === 'p1' ? 0 : H, t: -9 } : null;
        api.score(Math.max(score.p1, score.p2));
        return true;
      }

      // A restored match counts as in progress; a fresh one only once a player has pressed something.
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) reset();
      // The panel may still be turning landscape when the game starts: re-fit an untouched match.
      function onResize(w, h) {
        const nh = lengthFor(...dims());
        if (on || nh === H || restored || api.touched || score.p1 || score.p2 || phase !== 'ready') return;
        H = nh; reset();
      }
      if (window.ludusDebug) window.ludusDebug.hockey = () => ({ W, H, flat: flat(), flip: flip(), lay, phase, score: { ...score }, puck: { ...puck }, m1: { ...mallets.p1 }, m2: { ...mallets.p2 } });
      // ---------- online: the host plays the match, the guest sends its mallet keys and draws the host's copy ----------
      let link = null, ended = false;
      function finishOnline() {
        if (ended) return; ended = true;
        const win = score.p1 > score.p2 ? 'p1' : 'p2', mineId = on.seat === 0 ? 'p1' : 'p2';
        api.over({ score: score[mineId], won: win === mineId, title: nameOf(win) + ' wins', message: `${Math.max(score.p1, score.p2)} to ${Math.min(score.p1, score.p2)}` });
      }
      const num = v => typeof v === 'number' && isFinite(v);
      if (on) {
        if (on.isHost) net = { up: false, down: false, left: false, right: false, aim: null };
        const R1 = v => Math.round(v * 10) / 10;
        link = Ludus.rt(api, {
          hz: 30,
          snapshot: () => ({ H, s: [score.p1, score.p2], m: [R1(mallets.p1.x), R1(mallets.p1.y), R1(mallets.p2.x), R1(mallets.p2.y)], p: [R1(puck.x), R1(puck.y)], v: [Math.round(puck.vx), Math.round(puck.vy)], ph: phase, g: lastGoal ? lastGoal.who : '' }),
          input: () => { const d = dirs(pads.p2), a = myAim(), o = { u: d.up ? 1 : 0, d: d.down ? 1 : 0, l: d.left ? 1 : 0, r: d.right ? 1 : 0 }; if (a) { o.x = Math.round(a.x); o.y = Math.round(a.y); } return o; },
          onInput: (seat, d) => {
            if (seat !== 1) return;
            net.up = d.u === 1; net.down = d.d === 1; net.left = d.l === 1; net.right = d.r === 1;
            net.aim = num(d.x) && num(d.y) && d.x >= 0 && d.x <= W && d.y >= 0 && d.y <= MAX_H ? { x: d.x, y: d.y } : null;
          },
          onState: d => {
            if (num(d.H) && d.H >= PH && d.H <= MAX_H) H = d.H;
            if (Array.isArray(d.s) && d.s.length === 2 && d.s.every(Number.isInteger)) {
              const who = d.s[0] > score.p1 ? 'p1' : d.s[1] > score.p2 ? 'p2' : null;
              score = { p1: d.s[0], p2: d.s[1] }; api.score(Math.max(score.p1, score.p2));
              if (who) { lastGoal = { who, x: W / 2, y: who === 'p1' ? 0 : H, t: clock }; api.sfx('score'); burst(puck.x, who === 'p1' ? 0 : H, 26, who === 'p1' ? api.colors().accent : D.P2); }
            }
            if ((d.g === 'p1' || d.g === 'p2') && !lastGoal) lastGoal = { who: d.g, x: W / 2, y: d.g === 'p1' ? 0 : H, t: clock };
            if (['ready', 'play', 'goal', 'over'].includes(d.ph)) phase = d.ph;
          }
        });
        if (guest) on.on('end', d => { if (d && Number.isInteger(d.p1) && Number.isInteger(d.p2)) { score = { p1: d.p1, p2: d.p2 }; phase = 'over'; if (!lastGoal) lastGoal = { who: d.p1 > d.p2 ? 'p1' : 'p2', x: W / 2, y: 0, t: clock }; finishOnline(); } });
      }
      // the guest moves its own mallet from its own keys at once; the host's copy only nudges it back into line
      const me = guest && link ? link.predictor({ pick: s => Array.isArray(s.m) && s.m.length === 4 ? [s.m[2], s.m[3]] : null, snap: 90, init: [mallets.p2.x, mallets.p2.y] }) : null;
      const mine = { x: 0, y: 0, vx: 0, vy: 0 }, mineV = { x: 0, y: 0 };
      /* The guest's puck. The host's copies are ~0.1 s old when drawn, which made the puck look late against the guest's own
         mallet (drawn "now"). A host that sends the puck's speed (v) lets the guest run the puck itself: it is carried forward
         to the host's present moment (walls and friction), bounces off the guest's own mallet straight away, and is eased
         back onto the host's copy (a big difference, a goal or a face-off snaps). Older hosts: the old in-between drawing. */
      const lp = { x: W / 2, y: H / 2, vx: 0, vy: 0, ok: false, hitAt: -9 };
      function puckStep(q, h) {
        const f = Math.exp(-0.32 * h);
        q.vx *= f; q.vy *= f; q.x += q.vx * h; q.y += q.vy * h;
        if (q.x < PR) { q.x = PR; q.vx = Math.abs(q.vx) * 0.9; }
        if (q.x > W - PR) { q.x = W - PR; q.vx = -Math.abs(q.vx) * 0.9; }
        if (!inMouth(q.x)) {
          if (q.y < PR) { q.y = PR; q.vy = Math.abs(q.vy) * 0.9; }
          if (q.y > H - PR) { q.y = H - PR; q.vy = -Math.abs(q.vy) * 0.9; }
        }
      }
      function hostPuckNow(st) {   // the host's puck carried forward to the host's present moment
        const q = { x: st.p[0], y: st.p[1], vx: st.v[0], vy: st.v[1] };
        let left = link.lead() / 1000;
        while (left > 0) { const h = Math.min(1 / 120, left); puckStep(q, h); left -= h; }
        return q;
      }
      function guestPuck(dt, st) {
        const target = hostPuckNow(st);
        if (!lp.ok || phase !== 'play') { Object.assign(lp, target); lp.ok = true; return; }
        let left = dt;
        while (left > 0) {
          const h = Math.min(1 / 240, left); left -= h; puckStep(lp, h);
          const m = mallets.p2, dx = lp.x - m.x, dy = lp.y - m.y, dd = Math.hypot(dx, dy);
          if (dd < MR + PR && dd > 0) {
            const v = strike(lp, { x: m.x, y: m.y, vx: mineV.x, vy: mineV.y }, 0.9);
            lp.vx = v.vx; lp.vy = v.vy; lp.x = m.x + dx / dd * (MR + PR); lp.y = m.y + dy / dd * (MR + PR);
            const sp = Math.hypot(lp.vx, lp.vy); if (sp > MAX_P) { lp.vx *= MAX_P / sp; lp.vy *= MAX_P / sp; }
            if (clock - lp.hitAt > 0.08) api.sfx('tap');
            lp.hitAt = clock;
          }
        }
        // just hit it here: the host has not seen that yet, so trust the local puck for one round trip
        const grace = Math.min(0.4, (link.rtt() || 120) / 1000 + 0.06);
        const ex = target.x - lp.x, ey = target.y - lp.y;
        if (Math.hypot(ex, ey) > 70) { Object.assign(lp, target); return; }
        if (clock - lp.hitAt < grace) return;
        const k = 1 - Math.exp(-dt * 9);
        lp.x += ex * k; lp.y += ey * k; lp.vx += (target.vx - lp.vx) * k; lp.vy += (target.vy - lp.vy) * k;
      }
      function guestFrame(dt) {
        clock += dt;
        {
          const live = phase === 'play' || phase === 'ready', d = dirs(pads.p2), a = live && !anyKey(d) ? myAim() : null;
          const px = me.v[0], py = me.v[1];
          me.frame(dt, v => {
            mine.x = v[0]; mine.y = v[1];
            stepMallet('p2', mine, live ? (d.right ? 1 : 0) - (d.left ? 1 : 0) : 0, live ? (d.down ? 1 : 0) - (d.up ? 1 : 0) : 0, dt, a);
            v[0] = mine.x; v[1] = mine.y;
          });
          mallets.p2.x = me.v[0]; mallets.p2.y = me.v[1];
          if (dt > 0) { mineV.x = (me.v[0] - px) / dt; mineV.y = (me.v[1] - py) / dt; }   // how fast it moves on screen (for local puck hits)
        }
        const sm = link.sample(), st = link.latest();
        if (sm && Array.isArray(sm.a.m) && Array.isArray(sm.b.m) && Array.isArray(sm.a.p) && Array.isArray(sm.b.p) && sm.a.m.concat(sm.b.m, sm.a.p, sm.b.p).every(num) && sm.b.m.length === 4) {
          const { a, b, t } = sm, M = Ludus.rt.mix;
          mallets.p1.x = M(a.m[0], b.m[0], t); mallets.p1.y = M(a.m[1], b.m[1], t);
          if (st && Array.isArray(st.v) && st.v.length === 2 && st.v.every(num) && Array.isArray(st.p) && st.p.every(num)) { guestPuck(dt, st); puck.x = lp.x; puck.y = lp.y; }
          else { puck.x = M(a.p[0], b.p[0], t, 80); puck.y = M(a.p[1], b.p[1], t, 80); }
        }
        if (phase === 'play') { trail.unshift({ x: puck.x, y: puck.y }); if (trail.length > 7) trail.pop(); } else trail = [];
        parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; q.life -= dt; });
        parts = parts.filter(q => q.life > 0);
      }
      api.loop(dt => { if (guest) guestFrame(dt); else update(dt); if (link) link.step(); render(); });
      return { save: on ? () => ({ score: { ...score }, phase, m: [mallets.p1.x, mallets.p1.y, mallets.p2.x, mallets.p2.y].map(Math.round), puck: [Math.round(puck.x), Math.round(puck.y)] }) : save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
