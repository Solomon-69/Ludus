/* Ludus real-time link for online action games (Paddle Duel, Air Hockey, Tag, Worm Arena, Land Claim).
   The host's screen runs the game and sends a compact copy of the state up to 20 times a second ("fast"
   messages: never repeated, dropped when the line is down, only the newest matters). Every guest sends
   its controls to the host and draws the host's state, smoothed between the last two copies it got.

   const link = Ludus.rt(api, {
     hz: 18,                              // state copies per second (host)
     snapshot: () => ({...}),             // host: compact JSON state, kept well under 4 KB
     input: () => ({...}),                // guest: this screen's controls right now (small JSON)
     onInput: (seat, input) => {},        // host: a guest's controls arrived (validate them!)
     onState: state => {}                 // guest: a new state copy arrived (optional)
   });
   link.step()     every frame (sends what is due)
   link.sample()   guest: { a, b, t } two state copies and how far between them to draw (0..1), or null
   link.latest()   guest: newest state copy or null
   link.lead()     guest: ms from the newest copy to the host's "now" (for drawing something fast where it is now, e.g. a puck)
   link.rtt()      guest: round trip to the host in ms (smoothed), or 0 before it is known
   Returns null when the game is not online. See ONLINE.md, "Real-time games".
*/
(function () {
  const L = window.Ludus;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const META = { _i: 1, _f: 1, _b: 1, _ts: 1 };
  L.rt = function (api, o) {
    const on = api.online;
    if (!on) return null;
    const hz = Math.max(5, Math.min(20, o.hz || 20)), inHz = Math.max(5, Math.min(40, o.inputHz || 30));
    const baseDelay = o.delay || 100;           // draw about 100 ms in the past (more when the line is jittery) so there is a copy on each side
    /* The guest's playback clock (1.12.17). Every copy carries the host's clock (_ts). off = the guest clock minus the host clock
       on the quickest delivery of the last few seconds (clock offset plus the shortest trip); spread = how much later than that a
       copy usually is (90th percentile). The guest draws the world at host time rc, which runs smoothly with the guest's own
       frames and is only nudged towards "newest copy minus delay"; delay = one copy interval and a half plus the spread, so there
       is nearly always a copy on each side to blend between. If copies still run out, rc slows to half speed and the last motion
       is carried on for at most 100 ms, instead of freezing and then jumping ahead. */
    let delay = baseDelay, off = null, rc = null, rcAt = 0;
    const xs = [], gaps = [];                    // recent (arrival - host time) values, for off and the spread
    const MAXX = o.extrapolate == null ? 100 : o.extrapolate;   // when copies run late, carry on at the last speed for up to this many ms
    const t0 = performance.now(), buf = [];
    let lastInStr = '', lastSend = 0, lastInAt = 0, lastInObj = null, sentCount = 0, fullId = 0, fullStr = null, latest = null, base = null, newest = null;
    let newestTs = -Infinity, rttMin = 0, rttAvg = 0;   // guest: host time of the newest copy; round trip (quickest seen, creeping up) and average
    const acks = {};                            // host: seat -> { t: guest clock stamp of its newest input, at: when it arrived here }
    const lastIn = {};                          // host: seat -> the guest's full controls so far (deltas are merged into it)
    if (on.isHost) {
      on.on('in', (d, from) => {
        if (!(from > 0) || !d || typeof d !== 'object' || Array.isArray(d)) return;
        const m = Object.assign({}, d.f === 1 ? {} : lastIn[from], d); delete m.f;
        if (Number.isFinite(m.t)) acks[from] = { t: m.t, at: performance.now() };
        delete m.t; lastIn[from] = m;
        if (o.onInput) o.onInput(from, m);
      });
    } else {
      on.on('st', (d, from) => {
        if (from !== 0 || !d || typeof d !== 'object' || Array.isArray(d)) return;
        // a copy older than one we already have (the relay reordered them) or a duplicate: only the newest matters
        if (Number.isFinite(d._ts)) { if (d._ts <= newestTs) return; }
        let st;
        if (d._f !== 1 && d._b === undefined) { st = Object.assign({}, d); base = null; }   // a plain copy from a Ludus 1.6.x host
        else if (d._f === 1) { st = Object.assign({}, d); base = { id: d._i, obj: st }; }
        else if (base && d._b === base.id) st = Object.assign({}, base.obj, d);
        // the full copy this change is based on was lost: build on the newest copy instead of freezing until the next full one
        // (everything that changed since that full copy is in the change itself, so this is right for all but a moment)
        else if (newest) st = Object.assign({}, newest, d);
        else return;
        Object.keys(META).forEach(k => delete st[k]);
        newest = st;
        if (Number.isFinite(d._ts)) newestTs = d._ts;
        const now = performance.now();
        // round trip: the host echoes the stamp of our newest controls and how long it held them
        const ak = d.ak && d.ak[on.seat];
        if (Array.isArray(ak) && ak.length === 2 && ak.every(Number.isFinite)) {
          const r = (now - t0) - ak[0] - ak[1];
          if (r > 0 && r < 5000) { rttMin = rttMin ? Math.min(r, rttMin + 0.5) : r; rttAvg = rttAvg ? rttAvg + (r - rttAvg) * 0.1 : r; }
        }
        // place the copy on the host's own timeline, so copies that arrive bunched up (jitter) are still drawn evenly spaced
        let ts;
        if (Number.isFinite(d._ts)) {
          ts = d._ts;
          xs.push(now - ts); if (xs.length > 90) xs.shift();
          off = Math.min.apply(null, xs);
          const sorted = xs.slice().sort((a, b) => a - b), spread = sorted[Math.floor(sorted.length * 0.9)] - off;
          if (buf.length) { gaps.push(Math.max(1, ts - buf[buf.length - 1].ts)); if (gaps.length > 30) gaps.shift(); }
          const gs = gaps.slice().sort((a, b) => a - b), gap = gs.length ? gs[Math.floor(gs.length * 0.75)] : 1000 / hz;   // the usual interval (a lost copy does not count)
          const want = Math.max(baseDelay, Math.min(320, gap * 1.5 + spread * 1.1 + 10));
          delay += (want - delay) * (want > delay ? 0.25 : 0.02);   // grows quickly when the line gets worse, shrinks slowly
        } else {   // a copy without the host's clock (Ludus 1.6.x host): place it by arrival
          if (off === null) off = 0;
          ts = now - off;
        }
        if (buf.length && ts <= buf[buf.length - 1].ts) ts = buf[buf.length - 1].ts + 0.5;
        buf.push({ ts, s: st }); if (buf.length > 40) buf.shift();
        if (o.onState) o.onState(st);
      });
    }
    const link = {
      host: on.isHost, seat: on.seat,
      step() {
        const now = performance.now();
        if (on.isHost) {
          if (now - lastSend < 1000 / hz - 2) return;
          lastSend = now;
          const s = o.snapshot && o.snapshot();
          if (!s) return;
          const ak = {}; Object.keys(acks).forEach(k => { ak[k] = [acks[k].t, Math.round(now - acks[k].at)]; });
          if (on.legacy) { on.sendFast('st', s); return; }   // 1.6.x guests only understand plain full copies
          s.ak = ak; s._ts = Math.round(now);
          // Only what changed since the last full copy goes out; a full copy about every 10th time heals a lost one.
          const strs = {}; Object.keys(s).forEach(k => { strs[k] = JSON.stringify(s[k]); });
          if (!fullStr || sentCount++ % 10 === 0) { fullStr = strs; fullId = (fullId + 1) % 1000000; on.sendFast('st', Object.assign({ _f: 1, _i: fullId }, s)); }
          else {
            const dl = { _b: fullId };
            Object.keys(s).forEach(k => { if (k === 'ak' || k === '_ts' || strs[k] !== fullStr[k]) dl[k] = s[k]; });
            on.sendFast('st', dl);
          }
        } else if (o.input) {
          const i = o.input(), idle = now - lastInAt;
          if (on.legacy) { const k = JSON.stringify(i); if ((k !== lastInStr && idle >= 1000 / inHz) || idle > 200) { lastInStr = k; lastInAt = now; on.sendFastTo(0, 'in', i); } return; }
          // only the controls that changed (at most inHz a second); every 150 ms the full set again in case one was lost
          // controls are tiny, so a change goes out as the full set (a lost message never leaves a key stuck), at most inHz a
          // second, and the full set again every 100 ms anyway (it also carries the clock stamp for the round trip)
          const changed = !lastInObj || Object.keys(i).some(k => JSON.stringify(i[k]) !== JSON.stringify(lastInObj[k]));
          if (idle > 100 || (changed && idle >= 1000 / inHz)) { lastInAt = now; lastInObj = i; on.sendFastTo(0, 'in', Object.assign({ f: 1, t: Math.round(now - t0) }, i)); }
        }
      },
      /* The guest's view of the other things: { a, b, t } two copies and how far between (0..1). When the newest copy is
         late, t goes past 1 (up to the extrapolate limit) so things keep moving at their last speed instead of freezing. */
      sample() {
        if (!buf.length) return null;
        const now = performance.now(), n = buf.length, last = buf[n - 1];
        const target = now - off - delay;           // host time to draw: the newest copy minus the delay
        if (rc === null) rc = target;
        else {
          const dt = Math.min(100, now - rcAt);
          rc += rc > last.ts ? dt * 0.5 : dt;       // ran out of copies: slow down rather than run ahead
          const e = target - rc;
          if (Math.abs(e) > 400) rc = target;       // a long stall or a clock jump: start again
          else rc += e * Math.min(1, dt / 300);     // otherwise drift gently back onto the target
        }
        rcAt = now;
        if (rc >= last.ts) {
          if (n < 2) return { a: last.s, b: last.s, t: 1 };
          const p = buf[n - 2], span = Math.max(1, last.ts - p.ts);
          return { a: p.s, b: last.s, t: 1 + Math.min(MAXX, rc - last.ts) / span };
        }
        for (let i = n - 2; i >= 0; i--) {
          if (buf[i].ts <= rc) { const a = buf[i], b = buf[i + 1]; return { a: a.s, b: b.s, t: clamp01((rc - a.ts) / Math.max(1, b.ts - a.ts)) }; }
        }
        return { a: buf[0].s, b: buf[0].s, t: 0 };
      },
      delay() { return Math.round(delay); },
      latest() { return buf.length ? buf[buf.length - 1].s : null; },
      rtt() { return Math.round(rttAvg); },
      // ms between the newest copy and the host's present moment: time since it would have arrived on the quickest path,
      // plus that quickest one-way trip (half the quickest round trip; 40 ms until one is measured). Capped at 300 ms.
      lead() {
        if (!buf.length) return 0;
        const oneWay = rttMin ? rttMin / 2 : 40;
        return Math.max(0, Math.min(300, performance.now() - off - buf[buf.length - 1].ts + oneWay));
      },
      /* Client-side prediction for the guest's OWN thing (a paddle, a player). The game moves it every frame from the
         local controls, so it answers on the very next frame; when the host's copy arrives it is compared with where
         this screen had the thing at the same moment and the difference is eased away (a snap only when it is big).
           const me = link.predictor({ pick: s => [s.y[1]], snap: 60 });
           me.frame(dt, v => { v[0] += ... });     // v is the thing's numbers; returns them
         */
      predictor(po) {
        const hist = [], corr = [], rate = po.rate || 14;
        let v = (po.init || [0]).slice(), seen = null, ready = !!po.init;
        const clock = () => performance.now() - t0;
        return {
          get v() { return v; },
          set(vec) { v = vec.slice(); ready = true; hist.length = 0; corr.length = 0; },
          frame(dt, advance) {
            if (newest && newest !== seen) {
              seen = newest;
              const srv = po.pick(newest), ak = newest.ak && newest.ak[on.seat];
              if (Array.isArray(srv) && srv.length === v.length && srv.every(Number.isFinite)) {
                if (!ready) { v = srv.slice(); ready = true; }
                else if (Array.isArray(ak) && hist.length) {
                  const T = ak[0] + ak[1];
                  let h = hist[hist.length - 1];
                  for (let i = 0; i < hist.length; i++) if (hist[i].t >= T) { const a = hist[Math.max(0, i - 1)], b = hist[i], f = b.t > a.t ? (T - a.t) / (b.t - a.t) : 1; h = { v: a.v.map((x, k) => x + (b.v[k] - x) * Math.max(0, Math.min(1, f))) }; break; }
                  const err = srv.map((x, k) => x - h.v[k]);
                  if (Math.max.apply(null, err.map(Math.abs)) > (po.snap || 80)) { v = srv.slice(); hist.length = 0; corr.length = 0; }
                  else { for (let k = 0; k < err.length; k++) corr[k] = err[k]; }
                }
              }
            }
            advance(v, dt);
            const kf = 1 - Math.exp(-dt * rate);
            for (let k = 0; k < v.length; k++) {
              const c = (corr[k] || 0) * kf;
              if (c) { v[k] += c; corr[k] -= c; hist.forEach(h => { h.v[k] += c; }); }
            }
            hist.push({ t: clock(), v: v.slice() });
            while (hist.length && hist[0].t < clock() - 2500) hist.shift();
            return v;
          }
        };
      }
    };
    return link;
  };
  // Smooth a number between two state copies; a big jump (a wrap or a respawn) snaps instead of sliding.
  L.rt.mix = (a, b, t, snap) => (typeof a !== 'number' || typeof b !== 'number') ? b : (snap && Math.abs(b - a) > snap ? b : a + (b - a) * t);
  // Names for the four seats, for headers and results ("Ann", or "P2" when a name is missing).
  L.rt.seatName = (api, seat) => { const n = api.online && api.online.names[seat]; return n || 'P' + (seat + 1); };
})();
