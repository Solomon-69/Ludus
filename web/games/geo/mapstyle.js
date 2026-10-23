/* Geo Guess map style: Google Maps look (as in the GeoGuessr guess map), drawn on the GPU from free keyless vector tiles
   (OpenFreeMap / OpenMapTiles schema, data from OpenStreetMap). Soft green land, flat light blue water, thin grey borders,
   pale built-up areas and thin pale roads at city zoom. Labels only in English or Latin letters, never local scripts, and
   sparse: countries and oceans when far out, cities then towns while zooming in, only the main streets close up.
   No icons, no 3D buildings, no satellite. The style is built here (not downloaded), so the plain colours still show
   when the tile server cannot be reached. Zoom numbers are MapLibre zoom (= Leaflet zoom minus 1). */
(function () {
  const HOST = 'https://tiles.openfreemap.org';
  const C = {
    land: 'rgb(193,232,188)', park: 'rgb(179,229,177)', pale: 'rgb(246,244,238)',
    built: 'rgb(239,237,235)', water: 'rgb(138,180,248)', border: 'rgb(150,156,163)', state: 'rgb(190,194,200)',
    road: 'rgb(252,240,196)', roadMinor: 'rgb(255,255,255)', text: 'rgb(60,64,67)', soft: 'rgb(112,117,122)', sea: 'rgb(86,126,196)'
  };
  // English first; for names written in another script only the Latin form; plain Latin names as they are.
  const NAME = ['case', ['has', 'name:en'], ['get', 'name:en'], ['has', 'name:nonlatin'], ['coalesce', ['get', 'name:latin'], ''], ['coalesce', ['get', 'name_en'], ['get', 'name'], '']];
  const FONT = ['Noto Sans Regular'], ITAL = ['Noto Sans Italic'];
  const halo = { 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  const place = (id, filter, minzoom, maxzoom, layout, paint) => ({
    id, type: 'symbol', source: 'ofm', 'source-layer': 'place', filter, minzoom, maxzoom,
    layout: Object.assign({ 'text-field': NAME, 'text-font': FONT, 'text-padding': 8, 'text-max-width': 7, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] }, layout),
    paint: Object.assign({ 'text-color': C.text }, halo, paint)
  });
  const fill = (id, layer, filter, color, extra) => ({ id, type: 'fill', source: 'ofm', 'source-layer': layer, filter, paint: Object.assign({ 'fill-color': color, 'fill-antialias': true }, extra) });
  const road = (id, classes, color, width, minzoom) => ({
    id, type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom,
    filter: ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width }
  });
  const lw = (...s) => ['interpolate', ['exponential', 1.4], ['zoom'], ...s];

  window.__GEO_STYLE__ = function () {
    return {
      version: 8,
      glyphs: HOST + '/fonts/{fontstack}/{range}.pbf',
      sources: { ofm: { type: 'vector', url: HOST + '/planet' } },
      layers: [
        { id: 'land', type: 'background', paint: { 'background-color': C.land } },
        fill('pale', 'landcover', ['match', ['get', 'class'], ['sand', 'rock', 'ice'], true, false], C.pale),
        fill('built', 'landuse', ['match', ['get', 'class'], ['residential', 'commercial', 'retail', 'industrial', 'suburb', 'neighbourhood'], true, false], C.built,
          { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.2, 9, 0.55, 10.5, 1] }),
        fill('park', 'park', ['all'], C.park, { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 8, 0.9] }),
        fill('green', 'landuse', ['match', ['get', 'class'], ['park', 'garden', 'cemetery', 'pitch', 'playground', 'zoo'], true, false], C.park, { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 12, 0.9] }),
        { id: 'stream', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 10, filter: ['!=', ['get', 'class'], 'river'],
          paint: { 'line-color': C.water, 'line-width': lw(10, 0.5, 16, 2) } },
        { id: 'river', type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 5, filter: ['==', ['get', 'class'], 'river'],
          layout: { 'line-cap': 'round' }, paint: { 'line-color': C.water, 'line-width': lw(5, 0.5, 10, 1.6, 16, 5) } },
        fill('water', 'water', ['all'], C.water),
        road('minor', ['minor', 'service', 'track'], C.roadMinor, lw(14, 0.4, 17, 2), 14),
        road('street', ['tertiary', 'secondary'], C.roadMinor, lw(12, 0.4, 17, 2.6), 12),
        road('major', ['primary', 'trunk'], C.road, lw(7, 0.4, 11, 0.7, 17, 3), 7),
        road('motorway', ['motorway'], C.road, lw(5, 0.4, 11, 0.9, 17, 3.6), 5),
        { id: 'border-state', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 4,
          filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
          layout: { 'line-join': 'round' }, paint: { 'line-color': C.state, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
        { id: 'border', type: 'line', source: 'ofm', 'source-layer': 'boundary',
          filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
          layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 5, 0.9, 10, 1.6] } },
        // ----- labels -----
        { id: 'sea', type: 'symbol', source: 'ofm', 'source-layer': 'water_name', maxzoom: 7, filter: ['match', ['get', 'class'], ['ocean', 'sea'], true, false],
          layout: { 'text-field': NAME, 'text-font': ITAL, 'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 6, 13], 'text-max-width': 5, 'text-letter-spacing': 0.12 },
          paint: { 'text-color': C.sea, 'text-halo-color': 'rgba(138,180,248,0.6)', 'text-halo-width': 1 } },
        place('country', ['==', ['get', 'class'], 'country'], 0.2, 8,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 13, 7, 16] }, {}),
        place('state', ['==', ['get', 'class'], 'state'], 4.5, 8,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 12], 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, { 'text-color': C.soft }),
        place('city', ['==', ['get', 'class'], 'city'], 3, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13, 10, 17], 'text-padding': 18 }, {}),
        place('town', ['==', ['get', 'class'], 'town'], 10.5, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 11, 14] }, {}),
        place('village', ['==', ['get', 'class'], 'village'], 13, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 13] }, { 'text-color': C.soft }),
        place('suburb', ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false], 13, 24,
          { 'text-size': 11 }, { 'text-color': C.soft }),
        { id: 'street-name', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 13,
          filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
          layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT, 'text-size': 11, 'text-rotation-alignment': 'map' },
          paint: Object.assign({ 'text-color': C.soft }, halo) }
      ]
    };
  };
})();
