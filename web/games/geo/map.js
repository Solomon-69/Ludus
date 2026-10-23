/* Map Hunt maps. One small wrapper (create) gives the game the same few calls whichever map engine runs:
   - MapLibre GL (vendor/maplibre-gl.js): the real map, drawn on the graphics card from free vector tiles in the
     familiar guessing-map look (mapstyle.js). Its own wheel, pinch and drag handling is used as it comes: no custom zoom code.
   - Leaflet (vendor/leaflet.js): only if the graphics card cannot run MapLibre; a plain flat-colour map you can still pin on.
   The map stays light in dark mode, like the real game. Zoom numbers in this wrapper are Leaflet ones (MapLibre zoom + 1).
   Exposes window.__GEO_MAP__ = { create, canGL }. Loaded on demand by geoguess.js. */
(function () {
  const CREDIT = '© OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors';
  const FLAT = 'rgb(236,236,232)';
  const NOMAP = 'Map unavailable right now: you can still pin a guess';
  const wrapLon = lon => ((((lon + 180) % 360) + 360) % 360) - 180;

  function canGL() {
    try {
      if (!window.maplibregl || !window.__GEO_STYLE__) return false;
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  // Marker markup shared by both engines: a box the size of the icon, an optional name tag above it.
  const markerHtml = (html, label) => html + (label ? '<span class="geo-mk-lbl"></span>' : '');
  function markerEl(html, o) {
    const el = document.createElement('div');
    el.className = 'geo-mk'; el.style.cssText = `width:${o.size}px;height:${o.size}px;z-index:${o.z || 0}`;
    el.innerHTML = markerHtml(html, o.label);
    if (o.label) el.querySelector('.geo-mk-lbl').textContent = o.label;
    return el;
  }
  const bounds = pts => { let w = 1e9, e = -1e9, s = 1e9, n = -1e9; pts.forEach(p => { w = Math.min(w, p[1]); e = Math.max(e, p[1]); s = Math.min(s, p[0]); n = Math.max(n, p[0]); }); return [[w, s], [e, n]]; };

  // ---------------- MapLibre ----------------
  function createGL(el, credit, o) {
    const ml = window.maplibregl, style = window.__GEO_STYLE__();
    style.sources.geolines = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    style.layers.push({ id: 'geolines', type: 'line', source: 'geolines', layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#141414', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [0.01, 2.4] } });
    const map = new ml.Map({
      container: el, style, center: [o.lon, o.lat], zoom: o.zoom - 1, minZoom: 0, maxZoom: 17, maxPitch: 0,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, doubleClickZoom: false, keyboard: false,
      fadeDuration: 120, renderWorldCopies: true
    });
    map.touchZoomRotate.disableRotation();
    credit.innerHTML = '<i>© OpenFreeMap · OSM</i>'; credit.title = CREDIT;
    let loads = 0, errs = 0, plain = false;
    const goPlain = () => {   // tiles cannot be fetched: plain flat map, pinning still works
      if (plain) return; plain = true;
      try { map.setPaintProperty('land', 'background-color', FLAT); } catch (e) {}
      credit.innerHTML = '<i>No map</i>'; credit.title = NOMAP;
    };
    map.on('data', e => { if (e.sourceId === 'ofm' && e.tile) loads++; });
    map.on('error', () => { errs++; if (!loads && errs >= 3) goPlain(); });
    let later = null;   // a view asked for while the box had no size yet
    const lines = [];
    const feed = () => { const s = map.getSource('geolines'); if (s) s.setData({ type: 'FeatureCollection', features: lines.map(l => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l.c } })) }); };
    map.on('style.load', feed);
    return {
      kind: 'gl', map,
      setView(lat, lon, z) { if (!el.clientWidth || !el.clientHeight) { later = [lat, lon, z]; return; } later = null; map.jumpTo({ center: [lon, lat], zoom: z - 1 }); },
      getCenter() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
      getZoom() { return map.getZoom() + 1; },
      resize() { map.resize(); if (later && el.clientWidth && el.clientHeight) { const v = later; later = null; map.jumpTo({ center: [v[1], v[0]], zoom: v[2] - 1 }); } },
      project(lat, lon) { const p = map.project([lon, lat]); return { x: p.x, y: p.y }; },
      size() { return { x: el.clientWidth, y: el.clientHeight }; },
      panBy(dx, dy, ms) { map.panBy([dx, dy], { duration: ms || 0, essential: true }); },
      onClick(fn) { map.on('click', e => { const ll = e.lngLat; fn({ lat: ll.lat, lon: wrapLon(ll.lng) }); }); },
      marker(lat, lon, html, mo) { const m = new ml.Marker({ element: markerEl(html, mo), anchor: 'center' }).setLngLat([lon, lat]).addTo(map); return { remove() { m.remove(); } }; },
      line() { const l = { c: [[0, 0], [0, 0]] }; lines.push(l); return {
        set(a, b) { l.c = [[a[1], a[0]], [b[1], b[0]]]; feed(); },
        remove() { const i = lines.indexOf(l); if (i >= 0) lines.splice(i, 1); feed(); } }; },
      fit(pts, pad, maxZ) { map.resize(); map.fitBounds(bounds(pts), { padding: pad, maxZoom: maxZ - 1, animate: false, duration: 0 }); },
      remove() { try { map.remove(); } catch (e) {} }
    };
  }

  // ---------------- Leaflet, flat colour (no graphics card) ----------------
  function createFlat(el, credit, o) {
    const map = L.map(el, { zoomControl: false, attributionControl: false, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25, zoomDelta: 0.5,
      doubleClickZoom: false, preferCanvas: true, fadeAnimation: false }).setView([o.lat, o.lon], Math.max(1, o.zoom), { animate: false });
    map.getPane('tilePane').classList.add('geo-nomap');
    credit.innerHTML = '<i>No map</i>'; credit.title = NOMAP;
    return {
      kind: 'flat', map,
      setView(lat, lon, z) { map.setView([lat, lon], z, { animate: false }); },
      getCenter() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
      getZoom() { return map.getZoom(); },
      resize() { map.invalidateSize({ animate: false }); },
      project(lat, lon) { const p = map.latLngToContainerPoint([lat, lon]); return { x: p.x, y: p.y }; },
      size() { const s = map.getSize(); return { x: s.x, y: s.y }; },
      panBy(dx, dy, ms) { map.panBy([dx, dy], ms ? { animate: true, duration: ms / 1000, easeLinearity: 0.4 } : { animate: false }); },
      onClick(fn) { map.on('click', e => { const w = e.latlng.wrap(); fn({ lat: w.lat, lon: w.lng }); }); },
      marker(lat, lon, html, mo) {
        const m = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: markerEl(html, mo).outerHTML, iconSize: [mo.size, mo.size], iconAnchor: [mo.size / 2, mo.size / 2] }), interactive: false, zIndexOffset: mo.z || 0 }).addTo(map);
        if (mo.label) { const t = m.getElement() && m.getElement().querySelector('.geo-mk-lbl'); if (t) t.textContent = mo.label; }
        return { remove() { m.remove(); } };
      },
      line() { const ln = L.polyline([[0, 0], [0, 0]], { color: '#141414', weight: 3, dashArray: '1 7', lineCap: 'round', opacity: 0.9 }).addTo(map); return {
        set(a, b) { ln.setLatLngs([a, b]); }, remove() { ln.remove(); } }; },
      fit(pts, pad, maxZ) { map.invalidateSize(false); map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom: maxZ, animate: false }); },
      remove() { try { map.remove(); } catch (e) {} }
    };
  }

  // o = { lat, lon, zoom }. Never throws: if MapLibre cannot start, the flat map takes over.
  function create(el, credit, o) {
    if (canGL()) { try { return createGL(el, credit, o); } catch (e) { el.innerHTML = ''; } }
    return createFlat(el, credit, o);
  }
  window.__GEO_MAP__ = { create, canGL };
})();
