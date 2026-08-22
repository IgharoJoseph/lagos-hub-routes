/* LAGOS COMMUNITY ROUTE MAP */

const HUB_FILES = {
  "Barracks": "geojson/Barracks_routes.geojson",
  "Ikotun terminal": "geojson/Ikotun_terminal_routes.geojson",
  "Inner Marina": "geojson/Inner_Marina_routes.geojson",
  "Ojota": "geojson/Ojota_routes.geojson",
  "Odunade": "geojson/Odunade_routes.geojson",
  "Waec": "geojson/Waec_routes.geojson",
  "Mile 2": "geojson/Mile_2_routes.geojson",
  "Ikorodu": "geojson/Ikorodu_routes.geojson",
  "Berger": "geojson/Berger_routes.geojson",
  "Oshodi": "geojson/Oshodi_routes.geojson",
  "Fadeyi": "geojson/Fadeyi_routes.geojson",
  "Idimu": "geojson/Idimu_routes.geojson",
  "Egbeda": "geojson/Egbeda_routes.geojson",
  "Doyin": "geojson/Doyin_routes.geojson",
  "Ajah": "geojson/Ajah_routes.geojson",
  "Yaba": "geojson/Yaba_routes.geojson"
};

/*
  500M BUFFER
  ------------------------------------------------------------
  NOTE: destinations in these files are route endpoints — by
  definition most sit kilometers from the hub, not meters. With
  a literal 500m radius, expect the destination list to come up
  empty for most hubs (the circle drawn on the map will confirm
  visually why). Adjust this value if 500m isn't actually the
  radius you want to filter by.
*/
const HUB_BUFFER_METRES = 500;

const hubSelect = document.getElementById("hubSelect");
const destinationSelect = document.getElementById("destinationSelect");
const bufferToggle = document.getElementById("bufferToggle");
const routeInfo = document.getElementById("routeInfo");
const destinationName = document.getElementById("destinationName");
const distanceValue = document.getElementById("distanceValue");
const durationValue = document.getElementById("durationValue");
const clearRouteBtn = document.getElementById("clearRouteBtn");
const googleMapsBtn = document.getElementById("googleMapsBtn");
const shareBtn = document.getElementById("shareBtn");
const locateBtn = document.getElementById("locateBtn");
const loadingOverlay = document.getElementById("loadingOverlay");

let map = null;
let currentGeoJSON = null;
let currentRouteLayer = null;
let currentRouteFeature = null;
let userLocationMarker = null;
let originMarker = null;
let selectedDestinationMarker = null;
let destinationMarkersLayer = null;
let bufferCircle = null;
const loadedHubData = {};

/* PROPERTY LOOKUP (case-insensitive, tolerates inconsistent GeoJSON key casing across hub files) */
function getProp(properties, ...names) {
  if (!properties) return undefined;
  const keys = Object.keys(properties);
  for (const name of names) {
    const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (match !== undefined && properties[match] !== undefined && properties[match] !== "") {
      return properties[match];
    }
  }
  return undefined;
}

/* ICONS */
function createHubIcon() {
  return L.divIcon({
    className: "hub-icon-container",
    html: `<div class="hub-marker"><span>H</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function createDestinationIcon(selected = false, disabled = false) {
  return L.divIcon({
    className: "destination-icon-container",
    html: `<div class="destination-marker ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}"></div>`,
    iconSize: selected ? [36, 36] : [30, 30],
    iconAnchor: selected ? [18, 36] : [15, 30],
    popupAnchor: [0, -30]
  });
}

/* MAP INIT */
function initialiseMap() {
  if (map) return;

  map = L.map("map", { zoomControl: false, preferCanvas: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  destinationMarkersLayer = L.layerGroup().addTo(map);

  map.setView([6.5244, 3.3792], 12);

  setTimeout(() => map && map.invalidateSize(), 100);
  setTimeout(() => map && map.invalidateSize(), 500);
}

/* HUB DROPDOWN */
function initialiseHubDropdown() {
  if (!hubSelect) {
    console.error("Hub dropdown #hubSelect was not found.");
    return;
  }

  hubSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select a hub";
  hubSelect.appendChild(defaultOption);

  Object.keys(HUB_FILES).sort().forEach(hub => {
    const option = document.createElement("option");
    option.value = hub;
    option.textContent = hub;
    hubSelect.appendChild(option);
  });
}

/* LOAD HUB GEOJSON */
async function loadHub(hubName) {
  if (!hubName) {
    currentGeoJSON = null;
    resetDestinationDropdown();
    clearMapLayers();
    clearRoute();
    return;
  }

  const filePath = HUB_FILES[hubName];
  if (!filePath) {
    showError(`No GeoJSON file configured for ${hubName}.`);
    return;
  }

  showLoading(true);

  try {
    if (loadedHubData[hubName]) {
      currentGeoJSON = loadedHubData[hubName];
    } else {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${filePath}`);
      currentGeoJSON = await response.json();
      loadedHubData[hubName] = currentGeoJSON;
    }

    if (!currentGeoJSON || !Array.isArray(currentGeoJSON.features)) {
      throw new Error(`Invalid GeoJSON structure for ${hubName}.`);
    }

    clearMapLayers();
    clearRoute();
    populateDestinations(currentGeoJSON);
    addOriginMarker(currentGeoJSON);
    drawHubBuffer(currentGeoJSON);
    fitHubToMap(currentGeoJSON);

    setTimeout(() => map && map.invalidateSize(), 100);
    updateURL();

  } catch (error) {
    console.error("Hub loading error:", error);
    currentGeoJSON = null;
    resetDestinationDropdown();
    showError(`Unable to load ${hubName} routes.\n\n${error.message}`);
  } finally {
    showLoading(false);
  }
}

