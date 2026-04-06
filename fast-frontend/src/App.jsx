import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DriverView from './pages/DriverView';
import DispatcherDashboard from './pages/DispatcherDashboard';
import ManagerSuite from './pages/ManagerSuite';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DriverView />} />
        <Route path="/dispatcher" element={<DispatcherDashboard />} />
        <Route path="/manager" element={<ManagerSuite />} />
      </Routes>
    </Router>
  );
}

export default App;