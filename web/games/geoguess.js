/* Geo Guess: a street-level 360 view of somewhere on Earth. Look around, move along the road, then pin where you are on the map.
   Closer pin = more points (5000 max, same falloff as the famous one). Solo, or online with the same places for everyone.
   Data (all free, no key, no account): street photos from Panoramax (api.panoramax.xyz), map tiles from OpenStreetMap,
   viewer libraries bundled in web/vendor (Pannellum, Leaflet). The place pool is games/geo/pool.js. Needs internet. */
(function () {
  const D = Ludus.draw;
  const API = 'https://api.panoramax.xyz/api';
  const TIMES = [[30, '30 s'], [60, '60 s'], [120, '2 min'], [0, 'No limit']];
  const ROUNDS = [3, 5, 10];
  const MAX_POINTS = 5000, FALLOFF_KM = 1492.7;
  const SEAT = ['#d97757', '#5b8def', '#4f9d69', '#9b6dd6'];
  const TILES = [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: '© OpenStreetMap contributors' },
    { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', max: 19, credit: '© OpenStreetMap contributors © CARTO', sub: 'abcd' }
  ];

  // ---------- pure rules (also used by the tests) ----------
  const rad = d => d * Math.PI / 180;
  function distKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function pointsFor(km) { return km <= 0.025 ? MAX_POINTS : Math.max(0, Math.round(MAX_POINTS * Math.exp(-km / FALLOFF_KM))); }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const wrap360 = d => ((d % 360) + 360) % 360;
  const wrap180 = d => { d = wrap360(d); return d > 180 ? d - 360 : d; };
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const fmtDist = km => km < 1 ? Math.max(1, Math.round(km * 1000)) + ' m' : km < 100 ? (Math.round(km * 10) / 10).toLocaleString('en-US') + ' km' : fmtN(km) + ' km';
  const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  // Which places a game uses, from a shuffled list: one per country first, so a game travels.
  function chooseOrder(pool, rnd) {
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const seen = new Set(), first = [], rest = [];
    idx.forEach(i => { const k = pool[i].cc || pool[i].city; if (seen.has(k)) rest.push(i); else { seen.add(k); first.push(i); } });
    return first.concat(rest);
  }

  // ---------- loading libraries and data on demand ----------
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  function loadCss(href) {
    if (document.querySelector('link[data-geo="' + href + '"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.dataset.geo = href; document.head.appendChild(l);
  }
  async function loadAll() {
    loadCss('vendor/leaflet.css'); loadCss('vendor/pannellum.css');
    await Promise.all([loadScript('vendor/leaflet.js'), loadScript('vendor/pannellum.js'), loadScript('games/geo/pool.js')]);
    if (!window.L || !window.pannellum || !Array.isArray(window.__GEO_POOL__)) throw new Error('missing');
    return window.__GEO_POOL__;
  }
  // Panoramax item (one picture): where it is, which way it faces, the files, and the neighbours along the road.
  const itemCache = new Map();
  function getItem(c, id) {
    const key = c + '/' + id;
    if (itemCache.has(key)) return itemCache.get(key);
    const p = (async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(`${API}/collections/${encodeURIComponent(c)}/items/${encodeURIComponent(id)}`, { signal: ctl.signal });
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        const sd = j.assets && j.assets.sd && j.assets.sd.href, g = j.geometry && j.geometry.coordinates;
        if (!sd || !Array.isArray(g)) throw new Error('bad item');
        const nb = rel => (j.links || []).filter(l => l.rel === rel && l.id && l.geometry && Array.isArray(l.geometry.coordinates))
          .map(l => ({ id: String(l.id), lat: l.geometry.coordinates[1], lon: l.geometry.coordinates[0] }));
        return { id, c, lat: g[1], lon: g[0], az: Number(j.properties && j.properties['view:azimuth']) || 0, sd, prev: nb('prev'), next: nb('next') };
      } finally { clearTimeout(t); }
    })();
    itemCache.set(key, p); p.catch(() => itemCache.delete(key));
    return p;
  }
  const warm = new Set();
  function warmImage(url) { if (warm.has(url) || warm.size > 40) return; warm.add(url); const i = new Image(); i.crossOrigin = 'anonymous'; i.src = url; }

  // ---------- styles (kept here so the game is one file plus its data) ----------
  const CSS = `
.geo{position:absolute;inset:0;overflow:hidden;border-radius:inherit;background:#15130f;color:#fff;font-family:var(--font);user-select:none;-webkit-user-select:none}
.geo *{box-sizing:border-box}
.geo-pano{position:absolute;inset:0}
.geo-pano .pnlm-container{background:#15130f}
.geo-pano{transition:filter .3s,transform .3s}
.geo[data-ph=setup] .geo-pano,.geo[data-ph=offline] .geo-pano,.geo[data-ph=final] .geo-pano{filter:blur(5px) brightness(.62);transform:scale(1.04)}
.geo-pano .pnlm-load-box,.geo-pano .pnlm-about-msg,.geo-pano .pnlm-compass{display:none!important}
.geo-glass{background:rgba(24,21,17,.62);-webkit-backdrop-filter:blur(10px) saturate(1.3);backdrop-filter:blur(10px) saturate(1.3);border:1px solid rgba(255,255,255,.14);box-shadow:0 6px 18px -8px rgba(0,0,0,.6)}
.geo-pill{position:absolute;border-radius:999px;padding:5px 11px;font:650 12px/1 var(--font-round);letter-spacing:.01em;white-space:nowrap}
.geo-round{left:10px;top:10px}
.geo-top{position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.geo-compass{width:176px;height:30px;border-radius:999px;overflow:hidden}
.geo-compass canvas{display:block;width:100%;height:100%}
.geo-timer{position:static;min-width:62px;text-align:center;font-size:15px;font-variant-numeric:tabular-nums;padding:6px 12px}
.geo-timer.low{background:rgba(209,73,91,.82)}
.geo-timer[hidden]{display:none}
.geo-score{position:absolute;right:10px;top:10px;width:158px;border-radius:14px;padding:8px 10px}
.geo-score .tot{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.geo-score .tot span{font:600 10.5px var(--font);opacity:.7;letter-spacing:.06em;text-transform:uppercase}
.geo-score .tot b{font:700 17px/1 var(--font-round);font-variant-numeric:tabular-nums}
.geo-cells{display:grid;grid-template-columns:repeat(5,1fr);gap:3px 4px;margin-top:7px}
.geo-cells i{font-style:normal;text-align:center;font:600 10px/1.2 var(--font);font-variant-numeric:tabular-nums;color:rgba(255,255,255,.4);border-top:2px solid rgba(255,255,255,.18);padding-top:3px}
.geo-cells i.done{color:#fff;border-color:var(--accent)}
.geo-cells i.now{border-color:#fff;color:#fff}
.geo-plist{margin-top:6px;display:flex;flex-direction:column;gap:3px}
.geo-plist div{display:flex;align-items:center;gap:6px;font:600 11.5px var(--font)}
.geo-plist u{width:8px;height:8px;border-radius:50%;flex:none}
.geo-plist span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.geo-plist b{font-variant-numeric:tabular-nums;font-weight:700}
.geo-plist em{font-style:normal;font-size:10px;opacity:.55;min-width:14px;text-align:right}
.geo-home{position:absolute;left:10px;bottom:10px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#fff;padding:0}
.geo-home svg{width:17px;height:17px}
.geo-home:hover{background:rgba(24,21,17,.8)}
.geo-mini{position:absolute;right:10px;bottom:10px;width:164px;display:flex;flex-direction:column;gap:6px;z-index:5;transition:width .22s var(--ease-out)}
.geo-mini.open{width:min(360px,56%)}
.geo-mapbox{position:relative;height:112px;border-radius:14px;overflow:hidden;opacity:.86;transition:height .22s var(--ease-out),opacity .2s;border:1px solid rgba(255,255,255,.28);box-shadow:0 8px 22px -8px rgba(0,0,0,.7);background:#cfd8dc}
.geo-mini.open .geo-mapbox{height:min(250px,calc(var(--geo-h,400px) - 128px));opacity:1}
.geo-minimap{position:absolute;inset:0}
.geo-credit{position:absolute;right:0;bottom:0;z-index:600;font:500 9px/1 var(--font);color:#333;background:rgba(255,255,255,.78);padding:2px 5px;border-top-left-radius:6px;pointer-events:none;white-space:nowrap}
.geo-mini:not(.open) .geo-credit{font-size:8px}
.geo-guess{height:38px;border:0;border-radius:12px;font:700 14px var(--font-round);letter-spacing:.02em;color:#fff;background:var(--good);cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.6);transition:transform .15s var(--spring),filter .15s,opacity .2s}
.geo-guess:hover:not(:disabled){filter:brightness(1.08)}
.geo-guess:active:not(:disabled){transform:scale(.97)}
.geo-guess:disabled{background:rgba(40,36,30,.78);color:rgba(255,255,255,.62);cursor:default}
.geo-load{position:absolute;inset:0;display:grid;place-items:center;background:rgba(21,19,15,.55);z-index:3;transition:opacity .25s}
.geo-load[hidden]{display:none}
.geo-spin{width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:geospin .8s linear infinite}
@keyframes geospin{to{transform:rotate(360deg)}}
.geo-hs{width:0;height:0;overflow:visible;cursor:pointer}
.geo-hs i{position:absolute;left:-34px;top:-24px;width:68px;height:48px;display:block;transform:perspective(160px) rotateX(58deg);transition:transform .15s,filter .15s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6));opacity:.88}
.geo-hs i svg{width:100%;height:100%}
.geo-hs:hover i{transform:perspective(160px) rotateX(58deg) scale(1.18);opacity:1}
.geo-wait{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font-size:12.5px;padding:8px 14px;z-index:4}
.geo-wait[hidden]{display:none}
.geo-res{position:absolute;inset:0;background:var(--bg);z-index:8}
.geo-res[hidden]{display:none}
.geo-resmap{position:absolute;inset:0}
.geo-bar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:16px;padding:9px 10px 9px 18px;border-radius:999px;z-index:700;max-width:calc(100% - 20px)}
.geo-bar .st{display:flex;flex-direction:column;gap:3px;min-width:0}
.geo-bar .st span{font:600 9.5px var(--font);letter-spacing:.08em;text-transform:uppercase;opacity:.65}
.geo-bar .st b{font:700 17px/1 var(--font-round);font-variant-numeric:tabular-nums;white-space:nowrap}
.geo-bar .st.pts b{color:#ffd9a8}
.geo-next{height:40px;padding:0 22px;border:0;border-radius:999px;font:700 14px var(--font-round);color:#fff;background:var(--good);cursor:pointer;box-shadow:0 6px 16px -6px rgba(0,0,0,.6);transition:transform .15s var(--spring),filter .15s;white-space:nowrap}
.geo-next:hover{filter:brightness(1.08)}
.geo-next:active{transform:scale(.97)}
.geo-next:disabled{background:rgba(70,64,56,.9);cursor:default}
.geo-res .geo-round{z-index:700}
.geo-reslist{position:absolute;left:10px;top:44px;width:176px;border-radius:14px;padding:8px 10px;z-index:700}
.geo-reslist div{display:flex;align-items:center;gap:6px;font:600 11.5px var(--font);padding:2px 0}
.geo-reslist u{width:9px;height:9px;border-radius:50%;flex:none}
.geo-reslist span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.geo-reslist b{font-variant-numeric:tabular-nums}
.geo-reslist em{font-style:normal;font-size:10.5px;opacity:.65;min-width:46px;text-align:right}
.geo-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(380px,calc(100% - 28px));max-height:calc(100% - 20px);overflow:auto;border-radius:20px;padding:18px 20px 20px;background:var(--surface);color:var(--ink);box-shadow:var(--shadow-lift);z-index:9;text-align:center}
.geo-card[hidden]{display:none}
.geo-card h2{margin:0 0 4px;font:700 20px var(--font-round)}
.geo-card p{margin:0 0 12px;font:500 12.5px/1.4 var(--font);color:var(--ink-2)}
.geo-card .lab{display:block;margin:10px 0 6px;font:600 10.5px var(--font);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.geo-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.geo-chip{height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:650 12.5px var(--font);cursor:pointer;transition:transform .15s var(--spring),background .15s}
.geo-chip:active{transform:scale(.96)}
.geo-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.geo-chip:disabled{opacity:.5;cursor:default}
.geo-go{margin-top:16px;width:100%;height:42px;border:0;border-radius:13px;background:var(--accent);color:var(--accent-ink);font:700 14.5px var(--font-round);cursor:pointer;transition:transform .15s var(--spring),filter .15s}
.geo-go:hover{filter:brightness(1.06)}
.geo-go:active{transform:scale(.98)}
.geo-card .note{margin:14px 0 0;font:500 12px var(--font);color:var(--ink-3)}
.geo-final table{width:100%;border-collapse:collapse;margin:8px 0 0;font:600 12px var(--font)}
.geo-final td,.geo-final th{padding:6px 4px;text-align:right;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.geo-final td:first-child,.geo-final th:first-child{text-align:left}
.geo-final th{font:600 10px var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.geo-final td.name{display:flex;align-items:center;gap:7px;max-width:120px}
.geo-final td.name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.geo-final td.name u{width:9px;height:9px;border-radius:50%;flex:none}
.geo-final tr.win td{color:var(--accent)}
.geo-final td.sm{color:var(--ink-2);font-weight:500}
.geo-pin{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.geo .leaflet-tooltip.geo-lbl{background:rgba(24,21,17,.82);color:#fff;border:0;border-radius:8px;padding:3px 7px;font:650 11px var(--font);box-shadow:none}
.geo .leaflet-tooltip-top.geo-lbl:before{border-top-color:rgba(24,21,17,.82)}
:root[data-theme="dark"] .geo .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88)}
@media (prefers-reduced-motion:reduce){.geo-spin{animation-duration:2s}}
`;
  let cssIn = false;
  function injectCss() { if (cssIn) return; cssIn = true; const s = document.createElement('style'); s.id = 'geo-css'; s.textContent = CSS; document.head.appendChild(s); }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const txt = (tag, cls, t) => { const e = el(tag, cls); e.textContent = t; return e; };
  const ARROW = '<svg viewBox="0 0 68 48"><path d="M8 38 L34 8 L60 38 L50 38 L34 19 L18 38 Z" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linejoin="round"/></svg>';
  const HOME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>';
  const pinHtml = (col, dot) => `<svg class="geo-pin" width="28" height="36" viewBox="0 0 28 36"><path d="M14 35C14 35 3 22.5 3 13.5a11 11 0 0 1 22 0C25 22.5 14 35 14 35Z" fill="${col}" stroke="#fff" stroke-width="2.2"/><circle cx="14" cy="13.5" r="${dot ? 4.2 : 3.6}" fill="#fff"/></svg>`;
  const targetHtml = '<svg class="geo-pin" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" fill="#1f1b16" stroke="#fff" stroke-width="2.4"/><circle cx="15" cy="15" r="7" fill="none" stroke="#ffd9a8" stroke-width="2"/><circle cx="15" cy="15" r="2.6" fill="#ffd9a8"/></svg>';

  // ---------- the game ----------
  Ludus.register({
    id: 'geoguess', name: 'Geo Guess', aka: 'Where in the world', tag: 'Arcade', wide: true, tint: '#2f8f83',
    online: { min: 2, max: 4 },
    hint: '<b>Drag</b> to look around · <kbd>↑</kbd><kbd>↓</kbd> or the arrows to move · click the small map to pin, <kbd>Enter</kbd> to guess',
    onlineHint: '<b>Online</b> same places for everyone · drag to look · <kbd>↑</kbd><kbd>↓</kbd> or arrows to move · pin on the map, <kbd>Enter</kbd> to guess',
    _rules: { distKm, pointsFor, bearing, chooseOrder, MAX_POINTS },
    art(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.62, 'rgba(255,255,255,0.02)'); g.addColorStop(0.62, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.04)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // road to the horizon
      const hz = h * 0.62;
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.moveTo(w * 0.22, h); ctx.lineTo(w * 0.47, hz); ctx.lineTo(w * 0.53, hz); ctx.lineTo(w * 0.78, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,242,0.7)'; ctx.lineWidth = Math.max(1.5, h * 0.025); ctx.lineCap = 'round'; ctx.setLineDash([h * 0.08, h * 0.09]);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h); ctx.lineTo(w * 0.5, hz); ctx.stroke(); ctx.setLineDash([]);
      // globe
      const gx = w * 0.27, gy = h * 0.38, gr = h * 0.27;
      ctx.strokeStyle = 'rgba(255,248,242,0.85)'; ctx.lineWidth = Math.max(1.4, h * 0.03);
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(1, h * 0.02); ctx.strokeStyle = 'rgba(255,248,242,0.55)';
      ctx.beginPath(); ctx.ellipse(gx, gy, gr * 0.42, gr, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx - gr, gy); ctx.lineTo(gx + gr, gy); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(gx, gy - gr * 0.5, gr * 0.86, gr * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
      // pin
      const px = w * 0.74, py = h * 0.62, pr = h * 0.17;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px, py + pr * 1.7, pr * 0.9, pr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8f2'; ctx.beginPath(); ctx.arc(px, py - pr * 0.5, pr, Math.PI, 0); ctx.quadraticCurveTo(px + pr, py + pr * 0.4, px, py + pr * 1.7); ctx.quadraticCurveTo(px - pr, py + pr * 0.4, px - pr, py - pr * 0.5); ctx.fill();
      ctx.fillStyle = '#d97757'; ctx.beginPath(); ctx.arc(px, py - pr * 0.5, pr * 0.42, 0, Math.PI * 2); ctx.fill();
    },
    create(stage, api) {
      injectCss();
      const on = api.online, host = !on || on.isHost, mySeat = on ? on.seat : 0;
      const S = api.settings;
      const saved = S.geo && typeof S.geo === 'object' ? S.geo : {};
      let cfg = { time: TIMES.some(t => t[0] === saved.time) ? saved.time : 60, rounds: ROUNDS.includes(saved.rounds) ? saved.rounds : 5 };
      const nameOf = seat => on ? (on.names[seat] || 'P' + (seat + 1)) : 'You';

      // ----- DOM -----
      const root = el('div', 'geo'); stage.appendChild(root);
      const panoEl = el('div', 'geo-pano'); root.appendChild(panoEl);
      const loadEl = el('div', 'geo-load', '<div class="geo-spin"></div>'); loadEl.hidden = true; root.appendChild(loadEl);
      const roundPill = txt('div', 'geo-pill geo-glass geo-round', ''); root.appendChild(roundPill);
      const top = el('div', 'geo-top'); root.appendChild(top);
      const compassBox = el('div', 'geo-compass geo-glass'); const compass = document.createElement('canvas'); compassBox.appendChild(compass); top.appendChild(compassBox);
      const timerEl = txt('div', 'geo-pill geo-glass geo-timer', ''); top.appendChild(timerEl);
      const scoreEl = el('div', 'geo-score geo-glass'); root.appendChild(scoreEl);
      const homeBtn = el('button', 'geo-home geo-glass', HOME_ICON); homeBtn.title = 'Back to the start'; homeBtn.setAttribute('aria-label', 'Back to the start'); root.appendChild(homeBtn);
      const mini = el('div', 'geo-mini'); root.appendChild(mini);
      const mapBox = el('div', 'geo-mapbox'); mini.appendChild(mapBox);
      const miniMapEl = el('div', 'geo-minimap'); mapBox.appendChild(miniMapEl);
      const miniCredit = txt('div', 'geo-credit', '© OpenStreetMap'); mapBox.appendChild(miniCredit);
      const guessBtn = txt('button', 'geo-guess', 'Guess'); guessBtn.disabled = true; mini.appendChild(guessBtn);
      const waitEl = txt('div', 'geo-pill geo-glass geo-wait', ''); waitEl.hidden = true; root.appendChild(waitEl);
      const resEl = el('div', 'geo-res'); resEl.hidden = true; root.appendChild(resEl);
      const card = el('div', 'geo-card'); card.hidden = true; root.appendChild(card);
      [roundPill, top, scoreEl, homeBtn, mini].forEach(e => { e.style.visibility = 'hidden'; });

      // ----- state -----
      let phase = 'boot';        // boot | offline | setup | load | play | wait | result | final
      let pool = null, order = [], round = 0, left = 0, elapsed = 0, lastSec = 99;
      let viewer = null, pendingDone = null, cur = null, sceneN = 0, curScene = '', heading = 0, loadToken = 0;
      let miniMap = null, miniPin = null, miniLayer = null, pin = null, resMap = null, resLayers = [], resAnim = null;
      let totals = [], pts = [], guesses = [], ready = new Set(), started = false, destroyed = false, autoAt = 0, tileLoads = 0, tileErrs = 0, tileSet = 0;
      const offs = [];
      const later = (fn, ms) => { const id = setTimeout(() => { if (!destroyed) fn(); }, ms); offs.push(() => clearTimeout(id)); return id; };
      const seats = () => on ? on.seats.slice() : [0];
      const place = r => pool[order[r]];

      // ----- the compass strip -----
      const cctx = compass.getContext('2d');
      function drawCompass() {
        const dpr = Math.min(3, window.devicePixelRatio || 1), w = 176, h = 30;
        if (compass.width !== w * dpr) { compass.width = w * dpr; compass.height = h * dpr; }
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0); cctx.clearRect(0, 0, w, h);
        const ppd = 2.6, cx = w / 2;
        cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
        for (let d = Math.floor((heading - 40) / 15) * 15; d <= heading + 40; d += 15) {
          const x = cx + (d - heading) * ppd, n = wrap360(d), card = n % 90 === 0, mid = n % 45 === 0;
          const edge = 1 - Math.min(1, Math.abs(d - heading) / 38) ** 2.2;
          cctx.globalAlpha = 0.25 + 0.75 * edge;
          if (mid) {
            const L = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][n / 45];
            cctx.fillStyle = n === 0 ? '#ff7a6b' : '#fff'; cctx.font = `700 ${card ? 12 : 10}px ui-rounded, system-ui, sans-serif`; cctx.fillText(L, x, 13);
          } else { cctx.fillStyle = '#fff'; cctx.fillRect(x - 0.5, 9, 1, 9); }
        }
        cctx.globalAlpha = 1; cctx.fillStyle = '#ffd9a8';
        cctx.beginPath(); cctx.moveTo(cx - 4.5, 23); cctx.lineTo(cx + 4.5, 23); cctx.lineTo(cx, 28); cctx.closePath(); cctx.fill();
      }

      // ----- maps -----
      function tileLayer(map, credit) {
        let layer = null;
        const make = i => {
          const t = TILES[i]; tileSet = i;
          if (layer) map.removeLayer(layer);
          layer = L.tileLayer(t.url, { maxZoom: t.max, subdomains: t.sub || 'abc', detectRetina: true, crossOrigin: false, keepBuffer: 1 }).addTo(map);
          layer.on('tileload', () => { tileLoads++; });
          layer.on('tileerror', () => { tileErrs++; if (tileSet === 0 && tileLoads === 0 && tileErrs >= 4) { make(1); setCredit(); } });
          setCredit();
        };
        const setCredit = () => { credit.textContent = TILES[tileSet].credit; };
        make(0);
      }
      function makeMaps() {
        miniMap = L.map(miniMapEl, { zoomControl: false, attributionControl: false, worldCopyJump: true, minZoom: 1, zoomSnap: 0.5, doubleClickZoom: false }).setView([25, 10], 1);
        tileLayer(miniMap, miniCredit);
        miniLayer = L.layerGroup().addTo(miniMap);
        miniMap.on('click', e => {
          if (phase !== 'play') return;
          if (!mini.classList.contains('open')) { openMini(true); return; }
          const ll = e.latlng.wrap();
          pin = { lat: ll.lat, lon: ll.lng };
          miniLayer.clearLayers();
          L.marker([pin.lat, pin.lon], { icon: L.divIcon({ className: '', html: pinHtml(SEAT[mySeat], false), iconSize: [28, 36], iconAnchor: [14, 34] }), interactive: false }).addTo(miniLayer);
          guessBtn.disabled = false; guessBtn.textContent = 'Guess'; api.sfx('tap');
        });
        new ResizeObserver(() => { if (miniMap) miniMap.invalidateSize(false); }).observe(mapBox);
      }
      let hoverT = 0, pinned = false;
      function openMini(on_) { clearTimeout(hoverT); mini.classList.toggle('open', on_); if (miniMap) { setTimeout(() => miniMap && miniMap.invalidateSize(false), 240); } }
      api.on(mini, 'pointerenter', e => { if (e.pointerType === 'touch') return; openMini(true); });
      api.on(mini, 'pointerleave', e => { if (e.pointerType === 'touch') return; clearTimeout(hoverT); hoverT = setTimeout(() => { if (!pinned) openMini(false); }, 320); });
      api.on(root, 'pointerdown', e => { if (!mini.contains(e.target) && mini.classList.contains('open')) { pinned = false; openMini(false); } }, true);

      // ----- the street view -----
      function arrowSpot(item, nb) {
        return { pitch: -23, yaw: wrap180(bearing(item, nb) - item.az), type: 'custom', cssClass: 'geo-hs',
          createTooltipFunc: d => { d.innerHTML = '<i>' + ARROW + '</i>'; }, clickHandlerFunc: () => step(nb) };
      }
      function sceneFor(item) {
        const spots = item.next.slice(0, 1).concat(item.prev.slice(0, 1)).map(nb => arrowSpot(item, nb));
        return { type: 'equirectangular', panorama: item.sd, hotSpots: spots, autoLoad: true, crossOrigin: 'anonymous' };
      }
      const NO_UI = { showControls: false, showFullscreenCtrl: false, showZoomCtrl: false, compass: false, mouseZoom: true, hfov: 100, minHfov: 45, maxHfov: 120, pitch: 0, yaw: 0, disableKeyboardCtrl: true, sceneFadeDuration: 250, friction: 0.12 };
      function showItem(item, keepHeading, onDone) {
        const token = ++loadToken;
        const prevScene = curScene, id = 's' + (++sceneN);
        const hd = keepHeading ? heading : item.az;
        const yaw = wrap180(hd - item.az), pitch = viewer ? viewer.getPitch() : 0, hfov = viewer ? viewer.getHfov() : 100;
        loadEl.hidden = false;
        let fin = false;
        const done = ok => { if (fin) return; fin = true; if (token === loadToken) loadEl.hidden = true; onDone && onDone(ok); };
        pendingDone = done;
        if (!viewer) {
          viewer = pannellum.viewer(panoEl, { default: Object.assign({ firstScene: id }, NO_UI, { yaw }), scenes: { [id]: sceneFor(item) } });
          viewer.on('error', () => { if (pendingDone) pendingDone(false); });
          viewer.on('load', () => { if (token !== loadToken) return; cur = item; curScene = id; done(true); prefetch(item); });
        } else {
          viewer.addScene(id, sceneFor(item));
          viewer.on('load', function once() { viewer.off('load', once); if (token !== loadToken) return; cur = item; curScene = id; done(true); prefetch(item); if (prevScene) { try { viewer.removeScene(prevScene); } catch (e) {} } });
          viewer.loadScene(id, pitch, yaw, hfov);
        }
        later(() => done(false), 25000);
        item._token = token;
      }
      function prefetch(item) {
        item.next.slice(0, 1).concat(item.prev.slice(0, 1)).forEach(nb => getItem(item.c, nb.id).then(it => { warmImage(it.sd); }, () => {}));
      }
      let moving = false;
      async function step(nb) {
        if (phase !== 'play' || moving || !cur) return;
        moving = true; api.sfx('move');
        try { const it = await getItem(cur.c, nb.id); showItem(it, true, ok => { moving = false; if (!ok) api.toast('Could not load that view'); }); }
        catch (e) { moving = false; api.toast('Could not load that view'); }
      }
      function stepDir(dir) {   // dir 1 = the way you face, -1 = behind you
        if (phase !== 'play' || !cur) return;
        let best = null, bestD = 100;
        cur.next.slice(0, 1).concat(cur.prev.slice(0, 1)).forEach(nb => {
          const d = Math.abs(wrap180(bearing(cur, nb) - (heading + (dir < 0 ? 180 : 0))));
          if (d < bestD) { bestD = d; best = nb; }
        });
        if (best && bestD <= 90) step(best);
      }
      async function toStart() {
        const p = place(round); if (phase !== 'play' || moving) return;
        moving = true;
        try { const it = await getItem(p.c, p.id); showItem(it, false, () => { moving = false; }); } catch (e) { moving = false; }
      }
      homeBtn.onclick = toStart;

      // ----- scoring and panels -----
      const roundPts = (r, s) => { const g = guesses[r] && guesses[r][s]; if (!g) return 0; return pointsFor(distKm(g, place(r))); };
      function totalOf(s, upTo) { let t = 0; for (let r = 0; r < upTo; r++) t += roundPts(r, s); return t; }
      function renderScore(upTo) {   // upTo: rounds that count (finished ones)
        scoreEl.innerHTML = '';
        const mine = totalOf(mySeat, upTo);
        const tot = el('div', 'tot'); tot.appendChild(txt('span', '', on ? 'Scores' : 'Total'));
        if (!on) tot.appendChild(txt('b', '', fmtN(mine)));
        scoreEl.appendChild(tot);
        if (!on) {
          const cells = el('div', 'geo-cells');
          for (let r = 0; r < cfg.rounds; r++) {
            const c = txt('i', r < upTo ? 'done' : r === round ? 'now' : '', r < upTo ? (roundPts(r, 0) >= 1000 ? (roundPts(r, 0) / 1000).toFixed(1) + 'k' : String(roundPts(r, 0))) : String(r + 1));
            cells.appendChild(c);
          }
          scoreEl.appendChild(cells);
        } else {
          const list = el('div', 'geo-plist');
          seats().forEach(s => {
            const row = el('div'); const dot = el('u'); dot.style.background = SEAT[s];
            row.append(dot, txt('span', '', nameOf(s)), txt('b', '', fmtN(totalOf(s, upTo))));
            const got = guesses[round] && guesses[round][s] !== undefined && phase !== 'result' && phase !== 'final';
            row.appendChild(txt('em', '', got ? '✓' : ''));
            list.appendChild(row);
          });
          scoreEl.appendChild(list);
        }
        if (!on) api.score(mine);
        else api.score(mine);
      }

      // ----- the round -----
      function setCard(show) { card.hidden = !show; }
      function hud(vis) { [roundPill, top, scoreEl, homeBtn, mini].forEach(e => { e.style.visibility = vis ? 'visible' : 'hidden'; }); }
      function startRound(r) {
        if (destroyed || r >= cfg.rounds) return;
        round = r; phase = 'load'; ready = new Set(); pin = null; moving = false;
        resEl.hidden = true; waitEl.hidden = true; setCard(false); hud(true);
        if (miniLayer) miniLayer.clearLayers();
        if (miniMap) { miniMap.setView([25, 10], 1); }
        mini.style.display = ''; openMini(false); pinned = false;
        guessBtn.disabled = true; guessBtn.textContent = 'Guess';
        roundPill.textContent = `Round ${r + 1}/${cfg.rounds}`;
        timerEl.hidden = true; elapsed = 0; lastSec = 99;
        renderScore(r);
        const p = place(r);
        getItem(p.c, p.id).then(it => {
          if (destroyed || round !== r || phase !== 'load') return;
          showItem(it, false, ok => {
            if (destroyed || round !== r || phase !== 'load') return;
            if (!ok) { fail(); return; }
            phase = 'play'; left = cfg.time; timerEl.hidden = !cfg.time || false; if (!cfg.time) timerEl.hidden = true; else drawTimer();
          });
        }, () => fail());
      }
      function drawTimer() {
        timerEl.textContent = fmtTime(Math.max(0, Math.ceil(left)));
        timerEl.classList.toggle('low', left <= 10);
      }
      function submit(auto) {
        if (phase !== 'play') return;
        if (!pin && !auto) return;
        const g = pin ? { lat: pin.lat, lon: pin.lon } : null;
        (guesses[round] = guesses[round] || {})[mySeat] = g;
        if (on) on.send('guess', g ? { r: round, lat: Math.round(g.lat * 1e5) / 1e5, lon: Math.round(g.lon * 1e5) / 1e5 } : { r: round, n: 1 });
        phase = 'wait'; api.sfx('score'); openMini(false);
        mini.style.display = 'none'; timerEl.hidden = true;
        checkDone();
      }
      function checkDone() {
        if (phase !== 'wait') return;
        const r = round, g = guesses[r] || {};
        const todo = seats().filter(s => g[s] === undefined);
        if (todo.length) {
          waitEl.hidden = false; waitEl.textContent = todo.length === 1 ? `Waiting for ${nameOf(todo[0])}` : `Waiting for ${todo.length} players`;
          renderScore(r); return;
        }
        waitEl.hidden = true; showResult(r);
      }

      // ----- result map -----
      function resultMap() {
        if (resMap) return resMap;
        const holder = el('div', 'geo-resmap'); resEl.appendChild(holder);
        resMap = L.map(holder, { zoomControl: false, attributionControl: false, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 });
        const cred = txt('div', 'geo-credit', TILES[tileSet].credit); cred.style.fontSize = '10px'; resEl.appendChild(cred);
        tileLayer(resMap, cred);
        return resMap;
      }
      function showResult(r) {
        phase = 'result';
        const p = place(r), g = guesses[r] || {};
        const m = resultMap();
        resLayers.forEach(l => m.removeLayer(l)); resLayers = [];
        [...resEl.querySelectorAll('.geo-bar,.geo-reslist,.geo-pill')].forEach(e => e.remove());
        resEl.hidden = false; hud(false);
        const truth = [p.lat, p.lon];
        const tm = L.marker(truth, { icon: L.divIcon({ className: '', html: targetHtml, iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, zIndexOffset: 1000 }).addTo(m);
        resLayers.push(tm);
        const pl = seats().filter(s => g[s]);
        const bounds = L.latLngBounds([truth]);
        const lines = [];
        pl.forEach(s => {
          const gg = g[s], col = SEAT[s];
          const mk = L.marker([gg.lat, gg.lon], { icon: L.divIcon({ className: '', html: pinHtml(col, false), iconSize: [28, 36], iconAnchor: [14, 34] }), interactive: false, zIndexOffset: s === mySeat ? 900 : 800 }).addTo(m);
          if (on) mk.bindTooltip(nameOf(s), { permanent: true, direction: 'top', offset: [0, -32], className: 'geo-lbl' });
          const ln = L.polyline([[gg.lat, gg.lon], [gg.lat, gg.lon]], { color: col, weight: 3, dashArray: '2 7', lineCap: 'round', opacity: 0.95 }).addTo(m);
          resLayers.push(mk, ln); lines.push([ln, gg]); bounds.extend([gg.lat, gg.lon]);
        });
        m.invalidateSize(false);
        m.fitBounds(bounds, { paddingTopLeft: [50, 56], paddingBottomRight: [50, 92], maxZoom: 13, animate: false });
        // line draws from the pin to the real place
        const t0 = performance.now(), dur = api.reduceMotion ? 1 : 900;
        cancelAnimationFrame(resAnim);
        const frame = now => {
          if (destroyed) return;
          const k = Math.min(1, (now - t0) / dur), e = D.ease.outCubic(k);
          lines.forEach(([ln, gg]) => ln.setLatLngs([[gg.lat, gg.lon], [gg.lat + (truth[0] - gg.lat) * e, gg.lon + (truth[1] - gg.lon) * e]]));
          if (k < 1) resAnim = requestAnimationFrame(frame);
        };
        resAnim = requestAnimationFrame(frame);
        // panel
        const mine = g[mySeat], myKm = mine ? distKm(mine, p) : null, myPts = mine ? pointsFor(myKm) : 0;
        const rp = txt('div', 'geo-pill geo-glass geo-round', `Round ${r + 1}/${cfg.rounds}`); resEl.appendChild(rp);
        const bar = el('div', 'geo-bar geo-glass');
        const st = (label, val, cls) => { const d = el('div', 'st' + (cls ? ' ' + cls : '')); d.append(txt('span', '', label), txt('b', '', val)); return d; };
        const distB = st('Distance', myKm === null ? 'No guess' : fmtDist(myKm));
        const ptsB = st('Points', '0', 'pts'), totB = st('Total', fmtN(totalOf(mySeat, r + 1)));
        const last = r + 1 >= cfg.rounds;
        const next = txt('button', 'geo-next', last ? 'Results' : 'Next');
        bar.append(distB, ptsB);
        bar.append(totB, next); resEl.appendChild(bar);
        if (on) {
          const list = el('div', 'geo-reslist geo-glass');
          seats().slice().sort((a, b) => roundPts(r, b) - roundPts(r, a)).forEach(s => {
            const row = el('div'), dot = el('u'); dot.style.background = SEAT[s];
            const km = g[s] ? fmtDist(distKm(g[s], p)) : '—';
            row.append(dot, txt('span', '', nameOf(s)), txt('em', '', km), txt('b', '', fmtN(roundPts(r, s))));
            list.appendChild(row);
          });
          resEl.appendChild(list);
        }
        // count the points up
        const c0 = performance.now(), cdur = api.reduceMotion ? 1 : 1100;
        const count = now => {
          if (destroyed || phase !== 'result' || round !== r) return;
          const k = Math.min(1, (now - c0) / cdur); ptsB.querySelector('b').textContent = fmtN(myPts * D.ease.outCubic(k));
          if (k < 1) requestAnimationFrame(count);
        };
        requestAnimationFrame(count);
        api.sfx(myPts >= 4000 ? 'win' : 'tick');
        renderScore(r + 1);
        let sent = false;
        const go = () => {
          if (sent || phase !== 'result' || round !== r) return; sent = true;
          if (last) { showFinal(); return; }
          if (!on) { startRound(r + 1); return; }
          next.disabled = true; next.textContent = 'Waiting…';
          if (host) { ready.add(mySeat); maybeAdvance(); } else on.send('ready', { r });
        };
        next.onclick = go;
        autoAt = on ? performance.now() + 30000 : 0; autoGo = go;
        if (on && last) { autoAt = 0; }
        resultFocus = next;
      }
      let autoGo = null, resultFocus = null;
      function maybeAdvance() {
        if (!on || !host || phase !== 'result') return;
        const need = seats();
        if (need.every(s => ready.has(s))) {
          const nr = round + 1;
          if (nr >= cfg.rounds) return;
          on.send('rnd', { r: nr }); startRound(nr);
        }
      }

      // ----- final summary -----
      function showFinal() {
        phase = 'final'; resEl.hidden = true; hud(false); waitEl.hidden = true;
        const ids = seats(); const tot = {}; ids.forEach(s => { tot[s] = totalOf(s, cfg.rounds); });
        const top = Math.max(...ids.map(s => tot[s]));
        const winners = ids.filter(s => tot[s] === top);
        card.className = 'geo-card geo-final'; card.innerHTML = '';
        const mineWin = tot[mySeat] === top;
        card.appendChild(txt('h2', '', on ? (winners.length > 1 ? 'A tie' : winners[0] === mySeat ? 'You win' : nameOf(winners[0]) + ' wins') : 'Game complete'));
        card.appendChild(txt('p', '', on ? `${cfg.rounds} places, ${fmtN(top)} points on top` : `${fmtN(tot[mySeat])} of ${fmtN(cfg.rounds * MAX_POINTS)} points`));
        const tb = el('table');
        const head = el('tr'); head.appendChild(txt('th', '', on ? 'Player' : 'Round'));
        if (on) { for (let r = 0; r < cfg.rounds; r++) head.appendChild(txt('th', '', String(r + 1))); head.appendChild(txt('th', '', 'Total')); }
        else { head.appendChild(txt('th', '', 'Distance')); head.appendChild(txt('th', '', 'Points')); }
        tb.appendChild(head);
        if (on) {
          ids.slice().sort((a, b) => tot[b] - tot[a]).forEach(s => {
            const tr = el('tr', winners.includes(s) ? 'win' : ''), nm = el('td', 'name'), dot = el('u'); dot.style.background = SEAT[s];
            nm.append(dot, txt('span', '', nameOf(s) + (s === mySeat ? ' (you)' : ''))); tr.appendChild(nm);
            for (let r = 0; r < cfg.rounds; r++) tr.appendChild(txt('td', 'sm', fmtN(roundPts(r, s))));
            tr.appendChild(txt('td', '', fmtN(tot[s]))); tb.appendChild(tr);
          });
        } else {
          for (let r = 0; r < cfg.rounds; r++) {
            const g = guesses[r] && guesses[r][0], tr = el('tr');
            tr.append(txt('td', '', `${r + 1} · ${place(r).city}`), txt('td', 'sm', g ? fmtDist(distKm(g, place(r))) : '—'), txt('td', '', fmtN(roundPts(r, 0))));
            tb.appendChild(tr);
          }
        }
        card.appendChild(tb); setCard(true);
        renderScore(cfg.rounds);
        api.over({ score: tot[mySeat], won: mineWin, title: on ? (winners.length > 1 ? 'A tie' : winners[0] === mySeat ? 'You win' : nameOf(winners[0]) + ' wins') : 'Game complete', message: on ? `${fmtN(tot[mySeat])} points` : `${cfg.rounds} rounds` });
      }

      // ----- setup, offline and errors -----
      function fail() {
        phase = 'offline'; loadEl.hidden = true; hud(false); resEl.hidden = true; waitEl.hidden = true;
        card.className = 'geo-card'; card.innerHTML = '';
        card.appendChild(txt('h2', '', 'Needs internet'));
        card.appendChild(txt('p', '', 'Geo Guess loads street photos and maps from the web. Check your connection and try again.'));
        const b = txt('button', 'geo-go', 'Try again'); b.onclick = () => { if (!pool) boot(); else if (!started) showSetup(); else startRound(round); };
        card.appendChild(b); setCard(true);
      }
      const chipRow = (opts, cur_, pick, disabled) => {
        const row = el('div', 'geo-chips');
        opts.forEach(([v, label]) => { const b = txt('button', 'geo-chip' + (v === cur_ ? ' on' : ''), label); b.disabled = !!disabled; b.onclick = () => { pick(v); api.sfx('click'); }; row.appendChild(b); });
        return row;
      };
      function showSetup() {
        phase = 'setup'; hud(false); loadEl.hidden = true; resEl.hidden = true;
        card.className = 'geo-card'; card.innerHTML = '';
        card.appendChild(txt('h2', '', 'Geo Guess'));
        card.appendChild(txt('p', '', on ? (host ? 'Same places for everyone. Pick the rules, then start.' : 'The host is choosing the rules.') : 'Look around, move along the road, then pin where you are.'));
        card.appendChild(txt('span', 'lab', 'Time per round'));
        card.appendChild(chipRow(TIMES, cfg.time, v => { cfg.time = v; remember(); showSetup(); }, !host));
        card.appendChild(txt('span', 'lab', 'Rounds'));
        card.appendChild(chipRow(ROUNDS.map(n => [n, String(n)]), cfg.rounds, v => { cfg.rounds = v; remember(); showSetup(); }, !host));
        if (host) {
          const go = txt('button', 'geo-go', 'Start'); go.onclick = begin; card.appendChild(go);
          if (on) card.appendChild(txt('p', 'note', `${on.count} of ${on.max} players here`));
        } else card.appendChild(txt('p', 'note', 'Waiting for the host to start…'));
        setCard(true);
      }
      const remember = () => { if (host) { S.geo = { time: cfg.time, rounds: cfg.rounds }; Ludus.save(); if (on) on.send('cfg', { t: cfg.time, n: cfg.rounds }); } };
      function begin() {
        if (phase !== 'setup' || !host) return;
        started = true; api.sfx('click');
        if (on) { on.send('cfg', { t: cfg.time, n: cfg.rounds }); on.send('rnd', { r: 0 }); }
        startRound(0);
      }

      // ----- online messages -----
      if (on) {
        const okInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
        on.on('guess', (d, from) => {
          if (!d || !okInt(d.r, 0, 9) || !okInt(from, 0, 3)) return;
          if (d.n === 1) { (guesses[d.r] = guesses[d.r] || {})[from] = null; }
          else if (typeof d.lat === 'number' && typeof d.lon === 'number' && Math.abs(d.lat) <= 90 && Math.abs(d.lon) <= 180) (guesses[d.r] = guesses[d.r] || {})[from] = { lat: d.lat, lon: d.lon };
          else return;
          if (d.r === round) { checkDone(); if (phase === 'play') renderScore(round); }
        });
        on.on('cfg', (d, from) => {
          if (from !== 0 || host || !d || !TIMES.some(t => t[0] === d.t) || !ROUNDS.includes(d.n)) return;
          cfg = { time: d.t, rounds: d.n }; if (phase === 'setup') showSetup();
        });
        on.on('rnd', (d, from) => {
          if (from !== 0 || host || !d || !okInt(d.r, 0, cfg.rounds - 1) || !pool) return;
          if (started && d.r <= round && phase !== 'offline') return;
          started = true; startRound(d.r);
        });
        on.on('ready', (d, from) => { if (!host || !d || d.r !== round) return; ready.add(from); maybeAdvance(); });
        on.on('hello', (d, from) => {
          if (!host) return;
          on.sendTo(from, 'cfg', { t: cfg.time, n: cfg.rounds }); if (started) on.sendTo(from, 'rnd', { r: round });
        });
        on.onLeave(() => { checkDone(); maybeAdvance(); if (phase === 'play' || phase === 'wait') renderScore(round); });
      }

      // ----- boot -----
      async function boot() {
        phase = 'boot'; loadEl.hidden = false; setCard(false);
        try {
          if (navigator.onLine === false) throw new Error('offline');
          pool = await loadAll();
          if (destroyed) return;
          order = chooseOrder(pool, on ? () => on.rand() : () => Math.random());
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
          try { const r = await fetch(API + '/', { signal: ctl.signal }); if (!r.ok) throw new Error('api'); } finally { clearTimeout(t); }
          if (destroyed) return;
          makeMaps();
          loadEl.hidden = true;
          const first = place(0);   // the first street shows blurred behind the settings card
          getItem(first.c, first.id).then(it => { if (!destroyed && phase === 'setup') showItem(it, false); }, () => {});
          if (on && !host) { phase = 'setup'; showSetup(); const hi = () => { if (!started && !destroyed) { on.send('hello', {}); later(hi, 2500); } }; hi(); }
          else showSetup();
        } catch (e) { if (!destroyed) fail(); }
      }
      // The pool order uses the shared random stream: draw it before anything else can.
      boot();

      // ----- frame loop, keys, resize -----
      api.keys(e => {
        const k = e.key;
        if (phase === 'play') {
          if (k === 'Enter') { if (pin) submit(false); return; }
          if (k === 'ArrowUp' || k === 'w' || k === 'W') { stepDir(1); return; }
          if (k === 'ArrowDown' || k === 's' || k === 'S') { stepDir(-1); return; }
          if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && viewer) viewer.setYaw(viewer.getYaw() - 12, false);
          if ((k === 'ArrowRight' || k === 'd' || k === 'D') && viewer) viewer.setYaw(viewer.getYaw() + 12, false);
          if ((k === '+' || k === '=') && viewer) viewer.setHfov(viewer.getHfov() - 8, false);
          if ((k === '-' || k === '_') && viewer) viewer.setHfov(viewer.getHfov() + 8, false);
        } else if (phase === 'result' && (k === 'Enter' || k === ' ') && resultFocus && !resultFocus.disabled) { resultFocus.click(); }
        else if (phase === 'setup' && host && k === 'Enter') begin();
      });
      guessBtn.onclick = () => submit(false);
      new ResizeObserver(() => { root.style.setProperty('--geo-h', stage.clientHeight + 'px'); if (viewer) try { viewer.resize(); } catch (e) {} if (resMap) resMap.invalidateSize(false); if (miniMap) miniMap.invalidateSize(false); }).observe(stage);
      root.style.setProperty('--geo-h', stage.clientHeight + 'px');
      api.loop(dt => {
        if (viewer && cur && (phase === 'play' || phase === 'load')) heading = wrap360(cur.az + viewer.getYaw());
        drawCompass();
        if (root.dataset.ph !== phase) root.dataset.ph = phase;
        if (phase === 'play') {
          elapsed += dt;
          if (cfg.time) {
            left -= dt; drawTimer();
            const sec = Math.ceil(left); if (sec <= 5 && sec !== lastSec && sec > 0) api.sfx('tick'); lastSec = sec;
            if (left <= 0) submit(true);
          }
        }
        if (autoAt && phase === 'result' && performance.now() > autoAt) { autoAt = 0; autoGo && autoGo(); }
      });
      if (window.ludusDebug) window.ludusDebug.geo = () => ({ phase, round, cfg, pin, place: pool && order.length ? place(round) : null, heading, at: cur && cur.id, guesses: JSON.parse(JSON.stringify(guesses)), order: order.slice(0, 10), seats: seats() });
      if (window.ludusDebug) window.ludusGeoTest = {
        pin: (lat, lon) => { pin = { lat, lon }; guessBtn.disabled = false; },
        guess: auto => submit(!!auto), state: () => ({ phase, round, left }),
        nextBtn: () => resultFocus && resultFocus.click(), begin, time: t => { cfg.time = t; }, set: c => { Object.assign(cfg, c); showSetup(); }
      };
      return {
        pause() {}, resume() {},
        destroy() {
          destroyed = true; offs.forEach(f => f()); cancelAnimationFrame(resAnim);
          try { viewer && viewer.destroy(); } catch (e) {}
          try { miniMap && miniMap.remove(); } catch (e) {}
          try { resMap && resMap.remove(); } catch (e) {}
          delete window.ludusGeoTest;
          root.remove();
        }
      };
    }
  });
})();
