import { useState } from 'react';
import MapView from './components/MapView';
import { getRoute } from './api/routingService';

function App() {
  const [path, setPath] = useState([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);

  const start = { lat: 32.1668139, lng: 34.9201287 };
  const end = { lat: 32.165000, lng: 34.922000 };

  const handleCalculateRoute = async (emergencyMode) => {
    setLoading(true);
    setIsEmergency(emergencyMode);
    
    const data = await getRoute(start, end, emergencyMode);
    
    if (data && data.path) {
      const formattedPath = data.path.map(coord => [coord.lat, coord.lon]);
      setPath(formattedPath);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ textAlign: 'center' }}>
        <h1>FAST Navigation</h1>
      </header>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => handleCalculateRoute(false)}
          style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          Routine Mode
        </button>
        <button 
          onClick={() => handleCalculateRoute(true)}
          style={{ padding: '10px 20px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          Emergency Mode
        </button>
      </div>

      {loading && <p style={{ textAlign: 'center' }}>Loading...</p>}

      <div style={{ border: '2px solid #ccc', borderRadius: '12px', overflow: 'hidden' }}>
        <MapView path={path} isEmergency={isEmergency} />
      </div>
    </div>
  );
}

export default App;