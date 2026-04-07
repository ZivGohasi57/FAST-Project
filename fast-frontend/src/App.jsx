import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage            from './pages/LoginPage';
import DriverView           from './pages/DriverView';
import DispatcherDashboard  from './pages/DispatcherDashboard';
import ManagerSuite         from './pages/ManagerSuite';

function getAuth() {
  try { return JSON.parse(localStorage.getItem('fastAuth')); } catch { return null; }
}

function ProtectedRoute({ allowedRole, element }) {
  const auth = getAuth();
  if (!auth) return <Navigate to="/" replace />;
  if (auth.role !== allowedRole) return <Navigate to="/" replace />;
  return element;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"           element={<LoginPage />} />
        <Route path="/driver"     element={<ProtectedRoute allowedRole="driver"     element={<DriverView />} />} />
        <Route path="/dispatcher" element={<ProtectedRoute allowedRole="dispatcher" element={<DispatcherDashboard />} />} />
        <Route path="/manager"    element={<ProtectedRoute allowedRole="manager"    element={<ManagerSuite />} />} />
      </Routes>
    </Router>
  );
}

export default App;
