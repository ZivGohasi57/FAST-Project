import { useState } from 'react';
import MapView from './components/MapView';
import { getRoute } from './api/routingService';

function App() {
  const [routeData, setRouteData] = useState(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);

  const start = { lat: 32.1668139, lng: 34.9201287 };
  const end = { lat: 32.165000, lng: 34.922000 };

  const handleCalculateRoute = async (emergencyMode) => {
    setLoading(true);
    setIsEmergency(emergencyMode);
    
    const data = await getRoute(start, end, emergencyMode);
    
    if (data && data.path) {
      setRouteData({
        points: data.path.map(coord => [coord.lat, coord.lon]),
        distance: (data.totalDistanceMeters / 1000).toFixed(2), 
        time: (data.estimatedTimeSeconds / 60).toFixed(1)
      });
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: '0' }}>FAST Navigation</h1>
        <p style={{ color: '#7f8c8d' }}>Emergency Vehicle Optimization</p>
      </header>

      <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '20px' }}>
        <button onClick={() => handleCalculateRoute(false)} style={buttonStyle('#3498db')}>Routine Mode</button>
        <button onClick={() => handleCalculateRoute(true)} style={buttonStyle('#e74c3c')}>Emergency Mode</button>
      </div>

      {routeData && (
        <div style={infoPanelStyle}>
          <div><strong>Distance:</strong> {routeData.distance} km</div>
          <div><strong>Estimated Time:</strong> {routeData.time} min</div>
          <div style={{ color: isEmergency ? '#e74c3c' : '#3498db', fontWeight: 'bold' }}>
            Mode: {isEmergency ? 'Emergency (Priority)' : 'Standard'}
          </div>
        </div>
      )}

      <div style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '15px', overflow: 'hidden' }}>
        <MapView path={routeData ? routeData.points : []} isEmergency={isEmergency} />
      </div>
    </div>
  );
}

const buttonStyle = (color) => ({
  padding: '12px 25px', backgroundColor: color, color: 'white', border: 'none', borderRadius: '8px',
  cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', transition: 'transform 0.1s'
});

const infoPanelStyle = {
  display: 'flex', justifyContent: 'space-around', backgroundColor: 'white', padding: '15px',
  borderRadius: '10px', marginBottom: '20px', border: '1px solid #ddd', fontSize: '18px'
};

export default App;