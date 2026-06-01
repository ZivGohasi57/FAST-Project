import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import MapDisplay from '../components/MapDisplay';
import { API_BASE } from '../config.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const SIGN_TEXT = {
  [-3]: 'פנה חדה שמאלה', [-2]: 'פנה שמאלה', [-1]: 'שמור שמאלה',
  [0]:  'המשך ישר',
  [1]:  'שמור ימינה',     [2]:  'פנה ימינה',   [3]:  'פנה חדה ימינה',
  [4]:  'הגעת ליעד',      [6]:  'כיכר',         [-6]: 'צא מהכיכר',
  [7]:  'שמור שמאלה',     [8]:  'שמור ימינה',
};
const signText = (sign) => SIGN_TEXT[sign] ?? 'המשך';

const SIGN_ROTATION = {
  [-3]: -130, [-2]: -90, [-1]: -45,
  [0]: 0,
  [1]: 45, [2]: 90, [3]: 130,
  [-6]: 60,
  [7]: -45, [8]: 45,
};

const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} ק"מ` : `${Math.round(m)} מ'`;
const fmtTime = (sec) => {
  if (sec < 60) return `${sec}ש'`;
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}ש ${m % 60}ד'`;
  return `${m} דק'`;
};

function TurnArrow({ sign, size = 34, color = 'white' }) {
  if (sign === 4) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="12" r="8" stroke={color} strokeWidth="2.5"/>
        <circle cx="16" cy="12" r="3.5" fill={color}/>
        <line x1="16" y1="20" x2="16" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (sign === 6) return null;
  const rot = SIGN_ROTATION[sign] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         style={{ transform: `rotate(${rot}deg)`, display: 'block' }}>
      <line x1="16" y1="27" x2="16" y2="9" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <path d="M9 17 L16 7 L23 17" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function RoundaboutArrow({ exitNumber = 0, size = 36, color = 'white' }) {
  const cx = 18, cy = 18, r = 10;
  const circ   = 2 * Math.PI * r;
  const dashLen = circ * (300 / 360);
  const gapLen  = circ - dashLen;
  const offset  = circ * (90 / 360) + gapLen / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${dashLen} ${gapLen}`} strokeDashoffset={offset}
          transform="scale(-1,1) translate(-36,0)" />
        <path d={`M ${cx-5} ${cy-r-3} L ${cx} ${cy-r} L ${cx-3} ${cy-r+5}`}
              stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1={cx} y1="36" x2={cx} y2={cy+r+2} stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      {exitNumber > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color, fontSize: Math.round(size * 0.36), fontWeight: 800, lineHeight: 1 }}>
          {exitNumber}
        </div>
      )}
    </div>
  );
}

function InstructionBanner({ instructions, isEmergency }) {
  if (!instructions?.length) return null;
  const next = instructions.length > 1 ? instructions[1] : instructions[0];
  if (!next) return null;

  const distStr = next.distanceMeters >= 1000
    ? `${(next.distanceMeters / 1000).toFixed(1)} ק"מ`
    : `${Math.round(next.distanceMeters)} מ'`;

  const isArrive     = next.sign === 4;
  const isContraflow = isEmergency && next.contraflow;
  const isRoundabout = next.sign === 6 || next.sign === -6;
  const iconColor    = isContraflow ? '#ffcdd2' : 'white';

  let instrLabel;
  if (next.sign === 6) {
    instrLabel = next.exitNumber > 0 ? `כיכר — יציאה ${next.exitNumber}` : 'היכנס לכיכר';
    if (next.streetName) instrLabel += ` → ${next.streetName}`;
  } else {
    instrLabel = signText(next.sign);
    if (next.streetName) instrLabel += ` — ${next.streetName}`;
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 16, right: 16,
      zIndex: 600,
      background: isContraflow ? 'rgba(220,30,20,0.95)' : 'rgba(26,26,46,0.92)',
      border: isContraflow ? '2px solid #ff6b6b' : 'none',
      borderRadius: 18, boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ flexShrink: 0, width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isRoundabout
          ? <RoundaboutArrow exitNumber={next.exitNumber ?? 0} size={38} color={iconColor} />
          : <TurnArrow sign={next.sign} size={36} color={iconColor} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isArrive && (
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 3 }}>בעוד {distStr}</div>
        )}
        <div style={{ color: 'white', fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {instrLabel}
        </div>
        {isContraflow && (
          <div style={{ color: '#ffcdd2', fontSize: 11, marginTop: 4 }}>⚠️ נסיעה נגד כיוון התנועה</div>
        )}
      </div>
    </div>
  );
}

