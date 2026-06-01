import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const ambulanceIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:42px;height:42px;border-radius:50%;
    background:linear-gradient(135deg,#34c759,#28a745);
    display:flex;align-items:center;justify-content:center;
    font-size:22px;
    box-shadow:0 2px 12px rgba(0,0,0,0.5),0 0 0 3px white;">🚑</div>`,
  iconSize:[42,42], iconAnchor:[21,21], popupAnchor:[0,-24],
});

const destIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;border-radius:50%;
    background:linear-gradient(135deg,#ff3b30,#ff6b35);
    display:flex;align-items:center;justify-content:center;
    font-size:20px;
    box-shadow:0 2px 12px rgba(0,0,0,0.5),0 0 0 3px white;">📍</div>`,
  iconSize:[36,36], iconAnchor:[18,36], popupAnchor:[0,-38],
});

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

const TRAFFIC_COLOR = { LIGHT: '#ffd60a', MEDIUM: '#ff9500', HEAVY: '#ff3b30' };
const TRAFFIC_LABEL = { LIGHT: 'פקק קל', MEDIUM: 'פקק בינוני', HEAVY: 'פקק כבד' };

function TrafficLayer({ segments }) {
  if (!segments?.length) return null;
  return segments.map((seg, i) => {
    const color = TRAFFIC_COLOR[seg.level] ?? '#ff9500';
    const positions = seg.points.map(p => [p[0], p[1]]);
    return (
      <Polyline key={i} positions={positions} color={color} weight={5} opacity={0.80}>
        <Tooltip sticky>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{TRAFFIC_LABEL[seg.level] ?? seg.level}</span>
          <br />
          <span style={{ fontSize: 12 }}>מהירות ממוצעת: {seg.avgSpeedKmh} קמ&quot;ש</span>
        </Tooltip>
      </Polyline>
    );
  });
}

function PanDetector({ onUserPan }) {
  useMapEvents({ dragstart: () => onUserPan() });
  return null;
}

function AutoFit({ startPos, recenterCount, overviewCount, routeCoordinates }) {
  const map = useMap();
  const startPosRef = useRef(startPos);
  const routeRef    = useRef(routeCoordinates);
  startPosRef.current = startPos;
  routeRef.current    = routeCoordinates;

  useEffect(() => {
    if (recenterCount === 0) return;
    const pos = startPosRef.current;
    if (!pos?.[0]) return;
    map.setView(pos, 18, { animate: true });
  }, [recenterCount, map]);

  useEffect(() => {
    if (overviewCount === 0) return;
    const coords = routeRef.current;
    if (!coords?.length) return;
    const bounds = L.latLngBounds(coords);
    const pos = startPosRef.current;
    if (pos?.[0]) bounds.extend(pos);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
  }, [overviewCount, map]);

  return null;
}

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

function MapDisplay({ routeCoordinates, startPos, endPos, isEmergency, trafficSignals, trafficSegments, isFollowing, onUserPan, recenterCount, overviewCount }) {
  const center    = startPos ?? [32.1668139, 34.9201287];
  const routeColor = isEmergency ? '#ff4500' : '#007aff';

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height:'100%', width:'100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      <PanDetector onUserPan={onUserPan} />
      <AutoFit startPos={startPos} recenterCount={recenterCount} overviewCount={overviewCount} routeCoordinates={routeCoordinates} />
      <TrafficLayer segments={trafficSegments} />
      <SignalLayer signals={trafficSignals} />

      {startPos && <Marker position={startPos} icon={ambulanceIcon}><Popup>מיקום נוכחי</Popup></Marker>}
      {endPos   && <Marker position={endPos}   icon={destIcon}><Popup>יעד</Popup></Marker>}

      {routeCoordinates?.length > 0 && (<>
        <Polyline positions={routeCoordinates} color={routeColor} weight={14} opacity={0.18} />
        <Polyline positions={routeCoordinates} color={routeColor} weight={6}  opacity={0.95}
                  lineCap="round" lineJoin="round" />
      </>)}
    </MapContainer>
  );
}

export default MapDisplay;