function clearMapLayers() {
  if (currentRouteLayer && map) {
    map.removeLayer(currentRouteLayer);
    currentRouteLayer = null;
  }
  if (originMarker && map) {
    map.removeLayer(originMarker);
    originMarker = null;
  }
  if (destinationMarkersLayer) destinationMarkersLayer.clearLayers();
  selectedDestinationMarker = null;
  currentRouteFeature = null;
  removeHubBuffer();
}

/* COORDINATES */
function getOriginCoordinate(geojson) {
  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) return null;

  for (const feature of geojson.features) {
    const properties = feature.properties || {};
    const longitude = Number(getProp(properties, "Origin_Long", "Origin_Lon", "OriginLon", "Origin_Lng"));
    const latitude = Number(getProp(properties, "Origin_Lat", "OriginLat"));
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
  }
  return null;
}

function getDestinationCoordinate(feature) {
  if (!feature) return null;
  const properties = feature.properties || {};
  const longitude = Number(getProp(properties, "Destination_Long", "Destination_Lon", "DestinationLon", "Destination_Lng"));
  const latitude = Number(getProp(properties, "Destination_Lat", "DestinationLat"));
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function calculateDistanceMetres(coordinate1, coordinate2) {
  if (!coordinate1 || !coordinate2) return Infinity;

  const earthRadius = 6371000;
  const lat1 = coordinate1[1] * Math.PI / 180;
  const lat2 = coordinate2[1] * Math.PI / 180;
  const deltaLat = (coordinate2[1] - coordinate1[1]) * Math.PI / 180;
  const deltaLon = (coordinate2[0] - coordinate1[0]) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

/* PROXIMITY FILTER — prefers a precomputed Distance_km property when present, since it
   reflects actual route distance rather than a straight-line estimate that can be thrown
   off by coordinate inaccuracies. Falls back to Haversine from raw coordinates. */
function getHubToDestinationDistanceMetres(feature, geojson) {
  const properties = feature.properties || {};
  const precomputedKm = Number(getProp(properties, "Distance_km", "distance_km", "Distance"));
  if (Number.isFinite(precomputedKm)) return precomputedKm * 1000;

  const origin = getOriginCoordinate(geojson);
  const destination = getDestinationCoordinate(feature);
  return calculateDistanceMetres(origin, destination);
}

function isDestinationWithinHubBuffer(feature, geojson) {
  return getHubToDestinationDistanceMetres(feature, geojson) <= HUB_BUFFER_METRES;
}

function drawHubBuffer(geojson) {
  removeHubBuffer();
  if (!isBufferFilterEnabled()) return;

  const origin = getOriginCoordinate(geojson);
  if (!origin) return;

  bufferCircle = L.circle([origin[1], origin[0]], {
    radius: HUB_BUFFER_METRES,
    color: "#2B2F77",
    weight: 2,
    dashArray: "6,6",
    fill: false
  }).addTo(map);
}

function removeHubBuffer() {
  if (bufferCircle && map) {
    map.removeLayer(bufferCircle);
  }
  bufferCircle = null;
}

function isBufferFilterEnabled() {
  return bufferToggle ? bufferToggle.checked : false;
}

function isDestinationAvailable(feature, geojson) {
  if (!isBufferFilterEnabled()) return true;
  return isDestinationWithinHubBuffer(feature, geojson);
}

function getDestinationName(feature, index) {
  const properties = feature.properties || {};
  return getProp(properties, "Destination", "Name") ?? `Destination ${index + 1}`;
}

/* DESTINATION DROPDOWN */
function populateDestinations(geojson) {
  if (!destinationSelect) return;

  destinationSelect.innerHTML = '<option value="">Select a destination</option>';

  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    destinationSelect.innerHTML = '<option value="">No destinations found</option>';
    destinationSelect.disabled = true;
    return;
  }

  let availableCount = 0;

  geojson.features.forEach((feature, index) => {
    if (!isDestinationAvailable(feature, geojson)) return;

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = getDestinationName(feature, index);
    destinationSelect.appendChild(option);
    availableCount++;
  });

  if (availableCount === 0) {
    destinationSelect.innerHTML = isBufferFilterEnabled()
      ? `<option value="">No destinations within ${HUB_BUFFER_METRES}m</option>`
      : '<option value="">No destinations found</option>';
    destinationSelect.disabled = true;
    return;
  }

  destinationSelect.disabled = false;
}

/* MARKERS */
function addOriginMarker(geojson) {
  const coordinate = getOriginCoordinate(geojson);
  if (!coordinate) {
    console.warn("Origin coordinates were not found.");
    return;
  }

  const properties = geojson.features[0]?.properties || {};
  const originName = getProp(properties, "Origin") ?? "Hub";

  originMarker = L.marker([coordinate[1], coordinate[0]], { icon: createHubIcon(), zIndexOffset: 1000 }).addTo(map);
  originMarker.bindPopup(`<strong>${escapeHTML(originName)}</strong><br><span>Origin / Hub</span>`);
}

function showDestinationMarker(feature, index) {
  if (destinationMarkersLayer) destinationMarkersLayer.clearLayers();
  selectedDestinationMarker = null;

  const coordinate = getDestinationCoordinate(feature);
  if (!coordinate) return;

  const destination = getDestinationName(feature, index);
  const marker = L.marker([coordinate[1], coordinate[0]], {
    icon: createDestinationIcon(true),
    title: destination,
    zIndexOffset: 1500
  });

  marker.bindPopup(`<strong>${escapeHTML(destination)}</strong><br><span>Destination</span>`);
  destinationMarkersLayer.addLayer(marker);
  selectedDestinationMarker = marker;
}

/* ROUTE DISPLAY */
function showRoute(feature, selectedIndex = null) {
  if (!feature) return;

  currentRouteFeature = feature;

  if (currentRouteLayer) {
    map.removeLayer(currentRouteLayer);
    currentRouteLayer = null;
  }

  currentRouteLayer = L.geoJSON(feature, {
    style: { color: "#14161A", weight: 5, opacity: 0.95, lineCap: "round" }
  }).addTo(map);

  if (selectedIndex !== null) showDestinationMarker(feature, selectedIndex);

  const bounds = currentRouteLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, { paddingTopLeft: [30, 80], paddingBottomRight: [30, 80], maxZoom: 17 });
  }

  const properties = feature.properties || {};
  const destination = getProp(properties, "Destination", "Name") ?? "Selected destination";
  const distance = getProp(properties, "Distance_km", "Distance");
  const duration = getProp(properties, "Duration_min", "Duration");
  const route = getProp(properties, "Route") ?? "";

  destinationName.textContent = destination;
  distanceValue.textContent = formatDistance(distance);
  durationValue.textContent = formatDuration(duration);
  routeInfo.classList.remove("hidden");

  let popupContent = `<strong>${escapeHTML(destination)}</strong>`;
  if (route) popupContent += `<br>Route: ${escapeHTML(route)}`;
  if (distance !== undefined) popupContent += `<br>Distance: ${escapeHTML(formatDistance(distance))}`;
  if (duration !== undefined) popupContent += `<br>Time: ${escapeHTML(formatDuration(duration))}`;

  currentRouteLayer.bindPopup(popupContent);
  updateURL();
}

