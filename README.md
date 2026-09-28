# Lagos Community Route Map

A hub-based transit route finder for Lagos community hubs, built with vanilla HTML/CSS/JS and [Leaflet](https://leafletjs.com/). Pick a hub, pick a destination, see the route drawn on the map along with distance and travel time.

## Files

```
index.html   Markup — map shell, floating Route Finder panel, destination board
style.css    All styling, design tokens, and responsive rules
app.js       Map logic, GeoJSON loading, routing, filtering, geolocation
geojson/     One GeoJSON file per hub (you provide these — see below)
```

## Setup

1. Put this project on any static file server (GitHub Pages, Netlify, `python -m http.server`, etc.) — it won't work from a local `file://` path because `fetch()` for the GeoJSON files requires HTTP.
2. Create a `geojson/` folder next to `index.html` and add one GeoJSON file per hub. File names and hub names are configured in `app.js` under `HUB_FILES`:

   ```js
   const HUB_FILES = {
     "Ajah": "geojson/Ajah_routes.geojson",
     "Barracks": "geojson/Barracks_routes.geojson",
     // ...add or remove hubs here
   };
   ```

3. Open `index.html` in a browser (via the server, not by double-clicking the file).

## GeoJSON format

Each feature is a route from the hub (origin) to one destination:

```json
{
  "type": "Feature",
  "properties": {
    "Hub": "Ajah",
    "Origin": "Ajah",
    "Origin_Long": 3.564929932,
    "Origin_Lat": 6.466905287,
    "Destination": "Ajah market",
    "Destination_Long": 3.564755569,
    "Destination_Lat": 6.468418936,
    "Distance_km": 1.0,
    "Duration_min": 11.95,
    "Route": "-"
  },
  "geometry": { "type": "LineString", "coordinates": [ /* ... */ ] }
}
```

Required property keys (case-insensitive, `app.js` looks up several common spellings):
- `Origin_Long`, `Origin_Lat` — hub coordinates (same on every feature in the file)
- `Destination_Long`, `Destination_Lat` — destination coordinates
- `Destination` — name shown in the dropdown and destination board
- `Distance_km`, `Duration_min` — shown in the destination board; `Distance_km` also drives the 500m buffer check when present (falls back to a straight-line calculation from coordinates if omitted)
- `Route` — optional, shown in the map popup if present

## Features

- **Hub / destination selection** — choosing a hub loads its GeoJSON (cached after first load), plots the hub marker, and populates the destination dropdown.
- **1000m buffer** — toggle in the Route Finder panel. When on, only destinations within `HUB_BUFFER_METRES` (set in `app.js`, default `1000`) of the hub are selectable, and a dashed circle of that radius is drawn on the map.
- **Route display** — selecting a destination draws the route line, drops a destination pin, and shows distance/time on the "destination board" (styled like a danfo bus destination board).
- **My Location** — uses the browser's Geolocation API to center the map on the user.
- **Google Maps handoff** — opens directions to the selected destination in Google Maps.
- **Share** — uses the native Web Share API where available, falls back to copying the page URL.
- **URL state** — selected hub/destination are reflected in the URL query string (`?hub=...&destination=...`) so links are shareable and reloadable.

## Responsive behavior

- **Desktop / tablet landscape (>900px)** — Route Finder panel and destination board float over a full-bleed map.
- **Phones / iPad portrait (≤900px)** — Route Finder collapses to a "Find a route" pill at the bottom by default (tap to expand); destination board stacks above it when a route is selected; legend becomes a compact wrapped block, top-right.

## Customization

| What | Where |
|---|---|
| Hub list / GeoJSON paths | `HUB_FILES` in `app.js` |
| Buffer radius | `HUB_BUFFER_METRES` in `app.js` |
| Colors, fonts | CSS custom properties in `:root` at the top of `style.css` |
| Compact/desktop breakpoint | `@media (max-width: 900px)` in `style.css` |

## Browser support notes

- Uses `backdrop-filter` (panel glass effect) and `100dvh` (mobile viewport height) — both have broad modern browser support but degrade gracefully (solid background, `100vh` fallback) where unsupported.
- Requires HTTPS or `localhost` for the Geolocation API to work in most browsers.
