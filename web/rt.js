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
  L.rt = function (api, o) {
    const on = api.online;
    if (!on) return null;
    const hz = Math.max(5, Math.min(30, o.hz || 18)), inHz = Math.max(5, Math.min(30, o.inputHz || 20));
    const delay = o.delay || 1000 / hz * 1.7;   // draw a little in the past so there is a copy on each side
    const buf = [];
    let lastSend = 0, lastIn = '', lastInAt = 0;
    if (on.isHost) {
      on.on('in', (d, from) => { if (from > 0 && d && typeof d === 'object' && !Array.isArray(d) && o.onInput) o.onInput(from, d); });
    } else {
      on.on('st', (d, from) => {
        if (from !== 0 || !d || typeof d !== 'object' || Array.isArray(d)) return;
        buf.push({ at: performance.now(), s: d }); if (buf.length > 24) buf.shift();
        if (o.onState) o.onState(d);
      });
    }
    return {
      host: on.isHost, seat: on.seat,
      step() {
        const now = performance.now();
        if (on.isHost) {
          if (now - lastSend < 1000 / hz) return;
          lastSend = now;
          const s = o.snapshot && o.snapshot();
          if (s) on.sendFast('st', s);
        } else if (o.input) {
          const i = o.input(), k = JSON.stringify(i);
          // send on every change (at most inHz a second) and again every 200 ms in case one was lost
          if ((k !== lastIn && now - lastInAt >= 1000 / inHz) || now - lastInAt > 200) { lastIn = k; lastInAt = now; on.sendFastTo(0, 'in', i); }
        }
      },
      sample() {
        if (!buf.length) return null;
        const rt = performance.now() - delay, last = buf[buf.length - 1];
        if (rt >= last.at) return { a: last.s, b: last.s, t: 1 };
        for (let i = buf.length - 2; i >= 0; i--) {
          if (buf[i].at <= rt) { const a = buf[i], b = buf[i + 1]; return { a: a.s, b: b.s, t: clamp01((rt - a.at) / Math.max(1, b.at - a.at)) }; }
        }
        return { a: buf[0].s, b: buf[0].s, t: 0 };
      },
      latest() { return buf.length ? buf[buf.length - 1].s : null; }
    };
  };
  // Smooth a number between two state copies; a big jump (a wrap or a respawn) snaps instead of sliding.
  L.rt.mix = (a, b, t, snap) => (typeof a !== 'number' || typeof b !== 'number') ? b : (snap && Math.abs(b - a) > snap ? b : a + (b - a) * t);
  // Names for the four seats, for headers and results ("Ann", or "P2" when a name is missing).
  L.rt.seatName = (api, seat) => { const n = api.online && api.online.names[seat]; return n || 'P' + (seat + 1); };
})();
