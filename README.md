# Brisbane Jet Lag Transit Companion

Mobile map of selected Brisbane transit routes and stops, with layer controls and a partial Taibeled export importer. Static site; no account, backend or API key required. Imported JSON stays in the browser.

## Use

Tap ☰ for layers and **Load Taibeled Export**. Tap routes or stops for details. Run locally with `python3 -m http.server 8000`, or serve the files through GitHub Pages.

## Sources

- Transit geometry and stop coordinates: Translink SEQ GTFS, retained from the initial data package. Frequency groups describe Sunday daytime service and have not been independently revalidated; they are not live timetable information.
- Question schema and geometry semantics: [Taibeled / JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek/tree/179eb0f3876fe9c8887d889247baa65b6bf80fb9), particularly `src/lib/context.ts`, `src/maps/index.ts` and `src/maps/questions/`.
- Basemap: [OpenFreeMap](https://openfreemap.org/), using OpenMapTiles and OpenStreetMap data. Attribution appears on the map.
- Rendering and geometry: [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) and [Turf](https://github.com/Turfjs/turf).

## Import limitations

Supports radius, thermometer, outside-radius tentacle answers and custom-zone matching. Geometry is approximate. Other questions, station hiding zones and additional boundaries are not reconstructed. Unsupported questions are reported; transit filtering is disabled for those imports. An exported extent is only an approximate boundary. `permanentOverlay` is not treated as legal-area geometry. Verify the remaining area in Taibeled.

## Development

`tests/browser.py` runs mobile browser checks using Python Playwright and Chromium. Serve the app locally first; set `TEST_URL` to test another deployment. Tests use synthetic exports. Internet access is needed for map tiles and script dependencies.
