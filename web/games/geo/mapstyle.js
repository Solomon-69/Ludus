/* Map Hunt map style: a soft light map look, drawn on the GPU from free keyless vector tiles
   (OpenFreeMap / OpenMapTiles schema, data from OpenStreetMap). Soft green land, flat light blue water, thin grey borders,
   pale built-up areas and thin pale roads at city zoom. Labels only in English or Latin letters, never local scripts, and
   sparse: countries and oceans when far out, cities then towns while zooming in, only the main streets close up.
   Close up (city zoom) it fills in like a street map: building outlines, every street with its name, footpaths, railways,
   districts and neighbourhoods, and named places (shops, cafes, museums, stations, parks) as small coloured dots with a name.
   No 3D buildings, no satellite. The style is built here (not downloaded), so the plain colours still show
   when the tile server cannot be reached. Zoom numbers are MapLibre zoom (= Leaflet zoom minus 1). */
(function () {
  const HOST = 'https://tiles.openfreemap.org';
  const C = {
    land: 'rgb(193,232,188)', park: 'rgb(179,229,177)', pale: 'rgb(246,244,238)',
    built: 'rgb(239,237,235)', water: 'rgb(138,180,248)', border: 'rgb(150,156,163)', state: 'rgb(190,194,200)',
    road: 'rgb(252,240,196)', roadMinor: 'rgb(255,255,255)', text: 'rgb(60,64,67)', soft: 'rgb(112,117,122)', sea: 'rgb(86,126,196)',
    casing: 'rgb(214,210,200)', majorCase: 'rgb(226,196,120)', building: 'rgb(220,215,206)', buildingEdge: 'rgb(200,194,184)',
    path: 'rgb(170,160,150)', rail: 'rgb(170,172,178)', pedestrian: 'rgb(246,244,240)'
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
  const casing = (id, classes, color, width, minzoom) => Object.assign(road(id, classes, color, width, minzoom), {});
  // named places close up: a small dot coloured by kind, the name beside it (food, shops, culture, transport, health, parks)
  const POI_COLOR = ['match', ['get', 'class'],
    ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery'], 'rgb(232,124,60)',
    ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'music', 'jewelry', 'furniture', 'hardware', 'library', 'books'], 'rgb(66,133,244)',
    ['museum', 'art_gallery', 'theatre', 'cinema', 'castle', 'monument', 'attraction', 'place_of_worship', 'town_hall'], 'rgb(150,90,200)',
    ['railway', 'bus', 'ferry_terminal', 'aerialway', 'airport', 'harbor', 'fuel', 'parking'], 'rgb(90,110,140)',
    ['hospital', 'doctors', 'pharmacy', 'dentist'], 'rgb(214,70,70)',
    ['park', 'garden', 'zoo', 'campsite', 'playground', 'golf', 'stadium', 'swimming'], 'rgb(60,150,80)',
    'rgb(120,120,126)'];
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
        // buildings from street zoom on, with a soft outline
        { id: 'building', type: 'fill', source: 'ofm', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.9] } },
        // footpaths, cycleways and steps: thin dashed lines
        { id: 'path', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 15,
          filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
          paint: { 'line-color': C.path, 'line-width': lw(15, 0.6, 19, 1.6), 'line-dasharray': [2, 1.5] } },
        { id: 'pedestrian', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 14,
          filter: ['match', ['get', 'subclass'], ['pedestrian', 'living_street'], true, false],
          layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.pedestrian, 'line-width': lw(14, 1, 19, 10) } },
        { id: 'rail', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 11,
          filter: ['all', ['match', ['get', 'class'], ['rail', 'transit'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
          paint: { 'line-color': C.rail, 'line-width': lw(11, 0.6, 18, 2.2), 'line-dasharray': [3, 2] } },
        // street edges first, so every street reads as a white band with a thin grey rim when close up
        casing('minor-case', ['minor', 'service'], C.casing, lw(14, 1.2, 17, 4, 20, 18), 14),
        casing('street-case', ['tertiary', 'secondary'], C.casing, lw(12, 1, 17, 5, 20, 22), 12),
        casing('major-case', ['primary', 'trunk', 'motorway'], C.majorCase, lw(10, 1.2, 17, 6, 20, 26), 10),
        road('minor', ['minor', 'service', 'track'], C.roadMinor, lw(14, 0.4, 17, 2.6, 20, 15), 14),
        road('street', ['tertiary', 'secondary'], C.roadMinor, lw(12, 0.4, 17, 3.4, 20, 19), 12),
        road('major', ['primary', 'trunk'], C.road, lw(7, 0.4, 11, 0.7, 17, 4, 20, 22), 7),
        road('motorway', ['motorway'], C.road, lw(5, 0.4, 11, 0.9, 17, 4.6, 20, 24), 5),
        { id: 'border-state', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 3,
          filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
          layout: { 'line-join': 'round' }, paint: { 'line-color': C.state, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
        { id: 'border', type: 'line', source: 'ofm', 'source-layer': 'boundary',
          filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
          layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 3, 1.1, 5, 1.3, 10, 1.8] } },
        // ----- labels -----
        { id: 'sea', type: 'symbol', source: 'ofm', 'source-layer': 'water_name', maxzoom: 7, filter: ['match', ['get', 'class'], ['ocean', 'sea'], true, false],
          layout: { 'text-field': NAME, 'text-font': ITAL, 'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 6, 13], 'text-max-width': 5, 'text-letter-spacing': 0.12 },
          paint: { 'text-color': C.sea, 'text-halo-color': 'rgba(138,180,248,0.6)', 'text-halo-width': 1 } },
        // smaller names and less padding at world zoom so the smaller countries (Slovakia, Hungary, Serbia...) get a name too
        place('country', ['==', ['get', 'class'], 'country'], 0.2, 8,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 3, 10.5, 5, 13, 7, 16], 'text-padding': 2, 'text-max-width': 6 }, {}),
        place('state', ['==', ['get', 'class'], 'state'], 4.5, 8,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 12], 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 }, { 'text-color': C.soft }),
        place('city', ['==', ['get', 'class'], 'city'], 3, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13, 10, 17], 'text-padding': 18 }, {}),
        place('town', ['==', ['get', 'class'], 'town'], 7.5, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 11, 14] }, {}),
        place('village', ['==', ['get', 'class'], 'village'], 11, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 13] }, { 'text-color': C.soft }),
        // districts (arrondissements, boroughs) from city zoom, neighbourhoods a little closer
        place('suburb', ['match', ['get', 'class'], ['suburb', 'quarter'], true, false], 11, 24,
          { 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10.5, 15, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 }, { 'text-color': C.soft }),
        place('neighbourhood', ['==', ['get', 'class'], 'neighbourhood'], 13.5, 24, { 'text-size': 11 }, { 'text-color': C.soft }),
        { id: 'street-name', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 13,
          filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
          layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 18, 13], 'text-rotation-alignment': 'map' },
          paint: Object.assign({ 'text-color': C.text }, halo) },
        { id: 'street-name-minor', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 14.5,
          filter: ['match', ['get', 'class'], ['tertiary', 'minor', 'service', 'pedestrian', 'path'], true, false],
          layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12.5], 'text-rotation-alignment': 'map', 'symbol-spacing': 220 },
          paint: Object.assign({ 'text-color': C.soft }, halo) },
        { id: 'poi-dot', type: 'circle', source: 'ofm', 'source-layer': 'poi', minzoom: 15,
          filter: ['any', ['<=', ['coalesce', ['get', 'rank'], 99], ['step', ['zoom'], 6, 16, 14, 17, 40]], ['>=', ['zoom'], 17.5]],
          paint: { 'circle-color': POI_COLOR, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 4.5], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
        { id: 'poi-name', type: 'symbol', source: 'ofm', 'source-layer': 'poi', minzoom: 15,
          filter: ['any', ['<=', ['coalesce', ['get', 'rank'], 99], ['step', ['zoom'], 6, 16, 14, 17, 40]], ['>=', ['zoom'], 17.5]],
          layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 10.5, 'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-max-width': 8,
            'text-optional': true, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
          paint: Object.assign({ 'text-color': POI_COLOR }, halo) },
        { id: 'housenumber', type: 'symbol', source: 'ofm', 'source-layer': 'housenumber', minzoom: 17.5,
          layout: { 'text-field': ['get', 'housenumber'], 'text-font': FONT, 'text-size': 9.5 },
          paint: { 'text-color': 'rgb(150,150,150)', 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1 } }
      ]
    };
  };
})();