function formatDistance(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  const number = Number(value);
  return Number.isNaN(number) ? String(value) : `${number.toFixed(2)} km`;
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);

  const minutes = Math.round(number);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

function fitHubToMap(geojson) {
  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) return;

  const bounds = L.latLngBounds([]);
  const origin = getOriginCoordinate(geojson);
  if (origin) bounds.extend([origin[1], origin[0]]);

  geojson.features.forEach(feature => {
    if (!isDestinationAvailable(feature, geojson)) return;
    const destination = getDestinationCoordinate(feature);
    if (destination) bounds.extend([destination[1], destination[0]]);
  });

  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function clearRoute() {
  if (currentRouteLayer) {
    map.removeLayer(currentRouteLayer);
    currentRouteLayer = null;
  }
  if (destinationMarkersLayer) destinationMarkersLayer.clearLayers();
  selectedDestinationMarker = null;
  currentRouteFeature = null;

  if (routeInfo) routeInfo.classList.add("hidden");
  if (destinationName) destinationName.textContent = "—";
  if (distanceValue) distanceValue.textContent = "—";
  if (durationValue) durationValue.textContent = "—";
  if (destinationSelect) destinationSelect.value = "";

  updateURL();
}

function resetDestinationDropdown() {
  if (!destinationSelect) return;
  destinationSelect.innerHTML = '<option value="">Select a hub first</option>';
  destinationSelect.disabled = true;
}

