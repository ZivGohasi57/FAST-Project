import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../config.js';

export default function AmbulanceSelectPage() {
  const [ambulances, setAmbulances] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [assigning,  setAssigning]  = useState(null); // ambulanceId being assigned
  const [error,      setError]      = useState('');
  const navigate = useNavigate();

  const auth = (() => { try { const r = sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth'); return r ? JSON.parse(r) : {}; } catch { return {}; } })();

  useEffect(() => {
    if (!auth.userId || auth.role !== 'driver') { navigate('/'); return; }
    axios.get(`${API_BASE}/api/ambulances`)
      .then(r => setAmbulances(r.data))
      .catch(() => setError('שגיאה בטעינת האמבולנסים'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const handleSelect = async (amb) => {
    setAssigning(amb.id);
    setError('');
    try {
      await axios.post(`${API_BASE}/api/ambulances/assign`, {
        ambulanceId: amb.id,
        driverId:    auth.userId,
      });
      sessionStorage.setItem('fastAuth', JSON.stringify({ ...auth, ambulanceId: amb.id }));
      navigate('/driver');
    } catch {
      setError('שגיאה בהתחברות לאמבולנס, נסה שנית');
    }
    setAssigning(null);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 32px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      paddingLeft: 20, paddingRight: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      direction: 'rtl',
    }}>

      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <img src="/fast-logo.svg" alt="FAST" style={{ width: 72, height: 72, marginBottom: 12 }} />
        <div style={{ color: 'white', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          שלום, {auth.displayName || 'נהג'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          בחר את האמבולנס שברשותך היום
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>

        {error && (
          <div style={{
            background: 'rgba(255,59,48,0.18)', border: '1px solid rgba(255,59,48,0.5)',
            borderRadius: 12, padding: '12px 16px', color: '#ff6b6b',
            fontSize: 14, marginBottom: 16, textAlign: 'center',
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 15, padding: 40 }}>
            טוען אמבולנסים…
          </div>
        ) : ambulances.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.08)', borderRadius: 16,
            padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15 }}>אין אמבולנסים במערכת</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>פנה למנהל להוסיף אמבולנסים</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ambulances.map(amb => {
              const isAssigning = assigning === amb.id;
              const hasDriver   = amb.driverName && amb.driverName.length > 0;
              const isMine      = auth.ambulanceId === amb.id;

              return (
                <button
                  key={amb.id}
                  onClick={() => handleSelect(amb)}
                  disabled={!!assigning}
                  style={{
                    width: '100%', border: 'none', borderRadius: 16, cursor: assigning ? 'wait' : 'pointer',
                    padding: '18px 20px', textAlign: 'right', fontFamily: 'inherit',
                    background: isMine
                      ? 'linear-gradient(135deg, rgba(52,199,89,0.25), rgba(52,199,89,0.1))'
                      : 'rgba(255,255,255,0.09)',
                    outline: isMine ? '2px solid rgba(52,199,89,0.7)' : '1px solid rgba(255,255,255,0.12)',
                    transition: 'all 0.2s',
                    opacity: assigning && !isAssigning ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      background: isMine
                        ? 'linear-gradient(135deg,#34c759,#28a745)'
                        : 'linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 800, color: 'white',
                    }}>
                      {isAssigning ? '⏳' : (amb.ambulanceNumber || amb.id.replace('amb-', ''))}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                        אמבולנס {amb.ambulanceNumber || amb.id.replace('amb-', '')}
                        {isMine && <span style={{ fontSize: 11, color: '#34c759', fontWeight: 600, marginRight: 8 }}>● האמבולנס שלי</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                        {hasDriver ? `נהג נוכחי: ${amb.driverName}` : 'ללא נהג מוקצה'}
                      </div>
                    </div>

                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18, flexShrink: 0 }}>
                      {isAssigning ? '' : '›'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => { sessionStorage.removeItem('fastAuth'); localStorage.removeItem('fastAuth'); navigate('/'); }}
          style={{
            marginTop: 28, width: '100%', padding: '11px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 12, color: 'rgba(255,255,255,0.45)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          יציאה מהמערכת
        </button>
      </div>
    </div>
  );
}
