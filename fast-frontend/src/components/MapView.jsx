import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

function Recenter({ points }) {
    const map = useMap();
    useEffect(() => {
        if (points.length > 0) {
            map.fitBounds(points);
        }
    }, [points, map]);
    return null;
}

const MapView = ({ path, isEmergency }) => {
    const position = [32.1668, 34.9201];
    const lineOptions = { color: isEmergency ? 'red' : 'blue', weight: 6 };

    return (
        <MapContainer center={position} zoom={15} style={{ height: '500px', width: '100%', borderRadius: '12px' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {path.length > 0 && (
                <>
                    <Polyline positions={path} pathOptions={lineOptions} />
                    <Recenter points={path} />
                </>
            )}
        </MapContainer>
    );
};

export default MapView;