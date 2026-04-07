import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ── Custom markers ─────────────────────────────────────────────────────────────
const ambulanceIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:38px;height:38px;border-radius:50%;
    background:linear-gradient(135deg,#34c759,#28a745);
    display:flex;align-items:center;justify-content:center;
    font-size:20px;
    box-shadow:0 2px 10px rgba(0,0,0,0.45),0 0 0 3px white;">🚑</div>`,
  iconSize:[38,38], iconAnchor:[19,19], popupAnchor:[0,-22],
});

const destIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;border-radius:50%;
    background:linear-gradient(135deg,#ff3b30,#ff6b35);
    display:flex;align-items:center;justify-content:center;
    font-size:18px;
    box-shadow:0 2px 10px rgba(0,0,0,0.45),0 0 0 3px white;">📍</div>`,
  iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-34],
});

// Proper SVG traffic-light icon (no emoji — reliable cross-browser rendering)
const TRAFFIC_LIGHT_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="22" viewBox="0 0 14 22">
    <rect x="1" y="1" width="12" height="20" rx="3" fill="#1a1a1a" stroke="#444" stroke-width="0.5"/>
    <circle cx="7" cy="5"  r="3" fill="#ff3b30"/>
    <circle cx="7" cy="11" r="3" fill="#ff9500"/>
    <circle cx="7" cy="17" r="3" fill="#30d158"/>
  </svg>`;

const signalIcon = L.divIcon({
  className: '',
  html: `<div style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.7))">${TRAFFIC_LIGHT_SVG}</div>`,
  iconSize:[14,22], iconAnchor:[7,22], popupAnchor:[0,-24],
});

// ── Auto-fit bounds ────────────────────────────────────────────────────────────
function AutoFit({ startPos, endPos, routeCoordinates }) {
  const map = useMap();
  useEffect(() => {
    if (routeCoordinates?.length > 0) {
      map.fitBounds(L.latLngBounds(routeCoordinates), { padding:[80,80], maxZoom:16 });
    } else if (startPos && endPos) {
      map.fitBounds(L.latLngBounds([startPos, endPos]), { padding:[80,80], maxZoom:16 });
    } else if (startPos?.[0]) {
      map.setView(startPos, 15);
    }
  }, [startPos, endPos, routeCoordinates, map]);
  return null;
}

// ── Traffic signal layer — only visible when zoomed in (≥ 15) ─────────────────
const SIGNAL_MIN_ZOOM = 15;

function SignalLayer({ signals }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [map]);

  if (zoom < SIGNAL_MIN_ZOOM || !signals?.length) return null;

  return signals.map((sig, i) => (
    <Marker key={i} position={[sig.lat, sig.lon]} icon={signalIcon}>
      <Popup>רמזור</Popup>
    </Marker>
  ));
}

// ── Main map component ─────────────────────────────────────────────────────────
function MapDisplay({ routeCoordinates, startPos, endPos, isEmergency, trafficSignals }) {
  const center    = startPos ?? [32.1668139, 34.9201287];
  const routeColor = isEmergency ? '#ff4500' : '#007aff';

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height:'100%', width:'100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={19}
      />

      <AutoFit startPos={startPos} endPos={endPos} routeCoordinates={routeCoordinates} />

      {/* Traffic signals — zoom-aware */}
      <SignalLayer signals={trafficSignals} />

      {startPos && <Marker position={startPos} icon={ambulanceIcon}><Popup>Start</Popup></Marker>}
      {endPos   && <Marker position={endPos}   icon={destIcon}><Popup>Destination</Popup></Marker>}

      {routeCoordinates?.length > 0 && (<>
        <Polyline positions={routeCoordinates} color={routeColor} weight={14} opacity={0.18} />
        <Polyline positions={routeCoordinates} color={routeColor} weight={6}  opacity={0.95}
                  lineCap="round" lineJoin="round" />
      </>)}
    </MapContainer>
  );
}

export default MapDisplay;
