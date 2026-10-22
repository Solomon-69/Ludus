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
    const C1 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyF: 'act', ShiftLeft: 'act' };
    const K1 = { w: 'up', s: 'down', a: 'left', d: 'right', f: 'act' };
    const C2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Slash: 'act', ShiftRight: 'act', Enter: 'act', NumpadEnter: 'act' };
    const K2 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '/': 'act', Enter: 'act' };
    const blank = () => ({ up: false, down: false, left: false, right: false, act: false });
    const pads = { p1: blank(), p2: blank() };
    function find(e) {
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
    id: 'hockey', name: 'Air Puck', tag: '2 Player', wide: true, tint: '#e05d8b',
    hint: '<b>P1</b> (left) <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <b>P2</b> (right) <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move',
    _rules: { strike },
    art(ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.1, h / 2); ctx.lineTo(w * 0.9, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff8f2'; ctx.beginPath(); ctx.arc(w * 0.36, h * 0.76, h * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b8def'; ctx.beginPath(); ctx.arc(w * 0.64, h * 0.24, h * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b2418'; ctx.beginPath(); ctx.arc(w * 0.52, h * 0.56, h * 0.07, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      const view = api.canvas(onResize);
      const { ctx } = view;
      const pads = makePads(api);
      // Rink length follows the stage: portrait keeps the classic 300 x 440 rink; landscape lays it on
      // its side and stretches it to fill the width (P1 goal left, P2 goal right).
      const lengthFor = (w, h) => w > h ? Math.max(PH, Math.min(MAX_H, Math.round((W + 16) * (w - 16) / Math.max(1, h - 64) - 16))) : PH;
      // Untransformed stage size (the panel's slide-in scale would skew getBoundingClientRect).
      const dims = () => [stage.clientWidth || view.w, stage.clientHeight || view.h];
      let H = lengthFor(...dims());
      const flat = () => view.w > view.h;
      // Keys in rink space. On the side-on rink, screen right is towards P2's goal (rink up),
      // screen up is rink left, so WASD and the arrows still move each mallet the way they point.
      const dirs = p => flat() ? { up: p.right, down: p.left, left: p.up, right: p.down } : p;
      const MAX_P = [520, 600, 690][api.level];
      let score, mallets, puck, phase, phaseT, clock = 0, parts = [], trail = [], lastGoal = null, overCalled = false, hitFx = { p1: -9, p2: -9 };

      function reset() { score = { p1: 0, p2: 0 }; api.score(0); faceoff(Math.random() < 0.5 ? 'p1' : 'p2'); }
      function faceoff(side) {
        mallets = { p1: { x: W / 2, y: H - 60, vx: 0, vy: 0 }, p2: { x: W / 2, y: 60, vx: 0, vy: 0 } };
        puck = { x: W / 2, y: side === 'p1' ? H * 0.68 : H * 0.32, vx: 0, vy: 0 };
        phase = 'ready'; phaseT = 0.9; trail = [];
      }

      function moveMallet(id, dt) {
        const m = mallets[id], p = dirs(pads[id]), live = phase === 'play' || phase === 'ready';
        let ax = live ? (p.right ? 1 : 0) - (p.left ? 1 : 0) : 0, ay = live ? (p.down ? 1 : 0) - (p.up ? 1 : 0) : 0;
        if (ax && ay) { ax *= Math.SQRT1_2; ay *= Math.SQRT1_2; }
        const damp = Math.exp(-9 * dt);
        if (ax) m.vx += ax * ACC * dt * (m.vx * ax < 0 ? 1.7 : 1); else m.vx *= damp;
        if (ay) m.vy += ay * ACC * dt * (m.vy * ay < 0 ? 1.7 : 1); else m.vy *= damp;
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
        if (phase === 'ready') { phaseT -= dt; if (phaseT <= 0) phase = 'play'; }
        else if (phase === 'goal') { phaseT -= dt; if (phaseT <= 0) faceoff(lastGoal.who === 'p1' ? 'p2' : 'p1'); }
        else if (phase === 'over') {
          phaseT -= dt;
          if (phaseT <= 0 && !overCalled) {
            overCalled = true;
            const win = score.p1 > score.p2 ? 'p1' : 'p2';
            api.over({ score: score[win], won: true, title: (win === 'p1' ? 'P1' : 'P2') + ' wins', message: `${Math.max(score.p1, score.p2)} to ${Math.min(score.p1, score.p2)}` });
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
        D.duelHeader(ctx, 10, 8, w - 20, {
          left: { who: 'p1', label: side ? 'P1 left' : 'P1 bottom', score: score.p1 }, right: { who: 'p2', label: side ? 'P2 right' : 'P2 top', score: score.p2 },
          turn: null, status: phase === 'goal' ? 'Goal' : ''
        }, col);
        // RW x RH = the rink as it appears on screen
        const RW = side ? H : W, RH = side ? W : H;
        const top = 56, avail = h - top - 8, s = Math.min((w - 16) / (RW + 16), avail / (RH + 16));
        const ox = (w - RW * s) / 2, oy = top + 8 * s + Math.max(0, (avail - (RH + 16) * s) / 2) * 0.3;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        ctx.fillStyle = col.dark ? '#3a332b' : '#e4d6c2'; D.roundRect(ctx, -8, -8, RW + 16, RH + 16, 26); ctx.fill();
        ctx.save();
        // side-on: rink (x, y) is drawn at screen (H - y, x), a quarter turn
        if (side) ctx.transform(0, 1, -1, 0, H, 0);
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
          const who = lastGoal.who, label = who === 'p1' ? 'P1' : 'P2';
          const big = phase === 'over' ? `${label} wins the match` : `${label} scores`;
          const k = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, (clock - lastGoal.t) * 4)), bw = 220, by = RH / 2;
          ctx.save(); ctx.translate(RW / 2, by); ctx.scale(k, k);
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          D.roundRect(ctx, -bw / 2, -26, bw, 52, 16); ctx.fill(); ctx.shadowColor = 'transparent';
          D.text(ctx, big, 0, -6, 15, col.ink, 800);
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
        if (nh === H || restored || api.touched || score.p1 || score.p2 || phase !== 'ready') return;
        H = nh; reset();
      }
      if (window.ludusDebug) window.ludusDebug.hockey = () => ({ W, H, flat: flat(), phase, score: { ...score }, puck: { ...puck }, m1: { ...mallets.p1 }, m2: { ...mallets.p2 } });
      api.loop(dt => { update(dt); render(); });
      return { save, pause() { pads.clear(); }, resume() { pads.clear(); } };
    }
  });
})();
