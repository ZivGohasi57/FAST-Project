import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ── Custom SVG markers ────────────────────────────────────────────────────────
const ambulanceIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width:38px; height:38px; border-radius:50%;
      background: linear-gradient(135deg,#34c759,#28a745);
      display:flex; align-items:center; justify-content:center;
      font-size:20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.45), 0 0 0 3px white;
    ">🚑</div>`,
  iconSize:   [38, 38],
  iconAnchor: [19, 19],
  popupAnchor:[0, -22],
});

const destIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative; text-align:center;">
      <div style="
        width:32px; height:32px; border-radius:50%;
        background: linear-gradient(135deg,#ff3b30,#ff6b35);
        display:flex; align-items:center; justify-content:center;
        font-size:18px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.45), 0 0 0 3px white;
      ">📍</div>
    </div>`,
  iconSize:   [32, 32],
  iconAnchor: [16, 32],
  popupAnchor:[0, -34],
});

// Small traffic-light icon — rendered as a lightweight divIcon
const signalIcon = L.divIcon({
  className: '',
  html: `<div style="font-size:13px; line-height:1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5))">🚦</div>`,
  iconSize:   [14, 14],
  iconAnchor: [7, 7],
  popupAnchor:[0, -10],
});

// ── Auto-fit bounds when route or markers change ──────────────────────────────
function AutoFit({ startPos, endPos, routeCoordinates }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoordinates?.length > 0) {
      map.fitBounds(L.latLngBounds(routeCoordinates), { padding: [80, 80], maxZoom: 16 });
    } else if (startPos && endPos && startPos[0] && endPos[0]) {
      map.fitBounds(L.latLngBounds([startPos, endPos]), { padding: [80, 80], maxZoom: 16 });
    } else if (startPos?.[0]) {
      map.setView(startPos, 15);
    }
  }, [startPos, endPos, routeCoordinates, map]);

  return null;
}

// ── Map component ─────────────────────────────────────────────────────────────
function MapDisplay({ routeCoordinates, startPos, endPos, isEmergency, trafficSignals }) {
  const center = startPos ?? [32.1668139, 34.9201287];
  const routeColor = isEmergency ? '#ff4500' : '#007aff';

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      <AutoFit startPos={startPos} endPos={endPos} routeCoordinates={routeCoordinates} />

      {/* Traffic signal markers */}
      {trafficSignals?.map((sig, i) => (
        <Marker key={i} position={[sig.lat, sig.lon]} icon={signalIcon}>
          <Popup>רמזור</Popup>
        </Marker>
      ))}

      {startPos && (
        <Marker position={startPos} icon={ambulanceIcon}>
          <Popup>Start</Popup>
        </Marker>
      )}

      {endPos && (
        <Marker position={endPos} icon={destIcon}>
          <Popup>Destination</Popup>
        </Marker>
      )}

      {routeCoordinates?.length > 0 && (
        <>
          {/* Glow / shadow layer */}
          <Polyline
            positions={routeCoordinates}
            color={routeColor}
            weight={14}
            opacity={0.18}
          />
          {/* Main route line */}
          <Polyline
            positions={routeCoordinates}
            color={routeColor}
            weight={6}
            opacity={0.95}
            lineCap="round"
            lineJoin="round"
          />
        </>
      )}
    </MapContainer>
  );
}

export default MapDisplay;
