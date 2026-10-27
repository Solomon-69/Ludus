# Third-party material in Ludus

Ludus itself is Copyright (c) 2026 Solomon, MIT licence (see LICENSE). The parts below belong to others and keep their own licences.

## Code bundled in the app

| Part | Licence | Where |
| --- | --- | --- |
| MapLibre GL JS 5.7.0, (c) MapLibre contributors | BSD 3-Clause | `web/vendor/maplibre-gl.*`, licence text in `web/vendor/LICENSE-maplibre.txt` |
| Leaflet 1.9.4, (c) Vladimir Agafonkin, (c) CloudMade | BSD 2-Clause | `web/vendor/leaflet.*`, licence text in `web/vendor/LICENSE-leaflet.txt` |
| Pannellum 2.5.6, (c) Matthew Petroff | MIT | `web/vendor/pannellum.*`, licence text in `web/vendor/LICENSE-pannellum.txt` |
| Lucide icon (settings gear), (c) Cole Bemis / Lucide Contributors | ISC | `web/index.html`, text in `NOTICE` |
| Microsoft Edge WebView2 SDK (Windows app only) | Microsoft, BSD-style | NuGet package, see `NOTICE` |
| .NET 8 / Windows Forms (Windows app only, installed separately) | MIT | see `NOTICE` |

## Downloaded once, not bundled: MediaPipe face detector (Privacy blur)

Privacy blur uses MediaPipe Tasks Vision 0.10.14 (`@mediapipe/tasks-vision`, Apache License 2.0, (c) Google / MediaPipe authors, https://github.com/google-ai-edge/mediapipe) and its small BlazeFace short-range face model (Apache 2.0, https://storage.googleapis.com/mediapipe-models/). They are about 10 MB, so they are not shipped inside the app. When the web view has no built-in face finder, `web/privacy.js` fetches exactly that version once and refuses any file whose SHA-384 fingerprint does not match the fingerprints written in that file. Camera pictures are checked on your computer and never saved or sent.

No fonts, sound files or chess engines are bundled: sounds are generated in the app and the fonts are the system fonts. Nothing from other open-source games is copied; the games are written from scratch.

## Flags (Flag Quiz)

The flag pictures in `web/games/flags/` are simplified vector or small bitmap flags, many taken from Wikimedia Commons (flags are mostly public domain; a few files carry Creative Commons or public-domain tags inside the SVG, for example Cyprus, Morocco, Kosovo and several Canadian and US state flags). Before a public release the source of each file, especially the `.png` state flags, should be double-checked on Wikimedia Commons.

## Street photos in Map Hunt: Panoramax

Photos come live from the free public Panoramax service (https://api.panoramax.xyz, panoramax.fr). They are community photos, and **each collection has its own licence**. In the built-in pool the licences found were CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) and Etalab Open Licence 2.0 (https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Both require crediting the source. Ludus shows "Photos: Panoramax contributors, CC BY-SA 4.0 or Etalab 2.0" in the corner of the photo view. Ludus does not copy or store the photos; it only shows them while you play.

## Map tiles in Map Hunt: OpenFreeMap and OpenStreetMap

The guess map draws free vector tiles from OpenFreeMap (https://openfreemap.org, tiles.openfreemap.org), built from OpenMapTiles (https://openmaptiles.org, schema, CC-BY 4.0) and OpenStreetMap data, (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright. No account or key is needed. The credit is shown on the map. Label fonts are Noto Sans (SIL Open Font License), served by the same host.

## Trademarks

Not affiliated with or endorsed by Anthropic, Apple, Microsoft, Google or the makers of any game Ludus resembles. All trademarks belong to their owners.

## Privacy blur
- MediaPipe Tasks Vision 0.10.14 (Google, Apache 2.0) and its BlazeFace short-range face model: downloaded at runtime only when Privacy blur is on and the web view has no built-in face finder; never bundled.

## Mosaic Hunt data and photos
- Mosaic locations: goguelnikov dataset, MIT licence (header of `web/games/invhunt/data.js`).
- Mosaic close-up photos: loaded at runtime from invader-spotter.art, never bundled; credited on screen. Artworks by Invader; no affiliation.
