/* Chess: full rules (castling, en passant, promotion, check, mate, stalemate, repetition, 50-move rule) against a bot
   with four levels, a friend on the same screen, or a friend online. The bot thinks in a background worker so the
   board never stutters; if the page cannot start a worker it thinks on the page with a short time limit instead.
   The engine below is written for Ludus (MIT), no outside code. */
(function () {
  'use strict';

  // ======================================================================================================
  // Engine. Self-contained on purpose: its source text is also started as a Web Worker, so it must not use
  // anything from outside this function.
  // ======================================================================================================
  function CORE() {
    'use strict';
    const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
    const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
    const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14], K_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
    const B_DIR = [15, 17, -15, -17], R_DIR = [1, -1, 16, -16], Q_DIR = B_DIR.concat(R_DIR);
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const enc = (f, t, pr, fl) => f | (t << 7) | (pr << 14) | (fl << 17);
    const mFrom = m => m & 127, mTo = m => (m >> 7) & 127, mPromo = m => (m >> 14) & 7, mFlags = m => (m >> 17) & 15;
    const sqName = s => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
    const sqOf = n => { if (typeof n !== 'string' || n.length !== 2) return -1; const f = n.charCodeAt(0) - 97, r = n.charCodeAt(1) - 49; return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 16 + f : -1; };

    // ---------- hashing (two 32-bit Zobrist keys) ----------
    let seed = 0x2545F491;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    const ZL = new Int32Array(12 * 128), ZH = new Int32Array(12 * 128);
    for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
    const ZCL = new Int32Array(16), ZCH = new Int32Array(16), ZEL = new Int32Array(8), ZEH = new Int32Array(8);
    for (let i = 0; i < 16; i++) { ZCL[i] = rnd(); ZCH[i] = rnd(); }
    for (let i = 0; i < 8; i++) { ZEL[i] = rnd(); ZEH[i] = rnd(); }
    const ZSL = rnd(), ZSH = rnd();
    const zi = pc => (pc > 0 ? pc - 1 : 5 - pc) * 128;
    // castling rights kept after a move touches a square
    const CM = new Uint8Array(128).fill(15);
    CM[0] = 13; CM[7] = 14; CM[4] = 12; CM[112] = 7; CM[119] = 11; CM[116] = 3;

    const newPos = () => ({ b: new Int8Array(128), side: 1, castle: 0, ep: -1, half: 0, full: 1, ksq: [4, 116], hl: 0, hh: 0, stack: [], hist: [] });
    function rehash(p) {
      let hl = 0, hh = 0;
      for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const pc = p.b[s]; if (pc) { hl ^= ZL[zi(pc) + s]; hh ^= ZH[zi(pc) + s]; } }
      hl ^= ZCL[p.castle]; hh ^= ZCH[p.castle];
      if (p.ep >= 0) { hl ^= ZEL[p.ep & 7]; hh ^= ZEH[p.ep & 7]; }
      if (p.side === -1) { hl ^= ZSL; hh ^= ZSH; }
      p.hl = hl; p.hh = hh;
    }
    // en passant only counts (for hashing and repetition) when a pawn of the side to move can really take
    const epUseful = (p, ep) => { const s = ep - 16 * p.side; return [s - 1, s + 1].some(x => !(x & 0x88) && p.b[x] === P * p.side); };
    function loadFen(fen) {
      const p = newPos(), parts = String(fen || START).trim().split(/\s+/);
      const rows = (parts[0] || '').split('/');
      if (rows.length !== 8) return null;
      const map = { p: P, n: N, b: B, r: R, q: Q, k: K };
      for (let i = 0; i < 8; i++) {
        let f = 0; const r = 7 - i;
        for (const ch of rows[i]) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const t = map[ch.toLowerCase()]; if (!t || f > 7) return null;
          const pc = ch === ch.toLowerCase() ? -t : t; p.b[r * 16 + f] = pc;
          if (t === K) p.ksq[pc > 0 ? 0 : 1] = r * 16 + f;
          f++;
        }
        if (f !== 8) return null;
      }
      p.side = parts[1] === 'b' ? -1 : 1;
      const c = parts[2] || '-';
      p.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
      const ep = sqOf(parts[3]); p.ep = ep >= 0 && epUseful(p, ep) ? ep : -1;
      p.half = parseInt(parts[4], 10) || 0; p.full = parseInt(parts[5], 10) || 1;
      rehash(p);
      return p;
    }
    function fen(p) {
      const names = ' pnbrqk'; let out = '';
      for (let r = 7; r >= 0; r--) {
        let e = 0;
        for (let f = 0; f < 8; f++) {
          const pc = p.b[r * 16 + f];
          if (!pc) { e++; continue; }
          if (e) { out += e; e = 0; }
          const ch = names[Math.abs(pc)]; out += pc > 0 ? ch.toUpperCase() : ch;
        }
        if (e) out += e;
        if (r) out += '/';
      }
      const c = (p.castle & 1 ? 'K' : '') + (p.castle & 2 ? 'Q' : '') + (p.castle & 4 ? 'k' : '') + (p.castle & 8 ? 'q' : '');
      return out + ' ' + (p.side === 1 ? 'w' : 'b') + ' ' + (c || '-') + ' ' + (p.ep >= 0 ? sqName(p.ep) : '-') + ' ' + p.half + ' ' + p.full;
    }

    // ---------- attacks and move generation ----------
    function attacked(p, sq, by) {
      const b = p.b;
      if (by === 1) { if (!((sq - 15) & 0x88) && b[sq - 15] === P) return true; if (!((sq - 17) & 0x88) && b[sq - 17] === P) return true; }
      else { if (!((sq + 15) & 0x88) && b[sq + 15] === -P) return true; if (!((sq + 17) & 0x88) && b[sq + 17] === -P) return true; }
      for (let i = 0; i < 8; i++) { const t = sq + N_OFF[i]; if (!(t & 0x88) && b[t] === N * by) return true; }
      for (let i = 0; i < 8; i++) { const t = sq + K_OFF[i]; if (!(t & 0x88) && b[t] === K * by) return true; }
      for (let i = 0; i < 4; i++) {
        const d = B_DIR[i]; let t = sq + d;
        while (!(t & 0x88)) { const v = b[t]; if (v) { if (v === B * by || v === Q * by) return true; break; } t += d; }
      }
      for (let i = 0; i < 4; i++) {
        const d = R_DIR[i]; let t = sq + d;
        while (!(t & 0x88)) { const v = b[t]; if (v) { if (v === R * by || v === Q * by) return true; break; } t += d; }
      }
      return false;
    }
    const inCheck = p => attacked(p, p.ksq[p.side === 1 ? 0 : 1], -p.side);
    function addPawn(out, f, t, fl, last, capsOnly) {
      if (!last) { out.push(enc(f, t, 0, fl)); return; }
      out.push(enc(f, t, Q, fl));
      if (!capsOnly) { out.push(enc(f, t, N, fl)); out.push(enc(f, t, R, fl)); out.push(enc(f, t, B, fl)); }
    }
    // pseudo-legal moves (make() rejects the ones that leave the king in check). capsOnly: captures + queen promotions
    function genMoves(p, out, capsOnly) {
      const b = p.b, side = p.side;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const pc = b[sq]; if (pc * side <= 0) continue;
        const t = pc * side;
        if (t === P) {
          const dir = 16 * side, r = sq >> 4, last = r === (side === 1 ? 6 : 1), to = sq + dir;
          if (!b[to] && (!capsOnly || last)) {
            addPawn(out, sq, to, 0, last, capsOnly);
            if (!capsOnly && r === (side === 1 ? 1 : 6) && !b[to + dir]) out.push(enc(sq, to + dir, 0, F_DOUBLE));
          }
          for (let k = -1; k <= 1; k += 2) {
            const c = to + k; if (c & 0x88) continue;
            const v = b[c];
            if (v * side < 0) addPawn(out, sq, c, F_CAP, last, capsOnly);
            else if (c === p.ep) out.push(enc(sq, c, 0, F_CAP | F_EP));
          }
        } else if (t === N || t === K) {
          const offs = t === N ? N_OFF : K_OFF;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i]; if (to & 0x88) continue;
            const v = b[to];
            if (!v) { if (!capsOnly) out.push(enc(sq, to, 0, 0)); } else if (v * side < 0) out.push(enc(sq, to, 0, F_CAP));
          }
          if (t === K && !capsOnly) {
            const base = side === 1 ? 0 : 112, kb = side === 1 ? 1 : 4, qb = side === 1 ? 2 : 8;
            if (sq === base + 4) {
              if ((p.castle & kb) && b[base + 7] === R * side && !b[base + 5] && !b[base + 6] &&
                  !attacked(p, base + 4, -side) && !attacked(p, base + 5, -side) && !attacked(p, base + 6, -side)) out.push(enc(sq, base + 6, 0, F_CASTLE));
              if ((p.castle & qb) && b[base] === R * side && !b[base + 1] && !b[base + 2] && !b[base + 3] &&
                  !attacked(p, base + 4, -side) && !attacked(p, base + 3, -side) && !attacked(p, base + 2, -side)) out.push(enc(sq, base + 2, 0, F_CASTLE));
            }
          }
        } else {
          const dirs = t === B ? B_DIR : t === R ? R_DIR : Q_DIR;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i]; let to = sq + d;
            while (!(to & 0x88)) {
              const v = b[to];
              if (!v) { if (!capsOnly) out.push(enc(sq, to, 0, 0)); }
              else { if (v * side < 0) out.push(enc(sq, to, 0, F_CAP)); break; }
              to += d;
            }
          }
        }
      }
      return out;
    }
    function rookFor(to) { return to === 6 ? [7, 5] : to === 2 ? [0, 3] : to === 118 ? [119, 117] : [112, 115]; }
    // play move m; returns false (and takes it back) if it leaves the mover's king in check
    function make(p, m) {
      const from = mFrom(m), to = mTo(m), pr = mPromo(m), fl = mFlags(m), b = p.b, side = p.side;
      const pc = b[from]; let capSq = to;
      if (fl & F_EP) capSq = to - 16 * side;
      const cap = b[capSq];
      p.stack.push({ m, cap, castle: p.castle, ep: p.ep, half: p.half, hl: p.hl, hh: p.hh });
      p.hist.push(p.hl);
      let hl = p.hl ^ ZL[zi(pc) + from], hh = p.hh ^ ZH[zi(pc) + from];
      if (cap) { b[capSq] = 0; hl ^= ZL[zi(cap) + capSq]; hh ^= ZH[zi(cap) + capSq]; }
      b[from] = 0;
      const np = pr ? pr * side : pc;
      b[to] = np; hl ^= ZL[zi(np) + to]; hh ^= ZH[zi(np) + to];
      if (fl & F_CASTLE) {
        const [rf, rt] = rookFor(to), rk = b[rf];
        b[rf] = 0; b[rt] = rk;
        hl ^= ZL[zi(rk) + rf] ^ ZL[zi(rk) + rt]; hh ^= ZH[zi(rk) + rf] ^ ZH[zi(rk) + rt];
      }
      if (pc * side === K) p.ksq[side === 1 ? 0 : 1] = to;
      hl ^= ZCL[p.castle]; hh ^= ZCH[p.castle];
      p.castle &= CM[from] & CM[to];
      hl ^= ZCL[p.castle]; hh ^= ZCH[p.castle];
      if (p.ep >= 0) { hl ^= ZEL[p.ep & 7]; hh ^= ZEH[p.ep & 7]; }
      p.ep = -1;
      p.half = (pc * side === P || cap) ? 0 : p.half + 1;
      if (side === -1) p.full++;
      p.side = -side; hl ^= ZSL; hh ^= ZSH;
      if (fl & F_DOUBLE) { const e = from + 16 * side; if (epUseful(p, e)) { p.ep = e; hl ^= ZEL[e & 7]; hh ^= ZEH[e & 7]; } }
      p.hl = hl; p.hh = hh;
      if (attacked(p, p.ksq[side === 1 ? 0 : 1], -side)) { unmake(p); return false; }
      return true;
    }
    function unmake(p) {
      const u = p.stack.pop(); p.hist.pop();
      const m = u.m, from = mFrom(m), to = mTo(m), pr = mPromo(m), fl = mFlags(m), side = -p.side, b = p.b;
      p.side = side;
      const pc = pr ? P * side : b[to];
      b[from] = pc; b[to] = 0;
      if (fl & F_EP) b[to - 16 * side] = u.cap; else b[to] = u.cap;
      if (fl & F_CASTLE) { const [rf, rt] = rookFor(to); b[rf] = b[rt]; b[rt] = 0; }
      if (pc * side === K) p.ksq[side === 1 ? 0 : 1] = from;
      p.castle = u.castle; p.ep = u.ep; p.half = u.half; p.hl = u.hl; p.hh = u.hh;
      if (side === -1) p.full--;
    }
    function makeNull(p) {
      p.stack.push({ m: 0, cap: 0, castle: p.castle, ep: p.ep, half: p.half, hl: p.hl, hh: p.hh });
      p.hist.push(p.hl);
      if (p.ep >= 0) { p.hl ^= ZEL[p.ep & 7]; p.hh ^= ZEH[p.ep & 7]; }
      p.ep = -1; p.side = -p.side; p.hl ^= ZSL; p.hh ^= ZSH; p.half++;
    }
    function unmakeNull(p) { const u = p.stack.pop(); p.hist.pop(); p.side = -p.side; p.ep = u.ep; p.half = u.half; p.hl = u.hl; p.hh = u.hh; }
    function legalMoves(p) {
      const out = [], all = genMoves(p, [], false);
      for (const m of all) if (make(p, m)) { unmake(p); out.push(m); }
      return out;
    }
    function perft(p, d) {
      if (!d) return 1;
      let n = 0; const ms = genMoves(p, [], false);
      for (const m of ms) if (make(p, m)) { n += perft(p, d - 1); unmake(p); }
      return n;
    }
    const uci = m => sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ' pnbrqk'[mPromo(m)] : '');
    function fromUci(p, u) {
      if (typeof u !== 'string' || u.length < 4 || u.length > 5) return 0;
      for (const m of legalMoves(p)) if (uci(m) === u) return m;
      return 0;
    }
    function san(p, m) {
      const from = mFrom(m), to = mTo(m), pr = mPromo(m), fl = mFlags(m), t = Math.abs(p.b[from]);
      let s;
      if (fl & F_CASTLE) s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
      else if (t === P) s = (fl & F_CAP ? 'abcdefgh'[from & 7] + 'x' : '') + sqName(to) + (pr ? '=' + ' PNBRQK'[pr] : '');
      else {
        const others = legalMoves(p).filter(o => o !== m && mTo(o) === to && Math.abs(p.b[mFrom(o)]) === t && mFrom(o) !== from);
        let dis = '';
        if (others.length) {
          const sameFile = others.some(o => (mFrom(o) & 7) === (from & 7)), sameRank = others.some(o => (mFrom(o) >> 4) === (from >> 4));
          dis = !sameFile ? 'abcdefgh'[from & 7] : !sameRank ? String((from >> 4) + 1) : sqName(from);
        }
        s = ' PNBRQK'[t] + dis + (fl & F_CAP ? 'x' : '') + sqName(to);
      }
      make(p, m);
      const chk = inCheck(p), mate = chk && !legalMoves(p).length;
      unmake(p);
      return s + (mate ? '#' : chk ? '+' : '');
    }
    function insufficient(p) {
      let minors = 0, bishops = [0, 0], knights = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const t = Math.abs(p.b[s]);
        if (!t || t === K) continue;
        if (t === P || t === R || t === Q) return false;
        minors++;
        if (t === B) bishops[((s >> 4) + (s & 7)) & 1]++; else knights++;
      }
      if (minors <= 1) return true;
      return knights === 0 && (bishops[0] === 0 || bishops[1] === 0);
    }
    function fromMoves(list) {
      const p = loadFen(START);
      for (const u of list || []) { const m = fromUci(p, u); if (!m) return null; make(p, m); }
      return p;
    }

    // ---------- evaluation (centipawns, from the side to move) ----------
    const VAL = [0, 100, 320, 330, 500, 900, 0], PH = [0, 0, 1, 1, 2, 4, 0];
    // piece-square tables, written from White's side with rank 8 first
    const T = {
      P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
      PE: [0, 0, 0, 0, 0, 0, 0, 0, 90, 90, 90, 90, 90, 90, 90, 90, 50, 50, 50, 50, 50, 50, 50, 50, 28, 28, 28, 28, 28, 28, 28, 28,
        14, 14, 14, 14, 14, 14, 14, 14, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
      B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
      R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
      Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
      K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
      KE: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
    };
    const MG = [null, T.P, T.N, T.B, T.R, T.Q, T.K], EG = [null, T.PE, T.N, T.B, T.R, T.Q, T.KE];
    const centre = s => { const f = s & 7, r = s >> 4; return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4); };
    function evaluate(p) {
      const b = p.b; let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0, mat = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const pc = b[s]; if (!pc) continue;
        const t = pc > 0 ? pc : -pc, r = s >> 4, f = s & 7, idx = pc > 0 ? (7 - r) * 8 + f : r * 8 + f, sg = pc > 0 ? 1 : -1;
        mg += sg * (VAL[t] + MG[t][idx]); eg += sg * (VAL[t] + EG[t][idx]);
        phase += PH[t]; mat += sg * VAL[t];
        if (t === B) { if (pc > 0) wb++; else bb++; }
      }
      if (wb >= 2) { mg += 30; eg += 45; }
      if (bb >= 2) { mg -= 30; eg -= 45; }
      if (phase > 24) phase = 24;
      let sc = (mg * phase + eg * (24 - phase)) / 24;
      // winning endgame: drive the lone king to the edge and bring our king close
      if (phase <= 8 && Math.abs(mat) >= 300) {
        const win = mat > 0 ? 0 : 1, wk = p.ksq[win], lk = p.ksq[1 - win];
        const dist = Math.abs((wk & 7) - (lk & 7)) + Math.abs((wk >> 4) - (lk >> 4));
        const bonus = centre(lk) * 12 + (14 - dist) * 5;
        sc += mat > 0 ? bonus : -bonus;
      }
      return (sc * p.side + 10) | 0;
    }
    function hasPieces(p, side) {
      for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const t = p.b[s] * side; if (t > P && t < K) return true; }
      return false;
    }

    // ---------- search ----------
    const MATE = 30000, INF = 32000, TB = 18, TSIZE = 1 << TB, TMASK = TSIZE - 1, EXACT = 1, LOWER = 2, UPPER = 3;
    const TK = new Int32Array(TSIZE), TM = new Int32Array(TSIZE), TS = new Int16Array(TSIZE), TD = new Int8Array(TSIZE), TF = new Uint8Array(TSIZE);
    const killers = new Int32Array(256), hist = new Int32Array(128 * 128);
    let nodes = 0, stopAt = 0, aborted = false, rootBest = 0;
    function orderScores(p, ms, ttMove, ply) {
      const sc = new Int32Array(ms.length), b = p.b;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i], fl = mFlags(m);
        if (m === ttMove) sc[i] = 2000000;
        else if (fl & F_CAP) sc[i] = 1000000 + VAL[Math.abs(b[mTo(m)]) || P] * 10 - VAL[Math.abs(b[mFrom(m)])] / 10;
        else if (mPromo(m)) sc[i] = 900000 + mPromo(m);
        else if (killers[ply * 2] === m) sc[i] = 800000;
        else if (killers[ply * 2 + 1] === m) sc[i] = 700000;
        else sc[i] = hist[mFrom(m) * 128 + mTo(m)];
      }
      return sc;
    }
    function pickNext(ms, sc, i) {
      let bi = i;
      for (let j = i + 1; j < ms.length; j++) if (sc[j] > sc[bi]) bi = j;
      if (bi !== i) { const tm = ms[i]; ms[i] = ms[bi]; ms[bi] = tm; const ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts; }
      return ms[i];
    }
    function quiesce(p, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > stopAt) aborted = true;
      if (aborted) return 0;
      const stand = evaluate(p);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 48) return stand;
      const ms = genMoves(p, [], true), sc = orderScores(p, ms, 0, Math.min(ply, 127));
      for (let i = 0; i < ms.length; i++) {
        const m = pickNext(ms, sc, i);
        if (!make(p, m)) continue;
        const s = -quiesce(p, -beta, -alpha, ply + 1);
        unmake(p);
        if (aborted) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }
    function search(p, depth, alpha, beta, ply, allowNull) {
      if ((++nodes & 1023) === 0 && Date.now() > stopAt) aborted = true;
      if (aborted) return 0;
      const chk = inCheck(p);
      if (chk && ply < 60) depth++;
      if (ply > 0) {
        if (p.half >= 100) return 0;
        const h = p.hist, n = h.length;
        for (let i = n - 2; i >= 0 && i >= n - p.half - 1; i -= 2) if (h[i] === p.hl) return 0;
        if (alpha < -MATE + ply) alpha = -MATE + ply;
        if (beta > MATE - ply - 1) beta = MATE - ply - 1;
        if (alpha >= beta) return alpha;
      }
      if (depth <= 0) return quiesce(p, alpha, beta, ply);
      const ti = p.hl & TMASK; let ttMove = 0;
      if (TK[ti] === p.hh && TF[ti]) {
        ttMove = TM[ti];
        if (ply > 0 && TD[ti] >= depth) {
          let s = TS[ti]; if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
          const f = TF[ti];
          if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
        }
      }
      if (allowNull && !chk && depth >= 3 && ply > 0 && beta < MATE - 500 && hasPieces(p, p.side) && evaluate(p) >= beta) {
        makeNull(p);
        const s = -search(p, depth - 3, -beta, -beta + 1, ply + 1, false);
        unmakeNull(p);
        if (aborted) return 0;
        if (s >= beta) return beta;
      }
      const ms = genMoves(p, [], false), sc = orderScores(p, ms, ttMove, Math.min(ply, 127));
      let best = -INF, bestMove = 0, legal = 0;
      const a0 = alpha;
      for (let i = 0; i < ms.length; i++) {
        const m = pickNext(ms, sc, i);
        if (!make(p, m)) continue;
        legal++;
        const quiet = !(mFlags(m) & F_CAP) && !mPromo(m);
        let s;
        if (legal === 1) s = -search(p, depth - 1, -beta, -alpha, ply + 1, true);
        else {
          const red = legal > 4 && depth >= 3 && quiet && !chk && !inCheck(p) ? (legal > 12 && depth >= 5 ? 2 : 1) : 0;
          s = -search(p, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && red) s = -search(p, depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && s < beta) s = -search(p, depth - 1, -beta, -alpha, ply + 1, true);
        }
        unmake(p);
        if (aborted) return 0;
        if (s > best) { best = s; bestMove = m; if (ply === 0) rootBest = m; }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          if (quiet) {
            const k = Math.min(ply, 127) * 2;
            if (killers[k] !== m) { killers[k + 1] = killers[k]; killers[k] = m; }
            const hi = mFrom(m) * 128 + mTo(m); hist[hi] += depth * depth; if (hist[hi] > 500000) for (let j = 0; j < hist.length; j++) hist[j] >>= 1;
          }
          break;
        }
      }
      if (!legal) return chk ? -MATE + ply : 0;
      let st = best; if (st > MATE - 500) st += ply; else if (st < -MATE + 500) st -= ply;
      TK[ti] = p.hh; TM[ti] = bestMove; TS[ti] = st; TD[ti] = Math.min(depth, 120); TF[ti] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
      return best;
    }
    // level 0 Easy, 1 Medium, 2 Hard, 3 Expert. ms = time budget.
    function think(p, level, ms, rand) {
      rand = rand || Math.random;
      const legal = legalMoves(p);
      if (!legal.length) return 0;
      if (legal.length === 1) return legal[0];
      nodes = 0; aborted = false; stopAt = Date.now() + Math.max(50, ms || 1000);
      killers.fill(0); hist.fill(0);
      if (level <= 1) {
        // shallow look at every move with some noise: plays sensible chess but misses things
        if (level === 0 && rand() < 0.2) return legal[Math.floor(rand() * legal.length)];
        const depth = level === 0 ? 0 : 2, noise = level === 0 ? 160 : 35;
        let best = -INF, pick = legal[0];
        for (const m of legal) {
          make(p, m);
          let s = -search(p, depth, -INF, INF, 1, false);
          unmake(p);
          if (aborted) break;
          s += (rand() * 2 - 1) * noise;
          if (s > best) { best = s; pick = m; }
        }
        return pick;
      }
      const maxDepth = level === 2 ? 7 : 40, t0 = Date.now(), budget = stopAt - t0;
      let best = legal[0];
      for (let d = 1; d <= maxDepth; d++) {
        rootBest = 0;
        const s = search(p, d, -INF, INF, 0, false);
        if (aborted) { if (rootBest) best = rootBest; break; }
        if (rootBest) best = rootBest;
        if (Math.abs(s) > MATE - 200) break;
        if (Date.now() - t0 > budget * 0.5) break;
      }
      return best;
    }
    function thinkUci(list, level, ms) {
      const p = fromMoves(list); if (!p) return '';
      const m = think(p, level, ms);
      return m ? uci(m) : '';
    }

    return {
      P, N, B, R, Q, K, F_CAP, F_EP, F_CASTLE, START, mFrom, mTo, mPromo, mFlags, sqName, sqOf,
      loadFen, fen, make, unmake, legalMoves, genMoves, perft, inCheck, attacked, uci, fromUci, san, insufficient, fromMoves,
      evaluate, think, thinkUci, rehash, key: p => p.hl + ':' + p.hh
    };
  }

  const core = CORE();

  // ---------- background bot (one worker shared by every chess game) ----------
  let worker = null, workerBroken = false, nextReq = 1;
  const pending = new Map();
  function getWorker() {
    if (worker || workerBroken) return worker;
    try {
      const src = '"use strict";var C=(' + CORE.toString() + ')();onmessage=function(e){var d=e.data,u="";try{u=C.thinkUci(d.moves,d.level,d.ms);}catch(x){u="";}postMessage({id:d.id,u:u});};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = e => { const d = e.data || {}; const cb = pending.get(d.id); if (cb) { pending.delete(d.id); cb(typeof d.u === 'string' ? d.u : null); } };
      worker.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); workerBroken = true; try { worker.terminate(); } catch (x) {} worker = null; const cbs = [...pending.values()]; pending.clear(); cbs.forEach(cb => cb(null)); };
    } catch (e) { workerBroken = true; worker = null; }
    return worker;
  }
  // cb(uci) with '' / null when the worker could not answer (the caller then thinks on the page)
  function askWorker(moves, level, ms, cb) {
    const w = getWorker();
    if (!w) { cb(null); return; }
    const id = nextReq++;
    pending.set(id, cb);
    try { w.postMessage({ id, moves, level, ms }); } catch (e) { pending.delete(id); cb(null); return; }
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); cb(null); } }, ms + 5000);
  }

  // ---------- pieces: soft chunky shapes, no outlines, two tones (a lighter face over a darker rim) ----------
  // Every part is filled and stroked in the same colour, so all corners come out rounded. Drawn on a 100 x 100 box.
  function PARTS(t) {
    const rr = (g, x, y, w, h, r) => { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const P = [];
    const add = f => P.push(f);
    const base = () => add(g => rr(g, -25, 22, 50, 14, 7));
    const bell = (top, wt) => add(g => { g.moveTo(-21, 26); g.bezierCurveTo(-20, 12, -wt, 8, -wt, top); g.lineTo(wt, top); g.bezierCurveTo(wt, 8, 20, 12, 21, 26); g.closePath(); });
    const D = [];   // details: {kind:'line'|'dot'|'slot', ...}
    if (t === 1) {
      bell(-2, 10); add(g => rr(g, -14, -9, 28, 9, 4.5)); add(g => g.arc(0, -20, 12.5, 0, Math.PI * 2)); base();
      D.push({ hi: [-4, -24, 4.2] });
    } else if (t === 4) {
      add(g => rr(g, -17, -12, 34, 40, 5));
      add(g => rr(g, -23, -27, 46, 19, 6));
      add(g => rr(g, -23, -38, 12, 16, 4)); add(g => rr(g, -6, -38, 12, 16, 4)); add(g => rr(g, 11, -38, 12, 16, 4));
      base();
      D.push({ slot: [-12, -21, 24, 6, 3] }, { line: [[-15, 4], [15, 4]], w: 4 });
    } else if (t === 3) {
      bell(0, 9); add(g => rr(g, -15, -8, 30, 9, 4.5));
      add(g => { g.moveTo(0, -36); g.bezierCurveTo(17, -26, 19, -12, 11, -6); g.lineTo(-11, -6); g.bezierCurveTo(-19, -12, -17, -26, 0, -36); g.closePath(); });
      add(g => g.arc(0, -38, 5.5, 0, Math.PI * 2)); base();
      D.push({ line: [[9, -27], [-1, -16]], w: 4.5 });
    } else if (t === 2) {
      add(g => { g.moveTo(-15, 26); g.lineTo(-11, 6); g.bezierCurveTo(-17, 3, -28, 2, -28, -8); g.bezierCurveTo(-28, -14, -25, -19, -20, -23);
        g.bezierCurveTo(-14, -29, -8, -31, -4, -32); g.lineTo(-1, -42); g.lineTo(6, -33);
        g.bezierCurveTo(20, -28, 25, -12, 23, 6); g.lineTo(21, 26); g.closePath(); });
      base();
      D.push({ dot: [-10, -19, 3.2] }, { line: [[8, -27], [16, -14], [16, 6]], w: 3.6 }, { dot: [-23, -8, 1.8] });
    } else if (t === 5) {
      bell(-2, 12);
      add(g => { g.moveTo(-14, -2); g.lineTo(-25, -24); g.lineTo(-12, -14); g.lineTo(0, -31); g.lineTo(12, -14); g.lineTo(25, -24); g.lineTo(14, -2); g.closePath(); });
      add(g => g.arc(-25, -27, 5, 0, Math.PI * 2)); add(g => g.arc(0, -35, 5, 0, Math.PI * 2)); add(g => g.arc(25, -27, 5, 0, Math.PI * 2));
      add(g => rr(g, -16, -6, 32, 9, 4.5)); base();
      D.push({ dot: [0, -14, 3.6] });
    } else {
      bell(-2, 12);
      add(g => { g.moveTo(-16, -1); g.bezierCurveTo(-28, -10, -24, -27, -12, -25); g.bezierCurveTo(-6, -24, -3, -20, 0, -17); g.bezierCurveTo(3, -20, 6, -24, 12, -25); g.bezierCurveTo(24, -27, 28, -10, 16, -1); g.closePath(); });
      add(g => rr(g, -4, -44, 8, 24, 3)); add(g => rr(g, -11, -37, 22, 7.5, 3.5));
      add(g => rr(g, -16, -6, 32, 9, 4.5)); base();
      D.push({ line: [[-10, -11], [10, -11]], w: 3.4 });
    }
    return { P, D };
  }
  // colours per app theme (light / dark) and side. On the dark board the black side gets a lighter rim so it never sinks in.
  const PAL = {
    light: { w: { face: '#dde5ee', rim: '#9aaec2', det: '#92a7bb', hi: '#fbfdff' }, b: { face: '#565e67', rim: '#30353b', det: '#2b3035', hi: '#6f7882' } },
    // cover only: a charcoal piece with a light rim, so the fallen king reads on the green card
    cover: { b: { face: '#2f353b', rim: '#dfe7ef', det: '#dfe7ef', hi: '#4a525a' } },
    dark: { w: { face: '#d9e2eb', rim: '#90a3b5', det: '#8a9db0', hi: '#f6f9fc' }, b: { face: '#56697a', rim: '#8ea2b2', det: '#2a3640', hi: '#6c8090' } }
  };
  const themeName = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  function paintParts(g, parts, color, dy) {
    g.save(); g.translate(0, dy); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 3; g.lineJoin = 'round';
    for (const f of parts) { g.beginPath(); f(g); g.fill(); g.stroke(); }
    g.restore();
  }
  function paintDetails(g, list, k) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const d of list) {
      if (d.hi) { g.fillStyle = k.hi; g.beginPath(); g.arc(d.hi[0], d.hi[1], d.hi[2], 0, Math.PI * 2); g.fill(); continue; }
      g.fillStyle = k.det; g.strokeStyle = k.det;
      if (d.dot) { g.beginPath(); g.arc(d.dot[0], d.dot[1], d.dot[2], 0, Math.PI * 2); g.fill(); }
      if (d.slot) { const [x, y, w, h, r] = d.slot; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); }
      if (d.line) { g.lineWidth = d.w; g.beginPath(); d.line.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]))); g.stroke(); }
    }
  }
  // one piece into its own canvas (px x px), the piece itself filling 86% of it
  function pieceCanvas(t, white, theme, px) {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'), k = PAL[theme][white ? 'w' : 'b'], { P, D } = PARTS(t), u = px * 0.86 / 100;
    g.translate(px / 2, px / 2); g.scale(u, u);
    paintParts(g, P, k.rim, 5); paintParts(g, P, k.face, 0); paintDetails(g, D, k);
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.ellipse(0, 41, 26, 4.5, 0, 0, Math.PI * 2); g.fill();
    return c;
  }
  const sprites = new Map();
  function sprite(t, white, s, dpr, look) {
    const px = Math.max(8, Math.round(s * dpr)), theme = look || themeName(), key = t + (white ? 'w' : 'b') + px + theme[0];
    let c = sprites.get(key);
    if (c) return c;
    if (sprites.size > 96) sprites.clear();
    c = pieceCanvas(t, white, theme, px);
    sprites.set(key, c);
    return c;
  }
  // a piece of size s centred on (x, y), from the sprite cache
  function drawPieceVec(ctx, t, white, x, y, s, look) {
    const m = ctx.getTransform(), dpr = Math.max(1, Math.min(4, Math.hypot(m.a, m.b) || 1)), box = s / 0.86;
    ctx.drawImage(sprite(t, white, box, dpr, look), x - box / 2, y - box / 2, box, box);
  }

  const LEVELS = ['Easy', 'Medium', 'Hard', 'Expert'];
  const BOT_MS = [400, 700, 1000, 2200];
  const BOOK = { '': ['e2e4', 'd2d4', 'c2c4', 'g1f3'], e2e4: ['e7e5', 'c7c5', 'e7e6', 'c7c6'], d2d4: ['d7d5', 'g8f6'], c2c4: ['e7e5', 'g8f6', 'c7c5'], g1f3: ['d7d5', 'g8f6'] };

  Ludus.register({
    id: 'chess', name: 'Chess', tag: 'Duel', versus: true, online: { min: 2, max: 2 }, tint: '#4f7a66',
    hint: 'Drag a piece, or click it and then a square. <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> + <kbd>Space</kbd> work too. Pick the bot level under the board',
    onlineHint: 'Your pieces are at the bottom. Drag or click to move',
    _core: core,
    art(ctx, w, h) {
      // checkmate: the white queen stands over the fallen black king on a pale board, side by side at every card shape
      const big = Math.min(h * 0.74, w * 0.34), cell = big * 0.28, gap = big * 0.98;
      const qx = w / 2 - gap * 0.45, kx = qx + gap, oy = h * 0.52 + big * 0.12;
      const cols = Math.ceil((gap + big * 1.4) / cell) | 1, bx = w / 2 - cols * cell / 2;
      const shadow = (x, y, rx, ry) => { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
      ctx.save();
      for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.4)';
        ctx.fillRect(bx + c * cell, oy + r * cell, cell, cell);
      }
      shadow(qx, oy + big * 0.38, big * 0.24, big * 0.05); shadow(kx, oy + big * 0.33, big * 0.36, big * 0.06);
      drawPieceVec(ctx, 5, true, qx, oy - big * 0.08, big);
      ctx.translate(kx, oy + big * 0.1); ctx.rotate(Math.PI / 2.3);
      drawPieceVec(ctx, 6, false, 0, 0, big * 0.9, 'cover');
      ctx.restore();
    },
    create(stage, api) {
      const D = Ludus.draw, S = Ludus.state;
      const view = api.canvas();
      const { ctx } = view;
      const on = api.online;
      const friendLocal = api.friend && !on;
      const botMode = !api.friend;
      let level = Number.isInteger(S.chessLevel) && S.chessLevel >= 0 && S.chessLevel <= 3 ? S.chessLevel : api.level;
      // colours: online the shared random stream picks who is White; against the bot you swap colours each game
      let myColor = 1;
      if (on) myColor = (on.rand() < 0.5 ? 0 : 1) === on.seat ? 1 : -1;
      else if (botMode) myColor = S.chessNextSide === -1 ? -1 : 1;
      const nameOf = c => {
        if (on) return on.names[c === myColor ? on.seat : 1 - on.seat] || (c === 1 ? 'White' : 'Black');
        return c === 1 ? 'White' : 'Black';
      };

      let pos, plies, sans, keys, lastMove = null, phase = 'play', sel = -1, drag = null, promo = null, anims = [], fades = [];
      let banner = null, thinking = false, reqId = 0, hoverSq = -1, cursor = -1, kbd = false, chips = [], geo = null, checkFlash = 0;
      let wasConnected = on ? on.connected : true, lastSync = 0;
      let clock = 0, clockAt = 0, chipPress = null;   // game clock (seconds of play, counts up) and the level chip being pressed

      const flip = () => myColor === -1;
      const mayAct = () => phase === 'play' && !api.ended && !promo && (friendLocal || pos.side === myColor);
      function reset() {
        pos = core.loadFen(core.START); plies = []; sans = []; keys = [core.key(pos)]; lastMove = null;
        phase = 'play'; sel = -1; drag = null; promo = null; anims = []; fades = []; banner = null; thinking = false; clock = 0;
        cursor = myColor === 1 ? 0x14 : 0x64;
      }

      // ---------- rules glue ----------
      function status() {
        const legal = core.legalMoves(pos);
        if (!legal.length) return core.inCheck(pos) ? { kind: 'mate', winner: -pos.side } : { kind: 'stalemate', winner: 0 };
        if (pos.half >= 100) return { kind: 'fifty', winner: 0 };
        if (core.insufficient(pos)) return { kind: 'material', winner: 0 };
        const k = keys[keys.length - 1]; let n = 0;
        for (const x of keys) if (x === k) n++;
        if (n >= 3) return { kind: 'repetition', winner: 0 };
        return null;
      }
      function applyRaw(m) {
        const s = core.san(pos, m);
        core.make(pos, m);
        plies.push(core.uci(m)); sans.push(s); keys.push(core.key(pos));
        lastMove = { from: core.mFrom(m), to: core.mTo(m) };
        return s;
      }
      const ANIM_MS = 210;
      function commit(m, animate, local) {
        const from = core.mFrom(m), to = core.mTo(m), fl = core.mFlags(m), pc = pos.b[from];
        const capSq = fl & core.F_EP ? to - 16 * pos.side : to, cap = pos.b[capSq];
        const s = applyRaw(m);
        sel = -1; promo = null;
        const now = performance.now(), dur = animate && !api.reduceMotion ? ANIM_MS : 0;
        anims = [];
        if (dur) {
          anims.push({ pc, from, to, t0: now, dur });
          if (fl & core.F_CASTLE) { const rf = to === 6 ? 7 : to === 2 ? 0 : to === 118 ? 119 : 112, rt = to === 6 ? 5 : to === 2 ? 3 : to === 118 ? 117 : 115; anims.push({ pc: pos.b[rt], from: rf, to: rt, t0: now, dur }); }
        }
        if (cap) fades.push({ pc: cap, sq: capSq, t0: now + dur * 0.4, dur: 220 });
        const chk = /[+#]$/.test(s);
        api.sfx(chk ? 'power' : cap ? 'eat' : fl & core.F_CASTLE ? 'merge' : 'tap');
        if (chk) checkFlash = now;
        if (local && on) on.send('mv', { u: core.uci(m), n: plies.length - 1 });
        phase = 'anim';
        api.timeout(afterMove, dur + 15);
      }
      function afterMove() {
        if (phase !== 'anim') return;
        anims = [];
        const st = status();
        if (st) { endGame(st); return; }
        phase = 'play';
        if (botMode && pos.side !== myColor) botTurn();
      }
      const WHY = { mate: 'Checkmate', stalemate: 'Stalemate', fifty: 'Draw by the 50-move rule', material: 'Draw: not enough pieces to mate', repetition: 'Draw by repetition' };
      function endGame(st) {
        phase = 'end'; thinking = false;
        const moves = Math.ceil(plies.length / 2);
        const why = WHY[st.kind];
        let title, won;
        if (st.winner) {
          won = st.winner === myColor;
          if (friendLocal) title = nameOf(st.winner) + ' wins';
          else if (on) title = won ? 'You win' : nameOf(st.winner) + ' wins';
          else title = won ? 'You win' : 'Bot wins';
        } else { won = false; title = 'Draw'; }
        banner = { text: st.kind === 'mate' ? 'Checkmate' : st.kind === 'stalemate' ? 'Stalemate' : 'Draw', sub: why, t0: performance.now() };
        api.sfx(st.winner ? (friendLocal || won ? 'win' : 'lose') : 'over');
        if (botMode) { S.chessNextSide = -myColor; Ludus.save(); }
        api.timeout(() => {
          api.over({
            score: botMode && won ? level + 1 : 0, won: friendLocal ? true : won, title,
            message: why + ' after ' + moves + ' move' + (moves === 1 ? '' : 's') + (botMode ? ' · Bot ' + LEVELS[level] : '')
          });
        }, 1700);
      }
      function botTurn() {
        thinking = true;
        const id = ++reqId, t0 = performance.now(), lv = level;
        const done = u => {
          if (id !== reqId || api.ended || phase !== 'play') return;
          const m = u ? core.fromUci(pos, u) : 0;
          if (!m) { thinking = false; return; }
          const wait = Math.max(0, (lv === 0 ? 520 : 380) - (performance.now() - t0));
          api.timeout(() => { if (id !== reqId || phase !== 'play') return; thinking = false; commit(m, true, false); }, wait);
        };
        const book = lv >= 2 && plies.length <= 1 ? BOOK[plies.join('')] : null;
        if (book) { done(book[Math.floor(Math.random() * book.length)]); return; }
        askWorker(plies.slice(), lv, BOT_MS[lv], u => {
          if (u) { done(u); return; }
          // no worker: think on the page, briefly, after the frame has been drawn
          api.timeout(() => { if (id === reqId) done(core.thinkUci(plies, lv, Math.min(BOT_MS[lv], 320))); }, 30);
        });
      }

      // ---------- player input ----------
      function targetsFrom(sq) { return core.legalMoves(pos).filter(m => core.mFrom(m) === sq); }
      const ownPiece = sq => sq >= 0 && pos.b[sq] * pos.side > 0;
      function tryMove(from, to, animate) {
        const cands = core.legalMoves(pos).filter(m => core.mFrom(m) === from && core.mTo(m) === to);
        if (!cands.length) return false;
        if (cands.length > 1) { promo = { from, to, cands, animate }; sel = from; api.sfx('tick'); return true; }
        commit(cands[0], animate, true);
        return true;
      }
      function choosePromo(t) {
        if (!promo) return;
        const m = promo.cands.find(x => core.mPromo(x) === t);
        const animate = promo.animate;
        promo = null;
        if (m) commit(m, animate, true);
      }
      function pressSquare(sq, px, py) {
        if (!mayAct()) { if (sq >= 0 && pos.b[sq]) api.sfx('tick'); return; }
        if (sel >= 0 && sq !== sel && targetsFrom(sel).some(m => core.mTo(m) === sq)) { tryMove(sel, sq, true); return; }
        if (ownPiece(sq)) {
          const again = sel === sq;
          sel = sq; drag = { sq, x: px, y: py, sx: px, sy: py, moved: false, again };
          api.sfx('tick');
          return;
        }
        sel = -1;
      }
      function releaseSquare(sq) {
        if (!drag) return;
        const d = drag; drag = null;
        if (d.moved) {
          if (sq >= 0 && sq !== d.sq && mayAct() && tryMove(d.sq, sq, false)) return;
          if (sq !== d.sq) api.sfx('hit');
          return;
        }
        if (d.again) sel = -1;   // a second click on the selected piece puts it down
      }

      // ---------- layout ----------
      function layout() {
        const { w, h } = view;
        const top = 56, capT = 32, capH = 20, chipH = on ? 0 : 44, pad = 12;
        const avail = h - top - capT - capH - chipH - pad;
        const s = Math.max(12, Math.floor(Math.min(w - pad * 2, avail) / 8));
        const bs = s * 8, block = capT + capH + bs + chipH;
        const y0 = top + Math.max(0, (h - top - pad - block) / 2), by = Math.round(y0 + capT);
        geo = { s, bs, bx: Math.round((w - bs) / 2), by, capTop: y0 + capT / 2 - 1, capBot: by + bs + capH / 2 + 2, chipY: by + bs + capH + 8, chipH };
        return geo;
      }
      function sqXY(sq) {
        const f = sq & 7, r = sq >> 4, c = flip() ? 7 - f : f, row = flip() ? r : 7 - r;
        return { x: geo.bx + c * geo.s, y: geo.by + row * geo.s };
      }
      function sqAt(x, y) {
        if (!geo) return -1;
        const c = Math.floor((x - geo.bx) / geo.s), row = Math.floor((y - geo.by) / geo.s);
        if (c < 0 || c > 7 || row < 0 || row > 7) return -1;
        const f = flip() ? 7 - c : c, r = flip() ? row : 7 - row;
        return r * 16 + f;
      }
      function local(e) { const rect = view.canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
      function promoBoxes() {
        if (!promo || !geo) return [];
        const { x, y } = sqXY(promo.to), s = geo.s, down = y < geo.by + geo.bs / 2;
        return [5, 2, 4, 3].map((t, i) => ({ t, x, y: down ? y + i * s : y - i * s, s }));
      }

      // ---------- drawing ----------
      const ease = t => 1 - Math.pow(1 - t, 3);
      function pieceAt(pc, x, y, s, alpha, scale) {
        const sp = sprite(Math.abs(pc), pc > 0, s, view.dpr);
        const k = scale || 1, sz = s * k;
        ctx.globalAlpha = alpha === undefined ? 1 : alpha;
        ctx.drawImage(sp, x + (s - sz) / 2, y + (s - sz) / 2, sz, sz);
        ctx.globalAlpha = 1;
      }
      function captured() {
        // what each side has taken, worked out from the pieces left on the board
        const full = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 }, have = { 1: {}, '-1': {} };
        for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const pc = pos.b[s]; if (pc && Math.abs(pc) !== 6) { const c = pc > 0 ? 1 : -1; have[c][Math.abs(pc)] = (have[c][Math.abs(pc)] || 0) + 1; } }
        const lost = c => { const out = []; let extra = 0; for (const t of [5, 4, 3, 2]) { const n = have[c][t] || 0; if (n > full[t]) extra += n - full[t]; } let pawnsLost = Math.max(0, full[1] - (have[c][1] || 0) - extra); for (const t of [5, 4, 3, 2]) for (let i = (have[c][t] || 0); i < full[t]; i++) out.push(t); for (let i = 0; i < pawnsLost; i++) out.push(1); return out; };
        const val = [0, 1, 3, 3, 5, 9], mat = c => { let v = 0; for (const t in have[c]) v += val[t] * have[c][t]; return v; };
        return { byWhite: lost(-1), byBlack: lost(1), diff: mat(1) - mat(-1) };
      }
      function capRow(list, color, y, maxX) {
        if (!list.length) return;
        const s = geo.s * 0.46, x0 = geo.bx + 2, groups = new Set(list).size - 1;
        let step = s * 0.62, gapG = s * 0.22;
        const need = (list.length - 1) * step + groups * gapG + s;
        if (need > maxX - x0) { const k = Math.max(0.35, (maxX - x0 - s) / Math.max(1, need - s)); step *= k; gapG *= k; }
        let x = x0, prev = 0;
        for (const t of list) { if (prev && prev !== t) x += gapG; drawPieceVec(ctx, t, color === 1, x + s / 2, y, s); x += step; prev = t; }
      }
      // the game clock pill above the board: round clock + mm:ss, then a second segment with who is ahead on material
      const fmtClock = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0'); };
      function clockPill(col, lead, leader) {
        const ph = 26, txt = fmtClock(clock), w1 = clock >= 3600 ? 92 : 76, w2 = lead ? 58 : 60, pw = w1 + w2;
        const x = geo.bx + geo.bs - pw, y = Math.round(geo.capTop - ph / 2);
        D.roundRect(ctx, x, y + 2, pw, ph, ph / 2); ctx.fillStyle = col.dark ? col.bg : col.bg2; ctx.fill();
        D.roundRect(ctx, x, y, pw, ph, ph / 2); ctx.fillStyle = col.dark ? col.surface2 : col.surface; ctx.fill();
        ctx.strokeStyle = col.dark ? 'rgba(255,245,230,0.1)' : 'rgba(32,28,23,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x + w1 - 0.75, y + 5, 1.5, ph - 10);
        // clock face
        const cx = x + 17, cy = y + ph / 2, r = 7.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = col.dark ? '#b9cddd' : '#cbdcea'; ctx.fill();
        const a = -Math.PI / 2 + (clock % 60) / 60 * Math.PI * 2;
        ctx.strokeStyle = '#557891'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fillStyle = '#557891'; ctx.fill();
        D.text(ctx, txt, x + 30, cy + 0.5, 13, col.ink2, 800, 'left');
        // material
        const mx = x + w1 + w2 / 2;
        if (!lead) D.text(ctx, 'Even', mx, cy + 0.5, 12, col.ink3, 750);
        else {
          drawPieceVec(ctx, 1, leader === 1, mx - 12, cy, 15);
          D.text(ctx, '+' + lead, mx - 2, cy + 0.5, 13, leader === myColor && !friendLocal ? col.good : col.ink2, 800, 'left');
        }
        return x;
      }
      function hud(col) {
        const ended = phase === 'end' || api.ended, bottom = myColor, topC = -myColor;
        let status = '';
        const chk = !ended && core.inCheck(pos);
        if (ended) status = banner ? banner.text : '';
        else if (promo) status = 'Pick a piece';
        else if (botMode) status = pos.side === myColor ? (chk ? 'Check: your move' : 'Your move') : 'Bot is thinking';
        else if (on) status = pos.side === myColor ? (chk ? 'Check: your move' : 'Your move') : nameOf(pos.side) + '’s move';
        else status = (chk ? 'Check: ' : '') + (pos.side === 1 ? 'White' : 'Black') + ' to move';
        const left = on ? { who: 'you', label: nameOf(bottom) } : friendLocal ? { who: 'you', label: 'White' } : { who: 'you', label: myColor === 1 ? 'You · White' : 'You · Black' };
        const right = on ? { who: 'p2', label: nameOf(topC) } : friendLocal ? { who: 'p2', label: 'Black' } : { who: 'bot', label: 'Bot · ' + LEVELS[level] };
        D.duelHeader(ctx, 8, 8, view.w - 16, { left, right, turn: ended ? null : (pos.side === bottom ? 'left' : 'right'), status, thinking: !ended && thinking }, col);
      }
      function drawChips(col) {
        chips = [];
        if (on || !geo.chipH) return;
        const { bx, bs, chipY } = geo;
        const labW = bs >= 300 ? 54 : 0, gap = 8, cw = Math.min(86, (bs - labW - gap * 3) / 4), ch = 30, rim = 3;
        const total = labW + cw * 4 + gap * 3, x0 = bx + (bs - total) / 2, now = performance.now();
        if (labW) D.text(ctx, friendLocal ? 'vs Bot' : 'Bot', x0 + labW / 2 - 4, chipY + ch / 2, 11.5, col.ink2, 650);
        LEVELS.forEach((name, i) => {
          const x = x0 + labW + i * (cw + gap), active = botMode && i === level;
          // soft rounded key: a darker rim under the face, which sinks onto the rim while pressed
          const down = chipPress && chipPress.i === i && now - chipPress.t < 140 && !api.reduceMotion ? rim - 1 : 0;
          D.roundRect(ctx, x, chipY + rim, cw, ch, 12);
          ctx.fillStyle = active ? col.accent : (col.dark ? col.bg : col.bg2); ctx.fill();
          if (active) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); }
          D.roundRect(ctx, x, chipY + down, cw, ch, 12);
          ctx.fillStyle = active ? col.accent : (col.dark ? col.surface2 : col.surface); ctx.fill();
          if (!active) { ctx.strokeStyle = col.dark ? 'rgba(255,245,230,0.1)' : 'rgba(32,28,23,0.12)'; ctx.lineWidth = 1.5; ctx.stroke(); }
          D.fitText(ctx, name, x + cw / 2, chipY + down + ch / 2 + 0.5, cw - 8, 12, active ? '#fff' : col.ink2, 750, 9);
          chips.push({ x, y: chipY, w: cw, h: ch + rim, i });
        });
      }
      function pickLevel(i) {
        S.chessLevel = i; Ludus.save();
        if (friendLocal) {
          // from two-player mode: switch this game to the bot at that level (the app restarts it in bot mode)
          const btn = document.querySelector('#vsToggle [data-vs="bot"]');
          if (btn) btn.click();
          return;
        }
        if (i === level) return;
        level = i; api.sfx('click'); api.toast('Bot level: ' + LEVELS[i]);
      }
      function render(dt) {
        const col = api.colors(), now = performance.now();
        const { w, h } = view;
        layout();
        ctx.clearRect(0, 0, w, h);
        hud(col);
        const { s, bs, bx, by } = geo;
        // captured pieces next to each player
        if (dt > 0 && phase !== 'end' && !api.ended) clock += Math.min(0.25, (now - (clockAt || now)) / 1000);
        clockAt = now;
        const cap = captured(), mineTook = myColor === 1 ? cap.byWhite : cap.byBlack, theyTook = myColor === 1 ? cap.byBlack : cap.byWhite;
        const pillX = clockPill(col, Math.abs(cap.diff), cap.diff > 0 ? 1 : -1);
        capRow(theyTook, myColor, geo.capTop, pillX - 8);
        capRow(mineTook, -myColor, geo.capBot, bx + bs);
        // frame and squares
        D.roundRect(ctx, bx - 5, by - 5, bs + 10, bs + 13, 13);
        ctx.fillStyle = col.dark ? '#141b21' : '#dfe5ec'; ctx.fill();
        ctx.save();
        D.roundRect(ctx, bx, by, bs, bs, 8); ctx.clip();
        // calm, low-contrast squares: near white and pale grey in light, two close slate tones in dark
        const light = col.dark ? '#2a3640' : '#fbfcfd', dark = col.dark ? '#212c35' : '#eaeef2';
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
          const { x, y } = sqXY(r * 16 + f);
          ctx.fillStyle = (r + f) % 2 ? light : dark; ctx.fillRect(x, y, s, s);
        }
        const tint = (sq, color, a) => { const { x, y } = sqXY(sq); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(x, y, s, s); ctx.globalAlpha = 1; };
        // last move: a soft yellow square (muted gold in dark)
        if (lastMove) { tint(lastMove.from, col.dark ? '#4d4532' : '#fbefc2', 1); tint(lastMove.to, col.dark ? '#62553a' : '#f7e49c', 1); }
        if (sel >= 0) tint(sel, col.accent, 0.38);
        // king in check: red glow
        if (phase !== 'end' ? core.inCheck(pos) : (banner && banner.text === 'Checkmate')) {
          const k = pos.ksq[pos.side === 1 ? 0 : 1], { x, y } = sqXY(k);
          const pulse = api.reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(now / 180);
          const g = ctx.createRadialGradient(x + s / 2, y + s / 2, s * 0.1, x + s / 2, y + s / 2, s * 0.72);
          g.addColorStop(0, `rgba(226,72,60,${0.85 * pulse})`); g.addColorStop(1, 'rgba(226,72,60,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
        }
        // coordinates
        const fs = Math.max(8, Math.min(11, s * 0.2)), coord = col.dark ? 'rgba(200,220,235,0.34)' : 'rgba(60,85,110,0.4)';
        for (let i = 0; i < 8; i++) {
          const fSq = flip() ? (7 - i) : i, rSq = flip() ? i : 7 - i;
          const bottomSq = (flip() ? 7 : 0) * 16 + fSq, leftSq = rSq * 16 + (flip() ? 7 : 0);
          const a = sqXY(bottomSq), b = sqXY(leftSq);
          D.text(ctx, 'abcdefgh'[fSq], a.x + s - fs * 0.55, a.y + s - fs * 0.6, fs, coord, 750);
          D.text(ctx, String(rSq + 1), b.x + fs * 0.55, b.y + fs * 0.7, fs, coord, 750);
        }
        // pieces
        const hidden = new Set(anims.map(a => a.to));
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
          const sq = r * 16 + f, pc = pos.b[sq];
          if (!pc || hidden.has(sq)) continue;
          const { x, y } = sqXY(sq);
          if (drag && drag.moved && drag.sq === sq) { pieceAt(pc, x, y, s, 0.3); continue; }
          if (promo && promo.from === sq) { pieceAt(pc, x, y, s, 0.3); continue; }
          pieceAt(pc, x, y, s);
        }
        // captured piece fading out
        fades = fades.filter(fd => now - fd.t0 < fd.dur);
        fades.forEach(fd => { const k = Math.max(0, Math.min(1, (now - fd.t0) / fd.dur)); if (now < fd.t0) return; const { x, y } = sqXY(fd.sq); pieceAt(fd.pc, x, y, s, 1 - k, 1 + k * 0.25); });
        // legal targets of the selected piece
        if (sel >= 0 && mayAct()) {
          const seen = new Set();
          for (const m of targetsFrom(sel)) {
            const t = core.mTo(m); if (seen.has(t)) continue; seen.add(t);
            const { x, y } = sqXY(t), capture = pos.b[t] || (core.mFlags(m) & core.F_EP);
            ctx.fillStyle = col.dark ? 'rgba(190,215,235,0.2)' : 'rgba(45,70,100,0.17)';
            ctx.beginPath();
            if (capture) { ctx.arc(x + s / 2, y + s / 2, s * 0.47, 0, Math.PI * 2); ctx.arc(x + s / 2, y + s / 2, s * 0.38, 0, Math.PI * 2, true); }
            else ctx.arc(x + s / 2, y + s / 2, s * (hoverSq === t ? 0.2 : 0.15), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // sliding pieces
        anims.forEach(a => {
          const k = ease(Math.min(1, (now - a.t0) / a.dur)), p0 = sqXY(a.from), p1 = sqXY(a.to);
          pieceAt(a.pc, D.lerp(p0.x, p1.x, k), D.lerp(p0.y, p1.y, k), s, 1, 1 + Math.sin(k * Math.PI) * 0.08);
        });
        // keyboard cursor
        if (kbd && cursor >= 0 && phase === 'play') {
          const { x, y } = sqXY(cursor);
          ctx.strokeStyle = col.accent; ctx.lineWidth = 3; D.roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 6); ctx.stroke();
        }
        // dragged piece follows the pointer
        if (drag && drag.moved && pos.b[drag.sq]) {
          const over = sqAt(drag.x, drag.y);
          if (over >= 0) { const { x, y } = sqXY(over); ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); }
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
          pieceAt(pos.b[drag.sq], drag.x - s / 2, drag.y - s * 0.62, s, 1, 1.12);
          ctx.restore();
        }
        // promotion picker
        if (promo) {
          ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(bx, by, bs, bs);
          promoBoxes().forEach((b, i) => {
            D.roundRect(ctx, b.x + 3, b.y + 5, b.s - 6, b.s - 6, 12); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
            ctx.fillStyle = col.dark ? '#2b3740' : col.surface;
            D.roundRect(ctx, b.x + 3, b.y + 2, b.s - 6, b.s - 6, 12); ctx.fill();
            const hov = hoverSq === -100 - i;
            if (hov) { ctx.strokeStyle = col.accent; ctx.lineWidth = 2.5; ctx.stroke(); }
            pieceAt(b.t * pos.side, b.x, b.y, b.s, 1, hov ? 1.06 : 0.94);
          });
        }
        ctx.restore();
        // end of game banner over the board
        if (banner) {
          const k = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, (now - banner.t0) / 380));
          const bw = Math.min(bs - 24, 260), bh = 62, cx = bx + bs / 2, cy = by + bs / 2;
          ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
          D.roundRect(ctx, -bw / 2, -bh / 2 + 4, bw, bh, 18); ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.4)' : 'rgba(40,55,75,0.16)'; ctx.fill();
          D.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 18); ctx.fillStyle = col.dark ? 'rgba(37,49,58,0.97)' : 'rgba(255,255,255,0.97)'; ctx.fill();
          ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.1)' : 'rgba(40,55,75,0.13)'; ctx.lineWidth = 1.5; ctx.stroke();
          D.text(ctx, banner.text, 0, -9, 19, col.ink, 750);
          D.fitText(ctx, banner.sub, 0, 14, bw - 20, 11.5, col.ink2, 600, 9);
          ctx.restore();
        }
        drawChips(col);
        // online: watch for the link coming back and catch up if anything was missed
        if (on) {
          const c = !!on.connected;
          if (c && !wasConnected) askSync(true);
          wasConnected = c;
        }
      }

      // ---------- input wiring ----------
      api.on(view.canvas, 'pointerdown', e => {
        const { x, y } = local(e); kbd = false;
        for (const c of chips) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { chipPress = { i: c.i, t: performance.now() }; pickLevel(c.i); return; }
        if (promo) {
          const hit = promoBoxes().find(b => x >= b.x && x < b.x + b.s && y >= b.y && y < b.y + b.s);
          if (hit) choosePromo(hit.t); else { promo = null; sel = -1; api.sfx('tick'); }
          return;
        }
        const sq = sqAt(x, y);
        if (sq < 0) { sel = -1; return; }
        try { view.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        pressSquare(sq, x, y);
      });
      api.on(view.canvas, 'pointermove', e => {
        const { x, y } = local(e);
        if (promo) { const i = promoBoxes().findIndex(b => x >= b.x && x < b.x + b.s && y >= b.y && y < b.y + b.s); hoverSq = i >= 0 ? -100 - i : -1; return; }
        hoverSq = sqAt(x, y);
        if (drag) { drag.x = x; drag.y = y; if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 5) drag.moved = true; }
        view.canvas.style.cursor = drag && drag.moved ? 'grabbing' : (mayAct() && (ownPiece(hoverSq) || (sel >= 0 && hoverSq >= 0 && targetsFrom(sel).some(m => core.mTo(m) === hoverSq)))) ? 'pointer' : '';
      });
      api.on(view.canvas, 'pointerup', e => { const { x, y } = local(e); releaseSquare(sqAt(x, y)); });
      api.on(view.canvas, 'pointercancel', () => { drag = null; });
      api.on(view.canvas, 'pointerleave', () => { if (!drag) hoverSq = -1; });
      api.keys(e => {
        if (promo) {
          const t = { q: 5, r: 4, b: 3, n: 2 }[String(e.key).toLowerCase()];
          if (t) choosePromo(t);
          return;
        }
        const dirs = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (dirs[e.key]) {
          if (!kbd) { kbd = true; if (sel >= 0) cursor = sel; }
          const [df, dr] = dirs[e.key], k = flip() ? -1 : 1;
          const f = Math.max(0, Math.min(7, (cursor & 7) + df * k)), r = Math.max(0, Math.min(7, (cursor >> 4) + dr * k));
          cursor = r * 16 + f; api.sfx('tick');
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault(); kbd = true;
          pressSquare(cursor, 0, 0); drag = null;
        } else if (e.key >= '1' && e.key <= '4' && !on) pickLevel(+e.key - 1);
      });

      // ---------- online ----------
      function askSync(force) {
        const t = performance.now();
        if (!on || (!force && t - lastSync < 1000)) return;
        lastSync = t;
        on.send('hi', { n: plies.length });
      }
      function catchUp(list) {
        if (!Array.isArray(list) || list.length <= plies.length || list.length > 600) return;
        for (let i = 0; i < plies.length; i++) if (list[i] !== plies[i]) return;
        if (phase === 'end') return;
        anims = []; sel = -1; promo = null; drag = null;
        for (let i = plies.length; i < list.length; i++) {
          const m = typeof list[i] === 'string' ? core.fromUci(pos, list[i]) : 0;
          if (!m) break;
          applyRaw(m);
          if (status()) break;
        }
        phase = 'anim';
        afterMove();
      }
      if (on) {
        on.on('hi', (d, from) => { if (d && Number.isInteger(d.n) && d.n >= 0 && plies.length > d.n && plies.length <= 600) on.sendTo(from, 'hist', { m: plies.slice() }); });
        on.on('hist', d => { if (d) catchUp(d.m); });
      }

      // ---------- save / restore (local games only) ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || !Array.isArray(sv.moves) || !sv.moves.length || sv.moves.length > 600) return false;
        if (botMode && sv.my !== 1 && sv.my !== -1) return false;
        if (botMode) myColor = sv.my;
        reset();
        for (const u of sv.moves) { const m = core.fromUci(pos, u); if (!m) { reset(); return false; } applyRaw(m); }
        const st = status();
        if (st) { reset(); return false; }
        if (Number.isFinite(sv.c) && sv.c > 0) clock = Math.min(sv.c, 359999);
        if (botMode && pos.side !== myColor) botTurn();
        return true;
      }

      api.score(0);
      if (botMode) getWorker();   // start the bot's worker now, so its first move does not pay for it
      reset();
      if (on || !restore(api.saved)) { reset(); if (botMode && myColor === -1) botTurn(); }
      if (on) on.queue((type, d, from) => {
        if (type !== 'mv') return true;
        if (phase === 'anim') return false;
        if (phase !== 'play' || from === on.seat || pos.side === myColor) return true;
        if (!d || typeof d.u !== 'string' || !Number.isInteger(d.n)) return true;
        if (d.n < plies.length) return true;                    // already have it
        if (d.n > plies.length) { askSync(); return true; }     // missed something: ask for the whole game
        const m = core.fromUci(pos, d.u);
        if (!m) return true;
        commit(m, true, false);
        return true;
      });
      if (window.ludusDebug) {
        window.ludusDebug.chess = () => ({ fen: core.fen(pos), plies: plies.slice(), sans: sans.slice(), side: pos.side, my: myColor, phase, level, thinking, ended: api.ended, worker: !!worker, workerBroken, clock, mode: on ? 'online' : friendLocal ? 'friend' : 'bot' });
        window.ludusDebug.chessMove = u => { const m = core.fromUci(pos, u); if (!m || !mayAct()) return false; commit(m, true, true); return true; };
        window.ludusDebug.chessGeo = sq => { layout(); const p = sqXY(sq); const r = view.canvas.getBoundingClientRect(); return { x: r.left + p.x + geo.s / 2, y: r.top + p.y + geo.s / 2, s: geo.s }; };
      }
      api.loop(dt => render(dt));
      return {
        save() {
          if (on || api.ended || !plies.length || phase === 'end') return null;
          return { v: 1, moves: plies.slice(), my: myColor, c: Math.floor(clock) };
        }
      };
    }
  });
})();
