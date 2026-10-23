/* Clue Spotter: road-clue drills. A bollard, a licence plate, road lines, a chevron sign, a line of text or a
   coverage note is shown; name the country. Pick one of four (keys 1-4) or type it. Three lives, streak scoring.
   Online: a race over the same ten clues, 15 seconds each, faster right answers score more.
   Clue data: games/metaspot/data.js (compiled from geohints.com, plonkit.net and Wikipedia). Drawings are simple
   pictures, not photos: bollards were measured from GeoHints photos and show the front and the back side by side;
   plates and chevrons were checked against photos; road lines follow the guides' descriptions. */
(function () {
  const K = Ludus.dom;
  const DATA = 'games/metaspot/data.js';
  const KINDS = [['mix', 'Mixed'], ['bollard', 'Bollards'], ['plate', 'Plates'], ['lines', 'Road lines'], ['chevron', 'Chevrons'], ['language', 'Language'], ['car', 'Car & coverage'], ['pole', 'Poles']];
  const CLUE_KINDS = ['bollard', 'plate', 'lines', 'chevron', 'language', 'car', 'pole'];
  const LABEL = { bollard: 'Bollard', plate: 'Licence plate', lines: 'Road markings', chevron: 'Chevron sign', language: 'Language on signs', car: 'Google car & coverage', pole: 'Utility pole' };
  const REGIONS = ['', 'Europe', 'Americas', 'Asia', 'Africa', 'Oceania'];
  const LIVES = 3, RACE_N = 10, RACE_T = 15, NEXT_MS = 4200;

  // ---------- drawings (SVG strings from static data) ----------
  const esc = K.esc;
  const col = c => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) ? c : null;   // only plain colours reach the SVG
  const svg = (inner) => `<svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;
  let U = 0;
  function scene(inner) {
    const u = ++U;
    return `<defs><linearGradient id="mssk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f2"/><stop offset="1" stop-color="#eef3f6"/></linearGradient></defs>
      <rect width="600" height="300" fill="url(#mssk${u})"/><path d="M0 190 Q150 170 300 185 T600 180 V300 H0Z" fill="#9fbf7a"/><path d="M0 230 L600 215 V300 H0Z" fill="#7da35c"/>${inner}`;
  }
  // One post seen from one side (newer data: bollard.front / bollard.back). Positions are fractions of the post height.
  const num = (v, d) => Number.isFinite(v) ? v : d;
  function post(S, cx, base, h, label) {
    const u = ++U, w = Math.max(0.12, Math.min(0.45, num(S.width, 0.25))) * h, x0 = cx - w / 2, top = base - h;
    const sh = S.shape || 'flat-top';
    let outline;
    if (sh === 'round-top') outline = `M${x0} ${base} V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x0 + w} ${top + w / 2} V${base}Z`;
    else if (sh === 'slanted-top') outline = `M${x0} ${base} V${top + w * 0.45} L${x0 + w} ${top} V${base}Z`;
    else if (sh === 'pointed-top') outline = `M${x0} ${base} V${top + w * 0.5} L${cx} ${top} L${x0 + w} ${top + w * 0.5} V${base}Z`;
    else outline = `M${x0} ${base} V${top} H${x0 + w} V${base}Z`;
    let g = `<clipPath id="mspc${u}"><path d="${outline}"/></clipPath><path d="${outline}" fill="${col(S.body) || '#fff'}"/><g clip-path="url(#mspc${u})">`;
    if (sh === 'triangular') g += `<rect x="${cx - 1}" y="${top}" width="2" height="${h}" fill="rgba(0,0,0,.12)"/>`;
    let outer = '';
    for (const p of Array.isArray(S.parts) ? S.parts : []) {
      const c = col(p && p.color); if (!c) continue;
      if (p.type === 'reflector' && num(p.w, 0) > 1) { outer += `<circle cx="${cx}" cy="${top + num(p.y, 0.05) * h}" r="${(p.w * w) / 2}" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>`; continue; }
      if (p.type === 'band') {
        const y1 = top + num(p.from, 0) * h, y2 = top + num(p.to, 0) * h, sl = num(p.slant, 0) * w * 0.35;
        g += `<path d="M${x0 - 2} ${y1 - sl} L${x0 + w + 2} ${y1 + sl} L${x0 + w + 2} ${y2 + sl} L${x0 - 2} ${y2 - sl}Z" fill="${c}"/>`;
      } else if (p.type === 'reflector') {
        const rw = Math.max(4, num(p.w, 0.5) * w), rh = Math.max(4, num(p.h, 0.08) * h), ry = top + num(p.y, 0.1) * h;
        const st = `fill="${c}" stroke="rgba(0,0,0,.45)" stroke-width="1"`;
        if (p.shape === 'round') g += `<circle cx="${cx}" cy="${ry}" r="${Math.min(rw, rh) / 2}" ${st}/>`;
        else if (p.shape === 'diamond') g += `<path d="M${cx} ${ry - rh / 2} L${cx + rw / 2} ${ry} L${cx} ${ry + rh / 2} L${cx - rw / 2} ${ry}Z" ${st}/>`;
        else if (p.shape === 'two-dots') { const r = Math.min(rw / 4.5, rh / 2); g += `<circle cx="${cx}" cy="${ry - r * 1.2}" r="${r}" ${st}/><circle cx="${cx}" cy="${ry + r * 1.2}" r="${r}" ${st}/>`; }
        else if (p.shape === 'chevron') g += `<path d="M${cx - rw / 2} ${ry - rh / 2} L${cx} ${ry} L${cx + rw / 2} ${ry - rh / 2} L${cx + rw / 2} ${ry + rh / 4} L${cx} ${ry + rh * 0.75} L${cx - rw / 2} ${ry + rh / 4}Z" ${st}/>`;
        else if (p.shape === 'strip') g += `<rect x="${x0}" y="${ry - rh / 2}" width="${w}" height="${rh}" ${st}/>`;
        else g += `<rect x="${cx - rw / 2}" y="${ry - rh / 2}" width="${rw}" height="${rh}" rx="2" ${st}/>`;
      }
    }
    g += `</g><path d="${outline}" fill="none" stroke="#1d1d1d" stroke-width="2"/>${outer}<ellipse cx="${cx}" cy="${base + 3}" rx="${w * 0.8}" ry="5" fill="rgba(0,0,0,.25)"/>`;
    if (label) g += `<text x="${cx}" y="${base + 26}" text-anchor="middle" font-family="-apple-system,'Segoe UI',system-ui,sans-serif" font-weight="700" font-size="15" fill="#ffffff" stroke="rgba(0,0,0,.55)" stroke-width="3" paint-order="stroke">${label}</text>`;
    return g;
  }
  function drawBollard(b) {
    if (b.front) {
      const two = !!b.back, h = 170, base = 250;
      let g = post(b.front, two ? 200 : 300, base, h, two ? 'Front' : '');
      if (two) g += post(b.back, 400, base, h, 'Back');
      return svg(scene(`<path d="M0 262 L600 252 V300 H0Z" fill="#555a60"/>${g}`));
    }
    return drawBollardOld(b);
  }
  function drawBollardOld(b) {
    const x = 300, base = 268, h = 150, w = b.shape === 'flat' ? 46 : 34, top = base - h;
    const c = col(b.body) || '#ffffff', cap = col(b.cap), band = col(b.band), ref = col(b.reflector), rs = b.reflectorShape;
    const outline = b.shape === 'round' ? `M${x - w / 2} ${base} L${x - w / 2} ${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${top + w / 2} L${x + w / 2} ${base}Z` : null;
    let body;
    if (b.shape === 'triangular') body = `<path d="M${x - w / 2} ${base} L${x - w / 2} ${top + 16} L${x} ${top} L${x + w / 2} ${top + 16} L${x + w / 2} ${base}Z" fill="${c}" stroke="#222" stroke-width="2"/>`;
    else if (b.shape === 'slanted') body = `<path d="M${x - w / 2} ${base} L${x - w / 2} ${top + 14} L${x + w / 2} ${top} L${x + w / 2} ${base}Z" fill="${c}" stroke="#222" stroke-width="2"/>`;
    else if (outline) body = `<path d="${outline}" fill="${c}" stroke="#222" stroke-width="2"/>`;
    else body = `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" fill="${c}" stroke="#222" stroke-width="2"/>`;
    let extra = ''; const u = ++U;
    if (cap) extra += `<clipPath id="msbc${u}"><path d="${outline || `M${x - w / 2} ${base} V${top} H${x + w / 2} V${base}Z`}"/></clipPath><rect clip-path="url(#msbc${u})" x="${x - w / 2 - 2}" y="${top - 2}" width="${w + 4}" height="44" fill="${cap}"/>`;
    if (band) extra += `<rect x="${x - w / 2 + 1}" y="${top + (cap ? 54 : 28)}" width="${w - 2}" height="16" fill="${band}"/>`;
    if (ref) {
      const ry = top + (cap ? 14 : 22);
      if (rs === 'round') extra += `<circle cx="${x}" cy="${ry + 8}" r="8" fill="${ref}" stroke="#333" stroke-width="1"/>`;
      else if (rs === 'diamond') extra += `<path d="M${x} ${ry} l9 9 l-9 9 l-9 -9Z" fill="${ref}" stroke="#333"/>`;
      else if (rs === 'strip') extra += `<rect x="${x - w / 2 + 3}" y="${ry}" width="${w - 6}" height="8" fill="${ref}" stroke="#333"/>`;
      else extra += `<rect x="${x - 7}" y="${ry}" width="14" height="22" rx="2" fill="${ref}" stroke="#333"/>`;
    }
    return svg(scene(`<path d="M0 275 L600 262 V300 H0Z" fill="#555a60"/>${body}${extra}<ellipse cx="${x}" cy="${base + 3}" rx="${w * 0.7}" ry="5" fill="rgba(0,0,0,.25)"/>`));
  }
  function plateSVG(p, x, y, w, h, bg, fs) {
    const strip = p.strip; let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="#222" stroke-width="3"/>`;
    let tx = x + w / 2;
    if (strip && col(strip.color)) {
      const sw = w * 0.11, sx = strip.side === 'right' ? x + w - sw : x;
      s += `<path d="M${sx} ${y} h${sw} v${h} h-${sw}Z" fill="${col(strip.color)}"/>`;
      if (strip.eu) { const cx = sx + sw / 2, cy = y + h * 0.36; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s += `<circle cx="${cx + Math.cos(a) * sw * 0.3}" cy="${cy + Math.sin(a) * sw * 0.3}" r="2.4" fill="#ffd700"/>`; } }
      tx += strip.side === 'right' ? -sw / 2 : sw / 2;
    }
    s += `<text x="${tx}" y="${y + h * 0.68}" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-weight="700" font-size="${fs || h * 0.52}" fill="${col(p.text) || '#111'}" letter-spacing="2">AB 123 CD</text>`;
    return s;
  }
  function drawPlate(p) {
    let inner = `<rect width="600" height="300" fill="#6c7a86"/><rect x="40" y="40" width="520" height="220" rx="24" fill="#8693a0"/>`;
    inner += plateSVG(p, 90, 80, 420, 100, col(p.bg) || '#fff');
    if (col(p.rearBg) && p.rearBg !== p.bg) {
      inner += `<text x="300" y="214" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="15" fill="#fff">Rear plate</text>`;
      inner += plateSVG(p, 215, 222, 170, 42, col(p.rearBg), 20);
    }
    return svg(inner).replace('xMidYMid slice', 'xMidYMid meet');
  }
  function drawLines(l, drive) {
    const lc = c => c === 'yellow' ? '#f2c200' : '#f4f4f4';
    let s = `<rect width="600" height="300" fill="#9fbf7a"/><path d="M190 0 L410 0 L560 300 L40 300Z" fill="#3a3d42"/>`;
    const L = (x1, y1, x2, y2, c, dash, wd) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${wd || 6}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    if (l.edge && l.edge !== 'none') { const d = l.edgeStyle === 'dashed' ? '18 14' : ''; s += L(198, 0, 58, 300, lc(l.edge), d, 5) + L(402, 0, 542, 300, lc(l.edge), d, 5); }
    if (l.center && l.center !== 'none') {
      const c = lc(l.center), st = l.centerStyle;
      if (st === 'double-solid') s += L(296, 0, 293, 300, c, '', 4) + L(304, 0, 307, 300, c, '', 4);
      else if (st === 'solid-dashed') s += L(296, 0, 293, 300, c, '', 4) + L(304, 0, 307, 300, c, '22 18', 4);
      else if (st === 'solid') s += L(300, 0, 300, 300, c, '', 6);
      else s += L(300, 0, 300, 300, c, '30 26', 6);
    }
    if (drive === 'L' || drive === 'R') { const cx = drive === 'L' ? 210 : 390; s += `<g transform="translate(${cx} 215)"><rect x="-22" y="-38" width="44" height="76" rx="12" fill="#2d6cdf" stroke="#fff" stroke-width="3"/><path d="M-14 -24 h28 l-4 16 h-20z" fill="#cfe3ff"/></g>`; }
    return svg(s);
  }
  function drawChevron(c) {
    const bg = col(c.bg) || '#fff', fg = col(c.fg) || '#000';
    let a = ''; for (let i = 0; i < 3; i++) { const x = 215 + i * 60; a += `<path d="M${x} 95 L${x + 42} 140 L${x} 185" fill="none" stroke="${fg}" stroke-width="20" stroke-linejoin="miter"/>`; }
    return svg(`<rect width="600" height="300" fill="#cfe3f2"/><path d="M0 220 H600 V300 H0Z" fill="#7da35c"/><rect x="292" y="180" width="16" height="110" fill="#8a8f96"/><rect x="170" y="80" width="260" height="120" rx="6" fill="${bg}" stroke="#333" stroke-width="3"/>${a}`);
  }
  // hide the answer inside a written clue
  function scrub(t, c) {
    let s = String(t || '');
    for (const nm of [c.name, ...(c.alt || [])]) { if (!nm) continue; s = s.replace(new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(n|ian|ese|ish|i|an)?', 'gi'), 'this country'); }
    return s;
  }
  function textClue(kind, c) {
    const o = c[kind];
    if (kind === 'language') return `<div class="ms-text">${o.sample ? `<div class="big">${esc(o.sample)}</div>` : ''}${o.letters ? `<div>Letters to look for: <b>${esc(o.letters)}</b></div>` : ''}<small>Script: ${esc(o.script || '?')}</small></div>`;
    return `<div class="ms-text"><div>${esc(scrub(o.note, c))}</div></div>`;
  }
  function drawn(kind, c) {
    if (kind === 'bollard') return drawBollard(c.bollard);
    if (kind === 'plate') return drawPlate(c.plate);
    if (kind === 'lines') return drawLines(c.lines, c.drive);
    if (kind === 'chevron') return drawChevron(c.chevron);
    return textClue(kind, c);
  }
  const hasKind = (c, k) => !!(c[k] && (k !== 'language' || c[k].sample || c[k].letters) && (k === 'language' || k === 'bollard' || k === 'plate' || k === 'lines' || k === 'chevron' || c[k].note));
  const host = u => { try { return new URL(u).hostname.split('.').slice(-2).join('.'); } catch (e) { return ''; } };
  function factsHTML(c) {
    const li = [`<li><b>Drives on the ${c.drive === 'L' ? 'left' : 'right'}.</b></li>`];
    for (const k of CLUE_KINDS) if (c[k] && (c[k].note || c[k].sample)) li.push(`<li><b>${LABEL[k]}:</b> ${esc(c[k].note || '')}${k === 'language' && c[k].sample ? ' e.g. “' + esc(c[k].sample) + '”' : ''}${c[k].src && host(c[k].src) ? ` <span class="src">${esc(host(c[k].src))}</span>` : ''}</li>`);
    if (Array.isArray(c.extra)) for (const e of c.extra) if (e && e.note) li.push(`<li><b>${esc(e.cat || 'Also')}:</b> ${esc(e.note)}</li>`);
    return `<ul>${li.join('')}</ul>`;
  }

  // ---------- question making (pure, testable) ----------
  function poolFor(C, kind, region) {
    return C.filter(c => (!region || c.region === region) && (kind === 'mix' ? CLUE_KINDS.some(k => hasKind(c, k)) : hasKind(c, kind)));
  }
  // level 0: any wrong answers; 1: same region first; 2: same region and same clue type first
  function makeQuestion(C, kind, region, recent, level, rnd) {
    rnd = rnd || Math.random;
    const pool = poolFor(C, kind, region);
    if (!pool.length) return null;
    let cands = pool.filter(c => !recent.includes(c.code)); if (!cands.length) cands = pool;
    const ans = cands[Math.floor(rnd() * cands.length)];
    const ks = kind === 'mix' ? CLUE_KINDS.filter(k => hasKind(ans, k)) : [kind];
    const k = ks[Math.floor(rnd() * ks.length)];
    const others = C.filter(c => c !== ans);
    const same = level >= 1 ? others.filter(c => c.region === ans.region && (level < 2 || hasKind(c, k))) : [];
    const pick = [];
    for (const c of K.shuffle(same, rnd)) if (pick.length < 3) pick.push(c);
    for (const c of K.shuffle(others.filter(c => !pick.includes(c)), rnd)) if (pick.length < 3) pick.push(c);
    const opts = K.shuffle([ans, ...pick], rnd);
    return { c: C.indexOf(ans), k, o: opts.map(o => C.indexOf(o)) };
  }
  const validQ = (C, q) => q && Number.isInteger(q.c) && C[q.c] && CLUE_KINDS.includes(q.k) && hasKind(C[q.c], q.k) && Array.isArray(q.o) && q.o.length === 4 &&
    q.o.every(i => Number.isInteger(i) && C[i]) && new Set(q.o).size === 4 && q.o.includes(q.c);
  const pointsFor = (streak, typed) => (10 + 2 * Math.min(Math.max(0, streak - 1), 10)) * (typed ? 2 : 1);
  const racePoints = left => 100 + Math.round(50 * Math.max(0, Math.min(1, left / RACE_T)));

  K.style('ludus-metaspot', `
.ms .ms-top{flex-wrap:wrap;row-gap:6px}
.ms .ms-status{justify-content:space-between;font:650 12px/1 var(--font);color:var(--ink-2);min-height:18px}
.ms .ms-status b{color:var(--ink)}
.ms-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px}
.ms-ans{flex:none;display:flex;flex-direction:column;gap:6px}
.ms.side .ms-main{flex-direction:row}
.ms.side .ms-clue{flex:1.35 1 0;min-width:0}
.ms.side .ms-ans{flex:1 1 0;min-width:0;justify-content:center}
.ms-clue{position:relative;flex:1 1 auto;min-height:120px;border-radius:var(--r-md);overflow:hidden;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}
.ms-clue.plate{background:#6c7a86}
.ms-clue>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.ms-text{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px 18px;overflow:auto;font:500 14.5px/1.45 var(--font);color:var(--ink);user-select:text;-webkit-user-select:text}
.ms-text .big{font:600 clamp(18px,5.4vw,26px)/1.25 var(--font);overflow-wrap:anywhere}
.ms-text small{color:var(--ink-3);font-size:12px}
.ms-kind{position:absolute;left:8px;top:8px;z-index:2;padding:4px 9px;border-radius:999px;background:rgba(20,18,15,.62);color:#fff;font:650 11px/1 var(--font-round);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.ms-reveal{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;background:var(--surface);border-radius:var(--r-md);box-shadow:inset 0 0 0 1px var(--line)}
.ms-reveal h3{margin:0;padding:12px 14px 6px;font:800 17px/1.2 var(--font-round)}
.ms-reveal h3 em{font-style:normal;color:var(--good)}
.ms-reveal h3 s{text-decoration:none;color:var(--bad)}
.ms-reveal .lk-scroll{flex:1;padding:0 14px 8px}
.ms-reveal ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;color:var(--ink-2);font-size:12.5px;user-select:text;-webkit-user-select:text}
.ms-reveal li b{color:var(--ink)}
.ms-reveal .src{color:var(--ink-3);font-size:11px}
.ms-reveal .lk-row{padding:0 12px 12px;justify-content:flex-end}
.ms-opts{display:flex;flex-direction:column;gap:6px;flex:none}
.ms-opt .who{display:flex;gap:3px;flex:none}
.ms-opt .who u{width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1.5px var(--surface)}
.ms-study .lk-panel{max-width:460px;height:100%}
.ms-study input{height:38px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);padding:0 12px;font:600 14px var(--font);outline:none}
.ms-study input:focus{border-color:var(--accent)}
.ms-scard{border-radius:var(--r-md);background:var(--surface-2);overflow:hidden;flex:none}
.ms-scard h4{margin:0;padding:10px 12px 6px;font:800 15px var(--font-round);display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.ms-scard h4 small{font:600 11px var(--font);color:var(--ink-3)}
.ms-thumbs{display:grid;grid-template-columns:repeat(2,1fr);gap:2px;padding:0 2px}
.ms-thumbs>div{position:relative;aspect-ratio:2/1;overflow:hidden}
.ms-thumbs svg{position:absolute;inset:0;width:100%;height:100%}
.ms-scard ul{margin:0;padding:8px 12px 12px 26px;font-size:12px;color:var(--ink-2);display:flex;flex-direction:column;gap:3px}
.ms-scard ul b{color:var(--ink)}
.ms-scard .src{color:var(--ink-3);font-size:10.5px}
.ms-table{width:100%;border-collapse:collapse;font:600 13px var(--font)}
.ms-table td{padding:6px 4px;border-top:1px solid var(--line)}
.ms-table td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.ms-table tr.win td{color:var(--good)}
.ms-table u{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
`);

  Ludus.register({
    id: 'metaspot', name: 'Clue Spotter', aka: 'bollards, plates, road lines, countries, geography', tag: 'Puzzle', tint: '#2f7d55',
    online: { min: 2, max: 4 },
    hint: 'Pick <kbd>1</kbd>-<kbd>4</kbd> or click · <kbd>Tab</kbd> Type it · <kbd>Enter</kbd> Next · <kbd>Esc</kbd> pauses',
    onlineHint: 'Same clues for everyone · <kbd>1</kbd>-<kbd>4</kbd> to answer · faster right answers score more',
    _rules: { makeQuestion, poolFor, hasKind, pointsFor, racePoints, validQ, scrub, drawn },
    art(ctx, w, h) {
      const u = Math.min(h / 78, w / 190), gy = h * 0.8;
      // sky, ground and road
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3d9168'); g.addColorStop(1, '#2a6e4b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, gy, w, h - gy);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; for (let x = -6 * u; x < w; x += 22 * u) ctx.fillRect(x, gy + 6 * u, 12 * u, 2.2 * u);
      // exit-style sign on two posts
      const sw = 88 * u, sh = 40 * u, sx = w / 2 - sw / 2 - 6 * u, sy = h * 0.14;
      ctx.fillStyle = '#d9dcd5'; ctx.fillRect(sx + sw * 0.22, sy + sh, 3.2 * u, gy - sy - sh); ctx.fillRect(sx + sw * 0.78 - 3.2 * u, sy + sh, 3.2 * u, gy - sy - sh);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; Ludus.draw.roundRect(ctx, sx + 1.5 * u, sy + 2.5 * u, sw, sh, 6 * u); ctx.fill();
      ctx.fillStyle = '#0f6b3a'; Ludus.draw.roundRect(ctx, sx, sy, sw, sh, 6 * u); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * u; Ludus.draw.roundRect(ctx, sx + 3 * u, sy + 3 * u, sw - 6 * u, sh - 6 * u, 4 * u); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${17 * u}px ui-rounded, -apple-system, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('? ? ?', sx + sw / 2 - 8 * u, sy + sh / 2 + 1 * u);
      ctx.beginPath(); const ax = sx + sw - 18 * u, ay = sy + sh / 2; ctx.moveTo(ax - 6 * u, ay + 6 * u); ctx.lineTo(ax + 4 * u, ay - 4 * u); ctx.lineTo(ax + 4 * u, ay + 2 * u); ctx.moveTo(ax + 4 * u, ay - 4 * u); ctx.lineTo(ax - 2 * u, ay - 4 * u); ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      // bollard on the right: white post, black cap, orange reflector
      const bx = w / 2 + sw / 2 + 14 * u, bw = 11 * u, bt = gy - 34 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(bx + bw / 2, gy + 1 * u, bw * 0.8, 2 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fbfbf7'; Ludus.draw.roundRect(ctx, bx, bt, bw, gy - bt, 2.5 * u); ctx.fill();
      ctx.fillStyle = '#202020'; Ludus.draw.roundRect(ctx, bx, bt, bw, 9 * u, 2.5 * u); ctx.fill(); ctx.fillRect(bx, bt + 5 * u, bw, 4 * u);
      ctx.fillStyle = '#f08a1c'; Ludus.draw.roundRect(ctx, bx + 3 * u, bt + 11 * u, bw - 6 * u, 7 * u, 1.2 * u); ctx.fill();
      // plate on the left
      const px = w / 2 - sw / 2 - 50 * u, py = gy - 15 * u, pw = 34 * u, ph = 10 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; Ludus.draw.roundRect(ctx, px + 1 * u, py + 1.5 * u, pw, ph, 2 * u); ctx.fill();
      ctx.fillStyle = '#ffffff'; Ludus.draw.roundRect(ctx, px, py, pw, ph, 2 * u); ctx.fill();
      ctx.fillStyle = '#1f4fb4'; Ludus.draw.roundRect(ctx, px, py, 5 * u, ph, 2 * u); ctx.fill(); ctx.fillRect(px + 3 * u, py, 2 * u, ph);
      ctx.fillStyle = '#222'; ctx.font = `700 ${6.4 * u}px ui-monospace, Menlo, monospace`; ctx.fillText('AB 123', px + pw / 2 + 2.5 * u, py + ph / 2 + 0.4 * u);
    },
    create(stage, api) {
      const on = api.online, isHost = !on || on.isHost, mySeat = on ? on.seat : 0;
      const el = K.el;
      let C = null, destroyed = false;
      const offs = [];
      const later = (fn, ms) => { const t = setTimeout(() => { if (!destroyed) fn(); }, ms); offs.push(() => clearTimeout(t)); return t; };

      // ----- settings kept between runs -----
      const S = api.settings;
      const saved0 = S.metaspot && typeof S.metaspot === 'object' ? S.metaspot : {};
      let kind = KINDS.some(k => k[0] === saved0.kind) ? saved0.kind : 'mix';
      let region = REGIONS.includes(saved0.region) ? saved0.region : '';
      let typed = saved0.typed === true && !on;
      const remember = () => { if (on) return; S.metaspot = { kind, region, typed }; Ludus.save(); };

      // ----- DOM -----
      const root = el('div', 'lk ms'); stage.appendChild(root);
      const top = el('div', 'lk-row ms-top'); root.appendChild(top);
      const kindChip = el('button', 'lk-chip'), regionChip = el('button', 'lk-chip'), modeChip = el('button', 'lk-chip'), studyChip = el('button', 'lk-chip', 'Study');
      [kindChip, regionChip, modeChip].forEach(b => { b.type = 'button'; });
      top.append(kindChip, regionChip, modeChip, el('span', 'lk-grow'), studyChip);
      const status = el('div', 'lk-row ms-status'); root.appendChild(status);
      const stLeft = el('span', 'lk-grow'), stRight = el('div', 'lk-row'); status.append(stLeft, stRight);
      const barBox = el('div', 'lk-bar'), bar = el('i'); barBox.appendChild(bar); barBox.hidden = true; root.appendChild(barBox);
      const main = el('div', 'ms-main'); root.appendChild(main);
      const clueBox = el('div', 'ms-clue'); main.appendChild(clueBox);
      const ansCol = el('div', 'ms-ans'); main.appendChild(ansCol);
      const optsBox = el('div', 'ms-opts'); ansCol.appendChild(optsBox);
      const typeBox = el('div'); ansCol.appendChild(typeBox);
      // a landscape panel puts the answers beside the clue instead of under it
      const fitSide = () => { const r = stage.getBoundingClientRect(); root.classList.toggle('side', r.width > r.height * 1.25); };
      const ro = new ResizeObserver(fitSide); ro.observe(stage); fitSide();
      const ta = K.typeahead(typeBox, {
        placeholder: 'Type a country', button: 'Guess', max: 3,
        find: q => { const n = K.norm(q); return C ? C.filter(c => K.norm(c.name).startsWith(n) || (c.alt || []).some(a => K.norm(a).startsWith(n)) || K.norm(c.name).includes(' ' + n)) : []; },
        label: c => c.name, sub: c => c.region, pick: c => answer(C.indexOf(c), null)
      });
      typeBox.hidden = true;
      const sheet = el('div', 'lk-sheet'); sheet.hidden = true; root.appendChild(sheet);

      // ----- local state -----
      let q = null, phase = 'boot', lives = LIVES, streak = 0, score = 0, n = 0, recent = [], chosen = -1, autoNext = 0;
      // ----- race state -----
      let plan = null, round = -1, left = RACE_T, answers = [], raceStarted = false, nextAt = 0;
      const seats = () => on ? on.seats.slice() : [0];
      const nameOf = s => on ? (on.names[s] || 'Player ' + (s + 1)) : 'You';

      function chips() {
        kindChip.textContent = (KINDS.find(k => k[0] === kind) || KINDS[0])[1];
        regionChip.textContent = region || 'All regions';
        modeChip.textContent = typed ? 'Type it' : 'Pick it';
        const lock = !!on;
        kindChip.disabled = regionChip.disabled = lock; modeChip.hidden = lock; studyChip.hidden = lock;
      }
      kindChip.onclick = () => { const i = KINDS.findIndex(k => k[0] === kind); kind = KINDS[(i + 1) % KINDS.length][0]; remember(); chips(); api.sfx('click'); if (phase === 'ask' || phase === 'reveal') nextQuestion(true); };
      regionChip.onclick = () => { region = REGIONS[(REGIONS.indexOf(region) + 1) % REGIONS.length]; remember(); chips(); api.sfx('click'); if (phase === 'ask' || phase === 'reveal') nextQuestion(true); };
      modeChip.onclick = () => { typed = !typed; remember(); chips(); api.sfx('click'); if (phase === 'ask') showAnswerArea(); };
      [kindChip, regionChip, modeChip, studyChip].forEach(b => b.addEventListener('click', () => b.blur()));
      studyChip.onclick = () => { api.sfx('click'); openStudy(); };

      function hud() {
        stRight.innerHTML = '';
        if (on) {
          const tot = totals(), row = el('div', 'lk-seats');
          seats().forEach(s => {
            const p = el('span', 'lk-seat' + (answers[round] && answers[round][s] ? ' done' : '')), d = el('u'); d.style.background = K.SEAT_COLORS[s];
            p.append(d, el('span', '', nameOf(s)), el('b', '', tot[s] || 0)); row.appendChild(p);
          });
          stLeft.textContent = round >= 0 ? `Clue ${Math.min(round + 1, RACE_N)} of ${RACE_N}` : 'Race';
          stRight.appendChild(row);
        } else {
          stLeft.innerHTML = q ? `<b>#${n}</b> · Name the country` + (streak >= 2 ? ` · streak <b>${streak}</b>` : '') : '';
          stRight.appendChild(K.hearts(lives, LIVES));
        }
      }

      function showClue(qq) {
        const c = C[qq.c];
        clueBox.innerHTML = drawn(qq.k, c);
        clueBox.classList.toggle('plate', qq.k === 'plate');
        const tag = el('span', 'ms-kind', LABEL[qq.k]); clueBox.appendChild(tag);
      }
      function showAnswerArea() {
        const typing = typed && !on;
        optsBox.hidden = typing; typeBox.hidden = !typing;
        if (typing) { ta.clear(); ta.disabled = phase !== 'ask'; if (phase === 'ask') ta.focus(); }
      }
      function renderOptions(qq, reveal) {
        optsBox.innerHTML = '';
        qq.o.forEach((ci, i) => {
          const b = el('button', 'lk-opt ms-opt'); b.type = 'button';
          b.append(el('span', 'n', i + 1), el('span', 't', C[ci].name));
          if (reveal) {
            b.disabled = true;
            if (ci === qq.c) b.classList.add('right');
            else if (ci === chosen) b.classList.add('wrong');
            else b.classList.add('dim');
            if (on && answers[round]) {
              const who = el('span', 'who');
              seats().forEach(s => { const a = answers[round][s]; if (a && a.o === i) { const d = el('u'); d.style.background = K.SEAT_COLORS[s]; who.appendChild(d); } });
              b.appendChild(who);
            }
          } else if (on && chosen >= 0) {
            b.disabled = true; if (ci === chosen) b.style.borderColor = 'var(--accent)';
          }
          b.onclick = () => answer(ci, b);
          optsBox.appendChild(b);
        });
      }
      function revealCard(right, picked) {
        const c = C[q.c];
        const box = el('div', 'ms-reveal lk-pop');
        const h = el('h3'); h.innerHTML = right ? `<em>Right.</em> It's ${esc(c.name)}.` : `${picked >= 0 ? `<s>Not ${esc(C[picked].name)}.</s> ` : ''}It's ${esc(c.name)}.`;
        const sc = el('div', 'lk-scroll'); sc.innerHTML = factsHTML(c);
        box.append(h, sc);
        if (!on) {
          const row = el('div', 'lk-row'), nx = el('button', 'lk-btn lk-primary', lives > 0 ? 'Next clue' : 'See score');
          nx.onclick = () => { api.sfx('click'); goNext(); };
          row.appendChild(nx); box.appendChild(row);
        }
        clueBox.appendChild(box);
      }

      // ----- solo play -----
      function nextQuestion(keepCount) {
        if (on || !C) return;
        const x = makeQuestion(C, kind, region, recent, api.level + 1 > 2 ? 2 : api.level + 1, Math.random);
        if (!x) { clueBox.innerHTML = '<div class="ms-text"><div>No countries have this clue in this region yet. Change the clue type or region.</div></div>'; optsBox.innerHTML = ''; phase = 'empty'; return; }
        q = x; chosen = -1; phase = 'ask'; autoNext = 0;
        if (!keepCount) n++; else if (!n) n = 1;
        recent.push(C[q.c].code); if (recent.length > 12) recent.shift();
        showClue(q); renderOptions(q, false); showAnswerArea(); hud();
      }
      function goNext() {
        if (on || phase !== 'reveal') return;
        if (lives <= 0) { phase = 'over'; api.over({ score, title: 'Out of lives', message: `${rightN} right · best streak ${bestStreak}` }); return; }
        nextQuestion(false);
      }
      let bestStreak = 0, rightN = 0;
      function answer(ci, btn) {
        if (!C || !q || phase !== 'ask' || !Number.isInteger(ci) || !C[ci]) return;
        if (on) return raceAnswer(ci);
        chosen = ci; phase = 'reveal';
        const right = ci === q.c;
        if (right) { streak++; rightN++; bestStreak = Math.max(bestStreak, streak); const pts = pointsFor(streak, typed); score += pts; api.score(score); api.sfx(streak % 5 === 0 ? 'win' : 'score'); autoNext = performance.now() + 1100; }
        else { streak = 0; lives--; api.sfx('over'); }
        renderOptions(q, true); ta.disabled = true;
        if (typed && !right) optsBox.hidden = false;   // show the right answer among four after a typed miss
        if (right && typed) { optsBox.hidden = true; }
        revealCard(right, ci);
        hud();
      }

      // ----- online race -----
      function totals() {
        const t = {};
        seats().forEach(s => { t[s] = 0; });
        answers.forEach((row, r) => { if (!row || !plan || !plan[r]) return; Object.keys(row).forEach(s => { const a = row[s]; if (a && plan[r].o[a.o] === plan[r].c) t[s] = (t[s] || 0) + racePoints(a.left); }); });
        return t;
      }
      function raceAnswer(ci) {
        if (phase !== 'ask' || chosen >= 0) return;
        const oi = plan[round].o.indexOf(ci); if (oi < 0) return;
        chosen = ci; api.sfx('click');
        (answers[round] = answers[round] || {})[mySeat] = { o: oi, left: Math.max(0, left) };
        on.send('ans', { r: round, o: oi, l: Math.round(Math.max(0, left) * 100) / 100 });
        renderOptions(q, false); hud(); checkRoundDone();
      }
      function startRound(r) {
        if (!plan || !plan[r]) return;
        round = r; q = plan[r]; chosen = -1; left = RACE_T; phase = 'ask'; nextAt = 0;
        const mine = answers[r] && answers[r][mySeat]; if (mine) chosen = q.o[mine.o];
        barBox.hidden = false; showClue(q); renderOptions(q, false); showAnswerArea(); hud(); sheet.hidden = true;
      }
      function everyoneAnswered() { const row = answers[round] || {}; return seats().every(s => row[s]); }
      function checkRoundDone() { if (isHost && phase === 'ask' && (everyoneAnswered() || left <= 0)) endRound(round, true); }
      function endRound(r, send) {
        if (r !== round || phase !== 'ask') return;
        if (send) on.send('end', { r });
        phase = 'reveal'; left = Math.min(left, RACE_T);
        const mine = answers[r] && answers[r][mySeat];
        const right = !!mine && q.o[mine.o] === q.c;
        api.sfx(right ? 'score' : 'over');
        renderOptions(q, true); revealCard(right, mine ? q.o[mine.o] : -1);
        api.score(totals()[mySeat] || 0); hud();
        if (r >= RACE_N - 1) { later(finishRace, 2600); return; }
        if (isHost) nextAt = performance.now() + NEXT_MS;
      }
      function finishRace() {
        if (phase === 'over') return;
        phase = 'over'; barBox.hidden = true;
        const tot = totals(), ids = seats(), top = Math.max(...ids.map(s => tot[s] || 0)), winners = ids.filter(s => (tot[s] || 0) === top);
        sheet.innerHTML = ''; const p = el('div', 'lk-panel lk-pop');
        p.appendChild(el('h2', '', winners.length > 1 ? 'A tie' : winners[0] === mySeat ? 'You win' : nameOf(winners[0]) + ' wins'));
        const t = el('table', 'ms-table');
        ids.slice().sort((a, b) => (tot[b] || 0) - (tot[a] || 0)).forEach(s => {
          const tr = el('tr', winners.includes(s) ? 'win' : ''), a = el('td'), d = el('u'); d.style.background = K.SEAT_COLORS[s];
          a.append(d, document.createTextNode(nameOf(s) + (s === mySeat ? ' (you)' : '')));
          const right = answers.filter((row, r) => row && row[s] && plan[r] && plan[r].o[row[s].o] === plan[r].c).length;
          tr.append(a, el('td', '', `${right}/${RACE_N} right`), el('td', '', tot[s] || 0)); t.appendChild(tr);
        });
        p.appendChild(t); sheet.appendChild(p); sheet.hidden = false;
        api.score(tot[mySeat] || 0);
        api.over({ score: tot[mySeat] || 0, won: winners.length === 1 && winners[0] === mySeat, title: winners.length > 1 ? 'A tie' : winners[0] === mySeat ? 'You win' : nameOf(winners[0]) + ' wins', message: `${tot[mySeat] || 0} points` });
      }
      function showRaceSetup() {
        phase = 'setup'; sheet.innerHTML = ''; const p = el('div', 'lk-panel lk-pop');
        p.appendChild(el('h2', '', 'Meta Spotter race'));
        p.appendChild(el('p', 'lk-muted', isHost ? `Same ${RACE_N} clues for everyone, ${RACE_T} seconds each. Faster right answers score more.` : 'The host is choosing the clues.'));
        const row = (label, opts, cur, pick) => {
          p.appendChild(el('span', 'lk-label', label)); const r = el('div', 'lk-chips');
          opts.forEach(([v, l]) => { const b = el('button', 'lk-chip' + (v === cur ? ' on' : ''), l); b.type = 'button'; b.disabled = !isHost; b.onclick = () => { pick(v); api.sfx('click'); sendCfg(); showRaceSetup(); }; r.appendChild(b); });
          p.appendChild(r);
        };
        row('Clues', KINDS, kind, v => { kind = v; });
        row('Region', REGIONS.map(r => [r, r || 'All']), region, v => { region = v; });
        if (isHost) {
          const go = el('button', 'lk-btn lk-primary', 'Start'); go.onclick = beginRace; p.appendChild(go);
          p.appendChild(el('p', 'lk-muted', `${on.count} of ${on.max} players here`));
        } else p.appendChild(el('p', 'lk-muted', 'Waiting for the host to start…'));
        sheet.appendChild(p); sheet.hidden = false; chips(); hud();
      }
      const sendCfg = () => { if (isHost && on) on.send('cfg', { k: kind, g: region }); };
      function beginRace() {
        if (!isHost || phase !== 'setup' || !C) return;
        const rec = [], list = [];
        for (let i = 0; i < RACE_N; i++) { const x = makeQuestion(C, kind, region, rec, 2, Math.random); if (!x) break; list.push(x); rec.push(C[x.c].code); if (rec.length > 12) rec.shift(); }
        if (list.length < RACE_N) { api.toast('Not enough countries for these clues'); return; }
        plan = list; raceStarted = true; api.sfx('click');
        on.send('plan', { k: kind, g: region, p: plan }); on.send('rnd', { r: 0 });
        startRound(0);
      }

      if (on) {
        const okInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
        on.on('cfg', (d, from) => {
          if (from !== 0 || isHost || !d || !KINDS.some(k => k[0] === d.k) || !REGIONS.includes(d.g)) return;
          kind = d.k; region = d.g; if (phase === 'setup') showRaceSetup();
        });
        on.on('plan', (d, from) => {
          if (from !== 0 || isHost || !d || !Array.isArray(d.p) || d.p.length !== RACE_N || !C) return;
          if (!d.p.every(x => validQ(C, x))) return;
          plan = d.p.map(x => ({ c: x.c, k: x.k, o: x.o.slice() }));
          if (KINDS.some(k => k[0] === d.k)) kind = d.k; if (REGIONS.includes(d.g)) region = d.g;
        });
        on.on('rnd', (d, from) => {
          if (from !== 0 || isHost || !d || !okInt(d.r, 0, RACE_N - 1) || !plan) return;
          if (raceStarted && d.r <= round) return;
          if (round >= 0 && phase === 'ask' && d.r > round) { phase = 'ask'; endRound(round, false); }
          raceStarted = true; startRound(d.r);
        });
        on.on('ans', (d, from) => {
          if (!d || !okInt(d.r, 0, RACE_N - 1) || !okInt(d.o, 0, 3) || !okInt(from, 0, 3) || typeof d.l !== 'number' || !(d.l >= 0 && d.l <= RACE_T)) return;
          const row = (answers[d.r] = answers[d.r] || {}); if (row[from]) return;
          row[from] = { o: d.o, left: d.l };
          if (d.r === round) { hud(); checkRoundDone(); }
        });
        on.on('end', (d, from) => { if (from !== 0 || isHost || !d || !okInt(d.r, 0, RACE_N - 1)) return; if (d.r === round) endRound(d.r, false); });
        on.on('hello', (d, from) => {
          if (!isHost) return;
          on.sendTo(from, 'cfg', { k: kind, g: region });
          if (plan) { on.sendTo(from, 'plan', { k: kind, g: region, p: plan }); on.sendTo(from, 'rnd', { r: Math.max(0, round) }); }
        });
        on.onLeave(() => { hud(); checkRoundDone(); });
      }

      // ----- study list -----
      function openStudy() {
        if (!C) return;
        sheet.innerHTML = ''; sheet.className = 'lk-sheet ms-study';
        const p = el('div', 'lk-panel');
        const head = el('div', 'lk-row'); head.append(el('h2', 'lk-grow', 'Study'));
        const close = el('button', 'lk-btn', 'Close'); close.onclick = () => { sheet.hidden = true; sheet.className = 'lk-sheet'; api.sfx('click'); if (typed && phase === 'ask') ta.focus(); };
        head.appendChild(close); p.appendChild(head);
        const find = el('input'); find.placeholder = 'Find a country'; find.setAttribute('aria-label', 'Find a country');
        find.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close.click(); });
        const list = el('div', 'lk-scroll'); list.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1';
        p.append(find, list);
        const render = () => {
          list.innerHTML = ''; const nq = K.norm(find.value);
          C.filter(c => (!region || c.region === region) && (!nq || K.norm(c.name).includes(nq))).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            const card = el('article', 'ms-scard'); const h = el('h4'); h.append(document.createTextNode(c.name), el('small', '', c.region)); card.appendChild(h);
            const th = ['bollard', 'plate', 'lines', 'chevron'].filter(k => hasKind(c, k));
            if (th.length) { const t = el('div', 'ms-thumbs'); th.forEach(k => { const d = el('div'); d.innerHTML = drawn(k, c); t.appendChild(d); }); card.appendChild(t); }
            const f = el('div'); f.innerHTML = factsHTML(c); card.appendChild(f.firstChild);
            list.appendChild(card);
          });
          if (!list.children.length) list.appendChild(el('p', 'lk-muted', 'No country matches.'));
        };
        find.addEventListener('input', render); render();
        sheet.appendChild(p); sheet.hidden = false;
        try { find.focus({ preventScroll: true }); } catch (e) {}
      }

      // ----- keys and frame loop -----
      api.keys(e => {
        if (!sheet.hidden && sheet.classList.contains('ms-study')) return;
        const k = e.key;
        if (phase === 'ask' && !(typed && !on) && /^[1-4]$/.test(k)) { const b = optsBox.children[+k - 1]; if (b && !b.disabled) b.click(); return; }
        if (phase === 'reveal' && !on && (k === 'Enter' || k === ' ') && !e.repeat) { e.preventDefault(); goNext(); return; }
        if (k === 'Tab' && !on && (phase === 'ask' || phase === 'reveal')) { e.preventDefault(); modeChip.click(); }
        if (phase === 'setup' && isHost && k === 'Enter') beginRace();
      });
      api.loop(dt => {
        if (on && phase === 'ask' && round >= 0) {
          left = Math.max(0, left - dt);
          const f = left / RACE_T; bar.style.transform = `scaleX(${f})`; bar.classList.toggle('low', left < 4);
          if (left <= 0) { if (isHost) checkRoundDone(); else if (chosen < 0) { chosen = -2; renderOptions(q, false); } }
        }
        if (on && isHost && phase === 'reveal' && nextAt && performance.now() > nextAt && round < RACE_N - 1) { nextAt = 0; on.send('rnd', { r: round + 1 }); startRound(round + 1); }
        if (!on && phase === 'reveal' && autoNext && performance.now() > autoNext) { autoNext = 0; if (chosen === q.c) goNext(); }
      });

      // ----- save and restore (solo only) -----
      function restore(s) {
        try {
          if (!s || s.v !== 1 || !validQ(C, s.q)) return false;
          if (KINDS.some(k => k[0] === s.kind)) kind = s.kind; if (REGIONS.includes(s.region)) region = s.region; typed = !!s.typed;
          lives = Math.max(1, Math.min(LIVES, s.lives | 0)); streak = Math.max(0, s.streak | 0); bestStreak = Math.max(streak, s.best | 0); rightN = Math.max(0, s.right | 0);
          score = Math.max(0, s.score | 0); n = Math.max(1, s.n | 0); recent = Array.isArray(s.recent) ? s.recent.filter(x => typeof x === 'string').slice(-12) : [];
          q = { c: s.q.c, k: s.q.k, o: s.q.o.slice() }; chosen = -1; phase = 'ask';
          chips(); showClue(q); renderOptions(q, false); showAnswerArea(); hud(); api.score(score);
          return true;
        } catch (e) { return false; }
      }
      function snapshot() {
        if (on || destroyed || !C || !q || phase === 'over' || phase === 'boot' || phase === 'empty') return null;
        if (phase === 'reveal' && lives <= 0) return null;
        // a clue already answered is saved as the next one, so coming back never repeats a scored question
        let qq = q;
        if (phase === 'reveal') { qq = makeQuestion(C, kind, region, recent, 2, Math.random); if (!qq) return null; }
        return { v: 1, kind, region, typed, lives, streak, best: bestStreak, right: rightN, score, n: phase === 'reveal' ? n + 1 : n, recent: recent.slice(-12), q: qq };
      }

      // ----- boot -----
      function bootFail() {
        phase = 'error'; sheet.innerHTML = ''; const p = el('div', 'lk-panel');
        p.append(el('h2', '', 'Could not load the clues'), el('p', 'lk-muted', 'The clue file did not open. Try again.'));
        const b = el('button', 'lk-btn lk-primary', 'Try again'); b.onclick = boot; p.appendChild(b);
        sheet.appendChild(p); sheet.hidden = false;
      }
      async function boot() {
        phase = 'boot'; sheet.innerHTML = '<div class="lk-spin"></div>'; sheet.hidden = false; chips();
        try {
          const data = await K.loadData('metaspot', DATA);
          if (destroyed) return;
          if (!Array.isArray(data) || !data.length) throw new Error('empty');
          C = data;
          sheet.hidden = true;
          if (on) {
            if (isHost) showRaceSetup();
            else { showRaceSetup(); const hi = () => { if (!raceStarted && !destroyed) { on.send('hello', {}); later(hi, 2500); } }; hi(); }
            return;
          }
          if (!(api.saved && restore(api.saved))) nextQuestion(false);
        } catch (e) { if (!destroyed) bootFail(); }
      }
      chips(); hud(); boot();

      if (window.ludusDebug) window.ludusDebug.metaspot = () => ({ phase, q, lives, streak, score, n, kind, region, typed, round, left, plan: plan && plan.length, answers: JSON.parse(JSON.stringify(answers)) });
      return {
        save: snapshot,
        pause() { try { ta.input.blur(); } catch (e) {} },
        resume() { if (phase === 'ask' && typed && !on) ta.focus(); },
        destroy() { destroyed = true; offs.forEach(f => f()); try { ro.disconnect(); } catch (e) {} root.remove(); }
      };
    }
  });
})();