function refreshDestinationFilter() {
  if (!currentGeoJSON) return;
  clearRoute();
  populateDestinations(currentGeoJSON);
  drawHubBuffer(currentGeoJSON);
  fitHubToMap(currentGeoJSON);
  setTimeout(() => map && map.invalidateSize(), 100);
}

/* GEOLOCATION */
function locateUser() {
  if (!navigator.geolocation) {
    showError("Location services are not supported by this browser.");
    return;
  }

  locateBtn.textContent = "📍 Locating...";

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;

      if (userLocationMarker) map.removeLayer(userLocationMarker);

      userLocationMarker = L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup("<strong>Your Location</strong>")
        .openPopup();

      map.setView([latitude, longitude], 16);
      locateBtn.textContent = "📍 My Location";
    },
    error => {
      console.error(error);
      showError("Unable to determine your location. Please allow location access.");
      locateBtn.textContent = "📍 My Location";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

/* GOOGLE MAPS */
function openGoogleMaps() {
  if (!currentRouteFeature) return;

  const destination = getDestinationCoordinate(currentRouteFeature);
  if (!destination) {
    showError("Could not determine the destination location.");
    return;
  }

  const [longitude, latitude] = destination;
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, "_blank");
}

/* SHARE */
async function shareRoute() {
  if (!currentRouteFeature) return;

  const shareData = {
    title: "Community Route Map",
    text: `Route to ${destinationName.textContent}`,
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch {
      console.log("Share cancelled.");
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(window.location.href);
    alert("Route link copied to clipboard.");
  } catch {
    alert("Copy this page URL to share the route.");
  }
}

/* URL STATE */
function updateURL() {
  if (!hubSelect) return;

  const hub = hubSelect.value;
  const destination = destinationSelect ? destinationSelect.value : "";
  const params = new URLSearchParams();

  if (hub) params.set("hub", hub);
  if (destination !== "" && destination !== null) params.set("destination", destination);

  const query = params.toString();
  const newURL = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", newURL);
}

async function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const hub = params.get("hub");
  const destination = params.get("destination");

  if (!hub) return;
  if (!HUB_FILES[hub]) {
    console.warn(`Hub "${hub}" does not exist in HUB_FILES.`);
    return;
  }

  hubSelect.value = hub;
  await loadHub(hub);

  if (destination !== null && currentGeoJSON?.features) {
    const index = Number(destination);
    if (
      Number.isInteger(index) &&
      currentGeoJSON.features[index] &&
      isDestinationAvailable(currentGeoJSON.features[index], currentGeoJSON)
    ) {
      destinationSelect.value = String(index);
      showRoute(currentGeoJSON.features[index], index);
    }
  }
}

/* UI HELPERS */
function showError(message) {
  console.error(message);
  alert(message);
}

function showLoading(show) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle("hidden", !show);
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* EVENT LISTENERS */
if (hubSelect) {
  hubSelect.addEventListener("change", async event => await loadHub(event.target.value));
}

if (destinationSelect) {
  destinationSelect.addEventListener("change", event => {
    if (event.target.value === "") {
      clearRoute();
      return;
    }
    if (!currentGeoJSON?.features) return;

    const index = Number(event.target.value);
    if (!Number.isInteger(index) || !currentGeoJSON.features[index]) {
      clearRoute();
      return;
    }

    const feature = currentGeoJSON.features[index];
    if (!isDestinationAvailable(feature, currentGeoJSON)) {
      clearRoute();
      return;
    }

    showRoute(feature, index);
  });
}

if (bufferToggle) bufferToggle.addEventListener("change", refreshDestinationFilter);
if (clearRouteBtn) clearRouteBtn.addEventListener("click", clearRoute);
if (googleMapsBtn) googleMapsBtn.addEventListener("click", openGoogleMaps);
if (shareBtn) shareBtn.addEventListener("click", shareRoute);
if (locateBtn) locateBtn.addEventListener("click", locateUser);

window.addEventListener("resize", () => {
  if (!map) return;
  setTimeout(() => map.invalidateSize(), 150);
});

window.addEventListener("orientationchange", () => {
  if (!map) return;
  setTimeout(() => map.invalidateSize(), 300);
});

/* START */
document.addEventListener("DOMContentLoaded", async () => {
  initialiseMap();
  initialiseHubDropdown();
  await loadFromURL();
  setTimeout(() => map && map.invalidateSize(), 300);
});