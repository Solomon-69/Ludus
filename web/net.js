/* Ludus online play: a tiny MQTT 3.1.1 client over WebSocket, plus rooms on top of it.
   Nothing here runs unless the player chooses "Play online". No account, no server of ours:
   rooms are just a shared channel (topic) on a free public relay, named by a 5 character room code.
   Everything that arrives from the network is treated as untrusted: it is parsed as JSON only, checked for
   type and size, and never run as code or put into the page as HTML.

   Layers
     Mqtt     one connection to a relay, reconnects by itself, tries the next relay when one is down
     Session  a room: who is in it, who is the host, game messages with sequence numbers, heartbeats
     online   what a game sees as api.online (see ONLINE.md)
*/
(function () {
  'use strict';
  const NET = {};

  // Public relays that speak MQTT over a secure WebSocket, tried in this order.
  // A page can set window.__LUDUS_BROKERS__ (a list of URLs) before this file loads; used by the tests.
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
  const KEEP_ALIVE = 30;            // seconds; the relay drops a quiet client after about 1.5x this
  const CONNECT_TIMEOUT = 7000;     // ms to wait for one relay before trying the next
  const HEARTBEAT = 4000;           // ms between "I am still here" messages
  const PEER_TIMEOUT = 16000;       // ms of silence before a player (or the host) counts as gone
  const MAX_PACKET = 4096;          // bytes of one game message, in and out
  const HISTORY = 300;              // sent game messages kept so a lost one can be sent again
  const QUEUE_LIMIT = 100;          // messages held while the connection is down
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I, L, O, 0 or 1: nothing that looks like something else
  const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
  const TYPE_RE = /^[A-Za-z0-9_.-]{1,24}$/;
  const MAX_SEATS = 8;
  const PV = 2;                     // protocol version: 1 = Ludus 1.6.0/1.6.1 (one game per room), 2 = tournaments. Only ever added as optional fields; the wire version v stays 1.
  const SERIES_PAUSE = 6000;        // ms the scoreboard stays up between rounds before the host starts the next one
  const RESULT_WAIT = 4000;         // ms the host waits for every player's round result
  const gameOf = id => { const L = window.Ludus; return L && L.games && L.games.find(g => g.id === id && g.online); };

  NET.brokers = () => (Array.isArray(window.__LUDUS_BROKERS__) && window.__LUDUS_BROKERS__.length ? window.__LUDUS_BROKERS__ : BROKERS);
  NET.WebSocket = null;             // tests can put a fake here; null means the browser's own
  NET.ALPHABET = ALPHABET;
  NET.cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  NET.validCode = s => CODE_RE.test(s);
  // Finds a room code in whatever was typed or pasted: the bare code, an invite message, or a ludus://join/CODE link.
  NET.extractCode = text => {
    const t = String(text || '').toUpperCase().slice(0, 400);
    let m = t.match(/LUDUS:\/\/JOIN\/([A-Z0-9]{5})(?![A-Z0-9])/);
    if (m && CODE_RE.test(m[1])) return m[1];
    m = t.match(/CODE\W{0,3}([A-Z0-9]{5})(?![A-Z0-9])/);
    if (m && CODE_RE.test(m[1])) return m[1];
    return t.split(/[^A-Z0-9]+/).find(w => CODE_RE.test(w)) || '';
  };
  NET.inviteText = (gameName, code) => 'Play ' + gameName + ' with me on Ludus. Room code: ' + code + '\nludus://join/' + code;
  NET.cleanName = (s, fallback) => {
    const t = Array.from(String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()).slice(0, 10).join('').trim();
    return t || fallback || '';
  };

  // ---------- small helpers ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  function randBytes(n) {
    const a = new Uint8Array(n);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
    return a;
  }
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  NET.newCode = () => Array.from(randBytes(5), x => ALPHABET[x % ALPHABET.length]).join('');
  // Each relay is a separate world, so everybody in a room must use the same one. The room code decides which:
  // the host makes a code that belongs to the relay it is connected to, and joiners try that relay first.
  NET.codeBroker = (code, n) => { let t = 0; for (const ch of String(code)) t += ch.charCodeAt(0); return n > 0 ? t % n : 0; };
  NET.codeFor = (idx, n) => { for (let i = 0; i < 500; i++) { const c = NET.newCode(); if (NET.codeBroker(c, n) === idx % n) return c; } return NET.newCode(); };
  // A seeded random stream (mulberry32): the same seed gives every player the same numbers.
  NET.prng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // SHA-256 (small, synchronous: the Web Crypto version is not available in every web view). Used by The Decider.
  NET.sha256 = function (message) {
    const bytes = enc.encode(String(message));
    const K = [], H = [];
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
    primes.forEach((p, i) => { K[i] = Math.floor((Math.cbrt(p) % 1) * 4294967296) >>> 0; if (i < 8) H[i] = Math.floor((Math.sqrt(p) % 1) * 4294967296) >>> 0; });
    const len = bytes.length, total = (((len + 9 + 63) >> 6) << 6);
    const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len * 8 / 4294967296));
    const w = new Uint32Array(64);
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
    }
    return H.map(v => v.toString(16).padStart(8, '0')).join('');
  };

  // ---------- MQTT 3.1.1 packets (only what Ludus needs: QoS 0 publish and subscribe) ----------
  function concat(parts) {
    let n = 0; parts.forEach(p => { n += p.length; });
    const out = new Uint8Array(n); let k = 0;
    parts.forEach(p => { out.set(p, k); k += p.length; });
    return out;
  }
  function remLen(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }
  function mstr(s) { const b = enc.encode(s); return concat([[b.length >> 8, b.length & 255], b]); }
  function packet(first, body) { return concat([[first], remLen(body.length), body]); }
  const P = {
    connect: (id) => packet(0x10, concat([mstr('MQTT'), [4, 2, KEEP_ALIVE >> 8, KEEP_ALIVE & 255], mstr(id)])),
    subscribe: (pid, topic) => packet(0x82, concat([[pid >> 8, pid & 255], mstr(topic), [0]])),
    unsubscribe: (pid, topic) => packet(0xA2, concat([[pid >> 8, pid & 255], mstr(topic)])),
    publish: (topic, text) => packet(0x30, concat([mstr(topic), enc.encode(text)])),
    puback: pid => packet(0x40, Uint8Array.of(pid >> 8, pid & 255)),
    ping: () => Uint8Array.of(0xC0, 0),
    disconnect: () => Uint8Array.of(0xE0, 0)
  };
  // Splits a byte stream into whole packets; returns the bytes left over (a packet still arriving).
  function readPackets(buf, onPacket) {
    for (;;) {
      if (buf.length < 2) return buf;
      let mult = 1, rem = 0, i = 1, b;
      do { if (i >= buf.length || i > 4) { if (i > 4) throw new Error('bad length'); return buf; } b = buf[i++]; rem += (b & 127) * mult; mult *= 128; } while (b & 128);
      if (rem > 1 << 20) throw new Error('packet too large');
      if (buf.length < i + rem) return buf;
      onPacket(buf[0], buf.subarray(i, i + rem));
      buf = buf.subarray(i + rem);
    }
  }
  NET._codec = { P, readPackets, concat };   // exposed for the tests

  // ---------- one connection to a relay ----------
  function Mqtt(o) {
    const me = this;
    me.urls = o.urls; me.clientId = o.clientId; me.state = 'connecting';
    me.subs = new Map(); me.outbox = []; me.listeners = []; me.attempt = 0; me.pid = 1;
    me.closed = false; me.ws = null; me.everOnline = false; me.url = '';
    me.idx = o.start || 0; me.curIdx = me.idx % me.urls.length; me.pinned = false;
    me.connect();
  }
  Mqtt.prototype.pin = function () { this.pinned = true; this.idx = this.curIdx; };
  Mqtt.prototype.onState = function (fn) { this.listeners.push(fn); };
  Mqtt.prototype._set = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.listeners.slice().forEach(fn => { try { fn(s); } catch (e) { /* a listener must not break the connection */ } });
  };
  Mqtt.prototype.connect = function () {
    const me = this;
    if (me.closed) return;
    const url = me.urls[me.idx % me.urls.length];
    me.url = url;
    let ws, acked = false, buf = new Uint8Array(0);
    try { ws = new (NET.WebSocket || window.WebSocket)(url, 'mqtt'); } catch (e) { me._lost(false); return; }
    ws.binaryType = 'arraybuffer';
    me.ws = ws;
    const timer = setTimeout(() => { if (!acked) { try { ws.close(); } catch (e) {} } }, CONNECT_TIMEOUT);
    ws.onopen = () => { try { ws.send(P.connect(me.clientId)); } catch (e) {} };
    ws.onmessage = ev => {
      if (me.ws !== ws) return;
      me.lastRx = Date.now();
      try {
        buf = readPackets(concat([buf, new Uint8Array(ev.data)]), (first, body) => {
          const type = first >> 4;
          if (type === 2) {   // CONNACK
            if (body.length >= 2 && body[1] === 0) {
              acked = true; me.attempt = 0; me.everOnline = true; me.curIdx = me.idx % me.urls.length; me.lastRx = Date.now();
              me._startPing(ws);
              me.subs.forEach((fn, topic) => me._raw(P.subscribe(me.pid++ & 0xFFFF || 1, topic)));
              const q = me.outbox; me.outbox = [];
              q.forEach(p => me._raw(p));
              me._set('online');
            } else { try { ws.close(); } catch (e) {} }
          } else if (type === 3) {   // PUBLISH
            const qos = (first >> 1) & 3, tl = (body[0] << 8) | body[1];
            const topic = dec.decode(body.subarray(2, 2 + tl));
            let at = 2 + tl, pid = 0;
            if (qos > 0) { pid = (body[at] << 8) | body[at + 1]; at += 2; }
            if (qos === 1) me._raw(P.puback(pid));
            const fn = me.subs.get(topic);
            if (fn) { try { fn(dec.decode(body.subarray(at))); } catch (e) { /* ignore a handler error */ } }
          }
          // SUBACK, PINGRESP and the rest need no action: lastRx above is what keeps the link alive
        });
      } catch (e) { try { ws.close(); } catch (e2) {} }
    };
    const done = () => {
      clearTimeout(timer);
      if (me.ws !== ws) return;
      me.ws = null; clearInterval(me.pingTimer);
      me._lost(acked);
    };
    ws.onclose = done; ws.onerror = () => { try { ws.close(); } catch (e) {} };
  };
  Mqtt.prototype._startPing = function (ws) {
    const me = this;
    clearInterval(me.pingTimer);
    me.pingTimer = setInterval(() => {
      if (me.ws !== ws) return;
      if (Date.now() - me.lastRx > KEEP_ALIVE * 1500) { try { ws.close(); } catch (e) {} return; }
      me._raw(P.ping());
    }, KEEP_ALIVE * 500);
  };
  Mqtt.prototype._lost = function (wasOnline) {
    const me = this;
    if (me.closed) return;
    if (!me.pinned) me.idx++;   // a room stays on its relay: only a connection still looking for one moves on
    me.attempt++;
    // Never reached a relay after trying them all twice: say offline. Otherwise a drop is "offline" until it recovers.
    if (wasOnline || me.everOnline || me.attempt >= me.urls.length * 2) me._set('offline'); else me._set('connecting');
    const delay = me.attempt < me.urls.length ? 250 : Math.min(6000, 1000 * Math.pow(2, me.attempt - me.urls.length));
    clearTimeout(me.retryTimer);
    me.retryTimer = setTimeout(() => me.connect(), delay);
  };
  Mqtt.prototype._raw = function (bytes) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(bytes); return true; } catch (e) { return false; }
  };
  Mqtt.prototype.subscribe = function (topic, fn) {
    this.subs.set(topic, fn);
    if (this.state === 'online') this._raw(P.subscribe(this.pid++ & 0xFFFF || 1, topic));
  };
  Mqtt.prototype.unsubscribe = function (topic) {
    this.subs.delete(topic);
    if (this.state === 'online') this._raw(P.unsubscribe(this.pid++ & 0xFFFF || 1, topic));
  };
  Mqtt.prototype.publish = function (topic, text, volatile) {
    const p = P.publish(topic, text);
    if (this.state === 'online' && this._raw(p)) return true;
    if (volatile) return false;                 // live game state: an old copy is worthless, never queue it
    this.outbox.push(p); if (this.outbox.length > QUEUE_LIMIT) this.outbox.shift();
    return false;
  };
  Mqtt.prototype.close = function () {
    this.closed = true;
    clearInterval(this.pingTimer); clearTimeout(this.retryTimer);
    const ws = this.ws; this.ws = null;
    if (ws) { try { ws.send(P.disconnect()); } catch (e) {} setTimeout(() => { try { ws.close(); } catch (e) {} }, 60); }
    this._set('offline');
    this.listeners = [];
  };
  NET.Mqtt = Mqtt;

  // ---------- rooms ----------
  /* Messages are JSON objects on one topic per room: ludus/v1/<CODE>/m
       v:1 (version)  c: sender's random id   t: kind   q: game message number   r: round (rematch count)
     kinds: join, welcome, rej, roster (inside hb), hb, bye, start, nack, rematch, g (a game message: k = its type, d = its data)
  */
  const topicOf = code => 'ludus/v1/' + code + '/m';
  function cleanRoster(list) {
    if (!Array.isArray(list) || list.length > MAX_SEATS) return null;
    const out = [], seats = new Set(), ids = new Set();
    for (const e of list) {
      if (!Array.isArray(e) || e.length !== 3) return null;
      const [s, n, c] = e;
      if (!Number.isInteger(s) || s < 0 || s >= MAX_SEATS || typeof n !== 'string' || typeof c !== 'string' || c.length > 16 || seats.has(s) || ids.has(c)) return null;
      seats.add(s); ids.add(c);
      out.push({ seat: s, name: NET.cleanName(n, 'Player ' + (s + 1)), cid: c });
    }
    return out;
  }

  function Session(role, opts) {
    const me = this;
    me.role = role; me.gameId = String(opts.gameId || ''); me.min = opts.min | 0 || 2; me.max = opts.max | 0 || 2;
    me.cid = hex(randBytes(6));
    me.baseName = NET.cleanName(opts.name, '');
    me.code = ''; me.seat = role === 'host' ? 0 : -1; me.hostCid = role === 'host' ? me.cid : '';
    me.roster = new Map();      // seat -> { seat, name, cid }
    me.seen = {};               // cid -> last time we heard from them
    me.conn = 'connecting';
    me.ev = {};
    me.started = false; me.gen = 0; me.seed = 0;
    me.sq = 0; me.history = []; me.rxq = {}; me.nackAt = {}; me.pending = [];
    me.active = null;           // the api.online of the running game
    // tournaments (protocol 2): the host's plan, the series in progress, and what the other side speaks
    me.flex = role === 'host' && opts.flex !== false;     // a room whose games the host may pick
    me.plan = { g: me.gameId ? [me.gameId] : [], n: 1 }; // games to play (in order) and rounds per game (0 = tournament: every game once)
    me.ser = null;              // { gs, gi, ri, n, st: play|board|final, sc: [[cid, name, wins]], why }
    me.peerPv = {};             // host: cid -> protocol version they announced (missing = 1)
    me.legacy = false;          // host: somebody on an older Ludus is here; guest: the host is on an older Ludus
    me.rmin = me.min; me.rmax = me.max;   // the room's own seat limits (a game for one older player shrinks them)
    me.gmin = me.min; me.gmax = me.max;   // seats the running game wants (the room may be bigger)
    me.over = false;            // closed or left
    me.ready = false;           // host: code claimed; guest: accepted into the room
    const urls = NET.brokers();
    me.client = new Mqtt({ urls, clientId: 'ludus_' + hex(randBytes(8)), start: role === 'guest' ? NET.codeBroker(opts.code, urls.length) : 0 });
    me.client.onState(s => me._conn(s));
    me.lastHost = Date.now();
    me.tick = setInterval(() => me._tick(), HEARTBEAT);
    me.guard = setTimeout(() => { if (!me.ready && !me.over && me.conn !== 'online') me._fail('offline'); }, 14000);
    me.candidate = role === 'host' ? '' : opts.code;
    me._begin();
  }
  Session.prototype.on = function (ev, fn) {
    (this.ev[ev] = this.ev[ev] || []).push(fn);
    return () => { this.ev[ev] = (this.ev[ev] || []).filter(f => f !== fn); };
  };
  Session.prototype._emit = function (ev, data) {
    (this.ev[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { setTimeout(() => { throw e; }); } });
  };
  Session.prototype._fail = function (code) {
    if (this.over) return;
    this.over = true; this._stop();
    this._emit('error', { code });
  };
  Session.prototype._close = function (reason) {
    if (this.over) return;
    this.over = true; this._stop();
    if (this.active) this.active._left(null, null, true);
    this._emit('closed', { reason });
  };
  Session.prototype._stop = function () {
    clearInterval(this.tick); clearTimeout(this.guard); clearInterval(this.claimTimer); clearInterval(this.joinTimer); clearTimeout(this.claimWait);
    const c = this.client;
    setTimeout(() => c.close(), 120);
  };
  Session.prototype._conn = function (s) {
    this.conn = s;
    if (s === 'online') {   // after a drop everybody gets a fresh grace period
      const now = Date.now(); this.lastHost = now; Object.keys(this.seen).forEach(k => { this.seen[k] = now; });
    }
    this._emit('conn', s);
    if (s === 'online' && !this.subscribed) { this.subscribed = true; this._subscribeCandidate(); }
  };
  Session.prototype._begin = function () {
    if (this.client.state === 'online') this._conn('online');
  };
  Session.prototype._subscribeCandidate = function () {
    const me = this;
    if (me.role === 'host') me.candidate = NET.codeFor(me.client.curIdx, me.client.urls.length);
    const topic = topicOf(me.candidate);
    me.client.subscribe(topic, txt => me._recv(txt));
    if (me.role === 'host') {
      // Listen for a moment: if somebody is already hosting this code, pick another.
      me.collision = false;
      me.claimWait = setTimeout(() => {
        if (me.over) return;
        if (me.collision) {
          me.client.unsubscribe(topic); me.candidate = NET.newCode(); me._subscribeCandidate(); return;
        }
        me.code = me.candidate; me.ready = true; me.client.pin();
        me.roster.set(0, { seat: 0, name: me._nameFor(0), cid: me.cid });
        me._emit('ready', { code: me.code });
        me._emit('roster', me.rosterList());
      }, 1100);
    } else {
      me.code = me.candidate; me.tries = 0;
      const ask = () => {
        if (me.over || me.ready || me.conn !== 'online') return;
        if (++me.tries > 6) { me._fail('no-room'); return; }
        me._pub({ t: 'join', n: me.baseName, g: me.gameId, pv: PV });
      };
      me.joinTimer = setInterval(ask, 1000);
      ask();
    }
  };
  Session.prototype._nameFor = function (seat) { return this.baseName || 'Player ' + (seat + 1); };
  Session.prototype.rosterList = function () { return Array.from(this.roster.values()).sort((a, b) => a.seat - b.seat); };
  Session.prototype.count = function () { return this.roster.size; };
  Session.prototype._hbObj = function () {
    const o = { t: 'hb', q: this.sq, p: this._rosterWire(), mx: this.max, mn: this.min, g: this.gameId, gen: this.gen, sd: this.seed, pv: PV };
    if (this.flex) { o.tn = { g: this.plan.g, n: this.plan.n }; if (this.legacy) o.lg = 1; }
    if (this.ser) o.sr = this._srWire();
    return o;
  };
  Session.prototype._rosterWire = function () { return this.rosterList().map(p => [p.seat, p.name, p.cid]); };

  Session.prototype._pub = function (obj) {
    if (this.over && obj.t !== 'bye') return false;
    obj.v = 1; obj.c = this.cid;
    let text;
    try { text = JSON.stringify(obj); } catch (e) { return false; }
    if (text.length > MAX_PACKET) return false;
    return this.client.publish(topicOf(this.code || this.candidate), text);
  };

  // A heartbeat from everyone; the host's also carries the roster and the game state, so a lost message heals itself.
  Session.prototype._tick = function () {
    if (this.over || this.conn !== 'online') return;
    const now = Date.now();
    if (this.role === 'host') {
      if (!this.ready) return;
      this.roster.forEach((p, seat) => {
        if (seat !== 0 && now - (this.seen[p.cid] || 0) > PEER_TIMEOUT) this._removeSeat(seat, 'timeout');
      });
      this._pub(this._hbObj());
    } else {
      if (this.ready) this._pub({ t: 'hb', q: this.sq, pv: PV });
      if (this.ready && now - this.lastHost > PEER_TIMEOUT) this._close('host-lost');
    }
  };
  Session.prototype._removeSeat = function (seat, why) {
    const p = this.roster.get(seat);
    if (!p) return;
    this.roster.delete(seat);
    delete this.rxq[p.cid];
    delete this.peerPv[p.cid];
    if (this.role === 'host') {
      if (this.legacy && !Object.keys(this.peerPv).some(c => this.peerPv[c] < 2)) { this.legacy = false; this.min = this.rmin; this.max = this.rmax; this._emit('legacy', { on: false }); this._emit('plan', this.plan); }
      this._pub(this._hbObj());
    }
    this._emit('roster', this.rosterList());
    if (this.started && this.active) this.active._left(seat, p.name, false);
    this._emit('left', { seat, name: p.name, why });
    if (this.role === 'host' && this.ser) this._afterLeave();
  };

  Session.prototype._recv = function (txt) {
    if (this.over || typeof txt !== 'string' || txt.length > MAX_PACKET + 600) return;
    let m;
    try { m = JSON.parse(txt); } catch (e) { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || m.v !== 1 || typeof m.c !== 'string' || m.c.length > 16 || m.c === this.cid) return;
    this.seen[m.c] = Date.now();
    if (m.c === this.hostCid) this.lastHost = Date.now();
    switch (m.t) {
      case 'join': return this.role === 'host' ? this._onJoin(m) : undefined;
      case 'welcome': return this._onWelcome(m);
      case 'rej': if (m.to === this.cid && !this.ready) { this._fail(m.why === 'full' || m.why === 'started' || m.why === 'game' || m.why === 'update' ? m.why : 'no-room'); } return;
      case 'hb': return this._onHb(m);
      case 'bye': return this._onBye(m);
      case 'start': return this._onStart(m);
      case 'nack': return this._onNack(m);
      case 'rematch': if (this.role === 'host') this._emit('rematch', { name: this._senderName(m.c) }); return;
      case 'tr': return this._onResult(m);
      case 'sb': return this._onBoard(m);
      case 'lob': return m.c === this.hostCid ? this._toLobbyLocal() : undefined;
      case 'g': return this._onGame(m);
      case 'f': return this._onFast(m);
    }
  };
  Session.prototype._senderName = function (cid) {
    for (const p of this.roster.values()) if (p.cid === cid) return p.name;
    return '';
  };
  Session.prototype._seatOf = function (cid) {
    for (const p of this.roster.values()) if (p.cid === cid) return p.seat;
    return -1;
  };

  // ----- host side -----
  Session.prototype._onJoin = function (m) {
    if (!this.ready) return;
    const reply = (extra) => this._pub(Object.assign({ t: 'rej', to: m.c }, extra));
    const pv = Number.isInteger(m.pv) ? m.pv : 1, existing0 = this._seatOf(m.c);
    // Tournament rooms let the host pick the games, so a newer player's game is not checked. An older player (1.6.x) can only
    // play the room's one game: the room drops to a single game for as long as they are in it.
    if (pv >= 2 && this.flex) { /* any game */ }
    else if (m.g && m.g !== this.gameId) {
      const g = gameOf(m.g);
      if (!(this.flex && pv < 2 && g && existing0 < 0 && !this.started && this.roster.size === 1 && !this.legacy)) { if (pv < 2) this._emit('oldpeer', { why: 'game' }); return reply({ why: 'game' }); }
      this.plan = { g: [m.g], n: 1 }; this.gameId = m.g; this._emit('plan', this.plan);
    }
    const existing = existing0;
    if (existing < 0) {
      if (this.started) { if (pv < 2) this._emit('oldpeer', { why: 'started' }); return reply({ why: 'started' }); }
      if (pv < 2 && this.flex && !this.legacy) {
        const g = gameOf(this.gameId);
        if (g && this.roster.size >= g.online.max) { this._emit('oldpeer', { why: 'full' }); return reply({ why: 'full' }); }
        if (g) { this.max = g.online.max; this.min = g.online.min; }
        this.plan = { g: [this.gameId], n: 1 }; this.legacy = true; this.ser = null; this.gmin = this.min; this.gmax = this.max;
        this._emit('legacy', { on: true });
      } else if (pv < 2 && this.flex) this.legacy = true;
      if (this.roster.size >= this.max) return reply({ why: 'full' });
      this.peerPv[m.c] = pv;
      let seat = 1; while (this.roster.has(seat)) seat++;
      this.roster.set(seat, { seat, name: NET.cleanName(m.n, 'Player ' + (seat + 1)), cid: m.c });
      this._emit('roster', this.rosterList());
    }
    const seat = this._seatOf(m.c);
    const w = { t: 'welcome', to: m.c, s: seat, p: this._rosterWire(), mx: this.max, mn: this.min, g: this.gameId, pv: PV };
    if (this.flex) { w.tn = { g: this.plan.g, n: this.plan.n }; if (this.legacy) w.lg = 1; }
    this._pub(w);
    this._pub(this._hbObj());
  };
  // Host: begin the game (or a rematch / the next round). Needs at least `min` players.
  Session.prototype.start = function () {
    if (this.role !== 'host' || this.over) return false;
    if (this.isSeries()) {
      if (this.ser && this.ser.st === 'board') return this.advance();
      if (this.ser && this.ser.st === 'play') return false;
      const gs = this.plan.g.filter(id => this._fits(id));
      if (!gs.length) return false;
      this.ser = { gs, gi: 0, ri: 0, n: this.plan.n || 1, st: 'play', sc: this.rosterList().map(p => [p.cid, p.name, 0]), why: '', rep: {} };
      return this._beginRound();
    }
    if (this.flex && !this.legacy) {
      const g = gameOf(this.gameId);
      if (!g || !this._fits(this.gameId)) return false;
      this.gmin = g.online.min; this.gmax = g.online.max; this._closeGaps();
    } else { if (this.roster.size < this.min) return false; this.gmin = this.min; this.gmax = this.max; }
    this.started = true; this.gen++; this.seed = (randBytes(4).reduce((a, b) => a * 256 + b, 0)) >>> 0;
    this._pub({ t: 'start', gen: this.gen, sd: this.seed, p: this._rosterWire(), g: this.gameId, gm: [this.gmin, this.gmax] });
    this._emit('start', { gen: this.gen, seed: this.seed, game: this.gameId });
    return true;
  };
  // ----- tournaments (host decides, everyone follows the host's copy) -----
  Session.prototype.isSeries = function () { return this.flex && !this.legacy && (this.plan.g.length > 1 || this.plan.n !== 1 || !!this.ser); };
  Session.prototype._fits = function (id, n) { const g = gameOf(id), c = n === undefined ? this.roster.size : n; return !!g && g.online.min <= c && c <= g.online.max; };
  // the games of the plan that the players in the room can play right now
  Session.prototype.playable = function () { return this.plan.g.filter(id => this._fits(id)); };
  Session.prototype.setPlan = function (games, n) {
    if (this.role !== 'host' || this.legacy || !this.flex || this.over || (this.started && this.ser && this.ser.st !== 'final')) return false;
    const g = (games || []).filter((id, i, a) => typeof id === 'string' && gameOf(id) && a.indexOf(id) === i).slice(0, 12);
    if (!g.length) return false;
    this.plan = { g, n: n === 0 ? 0 : [1, 3, 5].includes(n) ? n : 1 }; this.gameId = g[0];
    this._emit('plan', this.plan);
    this._pub(this._hbObj());
    return true;
  };
  Session.prototype._setPlan = function (tn) {
    if (!tn || !Array.isArray(tn.g) || tn.g.length > 12 || !tn.g.every(x => typeof x === 'string' && TYPE_RE.test(x)) || ![0, 1, 3, 5].includes(tn.n)) return;
    if (JSON.stringify(tn) === JSON.stringify(this.plan)) return;
    this.plan = { g: tn.g.slice(), n: tn.n }; this._emit('plan', this.plan);
  };
  Session.prototype._srWire = function () { const s = this.ser; return { st: s.st, gs: s.gs, gi: s.gi, ri: s.ri, n: s.n, sc: s.sc, why: s.why || '' }; };
  Session.prototype._applySr = function (sr) {
    if (this.role === 'host' || !sr || typeof sr !== 'object' || !['play', 'board', 'final'].includes(sr.st) || !Array.isArray(sr.gs) || sr.gs.length > 12 || !sr.gs.every(x => typeof x === 'string' && TYPE_RE.test(x))) return;
    if (!Number.isInteger(sr.gi) || !Number.isInteger(sr.ri) || !Number.isInteger(sr.n) || !Array.isArray(sr.sc) || sr.sc.length > MAX_SEATS) return;
    const sc = [];
    for (const e of sr.sc) { if (!Array.isArray(e) || e.length !== 3 || typeof e[0] !== 'string' || e[0].length > 16 || typeof e[1] !== 'string' || !Number.isInteger(e[2]) || e[2] < 0 || e[2] > 99) return; sc.push([e[0], NET.cleanName(e[1], 'Player'), e[2]]); }
    const next = { st: sr.st, gs: sr.gs.slice(), gi: sr.gi, ri: sr.ri, n: sr.n, sc, why: typeof sr.why === 'string' ? sr.why.slice(0, 12) : '' };
    const before = this.ser, same = before && JSON.stringify(before) === JSON.stringify(next);
    if (same) return;
    this.ser = next;
    this._emit('series', next);
    if (!before || before.st !== next.st) { if (next.st === 'board') this._emit('board', next); else if (next.st === 'final') this._emit('final', next); }
    else if (next.st === 'board' && JSON.stringify(before.sc) !== JSON.stringify(next.sc)) this._emit('board', next);
  };
  Session.prototype._toLobbyLocal = function () { if (!this.ser && !this.started) return; this.ser = null; this.started = false; this._emit('lobby', {}); };
  Session.prototype._closeGaps = function () {
    const list = this.rosterList();
    if (list.every((p, i) => p.seat === i)) return;
    this.roster = new Map(list.map((p, i) => [i, Object.assign({}, p, { seat: i })]));
    this._emit('roster', this.rosterList());
  };
  Session.prototype._beginRound = function () {
    const ser = this.ser, id = ser.gs[ser.gi], g = gameOf(id);
    if (!g) return false;
    this._closeGaps();
    ser.st = 'play'; ser.rep = {}; clearTimeout(ser.t1); clearTimeout(ser.t2);
    this.rosterList().forEach(p => { if (!ser.sc.some(e => e[0] === p.cid)) ser.sc.push([p.cid, p.name, 0]); });
    this.started = true; this.gen++; this.seed = (randBytes(4).reduce((a, b) => a * 256 + b, 0)) >>> 0;
    this.gameId = id; this.gmin = g.online.min; this.gmax = g.online.max;
    this._pub({ t: 'start', gen: this.gen, sd: this.seed, p: this._rosterWire(), g: id, gm: [this.gmin, this.gmax], sr: this._srWire() });
    this._emit('start', { gen: this.gen, seed: this.seed, game: id });
    this._emit('series', this.ser);
    return true;
  };
  // every screen tells the host whether this player won the round; the host adds it all up
  Session.prototype.reportResult = function (won) {
    if (this.over || !this.ser) return;
    if (this.role === 'host') this._onResult({ c: this.cid, gen: this.gen, w: won ? 1 : 0 });
    else this._pub({ t: 'tr', gen: this.gen, w: won ? 1 : 0 });
  };
  Session.prototype._onResult = function (m) {
    const ser = this.ser;
    if (this.role !== 'host' || !ser || ser.st !== 'play' || m.gen !== this.gen || this._seatOf(m.c) < 0) return;
    ser.rep[m.c] = m.w === 1 ? 1 : 0;
    clearTimeout(ser.t1); ser.t1 = setTimeout(() => this._roundDone(), RESULT_WAIT);   // do not wait for ever for somebody who stopped answering
    this._checkRound();
  };
  Session.prototype._checkRound = function () {
    const ser = this.ser;
    if (!ser || ser.st !== 'play' || !Object.keys(ser.rep).length) return;
    if (this.rosterList().every(p => ser.rep[p.cid] !== undefined)) this._roundDone();
  };
  Session.prototype._roundDone = function () {
    const ser = this.ser;
    if (!ser || ser.st !== 'play') return;
    clearTimeout(ser.t1);
    ser.sc.forEach(e => { if (ser.rep[e[0]] === 1) e[2]++; });
    ser.st = 'board';
    this._announce('board');
    ser.t2 = setTimeout(() => this.advance(), SERIES_PAUSE);
  };
  Session.prototype._announce = function (ev) {
    this._pub({ t: 'sb', sr: this._srWire() }); this._pub(this._hbObj());
    this._emit('series', this.ser); this._emit(ev, this.ser);
  };
  // next round, next game, or the final standings
  Session.prototype.advance = function () {
    const ser = this.ser;
    if (this.role !== 'host' || !ser || ser.st !== 'board') return false;
    clearTimeout(ser.t2);
    let gi = ser.gi, ri = ser.ri + 1;
    if (ri >= ser.n) { ri = 0; gi++; }
    while (gi < ser.gs.length && !this._fits(ser.gs[gi])) { gi++; ri = 0; }
    if (gi >= ser.gs.length) { this._finalize(gi >= ser.gs.length && ser.gs.slice(ser.gi + 1).some(id => !this._fits(id)) ? 'few' : ''); return true; }
    ser.gi = gi; ser.ri = ri;
    return this._beginRound();
  };
  Session.prototype._finalize = function (why) {
    const ser = this.ser; if (!ser) return;
    clearTimeout(ser.t1); clearTimeout(ser.t2);
    ser.st = 'final'; ser.why = why || ''; this.started = false;
    this._announce('final');
  };
  // somebody left a running tournament: carry on if the game still has enough players, otherwise show the standings so far
  Session.prototype._afterLeave = function () {
    const ser = this.ser; if (!ser || ser.st === 'final') return;
    const g = gameOf(ser.gs[ser.gi]), n = this.roster.size;
    if (n < 2 || (ser.st === 'play' && g && n < g.online.min)) { this._finalize('left'); return; }
    if (ser.st === 'play') this._checkRound();
    else this._pub(this._hbObj());
  };
  Session.prototype.rematchSeries = function () { if (this.ser && this.ser.st === 'final') { this.ser = null; return this.start(); } return false; };
  Session.prototype.toLobby = function () {
    if (this.role !== 'host' || !this.ser) return false;
    clearTimeout(this.ser.t1); clearTimeout(this.ser.t2);
    this.ser = null; this.started = false; this._pub({ t: 'lob' }); this._pub(this._hbObj()); this._emit('lobby', {});
    return true;
  };
  Session.prototype._onBoard = function (m) { if (this.role !== 'host' && m.c === this.hostCid) this._applySr(m.sr); };
  Session.prototype.requestRematch = function () { this._pub({ t: 'rematch' }); };

  // ----- guest side -----
  Session.prototype._onWelcome = function (m) {
    if (this.role === 'host' || m.to !== this.cid || this.ready) return;
    const list = cleanRoster(m.p);
    if (!list || !Number.isInteger(m.s) || m.s < 1 || m.s >= MAX_SEATS || !list.some(p => p.seat === m.s && p.cid === this.cid)) return;
    if (Number.isInteger(m.mp) && m.mp > PV) { this._fail('update'); return; }   // the host needs a newer Ludus than this one
    clearInterval(this.joinTimer);
    this.hostPv = Number.isInteger(m.pv) ? m.pv : 1; this.legacy = this.hostPv < 2;
    if (m.tn) this._setPlan(m.tn);
    this.oldPeer = m.lg === 1;
    this.seat = m.s; this.hostCid = m.c; this.lastHost = Date.now(); this.ready = true; this.client.pin();
    if (!this.gameId && typeof m.g === 'string' && TYPE_RE.test(m.g)) this.gameId = m.g;
    this.max = Math.max(2, Math.min(MAX_SEATS, m.mx | 0)); this.min = Math.max(2, Math.min(this.max, m.mn | 0)); this.gmin = this.min; this.gmax = this.max;
    this._setRoster(list);
    this._emit('ready', { code: this.code });
  };
  Session.prototype._setRoster = function (list) {
    this.roster = new Map(list.map(p => [p.seat, p]));
    list.forEach(p => { if (!this.seen[p.cid]) this.seen[p.cid] = Date.now(); if (p.cid === this.cid && this.role !== 'host') this.seat = p.seat; });
    this._emit('roster', this.rosterList());
  };
  Session.prototype._onHb = function (m) {
    const seat = this._seatOf(m.c);
    // someone else is hosting the code we wanted: pick another
    if (this.role === 'host' && !this.ready && Array.isArray(m.p)) { this.collision = true; return; }
    if (typeof m.q === 'number' && seat >= 0) this._maybeNack(m.c, m.q);
    if (this.role === 'host' || !this.ready || m.c !== this.hostCid) return;
    const list = cleanRoster(m.p);
    if (!list) return;
    const before = Array.from(this.roster.values()).map(p => p.cid).join();
    const gone = Array.from(this.roster.values()).filter(p => !list.some(q => q.cid === p.cid));
    if (!list.some(p => p.cid === this.cid)) { this._close('removed'); return; }
    if (before !== list.map(p => p.cid).join() || list.length !== this.roster.size) {
      this.roster = new Map(list.map(p => [p.seat, p]));
      list.forEach(p => { if (!this.seen[p.cid]) this.seen[p.cid] = Date.now(); });
      this._emit('roster', this.rosterList());
      gone.forEach(p => { delete this.rxq[p.cid]; if (this.started && this.active) this.active._left(p.seat, p.name, false); this._emit('left', { seat: p.seat, name: p.name, why: 'gone' }); });
    }
    this.hostPv = Number.isInteger(m.pv) ? m.pv : 1; this.legacy = this.hostPv < 2;
    if (m.tn) this._setPlan(m.tn);
    if ((m.lg === 1) !== !!this.oldPeer) { this.oldPeer = m.lg === 1; this._emit('plan', this.plan); }
    if (m.sr) this._applySr(m.sr); else if (this.ser && this.ser.st === 'final') this._toLobbyLocal();
    if (m.gen > this.gen && Number.isInteger(m.gen) && Number.isInteger(m.sd)) this._startFrom(m.gen, m.sd, m.g);
  };
  Session.prototype._onStart = function (m) {
    if (this.role === 'host' || m.c !== this.hostCid || !Number.isInteger(m.gen) || !Number.isInteger(m.sd)) return;
    const list = cleanRoster(m.p);
    if (list) this._setRoster(list);
    if (Array.isArray(m.gm) && m.gm.length === 2 && m.gm.every(Number.isInteger)) { this.gmin = Math.max(2, m.gm[0]); this.gmax = Math.min(MAX_SEATS, m.gm[1]); }
    if (m.sr) this._applySr(m.sr);
    this._startFrom(m.gen, m.sd, m.g);
  };
  Session.prototype._startFrom = function (gen, seed, game) {
    if (gen <= this.gen) return;
    if (typeof game === 'string' && TYPE_RE.test(game)) this.gameId = game;
    this.started = true; this.gen = gen; this.seed = seed >>> 0;
    this._emit('start', { gen, seed: this.seed, game: this.gameId });
  };
  Session.prototype._onBye = function (m) {
    if (m.c === this.hostCid && this.role !== 'host') { this._close('host-left'); return; }
    const seat = this._seatOf(m.c);
    if (seat > 0 && this.role === 'host') this._removeSeat(seat, 'left');
  };

  // ----- game messages -----
  Session.prototype.send = function (type, data, to) {
    if (this.over || !this.ready || !TYPE_RE.test(String(type))) return false;
    const m = { t: 'g', k: String(type), d: data === undefined ? null : data, q: ++this.sq, r: this.gen };
    if (to !== undefined) m.to = to;
    m.v = 1; m.c = this.cid;
    let text;
    try { text = JSON.stringify(m); } catch (e) { this.sq--; return false; }
    if (text.length > MAX_PACKET) { this.sq--; return false; }
    this.history.push({ q: m.q, text }); if (this.history.length > HISTORY) this.history.shift();
    this.client.publish(topicOf(this.code), text);
    return true;
  };
  // Fast messages: not numbered, never sent again, dropped when the line is down. For live action games that
  // send their state many times a second, where only the newest copy matters (see ONLINE.md, "Real-time games").
  Session.prototype.sendFast = function (type, data, to) {
    if (this.over || !this.ready || !TYPE_RE.test(String(type))) return false;
    const m = { t: 'f', k: String(type), d: data === undefined ? null : data, r: this.gen, v: 1, c: this.cid };
    if (to !== undefined) m.to = to;
    let text;
    try { text = JSON.stringify(m); } catch (e) { return false; }
    if (text.length > MAX_PACKET) return false;
    return this.client.publish(topicOf(this.code), text, true);
  };
  Session.prototype._onFast = function (m) {
    const seat = this._seatOf(m.c);
    if (seat < 0 || typeof m.k !== 'string' || !TYPE_RE.test(m.k) || m.r !== this.gen || !this.active) return;
    if (m.to !== undefined && m.to !== this.seat) return;
    this.active._deliverFast({ type: m.k, data: m.d === undefined ? null : m.d, from: seat });
  };
  Session.prototype._maybeNack = function (cid, theirLast) {
    const have = this.rxq[cid] || 0, now = Date.now();
    if (theirLast > have && now - (this.nackAt[cid] || 0) > 1500) {
      this.nackAt[cid] = now;
      this._pub({ t: 'nack', to: cid, f: have + 1 });
    }
  };
  Session.prototype._onNack = function (m) {
    if (m.to !== this.cid || !Number.isInteger(m.f)) return;
    let n = 0;
    for (const h of this.history) if (h.q >= m.f && n++ < 100) this.client.publish(topicOf(this.code), h.text);
  };
  Session.prototype._onGame = function (m) {
    const seat = this._seatOf(m.c);
    if (seat < 0 || typeof m.k !== 'string' || !TYPE_RE.test(m.k) || !Number.isInteger(m.q) || m.q < 1) return;
    const last = this.rxq[m.c] || 0;
    if (m.q <= last) return;                                       // already have it
    if (m.q > last + 1) { this._maybeNack(m.c, m.q); return; }     // a message before it went missing: ask for it again
    this.rxq[m.c] = m.q;
    if (m.to !== undefined && m.to !== this.seat) return;          // meant for somebody else
    const r = Number.isInteger(m.r) ? m.r : 0;
    if (r < this.gen) return;                                       // from an earlier round
    const item = { type: m.k, data: m.d === undefined ? null : m.d, from: seat };
    if (r > this.gen || !this.active) { this.pending.push({ r, item }); if (this.pending.length > 200) this.pending.shift(); return; }
    this.active._deliver(item);
  };

  Session.prototype.leave = function () {
    if (this.over) return;
    this._pub({ t: 'bye' });
    this.over = true; this._stop();
    if (this.active) this.active._left(null, null, true);
    this.ev = {};
  };

  // What a game sees as api.online. One per round; dispose() when the game is destroyed.
  Session.prototype.makeOnline = function () {
    const s = this, handlers = {}, leaves = [], inbox = [];
    let queueFn = null, timer = 0, disposed = false;
    const rng = NET.prng(s.seed);
    const pump = () => {
      while (queueFn && inbox.length && !disposed) {
        const head = inbox[0];
        let ok = true;
        try { ok = queueFn(head.type, head.data, head.from); } catch (e) { ok = true; setTimeout(() => { throw e; }); }
        if (ok === false && Date.now() - head.at < 15000) return;
        inbox.shift();
      }
    };
    const o = {
      code: s.code, seat: s.seat, min: s.gmin, max: s.gmax, isHost: s.role === 'host', gen: s.gen,
      get count() { return s.roster.size; },
      get names() { const a = []; for (let i = 0; i < s.gmax; i++) { const p = s.roster.get(i); a.push(p ? p.name : ''); } return a; },
      get connected() { return s.conn === 'online' && !s.over; },
      send(type, data) { return s.send(type, data); },
      sendTo(seat, type, data) { return Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS ? s.send(type, data, seat) : false; },
      sendFast(type, data) { return s.sendFast(type, data); },
      sendFastTo(seat, type, data) { return Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS ? s.sendFast(type, data, seat) : false; },
      get seats() { return Array.from(s.roster.keys()).sort((a, b) => a - b); },
      on(type, fn) {
        (handlers[type] = handlers[type] || []).push(fn);
        return () => { handlers[type] = (handlers[type] || []).filter(f => f !== fn); };
      },
      queue(fn) { queueFn = fn; if (!timer) timer = setInterval(pump, 40); pump(); },
      rand() { return rng(); },
      randInt(a, b) { return a + Math.floor(rng() * (b - a + 1)); },
      onLeave(fn) { leaves.push(fn); },
      dispose() { disposed = true; clearInterval(timer); if (s.active === o) s.active = null; },
      _deliver(item) {
        if (disposed) return;
        const hs = handlers[item.type];
        if (hs && hs.length) { hs.slice().forEach(fn => { try { fn(item.data, item.from); } catch (e) { setTimeout(() => { throw e; }); } }); return; }
        inbox.push({ type: item.type, data: item.data, from: item.from, at: Date.now() });
        pump();
      },
      // fast messages only go to on() handlers; with no handler they are dropped (never queued)
      _deliverFast(item) {
        if (disposed) return;
        (handlers[item.type] || []).slice().forEach(fn => { try { fn(item.data, item.from); } catch (e) { setTimeout(() => { throw e; }); } });
      },
      _left(seat, name, closed) { if (disposed) return; leaves.slice().forEach(fn => { try { fn(seat, name, closed); } catch (e) { setTimeout(() => { throw e; }); } }); }
    };
    s.active = o;
    // messages from players who started the round a moment before us
    const keep = [];
    s.pending.forEach(p => { if (p.r === s.gen) o._deliver(p.item); else if (p.r > s.gen) keep.push(p); });
    s.pending = keep;
    return o;
  };

  // ---------- public entry points ----------
  NET.createRoom = opts => new Session('host', opts || {});
  NET.joinRoom = (code, opts) => new Session('guest', Object.assign({}, opts, { code }));
  NET.Session = Session;
  window.Ludus.net = NET;
})();
