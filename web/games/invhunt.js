/* Invader Hunt: you get a Space Invader mosaic's ID tag (like PA_267). Drop a pin where you think it is on the map;
   the closer, the more points. City hunt: one city's streets. World hunt: any invaded city on Earth (the letters before
   the underscore are the city code). Code breaker: see a code, pick its city, three lives.
   Data: games/invhunt/data.js, positions and status from the community dataset by goguelnikov
   (github.com/goguelnikov/SpaceInvaders, MIT licence). Map tiles in games/invhunt/tiles (© OpenStreetMap contributors).
   The pixel badge is drawn from the ID, it is not the real artwork. Everything works offline. */
(function () {
  const K = Ludus.dom;
  const DATA = 'games/invhunt/data.js', TILES = 'games/invhunt/tiles/';
  const MODES = [['city', 'City hunt'], ['world', 'World hunt'], ['code', 'Code breaker']];
  const LENS = [5, 10];
  const STATUS = ['On the wall', 'Damaged', 'Destroyed', 'Unknown'];
  const HINT_COST = 500, MAX_PTS = 5000, CODE_LIVES = 3;
  const NAMES = { AIX: 'Aix-en-Provence', AMI: 'Amiens', AMS: 'Amsterdam', ANVR: 'Antwerp', ANZR: 'Anzère', AVI: 'Avignon', BGK: 'Bangkok', BRC: 'Barcelona', BSL: 'Basel', BTA: 'Bastia', BRL: 'Berlin', BRN: 'Bern', BT: 'Bhutan', BAB: 'Biarritz-Anglet-Bayonne', BBO: 'Bilbao', BXL: 'Brussels', CCU: 'Cancún', CAPF: 'Cap Ferret', CHAR: 'Charleroi', CLR: 'Clermont-Ferrand', CON: 'Contis-les-Bains', CAZ: 'Côte d’Azur', DJN: 'Daejeon', DHK: 'Dhaka', DIJ: 'Dijon', DJBA: 'Djerba', ELT: 'Eilat', FAO: 'Faro', FTBL: 'Fontainebleau', FRQ: 'Forcalquier', FKF: 'Frankfurt', GNV: 'Geneva', GRN: 'Grenoble', GRU: 'Grude', GRTI: 'Grumeti', HALM: 'Halmstad', HK: 'Hong Kong', IST: 'Istanbul', KAT: 'Kathmandu', KLN: 'Cologne', LCT: 'La Ciotat', REUN: 'La Réunion', LAP: 'Lapland', LSN: 'Lausanne', LIL: 'Lille', LJU: 'Ljubljana', LDN: 'London', LND: 'London', LA: 'Los Angeles', LBR: 'Luberon', LY: 'Lyon', MAN: 'Manchester', MRAK: 'Marrakech', MARS: 'Marseille', MLB: 'Melbourne', MEN: 'Menorca', MIA: 'Miami', MBSA: 'Mombasa', MTB: 'Montauban', MPL: 'Montpellier', MUN: 'Munich', MLGA: 'Málaga', NA: 'Nantes', NY: 'New York', NCL: 'Newcastle', NOO: 'Noordwijk', NIM: 'Nîmes', ORLN: 'Orléans', PA: 'Paris', PAU: 'Pau', PRP: 'Perpignan', PRT: 'Perth', POTI: 'Potosí', RBA: 'Rabat', RA: 'Ravenna', RDU: 'Redu', RN: 'Rennes', ROM: 'Rome', RTD: 'Rotterdam', SD: 'San Diego', SL: 'Seoul', STK: 'Stockholm', SP: 'São Paulo', TK: 'Tokyo', TLS: 'Toulouse', VLMO: 'Valmorel', VRN: 'Varanasi', VRS: 'Versailles', WN: 'Vienna', VSB: 'Visby' };
  const cityOf = c => NAMES[c] || c;
  const canon = c => c === 'LND' ? 'LDN' : c;

  // ---------- geometry and scoring (pure, testable) ----------
  function px(lat, lng, z) { const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; }
  function ll(x, y, z) { const n = 256 * 2 ** z, lng = x / n * 360 - 180, k = Math.PI - 2 * Math.PI * y / n; return [180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))), lng]; }
  function dist(a, b) { const R = 6371e3, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  const fmtD = m => m < 1000 ? Math.round(m) + ' m' : m < 100000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 1000).toLocaleString() + ' km';
  function points(mode, d, hint) {
    const p = mode === 'world' ? Math.round(MAX_PTS * Math.exp(-d / 1.45e6)) : Math.round(MAX_PTS * Math.exp(-Math.max(0, d - 20) / 330));
    return Math.max(0, p - (hint ? HINT_COST : 0));
  }
  function inBounds(r, T) { const [x, y] = px(r.lat, r.lng, T.z); return x >= T.x0 * 256 + 8 && x <= (T.x0 + T.nx) * 256 - 8 && y >= T.y0 * 256 + 8 && y <= (T.y0 + T.ny) * 256 - 8; }

  // ---------- pixel badge from the ID (a stand-in, not the real artwork) ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const PALS = [['#ff3c7a', '#ffd23c'], ['#1f6fd8', '#7fd1ff'], ['#18a058', '#c6f36b'], ['#8a3cff', '#ff9de0'], ['#ff7a1a', '#fff066'], ['#111111', '#e0e0e0']];
  function sprite(cv, id) {
    const g = cv.getContext('2d'), N = 16; cv.width = N; cv.height = N;
    let h = hash(id); const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const pal = PALS[Math.floor(rnd() * 6)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g.fillStyle = (x + y) % 2 ? '#ebe7dc' : '#f4f1e8'; g.fillRect(x, y, 1, 1); }
    const w = 5, hgt = 8, ox = 3, oy = 4;
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) { if (rnd() < 0.55 || (x === w - 1 && y > 1 && y < 6)) { g.fillStyle = rnd() < 0.2 ? pal[1] : pal[0]; g.fillRect(ox + x, oy + y, 1, 1); g.fillRect(ox + 9 - x, oy + y, 1, 1); } }
    g.fillStyle = '#fff'; g.fillRect(ox + 2, oy + 2, 1, 1); g.fillRect(ox + 7, oy + 2, 1, 1); g.fillStyle = '#111'; g.fillRect(ox + 2, oy + 3, 1, 1); g.fillRect(ox + 7, oy + 3, 1, 1);
  }

  K.style('ludus-invhunt', `
.ih .ih-top{flex-wrap:wrap;row-gap:6px}
.ih-main{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px}
.ih.side .ih-main{flex-direction:row}
.ih-side{display:flex;flex-direction:column;gap:8px;flex:none;min-width:0}
.ih.side .ih-side{width:min(42%,250px)}
.ih-plaque{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--r-md);background:#f7f4ec;color:#1b1b1b;box-shadow:0 1px 0 rgba(0,0,0,.06),0 8px 18px -12px rgba(0,0,0,.45)}
.ih-plaque canvas{width:46px;height:46px;image-rendering:pixelated;border-radius:6px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.ih-plaque .id{font:800 22px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em}
.ih-plaque .meta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px;font:650 11.5px/1.2 var(--font);color:#4a4a4a}
.ih-plaque .meta i{font-style:normal;display:inline-flex;align-items:center;gap:4px}
.ih-plaque .meta i::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--dot,#888)}
.ih-plaque .grow{flex:1;min-width:0}
.ih-status{justify-content:space-between;font:650 12px/1.2 var(--font);color:var(--ink-2);flex-wrap:wrap;row-gap:4px}
.ih-status b{color:var(--ink)}
.ih-mapbox{position:relative;flex:1 1 auto;min-height:150px;border-radius:var(--r-md);overflow:hidden;background:#aad3df;touch-action:none;box-shadow:inset 0 0 0 1px var(--line)}
.ih-mapbox canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair}
.ih-zoom{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:5px;z-index:2}
.ih-zoom button{width:30px;height:30px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(20,18,15,.72);color:#fff;font:700 16px/1 var(--font);cursor:pointer;transition:transform .15s var(--spring)}
.ih-zoom button:hover{background:rgba(20,18,15,.9)}
.ih-zoom button:active{transform:scale(.93)}
.ih-zoom svg{width:14px;height:14px}
.ih-hintline{position:absolute;left:8px;right:46px;top:8px;z-index:2;padding:6px 10px;border-radius:10px;background:rgba(20,18,15,.78);color:#fff;font:600 12px/1.3 var(--font);overflow-wrap:anywhere}
.ih-bar{position:absolute;left:8px;right:8px;bottom:18px;z-index:2;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:6px 8px;border-radius:14px;background:rgba(20,18,15,.8);color:#fff;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.ih-bar .msg{flex:1;min-width:0;text-align:center;font:750 13px/1.2 var(--font-round);letter-spacing:.02em;white-space:nowrap;overflow:hidden}
.ih-bar .lk-btn{height:34px;border:0}
.ih-bar .ghost{background:rgba(255,255,255,.14);color:#fff}
.ih-bar .ghost:hover:not(:disabled){background:rgba(255,255,255,.24)}
.ih-result{position:absolute;left:8px;right:8px;bottom:18px;z-index:3;display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-lift)}
.ih-result .big{font:800 20px/1.1 var(--font-round);color:var(--ink)}
.ih-result .big small{font:650 12.5px var(--font);color:var(--ink-2);margin-left:6px}
.ih-result p{margin:0;font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere}
.ih-result .lk-row{justify-content:flex-end}
.ih-attr{position:absolute;left:0;bottom:0;z-index:1;font-size:9.5px;line-height:1;padding:3px 6px;background:rgba(255,255,255,.75);color:#333;border-top-right-radius:6px}
.ih-code{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:8px;justify-content:center}
.ih-code .q{text-align:center;font:650 13px var(--font);color:var(--ink-2)}
.ih-code .ms-opts{display:flex;flex-direction:column;gap:6px}
.ih.side .ih-code{flex-direction:row;align-items:center;gap:16px}
.ih.side .ih-code>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
`);

  Ludus.register({
    id: 'invhunt', name: 'Invader Hunt', aka: 'Space Invader mosaics, street art, map, city codes, geography', tag: 'Puzzle', tint: '#24315c',
    hint: 'Drag to move · scroll or <kbd>+</kbd><kbd>-</kbd> to zoom · click to pin · <kbd>Enter</kbd> guess · <kbd>H</kbd> hint · <kbd>Esc</kbd> pauses',
    _rules: { px, ll, dist, points, inBounds, fmtD, cityOf },
    art(ctx, w, h) {
      const u = Math.min(h / 78, w / 150);
      ctx.fillStyle = '#24315c'; ctx.fillRect(0, 0, w, h);
      // a faint street grid
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 4 * u;
      for (let x = -20 * u; x < w + 20 * u; x += 34 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18 * u, h); ctx.stroke(); }
      for (let y = 12 * u; y < h; y += 26 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y - 6 * u); ctx.stroke(); }
      // the mosaic tile
      const P = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
      const s = 5 * u, tw = 11 * s, th = 8 * s, tx = w / 2 - tw / 2 - 18 * u, ty = h / 2 - th / 2 - 2 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; Ludus.draw.roundRect(ctx, tx - 6 * u + 2 * u, ty - 6 * u + 3 * u, tw + 12 * u, th + 12 * u, 4 * u); ctx.fill();
      ctx.fillStyle = '#f7f4ec'; Ludus.draw.roundRect(ctx, tx - 6 * u, ty - 6 * u, tw + 12 * u, th + 12 * u, 4 * u); ctx.fill();
      P.forEach((r, j) => [...r].forEach((c, i) => { if (c === '1') { ctx.fillStyle = (i + j) % 5 === 0 ? '#ffd23c' : '#ff3c7a'; ctx.fillRect(tx + i * s + 0.5, ty + j * s + 0.5, s - 1, s - 1); } }));
      // the pin
      const x = tx + tw + 36 * u, y = h * 0.84, r = 11 * u, cy = y - r * 1.55;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5 * u, 6.5 * u, 2 * u, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - r * 0.35, y - r * 0.55, x - r, cy + r * 0.7, x - r, cy); ctx.arc(x, cy, r, Math.PI, 0); ctx.bezierCurveTo(x + r, cy + r * 0.7, x + r * 0.35, y - r * 0.55, x, y); ctx.closePath();
      ctx.fillStyle = '#4b93ff'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, cy, r * 0.4, 0, 7); ctx.fill();
      // ID tag
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = `800 ${10 * u}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PA_267', tx + tw / 2, ty + th + 16 * u);
    },
    create(stage, api) {
      const el = K.el;
      let D = null, ALL = null, SETS = null, destroyed = false;
      const S = api.settings;
      const s0 = S.invhunt && typeof S.invhunt === 'object' ? S.invhunt : {};
      let mode = MODES.some(m => m[0] === s0.mode) ? s0.mode : 'city';
      let city = typeof s0.city === 'string' ? s0.city : 'PA';
      let len = LENS.includes(s0.len) ? s0.len : 5;
      let alive = s0.alive === true;
      const remember = () => { S.invhunt = { mode, city, len, alive }; Ludus.save(); };

      // ----- DOM -----
      const root = el('div', 'lk ih'); stage.appendChild(root);
      const top = el('div', 'lk-row ih-top'); root.appendChild(top);
      const modeChip = el('button', 'lk-chip'), cityChip = el('button', 'lk-chip'), lenChip = el('button', 'lk-chip'), aliveChip = el('button', 'lk-chip');
      top.append(modeChip, cityChip, lenChip, aliveChip);
      [modeChip, cityChip, lenChip, aliveChip].forEach(b => { b.type = 'button'; b.addEventListener('click', () => b.blur()); });
      const main = el('div', 'ih-main'); root.appendChild(main);
      const side = el('div', 'ih-side'); main.appendChild(side);
      const plaque = el('div', 'ih-plaque'); side.appendChild(plaque);
      const badge = el('canvas'); badge.setAttribute('aria-label', 'Pixel badge drawn from this ID');
      const pinfo = el('div', 'grow'), idEl = el('div', 'id'), meta = el('div', 'meta'); pinfo.append(idEl, meta);
      plaque.append(badge, pinfo);
      const status = el('div', 'lk-row ih-status'); side.appendChild(status);
      const stLeft = el('span'), stRight = el('span'); status.append(stLeft, stRight);
      const hintBtn = el('button', 'lk-btn'); hintBtn.type = 'button'; side.appendChild(hintBtn);
      hintBtn.style.height = '34px'; hintBtn.style.fontSize = '12.5px';
      // map
      const mapbox = el('div', 'ih-mapbox'); main.appendChild(mapbox);
      const cv = el('canvas'); cv.setAttribute('aria-label', 'Map. Drag to move, scroll to zoom, click to drop your pin.'); mapbox.appendChild(cv);
      const ctx = cv.getContext('2d');
      const hintLine = el('div', 'ih-hintline'); hintLine.hidden = true; mapbox.appendChild(hintLine);
      const zoom = el('div', 'ih-zoom'); mapbox.appendChild(zoom);
      const zb = (label, svg, fn) => { const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.innerHTML = svg; b.onclick = () => { fn(); b.blur(); }; zoom.appendChild(b); return b; };
      zb('Zoom in', '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', () => zoomAt(W() / 2, H() / 2, 1.5));
      zb('Zoom out', '<svg viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', () => zoomAt(W() / 2, H() / 2, 1 / 1.5));
      zb('Show the whole map', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>', () => fitView());
      const attr = el('div', 'ih-attr', 'Map © OpenStreetMap contributors'); mapbox.appendChild(attr);
      const bar = el('div', 'ih-bar'); mapbox.appendChild(bar);
      const barMsg = el('span', 'msg'); const guessBtn = el('button', 'lk-btn lk-primary', 'Guess'); guessBtn.type = 'button';
      bar.append(barMsg, guessBtn);
      const result = el('div', 'ih-result lk-pop'); result.hidden = true; mapbox.appendChild(result);
      // code breaker
      const codeBox = el('div', 'ih-code'); codeBox.hidden = true; main.appendChild(codeBox);
      const codeQ = el('div'); const codeOpts = el('div', 'ms-opts');
      codeQ.appendChild(el('div', 'q', 'Which city does this code belong to?')); codeQ.appendChild(codeOpts);
      codeBox.appendChild(codeQ);
      const sheet = el('div', 'lk-sheet'); sheet.hidden = true; root.appendChild(sheet);

      const fitSide = () => { const r = stage.getBoundingClientRect(); root.classList.toggle('side', r.width > r.height * 1.25); };

      // ----- state -----
      let TS = null, imgs = [], view = { x: 0, y: 0, s: 1 }, guess = null, truth = null, revealed = false, hintUsed = false;
      let round = 0, score = 0, used = new Set(), pool = [], phase = 'boot';
      let lives = CODE_LIVES, streak = 0, right = 0, cAns = null, cOpts = [], cLock = false;

      function chips() {
        modeChip.textContent = MODES.find(m => m[0] === mode)[1];
        const cs = SETS ? SETS.cities.find(t => t.code === city) : null;
        cityChip.textContent = cs ? cs.name : cityOf(city);
        cityChip.hidden = mode !== 'city';
        lenChip.textContent = `${len} rounds`; lenChip.hidden = mode === 'code';
        aliveChip.textContent = alive ? 'Still on the wall' : 'All mosaics';
        aliveChip.classList.toggle('on', alive);
      }
      modeChip.onclick = () => { mode = MODES[(MODES.findIndex(m => m[0] === mode) + 1) % MODES.length][0]; remember(); api.sfx('click'); newGame(); };
      cityChip.onclick = () => { if (!SETS) return; const cs = SETS.cities, i = cs.findIndex(t => t.code === city); city = cs[(i + 1) % cs.length].code; remember(); api.sfx('click'); newGame(); };
      lenChip.onclick = () => { len = LENS[(LENS.indexOf(len) + 1) % LENS.length]; remember(); api.sfx('click'); newGame(); };
      aliveChip.onclick = () => { alive = !alive; remember(); api.sfx('click'); newGame(); };

      function setPlaque(r) {
        idEl.textContent = r.id.trim();
        sprite(badge, r.id.trim());
        meta.innerHTML = '';
        if (mode !== 'code') {
          meta.appendChild(el('span', '', r.pts ? r.pts + ' pts' : 'points unknown'));
          const st = el('i', '', STATUS[r.st] || STATUS[3]); st.style.setProperty('--dot', ['var(--good)', '#d98a07', 'var(--bad)', 'var(--ink-3)'][r.st] || 'var(--ink-3)'); meta.appendChild(st);
        } else meta.appendChild(el('span', '', 'Name its city'));
      }
      function hud() {
        if (mode === 'code') { stLeft.innerHTML = `Right <b>${right}</b> · streak <b>${streak}</b>`; stRight.innerHTML = ''; stRight.appendChild(K.hearts(lives, CODE_LIVES)); return; }
        stLeft.innerHTML = `Round <b>${Math.max(1, round)}</b> of ${len}`;
        stRight.innerHTML = `<b>${score.toLocaleString()}</b> pts`;
      }
      // The bar under the map: the full sentence when it fits, "Place your pin" when the bar is narrow (never cut off).
      function barText() {
        const full = mode === 'world' ? 'Place your pin on the world map' : 'Place your pin on the map';
        barMsg.textContent = full;
        if (barMsg.scrollWidth > barMsg.clientWidth + 1) barMsg.textContent = 'Place your pin';
      }
      function setBar() {
        bar.hidden = revealed;
        guessBtn.disabled = !guess;
        if (guess) { barMsg.textContent = 'Pin placed'; if (barMsg.scrollWidth > barMsg.clientWidth + 1) barMsg.textContent = ''; }
        else barText();
      }
      function setHintBtn() {
        hintBtn.hidden = mode === 'code' || !truth || !truth.hint;
        if (!truth) return;
        hintBtn.disabled = !truth.hint || hintUsed || revealed;
        hintBtn.textContent = !truth.hint ? 'No hint for this one' : hintUsed ? 'Hint shown (−500)' : 'Show hint (−500)';
      }

      // ----- map widget -----
      const W = () => mapbox.clientWidth, H = () => mapbox.clientHeight;
      function loadSet(code) {
        TS = code === 'WORLD' ? SETS.world : SETS.cities.find(t => t.code === code);
        imgs = [];
        for (let j = 0; j < TS.ny; j++) { const row = []; for (let i = 0; i < TS.nx; i++) { const im = new Image(); im.onload = draw; im.onerror = () => {}; im.src = `${TILES}${TS.code}/${i}_${j}.webp`; row.push(im); } imgs.push(row); }
        fitView();
      }
      const minS = () => Math.min(W() / (TS.nx * 256), H() / (TS.ny * 256));
      function fitView() { if (!TS) return; const w = TS.nx * 256, h = TS.ny * 256; view.s = Math.min(Math.max(Math.max(W() / w, H() / h), minS()), 3); view.x = TS.x0 * 256 + w / 2; view.y = TS.y0 * 256 + h / 2; clampView(); draw(); }
      function clampView() {
        const x0 = TS.x0 * 256, y0 = TS.y0 * 256, w = TS.nx * 256, h = TS.ny * 256, hw = W() / 2 / view.s, hh = H() / 2 / view.s;
        view.x = w / 2 <= hw ? x0 + w / 2 : Math.min(x0 + w - hw, Math.max(x0 + hw, view.x));
        view.y = h / 2 <= hh ? y0 + h / 2 : Math.min(y0 + h - hh, Math.max(y0 + hh, view.y));
      }
      const toScr = (x, y) => [(x - view.x) * view.s + W() / 2, (y - view.y) * view.s + H() / 2];
      const toWorld = (sx, sy) => [(sx - W() / 2) / view.s + view.x, (sy - H() / 2) / view.s + view.y];
      function pinAt(x, y, colr, label) {
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = colr; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y - 20, 10, Math.PI * 0.75, Math.PI * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 20, 3.5, 0, 7); ctx.fill();
        if (label) { ctx.font = '700 12px -apple-system, "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(label, x, y - 36); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y - 36); }
      }
      function draw() {
        if (!TS || destroyed || mode === 'code') return;
        const d = Math.min(3, window.devicePixelRatio || 1), w = Math.max(1, Math.round(W() * d)), h = Math.max(1, Math.round(H() * d));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = '#aad3df'; ctx.fillRect(0, 0, W(), H());
        ctx.imageSmoothingEnabled = view.s < 1.5;
        for (let j = 0; j < TS.ny; j++) for (let i = 0; i < TS.nx; i++) { const im = imgs[j] && imgs[j][i]; if (!im || !im.complete || !im.naturalWidth) continue; const [sx, sy] = toScr((TS.x0 + i) * 256, (TS.y0 + j) * 256); ctx.drawImage(im, sx, sy, 256 * view.s + 0.5, 256 * view.s + 0.5); }
        if (document.documentElement.dataset.theme === 'dark') { ctx.fillStyle = 'rgba(10,8,6,.16)'; ctx.fillRect(0, 0, W(), H()); }
        if (truth && revealed) {
          const [tx, ty] = toScr(...px(truth.lat, truth.lng, TS.z));
          if (guess) { const [gx, gy] = toScr(...px(guess[0], guess[1], TS.z)); ctx.setLineDash([6, 6]); ctx.strokeStyle = '#14161b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); }
          if (guess) { const [gx, gy] = toScr(...px(guess[0], guess[1], TS.z)); pinAt(gx, gy, '#ff3c7a', ''); }
          pinAt(tx, ty, '#1d9b5a', truth.id.trim());
        } else if (guess) { const [gx, gy] = toScr(...px(guess[0], guess[1], TS.z)); pinAt(gx, gy, '#ff3c7a', ''); }
      }
      function zoomAt(sx, sy, f) { if (!TS) return; const b = toWorld(sx, sy); view.s = Math.min(4, Math.max(minS(), view.s * f)); const a = toWorld(sx, sy); view.x += b[0] - a[0]; view.y += b[1] - a[1]; clampView(); draw(); }
      const ptrs = new Map(); let drag = null, pinchD = 0, moved = 0;
      const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      api.on(cv, 'pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (x) {} const p = local(e); ptrs.set(e.pointerId, p); moved = 0; if (ptrs.size === 1) drag = { x: p[0], y: p[1], vx: view.x, vy: view.y }; else { const q = [...ptrs.values()]; pinchD = Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]); drag = null; } });
      api.on(cv, 'pointermove', e => {
        if (!ptrs.has(e.pointerId) || !TS) return; const p = local(e); ptrs.set(e.pointerId, p);
        if (ptrs.size === 2) { const q = [...ptrs.values()], dd = Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]); if (pinchD) zoomAt((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2, dd / pinchD); pinchD = dd; moved = 99; return; }
        if (drag) { const dx = p[0] - drag.x, dy = p[1] - drag.y; moved = Math.max(moved, Math.hypot(dx, dy)); if (moved > 5) { view.x = drag.vx - dx / view.s; view.y = drag.vy - dy / view.s; clampView(); draw(); } }
      });
      const up = e => {
        if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
        if (ptrs.size === 0 && drag && moved <= 5 && e.type === 'pointerup' && !revealed && phase === 'play' && TS) { const p = local(e), w = toWorld(p[0], p[1]); guess = ll(w[0], w[1], TS.z); api.sfx('tap'); setBar(); draw(); }
        if (ptrs.size === 0) drag = null; pinchD = 0;
      };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      api.on(cv, 'wheel', e => { e.preventDefault(); const p = local(e); zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
      const ro = new ResizeObserver(() => { fitSide(); if (TS) { clampView(); draw(); } if (!revealed) setBar(); }); ro.observe(stage); fitSide();

      // ----- map rounds -----
      function buildPool() {
        let p = ALL.filter(r => !alive || r.st < 2);
        if (mode === 'city') { const T = SETS.cities.find(t => t.code === city); p = p.filter(r => canon(r.city) === city && inBounds(r, T)); }
        return p;
      }
      function pickWorld() {
        const by = {}; for (const r of pool) (by[r.city] = by[r.city] || []).push(r); const cs = Object.keys(by);
        for (let k = 0; k < 60; k++) { const c = cs[Math.floor(Math.random() * cs.length)], l = by[c], r = l[Math.floor(Math.random() * l.length)]; if (!used.has(r.id)) return r; }
        return pool[Math.floor(Math.random() * pool.length)];
      }
      function pick() { if (mode !== 'city') return pickWorld(); for (let k = 0; k < 200; k++) { const r = pool[Math.floor(Math.random() * pool.length)]; if (!used.has(r.id)) return r; } return pool[0]; }
      function showMode() {
        const code = mode === 'code';
        mapbox.hidden = code; hintBtn.hidden = code; codeBox.hidden = !code;
        chips();
      }
      function newGame() {
        if (!D) return;
        sheet.hidden = true; score = 0; round = 0; used = new Set(); lives = CODE_LIVES; streak = 0; right = 0; api.score(0);
        if (!SETS.cities.some(t => t.code === city)) city = 'PA';
        pool = buildPool(); showMode();
        if (!pool.length) { phase = 'empty'; api.toast('No mosaics match these rules'); return; }
        if (mode === 'code') { nextCode(); return; }
        loadSet(mode === 'world' ? 'WORLD' : city);
        nextRound();
      }
      function startRoundWith(r, opts) {
        truth = r; used.add(r.id); guess = opts && opts.guess || null; revealed = false; hintUsed = !!(opts && opts.hint); phase = 'play';
        setPlaque(r); result.hidden = true; hintLine.hidden = !hintUsed; if (hintUsed) hintLine.textContent = 'Hint: ' + r.hint;
        setHintBtn(); setBar(); hud();
        if (mode === 'world') fitView(); else draw();
      }
      function nextRound() { round++; startRoundWith(pick()); }
      function submit() {
        if (!guess || revealed || phase !== 'play') return;
        revealed = true; phase = 'result';
        const d = dist(guess, [truth.lat, truth.lng]), pts = points(mode, d, hintUsed);
        score += pts; api.score(score); api.sfx(pts > MAX_PTS * 0.6 ? 'score' : 'click');
        showResult(d, pts);
        // bring both pins into view
        const a = px(guess[0], guess[1], TS.z), b = px(truth.lat, truth.lng, TS.z);
        view.x = (a[0] + b[0]) / 2; view.y = (a[1] + b[1]) / 2;
        const span = Math.max(Math.abs(a[0] - b[0]) / Math.max(40, W() - 100), Math.abs(a[1] - b[1]) / Math.max(40, H() - 180));
        if (span * view.s > 1) view.s = Math.max(minS(), 1 / span);
        view.y += (result.offsetHeight + 18) / 2 / view.s;   // keep both pins above the result card
        clampView(); setBar(); setHintBtn(); hud(); draw();
      }
      function showResult(d, pts) {
        result.innerHTML = '';
        const big = el('div', 'big', '+' + pts.toLocaleString()); big.appendChild(el('small', '', `${fmtD(d)} away`));
        result.appendChild(big);
        result.appendChild(el('p', '', `${truth.id.trim()} is in ${cityOf(truth.city)}${truth.hint ? ' (' + truth.hint + ')' : ''}. ${STATUS[truth.st] || ''}.`));
        const row = el('div', 'lk-row'), nx = el('button', 'lk-btn lk-primary', round >= len ? 'See final score' : 'Next'); nx.type = 'button';
        nx.onclick = () => { api.sfx('click'); next(); };
        row.appendChild(nx); result.appendChild(row); result.hidden = false;
      }
      function next() {
        if (phase !== 'result') return;
        if (round >= len) { phase = 'over'; api.over({ score, title: score > len * MAX_PTS * 0.8 ? 'You know these walls' : score > len * MAX_PTS * 0.5 ? 'Solid hunting' : 'Hunt complete', message: `${len} mosaics · ${MODES.find(m => m[0] === mode)[1]}` }); return; }
        nextRound();
      }
      hintBtn.onclick = () => { if (!truth || !truth.hint || hintUsed || revealed) return; hintUsed = true; hintLine.textContent = 'Hint: ' + truth.hint; hintLine.hidden = false; api.sfx('click'); setHintBtn(); hintBtn.blur(); };
      guessBtn.onclick = () => { submit(); guessBtn.blur(); };

      // ----- code breaker -----
      function cityCodes() { return [...new Set(ALL.map(x => canon(x.city)))]; }
      function nextCode(r, opts) {
        cLock = false; phase = 'play';
        truth = r || pickWorld(); cAns = canon(truth.city);
        if (opts) cOpts = opts;
        else {
          const codes = cityCodes().filter(c => c !== cAns); const o = [cAns];
          while (o.length < 4) { const c = codes[Math.floor(Math.random() * codes.length)]; if (!o.includes(c)) o.push(c); }
          cOpts = K.shuffle(o);
        }
        setPlaque(truth); renderCode(false); hud();
      }
      function renderCode(reveal, chosen) {
        codeOpts.innerHTML = '';
        cOpts.forEach((c, i) => {
          const b = el('button', 'lk-opt'); b.type = 'button';
          b.append(el('span', 'n', i + 1), el('span', 't', cityOf(c)));
          if (reveal) { b.disabled = true; if (c === cAns) b.classList.add('right'); else if (c === chosen) b.classList.add('wrong'); else b.classList.add('dim'); }
          b.onclick = () => answerCode(c);
          codeOpts.appendChild(b);
        });
      }
      function answerCode(c) {
        if (cLock || phase !== 'play' || mode !== 'code') return;
        cLock = true; phase = 'result';
        const ok = c === cAns;
        if (ok) { streak++; right++; score += 100 + Math.min(streak - 1, 10) * 20; api.score(score); api.sfx(streak % 5 === 0 ? 'win' : 'score'); }
        else { streak = 0; lives--; api.sfx('over'); }
        renderCode(true, c); hud();
        api.timeout(() => {
          if (destroyed || mode !== 'code') return;
          if (lives <= 0) { phase = 'over'; api.over({ score, title: 'Out of lives', message: `${right} code${right === 1 ? '' : 's'} right` }); return; }
          nextCode();
        }, ok ? 700 : 1500);
      }

      // ----- keys -----
      api.keys(e => {
        const k = e.key;
        if (mode === 'code') { if (phase === 'play' && /^[1-4]$/.test(k)) { const b = codeOpts.children[+k - 1]; if (b) b.click(); } return; }
        if (k === 'Enter' || k === ' ') { e.preventDefault(); if (e.repeat) return; if (phase === 'play') submit(); else if (phase === 'result') next(); return; }
        if (k === '+' || k === '=') zoomAt(W() / 2, H() / 2, 1.5);
        else if (k === '-' || k === '_') zoomAt(W() / 2, H() / 2, 1 / 1.5);
        else if (k === '0') fitView();
        else if (k === 'h' || k === 'H') hintBtn.click();
      });

      // ----- save and restore -----
      function snapshot() {
        if (destroyed || !D || !truth || phase === 'over' || phase === 'boot' || phase === 'empty') return null;
        const base = { v: 1, mode, city, len, alive, score };
        if (mode === 'code') {
          if (lives <= 0) return null;
          const opts = phase === 'play' ? cOpts.slice() : null;
          return Object.assign(base, { lives, streak, right, id: phase === 'play' ? truth.id : null, opts });
        }
        // an answered round is saved as finished, so coming back moves on instead of scoring it twice
        return Object.assign(base, { round, used: [...used].slice(-60), id: truth.id, done: phase === 'result', guess: guess && phase === 'play' ? guess.slice() : null, hint: hintUsed, view: phase === 'play' ? { x: view.x, y: view.y, s: view.s } : null });
      }
      function restore(s) {
        try {
          if (!s || s.v !== 1 || !MODES.some(m => m[0] === s.mode) || !LENS.includes(s.len)) return false;
          mode = s.mode; len = s.len; alive = !!s.alive; if (typeof s.city === 'string' && SETS.cities.some(t => t.code === s.city)) city = s.city;
          score = Math.max(0, s.score | 0);
          pool = buildPool(); if (!pool.length) return false;
          const byId = id => ALL.find(r => r.id === id);
          showMode(); api.score(score);
          if (mode === 'code') {
            lives = Math.max(1, Math.min(CODE_LIVES, s.lives | 0)); streak = Math.max(0, s.streak | 0); right = Math.max(0, s.right | 0);
            const r = s.id && byId(s.id), codes = cityCodes();
            if (r && Array.isArray(s.opts) && s.opts.length === 4 && s.opts.every(c => codes.includes(c)) && s.opts.includes(canon(r.city))) nextCode(r, s.opts.slice());
            else nextCode();
            return true;
          }
          const r = byId(s.id); if (!r) return false;
          round = Math.max(1, Math.min(s.len, s.round | 0));
          used = new Set(Array.isArray(s.used) ? s.used.filter(x => typeof x === 'string') : []);
          loadSet(mode === 'world' ? 'WORLD' : city);
          if (s.done) {
            if (round >= len) return false;
            nextRound(); return true;
          }
          const g = Array.isArray(s.guess) && s.guess.length === 2 && s.guess.every(Number.isFinite) && Math.abs(s.guess[0]) <= 90 && Math.abs(s.guess[1]) <= 180 ? s.guess.slice() : null;
          startRoundWith(r, { guess: g, hint: !!s.hint && !!r.hint });
          if (s.view && [s.view.x, s.view.y, s.view.s].every(Number.isFinite)) { view = { x: s.view.x, y: s.view.y, s: Math.min(4, Math.max(minS(), s.view.s)) }; clampView(); draw(); }
          return true;
        } catch (e) { return false; }
      }

      // ----- boot -----
      async function boot() {
        phase = 'boot'; sheet.innerHTML = '<div class="lk-spin"></div>'; sheet.hidden = false; chips();
        try {
          const data = await K.loadData('invhunt', DATA);
          if (destroyed) return;
          if (!data || !Array.isArray(data.inv) || !Array.isArray(data.sets)) throw new Error('bad data');
          D = data;
          ALL = data.inv.map(r => ({ id: String(r[0]), lat: +r[1], lng: +r[2], st: r[3] | 0, pts: r[4] | 0, hint: r[5] ? String(r[5]) : '', city: String(r[0]).split('_')[0] })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
          SETS = { cities: data.sets.filter(t => t.code !== 'WORLD'), world: data.sets.find(t => t.code === 'WORLD') };
          sheet.hidden = true;
          if (!(api.saved && restore(api.saved))) newGame();
        } catch (e) {
          if (destroyed) return;
          phase = 'error'; sheet.innerHTML = ''; const p = el('div', 'lk-panel');
          p.append(el('h2', '', 'Could not load the mosaics'), el('p', 'lk-muted', 'The map data did not open. Try again.'));
          const b = el('button', 'lk-btn lk-primary', 'Try again'); b.onclick = boot; p.appendChild(b);
          sheet.appendChild(p);
        }
      }
      boot();

      if (window.ludusDebug) {
        window.ludusDebug.invhunt = () => ({ phase, mode, city, len, round, score, truth: truth && { id: truth.id, lat: truth.lat, lng: truth.lng, city: truth.city }, guess, revealed, hintUsed, lives, streak, right, cAns, cOpts, set: TS && TS.code, view: { ...view } });
        window.ludusDebug.invhuntCtl = { pinAt: (lat, lng) => { if (phase === 'play') { guess = [lat, lng]; setBar(); draw(); } }, submit, next, screen: (lat, lng) => TS ? toScr(...px(lat, lng, TS.z)) : null };
      }
      return {
        save: snapshot,
        pause() {},
        resume() { draw(); },
        destroy() { destroyed = true; try { ro.disconnect(); } catch (e) {} cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); root.remove(); }
      };
    }
  });
})();
