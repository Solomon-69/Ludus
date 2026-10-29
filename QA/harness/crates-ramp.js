// Crate Push ramp: node QA/harness/run.js QA/harness/crates-ramp.js  (400 seeds)
async () => {
  const g = Ludus.games.find(x => x.id === 'crates'), out = { fallbacks: 0, boxOk: 0, dOk: 0, runs: 0, dMaxDrop: 0, endHarder: 0, per: {} };
  const carry = {}; for (let s = 0; s < 400; s++) for (let b = 0; b < 2; b++) {
    const n = g._blockLen(b); let prev = b ? carry[s] : null, okB = true, okD = true;
    for (let i = 0; i < n; i++) {
      const l = g._make(77 + s * 7919, b, i); if (!l.sol) out.fallbacks++;
      const key = b + ':' + i, p = out.per[key] = out.per[key] || { n: 0, boxes: [], d: [], pushes: [] }; p.n++; p.boxes.push(l.boxes); p.d.push(l.diff); p.pushes.push(l.eff);
      if (prev) { if (l.boxes < prev.boxes) okB = false; if (l.diff < prev.diff) { okD = false; out.dMaxDrop = Math.max(out.dMaxDrop, prev.diff - l.diff); } }
      if (i === 0) var first = l; if (i === n - 1) { var last = l; }
      prev = l;
    }
    carry[s] = prev;
    out.runs++; if (okB) out.boxOk++; if (okD) out.dOk++; if (last.diff > first.diff + 30 && last.boxes > first.boxes) out.endHarder++;
  }
  const ms = a => [Math.min(...a), +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), Math.max(...a)];
  out.table = Object.entries(out.per).map(([k, v]) => k + ' boxes ' + ms(v.boxes).join('/') + ' pushes ' + ms(v.pushes).join('/') + ' D ' + ms(v.d).join('/'));
  delete out.per; return out;
}
