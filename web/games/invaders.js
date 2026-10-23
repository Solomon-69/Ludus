/* Sky Raiders: a faithful take on the 1978 arcade classic. 55 raiders in 5 rows march side to side,
   drop a row at each edge and speed up as they fall. One cannon shot at a time, four erodible bunkers,
   three kinds of raider bombs and a mystery ship that pays out by the shot-count trick. */
(function () {
  const D = Ludus.draw;
  const W = 224, H = 256;                          // the original screen, in arcade pixels
  const COLS = 11, ROWS = 5, TOTAL = COLS * ROWS, CELL = 16;
  const UFO_Y = 40, TOP_LIMIT = 30, PY = 216, GROUND = 239;
  const SH_Y = 192, SH_W = 22, SH_H = 16, SH_X = [32, 77, 122, 167];
  const START_X = 24, START_Y = 64;
  const WAVE_DROP = [0, 24, 40, 48, 48, 48, 56, 56, 56];        // each new wave starts lower
  const UFO_TABLE = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100];
  const PLUNGER_COLS = [0, 6, 0, 0, 0, 3, 10, 0, 5, 2, 0, 0, 10, 8, 1, 7];
  const SQUIGGLY_COLS = [10, 0, 5, 2, 0, 0, 10, 8, 1, 7, 1, 10, 3, 6, 9];
  const NOTES = [98, 87, 78, 73];                  // the descending four-note march
  const LEVEL = [                                  // api.level 0/1/2: march tempo and raider fire
    { step: 1.0, reload: 1.6, maxBombs: 2, bombSpeed: 70, aim: 0.3, ufoEvery: 30 },
    { step: 0.8, reload: 1.0, maxBombs: 3, bombSpeed: 80, aim: 0.45, ufoEvery: 25.6 },
    { step: 0.6, reload: 0.65, maxBombs: 3, bombSpeed: 95, aim: 0.6, ufoEvery: 22 }
  ];

  // ---------- pixel sprites (# = lit) ----------
  const SPR = {
    squid: [
      ['.#....#.', '..#..#..', '.######.', '##.##.##', '########', '#.####.#', '#.#..#.#', '..#..#..'],
      ['.#....#.', '#.#..#.#', '.######.', '##.##.##', '########', '..####..', '.#....#.', '#......#']],
    crab: [
      ['#.........#', '##.#####.##', '.#########.', '###.###.###', '###########', '.#.#####.#.', '..#.....#..', '.##.....##.'],
      ['#.........#', '.#.#####.#.', '.#########.', '###.###.###', '###########', '..#######..', '.#.#...#.#.', '#.#.....#.#']],
    octo: [
      ['...######...', '..########..', '.##########.', '##..####..##', '############', '.##.####.##.', '.#...##...#.', '#..........#'],
      ['...######...', '..########..', '.##########.', '##..####..##', '############', '..##.##.##..', '.#..#..#..#.', '..#......#..']],
    cannon: [['......#......', '.....###.....', '....#####....', '...#######...', '.###########.', '#############', '####.###.####', '###.......###']],
    ufo: [['.....######.....', '...##########...', '.##############.', '##.##..##..##.##', '################', '..###......###..', '...#........#...']],
    boom: [['....#...#....', '.#...#.#...#.', '..#.......#..', '...#.....#...', '##.........##', '...#.....#...', '..#..#.#..#..', '.#..#...#..#.']],
    pboom: [
      ['..#.....#.......', '......#....#....', '...#.#..#.#.....', '.....###.#...#..', '..#.######......', '.#.##########.#.', '..############..', '.##############.'],
      ['#.....#.....#..#', '...#......#.....', '.#...#.#.#...#..', '....##.###.#....', '#..#######.#..#.', '..###########...', '.#############.#', '##############..']],
    pmask: [['#...#..#', '..#...#.', '.######.', '########', '########', '.######.', '..#..#..', '#..#...#']],
    amask: [['..#...', '#...#.', '..##.#', '.####.', '#.###.', '.#####', '#.###.', '.#.#.#']],
    shield: [['....##############....', '...################...', '..##################..', '.####################.',
      '######################', '######################', '######################', '######################',
      '######################', '######################', '######################', '######################',
      '#######........#######', '######..........######', '#####............#####', '#####............#####']]
  };
  // the three raider bombs, 3x7, four animation frames each
  function bombFrames(kind) {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const rows = [];
      for (let r = 0; r < 7; r++) {
        let s = '.#.';
        if (kind === 'rolling') { const k = (r + f) % 4; s = k === 0 ? '##.' : k === 2 ? '.##' : '.#.'; }
        else if (kind === 'plunger') s = r === [6, 4, 2, 0][f] ? '###' : '.#.';
        else { const k = [1, 2, 1, 0][(r + f) % 4]; s = '...'.slice(0, k) + '#' + '...'.slice(k + 1); }
        rows.push(s);
      }
      frames.push(rows);
    }
    return frames;
  }
  ['rolling', 'plunger', 'squiggly'].forEach(k => { SPR[k] = bombFrames(k); });
  const BOMB_ORDER = ['rolling', 'plunger', 'squiggly'];
  const KIND = r => (r === 0 ? 'squid' : r < 3 ? 'crab' : 'octo');
  const WIDTH = { squid: 8, crab: 11, octo: 12 };
  const POINTS = { squid: 30, crab: 20, octo: 10 };

  const cache = new Map();
  function spr(name, frame, color) {
    const key = name + frame + color;
    let c = cache.get(key);
    if (!c) {
      const rows = SPR[name][frame];
      c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
      const g = c.getContext('2d'); g.fillStyle = color;
      rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1); });
      cache.set(key, c);
    }
    return c;
  }
  function palette(col) {
    return col.dark
      ? { squid: '#c3a0f0', crab: '#74bde0', octo: '#86c99a', shield: '#c99a68', ufo: '#f0809f', bomb: '#f0c060', cannon: col.accent }
      : { squid: '#8656c4', crab: '#2c7ca3', octo: '#3b8654', shield: '#c8925a', ufo: '#d4456f', bomb: '#c4633f', cannon: col.accent };
  }
  const pad4 = n => String(Math.max(0, n | 0)).padStart(4, '0');

  Ludus.register({
    id: 'skyraiders', name: 'Sky Raiders', aka: 'alien shooter', tag: 'Arcade', tint: '#5b6ee1',
    hint: '<kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> move · <kbd>Space</kbd> fire',
    art(ctx, w, h) {
      const s = Math.max(1, Math.floor(Math.min(w, h) / 46));
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const kinds = ['squid', 'crab', 'octo'];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const k = kinds[r], img = spr(k, c % 2, 'rgba(255,255,255,0.9)');
        ctx.drawImage(img, Math.round(w / 2 + (c - 2) * 15 * s + (14 - WIDTH[k]) * s / 2), Math.round(h * 0.16 + r * 11 * s), img.width * s, img.height * s);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.round(w / 2), Math.round(h * 0.62), s, 4 * s);
      const cn = spr('cannon', 0, '#fffaf2');
      ctx.drawImage(cn, Math.round(w / 2 - 6.5 * s), Math.round(h * 0.8), 13 * s, 8 * s);
      ctx.restore();
      D.spark(ctx, w * 0.84, h * 0.84, 4 * s, '#fffaf2', 0);
    },
    create(stage, api) {
      const cfg = LEVEL[api.level] || LEVEL[1];
      const view = api.canvas(() => render());   // also draws the board while a resumed game waits on "Welcome back"
      const { ctx } = view;
      const held = { l: false, r: false };
      let wave, score, lives, bonusGiven, alive, left, fx, fy, dir, frame, stepT, px, shields, shot, bombs, ufo, ufoT;
      let fireCd, rr, plIdx, sqIdx, shotCount, phase, phaseT, clock = 0, effects = [], lastNote = -1, noteIdx = 0, deadAt = 0;
      let actx = null;

      // ---------- sound: the march thump, through WebAudio, honouring the Sound setting ----------
      function thump() {
        if (!api.settings.sound || clock - lastNote < 0.09) return;
        lastNote = clock;
        const f = NOTES[noteIdx]; noteIdx = (noteIdx + 1) % 4;
        try {
          actx = actx || new (window.AudioContext || window.webkitAudioContext)();
          if (actx.state === 'suspended') actx.resume().catch(() => {});
          const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
          o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.1);
          lp.type = 'lowpass'; lp.frequency.value = 420;
          const v = Math.max(0.0002, 0.22 * (api.settings.volume ?? 0.6));
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
          o.connect(lp).connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.13);
        } catch (e) { /* audio unavailable: play on silently */ }
      }

      // ---------- shields ----------
      function newShield(i, bits) {
        const cv = document.createElement('canvas'); cv.width = SH_W; cv.height = SH_H;
        const cells = bits ? bits.split('').map(Number) : SPR.shield[0].join('').split('').map(ch => (ch === '#' ? 1 : 0));
        return { x: SH_X[i], cells, cv, dirty: true, color: '' };
      }
      function shieldHit(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y);
        if (iy < SH_Y || iy >= SH_Y + SH_H) return null;
        for (const sh of shields) {
          if (ix >= sh.x && ix < sh.x + SH_W && sh.cells[(iy - SH_Y) * SH_W + ix - sh.x]) return sh;
        }
        return null;
      }
      function erode(sh, x, y, mask, ox, oy) {
        const rows = SPR[mask][0], lx = Math.floor(x) - sh.x + ox, ly = Math.floor(y) - SH_Y + oy;
        rows.forEach((row, my) => {
          for (let mx = 0; mx < row.length; mx++) {
            const cx = lx + mx, cy = ly + my;
            if (row[mx] === '#' && cx >= 0 && cy >= 0 && cx < SH_W && cy < SH_H) sh.cells[cy * SH_W + cx] = 0;
          }
        });
        sh.dirty = true;
      }
      function eraseBox(x0, y0, x1, y1) {
        for (const sh of shields) {
          if (x1 <= sh.x || x0 >= sh.x + SH_W) continue;
          for (let cy = Math.max(0, y0 - SH_Y); cy < Math.min(SH_H, y1 - SH_Y); cy++) {
            for (let cx = Math.max(0, x0 - sh.x); cx < Math.min(SH_W, x1 - sh.x); cx++) {
              if (sh.cells[cy * SH_W + cx]) { sh.cells[cy * SH_W + cx] = 0; sh.dirty = true; }
            }
          }
        }
      }

      // ---------- formation ----------
      function alienBox(i) {
        const r = Math.floor(i / COLS), c = i % COLS, k = KIND(r), w = WIDTH[k];
        const x = fx + c * CELL + Math.floor((CELL - w) / 2), y = fy + r * CELL;
        return { x, y, w, h: 8, k, r, c };
      }
      function bounds() {
        let l = 1e9, rgt = -1e9, bot = -1e9;
        for (let i = 0; i < TOTAL; i++) {
          if (!alive[i]) continue;
          const b = alienBox(i);
          l = Math.min(l, b.x); rgt = Math.max(rgt, b.x + b.w); bot = Math.max(bot, b.y + b.h);
        }
        return { l, r: rgt, bot };
      }
      function stepInterval() { return Math.max(1 / 60, cfg.step * left / TOTAL); }
      function marchStep() {
        frame ^= 1;
        const b = bounds(), dx = dir > 0 && left === 1 ? 3 : 2;
        if ((dir > 0 && b.r + dx > W - 6) || (dir < 0 && b.l - dx < 6)) { fy += 8; dir = -dir; }
        else fx += dir * dx;
        thump();
      }
      function lowestInColumn(c) {
        for (let r = ROWS - 1; r >= 0; r--) if (alive[r * COLS + c]) return r * COLS + c;
        return -1;
      }
      function nearestColumn() {
        let best = -1, bd = 1e9;
        for (let c = 0; c < COLS; c++) {
          if (lowestInColumn(c) < 0) continue;
          const d = Math.abs(fx + c * CELL + CELL / 2 - px);
          if (d < bd) { bd = d; best = c; }
        }
        return best;
      }
      function reload() {
        const f = score < 200 ? 1 : score < 1000 ? 0.8 : score < 2000 ? 0.65 : score < 3000 ? 0.55 : 0.5;
        return cfg.reload * f;
      }

      // ---------- run flow ----------
      function startWave(n) {
        wave = n; alive = Array(TOTAL).fill(1); left = TOTAL;
        const drop = n <= WAVE_DROP.length ? WAVE_DROP[n - 1] : WAVE_DROP[1 + ((n - 2) % (WAVE_DROP.length - 1))];
        fx = START_X; fy = START_Y + drop; dir = 1; frame = 0; stepT = 0;
        shot = null; bombs = []; ufo = null; ufoT = cfg.ufoEvery; fireCd = 1.5; rr = 0; plIdx = 0; sqIdx = 0; shotCount = 0;
        shields = [0, 1, 2, 3].map(i => newShield(i));
        phase = 'enter'; phaseT = 0;
      }
      function reset() {
        score = 0; lives = 3; bonusGiven = false; px = 30; effects = [];
        startWave(1); api.score(0);
      }
      function addScore(n) {
        score += n; api.score(score);
        if (!bonusGiven && score >= 1500) { bonusGiven = true; lives++; api.sfx('score'); api.toast('Extra cannon'); }
      }
      function fire() {
        if (phase !== 'play' || shot) return;            // only one cannon shot on screen, like the original
        shot = { x: Math.round(px), y: PY - 4 }; shotCount++; api.sfx('tap');
      }
      function killPlayer(invaded) {
        if (phase === 'over' || phase === 'dying') return;
        lives = invaded ? 0 : lives - 1; deadAt = clock; shot = null; bombs = [];
        api.sfx('boom');
        if (lives > 0) { phase = 'dying'; phaseT = 0; return; }
        lives = 0; phase = 'over';
        api.timeout(() => api.over({ score, title: invaded ? 'Invaded' : 'Cannon destroyed', won: false, message: `Reached wave ${wave}` }), 650);
      }

      function update(dt) {
        clock += dt;
        effects.forEach(e => { e.t += dt; });
        effects = effects.filter(e => e.t < e.life);
        if (phase === 'over' || dt === 0) return;
        if (phase === 'dying') {
          phaseT += dt;
          if (phaseT > 1.6) { phase = 'play'; px = 30; fireCd = reload(); }
          return;
        }
        if (phase === 'clear') { phaseT += dt; if (phaseT > 1.2) startWave(wave + 1); return; }
        movePlayer(dt);
        if (phase === 'enter') { phaseT += dt; if (phaseT * 60 >= TOTAL + 6) phase = 'play'; return; }
        moveShot(dt); if (phase !== 'play') return;
        march(dt); if (phase !== 'play') return;
        alienFire(dt);
        moveBombs(dt); if (phase !== 'play') return;
        moveUfo(dt);
      }
      function movePlayer(dt) {
        const d = (held.r ? 1 : 0) - (held.l ? 1 : 0);
        px = Math.max(14, Math.min(W - 14, px + d * 66 * dt));
      }
      function moveShot(dt) {
        if (!shot) return;
        let dist = 240 * dt;
        while (shot && dist > 0) {
          const s = Math.min(1, dist); dist -= s; shot.y -= s;
          const x = shot.x, y = shot.y;
          if (y < TOP_LIMIT) { effects.push({ k: 'pmask', x: x - 3, y: TOP_LIMIT - 2, t: 0, life: 0.25 }); shot = null; break; }
          if (ufo && x >= ufo.x && x < ufo.x + 16 && y >= UFO_Y && y < UFO_Y + 7) {
            const val = UFO_TABLE[shotCount % 15];
            addScore(val); api.sfx('power');
            effects.push({ k: 'ufoScore', x: ufo.x, y: UFO_Y, val, t: 0, life: 1.1 });
            ufo = null; ufoT = cfg.ufoEvery; shot = null; break;
          }
          const bi = bombs.findIndex(b => Math.abs(b.x + 1 - x) <= 1 && y >= b.y && y < b.y + 7);
          if (bi >= 0) { effects.push({ k: 'amask', x: x - 2, y: y - 4, t: 0, life: 0.2 }); bombs.splice(bi, 1); shot = null; break; }
          const sh = shieldHit(x, y);
          if (sh) { erode(sh, x, y, 'pmask', -3, -5); shot = null; break; }
          for (let i = 0; i < TOTAL; i++) {
            if (!alive[i]) continue;
            const a = alienBox(i);
            if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) {
              alive[i] = 0; left--; shot = null;
              addScore(POINTS[a.k]); api.sfx('hit');
              effects.push({ k: 'boom', x: a.x + a.w / 2 - 6.5, y: a.y, t: 0, life: 0.27, freeze: true });
              if (!left) { phase = 'clear'; phaseT = 0; bombs = []; ufo = null; api.sfx('line'); api.toast(`Wave ${wave + 1}`); }
              break;
            }
          }
        }
      }
      function march(dt) {
        if (!effects.some(e => e.freeze)) {           // the march pauses while a raider explodes
          stepT += dt;
          let n = 0;
          while (stepT >= stepInterval() && n++ < 3) { stepT -= stepInterval(); marchStep(); }
        }
        const b = bounds();
        if (b.bot > SH_Y) {
          for (let i = 0; i < TOTAL; i++) if (alive[i]) { const a = alienBox(i); if (a.y + a.h > SH_Y) eraseBox(a.x, a.y, a.x + a.w, a.y + a.h); }
        }
        if (b.bot >= PY) killPlayer(true);
      }
      function alienFire(dt) {
        fireCd -= dt;
        if (fireCd > 0 || bombs.length >= cfg.maxBombs) return;
        const kind = BOMB_ORDER[rr]; rr = (rr + 1) % 3;
        if (bombs.some(b => b.k === kind)) return;
        if (kind === 'plunger' && left === 1) return;
        if (kind === 'squiggly' && ufo) return;
        let c;
        if (kind === 'rolling' || Math.random() < cfg.aim) c = nearestColumn();
        else if (kind === 'plunger') { c = PLUNGER_COLS[plIdx]; plIdx = (plIdx + 1) % PLUNGER_COLS.length; }
        else { c = SQUIGGLY_COLS[sqIdx]; sqIdx = (sqIdx + 1) % SQUIGGLY_COLS.length; }
        const i = c >= 0 ? lowestInColumn(c) : -1;
        if (i < 0) return;
        const a = alienBox(i);
        bombs.push({ k: kind, x: Math.round(a.x + a.w / 2) - 1, y: a.y + a.h });
        fireCd = reload();
      }
      function moveBombs(dt) {
        const speed = cfg.bombSpeed * (left <= 8 ? 1.25 : 1);
        for (let j = bombs.length - 1; j >= 0; j--) {
          const b = bombs[j];
          let dist = speed * dt, gone = false;
          while (dist > 0 && !gone) {
            const s = Math.min(1, dist); dist -= s; b.y += s;
            const tx = b.x + 1, ty = b.y + 7;
            const sh = shieldHit(tx, ty);
            if (sh) { erode(sh, tx, ty, 'amask', -2, -2); gone = true; break; }
            if (tx >= px - 6.5 && tx < px + 6.5 && ty >= PY + 1 && ty < PY + 8) { killPlayer(false); return; }
            if (ty >= GROUND) { effects.push({ k: 'amask', x: b.x - 1, y: GROUND - 8, t: 0, life: 0.2 }); gone = true; }
          }
          if (gone) bombs.splice(j, 1);
        }
      }
      function moveUfo(dt) {
        if (ufo) {
          ufo.x += ufo.d * 48 * dt;
          if (ufo.x < -18 || ufo.x > W + 2) { ufo = null; ufoT = cfg.ufoEvery; }
          return;
        }
        ufoT -= dt;
        if (ufoT <= 0 && left >= 8 && !bombs.some(b => b.k === 'squiggly')) {
          const fromLeft = shotCount % 2 === 0;
          ufo = { x: fromLeft ? -16 : W, d: fromLeft ? 1 : -1 };
        }
      }

      // ---------- input ----------
      api.keys(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = true;
        else if (k === ' ' && !e.repeat) fire();
      });
      api.keysUp(e => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.l = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') held.r = false;
      });
      api.on(window, 'blur', () => { held.l = held.r = false; });

      // ---------- render ----------
      function render() {
        const col = api.colors(), P = palette(col), { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        const s = Math.min(w / W, h / H), ox = (w - W * s) / 2, oy = Math.max(0, (h - H * s) * 0.2);
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.imageSmoothingEnabled = false;
        const img = (name, f, color, x, y) => { const c = spr(name, f, color); ctx.drawImage(c, Math.round(x), Math.round(y)); };
        // HUD
        D.spark(ctx, 10, 13, 4.6, col.accent, 0);
        D.text(ctx, 'SCORE', 19, 8, 7, col.ink3, 700, 'left');
        D.text(ctx, pad4(score), 19, 18, 10, col.ink, 750, 'left');
        D.text(ctx, 'HI-SCORE', W / 2, 8, 7, col.ink3, 700);
        D.text(ctx, pad4(Math.max(api.best || 0, score)), W / 2, 18, 10, col.ink, 750);
        D.text(ctx, 'WAVE', W - 8, 8, 7, col.ink3, 700, 'right');
        D.text(ctx, String(wave), W - 8, 18, 10, col.ink, 750, 'right');
        // mystery ship
        if (ufo) img('ufo', 0, P.ufo, ufo.x, UFO_Y);
        // raiders (drawn in one by one, bottom row first, at the start of a wave)
        const shown = phase === 'enter' ? Math.floor(phaseT * 60) : TOTAL;
        for (let i = 0; i < TOTAL; i++) {
          if (!alive[i]) continue;
          const a = alienBox(i);
          if ((ROWS - 1 - a.r) * COLS + a.c >= shown) continue;
          img(a.k, frame, P[a.k], a.x, a.y);
        }
        // shields (each kept as a tiny bitmap, redrawn only when it erodes)
        shields.forEach(sh => {
          if (sh.dirty || sh.color !== P.shield) {
            const g = sh.cv.getContext('2d'); g.clearRect(0, 0, SH_W, SH_H); g.fillStyle = P.shield;
            sh.cells.forEach((on, j) => { if (on) g.fillRect(j % SH_W, Math.floor(j / SH_W), 1, 1); });
            sh.dirty = false; sh.color = P.shield;
          }
          ctx.drawImage(sh.cv, sh.x, SH_Y);
        });
        // effects
        effects.forEach(e => {
          if (e.k === 'boom') img('boom', 0, col.ink2, e.x, e.y);
          else if (e.k === 'ufoScore') D.text(ctx, String(e.val), e.x + 8, e.y + 4, 8, P.ufo, 800);
          else img(e.k, 0, e.k === 'pmask' ? col.accent : P.bomb, e.x, e.y);
        });
        // shots
        if (shot) { ctx.fillStyle = col.accent; ctx.fillRect(shot.x, Math.round(shot.y), 1, 4); }
        bombs.forEach(b => img(b.k, Math.floor(b.y / 3) % 4, P.bomb, b.x, b.y));
        // cannon, or its explosion (frozen on the board at the end of the run)
        if (phase === 'dying' || phase === 'over') img('pboom', Math.floor((clock - deadAt) * 10) % 2, P.cannon, px - 8, PY);
        else img('cannon', 0, P.cannon, px - 6.5, PY);
        // ground line and spare cannons
        ctx.fillStyle = col.line; ctx.fillRect(0, GROUND, W, 1);
        D.text(ctx, String(lives), 9, 248, 9, col.ink, 750, 'center');
        for (let i = 0; i < Math.min(6, lives - 1); i++) img('cannon', 0, P.cannon, 20 + i * 16, 244);
        ctx.restore();
      }

      // ---------- save / restore ----------
      const okBits = (str, n) => typeof str === 'string' && str.length === n && /^[01]+$/.test(str);
      function restore(s) {
        if (!s || s.v !== 2 || !okBits(s.alive, TOTAL) || !Array.isArray(s.shields) || s.shields.length !== 4) return false;
        if (!s.shields.every(b => okBits(b, SH_W * SH_H))) return false;
        if (!(s.lives >= 1 && s.lives <= 9) || !(s.wave >= 1) || ![s.fx, s.fy, s.px, s.score].every(Number.isFinite)) return false;
        reset();
        startWave(s.wave | 0);
        score = Math.max(0, s.score | 0); lives = s.lives | 0; bonusGiven = !!s.bonusGiven;
        alive = s.alive.split('').map(Number); left = alive.reduce((a, b) => a + b, 0);
        fx = s.fx; fy = s.fy; dir = s.dir === -1 ? -1 : 1; frame = s.frame ? 1 : 0; stepT = +s.stepT || 0;
        px = Math.max(14, Math.min(W - 14, s.px));
        shields = s.shields.map((b, i) => newShield(i, b));
        shot = s.shot && Number.isFinite(s.shot.x) && Number.isFinite(s.shot.y) ? { x: s.shot.x, y: s.shot.y } : null;
        bombs = Array.isArray(s.bombs) ? s.bombs.filter(b => b && BOMB_ORDER.includes(b.k) && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, 3).map(b => ({ k: b.k, x: b.x, y: b.y })) : [];
        ufo = s.ufo && Number.isFinite(s.ufo.x) ? { x: s.ufo.x, d: s.ufo.d === -1 ? -1 : 1 } : null;
        ufoT = Number.isFinite(s.ufoT) ? s.ufoT : cfg.ufoEvery; fireCd = Number.isFinite(s.fireCd) ? s.fireCd : 1;
        rr = (s.rr | 0) % 3; plIdx = (s.plIdx | 0) % PLUNGER_COLS.length; sqIdx = (s.sqIdx | 0) % SQUIGGLY_COLS.length; shotCount = s.shotCount | 0;
        phase = ['play', 'dying', 'clear', 'enter'].includes(s.phase) ? s.phase : 'play'; phaseT = +s.phaseT || 0;
        if (!left) { phase = 'clear'; phaseT = 0; }
        if (phase === 'dying') deadAt = clock - phaseT;
        api.score(score);
        return true;
      }
      const restored = !!(api.saved && restore(api.saved));
      if (!restored) reset();
      api.loop(dt => { update(dt); render(); });
      const r2 = n => Math.round(n * 100) / 100;
      return {
        save() {
          if (phase === 'over' || (!restored && !api.touched)) return null;   // nothing played yet
          return {
            v: 2, level: api.level, wave, score, lives, bonusGiven, alive: alive.join(''), fx, fy, dir, frame, stepT: r2(stepT), px: r2(px),
            shields: shields.map(sh => sh.cells.join('')), shot: shot && { x: shot.x, y: r2(shot.y) },
            bombs: bombs.map(b => ({ k: b.k, x: b.x, y: r2(b.y) })), ufo: ufo && { x: r2(ufo.x), d: ufo.d }, ufoT: r2(ufoT), fireCd: r2(fireCd),
            rr, plIdx, sqIdx, shotCount, phase, phaseT: r2(phaseT)
          };
        },
        destroy() { if (actx) { try { actx.close(); } catch (e) { /* already closed */ } actx = null; } }
      };
    }
  });
})();
