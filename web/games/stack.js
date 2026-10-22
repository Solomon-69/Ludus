/* Stack: a block slides back and forth, drop it on the tower. Overhang is cut off, a perfect drop keeps the full width.
   World is 300 units wide, scaled to the stage. y grows upward from the base. */
(function () {
  const D = Ludus.draw;
  const WW = 300, BH = 20, BASE_W = 170;
  const SPEED = [120, 160, 200], TOL = [6, 4, 3], GROW = 6;

  function overlap(ax, aw, bx, bw) {
    const l = Math.max(ax, bx), r = Math.min(ax + aw, bx + bw);
    return { x: l, w: r - l };
  }
  function hueOf(i) { return 22 + Math.sin(i / 4) * 20 + (Math.floor(i / 25) % 2) * 150; }
  function blockFill(i, dark, top) {
    const h = hueOf(i), s = dark ? 46 : 62, l = dark ? (top ? 52 : 40) : (top ? 76 : 64);
    return `hsl(${h} ${s}% ${l}%)`;
  }

  Ludus.register({
    id: 'stack', name: 'Stack', tag: 'Arcade', tint: '#3f8fb3',
    hint: '<kbd>Space</kbd> <kbd>↓</kbd> or click to drop · land it exactly for a perfect bonus',
    _rules: { overlap },
    art(ctx, w, h) {
      const bw = w * 0.42, bh = h * 0.1, cx = w / 2;
      for (let i = 0; i < 6; i++) {
        const y = h * 0.86 - i * bh * 1.05, ww = bw - Math.max(0, i - 2) * w * 0.03, off = i === 5 ? w * 0.12 : (i % 2 ? 2 : -2);
        ctx.fillStyle = `rgba(255,255,255,${0.45 + i * 0.09})`;
        D.roundRect(ctx, cx - ww / 2 + off, y - bh, ww, bh, bh * 0.3); ctx.fill();
      }
      D.spark(ctx, cx + w * 0.12, h * 0.86 - 6 * bh * 1.05 - bh * 0.2, h * 0.09, '#d97757', 0.3);
    },
    create(stage, api) {
      const lv = api.level;
      const view = api.canvas(() => {});
      const { ctx, canvas } = view;
      let lift = 0, ghost = null, blocks, cur, chips, score, combo, perfects, state, camY, camZoom, flashes, dropAt, missAt;

      function fresh() {
        blocks = [{ x: (WW - BASE_W) / 2, w: BASE_W }];
        score = 0; combo = 0; perfects = 0; state = 'play';
        spawn();
      }
      function speed() { return SPEED[lv] + Math.min(120, (blocks.length - 1) * 3); }
      function spawn() {
        const top = blocks[blocks.length - 1];
        const fromLeft = blocks.length % 2 === 0;
        cur = { x: fromLeft ? -top.w * 0.6 : WW - top.w * 0.4, w: top.w, dir: fromLeft ? 1 : -1 };
      }
      function restore(s) {
        if (!s || !Array.isArray(s.blocks) || !s.blocks.length || !s.cur) return false;
        if (!s.blocks.every(b => isFinite(b.x) && b.w > 0 && b.w <= BASE_W + 1)) return false;
        if (!isFinite(s.cur.x) || !(s.cur.w > 0)) return false;
        blocks = s.blocks.map(b => ({ x: +b.x, w: +b.w }));
        cur = { x: +s.cur.x, w: +s.cur.w, dir: s.cur.dir === -1 ? -1 : 1 };
        score = s.score | 0; combo = s.combo | 0; perfects = s.perfects | 0; state = 'play';
        return true;
      }
      chips = []; flashes = []; dropAt = -9; missAt = 0;
      if (!restore(api.saved)) fresh();
      api.score(score);
      camY = Math.max(0, blocks.length * BH - 200); camZoom = 1;

      function drop() {
        if (state !== 'play') return;
        const top = blocks[blocks.length - 1];
        const y = blocks.length * BH;
        dropAt = clock;
        if (Math.abs(cur.x - top.x) <= TOL[lv]) {
          combo++; perfects++;
          let w = top.w, x = top.x;
          if (combo >= 3 && w < BASE_W) { const g = Math.min(GROW, BASE_W - w); w += g; x -= g / 2; }
          blocks.push({ x, w });
          score += 1 + Math.min(5, combo);
          flashes.push({ x, w, y, t: clock, perfect: true });
          api.sfx(combo >= 3 ? 'line' : 'score');
          if (combo >= 2) api.toast(`Perfect x${combo}`);
        } else {
          const o = overlap(cur.x, cur.w, top.x, top.w);
          if (o.w <= 0) { miss(y); return; }
          combo = 0;
          const cutX = cur.x < top.x ? cur.x : o.x + o.w, cutW = cur.w - o.w;
          chips.push({ x: cutX, w: cutW, y, vy: 0, vx: (cur.x < top.x ? -1 : 1) * 30, rot: 0, vr: (cur.x < top.x ? -1 : 1) * 1.6, i: blocks.length });
          blocks.push({ x: o.x, w: o.w });
          score += 1;
          flashes.push({ x: o.x, w: o.w, y, t: clock, perfect: false });
          api.sfx('drop');
        }
        api.score(score);
        spawn();
      }
      function miss(y) {
        state = 'over'; missAt = clock; combo = 0;
        chips.push({ x: cur.x, w: cur.w, y, vy: 0, vx: cur.dir * 40, rot: 0, vr: cur.dir * 2, i: blocks.length });
        ghost = { x: cur.x, w: cur.w, y };
        cur = null;
        api.sfx('hit');
        const height = blocks.length - 1;
        api.timeout(() => api.over({ score, title: height ? `${height} high` : 'Missed', message: perfects ? `${perfects} perfect drop${perfects === 1 ? '' : 's'}` : 'Tap when it lines up' }), 450);
      }

      api.keys(e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); drop(); } });
      api.on(canvas, 'pointerdown', e => { if (e.button === 0) drop(); });

      let clock = 0;
      function update(dt) {
        if (state === 'play' && cur) {
          cur.x += cur.dir * speed() * dt;
          const lo = -cur.w * 0.7, hi = WW - cur.w * 0.3;
          if (cur.x > hi) { cur.x = hi - (cur.x - hi); cur.dir = -1; }
          if (cur.x < lo) { cur.x = lo + (lo - cur.x); cur.dir = 1; }
        }
        chips.forEach(c => { c.vy -= 900 * dt; c.y += c.vy * dt; c.x += c.vx * dt; c.rot += c.vr * dt; });
        chips = chips.filter(c => c.y > camY - 400);
        flashes = flashes.filter(f => clock - f.t < 0.6);
        // camera: keep the top of the tower in the upper third; after a miss, ease out to show the whole tower
        const towerTop = blocks.length * BH;
        const visH = view.h / scale();
        let tY = Math.max(0, towerTop - visH * 0.58), tZ = 1, tL = 0;
        if (state === 'over') {
          // lift the base above the result bar and zoom out until the whole tower fits
          tL = 64; tY = 0;
          tZ = Math.min(1, (visH - (64 + 80) / scale()) / (towerTop + 20));
        }
        lift += (tL - lift) * (api.reduceMotion ? 1 : Math.min(1, dt * 2.5));
        const k = api.reduceMotion ? 1 : Math.min(1, dt * (state === 'over' ? 2.5 : 6));
        camY += (tY - camY) * k; camZoom += (tZ - camZoom) * k;
      }
      function scale() { return Math.min(view.w / WW, view.h / 380); }

      function render() {
        const col = api.colors();
        const { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        // soft sky gradient on paper
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, col.dark ? '#25211c' : '#f7f1e7');
        g.addColorStop(1, col.dark ? '#1b1814' : '#ece2d2');
        ctx.fillStyle = g; D.roundRect(ctx, 0, 0, w, h, 14); ctx.fill();

        const s = scale() * camZoom;
        const ox = (w - WW * s) / 2;
        const groundY = h - 34 - lift;
        const sx = x => ox + x * s;
        const Y = y => groundY - (y * s) + camY * s;

        // ground plinth
        ctx.fillStyle = col.dark ? '#2f2a24' : '#e2d6c3';
        D.roundRect(ctx, sx(WW / 2 - BASE_W / 2 - 18), Y(0) - 2, (BASE_W + 36) * s, 40, 10); ctx.fill();

        const drawBlock = (x, y, bw, i, alpha) => {
          const px = sx(x), py = Y(y + BH), pw = bw * s, ph = BH * s;
          if (py > h + 20 || py + ph < -20) return;
          ctx.globalAlpha = alpha == null ? 1 : alpha;
          ctx.fillStyle = blockFill(i, col.dark, false);
          D.roundRect(ctx, px, py, pw, ph, Math.min(6, ph * 0.3)); ctx.fill();
          ctx.fillStyle = blockFill(i, col.dark, true);
          D.roundRect(ctx, px + 1, py + 1, pw - 2, ph * 0.42, Math.min(5, ph * 0.25)); ctx.fill();
          ctx.globalAlpha = 1;
        };
        blocks.forEach((b, i) => drawBlock(b.x, i * BH, b.w, i));
        flashes.forEach(f => {
          const k = (clock - f.t) / 0.6;
          ctx.strokeStyle = f.perfect ? col.accent : (col.dark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.9)');
          ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
          const grow = f.perfect ? k * 10 : k * 4;
          D.roundRect(ctx, sx(f.x) - grow, Y(f.y + BH) - grow, f.w * s + grow * 2, BH * s + grow * 2, 7); ctx.stroke();
          ctx.globalAlpha = 1;
        });
        if (ghost) {
          ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = col.bad; ctx.lineWidth = 2;
          D.roundRect(ctx, sx(ghost.x), Y(ghost.y + BH), ghost.w * s, BH * s, 6); ctx.stroke(); ctx.restore();
        }
        if (cur) drawBlock(cur.x, blocks.length * BH, cur.w, blocks.length);
        chips.forEach(c => {
          ctx.save();
          ctx.translate(sx(c.x + c.w / 2), Y(c.y + BH / 2)); ctx.rotate(c.rot);
          ctx.fillStyle = blockFill(c.i, col.dark, false);
          D.roundRect(ctx, -c.w * s / 2, -BH * s / 2, c.w * s, BH * s, 5); ctx.fill();
          ctx.restore();
        });
        // little spark riding the top block
        const top = blocks[blocks.length - 1];
        const bob = api.reduceMotion ? 0 : Math.max(0, 1 - (clock - dropAt) / 0.3) * 6;
        D.spark(ctx, sx(top.x + top.w / 2), Y(blocks.length * BH) - 9 - bob, 7, col.accent, clock * (api.reduceMotion ? 0 : 0.8));
        if (state === 'over') {
          const k = Math.min(1, (clock - missAt) / 0.4);
          ctx.globalAlpha = k;
          const n = blocks.length - 1;
          D.text(ctx, `${n} block${n === 1 ? '' : 's'} high`, w / 2, 30, 16, col.ink, 750);
          ctx.globalAlpha = 1;
        } else {
          D.text(ctx, String(blocks.length - 1), w / 2, 30, 26, col.ink, 780);
          if (combo >= 2) D.text(ctx, `Perfect x${combo}`, w / 2, 54, 12, col.accent, 700);
        }
        if (blocks.length === 1 && state === 'play') D.text(ctx, 'Press Space or click to drop', w / 2, groundY + 18, 11.5, col.ink3, 650);
      }

      api.loop(dt => { clock += dt; update(dt); render(); });
      Ludus.games.find(g => g.id === 'stack')._peek = () => ({ blocks, cur, score, combo, state });
      return {
        save() {
          if (state !== 'play' || blocks.length < 2) return null;
          return { blocks: blocks.map(b => ({ x: b.x, w: b.w })), cur: { x: cur.x, w: cur.w, dir: cur.dir }, score, combo, perfects };
        }
      };
    }
  });
})();
