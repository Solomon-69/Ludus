/* Mosaic Hunt: you see a real street-art mosaic (its close-up photo and ID tag, like PA_1000). Pin where you think it is
   on the guess map; the closer, the more points. City hunt: one city's streets. World hunt: any city in the list (the letters
   before the underscore are the city code). Code breaker: see a code, pick its city, three lives.
   Scoring works like the famous guessing game: 5000 max per round, 5000·e^(−10·distance/map size).
   Data: games/invhunt/data.js, IDs, positions and status from the community dataset by goguelnikov (github.com/goguelnikov/SpaceInvaders, MIT).
   Photos: never stored in the repo. Each close-up is shown live from invader-spotter.art (credited under the photo); offline, a drawn
   stand-in mosaic is shown instead. Map: the same map as Map Hunt (games/geo/map.js: MapLibre + OpenFreeMap vector tiles, sharp on
   every screen, © OpenStreetMap contributors). Offline, the bundled tiles in games/invhunt/tiles are laid on the map instead. */
(function () {
  const K = Ludus.dom;
  const DATA = 'games/invhunt/data.js', TILES = 'games/invhunt/tiles/';
  const PHOTO = 'https://www.invader-spotter.art/grosplan/', PHOTO_SITE = 'invader-spotter.art';
  const MODES = [['city', 'City hunt'], ['world', 'World hunt'], ['code', 'Code breaker']];
  const LENS = [5, 10];
  const STATUS = ['On the wall', 'Damaged', 'Destroyed', 'Unknown'];
  const HINT_COST = 500, MAX_PTS = 5000, CODE_LIVES = 3;
  const WORLD_SIZE_M = 14916862;   // size of the world map used for scoring (falloff ≈ 1492 km, like Map Hunt)
  const PERFECT_M = 25;            // closer than this is a perfect 5000
  const NAMES = { AIX: 'Aix-en-Provence', AMI: 'Amiens', AMS: 'Amsterdam', ANVR: 'Antwerp', ANZR: 'Anzère', AVI: 'Avignon', BGK: 'Bangkok', BRC: 'Barcelona', BSL: 'Basel', BTA: 'Bastia', BRL: 'Berlin', BRN: 'Bern', BT: 'Bhutan', BAB: 'Biarritz-Anglet-Bayonne', BBO: 'Bilbao', BXL: 'Brussels', CCU: 'Cancún', CAPF: 'Cap Ferret', CHAR: 'Charleroi', CLR: 'Clermont-Ferrand', CON: 'Contis-les-Bains', CAZ: 'Côte d’Azur', DJN: 'Daejeon', DHK: 'Dhaka', DIJ: 'Dijon', DJBA: 'Djerba', ELT: 'Eilat', FAO: 'Faro', FTBL: 'Fontainebleau', FRQ: 'Forcalquier', FKF: 'Frankfurt', GNV: 'Geneva', GRN: 'Grenoble', GRU: 'Grude', GRTI: 'Grumeti', HALM: 'Halmstad', HK: 'Hong Kong', IST: 'Istanbul', KAT: 'Kathmandu', KLN: 'Cologne', LCT: 'La Ciotat', REUN: 'La Réunion', LAP: 'Lapland', LSN: 'Lausanne', LIL: 'Lille', LJU: 'Ljubljana', LDN: 'London', LND: 'London', LA: 'Los Angeles', LBR: 'Luberon', LY: 'Lyon', MAN: 'Manchester', MRAK: 'Marrakech', MARS: 'Marseille', MLB: 'Melbourne', MEN: 'Menorca', MIA: 'Miami', MBSA: 'Mombasa', MTB: 'Montauban', MPL: 'Montpellier', MUN: 'Munich', MLGA: 'Málaga', NA: 'Nantes', NY: 'New York', NCL: 'Newcastle', NOO: 'Noordwijk', NIM: 'Nîmes', ORLN: 'Orléans', PA: 'Paris', PAU: 'Pau', PRP: 'Perpignan', PRT: 'Perth', POTI: 'Potosí', RBA: 'Rabat', RA: 'Ravenna', RDU: 'Redu', RN: 'Rennes', ROM: 'Rome', RTD: 'Rotterdam', SD: 'San Diego', SL: 'Seoul', STK: 'Stockholm', SP: 'São Paulo', TK: 'Tokyo', TLS: 'Toulouse', VLMO: 'Valmorel', VRN: 'Varanasi', VRS: 'Versailles', WN: 'Vienna', VSB: 'Visby' };
  const cityOf = c => NAMES[c] || c;
  const canon = c => c === 'LND' ? 'LDN' : c;
  const LAYOUTS = ['v'];

  // ---------- geometry and scoring (pure, testable) ----------
  function px(lat, lng, z) { const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; }
  function ll(x, y, z) { const n = 256 * 2 ** z, lng = x / n * 360 - 180, k = Math.PI - 2 * Math.PI * y / n; return [180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))), lng]; }
  function dist(a, b) { const R = 6371e3, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  const fmtD = m => m < 1000 ? Math.round(m) + ' m' : m < 100000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 1000).toLocaleString() + ' km';
  // Bounds of a tile set as [south, west, north, east].
  function setBounds(T) { const a = ll(T.x0 * 256, T.y0 * 256, T.z), b = ll((T.x0 + T.nx) * 256, (T.y0 + T.ny) * 256, T.z); return [b[0], a[1], a[0], b[1]]; }
  // The map size used for scoring: the whole world, or the diagonal of the city map.
  function mapSize(T) { if (!T || T.code === 'WORLD') return WORLD_SIZE_M; const b = setBounds(T); return dist([b[0], b[1]], [b[2], b[3]]); }
  function points(d, size, hint) {
    const p = d <= PERFECT_M ? MAX_PTS : Math.round(MAX_PTS * Math.exp(-10 * d / Math.max(1, size)));
    return Math.max(0, p - (hint ? HINT_COST : 0));
  }
  function inBounds(r, T) { const [x, y] = px(r.lat, r.lng, T.z); return x >= T.x0 * 256 + 8 && x <= (T.x0 + T.nx) * 256 - 8 && y >= T.y0 * 256 + 8 && y <= (T.y0 + T.ny) * 256 - 8; }
  // Close-up photo addresses for an ID, most likely first. The site pads numbers to the width of the city's biggest number (min 2).
  function photoUrls(id, width) {
    const m = /^([A-Z]+)_0*(\d+)$/.exec(id); if (!m) return [];
    const c = canon(m[1]), n = m[2], w0 = Math.max(2, width || 2);
    return [...new Set([w0, 2, 3, 4])].filter(w => w >= n.length).map(w => `${PHOTO}${c}/${c}_${n.padStart(w, '0')}-grosplan.png`);
  }

  // ---------- drawn stand-in mosaic (shown only when the real photo cannot load) ----------
  const CREATURES = {
    Moth: ['10000000001', '11000000011', '11101110111', '01111111110', '00110101100', '00111111100', '00010001000', '00100000100'],
    Pip: ['00001110000', '00111111100', '01111111110', '01101110110', '01111111110', '00111111100', '00011011000', '00110001100'],
    Crab: ['10100000101', '10100000101', '11111111111', '11011111011', '01111111110', '00111111100', '01010001010', '10010001001'],
    Owl: ['10100000101', '11111111111', '11011011011', '11011011011', '11111011111', '01111111110', '00111111100', '00110001100']
  };
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const PALS = [['#ff3c7a', '#ffd23c'], ['#1f6fd8', '#7fd1ff'], ['#18a058', '#c6f36b'], ['#8a3cff', '#ff9de0'], ['#ff7a1a', '#fff066'], ['#2b2b2b', '#e0e0e0']];
  function sprite(cv, id) {
    const g = cv.getContext('2d'), N = 15; cv.width = N; cv.height = N;
    const h = hash(id), shapes = Object.values(CREATURES), P = shapes[h % shapes.length], pal = PALS[(h >>> 4) % PALS.length];
    g.fillStyle = '#f1ede3'; g.fillRect(0, 0, N, N);
    P.forEach((r, j) => [...r].forEach((c, i) => { if (c === '1') { g.fillStyle = (i + j) % 5 === 0 ? pal[1] : pal[0]; g.fillRect(2 + i, 3 + j, 1, 1); } }));
  }

  // ---------- map libraries (shared with Map Hunt, loaded on demand) ----------
  const loading = {};
  function loadScript(src) {
    return loading[src] || (loading[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => { delete loading[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  function loadCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.dataset.geo = href; document.head.appendChild(l);
  }
  async function loadMap() {
    loadCss('vendor/maplibre-gl.css'); loadCss('vendor/leaflet.css');
    if (!window.__GEO_MAP__) {
      await Promise.all([window.maplibregl ? 0 : loadScript('vendor/maplibre-gl.js').catch(() => {}), window.L ? 0 : loadScript('vendor/leaflet.js'), window.__GEO_STYLE__ ? 0 : loadScript('games/geo/mapstyle.js')]);
      await loadScript('games/geo/map.js');
    }
    if (!window.__GEO_MAP__) throw new Error('map');
  }
  // Offline: lay the bundled raster tiles of a set on a map (each tile is its own picture, so no canvas is needed).
  function layTiles(gm, T) {
    gm.ihSets = gm.ihSets || new Set(); if (gm.ihSets.has(T.code)) return; gm.ihSets.add(T.code);
    const tiles = [];
    for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
      const a = ll((T.x0 + i) * 256, (T.y0 + j) * 256, T.z), b = ll((T.x0 + i + 1) * 256, (T.y0 + j + 1) * 256, T.z);
      tiles.push({ k: `ihl_${T.code}_${i}_${j}`, url: new URL(`${TILES}${T.code}/${i}_${j}.webp`, location.href).href, n: a[0], w: a[1], s: b[0], e: b[1] });
    }
    if (gm.kind === 'gl') {
      const m = gm.map;
      const go = () => {
        const ls = m.getStyle().layers, li = ls.findIndex(l => l.id === 'land'), before = ls[li + 1] && ls[li + 1].id;
        tiles.forEach(t => { if (m.getSource(t.k)) return; try { m.addSource(t.k, { type: 'image', url: t.url, coordinates: [[t.w, t.n], [t.e, t.n], [t.e, t.s], [t.w, t.s]] }); m.addLayer({ id: t.k, type: 'raster', source: t.k, paint: { 'raster-fade-duration': 0 } }, before); } catch (e) {} });
      };
      // offline the online tile source never finishes, so isStyleLoaded() stays false: the style itself is enough to add layers
      if (m.isStyleLoaded() || (m.style && m.style._loaded)) go(); else m.once('style.load', go);
    } else if (window.L) tiles.forEach(t => window.L.imageOverlay(t.url, [[t.s, t.w], [t.n, t.e]]).addTo(gm.map));
  }
  // Calls onOffline once if the online tiles cannot be fetched (or the map has no graphics card and so no tiles).
  function watchTiles(gm, onOffline) {
    let fired = false; const off = () => { if (!fired) { fired = true; onOffline(); } };
    if (gm.kind !== 'gl' || navigator.onLine === false) { off(); return; }
    let loads = 0, errs = 0;
    gm.map.on('data', e => { if (e.sourceId === 'ofm' && e.tile) loads++; });
    gm.map.on('error', () => { errs++; if (!loads && errs >= 3) off(); });
  }

  const pinHtml = drop => `<div class="ih-gpin${drop ? ' drop' : ''}"></div>`;
  const targetHtml = '<svg class="ih-flag" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12.5" fill="#1b1b1d" stroke="#fff" stroke-width="2.5"/><path d="M11 22V8.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M11.4 9h8.6l-2.2 3 2.2 3h-8.6z" fill="#fff"/></svg>';
  const ICON_V = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="2" width="11" height="4.5" rx="1.4"/><rect x="2.5" y="8.5" width="11" height="5.5" rx="1.4"/></svg>';
  const ICON_H = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="2.5" width="5" height="11" rx="1.4"/><rect x="8.5" y="2.5" width="6" height="11" rx="1.4"/></svg>';

  K.style('ludus-invhunt', `
.ih .ih-top{flex-wrap:wrap;row-gap:6px;align-items:center}
.ih-lay{margin-left:auto;display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}
.ih-lay button{width:32px;height:26px;padding:0;border:0;border-radius:999px;display:grid;place-items:center;background:transparent;color:var(--ink-3);cursor:pointer;transition:background .15s,color .15s,transform .15s var(--spring)}
.ih-lay button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.18)}
.ih-lay button:active{transform:scale(.94)}
.ih-lay svg{width:15px;height:15px}
.ih-main{position:relative;flex:1 1 auto;min-height:0}
.ih-scene{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:0 var(--scene-pr,0px) var(--scene-pb,0px) 0;overflow:hidden}
.ih[data-lay=h] .ih-scene{justify-content:center}
.ih-clue{display:flex;align-items:center;gap:14px;padding:12px;border-radius:var(--r-md);background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line),0 8px 18px -12px rgba(0,0,0,.45);flex:none;min-width:0}
.ih[data-lay=h] .ih-clue{flex-direction:column;align-items:stretch;text-align:center;gap:10px}
.ih-photo{position:relative;flex:none;width:84px;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line),0 6px 14px -8px rgba(0,0,0,.45)}
.ih[data-lay=h] .ih-photo{width:min(100%,var(--ph,180px));margin:0 auto}
.ih-photo canvas,.ih-photo img{position:absolute;inset:0;width:100%;height:100%;display:block}
.ih-photo canvas{image-rendering:pixelated;transition:opacity .2s}
.ih-photo img{object-fit:cover;opacity:0;transition:opacity .28s ease-out}
.ih-photo.ok img{opacity:1}
.ih-photo.ok canvas{opacity:0}
.ih-photo.wait::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);background-size:220% 100%;animation:ihshine 1.1s linear infinite}
@keyframes ihshine{from{background-position:120% 0}to{background-position:-100% 0}}
.ih-clue .grow{flex:1;min-width:0}
.ih-clue .id{font:800 22px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;overflow-wrap:anywhere}
.ih[data-lay=h] .ih-clue .id{font-size:24px}
.ih-clue .meta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font:650 11.5px/1.2 var(--font);color:var(--ink-2)}
.ih[data-lay=h] .ih-clue .meta{justify-content:center}
.ih-clue .meta i{font-style:normal;display:inline-flex;align-items:center;gap:4px}
.ih-clue .meta i::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--dot,#888)}
.ih-pcredit{margin-top:5px;font:500 10px/1.2 var(--font);color:var(--ink-3)}
.ih-pcredit a{color:inherit;text-decoration:underline;text-decoration-color:var(--line)}
.ih-status{justify-content:space-between;font:650 12px/1.2 var(--font);color:var(--ink-2);flex-wrap:wrap;row-gap:4px;flex:none}
.ih-status b{color:var(--ink)}
.ih-hintline{padding:7px 10px;border-radius:10px;background:var(--surface-2);color:var(--ink);font:600 12px/1.3 var(--font);overflow-wrap:anywhere;flex:none}
.ih-scene .lk-btn{flex:none}
/* the guess map: small in the corner, opens on hover like the real game; laid out once at its open size and only scaled while closed */
.ih-mini{position:absolute;right:0;bottom:0;width:var(--mini-cw,200px);display:flex;flex-direction:column;gap:7px;z-index:5;transition:width .3s cubic-bezier(.22,1,.36,1)}
.ih[data-lay=v] .ih-mini{left:0;width:auto}
.ih-mini.open{width:var(--mini-w,360px)}
.ih[data-lay=v] .ih-mini.open{width:auto}
.ih-mapbox{position:relative;height:var(--mini-ch,140px);border-radius:14px;overflow:hidden;opacity:1;background:rgb(138,180,248);box-shadow:0 8px 22px -8px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.06);transition:height .3s cubic-bezier(.22,1,.36,1),opacity .2s;transform:translateZ(0);cursor:crosshair}
.ih-mini.open .ih-mapbox{height:var(--mini-h,260px);opacity:1}
.ih-gmap{position:absolute;left:50%;top:50%;width:var(--mini-w,360px);height:var(--mini-h,260px);transform:translate(-50%,-50%) scale(var(--mini-s,.5));transition:transform .3s cubic-bezier(.22,1,.36,1)}
.ih-mini.open .ih-gmap{transform:translate(-50%,-50%) scale(1)}
.ih .maplibregl-map{font-family:var(--font);background:rgb(236,236,232)}
.ih .ih-gmap.maplibregl-map,.ih .ih-rmap.maplibregl-map{position:absolute}
.ih .maplibregl-canvas-container.maplibregl-interactive,.ih .maplibregl-canvas{cursor:crosshair}
.ih .leaflet-container{background:rgb(236,236,232);font-family:var(--font);cursor:crosshair}
.ih .leaflet-tile-pane.geo-nomap{background:rgb(236,236,232)}
.ih .geo-mk{pointer-events:none}
.ih .geo-mk-lbl{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:3px;white-space:nowrap;background:rgba(24,21,17,.84);color:#fff;border-radius:8px;padding:3px 7px;font:700 11px ui-monospace,Menlo,Consolas,monospace}
.ih .geo-mk-lbl:empty{display:none}
.ih-gpin{width:24px;height:24px;border-radius:50%;background:#e8453c;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.12);display:grid;place-items:center}
.ih-gpin::after{content:'';width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.92)}
.ih-gpin.drop{animation:ihdrop .42s cubic-bezier(.34,1.56,.64,1)}
@keyframes ihdrop{from{transform:translateY(-14px) scale(.4);opacity:0}to{transform:none;opacity:1}}
.ih-flag{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.ih-mapctl{position:absolute;right:8px;top:8px;z-index:650;display:flex;flex-direction:column;gap:5px;opacity:0;transform:translateY(-3px);transition:opacity .18s,transform .18s;pointer-events:none}
.ih-mini.open .ih-mapctl{opacity:1;transform:none;pointer-events:auto}
.ih-mapctl button{width:28px;height:28px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(16,16,18,.74);color:#fff;cursor:pointer;transition:transform .15s var(--spring),background .15s}
.ih-mapctl button:hover{background:rgba(16,16,18,.92)}
.ih-mapctl button:active{transform:scale(.93)}
.ih-mapctl button.on{background:var(--accent)}
.ih-mapctl svg{width:13px;height:13px}
.ih-credit{position:absolute;right:0;bottom:0;z-index:600;font:500 9px/1 var(--font);color:#333;background:rgba(255,255,255,.72);padding:2px 5px;border-top-left-radius:6px;pointer-events:none;white-space:nowrap}
.ih-credit i{font-style:normal}
.ih-guess{height:40px;border:0;border-radius:999px;font:italic 800 14px var(--font-round);letter-spacing:.06em;text-transform:uppercase;color:#fff;background:#6cb928;cursor:pointer;box-shadow:inset 0 -3px 0 rgba(0,0,0,.16),0 6px 16px -6px rgba(0,0,0,.5);transition:transform .15s var(--spring),filter .15s,background .2s;white-space:nowrap;overflow:hidden;padding:0 12px}
.ih-guess:hover:not(:disabled){filter:brightness(1.08)}
.ih-guess:active:not(:disabled){transform:scale(.97)}
.ih-guess:disabled{background:rgba(16,16,18,.8);color:rgba(255,255,255,.75);font:700 11.5px var(--font);letter-spacing:.02em;text-transform:none;cursor:default}
/* result screen: the big map with both pins and the line between them */
.ih-res{position:absolute;inset:0;z-index:8;border-radius:var(--r-md);overflow:hidden;background:rgb(236,236,232)}
.ih-res[hidden]{display:none}
.ih-rmap{position:absolute;inset:0}
.ih-resbar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:700;width:min(460px,calc(100% - 20px));display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:16px;background:var(--surface);color:var(--ink);box-shadow:var(--shadow-lift)}
.ih-resbar{animation:ihup .34s cubic-bezier(.22,1,.36,1)}
@keyframes ihup{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.ih-sum{animation:ihpop .34s cubic-bezier(.34,1.4,.64,1)}
@keyframes ihpop{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.ih-resbar .row{display:flex;align-items:center;gap:12px}
.ih-resbar .row>div{flex:1;min-width:0}
.ih-resbar .big{font:800 21px/1.1 var(--font-round);font-variant-numeric:tabular-nums}
.ih-resbar .big small{font:650 12.5px var(--font);color:var(--ink-2);margin-left:6px}
.ih-resbar p{margin:2px 0 0;font:500 12px/1.35 var(--font);color:var(--ink-2);overflow-wrap:anywhere}
.ih-meter{height:7px;border-radius:99px;background:var(--surface-2);overflow:hidden;box-shadow:inset 0 0 0 1px var(--line)}
.ih-meter i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#f6c445,#fbd96a);transition:width .7s cubic-bezier(.22,1,.36,1)}
.ih-resbar .lk-btn{flex:none}
.ih-sum{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:710;width:min(400px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;border-radius:18px;padding:16px 18px 18px;background:var(--surface);color:var(--ink);box-shadow:var(--shadow-lift)}
.ih-sum[hidden]{display:none}
.ih-sum h2{margin:0 0 2px;font:750 19px var(--font-round);text-align:center}
.ih-sum .tot{margin:0 0 8px;text-align:center;font:600 12.5px var(--font);color:var(--ink-2)}
.ih-sum table{width:100%;border-collapse:collapse;font:600 12px var(--font);font-variant-numeric:tabular-nums}
.ih-sum td,.ih-sum th{padding:5px 4px;text-align:right;border-bottom:1px solid var(--line)}
.ih-sum td:nth-child(2),.ih-sum th:nth-child(2){text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace}
.ih-sum td:first-child,.ih-sum th:first-child{text-align:left;color:var(--ink-3);width:22px}
.ih-sum th{font:600 10px var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.ih-sum .lk-btn{width:100%;margin-top:12px}
.ih-code{display:flex;flex-direction:column;gap:8px;justify-content:center;flex:1 1 auto;min-height:0}
.ih-code .q{text-align:center;font:650 13px var(--font);color:var(--ink-2)}
.ih-code .ms-opts{display:flex;flex-direction:column;gap:6px}
@media (prefers-reduced-motion:reduce){.ih-gpin.drop,.ih-resbar,.ih-sum{animation:none}.ih-photo.wait::after{animation:none}}
.reduce .ih-gpin.drop,.reduce .ih-resbar,.reduce .ih-sum{animation:none}
`);

  Ludus.register({
    id: 'invhunt', name: 'Mosaic Hunt', aka: 'street-art mosaics, photos, map, city codes, geography', tag: 'Puzzle', tint: '#24315c',
    hint: 'Click the map to pin · <kbd>Enter</kbd> guess · <kbd>+</kbd><kbd>-</kbd> zoom · <kbd>H</kbd> hint · <kbd>Esc</kbd> pauses',
    _rules: { px, ll, dist, points, mapSize, setBounds, inBounds, fmtD, cityOf, photoUrls },
    art(ctx, w, h) {
      const u = Math.min(h / 78, w / 150);
      ctx.fillStyle = '#24315c'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 4 * u;
      for (let x = -20 * u; x < w + 20 * u; x += 34 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18 * u, h); ctx.stroke(); }
      for (let y = 12 * u; y < h; y += 26 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y - 6 * u); ctx.stroke(); }
      const P = CREATURES.Moth;
      const s = 5 * u, tw = 11 * s, th = 8 * s, tx = w / 2 - tw / 2 - 18 * u, ty = h / 2 - th / 2 - 2 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; Ludus.draw.roundRect(ctx, tx - 6 * u + 2 * u, ty - 6 * u + 3 * u, tw + 12 * u, th + 12 * u, 4 * u); ctx.fill();
      ctx.fillStyle = '#f7f4ec'; Ludus.draw.roundRect(ctx, tx - 6 * u, ty - 6 * u, tw + 12 * u, th + 12 * u, 4 * u); ctx.fill();
      P.forEach((r, j) => [...r].forEach((c, i) => { if (c === '1') { ctx.fillStyle = (i + j) % 5 === 0 ? '#ffd23c' : '#ff3c7a'; ctx.fillRect(tx + i * s + 0.5, ty + j * s + 0.5, s - 1, s - 1); } }));
      const x = tx + tw + 36 * u, y = h * 0.84, r = 11 * u, cy = y - r * 1.55;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5 * u, 6.5 * u, 2 * u, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - r * 0.35, y - r * 0.55, x - r, cy + r * 0.7, x - r, cy); ctx.arc(x, cy, r, Math.PI, 0); ctx.bezierCurveTo(x + r, cy + r * 0.7, x + r * 0.35, y - r * 0.55, x, y); ctx.closePath();
      ctx.fillStyle = '#4b93ff'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, cy, r * 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = `800 ${10 * u}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PA_1000', tx + tw / 2, ty + th + 16 * u);
    },
    create(stage, api) {
      const el = K.el;
      let D = null, ALL = null, SETS = null, WIDTH = {}, destroyed = false;
      const S = api.settings;
      const s0 = S.invhunt && typeof S.invhunt === 'object' ? S.invhunt : {};
      let mode = MODES.some(m => m[0] === s0.mode) ? s0.mode : 'city';
      let city = typeof s0.city === 'string' ? s0.city : 'PA';
      let len = LENS.includes(s0.len) ? s0.len : 5;
      let alive = s0.alive === true;
      let lay = LAYOUTS.includes(s0.lay) ? s0.lay : null;   // null until the player picks: then it follows the window shape
      const remember = () => { S.invhunt = { mode, city, len, alive, lay }; Ludus.save(); };
      const calm = () => !!api.reduceMotion;

      // ----- DOM -----
      const root = el('div', 'lk ih'); stage.appendChild(root);
      const top = el('div', 'lk-row ih-top'); root.appendChild(top);
      const modeChip = el('button', 'lk-chip'), cityChip = el('button', 'lk-chip'), lenChip = el('button', 'lk-chip'), aliveChip = el('button', 'lk-chip');
      const layBox = el('div', 'ih-lay'); layBox.setAttribute('role', 'group'); layBox.setAttribute('aria-label', 'Layout');
      const layBtns = [['v', 'Stacked layout (photo above the map)', ICON_V], ['h', 'Side by side layout (photo beside the map)', ICON_H]].map(([k, t, svg]) => {
        const b = el('button'); b.type = 'button'; b.title = t; b.setAttribute('aria-label', t); b.innerHTML = svg;
        b.onclick = () => { lay = k; remember(); api.sfx('click'); applyLayout(); b.blur(); }; layBox.appendChild(b); return b;
      });
      top.append(modeChip, cityChip, lenChip, aliveChip);
      [modeChip, cityChip, lenChip, aliveChip].forEach(b => { b.type = 'button'; b.addEventListener('click', () => b.blur()); });
      const main = el('div', 'ih-main'); root.appendChild(main);
      const scene = el('div', 'ih-scene'); main.appendChild(scene);
      const clue = el('div', 'ih-clue'); scene.appendChild(clue);
      const photo = el('div', 'ih-photo'); const badge = el('canvas'); badge.setAttribute('aria-hidden', 'true');
      const img = el('img'); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.draggable = false;
      photo.append(badge, img);
      const pinfo = el('div', 'grow'), idEl = el('div', 'id'), meta = el('div', 'meta'), pcredit = el('div', 'ih-pcredit'); pinfo.append(idEl, meta, pcredit);
      clue.append(photo, pinfo);
      const status = el('div', 'lk-row ih-status'); scene.appendChild(status);
      const stLeft = el('span'), stRight = el('span'); status.append(stLeft, stRight);
      const hintLine = el('div', 'ih-hintline'); hintLine.hidden = true; scene.appendChild(hintLine);
      const hintBtn = el('button', 'lk-btn'); hintBtn.type = 'button'; scene.appendChild(hintBtn);
      hintBtn.style.height = '34px'; hintBtn.style.fontSize = '12.5px';
      // code breaker
      const codeBox = el('div', 'ih-code'); codeBox.hidden = true; scene.appendChild(codeBox);
      const codeOpts = el('div', 'ms-opts');
      codeBox.append(el('div', 'q', 'Which city does this code belong to?'), codeOpts);
      // guess map
      const mini = el('div', 'ih-mini open'); main.appendChild(mini);
      const mapbox = el('div', 'ih-mapbox'); mini.appendChild(mapbox);
      const gmapEl = el('div', 'ih-gmap'); gmapEl.setAttribute('aria-label', 'Guess map. Click to drop your pin.'); mapbox.appendChild(gmapEl);
      const gcredit = el('div', 'ih-credit'); mapbox.appendChild(gcredit);
      const ctl = el('div', 'ih-mapctl'); mapbox.appendChild(ctl);
      const cb = (label, svg, fn) => { const b = el('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = svg; b.onclick = e => { e.stopPropagation(); fn(); b.blur(); }; ctl.appendChild(b); return b; };
      cb('Zoom in', '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', () => zoomBy(1));
      cb('Zoom out', '<svg viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', () => zoomBy(-1));
      cb('Show the whole map', '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>', () => homeView());
      const guessBtn = el('button', 'ih-guess', 'Place your pin on the map'); guessBtn.type = 'button'; guessBtn.disabled = true; mini.appendChild(guessBtn);
      // result
      const res = el('div', 'ih-res'); res.hidden = true; main.appendChild(res);
      const rmapEl = el('div', 'ih-rmap'); res.appendChild(rmapEl);
      const rcredit = el('div', 'ih-credit'); res.appendChild(rcredit);
      const resBar = el('div', 'ih-resbar'); res.appendChild(resBar);
      const sum = el('div', 'ih-sum'); sum.hidden = true; res.appendChild(sum);
      const sheet = el('div', 'lk-sheet'); sheet.hidden = true; root.appendChild(sheet);

      // ----- state -----
      let TS = null, guess = null, truth = null, revealed = false, hintUsed = false, pinned = false;
      let round = 0, score = 0, used = new Set(), pool = [], phase = 'boot', hist = [];
      let lives = CODE_LIVES, streak = 0, right = 0, cAns = null, cOpts = [], cLock = false;
      let gm = null, rm = null, gPin = null, rLayers = [], offline = false, mapErr = false, photoTok = 0, hoverT = 0;

      // ----- layout -----
      const curLay = () => 'v';
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      function applyLayout() {
        const L0 = curLay(); root.dataset.lay = L0;
        sizeMini();
      }
      // The map is laid out once at its open size; closed, it is only scaled down, so opening never re-lays-out the tiles.
      function sizeMini() {
        const MW = main.clientWidth, MH = main.clientHeight, GB = 47; if (!MW || !MH) return;
        const code = mode === 'code', h = root.dataset.lay === 'h';
        let W, H, CW, CH;
        if (h) {
          CW = clamp(MW * 0.5, Math.min(220, MW - 120), MW - 170); CH = clamp((MH - GB) * 0.62, Math.min(140, MH - GB), MH - GB);
          W = clamp(MW * 0.9, CW, MW); H = clamp(MH - GB, CH, MH - GB);
          root.style.setProperty('--ph', Math.round(clamp(Math.min(MW - CW - 14 - 24, MH * 0.42), 72, 140)) + 'px');
        } else {
          W = CW = MW;
          const need = clue.offsetHeight + status.offsetHeight + (hintLine.hidden ? 0 : hintLine.offsetHeight + 8) + (hintBtn.hidden ? 0 : hintBtn.offsetHeight + 8) + 18;
          H = clamp((MH - GB) * 0.9, 120, MH - GB); CH = clamp(MH - GB - need, Math.min(120, H), H); H = CH;
        }
        root.style.setProperty('--mini-w', Math.round(W) + 'px'); root.style.setProperty('--mini-h', Math.round(H) + 'px');
        root.style.setProperty('--mini-cw', Math.round(CW) + 'px'); root.style.setProperty('--mini-ch', Math.round(CH) + 'px');
        root.style.setProperty('--mini-s', Math.max(CW / W, CH / H).toFixed(4));
        root.style.setProperty('--scene-pr', code || !h ? '0px' : Math.round(CW + 14) + 'px');
        root.style.setProperty('--scene-pb', code || h ? '0px' : Math.round(CH + GB + 10) + 'px');
        if (gm) gm.resize();
        if (rm && !res.hidden) rm.resize();
      }
      function openMini(on) {
        clearTimeout(hoverT);
        mini.classList.add('open');   // the map keeps one small size; it never grows or shrinks
      }

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

      // ----- the real photo (live from the catalogue), with the drawn stand-in underneath -----
      function setPhoto(id) {
        const tok = ++photoTok, urls = photoUrls(id, WIDTH[canon(id.split('_')[0])]);
        sprite(badge, id);
        photo.classList.remove('ok'); img.removeAttribute('src'); img.alt = '';
        const offlineNote = () => { pcredit.textContent = 'Photo unavailable offline: drawn stand-in'; };
        if (!urls.length || navigator.onLine === false) { photo.classList.remove('wait'); offlineNote(); return; }
        photo.classList.add('wait'); pcredit.textContent = '';
        let i = 0;
        const tryNext = () => {
          if (tok !== photoTok) return;
          if (i >= urls.length) { photo.classList.remove('wait'); offlineNote(); return; }
          const u = urls[i++], probe = new Image(); probe.referrerPolicy = 'no-referrer';
          probe.onload = () => {
            if (tok !== photoTok) return;
            img.src = u; img.alt = `Photo of mosaic ${id}`; photo.classList.remove('wait'); photo.classList.add('ok');
            pcredit.innerHTML = ''; pcredit.append('Photo: ');
            const a = el('a', '', PHOTO_SITE); a.href = 'https://www.invader-spotter.art/'; a.target = '_blank'; a.rel = 'noopener noreferrer'; pcredit.appendChild(a);
          };
          probe.onerror = tryNext;
          probe.src = u;
        };
        tryNext();
      }
      function setPlaque(r) {
        idEl.textContent = r.id.trim();
        setPhoto(r.id.trim());
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
      function setGuessBtn() {
        guessBtn.disabled = !guess || phase !== 'play';
        guessBtn.textContent = guess ? 'Guess' : (mode === 'world' ? 'Place your pin on the world map' : 'Place your pin on the map');
        if (!guess && guessBtn.scrollWidth > guessBtn.clientWidth + 1) guessBtn.textContent = 'Place your pin';
      }
      function setHintBtn() {
        hintBtn.hidden = mode === 'code' || !truth || !truth.hint;
        if (!truth) return;
        hintBtn.disabled = !truth.hint || hintUsed || revealed;
        hintBtn.textContent = hintUsed ? 'Hint shown (−500)' : 'Show hint (−500)';
      }

      // ----- maps -----
      const fitPts = T => { const b = setBounds(T); return [[b[0], b[1]], [b[2], b[3]]]; };
      function homeView() {
        if (!gm || !TS) return;
        if (TS.code === 'WORLD') gm.fit([[-50, -165], [70, 175]], { top: 6, left: 6, right: 6, bottom: 6 }, 3);
        else gm.fit(fitPts(TS), { top: 10, left: 10, right: 10, bottom: 10 }, 16);
      }
      function zoomBy(dz) { if (!gm) return; const c = gm.getCenter(); gm.setView(c.lat, c.lng, Math.max(1, Math.min(18, gm.getZoom() + dz))); }
      function goOffline() {
        if (offline) return; offline = true;
        [gm, rm].forEach(m => { if (m) { layTiles(m, SETS.world); if (TS && TS.code !== 'WORLD') layTiles(m, TS); } });
        gcredit.innerHTML = rcredit.innerHTML = '<i>Offline map © OpenStreetMap contributors</i>';
      }
      function credit(c) { c.innerHTML = '<i>© OpenFreeMap · © OpenStreetMap contributors</i>'; }
      function ensureGuessMap() {
        if (gm || mapErr || !window.__GEO_MAP__) return;
        sizeMini();
        gm = window.__GEO_MAP__.create(gmapEl, gcredit, { lat: 25, lon: 10, zoom: 1, flat: offline || navigator.onLine === false });
        credit(gcredit);
        watchTiles(gm, goOffline);
        if (offline) goOffline();
        gm.onClick(p => {
          if (phase !== 'play' || revealed) return;
          if (!mini.classList.contains('open')) { openMini(true); return; }
          setGuess([p.lat, p.lon], true);
        });
      }
      function setGuess(g, sound) {
        guess = g;
        if (gPin) { gPin.remove(); gPin = null; }
        if (gm && g) gPin = gm.marker(g[0], g[1], pinHtml(sound && !calm()), { size: 24, z: 10 });
        if (sound) api.sfx('tap');
        setGuessBtn();
      }
      function ensureResMap() {
        if (rm || !window.__GEO_MAP__) return;
        rm = window.__GEO_MAP__.create(rmapEl, rcredit, { lat: 25, lon: 10, zoom: 1, flat: offline || navigator.onLine === false });
        credit(rcredit);
        watchTiles(rm, goOffline);
        if (offline) { offline = false; goOffline(); }
      }
      function clearRes() { rLayers.forEach(x => { try { x.remove(); } catch (e) {} }); rLayers = []; }
      function plot(h, label) {
        const t = rm.marker(h.t[0], h.t[1], targetHtml, { size: 30, z: 1000, label });
        rLayers.push(t);
        if (h.g) { const ln = rm.line(); ln.set(h.g, h.t); rLayers.push(ln, rm.marker(h.g[0], h.g[1], pinHtml(false), { size: 24, z: 900 })); }
      }
      function fitRes(list, bottom) {
        const pts = []; list.forEach(h => { pts.push(h.t); if (h.g) pts.push(h.g); });
        if (pts.length === 1) { const p = pts[0]; pts.push([p[0] + 0.004, p[1] + 0.004], [p[0] - 0.004, p[1] - 0.004]); }
        rm.fit(pts, { top: 60, left: 60, right: 60, bottom: bottom + 20 }, TS && TS.code !== 'WORLD' ? 17 : 12);
      }

      // ----- rounds -----
      function loadSet(code) {
        TS = code === 'WORLD' ? SETS.world : SETS.cities.find(t => t.code === code);
        if (offline) [gm, rm].forEach(m => { if (m && TS.code !== 'WORLD') layTiles(m, TS); });
        homeView();
      }
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
        mini.hidden = code; hintBtn.hidden = code; codeBox.hidden = !code; res.hidden = true;
        chips(); applyLayout();
      }
      function newGame() {
        if (!D) return;
        sheet.hidden = true; score = 0; round = 0; used = new Set(); hist = []; lives = CODE_LIVES; streak = 0; right = 0; api.score(0);
        if (!SETS.cities.some(t => t.code === city)) city = 'PA';
        pool = buildPool(); showMode();
        if (!pool.length) { phase = 'empty'; api.toast('No mosaics match these rules'); return; }
        if (mode === 'code') { nextCode(); return; }
        ensureGuessMap();
        loadSet(mode === 'world' ? 'WORLD' : city);
        nextRound();
      }
      function startRoundWith(r, opts) {
        truth = r; used.add(r.id); revealed = false; hintUsed = !!(opts && opts.hint); phase = 'play';
        setPlaque(r); res.hidden = true; sum.hidden = true; mini.hidden = false;
        hintLine.hidden = !hintUsed; if (hintUsed) hintLine.textContent = 'Hint: ' + r.hint;
        setGuess(opts && opts.guess || null, false);
        setHintBtn(); hud(); openMini(false); sizeMini();
        homeView();
      }
      function nextRound() { round++; startRoundWith(pick()); }
      function submit() {
        if (!guess || revealed || phase !== 'play') return;
        revealed = true; phase = 'result';
        const t = [truth.lat, truth.lng], d = dist(guess, t), pts = points(d, mapSize(TS), hintUsed);
        score += pts; api.score(score); api.sfx(pts > MAX_PTS * 0.6 ? 'score' : 'click');
        hist.push({ id: truth.id.trim(), t, g: guess.slice(), d, pts });
        openMini(false); mini.hidden = true; setHintBtn(); hud();
        showResult(hist[hist.length - 1]);
      }
      function showResult(h) {
        res.hidden = false; sum.hidden = true; ensureResMap();
        resBar.innerHTML = '';
        const row = el('div', 'row'), info = el('div');
        const big = el('div', 'big', '+' + h.pts.toLocaleString()); big.appendChild(el('small', '', `points · ${fmtD(h.d)} away`));
        info.append(big, el('p', '', `${h.id} is in ${cityOf(canon(truth.city))}${truth.hint ? ' (' + truth.hint + ')' : ''}. ${STATUS[truth.st] || ''}.`));
        const nx = el('button', 'lk-btn lk-primary', round >= len ? 'See summary' : 'Next'); nx.type = 'button';
        nx.onclick = () => { api.sfx('click'); next(); nx.blur(); };
        row.append(info, nx);
        const meter = el('div', 'ih-meter'), fill = el('i'); meter.appendChild(fill);
        resBar.append(row, meter);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = (h.pts / MAX_PTS * 100).toFixed(1) + '%'; }));
        if (rm) { rm.resize(); clearRes(); plot(h, h.id); fitRes([h], resBar.offsetHeight + 34); }
      }
      function showSummary() {
        phase = 'summary'; res.hidden = false; ensureResMap();
        resBar.innerHTML = ''; resBar.hidden = true;
        if (rm) { rm.resize(); clearRes(); hist.forEach(h => plot(h, '')); fitRes(hist, 40); }
        sum.innerHTML = '';
        sum.append(el('h2', '', score > len * MAX_PTS * 0.8 ? 'You know these walls' : score > len * MAX_PTS * 0.5 ? 'Solid hunting' : 'Hunt complete'),
          el('p', 'tot', `${score.toLocaleString()} of ${(len * MAX_PTS).toLocaleString()} points · ${MODES.find(m => m[0] === mode)[1]}`));
        const tb = el('table'), hd = el('tr'); ['#', 'Mosaic', 'Distance', 'Points'].forEach(t => hd.appendChild(el('th', '', t))); tb.appendChild(hd);
        hist.forEach((h, i) => { const tr = el('tr'); [String(i + 1), h.id, fmtD(h.d), h.pts.toLocaleString()].forEach(t => tr.appendChild(el('td', '', t))); tb.appendChild(tr); });
        const b = el('button', 'lk-btn lk-primary', 'See final score'); b.type = 'button';
        b.onclick = () => { api.sfx('click'); finish(); };
        sum.append(tb, b); sum.hidden = false;
      }
      function finish() {
        if (phase === 'over') return;
        phase = 'over'; resBar.hidden = false;
        api.over({ score, title: score > len * MAX_PTS * 0.8 ? 'You know these walls' : score > len * MAX_PTS * 0.5 ? 'Solid hunting' : 'Hunt complete', message: `${len} mosaics · ${MODES.find(m => m[0] === mode)[1]}` });
      }
      function next() {
        if (phase === 'summary') { finish(); return; }
        if (phase !== 'result') return;
        resBar.hidden = false;
        if (round >= len) { showSummary(); return; }
        nextRound();
      }
      hintBtn.onclick = () => { if (!truth || !truth.hint || hintUsed || revealed) return; hintUsed = true; hintLine.textContent = 'Hint: ' + truth.hint; hintLine.hidden = false; api.sfx('click'); setHintBtn(); hintBtn.blur(); sizeMini(); };
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
        if (k === 'Enter' || k === ' ') { e.preventDefault(); if (e.repeat) return; if (phase === 'play') submit(); else if (phase === 'result' || phase === 'summary') next(); return; }
        if (phase !== 'play') return;
        if (k === '+' || k === '=') { openMini(true); zoomBy(1); }
        else if (k === '-' || k === '_') { openMini(true); zoomBy(-1); }
        else if (k === '0') homeView();
        else if (k === 'h' || k === 'H') hintBtn.click();
      });
      const ro = new ResizeObserver(() => { if (!lay) applyLayout(); else sizeMini(); }); ro.observe(stage);

      // ----- save and restore -----
      function snapshot() {
        if (destroyed || !D || !truth || phase === 'over' || phase === 'boot' || phase === 'empty' || phase === 'error') return null;
        const base = { v: 2, mode, city, len, alive, score };
        if (mode === 'code') {
          if (lives <= 0) return null;
          return Object.assign(base, { lives, streak, right, id: phase === 'play' ? truth.id : null, opts: phase === 'play' ? cOpts.slice() : null });
        }
        // an answered round is saved as finished, so coming back moves on instead of scoring it twice
        const c = gm && phase === 'play' ? gm.getCenter() : null;
        return Object.assign(base, { round, used: [...used].slice(-60), id: truth.id, done: phase !== 'play', guess: guess && phase === 'play' ? guess.slice() : null, hint: hintUsed, hist: hist.slice(-10), map: c ? [c.lat, c.lng, gm.getZoom()] : null });
      }
      function restore(s) {
        try {
          if (!s || s.v !== 2 || !MODES.some(m => m[0] === s.mode) || !LENS.includes(s.len)) return false;
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
          const fin = v => Number.isFinite(v), okLL = g => Array.isArray(g) && g.length === 2 && g.every(fin) && Math.abs(g[0]) <= 90 && Math.abs(g[1]) <= 180;
          hist = Array.isArray(s.hist) ? s.hist.filter(h => h && typeof h.id === 'string' && okLL(h.t) && okLL(h.g) && fin(h.d) && fin(h.pts)) : [];
          ensureGuessMap();
          loadSet(mode === 'world' ? 'WORLD' : city);
          if (s.done) { if (round >= len) return false; nextRound(); return true; }
          startRoundWith(r, { guess: okLL(s.guess) ? s.guess.slice() : null, hint: !!s.hint && !!r.hint });
          if (gm && Array.isArray(s.map) && s.map.length === 3 && s.map.every(fin)) gm.setView(s.map[0], s.map[1], s.map[2]);
          return true;
        } catch (e) { return false; }
      }

      // ----- boot -----
      async function boot() {
        phase = 'boot'; sheet.innerHTML = '<div class="lk-spin"></div>'; sheet.hidden = false; chips(); applyLayout();
        try {
          const [data] = await Promise.all([K.loadData('invhunt', DATA), loadMap().catch(() => { mapErr = true; })]);
          if (destroyed) return;
          if (!data || !Array.isArray(data.inv) || !Array.isArray(data.sets)) throw new Error('bad data');
          if (mapErr) throw new Error('map');
          D = data;
          ALL = data.inv.map(r => ({ id: String(r[0]), lat: +r[1], lng: +r[2], st: r[3] | 0, pts: r[4] | 0, hint: r[5] ? String(r[5]) : '', city: String(r[0]).split('_')[0] })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
          WIDTH = {}; ALL.forEach(r => { const c = canon(r.city), n = String(parseInt(r.id.split('_')[1], 10) || 0); WIDTH[c] = Math.max(WIDTH[c] || 2, n.length); });
          SETS = { cities: data.sets.filter(t => t.code !== 'WORLD'), world: data.sets.find(t => t.code === 'WORLD') };
          sheet.hidden = true;
          if (!(api.saved && restore(api.saved))) newGame();
        } catch (e) {
          if (destroyed) return;
          phase = 'error'; sheet.innerHTML = ''; const p = el('div', 'lk-panel');
          p.append(el('h2', '', mapErr ? 'Could not open the map' : 'Could not load the mosaics'), el('p', 'lk-muted', 'Something did not open. Try again.'));
          const b = el('button', 'lk-btn lk-primary', 'Try again'); b.onclick = () => { mapErr = false; boot(); }; p.appendChild(b);
          sheet.appendChild(p);
        }
      }
      boot();

      if (window.ludusDebug) {
        window.ludusDebug.invhunt = () => ({ phase, mode, city, len, round, score, lay: curLay(), truth: truth && { id: truth.id, lat: truth.lat, lng: truth.lng, city: truth.city }, guess, revealed, hintUsed, lives, streak, right, cAns, cOpts, set: TS && TS.code, hist: hist.slice(), mapOpen: mini.classList.contains('open'), offline, photo: img.currentSrc || null });
        window.ludusDebug.invhuntCtl = { pinAt: (lat, lng) => { if (phase === 'play') setGuess([lat, lng], false); }, submit, next, open: on => openMini(on !== false), offline: goOffline, map: () => gm };
      }
      return {
        save: snapshot,
        pause() {},
        resume() { if (gm) gm.resize(); if (rm && !res.hidden) rm.resize(); },
        destroy() {
          destroyed = true; photoTok++; clearTimeout(hoverT);
          try { ro.disconnect(); } catch (e) {}
          try { gm && gm.remove(); } catch (e) {}
          try { rm && rm.remove(); } catch (e) {}
          root.remove();
        }
      };
    }
  });
})();
