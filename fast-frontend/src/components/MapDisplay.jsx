import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// פונקציה חדשה שמעדכנת את מיקום המצלמה!
function MapUpdater({ startPos }) {
  const map = useMap();
  useEffect(() => {
    if (startPos) {
      map.setView(startPos, map.getZoom()); // מזיז את המפה לנקודת ההתחלה החדשה
    }
  }, [startPos, map]);
  return null;
}

function MapDisplay({ routeCoordinates, startPos, endPos }) {
  const defaultCenter = startPos || [32.1668139, 34.9201287]; 

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={14} 
      style={{ height: '100%', width: '100%', borderRadius: '10px' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors FAST Project"
      />
      
      {/* הרכיב שדואג להזיז את המפה כשהקואורדינטות משתנות */}
      <MapUpdater startPos={startPos} />
      
      {startPos && <Marker position={startPos}><Popup>Start Location</Popup></Marker>}
      {endPos && <Marker position={endPos}><Popup>Destination</Popup></Marker>}
      
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline 
          positions={routeCoordinates} 
          color="#007bff" 
          weight={6} 
          opacity={0.8} 
        />
      )}
    </MapContainer>
  );
}

export default MapDisplay;