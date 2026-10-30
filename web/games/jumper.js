/* Spark Hop: the spark bounces by itself. Steer it from platform to platform and climb as high as you can. Moving and crumbly platforms show up the higher you go.
   Two modes, picked at the start of a climb (the Classic / Monsters choice on the board until the first platform): Classic, and Monsters: little monsters float
   between the platforms (land on top to bop them, touch one any other way and you fall) and puffy clouds that hold you once. */
(function () {
  const D = Ludus.draw;
  const WW = 360;                         // world width; height follows the stage shape
  const PW = 62, PH = 12, R = 11;         // platform size, spark radius
  const GRAV = 1500, BOUNCE = -720, SPRING = -1120, MAXVX = 300, ACC = 1500;
  const DIFF = [
    { gap: [52, 96], dx: 120, grow: 0.018, move: 0.12, brk: 0.12, spring: 0.08 },
    { gap: [60, 112], dx: 150, grow: 0.024, move: 0.2, brk: 0.2, spring: 0.06 },
    { gap: [70, 126], dx: 180, grow: 0.03, move: 0.3, brk: 0.28, spring: 0.05 }
  ];
  const MAX_GAP = 150;                    // a bounce reaches about 172 units, so this is always jumpable

  Ludus.register({
    id: 'sparkhop', name: 'Sky Hop', aka: 'Spark Hop', tag: 'Arcade', tint: '#e08a3c',
    waitForMove: 'tap',   // stands still until a key press or a press on the board: moving the mouse over it must not start it (after Restart it did)
    hint: '<kbd>←</kbd><kbd>→</kbd> steer, or press and hold either side of the board',
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
      let mode = Ludus.state.hopMode === 'monsters' ? 'monsters' : 'classic';
      let swPos = mode === 'monsters' ? 1 : 0, swLast = performance.now();   // slide position of the mode picker thumb (0 Classic, 1 Monsters)
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
        plats.push({ x, y, type, vx: type === 'move' ? sp : 0, broken: -1, born: clock });
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
          if (mode === 'monsters' && climb > 3 && Math.random() < [0.16, 0.2, 0.24][api.level] * (0.6 + Math.min(1, climb / 50))) {
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
        plats = []; mons = []; camY = -WH + 40;          // world y grows downward; the start floor sits at y = 0
        p = { x: WW / 2, y: -PH - R, vx: 0, vy: BOUNCE };
        plats.push({ x: WW / 2, y: 0, type: 'still', vx: 0, broken: -1, born: 0, wide: true });
        lastChainY = 0; lastX = WW / 2; generate(); api.score(0);
      }

      function land(q) {
        if (!q.wide) onFloor = false;       // first platform above the start floor: the mode choice goes away
        if (q.type === 'break') {
          if (q.broken < 0) { q.broken = clock; api.sfx('drop'); }
          return false;                     // crumbly platforms never bounce you
        }
        if (q.type === 'cloud') { p.vy = BOUNCE; p.y = q.y - R; squash = 1; q.broken = clock; api.sfx('jump'); return true; }   // holds you once, then puffs away
        p.vy = q.type === 'spring' ? SPRING : BOUNCE;
        p.y = q.y - R; squash = 1;
        if (q.type === 'spring') { q.sprung = clock; api.sfx('power'); spin += 6; } else api.sfx('jump');
        return true;
      }

      function update(dt) {
        clock += dt;
        const nh = worldH(); if (nh !== WH) WH = nh;
        squash = Math.max(0, squash - dt * 5);
        pops = pops.filter(o => clock - o.t < 0.8);
        plats.forEach(q => {
          if (q.type === 'move' && state === 'play') { q.x += q.vx * dt; if (q.x < PW / 2 + 4 || q.x > WW - PW / 2 - 4) { q.vx = -q.vx; q.x = Math.max(PW / 2 + 4, Math.min(WW - PW / 2 - 4, q.x)); } }
          if (q.broken >= 0) q.y += (clock - q.broken) * 500 * dt;
        });
        if (state !== 'play') { if (p.y < camY + WH + 200) { p.vy += GRAV * dt; p.y += p.vy * dt; } spin += dt * 4; return; }
        const dir = ((held.r || held.pr) ? 1 : 0) - ((held.l || held.pl) ? 1 : 0);
        if (dir) p.vx += dir * ACC * dt; else p.vx *= Math.pow(0.02, dt);
        p.vx = Math.max(-MAXVX, Math.min(MAXVX, p.vx));
        p.x += p.vx * dt;
        if (p.x < -R) p.x += WW + 2 * R; if (p.x > WW + R) p.x -= WW + 2 * R;   // wrap side to side
        const prevY = p.y;
        p.vy += GRAV * dt; p.y += p.vy * dt;
        spin += dt * (1.5 + Math.abs(p.vx) / 120);
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
        height = Math.max(height, Math.round(-p.y / 10));
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
            if (p.vy > 0 && dy < -MR * 0.35) { m.dead = clock; p.vy = BOUNCE * 1.05; squash = 1; spin += 4; api.sfx('score'); pops.push({ t: clock, text: 'Bop!' }); }
            else { state = 'over'; deadAt = clock; p.vy = 120; api.sfx('lose');
              api.timeout(() => api.over({ score: height, title: 'Caught by a monster', won: false, message: `Climbed ${height} m` }), 900); return; }
          }
        }
        generate();
        if (p.y - R > camY + WH + 20) {
          state = 'over'; deadAt = clock; api.sfx('lose');
          api.timeout(() => api.over({ score: height, title: height >= 500 ? 'What a climb' : 'Down you go', won: false, message: `Climbed ${height} m` }), 900);
        }
      }

      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = true;
        else if ((k === 'm' || k === 'M') && switchOn()) setMode(mode === 'classic' ? 'monsters' : 'classic');
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = false;
      });
      // the Classic / Monsters choice: only in the start state (waiting for the first move, or still on the start floor).
      // Not during the climb and not on the game-over screen; the last choice is remembered (Ludus.state.hopMode).
      const switchOn = () => state === 'play' && onFloor;
      const switchBox = () => ({ x: WW / 2 - 110, y: 44, w: 220, h: 36 });
      const inSwitch = e => { const r = canvas.getBoundingClientRect(), k = WW / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, b = switchBox();
        return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? x : null; };
      function setMode(m) {
        if (m === mode) return;
        mode = m; Ludus.state.hopMode = m; Ludus.save(); api.sfx('click'); reset();
      }
      // a press on the choice picks a mode and is not a move: it neither starts the climb nor steers (capture runs before the game's own listeners)
      const onPick = e => {
        if (!switchOn()) return;
        const x = inSwitch(e); if (x === null) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (e.type === 'pointerdown') { const b = switchBox(); setMode(x < b.x + b.w / 2 ? 'classic' : 'monsters'); }
      };
      canvas.addEventListener('pointerdown', onPick, true); canvas.addEventListener('pointermove', onPick, true);
      const pointerSide = e => { const r = canvas.getBoundingClientRect(); const left = e.clientX - r.left < r.width / 2; held.pl = left; held.pr = !left; };
      api.on(canvas, 'pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ } pointerSide(e); });
      api.on(canvas, 'pointermove', e => { if (held.pl || held.pr) pointerSide(e); });
      const release = () => { held.pl = held.pr = false; };
      api.on(canvas, 'pointerup', release); api.on(canvas, 'pointercancel', release);
      api.on(window, 'blur', () => { held.l = held.r = false; release(); });

      function render() {
        const col = api.colors(), s = view.w / WW;
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.save(); ctx.scale(s, s);
        ctx.translate(0, -camY);
        // height marks every 100 m
        const first = Math.floor(-(camY + WH) / 1000) * 1000;
        for (let m = first; m <= -camY + 1000; m += 1000) {
          const y = -m; if (y < camY - 10 || y > camY + WH + 10 || m <= 0) continue;
          ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(WW - 8, y); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, `${m / 10} m`, WW - 10, y - 9, 10.5, col.ink3, 650, 'right');
        }
        // soft clouds with slow parallax
        ctx.fillStyle = col.dark ? 'rgba(255,245,230,0.03)' : 'rgba(150,110,60,0.06)';
        for (let i = 0; i < 6; i++) {
          const cy = ((i * 211 - camY * 0.6) % (WH + 120)) + camY - 60, cx = (i * 137) % WW;
          ctx.beginPath(); ctx.ellipse(cx, cy, 34, 12, 0, 0, Math.PI * 2); ctx.ellipse(cx + 20, cy - 6, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
        }
        // platforms
        plats.forEach(q => {
          if (q.y < camY - 20 || q.y > camY + WH + 20) return;
          const w = q.wide ? WW - 40 : PW;
          const born = 1;   // platforms do not grow in when a run starts
          ctx.save(); ctx.translate(q.x, q.y + PH / 2);
          if (q.broken >= 0) { ctx.rotate((clock - q.broken) * 0.8); ctx.globalAlpha = Math.max(0, 1 - (clock - q.broken) * 1.6); }
          ctx.scale(born, 1);
          let fill = col.dark ? '#7fa889' : '#6fae7f', top = 'rgba(255,255,255,0.3)';
          if (q.type === 'move') fill = col.dark ? '#6f93b5' : '#5b8fc4';
          if (q.type === 'break') fill = col.dark ? '#a08766' : '#c9a77a';
          if (q.wide) fill = col.dark ? '#5c5247' : '#d8cab5';
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
        // the spark
        const sq = api.reduceMotion ? 0 : squash * 0.22;
        const py = state === 'over' ? Math.min(p.y, camY + WH - R - 6) : p.y;
        ctx.save(); ctx.translate(p.x, py + R * sq); ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = col.dark ? 'rgba(217,119,87,0.22)' : 'rgba(217,119,87,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, R + 5, 0, Math.PI * 2); ctx.fill();
        D.spark(ctx, 0, 0, R + 2, state === 'over' ? col.ink3 : col.accent, spin);
        ctx.restore();
        ctx.restore();
        // HUD (screen space)
        ctx.save(); ctx.scale(s, s);
        D.text(ctx, `${height} m`, 14, 18, 16, col.ink, 760, 'left');
        pops.forEach(o => { const k = (clock - o.t) / 0.8; ctx.globalAlpha = 1 - k; D.text(ctx, o.text, WW / 2, 60 - k * 20, 18, col.accent, 760); });
        ctx.globalAlpha = 1;
        if (state === 'over') {
          ctx.fillStyle = col.dark ? 'rgba(42,38,33,0.9)' : 'rgba(255,252,247,0.92)';
          D.roundRect(ctx, WW / 2 - 70, 40, 140, 30, 15); ctx.fill();
          D.text(ctx, `Fell from ${height} m`, WW / 2, 55, 13, col.ink, 700);
        }
        if (switchOn()) {
          // same look as the app's other switches: soft track on a raised slab, a raised thumb that slides
          const b = switchBox(), half = b.w / 2, flat = document.documentElement.classList.contains('flat');
          // real clock, not game time: the game clock stands still while waiting for the first move
          const nowMs = performance.now(), swDt = Math.min(0.05, (nowMs - swLast) / 1000); swLast = nowMs;
          swPos += ((mode === 'monsters' ? 1 : 0) - swPos) * (1 - Math.exp(-16 * swDt));
          const on = api.reduceMotion ? (mode === 'monsters' ? 1 : 0) : swPos, tr = b.h / 2;
          if (!flat) { ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.38)' : 'rgba(32,28,23,0.14)'; D.roundRect(ctx, b.x, b.y + 3, b.w, b.h, tr); ctx.fill(); }
          ctx.fillStyle = col.surface2; D.roundRect(ctx, b.x, b.y, b.w, b.h, tr); ctx.fill();
          const tx = b.x + 4 + on * (half - 4), tw = half - 4, th = b.h - 8, ty = b.y + 4;
          if (!flat) { ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.45)' : 'rgba(32,28,23,0.2)'; D.roundRect(ctx, tx, ty + 2, tw, th, th / 2); ctx.fill(); }
          ctx.fillStyle = col.surface; D.roundRect(ctx, tx, ty, tw, th, th / 2); ctx.fill();
          D.text(ctx, 'Classic', b.x + half / 2, b.y + b.h / 2 + 0.5, 13, on > 0.5 ? col.ink2 : col.ink, 700);
          D.text(ctx, 'Monsters', b.x + half * 1.5, b.y + b.h / 2 + 0.5, 13, on > 0.5 ? col.ink : col.ink2, 700);
        }
        ctx.restore();
      }

      // ---------- save ----------
      const r1 = v => Math.round(v * 10) / 10;
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.plats) || !Array.isArray(sv.p) || sv.p.length !== 4) return false;
        if (!sv.plats.every(q => Array.isArray(q) && q.length >= 4 && ['still', 'move', 'break', 'spring', 'cloud'].includes(q[2]))) return false;
        if (sv.mode === 'monsters' || sv.mode === 'classic') mode = sv.mode;
        reset();
        if (sv.wh >= 360 && sv.wh <= 2000) WH = sv.wh;
        camY = +sv.camY; height = sv.height | 0; best = height; onFloor = height <= 3; lastChainY = +sv.lastChainY; lastX = sv.lastX >= 0 && sv.lastX <= WW ? +sv.lastX : WW / 2;
        p = { x: +sv.p[0], y: +sv.p[1], vx: +sv.p[2], vy: +sv.p[3] };
        plats = sv.plats.map(q => ({ x: q[0], y: q[1], type: q[2], vx: q[3], broken: -1, born: -9, wide: !!q[4] }));
        if (Array.isArray(sv.mons)) mons = sv.mons.filter(m => Array.isArray(m) && m.length === 4 && m.every(isFinite)).map(m => ({ x: m[0], ox: m[0], y: m[1], ph: m[2], kind: m[3] % 3, dead: -1 }));
        if (!isFinite(camY) || !isFinite(p.y)) return false;
        return true;
      }
      if (!(api.saved && restore(api.saved))) reset();
      this._peek = () => ({ p, plats, camY, WH, state, mode, mons });   // read-only view for automated play tests
      api.score(height);
      api.loop(dt => { update(dt); render(); });
      return {
        save() {
          if (state !== 'play') return null;
          return {
            v: 1, mode, mons: mons.filter(m => m.dead < 0).map(m => [r1(m.ox), r1(m.y), r1(m.ph), m.kind]), wh: WH, camY: r1(camY), height, lastChainY: r1(lastChainY), lastX: r1(lastX), p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy)],
            plats: plats.filter(q => q.broken < 0).map(q => [r1(q.x), r1(q.y), q.type, r1(q.vx), q.wide ? 1 : 0])
          };
        }
      };
    }
  });
})();
