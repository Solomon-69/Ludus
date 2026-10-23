/* Ludus real-time link for online action games (Pong, Air Hockey, Tag, Slither.io, Paper.io).
   The host's screen runs the game and sends a compact copy of the state ~15-20 times a second ("fast"
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
   Returns null when the game is not online. See ONLINE.md, "Real-time games".
*/
(function () {
  const L = window.Ludus;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const META = { _i: 1, _f: 1, _b: 1, _ts: 1 };
  L.rt = function (api, o) {
    const on = api.online;
    if (!on) return null;
    const hz = Math.max(5, Math.min(30, o.hz || 24)), inHz = Math.max(5, Math.min(40, o.inputHz || 30));
    const baseDelay = o.delay || 100;           // draw about 100 ms in the past (more when the line is jittery) so there is a copy on each side
    let delay = baseDelay, off = null, jit = 0;  // off: guest clock minus host clock at the quickest delivery seen; jit: how late a typical copy is beyond that
    const MAXX = o.extrapolate == null ? 150 : o.extrapolate;   // when copies run late, carry on at the last speed for up to this many ms
    const t0 = performance.now(), buf = [];
    let lastSend = 0, lastInAt = 0, lastInObj = null, sentCount = 0, fullId = 0, fullStr = null, latest = null, base = null, newest = null;
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
        let st;
        if (d._f === 1) { st = Object.assign({}, d); base = { id: d._i, obj: st }; }
        else if (base && d._b === base.id) st = Object.assign({}, base.obj, d);
        else return;                            // a change on top of a full copy we never got: wait for the next full one
        Object.keys(META).forEach(k => delete st[k]);
        newest = st;
        // place the copy on the host's own timeline, so copies that arrive bunched up (jitter) are still drawn evenly spaced
        const now = performance.now();
        let at = now;
        if (Number.isFinite(d._ts)) {
          const x = now - d._ts;
          off = off === null ? x : Math.min(x, off + 0.1);   // follows the quickest copies; creeps up slowly so a clock drift cannot stick
          jit += (Math.max(0, x - off) - jit) * 0.08;
          delay = baseDelay + Math.min(200, jit * 1.4);
          at = d._ts + off;
        }
        if (buf.length && at <= buf[buf.length - 1].at) at = buf[buf.length - 1].at + 0.5;
        buf.push({ at, s: st }); if (buf.length > 30) buf.shift();
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
          // only the controls that changed (at most inHz a second); every 150 ms the full set again in case one was lost
          if (idle > 150 || !lastInObj) { lastInAt = now; lastInObj = i; on.sendFastTo(0, 'in', Object.assign({ f: 1, t: Math.round(now - t0) }, i)); }
          else if (idle >= 1000 / inHz) {
            const dl = {}; let any = false;
            Object.keys(i).forEach(k => { if (JSON.stringify(i[k]) !== JSON.stringify(lastInObj[k])) { dl[k] = i[k]; any = true; } });
            if (any) { lastInAt = now; lastInObj = i; dl.t = Math.round(now - t0); on.sendFastTo(0, 'in', dl); }
          }
        }
      },
      /* The guest's view of the other things: { a, b, t } two copies and how far between (0..1). When the newest copy is
         late, t goes past 1 (up to the extrapolate limit) so things keep moving at their last speed instead of freezing. */
      sample() {
        if (!buf.length) return null;
        const rt = performance.now() - delay, n = buf.length, last = buf[n - 1];
        if (rt >= last.at) {
          if (n < 2) return { a: last.s, b: last.s, t: 1 };
          const p = buf[n - 2], span = Math.max(1, last.at - p.at);
          return { a: p.s, b: last.s, t: 1 + Math.min(MAXX, rt - last.at) / span };
        }
        for (let i = n - 2; i >= 0; i--) {
          if (buf[i].at <= rt) { const a = buf[i], b = buf[i + 1]; return { a: a.s, b: b.s, t: clamp01((rt - a.at) / Math.max(1, b.at - a.at)) }; }
        }
        return { a: buf[0].s, b: buf[0].s, t: 0 };
      },
      latest() { return buf.length ? buf[buf.length - 1].s : null; },
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