function SearchModal({ startText, setStartText, endText, setEndText, onSelectStart, onSelectEnd, startPos, endPos, loading, error, onNavigate, onClose, isEmergency, onGPS }) {
  const [startSugg, setStartSugg] = useState([]);
  const [endSugg,   setEndSugg]   = useState([]);
  const [active,    setActive]    = useState('end');
  const startTimer  = useRef(null);
  const endTimer    = useRef(null);
  const endInputRef = useRef(null);

  useEffect(() => { endInputRef.current?.focus(); }, []);

  const fetchSugg = async (q, setFn) => {
    if (q.length < 2) { setFn([]); return; }
    try {
      const r = await fetch(`${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=il&accept-language=he,en`);
      setFn(await r.json());
    } catch { setFn([]); }
  };

  const onStartChange = val => {
    setStartText(val); setActive('start');
    clearTimeout(startTimer.current);
    startTimer.current = setTimeout(() => fetchSugg(val, setStartSugg), 380);
  };

  const onEndChange = val => {
    setEndText(val); setActive('end');
    clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => fetchSugg(val, setEndSugg), 380);
  };

  const pickStart = item => {
    const label = item.display_name.split(',').slice(0, 2).join(',').trim();
    setStartText(label);
    onSelectStart({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label });
    setStartSugg([]); setActive('end');
    endInputRef.current?.focus();
  };

  const pickEnd = item => {
    const label = item.display_name.split(',').slice(0, 2).join(',').trim();
    setEndText(label);
    onSelectEnd({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label });
    setEndSugg([]); setActive(null);
  };

  const suggestions = active === 'start' ? startSugg : active === 'end' ? endSugg : [];

  const inputBox = (focused) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    background: focused ? '#f0f4ff' : '#f5f7fa',
    borderRadius: 13, padding: '0 14px',
    border: `1.5px solid ${focused ? '#007aff' : '#e8eaed'}`,
    transition: 'border-color 0.2s',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 650, background: '#f8f9fb', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: 'white', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)', paddingBottom: 14, paddingLeft: 16, paddingRight: 16, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 0 #f0f0f0', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, background: '#f5f7fa', border: '1px solid #e8eaed', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
        <span style={{ fontWeight: 700, fontSize: 17, color: '#1a1a2e' }}>🧭 הגדר מסלול</span>
      </div>

      <div style={{ background: 'white', padding: '14px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={inputBox(active === 'start')}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🟢</span>
          <input value={startText} onFocus={() => setActive('start')} onChange={e => onStartChange(e.target.value)}
            placeholder="נקודת מוצא…" autoComplete="off"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, padding: '14px 0', color: '#1a1a2e', direction: 'rtl' }} />
          {startText
            ? <button onMouseDown={() => { setStartText(''); onSelectStart(null); setStartSugg([]); }} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>✕</button>
            : <button onMouseDown={onGPS} title="מיקום נוכחי" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>📍</button>
          }
        </div>

        <div style={inputBox(active === 'end')}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🔴</span>
          <input ref={endInputRef} value={endText} onFocus={() => setActive('end')} onChange={e => onEndChange(e.target.value)}
            placeholder="לאן?" autoComplete="off"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, padding: '14px 0', color: '#1a1a2e', direction: 'rtl' }} />
          {endText && (
            <button onMouseDown={() => { setEndText(''); onSelectEnd(null); setEndSugg([]); }} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>✕</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'white' }}>
        {suggestions.map((item, i) => (
          <div key={i} onMouseDown={() => active === 'start' ? pickStart(item) : pickEnd(item)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '15px 16px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <span style={{ fontSize: 22, color: '#ff3b30', flexShrink: 0, marginTop: 1 }}>📍</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a2e', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.display_name.split(',')[0]}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.display_name.split(',').slice(1, 3).join(',')}
              </div>
            </div>
          </div>
        ))}
        {suggestions.length === 0 && (active === 'start' ? startText : endText)?.length > 1 && !loading && (
          <div style={{ textAlign: 'center', color: '#ccc', padding: '50px 20px', fontSize: 15 }}>לא נמצאו תוצאות</div>
        )}
      </div>

      {error && <div style={{ padding: '10px 16px', background: '#fff0ef', color: '#ff3b30', fontSize: 13, flexShrink: 0 }}>⚠️ {error}</div>}

      <div style={{ padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'white', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        <button onClick={onNavigate} disabled={!startPos || !endPos || loading} style={{
          width: '100%', height: 54, border: 'none', borderRadius: 14, fontFamily: 'inherit',
          background: startPos && endPos
            ? (isEmergency ? 'linear-gradient(135deg,#ff3b30,#ff6b35)' : 'linear-gradient(135deg,#007aff,#5ac8fa)')
            : '#f0f0f0',
          color: startPos && endPos ? 'white' : '#bbb',
          fontWeight: 800, fontSize: 16,
          cursor: startPos && endPos ? 'pointer' : 'not-allowed',
          letterSpacing: 0.3,
        }}>
          {loading ? '⏳  מחשב…' : '▶  נווט'}
        </button>
      </div>
    </div>
  );
}

export default function DriverView() {
  const [isEmergency,    setIsEmergency]    = useState(false);
  const [isFollowing,    setIsFollowing]    = useState(true);
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [routeCoords,    setRouteCoords]    = useState([]);
  const [routeInfo,      setRouteInfo]      = useState(null);
  const [instructions,   setInstructions]   = useState([]);
  const [trafficSignals,   setTrafficSignals]   = useState([]);
  const [trafficSegments,  setTrafficSegments]  = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [activeCase,     setActiveCase]     = useState(null);
  const [arrivedAtScene, setArrivedAtScene] = useState(false);
  const [driverStatus,     setDriverStatus]     = useState('available');
  const [statusSaving,     setStatusSaving]     = useState(false);
  const [disconnectOpen,   setDisconnectOpen]   = useState(false);
  const [disconnecting,    setDisconnecting]    = useState(false);
  const [ambulanceId] = useState(() => {
    try { const a = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}'); return a.ambulanceId || null; } catch { return null; }
  });

  const [startText, setStartText] = useState('');
  const [endText,   setEndText]   = useState('');
  const [startPos,  setStartPos]  = useState(null);
  const [endPos,    setEndPos]    = useState(null);
  const [locationLocked, setLocationLocked] = useState(false);

  const prevCaseIdRef       = useRef(null);
  const locationLockedRef   = useRef(false);
  const prevActiveCaseIdRef = useRef(null);
  const [newCaseAlert,  setNewCaseAlert]  = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/api/signals`).then(res => setTrafficSignals(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const fetch = () => axios.get(`${API_BASE}/api/traffic`).then(res => setTrafficSegments(res.data)).catch(() => {});
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const auth  = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId) return;

    const resetNav = () => {
      setActiveCase(null); prevCaseIdRef.current = null;
      setRouteCoords([]); setRouteInfo(null); setInstructions([]);
      setEndPos(null); setEndText('');
    };

    const poll = () => {
      axios.get(`${API_BASE}/api/ambulances`).then(r => {
        const amb = r.data.find(a => a.id === ambId);
        if (!amb) return;
        if (amb.status !== 'busy') setDriverStatus(amb.status);
        const locked = !!amb.locationLocked;
        locationLockedRef.current = locked;
        setLocationLocked(locked);
        if (locked) {
          setStartPos({ lat: amb.lat, lon: amb.lon, label: '📍 מיקום נעול' });
          setStartText('📍 מיקום (נעול ע"י מנהל)');
        }
        const caseId = amb.activeCaseId || null;
        if (caseId && caseId !== prevActiveCaseIdRef.current) {
          prevActiveCaseIdRef.current = caseId;
          axios.get(`${API_BASE}/api/cases/${caseId}`).then(cr => {
            const c = cr.data;
            if (c && c.status !== 'cancelled' && c.status !== 'completed') setActiveCase(c);
          }).catch(() => {});
        } else if (!caseId && prevActiveCaseIdRef.current !== null) {
          prevActiveCaseIdRef.current = null;
          resetNav();
        }
      }).catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const auth  = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    const update = () => {
      if (locationLockedRef.current) return;
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        const pos = { lat: coords.latitude, lon: coords.longitude, label: 'מיקום נוכחי' };
        setStartPos(pos);
        setStartText('📍 מיקום נוכחי');
        if (ambId) axios.post(`${API_BASE}/api/ambulances/location`, { ambulanceId: ambId, lat: coords.latitude, lon: coords.longitude }).catch(() => {});
      }, () => {});
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const auth  = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId) return;
    const poll = () =>
      axios.get(`${API_BASE}/api/cases/active`, { params: { ambulanceId: ambId } }).then(r => {
        const c = r.data;
        const resetNav = () => {
          setActiveCase(null); prevCaseIdRef.current = null;
          setRouteCoords([]); setRouteInfo(null); setInstructions([]);
          setEndPos(null); setEndText('');
        };
        if (c && c.status === 'cancelled') resetNav();
        else if (!c && prevCaseIdRef.current !== null) resetNav();
        else setActiveCase(c);
      }).catch(() => {});
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!activeCase) { prevCaseIdRef.current = null; return; }
    if (activeCase.id === prevCaseIdRef.current) return;
    prevCaseIdRef.current = activeCase.id;
    setArrivedAtScene(false);
    setEndPos({ lat: activeCase.lat, lon: activeCase.lon, label: activeCase.address });
    setEndText(activeCase.address);
    setIsEmergency(activeCase.urgency === 'emergency');
    setNewCaseAlert(true);
    setSearchOpen(false);
    setIsFollowing(true);
  }, [activeCase]);

  useEffect(() => {
    if (!newCaseAlert) return;
    const t = setTimeout(() => setNewCaseAlert(false), 8000);
    return () => clearTimeout(t);
  }, [newCaseAlert]);

  useEffect(() => {
    if (startPos && endPos) fetchRoute(isEmergency, startPos, endPos);
  }, [startPos, endPos]); // eslint-disable-line

  const fetchRoute = useCallback(async (emergency, start, end) => {
    if (!start || !end) return;
    setLoading(true); setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/route`, {
        params: { startLat: start.lat, startLon: start.lon, endLat: end.lat, endLon: end.lon, isEmergency: emergency },
      });
      if (data?.path) {
        setRouteCoords(data.path.map(p => [p.lat, p.lon]));
        setRouteInfo({ distance: data.totalDistanceMeters, time: data.estimatedTimeSeconds });
        setInstructions(data.instructions ?? []);
        setSearchOpen(false);
        setIsFollowing(true);
      }
    } catch { setError('לא ניתן לחשב מסלול.'); }
    setLoading(false);
  }, []);

  const handleSelectStart = (pos) => setStartPos(pos);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const pos = { lat: coords.latitude, lon: coords.longitude, label: 'מיקום נוכחי' };
      setStartPos(pos); setStartText('📍 מיקום נוכחי');
    }, () => setError('לא ניתן לגשת למיקום.'));
  };

  const handleToggleStatus = async () => {
    const auth  = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId || activeCase) return;
    const next = driverStatus === 'available' ? 'offline' : 'available';
    setStatusSaving(true);
    try {
      await axios.post(`${API_BASE}/api/ambulances/status`, { ambulanceId: ambId, status: next });
      setDriverStatus(next);
    } catch {}
    setStatusSaving(false);
  };

  const handleDisconnect = async () => {
    const auth  = JSON.parse(sessionStorage.getItem('fastAuth') || localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId) return;
    setDisconnecting(true);
    try {
      await axios.post(`${API_BASE}/api/ambulances/disconnect`, { ambulanceId: ambId });
      const updated = { ...auth, ambulanceId: null };
      sessionStorage.setItem('fastAuth', JSON.stringify(updated));
      localStorage.setItem('fastAuth', JSON.stringify(updated));
      window.location.href = '/pick-ambulance';
    } catch { setDisconnecting(false); }
  };

  const toggleEmergency = () => {
    const next = !isEmergency;
    setIsEmergency(next);
    if (startPos && endPos) fetchRoute(next, startPos, endPos);
  };

  const handleCancelRequest = async () => {
    if (!activeCase) return;
    try { await axios.post(`${API_BASE}/api/cases/cancel-request`, { caseId: activeCase.id }); setCancelConfirm(false); } catch {}
  };

  const handleArrived = async () => {
    if (!activeCase) return;
    try { await axios.post(`${API_BASE}/api/cases/arrive`, { caseId: activeCase.id }); setArrivedAtScene(true); } catch {}
  };

  const BOTTOM_H = 'calc(106px + env(safe-area-inset-bottom, 0px))';

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      <div style={{ position: 'absolute', inset: 0 }}>
        <MapDisplay
          routeCoordinates={routeCoords}
          startPos={startPos ? [startPos.lat, startPos.lon] : null}
          endPos={endPos     ? [endPos.lat,   endPos.lon]   : null}
          isEmergency={isEmergency}
          trafficSignals={trafficSignals}
          trafficSegments={trafficSegments}
          isFollowing={isFollowing}
          onUserPan={() => setIsFollowing(false)}
        />
      </div>

      {instructions.length > 0 && <InstructionBanner instructions={instructions} isEmergency={isEmergency} />}

      {activeCase?.notes && (() => {
        const last = activeCase.notes.split('\n').filter(Boolean).pop();
        return last ? (
          <div style={{
            position: 'absolute',
            top: instructions.length > 0 ? 'calc(env(safe-area-inset-top, 0px) + 108px)' : 'calc(env(safe-area-inset-top, 0px) + 16px)',
            left: 16, right: 16, zIndex: 590,
            background: 'rgba(255,149,0,0.95)', backdropFilter: 'blur(6px)',
            borderRadius: 14, padding: '10px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 11, marginBottom: 3, opacity: 0.85 }}>עדכון מוקד</div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>{last}</div>
            </div>
          </div>
        ) : null;
      })()}

      {newCaseAlert && activeCase && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setNewCaseAlert(false)}>
          <div style={{ background: 'white', borderRadius: 24, padding: '28px 26px 22px', maxWidth: 360, width: '100%', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', fontSize: 54, lineHeight: 1, marginBottom: 14 }}>{activeCase.urgency === 'emergency' ? '🚨' : '📋'}</div>
            <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: activeCase.urgency === 'emergency' ? '#ff3b30' : '#1a1a2e', marginBottom: 6 }}>קריאה חדשה התקבלה</div>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <span style={{ display: 'inline-block', background: activeCase.urgency === 'emergency' ? '#fff0ef' : '#f0f9f0', color: activeCase.urgency === 'emergency' ? '#ff3b30' : '#34c759', border: `1.5px solid ${activeCase.urgency === 'emergency' ? '#ff3b30' : '#34c759'}`, borderRadius: 20, padding: '2px 14px', fontSize: 12, fontWeight: 700 }}>
                {activeCase.urgency === 'emergency' ? 'חירום' : 'שגרה'}
              </span>
            </div>
            <div style={{ background: '#f5f7fa', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 600 }}>כתובת האירוע</div>
              <div style={{ color: '#1a1a2e', fontSize: 15, fontWeight: 700 }}>{activeCase.address}</div>
            </div>
            {activeCase.patientDetails && (
              <div style={{ background: '#f5f7fa', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 600 }}>פרטי מטופל</div>
                <div style={{ color: '#333', fontSize: 13 }}>{activeCase.patientDetails}</div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#007aff', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
              <span style={{ fontSize: 16 }}>🧭</span><span>הניווט מתחיל אוטומטית…</span>
            </div>
            <button onClick={() => setNewCaseAlert(false)} style={{ width: '100%', padding: '13px', background: activeCase.urgency === 'emergency' ? 'linear-gradient(135deg,#ff3b30,#ff6b35)' : 'linear-gradient(135deg,#007aff,#5ac8fa)', color: 'white', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              הבנתי, נווט
            </button>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 710, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 22, padding: '28px 26px 22px', maxWidth: 320, width: '100%', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}>
            <div style={{ textAlign: 'center', fontSize: 48, lineHeight: 1, marginBottom: 14 }}>⚠️</div>
            <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>ביטול נסיעה</div>
            <div style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>שליחת בקשת ביטול למוקדן. האם להמשיך?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCancelConfirm(false)} style={{ flex: 1, padding: '13px', background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>לא</button>
              <button onClick={handleCancelRequest} style={{ flex: 1, padding: '13px', background: 'linear-gradient(135deg,#ff3b30,#ff6b35)', border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'white' }}>כן, בטל</button>
            </div>
          </div>
        </div>
      )}

      {disconnectOpen && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 710, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 22, padding: '28px 26px 22px', maxWidth: 320, width: '100%', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}>
            <div style={{ textAlign: 'center', fontSize: 48, lineHeight: 1, marginBottom: 14 }}>🔌</div>
            <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>ניתוק מהאמבולנס</div>
            <div style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>תנותק ויופנה לבחירת אמבולנס מחדש</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDisconnectOpen(false)} style={{ flex: 1, padding: '13px', background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>לא</button>
              <button onClick={handleDisconnect} disabled={disconnecting} style={{ flex: 1, padding: '13px', background: 'linear-gradient(135deg,#1a1a2e,#2d3561)', border: 'none', borderRadius: 14, cursor: disconnecting ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14, color: 'white' }}>
                {disconnecting ? '...' : 'כן, נתק'}
              </button>
            </div>
          </div>
        </div>
      )}

      {routeInfo && !searchOpen && (() => {
        const arrival = new Date(Date.now() + routeInfo.time * 1000)
          .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        return (
          <div style={{
            position: 'absolute',
            bottom: BOTTOM_H,
            left: '50%', transform: 'translateX(-50%)',
            zIndex: 490, whiteSpace: 'nowrap',
            background: 'rgba(26,26,46,0.92)', backdropFilter: 'blur(10px)',
            borderRadius: 24, padding: '9px 20px',
            display: 'flex', gap: 14, alignItems: 'center',
            color: 'white', fontSize: 14, fontWeight: 700,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <span>{fmtDist(routeInfo.distance)}</span>
            <span style={{ opacity: 0.3, fontWeight: 300 }}>|</span>
            <span style={{ color: isEmergency ? '#ff9f9f' : '#90d5ff' }}>{fmtTime(routeInfo.time)}</span>
            <span style={{ opacity: 0.3, fontWeight: 300 }}>|</span>
            <span style={{ fontSize: 13, opacity: 0.85 }}>יגיע: {arrival}</span>
          </div>
        );
      })()}

      {!isFollowing && !searchOpen && (
        <button onClick={() => setIsFollowing(true)} style={{
          position: 'absolute',
          bottom: (() => {
            const arriveVisible = activeCase && activeCase.status === 'active' && !arrivedAtScene;
            const base = arriveVisible ? 180 : 116;
            return `calc(${routeInfo ? base + 58 : base + 10}px + env(safe-area-inset-bottom, 0px))`;
          })(),
          right: 16, zIndex: 495,
          width: 50, height: 50, borderRadius: '50%',
          background: 'white', boxShadow: '0 3px 20px rgba(0,0,0,0.22)',
          border: '2.5px solid #007aff',
          cursor: 'pointer', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>📍</button>
      )}

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'white',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -4px 28px rgba(0,0,0,0.1)',
        zIndex: 500,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e0e0e0' }} />
        </div>

        {ambulanceId && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#bbb', marginBottom: 2, letterSpacing: 0.3 }}>
            🚑 {ambulanceId.replace('amb-', 'אמב. ')}
          </div>
        )}

        {locationLocked && (
          <div style={{ margin: '4px 14px 4px', background: '#fff3e0', border: '1.5px solid #ff9500', borderRadius: 10, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#e65100', fontWeight: 600 }}>
            <span style={{ fontSize: 15 }}>🔒</span>מיקום נשלט ע"י המנהל
          </div>
        )}

        {activeCase && activeCase.status === 'active' && (
          <div style={{ padding: '6px 14px' }}>
            {!arrivedAtScene ? (
              <button onClick={handleArrived} style={{ width: '100%', height: 48, background: 'linear-gradient(135deg,#34c759,#28a745)', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'white', fontFamily: 'inherit' }}>
                ✓ הגעתי לאירוע
              </button>
            ) : (
              <div style={{ width: '100%', height: 40, background: '#e6f9ec', border: '1.5px solid #34c759', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, color: '#34c759' }}>
                ✓ הגעה נרשמה
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>

          {!activeCase && (
            <button onClick={() => setDisconnectOpen(true)} style={{ width: 48, height: 48, flexShrink: 0, background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 12, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🔌
            </button>
          )}

          {!activeCase && (
            <button onClick={() => setSearchOpen(true)} style={{ flex: 1, height: 48, background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <span style={{ fontSize: 14, color: routeInfo ? '#1a1a2e' : '#aaa', fontWeight: routeInfo ? 600 : 400 }}>
                {routeInfo ? 'שנה מסלול' : 'לאן?'}
              </span>
            </button>
          )}

          {activeCase && (
            <div style={{ flex: 1, height: 48, background: '#fff3e0', border: '1.5px solid #ff9500', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#ff9500' }}>
              ● עסוק בקריאה
            </div>
          )}

          <button onClick={toggleEmergency} style={{
            minHeight: 48, padding: '0 14px', display: 'flex', alignItems: 'center',
            background: isEmergency ? '#fff0ef' : '#f0f9f0',
            border: `1.5px solid ${isEmergency ? '#ff3b30' : '#34c759'}`,
            borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 12,
            color: isEmergency ? '#ff3b30' : '#34c759',
            whiteSpace: 'nowrap', fontFamily: 'inherit',
            animation: isEmergency ? 'emergencyPulse 1.4s ease-in-out infinite' : 'none',
          }}>
            {isEmergency ? '🚨 חירום' : '✓ שגרה'}
          </button>

          {!activeCase && (
            <button onClick={handleToggleStatus} disabled={statusSaving} style={{
              minHeight: 48, padding: '0 14px', display: 'flex', alignItems: 'center',
              background: driverStatus === 'available' ? '#f0f9f0' : '#f5f5f5',
              border: `1.5px solid ${driverStatus === 'available' ? '#34c759' : '#aaa'}`,
              borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 12,
              color: driverStatus === 'available' ? '#34c759' : '#888',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              {statusSaving ? '...' : (driverStatus === 'available' ? '● פנוי' : '○ לא פעיל')}
            </button>
          )}

          {activeCase && activeCase.status === 'active' && (
            <button onClick={() => setCancelConfirm(true)} style={{ minHeight: 48, padding: '0 14px', display: 'flex', alignItems: 'center', background: '#fff0ef', border: '1.5px solid #ff3b30', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#ff3b30', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              ✕ בטל
            </button>
          )}

          {activeCase && activeCase.status === 'cancel_requested' && (
            <div style={{ minHeight: 48, padding: '0 12px', display: 'flex', alignItems: 'center', background: '#fff8e1', border: '1.5px solid #ff9500', borderRadius: 12, fontWeight: 600, fontSize: 11, color: '#ff9500', whiteSpace: 'nowrap' }}>
              ⏳ ממתין לביטול
            </div>
          )}
        </div>
      </div>

      {searchOpen && (
        <SearchModal
          startText={startText} setStartText={setStartText}
          endText={endText}   setEndText={setEndText}
          onSelectStart={handleSelectStart}
          onSelectEnd={pos => setEndPos(pos)}
          startPos={startPos} endPos={endPos}
          loading={loading} error={error}
          onNavigate={() => fetchRoute(isEmergency, startPos, endPos)}
          onClose={() => setSearchOpen(false)}
          isEmergency={isEmergency}
          onGPS={handleUseMyLocation}
        />
      )}

      <style>{`
        @keyframes emergencyPulse {
          0%,100% { box-shadow: 0 0 0px rgba(255,59,48,0); }
          50%      { box-shadow: 0 0 12px rgba(255,59,48,0.65); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
