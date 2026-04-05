import { useState, useEffect } from 'react';
import axios from 'axios';
import MapDisplay from '../components/MapDisplay';

function DriverView() {
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);
  
  // שים לב! עכשיו המספרים הם בתוך מרכאות (טקסט) כדי לאפשר הקלדה חופשית
  const [startPos, setStartPos] = useState({ lat: "32.1668139", lon: "34.9201287" });
  const [endPos, setEndPos] = useState({ lat: "32.1750000", lon: "34.9300000" });

  const fetchRoute = async (emergencyState, currentStart, currentEnd) => {
    try {
      console.log("Fetching route...");
      const response = await axios.get(`http://localhost:8082/api/route`, {
        params: {
          // כאן אנחנו הופכים את הטקסט למספר אמיתי עבור השרת
          startLat: parseFloat(currentStart.lat),
          startLon: parseFloat(currentStart.lon),
          endLat: parseFloat(currentEnd.lat),
          endLon: parseFloat(currentEnd.lon),
          mode: emergencyState ? 'emergency' : 'routine' 
        }
      });

      if (response.data && response.data.coordinates) {
        setRouteCoords(response.data.coordinates);
      }
    } catch (error) {
      console.error("Error fetching route from API:", error);
    }
  };

  useEffect(() => {
    fetchRoute(isEmergencyMode, startPos, endPos);
  }, []);

  const toggleEmergencyMode = () => {
    const newMode = !isEmergencyMode;
    setIsEmergencyMode(newMode);
    fetchRoute(newMode, startPos, endPos); 
  };

  const handleCalculateRoute = () => {
    fetchRoute(isEmergencyMode, startPos, endPos);
  };

  return (
    <div style={{ 
        display: 'flex', flexDirection: 'column', height: '90vh',
        backgroundColor: isEmergencyMode ? '#ffe6e6' : '#f4f4f4',
        transition: 'background-color 0.3s ease'
      }}>
      
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>FAST - Driver Navigation</h2>
        <button 
          onClick={toggleEmergencyMode}
          style={{
            padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white',
            backgroundColor: isEmergencyMode ? '#dc3545' : '#28a745',
            border: 'none', borderRadius: '8px', cursor: 'pointer'
          }}
        >
          {isEmergencyMode ? 'EMERGENCY MODE ACTIVE' : 'ROUTINE MODE'}
        </button>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
        {/* שינינו את input ל- type="text" והורדנו את ה-parseFloat מה-onChange */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label><b>Dest Lat:</b></label>
          <input 
            type="text" 
            value={endPos.lat} 
            onChange={(e) => setEndPos({ ...endPos, lat: e.target.value })}
            style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label><b>Dest Lon:</b></label>
          <input 
            type="text" 
            value={endPos.lon} 
            onChange={(e) => setEndPos({ ...endPos, lon: e.target.value })}
            style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
        </div>
        <button 
          onClick={handleCalculateRoute}
          style={{ padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Navigate
        </button>
      </div>

      <div style={{ flex: 1, margin: '0 20px 20px 20px', borderRadius: '10px', overflow: 'hidden', border: '2px solid #ccc' }}>
         <MapDisplay 
            routeCoordinates={routeCoords} 
            startPos={[parseFloat(startPos.lat), parseFloat(startPos.lon)]} 
            endPos={[parseFloat(endPos.lat), parseFloat(endPos.lon)]} 
         />
      </div>
    </div>
  );
}

export default DriverView;