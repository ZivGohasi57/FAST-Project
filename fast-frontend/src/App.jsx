import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DriverView from './pages/DriverView';
import DispatcherDashboard from './pages/DispatcherDashboard';
import ManagerSuite from './pages/ManagerSuite';

function App() {
  return (
    <Router>
      <div style={{ padding: '10px', backgroundColor: '#333', color: 'white' }}>
        <nav style={{ display: 'flex', gap: '15px' }}>
          {/* תפריט זמני לצורכי פיתוח */}
          <Link to="/" style={{ color: 'white' }}>Driver View</Link>
          <Link to="/dispatcher" style={{ color: 'white' }}>Dispatcher Dashboard</Link>
          <Link to="/manager" style={{ color: 'white' }}>Manager Suite</Link>
        </nav>
      </div>

      <Routes>
        <Route path="/" element={<DriverView />} />
        <Route path="/dispatcher" element={<DispatcherDashboard />} />
        <Route path="/manager" element={<ManagerSuite />} />
      </Routes>
    </Router>
  );
}

export default App;