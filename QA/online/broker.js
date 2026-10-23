// Minimal in-memory MQTT 3.1.1 broker over a plain WebSocket (no internet). Tests only.
// broker.latency = { base, jitter }: one-way delay per receiver in ms, order per receiver kept (like TCP).
const http = require('http'), crypto = require('crypto');
function start(port = 0) {
  const conns = new Set();
  const api = { conns, filter: null, published: 0, latency: null };
  const server = http.createServer((q, r) => { r.statusCode = 404; r.end(); });
  server.on('upgrade', (req, sock) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n');
    const c = { sock, subs: new Set(), wsbuf: Buffer.alloc(0), mq: Buffer.alloc(0) };
    conns.add(c);
    c.send = buf => {
      if (sock.destroyed) return;
      const n = buf.length; const h = n < 126 ? Buffer.from([0x82, n]) : Buffer.from([0x82, 126, n >> 8, n & 255]);
      sock.write(Buffer.concat([h, buf]));
    };
    const rl = n => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
    api.rawFrame = (topic, text) => { const t = Buffer.from(topic), body = Buffer.concat([Buffer.from([t.length >> 8, t.length & 255]), t, Buffer.from(text)]); return Buffer.concat([Buffer.from([0x30, ...rl(body.length)]), body]); };
    const onMqtt = (first, body) => {
      const type = first >> 4;
      if (type === 1) c.send(Buffer.from([0x20, 2, 0, 0]));
      else if (type === 8) {
        const pid = body.subarray(0, 2); let at = 2;
        while (at < body.length) { const l = body.readUInt16BE(at); c.subs.add(body.subarray(at + 2, at + 2 + l).toString()); at += 2 + l + 1; }
        c.send(Buffer.concat([Buffer.from([0x90, 3]), pid, Buffer.from([0])]));
      } else if (type === 10) {
        const pid = body.subarray(0, 2); let at = 2;
        while (at < body.length) { const l = body.readUInt16BE(at); c.subs.delete(body.subarray(at + 2, at + 2 + l).toString()); at += 2 + l; }
        c.send(Buffer.concat([Buffer.from([0xB0, 2]), pid]));
      } else if (type === 3) {
        const tl = body.readUInt16BE(0), topic = body.subarray(2, 2 + tl).toString(), payload = body.subarray(2 + tl).toString();
        api.published++;
        if (api.filter && api.filter(topic, payload, c) === false) return;
        const raw = Buffer.concat([Buffer.from([0x30, ...rl(body.length)]), body]);
        conns.forEach(o => {
          if (!o.subs.has(topic)) return;
          if (!api.latency) return o.send(raw);
          const at = Math.max(o.lastAt || 0, Date.now() + api.latency.base + Math.random() * api.latency.jitter);
          o.lastAt = at; setTimeout(() => o.send(raw), at - Date.now());
        });
      } else if (type === 12) c.send(Buffer.from([0xD0, 0]));
      else if (type === 14) sock.end();
    };
    const parseMqtt = () => {
      for (;;) {
        const b = c.mq; if (b.length < 2) return;
        let mult = 1, rem = 0, i = 1, x;
        do { if (i >= b.length) return; x = b[i++]; rem += (x & 127) * mult; mult *= 128; } while (x & 128);
        if (b.length < i + rem) return;
        onMqtt(b[0], b.subarray(i, i + rem)); c.mq = b.subarray(i + rem);
      }
    };
    sock.on('data', d => {
      c.wsbuf = Buffer.concat([c.wsbuf, d]);
      for (;;) {
        const b = c.wsbuf; if (b.length < 2) return;
        const op = b[0] & 15; let len = b[1] & 127, at = 2;
        if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); at = 4; }
        const masked = b[1] & 128; if (b.length < at + (masked ? 4 : 0) + len) return;
        const mask = masked ? b.subarray(at, at + 4) : null; if (masked) at += 4;
        const data = Buffer.from(b.subarray(at, at + len)); if (mask) for (let k = 0; k < len; k++) data[k] ^= mask[k & 3];
        c.wsbuf = b.subarray(at + len);
        if (op === 2) { c.mq = Buffer.concat([c.mq, data]); parseMqtt(); } else if (op === 8) sock.end();
      }
    });
    sock.on('close', () => conns.delete(c)); sock.on('error', () => conns.delete(c));
  });
  api.dropAll = () => conns.forEach(c => c.sock.destroy());
  return new Promise(res => server.listen(port, '127.0.0.1', () => { api.port = server.address().port; api.close = () => { api.dropAll(); server.close(); }; res(api); }));
}
module.exports = { start };
