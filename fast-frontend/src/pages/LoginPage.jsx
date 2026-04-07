import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:8082';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) { setError('שם משתמש או סיסמה שגויים'); setLoading(false); return; }
      const data = await res.json();
      localStorage.setItem('fastAuth', JSON.stringify(data));
      if (data.role === 'driver')          navigate('/driver');
      else if (data.role === 'dispatcher') navigate('/dispatcher');
      else if (data.role === 'manager')    navigate('/manager');
    } catch { setError('שגיאת חיבור לשרת'); }
    setLoading(false);
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '40px 36px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)', width: '100%', maxWidth: 380,
      }}>
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🚑</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1a1a2e' }}>FAST</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>מערכת ניהול אמבולנסים</p>
        </div>

        <form onSubmit={handleLogin}>
          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              שם משתמש
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="הכנס שם משתמש"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px', borderRadius: 10,
                border: '1.5px solid #e8eaed',
                fontSize: 14, color: '#1a1a2e', background: '#f9fafb',
                outline: 'none',
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="הכנס סיסמה"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px', borderRadius: 10,
                border: '1.5px solid #e8eaed',
                fontSize: 14, color: '#1a1a2e', background: '#f9fafb',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fff0ef', border: '1px solid #ff3b30',
              borderRadius: 8, padding: '10px 14px',
              color: '#ff3b30', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: '100%', padding: '13px',
              background: (loading || !username || !password)
                ? '#f0f0f0' : 'linear-gradient(135deg, #007aff, #5ac8fa)',
              color: (loading || !username || !password) ? '#bbb' : 'white',
              border: 'none', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'מתחבר...' : 'כניסה למערכת'}
          </button>
        </form>

        {/* Help hint */}
        <div style={{ marginTop: 20, textAlign: 'center', color: '#bbb', fontSize: 11 }}>
          driver1 / dispatcher1 / manager1 — סיסמה: 123
        </div>
      </div>
    </div>
  );
}
