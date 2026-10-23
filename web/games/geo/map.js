/* Geo Guess map look, matched to the GeoGuessr guess map (Google Maps style, from Solomon's screen recording): green land
   cover, flat bright blue water, thin grey borders, English labels; at city zoom a pale grey street map with sparse labels.
   Free tiles, no key: Esri World Street Map up to zoom 8 (its labels are English there), recoloured in the browser to the
   Google palette; from zoom 9 Esri Light Gray Base (recoloured) with Esri Light Gray Reference labels (English; the street
   map switches to local scripts in Asia at city zoom). Never OpenStreetMap standard (local-script labels).
   Like the real game the map stays light in dark mode. Loaded on demand by geoguess.js after Leaflet. Exposes window.__GEO_MAP__. */
(function () {
  const AGS = 'arcgisonline.com/ArcGIS/rest/services/';
  const URL = (k, host) => `https://${host || 'services'}.${AGS}${k}/MapServer/tile/{z}/{y}/{x}`;
  const CREDIT = 'Tiles © Esri, HERE, Garmin, USGS, NGA · © OpenStreetMap contributors';
  // Fallback chain: recoloured tiles from either Esri host, then the plain Esri grey map, then no map (you can still pin).
  const TILES = [
    { low: () => URL('World_Street_Map'), high: () => URL('Canvas/World_Light_Gray_Base'), recolor: true },
    { low: () => URL('World_Street_Map', 'server'), high: () => URL('Canvas/World_Light_Gray_Base', 'server'), recolor: true },
    { low: () => URL('Canvas/World_Light_Gray_Base', 'server'), high: () => URL('Canvas/World_Light_Gray_Base', 'server'), recolor: false },
    { low: null, credit: 'Map unavailable right now: you can still pin a guess', short: 'No map' }
  ];
  const REF = () => URL('Canvas/World_Light_Gray_Reference');
  const SWITCH = 9;   // first zoom level of the city map

  const WATER = [138, 180, 248];   // GeoGuessr / Google water
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  // Esri street colours -> Google colours: an affine map fitted on land cover, desert, roads, borders and text pairs.
  const M = [[3.2706, 1.161, 1.7975], [-3.0556, -0.0472, -1.757], [0.7861, -0.1101, 0.9555], [1.2815, -2.2064, 2.6387]];
  const box3 = (src, dst) => {   // 3x3 box blur of an RGB float image (256x256)
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) for (let c = 0; c < 3; c++) {
      const i = (y * 256 + x) * 3 + c, l = x > 0 ? i - 3 : i, r = x < 255 ? i + 3 : i; tmp[i] = (src[l] + src[i] + src[r]) / 3;
    }
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) for (let c = 0; c < 3; c++) {
      const i = (y * 256 + x) * 3 + c, u = y > 0 ? i - 768 : i, d = y < 255 ? i + 768 : i; dst[i] = (tmp[u] + tmp[i] + tmp[d]) / 3;
    }
  };
  // Low zoom: the colour of each area comes from the blurred tile (Esri's relief texture would turn into speckle),
  // the fine detail (labels, borders, coasts) is added back unchanged.
  function paintStreet(p) {
    const n = 65536, src = new Float32Array(n * 3), lo = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { src[k * 3] = p[k * 4]; src[k * 3 + 1] = p[k * 4 + 1]; src[k * 3 + 2] = p[k * 4 + 2]; }
    box3(src, lo);
    for (let k = 0; k < n; k++) {
      const r = lo[k * 3], g = lo[k * 3 + 1], b = lo[k * 3 + 2];
      let o0 = r * M[0][0] + g * M[1][0] + b * M[2][0] + M[3][0], o1 = r * M[0][1] + g * M[1][1] + b * M[2][1] + M[3][1], o2 = r * M[0][2] + g * M[1][2] + b * M[2][2] + M[3][2];
      const road = clamp01((r - b - 45) / 30) * clamp01((r - 200) / 20);   // orange main roads: pale like Google's at this scale
      o0 += (252 - o0) * road; o1 += (247 - o1) * road; o2 += (232 - o2) * road;
      const w = clamp01((b - r - 14) / 12) * clamp01((b - g + 6) / 10);   // Esri's shaded blue water: one flat blue
      o0 += (WATER[0] - o0) * w; o1 += (WATER[1] - o1) * w; o2 += (WATER[2] - o2) * w;
      p[k * 4] = o0 + src[k * 3] - r; p[k * 4 + 1] = o1 + src[k * 3 + 1] - g; p[k * 4 + 2] = o2 + src[k * 3 + 2] - b; p[k * 4 + 3] = 255;
    }
  }
  // City zoom: Esri light grey (land 239, faintly blue water 208) -> Google's pale land and blue water, lines kept grey.
  const LAND = [245, 245, 243], INK = [150, 155, 162], LAND_L = 239, WATER_L = 208;   // light roads, like Google's city map
  function paintGrey(p) {
    const B0 = new Float32Array(65536), B = new Float32Array(65536);
    for (let k = 0, i = 0; k < 65536; k++, i += 4) B0[k] = p[i + 2] - (p[i] + p[i + 1]) / 2;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {   // blueness, 3x3 maximum (JPEG halves colour detail at coasts)
      let m = -1e9;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy > 255) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx <= 255 && B0[yy * 256 + xx] > m) m = B0[yy * 256 + xx]; } }
      B[y * 256 + x] = m;
    }
    for (let i = 0, k = 0; i < p.length; i += 4, k++) {
      const L = (p[i] + p[i + 1] + p[i + 2]) / 3, bl = B[k];
      let w, s;
      if (L >= WATER_L) { const wL = clamp01((LAND_L - L) / (LAND_L - WATER_L)), q = wL > 0.06 ? clamp01((bl - 0.3) / (2.6 * wL)) : 0; w = wL * q; s = wL * (1 - q) * 0.6; }
      else { w = clamp01((B0[k] - 1) / 3); s = clamp01((LAND_L + (WATER_L - LAND_L) * w - L) / 110); }
      for (let c = 0; c < 3; c++) { const base = LAND[c] + (WATER[c] - LAND[c]) * w; p[i + c] = base + (INK[c] - base) * s; }
      p[i + 3] = 255;
    }
  }
  function paint(canvas, img, mode) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 256, 256);
    const d = ctx.getImageData(0, 0, 256, 256);
    (mode === 'street' ? paintStreet : paintGrey)(d.data);
    ctx.putImageData(d, 0, 0);
  }
  let Recolored = null;
  function recoloredClass() {
    if (Recolored) return Recolored;
    Recolored = L.TileLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement('canvas'); tile.width = tile.height = 256;
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          try { paint(tile, img, this.options.mode); }
          catch (e) { tile.getContext('2d').drawImage(img, 0, 0, 256, 256); }   // pixels not readable: show the tile as it is
          done(null, tile);
        };
        img.onerror = e => done(e || new Error('tile'), tile);
        img.src = this.getTileUrl(coords);
        return tile;
      }
    });
    return Recolored;
  }

  // Puts the basemap (country map, city map) and the city labels on a Leaflet map. Returns { retheme(), set }.
  function attach(map, credit) {
    let layers = [], set = 0, loads = 0, errs = 0;
    // While zooming the tiles already on screen are scaled (no new levels mid-zoom, which blanked and flickered); the
    // sharp level loads once the zoom settles, with the old one kept until it is ready.
    const o = { keepBuffer: 4, updateWhenZooming: false, updateWhenIdle: false, updateInterval: 100 };
    const setCredit = () => { const t = TILES[set]; credit.innerHTML = '<i>' + (t.short || '© Esri · OSM') + '</i>'; credit.title = t.credit || CREDIT; };
    const make = i => {
      set = i; loads = 0; errs = 0;
      layers.forEach(l => map.removeLayer(l)); layers = [];
      const t = TILES[i];
      map.getPane('tilePane').classList.toggle('geo-nomap', !t.low);
      if (t.low) {
        const C = t.recolor ? recoloredClass() : L.TileLayer;
        // The country map stays underneath the city map for a few levels (its last tiles, enlarged), so crossing into
        // city zoom never shows an empty map while the city tiles arrive.
        const low = new C(t.low(), Object.assign({ mode: 'street', maxZoom: SWITCH + 4, maxNativeZoom: SWITCH - 1, zIndex: 1, crossOrigin: t.recolor ? 'anonymous' : false }, o));
        const high = new C(t.high(), Object.assign({ mode: 'grey', minZoom: SWITCH, maxZoom: 18, maxNativeZoom: 16, zIndex: 2, crossOrigin: t.recolor ? 'anonymous' : false }, o));
        const ref = L.tileLayer(REF(), Object.assign({ minZoom: SWITCH, maxZoom: 18, maxNativeZoom: 16, zIndex: 3 }, o));
        // A coarse whole-world backdrop (a few low-detail tiles, enlarged) sits under everything, so zooming out never
        // uncovers a blank area while the sharper tiles arrive.
        const back = new C(t.low(), Object.assign({ mode: 'street', maxZoom: 18, maxNativeZoom: 3, zIndex: 0, crossOrigin: t.recolor ? 'anonymous' : false }, o, { keepBuffer: 2 }));
        layers = [back, low, high, ref]; layers.forEach(l => l.addTo(map));
        [low, high].forEach(l => {
          l.on('tileload', () => { loads++; });
          l.on('tileerror', () => { errs++; if (loads === 0 && errs >= 4 && set < TILES.length - 1) make(set + 1); });
        });
      }
      setCredit();
    };
    make(0);
    return { retheme() {}, get set() { return set; } };
  }

  // Smooth zoom for the mouse wheel and trackpad pinch: the wheel moves a target zoom, the map eases to it every frame,
  // keeping the point under the pointer still (Leaflet's own wheel zoom jumps in steps).
  // When the wheel goes quiet the zoom settles on the nearest whole level, where the tiles are sharp (no scaled, seamed tiles).
  function smoothWheel(map, el) {
    let target = null, anchor = null, raf = 0, quiet = 0, dir = 0;
    const tick = () => {
      raf = 0;
      if (!map._loaded || target === null) return;
      const z = map.getZoom(), dz = target - z, end = Math.abs(dz) < 0.003 && target === Math.round(target);
      const nz = end || Math.abs(dz) < 0.003 ? target : z + dz * 0.3;
      const half = map.getSize().divideBy(2), scale = map.getZoomScale(nz, z);
      const center = map.containerPointToLatLng(half.add(anchor.subtract(half).multiplyBy(1 - 1 / scale)));
      if (end) {
        // Settle without a hard reset: finish the zoom the same way the in-between frames moved (the tiles on screen stay),
        // then ask each layer for the sharp level. Leaflet drops the old tiles only once the new ones have arrived.
        map._move(center, nz, { pinch: true }); map._moveEnd(true); target = null;
        map.eachLayer(l => { if (l instanceof L.GridLayer && l._map) l._setView(map.getCenter(), map.getZoom(), true, false); });
        return;
      }
      map._move(center, nz, { pinch: true });
      raf = requestAnimationFrame(tick);
    };
    const onWheel = e => {
      e.preventDefault(); e.stopPropagation();
      const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 400 : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit));
      const k = e.ctrlKey ? 0.011 : 0.0034;   // trackpad pinch arrives as ctrl + wheel with small deltas
      if (target === null) { target = map.getZoom(); map._stop(); map._moveStart(true, false); }
      target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), target - dy * k));
      if (dy) dir = dy < 0 ? 1 : -1;
      anchor = map.mouseEventToContainerPoint(e);
      if (!raf) raf = requestAnimationFrame(tick);
      clearTimeout(quiet);
      // settle on a whole level in the direction you were zooming (never back the way you came, which made the map
      // bounce in and out between slow wheel clicks)
      quiet = setTimeout(() => {
        if (target === null) return;
        const lv = dir > 0 ? Math.ceil(target - 0.12) : dir < 0 ? Math.floor(target + 0.12) : Math.round(target);
        target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), lv));
        if (!raf) raf = requestAnimationFrame(tick);
      }, 240);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); cancelAnimationFrame(raf); clearTimeout(quiet); };
  }

  window.__GEO_MAP__ = { attach, smoothWheel, paint };
})();
