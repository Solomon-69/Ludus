# Third-party material in Ludus

Ludus itself is Copyright (c) 2026 Solomon, all rights reserved. The parts below belong to others and keep their own licences.

## Code bundled in the app

| Part | Licence | Where |
| --- | --- | --- |
| Leaflet 1.9.4, (c) Vladimir Agafonkin, (c) CloudMade | BSD 2-Clause | `web/vendor/leaflet.*`, licence text in `web/vendor/LICENSE-leaflet.txt` |
| Pannellum 2.5.6, (c) Matthew Petroff | MIT | `web/vendor/pannellum.*`, licence text in `web/vendor/LICENSE-pannellum.txt` |
| Lucide icon (settings gear), (c) Cole Bemis / Lucide Contributors | ISC | `web/index.html`, text in `NOTICE` |
| Microsoft Edge WebView2 SDK (Windows app only) | Microsoft, BSD-style | NuGet package, see `NOTICE` |
| .NET 8 / Windows Forms (Windows app only, installed separately) | MIT | see `NOTICE` |

No fonts, sound files or chess engines are bundled: sounds are generated in the app and the fonts are the system fonts. Nothing from other open-source games is copied; the games are written from scratch.

## Flags (Flag Quiz)

The flag pictures in `web/games/flags/` are simplified vector or small bitmap flags, many taken from Wikimedia Commons (flags are mostly public domain; a few files carry Creative Commons or public-domain tags inside the SVG, for example Cyprus, Morocco, Kosovo and several Canadian and US state flags). Before a public release the source of each file, especially the `.png` state flags, should be double-checked on Wikimedia Commons.

## Street photos in Geo Guess: Panoramax

Photos come live from the free public Panoramax service (https://api.panoramax.xyz, panoramax.fr). They are community photos, and **each collection has its own licence**. In the built-in pool the licences found were CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) and Etalab Open Licence 2.0 (https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Both require crediting the source. Ludus shows "Photos: Panoramax contributors, CC BY-SA 4.0 or Etalab 2.0" in the corner of the photo view. Ludus does not copy or store the photos; it only shows them while you play.

## Map tiles in Geo Guess: Esri

The guess map uses Esri's public ArcGIS Online tiles (World Street Map and World Light Gray Canvas, from services.arcgisonline.com), shown with the credit "Tiles (c) Esri, HERE, Garmin, USGS, NGA, (c) OpenStreetMap contributors". These tiles are loaded without an account or key. **Esri's terms for its basemaps expect an Esri account or API key for apps, and limit free use**. Recommended fix before a wide public release: switch to a free open map (OpenFreeMap or OpenStreetMap-based tiles with the OpenStreetMap credit) or get a free Esri API key. OpenStreetMap data is (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright.

## Trademarks

Not affiliated with or endorsed by Anthropic, Apple, Microsoft, Esri, Google or the makers of any game Ludus resembles. All trademarks belong to their owners.
