/* Paper.io: territory land grab. Leave your land to draw a trail, come back to close the loop and claim
   everything inside. Anyone who crosses your trail (or you, crossing your own) is out. Bigger share of the map wins.
   vs Bot: you against 6-10 AI players (mouse/touch steers freely, WASD or arrows turn).
   vs Friend: P1 = WASD, P2 = arrows on one keyboard, plus AI players. */
(function () {
  const D = Ludus.draw;
  const N = 90;                 // map is N x N cells
  const WP = 20;                // offscreen pixels per cell
  const SPEED = 4.2;            // cells per second
  const TURN = 5.6;             // radians per second
  const TIME_LIMIT = 240;
  const NAMES = ['Pip', 'Moss', 'Juno', 'Rex', 'Fig', 'Otto', 'Wren', 'Kit', 'Lux', 'Bea', 'Dot', 'Nova'];
  const PALETTE = ['#4fb3a9', '#e3b54c', '#e68fb0', '#9b92dc', '#9cc95f', '#3fc1d9', '#6fd0a0', '#8b9bb4', '#d9677f', '#c8a27a', '#b074b8', '#7aa6c9'];
  const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif';
  const TAU = Math.PI * 2;

  // ---------- colour helpers ----------
  function rgb(h) {
    h = (h || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(h);
    if (m) h = '#' + m[1].split('').map(ch => ch + ch).join('');
    m = /^#([0-9a-f]{6})$/i.exec(h);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(h);
    return m ? [+m[1], +m[2], +m[3]] : [217, 119, 87];
  }
  function shade(h, f) {
    const t = f < 0 ? 0 : 255, k = Math.abs(f), c = rgb(h);
    return `rgb(${c.map(v => Math.round(v + (t - v) * k)).join(',')})`;
  }
  function rgba(h, a) { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  Ludus.register({
    id: 'paperio', name: 'Paper.io', aka: 'territory land grab', tag: 'Arcade', tint: '#4fb3a9', wide: true, versus: true, defaultVs: 'bot', online: { min: 2, max: 4 },
    onlineHint: '<b>Online</b> 2 to 4 players plus bots · steer with the mouse, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrows · loop back home to claim land · most land at the end wins',
    hint: 'vs Bot: move the mouse or drag to steer, or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> · loop back home to claim land · vs Friend: <b>P1</b> WASD, <b>P2</b> arrows',
    art(ctx, w, h, c) {
      const u = h / 78;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      const g = 13 * u;
      for (let x = (w % g) / 2; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const land = (x, y, bw, bh, color) => {
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; D.roundRect(ctx, x, y + 3 * u, bw, bh, 6 * u); ctx.fill();
        ctx.fillStyle = color; D.roundRect(ctx, x, y, bw, bh, 6 * u); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; D.roundRect(ctx, x + 2 * u, y + 2 * u, bw - 4 * u, 3 * u, 1.5 * u); ctx.fill();
      };
      land(w * 0.66, h * 0.1, w * 0.26, h * 0.34, '#5b8def');
      land(w * 0.7, h * 0.58, w * 0.2, h * 0.28, '#f1c75b');
      const hx = w * 0.46, hy = h * 0.52;
      ctx.fillStyle = 'rgba(255,248,242,0.24)'; D.roundRect(ctx, w * 0.22, h * 0.2, hx - w * 0.22, h * 0.32, 4 * u); ctx.fill();
      land(w * 0.07, h * 0.5, w * 0.27, h * 0.38, '#fff8f2');
      ctx.strokeStyle = 'rgba(255,248,242,0.8)'; ctx.lineWidth = 6 * u;
      ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.52); ctx.lineTo(w * 0.22, h * 0.2); ctx.lineTo(hx, h * 0.2); ctx.lineTo(hx, hy - 4 * u); ctx.stroke();
      ctx.fillStyle = '#fff8f2'; ctx.beginPath(); ctx.arc(hx, hy, 8.5 * u, 0, TAU); ctx.fill();
      D.spark(ctx, hx, hy, 6.5 * u, '#d97757', 0);
    },
    create(stage, api) {
      const view = api.canvas();
      const { ctx } = view;
      const friend = api.friend;
      const on = api.online, guest = !!(on && !on.isHost), solo = !friend || !!on;   // solo: this screen steers one player (keys + pointer)
      const HCOL = [null, null, D.P2, '#4f9d69', '#9b6dd6'];   // colours of human players 2-4 (player 1 uses the accent)
      const LV = api.level;
      const NB = friend ? [4, 6, 8][LV] : [6, 8, 10][LV];
      const AI_THINK = [0.26, 0.17, 0.1][LV];
      const AI_AGGR = [0.18, 0.4, 0.65][LV];
      const AI_MAXL = [8, 11, 14][LV];
      const AI_SPD = [0.92, 0.98, 1.03][LV];

      // ---------- world state ----------
      const owner = new Uint8Array(N * N);     // territory owner id (0 = nobody)
      const tOwner = new Uint8Array(N * N);    // trail owner id
      const tSeq = new Int32Array(N * N);      // order of a trail cell inside its owner's trail
      const seen = new Uint8Array(N * N);
      const stack = new Int32Array(N * N);
      const off = document.createElement('canvas'); off.width = off.height = N * WP;
      const octx = off.getContext('2d');
      const rowsOut = new Set();   // online host: territory rows changed since they were last sent
      let dirty = true, lastDark = null, lastAccent = '';
      let players = [], started = false, clock = 0, finished = false, endTimer = 0, parts = [], flashes = [];
      let cam = { x: N / 2, y: N / 2, cp: 24 }, camInit = false, lb = [], lbT = 0, toastMsg = null, toastT = 0, bestPct = 0;
      const pctOf = p => p.count / (N * N) * 100;

      function own(i, id) {
        const o = owner[i]; if (o === id) return;
        if (o) players[o - 1].count--;
        owner[i] = id; if (id) players[id - 1].count++;
        dirty = true; rowsOut.add((i / N) | 0);
      }

      function mk(id, human, name, color) {
        return { id, human, name, color, x: 0, y: 0, lx: 0, ly: 0, cx: 0, cy: 0, ang: 0, tgt: 0, alive: false, trail: [], pts: [], seq: 0, count: 0, kills: 0, best: 0,
          respawn: 0, deathT: 0, why: '', by: '', spd: human ? 1 : AI_SPD * (0.97 + Math.random() * 0.06),
          ai: { mode: 'plan', wps: [], think: Math.random() * 0.2, target: 0, cool: 0, home: null, homeT: 0, aggr: AI_AGGR * (0.6 + Math.random() * 0.8), maxL: AI_MAXL, maxTrail: 60, ambition: 0.7 + Math.random() * 0.6 } };
      }

      function spawn(p) {
        let best = null, bestScore = -1;
        for (let k = 0; k < 70; k++) {
          const x = api.randInt(8, N - 9), y = api.randInt(8, N - 9);
          let clear = true;
          for (let yy = y - 5; yy <= y + 5 && clear; yy++) for (let xx = x - 5; xx <= x + 5; xx++) if (owner[yy * N + xx] || tOwner[yy * N + xx]) { clear = false; break; }
          let near = 1e9;
          for (const e of players) if (e.alive && e !== p) near = Math.min(near, Math.hypot(e.x - x, e.y - y));
          const sc = (clear ? 1000 : 0) + Math.min(near, 40);
          if (sc > bestScore) { bestScore = sc; best = [x, y]; }
          if (clear && near > 18) break;
        }
        const [x, y] = best;
        for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) { const i = yy * N + xx; if (tOwner[i]) { const t = players[tOwner[i] - 1]; if (t !== p) die(t, p, 'cut'); } own(i, p.id); }
        p.x = p.lx = x + 0.5; p.y = p.ly = y + 0.5; p.cx = x; p.cy = y;
        p.ang = p.tgt = api.randInt(0, 7) * Math.PI / 4; p.alive = true; p.trail = []; p.pts = []; p.seq = 0; p.deathT = 0;
        p.ai.mode = 'plan'; p.ai.wps = []; p.ai.think = 0.6 + Math.random() * 0.8; p.ai.home = null;
        dirty = true;
      }

      function setup() {
        players = []; owner.fill(0); tOwner.fill(0); tSeq.fill(0); parts = []; flashes = [];
        if (guest) { started = false; clock = 0; finished = false; camInit = false; bestPct = 0; api.score(0); return; }   // the host's copy fills this in
        let id = 1;
        for (let k = 0; k < N; k++) rowsOut.add(k);
        if (on) on.seats.forEach(st => players.push(mk(id++, st + 1, Ludus.rt.seatName(api, st), HCOL[st + 1] || null)));
        else {
          players.push(mk(id++, 1, friend ? 'P1' : 'You', null));
          if (friend) players.push(mk(id++, 2, 'P2', Ludus.draw.P2));
        }
        const names = NAMES.slice().sort(() => Math.random() - 0.5);
        for (let k = 0; k < NB; k++) players.push(mk(id++, 0, names[k % names.length], PALETTE[k % PALETTE.length]));
        players.forEach(spawn);
        if (!friend) players.forEach(p => { if (!p.human) p.ai.think += 0.2; });
        refreshColors(Ludus.colors());
        started = false; clock = 0; finished = false; endTimer = 0; camInit = false; bestPct = 0; lbT = 0;
        api.score(0);
      }
      function refreshColors(c) { players.forEach(p => { if (p.human === 1) p.color = c.accent || '#d97757'; }); }
      const meP = () => (on ? players.find(p => p.human === on.seat + 1) : players[0]) || players[0];

      // ---------- input ----------
      const pad = { 1: { l: 0, r: 0, u: 0, d: 0, t: 0 }, 2: { l: 0, r: 0, u: 0, d: 0, t: 0 } };
      const ptr = { x: 0, y: 0, on: false, moved: 0, last: 0 };
      const keyMap = e => {
        const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const c1 = { KeyW: 'u', KeyA: 'l', KeyS: 'd', KeyD: 'r' }[e.code] || { w: 'u', a: 'l', s: 'd', d: 'r' }[k];
        const c2 = { ArrowUp: 'u', ArrowLeft: 'l', ArrowDown: 'd', ArrowRight: 'r' }[e.code] || { ArrowUp: 'u', ArrowLeft: 'l', ArrowDown: 'd', ArrowRight: 'r' }[k];
        if (c1) return [1, c1];
        if (c2) return [solo ? 1 : 2, c2];
        return null;
      };
      api.keys(e => {
        const m = keyMap(e); if (!m) return;
        pad[m[0]][m[1]] = 1; pad[m[0]].t = clock + 1; ptr.on = false; started = true;
      });
      api.keysUp(e => { const m = keyMap(e); if (m) pad[m[0]][m[1]] = 0; });
      api.on(window, 'blur', () => { [1, 2].forEach(k => { pad[k].l = pad[k].r = pad[k].u = pad[k].d = 0; }); });
      const rel = e => { const r = view.canvas.getBoundingClientRect(); const sx = r.width ? view.w / r.width : 1; return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sx]; };
      if (solo) {
        api.on(view.canvas, 'pointerdown', e => { const [x, y] = rel(e); ptr.x = x; ptr.y = y; ptr.on = true; started = true; ptr.moved = 99; });
        api.on(view.canvas, 'pointermove', e => {
          const [x, y] = rel(e);
          ptr.moved += Math.hypot(x - ptr.x, y - ptr.y); ptr.x = x; ptr.y = y;
          if (ptr.moved > 6 || e.buttons) { ptr.on = true; if (ptr.moved > 12 || e.buttons) started = true; }
        });
      } else {
        api.on(view.canvas, 'pointerdown', () => { started = true; });
      }
      function humanTarget(p) {
        if (on) { if (p !== meP()) { if (remote[p.human]) p.tgt = remote[p.human]; return; } return ownTarget(p); }
        const k = pad[p.human];
        const dx = k.r - k.l, dy = k.d - k.u;
        if (dx || dy) { p.tgt = Math.atan2(dy, dx); return; }
        if (!friend && ptr.on && p.human === 1) {
          const sx = (p.x - cam.x) * cam.cp + view.w / 2, sy = (p.y - cam.y) * cam.cp + viewOy();
          const ddx = ptr.x - sx, ddy = ptr.y - sy;
          if (Math.hypot(ddx, ddy) > cam.cp * 0.5) p.tgt = Math.atan2(ddy, ddx);
        }
      }
      // this screen's own steering (online: keys or pointer, whichever was used last)
      function ownTarget(p) {
        const k = pad[1], dx = k.r - k.l, dy = k.d - k.u;
        if (dx || dy) { p.tgt = Math.atan2(dy, dx); return p.tgt; }
        if (ptr.on) {
          const sx = (p.x - cam.x) * cam.cp + view.w / 2, sy = (p.y - cam.y) * cam.cp + viewOy();
          const ddx = ptr.x - sx, ddy = ptr.y - sy;
          if (Math.hypot(ddx, ddy) > cam.cp * 0.5) p.tgt = Math.atan2(ddy, ddx);
        }
        return p.tgt;
      }
      const remote = {};   // host: the steering angle each guest asked for, by human number
      const viewOy = () => view.h * 0.54 + 12;

      // ---------- rules ----------
      function die(v, killer, why) {
        if (!v.alive) return;
        v.alive = false; v.why = why; v.by = killer && killer !== v ? killer.name : '';
        for (const i of v.trail) if (tOwner[i] === v.id) tOwner[i] = 0;
        v.trail = []; v.pts = [];
        for (let i = 0; i < N * N; i++) if (owner[i] === v.id) { owner[i] = 0; rowsOut.add((i / N) | 0); }
        v.count = 0; dirty = true;
        if (killer && killer !== v) killer.kills++;
        if (!api.reduceMotion) for (let k = 0; k < 18; k++) { const a = Math.random() * TAU, s = 2 + Math.random() * 5; parts.push({ x: v.x, y: v.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + Math.random() * 0.4, t: 0, color: v.color }); }
        if (v.human) { v.deathT = 0; if (!on || v === meP()) api.sfx('lose'); } else { v.respawn = 3 + Math.random() * 3; if (killer && killer.human) { api.sfx('boom'); toast(`${v.name} is out`); } }
      }
      function toast(s) { toastMsg = s; toastT = 1.6; }

      // Trail closes: everything enclosed (flood fill from the map border) becomes ours.
      function claim(p) {
        const before = p.count;
        for (const i of p.trail) { tOwner[i] = 0; own(i, p.id); }
        p.trail = []; p.pts = [];
        seen.fill(0);
        let sp = 0;
        const push = i => { if (!seen[i] && owner[i] !== p.id) { seen[i] = 1; stack[sp++] = i; } };
        for (let k = 0; k < N; k++) { push(k); push((N - 1) * N + k); push(k * N); push(k * N + N - 1); }
        while (sp) {
          const i = stack[--sp], x = i % N;
          if (i >= N) push(i - N);
          if (i < N * N - N) push(i + N);
          if (x > 0) push(i - 1);
          if (x < N - 1) push(i + 1);
        }
        const got = [], victims = new Set();
        for (let i = 0; i < N * N; i++) {
          if (owner[i] === p.id || seen[i]) continue;
          if (tOwner[i] && tOwner[i] !== p.id) victims.add(tOwner[i]);
          own(i, p.id); got.push(i);
        }
        victims.forEach(id => die(players[id - 1], p, 'cut'));
        if (got.length && got.length < 3200 && !api.reduceMotion) flashes.push({ cells: got, t: 0, color: p.color });
        if (p.human) {
          if (p.count > before + 1 && (!on || p === meP())) api.sfx(got.length > 8 ? 'line' : 'score');
          p.best = Math.max(p.best, pctOf(p));
        }
      }

      // One cell entered by a player. Returns false when the player died.
      function touch(p, i) {
        const t = tOwner[i];
        if (t) {
          if (t === p.id) { if (tSeq[i] < p.seq - 2) { die(p, p, 'self'); return false; } }
          else die(players[t - 1], p, 'cut');
        }
        if (owner[i] === p.id) { if (p.trail.length) claim(p); }
        else if (!tOwner[i]) {
          if (!p.trail.length) p.pts = [{ x: p.lx, y: p.ly }];
          tOwner[i] = p.id; tSeq[i] = ++p.seq; p.trail.push(i);
        }
        return true;
      }

      function move(p, dt) {
        const d = SPEED * p.spd * dt;
        const steps = Math.max(1, Math.ceil(d / 0.3)), dd = d / steps;
        // turn first
        const diff = angDiff(p.ang, p.tgt);
        p.ang += clamp(diff, -TURN * dt, TURN * dt);
        const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
        for (let s = 0; s < steps; s++) {
          p.lx = p.x; p.ly = p.y;
          p.x += ca * dd; p.y += sa * dd;
          let hit = false;
          const lo = 0.3, hi = N - 0.3;
          if (p.x < lo) { p.x = lo; hit = true; } else if (p.x > hi) { p.x = hi; hit = true; }
          if (p.y < lo) { p.y = lo; hit = true; } else if (p.y > hi) { p.y = hi; hit = true; }
          if (hit && p.trail.length) { die(p, null, 'wall'); return; }
          const cx = Math.floor(p.x), cy = Math.floor(p.y);
          if (cx !== p.cx || cy !== p.cy) {
            if (cx !== p.cx && cy !== p.cy && !touch(p, p.cy * N + cx)) return;
            const ok = touch(p, cy * N + cx); p.cx = cx; p.cy = cy;
            if (!ok) return;
          }
          if (p.trail.length && owner[cy * N + cx] !== p.id) {
            const l = p.pts[p.pts.length - 1];
            if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 0.3) p.pts.push({ x: p.x, y: p.y });
          }
        }
      }

      // ---------- AI ----------
      const ci = p => p.cy * N + p.cx;
      function nearestOwn(p) {
        const a = p.ai;
        if (a.home && clock - a.homeT < 0.35 && owner[a.home[2]] === p.id) return a.home;
        let best = null;
        for (let r = 0; r < 90 && !best; r++) {
          let bd = 1e9;
          for (let dy = -r; dy <= r; dy++) {
            const y = p.cy + dy; if (y < 0 || y >= N) continue;
            const edge = Math.abs(dy) === r;
            for (let dx = -r; dx <= r; dx += edge ? 1 : Math.max(1, 2 * r)) {
              const x = p.cx + dx; if (x < 0 || x >= N) continue;
              if (owner[y * N + x] === p.id) { const dist = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y); if (dist < bd) { bd = dist; best = [x + 0.5, y + 0.5, y * N + x, dist]; } }
            }
          }
        }
        a.home = best; a.homeT = clock;
        return best;
      }
      // Is the point safe to drive into? (borders and the bot's own older trail are deadly)
      function hazardAt(p, x, y) {
        if (x < 0.9 || y < 0.9 || x > N - 0.9 || y > N - 0.9) return true;
        const i = Math.floor(y) * N + Math.floor(x);
        return tOwner[i] === p.id && tSeq[i] < p.seq - 2;
      }
      function rayClear(p, ang, len) {
        const c = Math.cos(ang), s = Math.sin(ang);
        for (let d = 0.7; d <= len; d += 0.55) if (hazardAt(p, p.x + c * d, p.y + s * d)) return false;
        return true;
      }
      const OFFS = [0, 0.3, -0.3, 0.65, -0.65, 1.05, -1.05, 1.5, -1.5, 2.1, -2.1, 2.8, -2.8];
      function steer(p, want) {
        const a = p.ai, pref = a.bias || 1;
        for (const o of OFFS) {
          const s = o * pref;
          if (rayClear(p, want + s, 4.6)) { p.tgt = want + s; if (o) a.bias = o > 0 ? 1 : -1; return; }
        }
        p.tgt = want;
      }
      function planLoop(p) {
        const a = p.ai;
        let near = 1e9;
        for (const e of players) if (e !== p && e.alive) near = Math.min(near, Math.hypot(e.x - p.x, e.y - p.y));
        const L = clamp(Math.round((3 + (near - 7) * 0.32 + Math.random() * 3) * a.ambition), 3, a.maxL);
        let best = null, bs = -1e9;
        for (let k = 0; k < 8; k++) {
          const ang = k * Math.PI / 4 + (Math.random() - 0.5) * 0.4, c = Math.cos(ang), s = Math.sin(ang);
          let e = 0;
          while (e < 30 && owner[clamp(Math.floor(p.y + s * e), 0, N - 1) * N + clamp(Math.floor(p.x + c * e), 0, N - 1)] === p.id) e += 0.5;
          const fx = p.x + c * (e + L), fy = p.y + s * (e + L);
          let sc = -e * 0.8 + Math.random() * 2;
          if (fx < 4 || fy < 4 || fx > N - 4 || fy > N - 4) sc -= 40;
          for (const en of players) if (en !== p && en.alive) { const d = Math.hypot(en.x - fx, en.y - fy); if (d < 9) sc -= (9 - d) * 3; }
          // open ground beyond: count non-own cells ahead
          let open = 0;
          for (let q = 1; q <= 3; q++) { const ox = Math.floor(clamp(p.x + c * (e + q * L / 3), 0, N - 1)), oy = Math.floor(clamp(p.y + s * (e + q * L / 3), 0, N - 1)); if (owner[oy * N + ox] !== p.id) open++; }
          sc += open * 1.5;
          if (sc > bs) { bs = sc; best = { c, s, e, ang }; }
        }
        const { c, s, e } = best;
        const P1 = [p.x + c * (e + L), p.y + s * (e + L)];
        const side = Math.random() < 0.5 ? 1 : -1;
        const px = -s * side, py = c * side;
        const W = L * (0.8 + Math.random() * 0.6);
        const room = side2 => { const x = P1[0] + (-s * side2) * W, y = P1[1] + (c * side2) * W; return Math.min(x, y, N - x, N - y); };
        const sd = room(side) >= room(-side) ? side : -side;
        const nx = -s * sd, ny = c * sd;
        const P2 = [P1[0] + nx * W, P1[1] + ny * W];
        const P3 = [P2[0] - c * (L + e + 1.5), P2[1] - s * (L + e + 1.5)];
        void px; void py;
        const cl = pt => [clamp(pt[0], 2.5, N - 2.5), clamp(pt[1], 2.5, N - 2.5)];
        a.wps = [cl(P1), cl(P2), cl(P3)]; a.mode = 'plan';
      }
      function aiThink(p) {
        const a = p.ai;
        const home = owner[ci(p)] === p.id;
        let dEn = 1e9, dTr = 1e9;
        for (const e of players) {
          if (e === p || !e.alive) continue;
          dEn = Math.min(dEn, Math.hypot(e.x - p.x, e.y - p.y));
          for (let k = 0; k < p.trail.length; k += 2) { const ti = p.trail[k]; dTr = Math.min(dTr, Math.hypot(e.x - (ti % N + 0.5), e.y - (Math.floor(ti / N) + 0.5))); }
        }
        if (home && !p.trail.length && a.mode !== 'plan') a.mode = 'plan';
        if (p.trail.length) {
          const h = nearestOwn(p);
          const dh = h ? h[3] : 20;
          if (a.mode !== 'return' && (dTr < 4.2 + 0.8 * dh || p.trail.length > a.maxTrail)) a.mode = 'return';
        }
        // opportunistic attack on a nearby enemy trail
        if (a.mode !== 'return' && a.mode !== 'attack' && p.trail.length < 14 && clock > a.cool) {
          a.cool = clock + 1.2;
          let bd = 11, bv = 0;
          for (const e of players) {
            if (e === p || !e.alive || !e.trail.length) continue;
            for (let k = 0; k < e.trail.length; k += 2) { const ti = e.trail[k], d = Math.hypot(ti % N + 0.5 - p.x, Math.floor(ti / N) + 0.5 - p.y); if (d < bd) { bd = d; bv = e.id; } }
          }
          if (bv && Math.random() < a.aggr) { a.mode = 'attack'; a.target = bv; }
        }
        let tx, ty;
        if (a.mode === 'attack') {
          const v = players[a.target - 1];
          if (!v || !v.alive || !v.trail.length || p.trail.length > 30) { a.mode = p.trail.length ? 'return' : 'plan'; }
          else {
            let bd = 1e9;
            for (const ti of v.trail) { const x = ti % N + 0.5, y = Math.floor(ti / N) + 0.5, d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; tx = x; ty = y; } }
          }
        }
        if (a.mode === 'plan') {
          if (!a.wps.length) { if (home && !p.trail.length) planLoop(p); else a.mode = 'return'; }
          if (a.mode === 'plan') {
            while (a.wps.length && Math.hypot(a.wps[0][0] - p.x, a.wps[0][1] - p.y) < 1.1) a.wps.shift();
            if (!a.wps.length) a.mode = 'return'; else { tx = a.wps[0][0]; ty = a.wps[0][1]; }
          }
        }
        if (a.mode === 'return') {
          a.wps = [];
          const h = nearestOwn(p);
          if (h) { tx = h[0]; ty = h[1]; if (home && !p.trail.length) a.mode = 'plan'; }
          else { tx = N / 2; ty = N / 2; }
        }
        if (tx === undefined) { tx = N / 2; ty = N / 2; }
        steer(p, Math.atan2(ty - p.y, tx - p.x));
      }

      // ---------- simulation ----------
      function humansAlive() { return players.some(p => p.human && p.alive); }
      function update(dt) {
        if (!started) return;
        clock += dt;
        for (const p of players) {
          if (p.alive) {
            if (p.human) humanTarget(p);
            else if (clock > 0.4) { p.ai.think -= dt; if (p.ai.think <= 0) { p.ai.think = AI_THINK * (0.7 + Math.random() * 0.6); aiThink(p); } }
            if (p.alive) move(p, dt);
            if (p.human && p.alive) { p.best = Math.max(p.best, pctOf(p)); }
          } else if (!p.human && !finished) {
            p.respawn -= dt;
            if (p.respawn <= 0) { spawn(p); p.kills = 0; }
          } else if (p.human) p.deathT += dt;
        }
        for (const q of parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
        parts = parts.filter(q => q.t < q.life);
        for (const f of flashes) f.t += dt;
        flashes = flashes.filter(f => f.t < 0.5);
        if (toastT > 0) toastT -= dt;
        // score + end checks
        const hs = players.filter(p => p.human);
        const top = Math.max(...hs.map(p => p.best));
        if (top > bestPct) { bestPct = top; api.score(Math.round(bestPct)); }
        if (!finished) {
          const all = hs.every(p => !p.alive);
          const full = hs.some(p => p.alive && pctOf(p) >= 99.9);
          if (clock >= TIME_LIMIT) finish('time');
          else if (full) finish('full');
          else if (all && hs.every(p => p.deathT > 1.3)) finish('dead');
          else if (!friend && !hs[0].alive && hs[0].deathT > 1.3) finish('dead');
        }
      }
      function finish(why) {
        finished = true;
        const hs = players.filter(p => p.human);
        const score = Math.round(Math.max(...hs.map(p => p.best)));
        let title, message;
        if (on) {   // every screen gets its own result, built from the shared numbers
          const best = hs.map(p => +p.best.toFixed(1)), win = hs.slice().sort((a, b) => b.best - a.best)[0];
          on.send('end', { why, best, win: win.human });
          finishOnline(why, hs.map(p => p.human), best, win.human);
          return;
        }
        if (friend) {
          const [a, b] = hs;
          const win = a.best === b.best ? null : (a.best > b.best ? a : b);
          title = why === 'full' ? `${hs.find(p => p.alive).name} owns the map` : (win ? `${win.name} wins` : 'A tie');
          message = `P1 ${a.best.toFixed(1)}%  ·  P2 ${b.best.toFixed(1)}%`;
        } else {
          const p = hs[0];
          if (why === 'time') { title = 'Time is up'; message = `You held ${p.best.toFixed(1)}% of the map at best`; }
          else if (why === 'full') { title = 'The whole map is yours'; message = '100% owned'; }
          else {
            title = p.why === 'self' ? 'You hit your own trail' : p.why === 'wall' ? 'You hit the edge' : (p.by ? `${p.by} cut your trail` : 'Wiped out');
            message = `Best ${p.best.toFixed(1)}% of the map` + (p.kills ? `  ·  ${p.kills} ${p.kills === 1 ? 'kill' : 'kills'}` : '');
          }
        }
        api.over({ score, title, message, won: why === 'full' });
      }

      // ---------- rendering ----------
      function paintTerritory(c) {
        octx.clearRect(0, 0, off.width, off.height);
        const dark = c.dark;
        const top = id => { const p = players[id - 1]; return dark ? shade(p.color, -0.1) : p.color; };
        let last = 0;
        for (let i = 0; i < N * N; i++) {
          const o = owner[i]; if (!o) continue;
          if (o !== last) { octx.fillStyle = top(o); last = o; }
          octx.fillRect((i % N) * WP - 0.4, Math.floor(i / N) * WP - 0.4, WP + 0.8, WP + 0.8);
        }
        const lip = WP * 0.2;
        last = 0;
        for (let i = 0; i < N * N; i++) {
          const o = owner[i]; if (!o) continue;
          const x = (i % N) * WP, y = Math.floor(i / N) * WP;
          const below = i + N < N * N ? owner[i + N] : -1;
          if (below !== o) {
            if (o !== last) { octx.fillStyle = shade(players[o - 1].color, dark ? -0.45 : -0.27); last = o; }
            octx.fillRect(x - 0.4, y + WP - lip, WP + 0.8, lip);
          }
        }
        octx.fillStyle = 'rgba(255,255,255,0.28)';
        for (let i = N; i < N * N; i++) { const o = owner[i]; if (o && owner[i - N] !== o) octx.fillRect((i % N) * WP - 0.4, Math.floor(i / N) * WP, WP + 0.8, 1.6); }
      }

      function drawHead(p, c, sx, sy, r, t) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.85, r * 0.9, r * 0.38, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(p.color, -0.25); ctx.beginPath(); ctx.arc(sx, sy + r * 0.16, r, 0, TAU); ctx.fill();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = c.dark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.stroke();
        if (p.human) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.7, 0, TAU); ctx.fill();
          D.spark(ctx, sx, sy, r * 0.5, p.human === 1 ? (c.accent || '#d97757') : p.color, t * 0.8);
        } else {
          const ex = Math.cos(p.ang) * r * 0.22, ey = Math.sin(p.ang) * r * 0.22, px = -Math.sin(p.ang) * r * 0.3, py = Math.cos(p.ang) * r * 0.3;
          ctx.fillStyle = '#fff';
          for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(sx + ex + px * sgn, sy + ey + py * sgn, r * 0.24, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#2b2622';
          for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(sx + ex * 1.8 + px * sgn, sy + ey * 1.8 + py * sgn, r * 0.11, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      }

      function leaderboard() {
        const alive = players.filter(p => p.alive || p.human).slice().sort((a, b) => b.count - a.count);
        lb = alive;
      }

      function render(dt) {
        const c = Ludus.colors(), w = view.w, h = view.h, t = clock + performance.now() / 1000;
        refreshColors(c);
        if (dirty || lastDark !== c.dark || lastAccent !== c.accent) { paintTerritory(c); dirty = false; lastDark = c.dark; lastAccent = c.accent; }
        // camera
        const hum = on ? [meP()] : players.filter(p => p.human && p.alive);
        const follow = hum.length ? hum : players.filter(p => p.human);
        let fx = 0, fy = 0;
        follow.forEach(p => { fx += p.x + Math.cos(p.ang) * 1.5; fy += p.y + Math.sin(p.ang) * 1.5; });
        fx /= follow.length; fy /= follow.length;
        let base = clamp(Math.min(w, h) / 17, 12, 44);
        const lead = Math.max(...follow.map(p => pctOf(p)));
        base *= 1 - 0.26 * Math.min(1, lead / 14);
        if (follow.length > 1) {
          const dx = Math.abs(follow[0].x - follow[1].x) + 9, dy = Math.abs(follow[0].y - follow[1].y) + 9;
          base = Math.min(base, w / dx, (h - 60) / dy);
          base = Math.max(base, 8);
        }
        if (!camInit) { cam.x = fx; cam.y = fy; cam.cp = base; camInit = true; }
        else { const k = api.reduceMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt || 0.016, 0.05)); cam.x += (fx - cam.x) * k; cam.y += (fy - cam.y) * k; cam.cp += (base - cam.cp) * (1 - Math.exp(-3 * Math.min(dt || 0.016, 0.05))); }
        const cp = cam.cp, ox = w / 2 - cam.x * cp, oy = viewOy() - cam.y * cp;
        const wx = x => x * cp + ox, wy = y => y * cp + oy;

        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.fillStyle = c.bg2 || c.bg; ctx.fillRect(0, 0, w, h);
        // world
        ctx.save();
        ctx.translate(ox, oy); ctx.scale(cp, cp);
        const x0 = clamp(Math.floor(cam.x - (w / 2) / cp) - 1, 0, N), x1 = clamp(Math.ceil(cam.x + (w / 2) / cp) + 1, 0, N);
        const y0 = clamp(Math.floor(cam.y - (viewOy()) / cp) - 1, 0, N), y1 = clamp(Math.ceil(cam.y + (h - viewOy()) / cp) + 1, 0, N);
        ctx.fillStyle = c.surface; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.055)'; ctx.lineWidth = 1 / cp;
        ctx.beginPath();
        for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
        for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
        ctx.stroke();
        if (x1 > x0 && y1 > y0) {
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(off, x0 * WP, y0 * WP, (x1 - x0) * WP, (y1 - y0) * WP, x0, y0, x1 - x0, y1 - y0);
        }
        // claim flashes
        for (const f of flashes) {
          const a = (1 - f.t / 0.5) * 0.5;
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          for (const i of f.cells) { const x = i % N, y = Math.floor(i / N); if (x >= x0 && x < x1 && y >= y0 && y < y1) ctx.fillRect(x, y, 1.03, 1.03); }
        }
        // map border
        ctx.strokeStyle = c.dark ? 'rgba(255,255,255,0.28)' : 'rgba(60,40,30,0.35)'; ctx.lineWidth = 0.28; ctx.strokeRect(-0.14, -0.14, N + 0.28, N + 0.28);
        // trails
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of players) {
          if (!p.alive || !p.pts.length) continue;
          ctx.beginPath(); ctx.moveTo(p.pts[0].x, p.pts[0].y);
          for (let k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k].x, p.pts[k].y);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = rgba(shade(p.color, -0.2), 0.35); ctx.lineWidth = 0.62; ctx.stroke();
          ctx.strokeStyle = rgba(shade(p.color, 0.25), 0.85); ctx.lineWidth = 0.46; ctx.stroke();
        }
        // particles
        for (const q of parts) { ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.color; ctx.fillRect(q.x - 0.14, q.y - 0.14, 0.28, 0.28); }
        ctx.globalAlpha = 1;
        ctx.restore();

        // heads (screen space), humans last
        const hr = clamp(cp * 0.46, 7, 20);
        const order = players.filter(p => p.alive).sort((a, b) => a.human - b.human);
        for (const p of order) {
          const sx = wx(p.x), sy = wy(p.y);
          if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) continue;
          drawHead(p, c, sx, sy, hr, t);
          if (!p.human && cp >= 15 && !inHud(sx, sy - hr - 8, w)) {
            ctx.save(); ctx.font = `650 10.5px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 3; ctx.strokeStyle = c.surface; ctx.globalAlpha = 0.85; ctx.lineJoin = 'round'; ctx.strokeText(p.name, sx, sy - hr - 8); ctx.globalAlpha = 1;
            ctx.fillStyle = c.ink2; ctx.fillText(p.name, sx, sy - hr - 8); ctx.restore();
          }
        }
        // off-screen pointers to humans that left the view (friend mode)
        if (friend && !on) {
          for (const p of players) {
            if (!p.human || !p.alive) continue;
            const sx = wx(p.x), sy = wy(p.y);
            if (sx > 10 && sx < w - 10 && sy > 60 && sy < h - 10) continue;
            const px = clamp(sx, 16, w - 16), py = clamp(sy, 64, h - 16), a = Math.atan2(sy - py, sx - px);
            ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.restore();
          }
        }

        drawHud(c, w, h);
        if (!started) readyCard(c, w, h);
        else if (toastT > 0 && toastMsg) {
          const a = Math.min(1, toastT / 0.4);
          ctx.save(); ctx.globalAlpha = a;
          const tw = Math.min(w - 40, 170);
          ctx.fillStyle = c.surface; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
          D.roundRect(ctx, w / 2 - tw / 2, h - 52, tw, 30, 15); ctx.fill(); ctx.shadowColor = 'transparent';
          D.fitText(ctx, toastMsg, w / 2, h - 37, tw - 16, 12.5, c.ink, 700, 10);
          ctx.restore();
        }
        // a lone, gently pulsing ring on your own avatar while waiting to start
        if (!started) {
          for (const p of players) if (p.human && (!on || p === meP())) { const sx = wx(p.x), sy = wy(p.y); ctx.strokeStyle = p.human === 2 ? D.P2 : (c.accent || '#d97757'); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, hr + 6, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        }
      }

      function readyCard(c, w, h) {
        const bw = Math.min(w - 32, 250), bh = 58, y = h * 0.8;
        ctx.save(); ctx.fillStyle = c.surface; ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        D.roundRect(ctx, w / 2 - bw / 2, y - bh / 2, bw, bh, 16); ctx.fill(); ctx.restore();
        D.fitText(ctx, on ? 'Get ready' : friend ? 'P1 WASD  ·  P2 arrows' : 'Move to start', w / 2, y - 10, bw - 24, 15, c.ink, 800, 11);
        D.fitText(ctx, 'Loop back home to claim land', w / 2, y + 12, bw - 24, 11.5, c.ink2, 650, 9.5);
      }

      // Bot name tags are skipped where they would run into the header or the leaderboard.
      let hudRows = 5;
      function inHud(x, y, w) {
        if (y < 62) return true;
        const cw = Math.min(124, (w - 16) * 0.34);
        return x > w - 8 - cw - 34 && y < 62 + hudRows * 17 + 12;
      }
      function drawHud(c, w, h) {
        const hs = players.filter(p => p.human);
        const timeLeft = Math.max(0, TIME_LIMIT - clock), mm = Math.floor(timeLeft / 60), ss = Math.floor(timeLeft % 60);
        const fmt = p => pctOf(p).toFixed(1) + '%';
        let left, right;
        if (on) {   // me against whoever leads among the others
          const me = meP(), lead = players.filter(p => p !== me).sort((a, b) => b.count - a.count)[0];
          left = { who: 'p1', label: me.name, score: fmt(me) };
          right = { who: lead && !lead.human ? 'bot' : 'p2', label: lead ? lead.name : 'Bot', score: lead ? fmt(lead) : '0.0%' };
        } else if (friend) { left = { who: 'p1', label: 'P1', score: fmt(hs[0]) }; right = { who: 'p2', label: 'P2', score: fmt(hs[1]) }; }
        else {
          const lead = players.filter(p => !p.human).sort((a, b) => b.count - a.count)[0];
          left = { who: 'p1', label: 'You', score: fmt(hs[0]) };
          right = { who: 'bot', label: lead ? lead.name : 'Bot', score: lead ? fmt(lead) : '0.0%' };
        }
        const hh = D.duelHeader(ctx, 8, 8, w - 16, { left, right, status: `${mm}:${String(ss).padStart(2, '0')}` }, c);
        // kills + leaderboard under the header, never overlapping each other
        const y0 = 8 + hh + 8;
        lbT -= 0.016; if (lbT <= 0) { lbT = 0.25; leaderboard(); }
        const rowH = 17, cw = Math.min(124, (w - 16) * 0.34);
        let rows = lb.slice(0, 5);
        const me = meP();
        if ((!friend || on) && rows.indexOf(me) < 0 && lb.indexOf(me) >= 0) rows = rows.slice(0, 4).concat([me]);
        const lx = w - 8 - cw; hudRows = rows.length;
        ctx.save();
        ctx.fillStyle = c.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)';
        D.roundRect(ctx, lx, y0, cw, rows.length * rowH + 8, 11); ctx.fill();
        rows.forEach((p, k) => {
          const y = y0 + 4 + k * rowH + rowH / 2, rank = lb.indexOf(p) + 1;
          ctx.fillStyle = p.alive ? p.color : c.line; ctx.beginPath(); ctx.arc(lx + 12, y, 4.2, 0, TAU); ctx.fill();
          ctx.font = `650 10.5px ${FONT}`;
          const label = `${p.human ? p.name : p.name}`;
          D.text(ctx, String(rank), lx + 25, y, 10, c.ink3, 650, 'left');
          D.fitText(ctx, label, lx + 36 + (cw - 36 - 40) / 2, y, cw - 36 - 40, 10.5, p.human ? c.ink : c.ink2, p.human ? 800 : 650, 8);
          D.text(ctx, pctOf(p).toFixed(1), lx + cw - 8, y, 10.5, c.ink2, 650, 'right');
        });
        ctx.restore();
        // kills pill, left under the header
        const k = friend && !on ? null : me.kills;
        if (k) {
          const kw = 64;
          ctx.save(); ctx.fillStyle = c.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)'; D.roundRect(ctx, 8, y0, kw, 24, 12); ctx.fill();
          D.text(ctx, `${k} ${k === 1 ? 'kill' : 'kills'}`, 8 + kw / 2, y0 + 12, 11, c.ink, 700); ctx.restore();
        }
        if (friend) for (const p of hs) if (!p.alive && !finished) { /* the header shows the final share; nothing more to add */ }
      }

      // ---------- lifecycle ----------
      setup();
      if (window.ludusDebug) window.ludusDebug.paperio = {
        state: () => ({ started, clock, finished, N, players: players.map(p => ({ id: p.id, name: p.name, human: p.human, alive: p.alive, x: p.x, y: p.y, ang: p.ang, count: p.count, pct: +pctOf(p).toFixed(2), best: +p.best.toFixed(2), kills: p.kills, trail: p.trail.length, mode: p.ai.mode, why: p.why })) }),
        sim(sec) { started = true; const n = Math.round(sec * 60); for (let k = 0; k < n; k++) update(1 / 60); },
        start() { started = true; },
        players: () => players, owner, tOwner,
        place(id, x, y, ang) { const p = players[id - 1]; p.x = p.lx = x; p.y = p.ly = y; p.cx = Math.floor(x); p.cy = Math.floor(y); p.ang = p.tgt = ang; }
      };
      // ---------- online: the host runs the map; guests steer their own player and draw the host's copy ----------
      let link = null, overDone = false;
      const num = v => typeof v === 'number' && isFinite(v);
      function finishOnline(why, humans, best, winH) {
        if (overDone) return; overDone = true; finished = true;
        const k = humans.indexOf(on.seat + 1), mine = k >= 0 ? best[k] : 0, wp = players.find(p => p.human === winH);
        const rank = 1 + best.filter(b => b > mine).length;
        api.over({ score: Math.round(mine), won: winH === on.seat + 1, title: why === 'full' && wp ? `${wp.name} owns the map` : wp ? `${wp.name} wins` : 'Time is up',
          message: `You held ${mine.toFixed(1)}% at best · ${rank} of ${humans.length}` });
      }
      // a territory row as runs: [row, owner, length, owner, length, ...]
      function rowRuns(r) { const out = [r]; let cur = owner[r * N], n = 0; for (let x = 0; x < N; x++) { const o = owner[r * N + x]; if (o === cur) n++; else { out.push(cur, n); cur = o; n = 1; } } out.push(cur, n); return out; }
      function sendRows() {
        if (!rowsOut.size) return;
        let batch = [], size = 0;
        const flush = () => { if (batch.length) on.send('terr', batch); batch = []; size = 0; };
        Array.from(rowsOut).sort((a, b) => a - b).forEach(r => { const rr = rowRuns(r), len = JSON.stringify(rr).length + 1; if (size + len > 3200) flush(); batch.push(rr); size += len; });
        flush(); rowsOut.clear();
      }
      function applyRows(rows) {
        if (!Array.isArray(rows)) return;
        for (const rr of rows) {
          if (!Array.isArray(rr) || !Number.isInteger(rr[0]) || rr[0] < 0 || rr[0] >= N) continue;
          let x = 0; const r = rr[0];
          for (let k = 1; k + 1 < rr.length && x < N; k += 2) {
            const o = rr[k], n = rr[k + 1]; if (!Number.isInteger(o) || o < 0 || o > players.length || !Number.isInteger(n) || n < 1) break;
            for (let q = 0; q < n && x < N; q++, x++) owner[r * N + x] = o;
          }
        }
        players.forEach(p => { p.count = 0; }); for (let i = 0; i < N * N; i++) if (owner[i]) players[owner[i] - 1].count++;
        dirty = true;
      }
      const r2 = v => Math.round(v * 100) / 100;
      if (on) {
        started = false;
        api.timeout(() => { started = true; }, 1600);   // a moment to find yourself before everyone moves
        link = Ludus.rt(api, {
          hz: 30,
          snapshot: () => { sendRows(); return {
            st: started ? 1 : 0, c: Math.round(clock * 10) / 10, f: finished ? 1 : 0,
            pl: players.map(p => [p.human, p.name, PALETTE.indexOf(p.color)]),
            p: players.map(p => [r2(p.x), r2(p.y), r2(p.ang), p.alive ? 1 : 0, p.trail.length && p.pts.length ? 1 : 0, p.pts.length ? r2(p.pts[0].x) : 0, p.pts.length ? r2(p.pts[0].y) : 0, p.kills, +p.best.toFixed(2)])
          }; },
          input: () => { const p = meP(); return p ? { a: Math.round(ownTarget(p) * 1000) / 1000 } : { a: 0 }; },
          onInput: (seat, d) => { if (num(d.a) && Math.abs(d.a) < 100) remote[seat + 1] = d.a; },
          onState: applyState
        });
        if (!guest) on.onLeave(seat => { const p = players.find(q => q.human === seat + 1); if (p && p.alive) die(p, null, 'left'); });
        if (guest) {
          on.queue((type, d) => {
            if (type === 'terr') { if (!players.length) return false; applyRows(d); }
            else if (type === 'end' && d && Array.isArray(d.best) && d.best.every(num) && ['time', 'full', 'dead'].includes(d.why)) {
              const hs = players.filter(p => p.human); if (hs.length !== d.best.length) return true;
              finishOnline(d.why, hs.map(p => p.human), d.best, d.win);
            }
            return true;
          });
        }
      }
      function applyState(d) {
        if (!Array.isArray(d.pl) || !Array.isArray(d.p) || d.pl.length !== d.p.length || d.pl.length > 16) return;
        if (players.length !== d.pl.length) {   // first copy: build the same list of players as the host
          players = d.pl.map((q, k) => mk(k + 1, Number.isInteger(q[0]) && q[0] >= 0 && q[0] <= 4 ? q[0] : 0, String(q[1] || 'Bot').slice(0, 12), PALETTE[q[2]] || HCOL[q[0]] || PALETTE[k % PALETTE.length]));
          players.forEach(p => { if (p.human > 1) p.color = HCOL[p.human]; });
          refreshColors(Ludus.colors()); camInit = false;
        }
        started = d.st === 1; if (num(d.c)) clock = d.c;
        d.p.forEach((q, k) => {
          const p = players[k]; if (!Array.isArray(q) || !q.slice(0, 3).every(num)) return;
          const wasAlive = p.alive; p.alive = q[3] === 1;
          if (wasAlive && !p.alive) {
            if (!api.reduceMotion) for (let j = 0; j < 18; j++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 5; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.4, t: 0, color: p.color }); }
            if (p === meP()) api.sfx('lose');
          }
          if (q[4] === 1 && p.alive) { if (!p.pts.length && num(q[5]) && num(q[6])) p.pts = [{ x: q[5], y: q[6] }]; }
          else p.pts = [];
          if (Number.isInteger(q[7])) p.kills = q[7];
          if (num(q[8])) p.best = q[8];
        });
        const me = meP(); if (me && me.best > bestPct) { bestPct = me.best; api.score(Math.round(bestPct)); }
      }
      // the guest steers and moves its own player here at once (same speed and turn rate as the host); the host's copy eases it back
      const meL = guest && link ? link.predictor({ pick: s => { const q = Array.isArray(s.p) && s.p[Math.max(0, players.indexOf(meP()))]; return q && num(q[0]) && num(q[1]) ? [q[0], q[1]] : null; }, snap: 4, init: null }) : null;
      let myAng = null;
      function guestUpdate(dt) {
        const sm = link.sample();
        if (sm && Array.isArray(sm.a.p) && Array.isArray(sm.b.p)) {
          const { a, b, t } = sm, M = Ludus.rt.mix;
          players.forEach((p, k) => {
            const qa = a.p[k], qb = b.p[k]; if (!Array.isArray(qb) || !num(qb[0])) return;
            const ok = Array.isArray(qa) && num(qa[0]);
            p.x = ok ? M(qa[0], qb[0], t, 4) : qb[0]; p.y = ok ? M(qa[1], qb[1], t, 4) : qb[1];
            let da = qb[2] - (ok ? qa[2] : qb[2]); da = Math.atan2(Math.sin(da), Math.cos(da)); p.ang = (ok ? qa[2] : qb[2]) + da * t;
            if (p.alive && p.pts.length) { const l = p.pts[p.pts.length - 1]; if (Math.hypot(l.x - p.x, l.y - p.y) > 0.3) p.pts.push({ x: p.x, y: p.y }); }
          });
        }
        const mine = meP(), lat = link.latest();
        if (mine && lat && mine.alive && started && !finished) {
          const tgt = ownTarget(mine); if (myAng !== null) mine.ang = myAng;
          meL.frame(dt, v => {
            mine.tgt = tgt; mine.ang += clamp(angDiff(mine.ang, tgt), -TURN * dt, TURN * dt);
            const d = SPEED * (mine.spd || 1) * dt;
            v[0] = clamp(v[0] + Math.cos(mine.ang) * d, 0.3, N - 0.3); v[1] = clamp(v[1] + Math.sin(mine.ang) * d, 0.3, N - 0.3);
          });
          mine.x = meL.v[0]; mine.y = meL.v[1]; myAng = mine.ang;
        } else if (mine && lat) { myAng = null; const k = players.indexOf(mine), q = lat.p && lat.p[k]; if (q && num(q[0])) meL.set([q[0], q[1]]); }
        for (const q of parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
        parts = parts.filter(q => q.t < q.life);
        if (toastT > 0) toastT -= dt;
      }
      api.loop(dt => { if (guest) guestUpdate(dt); else update(dt); if (link) link.step(); if (players.length) render(dt); });
      return { save() { return on ? { started, alive: players.map(p => p.alive), owned: players.map(p => p.count) } : null; }, pause() { [1, 2].forEach(k => { pad[k].l = pad[k].r = pad[k].u = pad[k].d = 0; }); }, resume() {} };
    }
  });
})();
