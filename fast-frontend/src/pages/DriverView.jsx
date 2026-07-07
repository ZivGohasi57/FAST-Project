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
const distMeters = (a, b) => {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const computeBearing = (a, b) => {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const phi1 = toRad(a.lat), phi2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};
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

function HospitalPickerModal({ hospitals, loading, error, onSelect, onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 720, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 22, padding: '24px 20px', maxWidth: 380, width: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', fontSize: 40, lineHeight: 1, marginBottom: 10 }}>🏥</div>
        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>בחירת בית חולים</div>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 13, marginBottom: 18 }}>לפי בקשת המטופל, ניתן לבחור כל בית חולים</div>

        {loading && <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>⏳ טוען...</div>}
        {error && <div style={{ textAlign: 'center', color: '#ff3b30', padding: 10, fontSize: 13 }}>⚠️ {error}</div>}

        {!loading && hospitals.map((h, i) => (
          <button key={h.id} onClick={() => onSelect(h)} style={{
            width: '100%', textAlign: 'right', marginBottom: 10, padding: '12px 14px',
            background: i === 0 ? '#fff0ef' : '#f5f7fa',
            border: `1.5px solid ${i === 0 ? '#ff3b30' : '#e8eaed'}`,
            borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          }}>
            <div style={{ minWidth: 0 }}>
              {i === 0 && <div style={{ fontSize: 11, fontWeight: 700, color: '#ff3b30', marginBottom: 2 }}>מומלץ — הכי קרוב</div>}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#007aff' }}>{fmtTime(h.etaSeconds)}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{fmtDist(h.distanceMeters)}</div>
            </div>
          </button>
        ))}

        <button onClick={onClose} style={{ width: '100%', padding: '12px', marginTop: 4, background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555', fontFamily: 'inherit' }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

export default function DriverView() {
  const [isEmergency,    setIsEmergency]    = useState(false);
  const [isFollowing,    setIsFollowing]    = useState(true);
  const [recenterCount,  setRecenterCount]  = useState(0);
  const [overviewCount,  setOverviewCount]  = useState(0);
  const [inOverview,     setInOverview]     = useState(false);
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
  const [hospitals,        setHospitals]        = useState([]);
  const [hospitalPickerOpen, setHospitalPickerOpen] = useState(false);
  const [hospitalLoading,  setHospitalLoading]  = useState(false);
  const [hospitalError,    setHospitalError]    = useState(null);
  const [noEvacConfirm,    setNoEvacConfirm]    = useState(false);
  const [finishEvacConfirm, setFinishEvacConfirm] = useState(false);
  const [noEvacSaving,     setNoEvacSaving]     = useState(false);
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
  const [heading,   setHeading]   = useState(null);

  const prevCaseIdRef       = useRef(null);
  const prevSceneRef        = useRef(null);
  const locationLockedRef   = useRef(false);
  const prevActiveCaseIdRef = useRef(null);
  const firstGpsRef         = useRef(true);
  const lastPostedPosRef    = useRef(null);
  const lastFixPosRef       = useRef(null);
  const endPosRef           = useRef(null);
  const [newCaseAlert,  setNewCaseAlert]  = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/api/signals`).then(res => setTrafficSignals(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/api/hospitals`).then(res => setHospitals(res.data ?? [])).catch(() => {});
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
        if (coords.accuracy && coords.accuracy > 200) return;
        const pos = { lat: coords.latitude, lon: coords.longitude, label: 'מיקום נוכחי' };
        setStartPos(pos);
        setStartText('📍 מיקום נוכחי');
        firstGpsRef.current = false;
        setRecenterCount(c => c + 1);

        let newHeading = (typeof coords.heading === 'number' && !Number.isNaN(coords.heading)) ? coords.heading : null;
        if (newHeading === null && lastFixPosRef.current) {
          const movedForBearing = distMeters(lastFixPosRef.current, pos);
          if (movedForBearing > 8) newHeading = computeBearing(lastFixPosRef.current, pos);
        }
        if (newHeading !== null) setHeading(newHeading);
        lastFixPosRef.current = pos;

        const last  = lastPostedPosRef.current;
        const moved = !last || distMeters(last, pos) > 15;
        if (ambId && moved) {
          axios.post(`${API_BASE}/api/ambulances/location`, { ambulanceId: ambId, lat: coords.latitude, lon: coords.longitude }).catch(() => {});
          lastPostedPosRef.current = pos;
        }
      }, () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
    };
    update();
    const iv = setInterval(update, 5000);
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
    if (!activeCase) { prevCaseIdRef.current = null; prevSceneRef.current = null; return; }

    if (activeCase.id !== prevCaseIdRef.current) {
      prevCaseIdRef.current = activeCase.id;
      const alreadyArrived = !!activeCase.arrivalTime;
      setArrivedAtScene(alreadyArrived);
      if (activeCase.hospitalName) {
        setEndPos({ lat: activeCase.hospitalLat, lon: activeCase.hospitalLon, label: activeCase.hospitalName });
        setEndText(activeCase.hospitalName);
      } else {
        setEndPos({ lat: activeCase.lat, lon: activeCase.lon, label: activeCase.address });
        setEndText(activeCase.address);
        setNewCaseAlert(!alreadyArrived);
      }
      prevSceneRef.current = { lat: activeCase.lat, lon: activeCase.lon };
      setIsEmergency(activeCase.urgency === 'emergency');
      setSearchOpen(false);
      setIsFollowing(true);
      setRecenterCount(c => c + 1);
      return;
    }

    if (!activeCase.hospitalName) {
      const prev = prevSceneRef.current;
      if (prev && (prev.lat !== activeCase.lat || prev.lon !== activeCase.lon)) {
        setEndPos({ lat: activeCase.lat, lon: activeCase.lon, label: activeCase.address });
        setEndText(activeCase.address);
      }
      prevSceneRef.current = { lat: activeCase.lat, lon: activeCase.lon };
    }
  }, [activeCase]);

  useEffect(() => {
    if (!newCaseAlert) return;
    const t = setTimeout(() => setNewCaseAlert(false), 8000);
    return () => clearTimeout(t);
  }, [newCaseAlert]);

  useEffect(() => {
    endPosRef.current = endPos;
  }, [endPos]);

  useEffect(() => {
    if (startPos && endPos) fetchRoute(isEmergency, startPos, endPos);
  }, [startPos, endPos]);

  const fetchRoute = useCallback(async (emergency, start, end, shouldRecenter = false) => {
    if (!start || !end) return;
    setLoading(true); setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/route`, {
        params: { startLat: start.lat, startLon: start.lon, endLat: end.lat, endLon: end.lon, isEmergency: emergency },
      });
      if (data?.path && endPosRef.current === end) {
        setRouteCoords(data.path.map(p => [p.lat, p.lon]));
        setRouteInfo({ distance: data.totalDistanceMeters, time: data.estimatedTimeSeconds });
        setInstructions(data.instructions ?? []);
        setSearchOpen(false);
        setInOverview(false);
        if (shouldRecenter) setRecenterCount(c => c + 1);
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
    if (startPos && endPos) fetchRoute(next, startPos, endPos, true);
  };

  const handleCancelRequest = async () => {
    if (!activeCase) return;
    try { await axios.post(`${API_BASE}/api/cases/cancel-request`, { caseId: activeCase.id }); setCancelConfirm(false); } catch {}
  };

  const handleArrived = async () => {
    if (!activeCase) return;
    try { await axios.post(`${API_BASE}/api/cases/arrive`, { caseId: activeCase.id }); setArrivedAtScene(true); } catch {}
  };

  const handleOpenHospitalPicker = async () => {
    if (!activeCase) return;
    setHospitalPickerOpen(true); setHospitalLoading(true); setHospitalError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/hospitals`, {
        params: { lat: activeCase.lat, lon: activeCase.lon },
      });
      setHospitals(data ?? []);
    } catch { setHospitalError('לא ניתן לטעון בתי חולים.'); }
    setHospitalLoading(false);
  };

  const handleSelectHospital = async (hospital) => {
    if (!activeCase) return;
    try {
      await axios.post(`${API_BASE}/api/cases/select-hospital`, { caseId: activeCase.id, hospitalId: hospital.id });
      setActiveCase(prev => prev ? { ...prev, hospitalId: hospital.id, hospitalName: hospital.name } : prev);
      setEndPos({ lat: hospital.lat, lon: hospital.lon, label: hospital.name });
      setEndText(hospital.name);
      setHospitalPickerOpen(false);
    } catch { setHospitalError('לא ניתן לבחור בית חולים.'); }
  };

  const handleCompleteCase = async () => {
    if (!activeCase) return;
    setNoEvacSaving(true);
    try {
      await axios.post(`${API_BASE}/api/cases/complete`, { caseId: activeCase.id });
      setNoEvacConfirm(false); setFinishEvacConfirm(false);
    } catch {}
    setNoEvacSaving(false);
  };

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapDisplay
          routeCoordinates={routeCoords}
          startPos={startPos ? [startPos.lat, startPos.lon] : null}
          endPos={endPos     ? [endPos.lat,   endPos.lon]   : null}
          isEmergency={isEmergency}
          trafficSignals={trafficSignals}
          trafficSegments={trafficSegments}
          isFollowing={isFollowing}
          onUserPan={() => { setIsFollowing(false); setInOverview(false); }}
          recenterCount={recenterCount}
          overviewCount={overviewCount}
          hospitals={hospitals}
          heading={heading}
        />

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

        {routeInfo && !searchOpen && !activeCase && (() => {
          const arrival = new Date(Date.now() + routeInfo.time * 1000)
            .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
          return (
            <div style={{
              position: 'absolute', bottom: 16,
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

        {!searchOpen && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 495, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {inOverview && (
              <button onClick={() => { setIsFollowing(true); setInOverview(false); setRecenterCount(c => c + 1); }} style={{
                width: 50, height: 50, borderRadius: '50%',
                background: '#007aff', boxShadow: '0 3px 20px rgba(0,122,255,0.4)',
                border: 'none', cursor: 'pointer', fontSize: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
              }}>📍</button>
            )}
            {!inOverview && !isFollowing && (
              <button onClick={() => { setIsFollowing(true); setRecenterCount(c => c + 1); }} style={{
                width: 50, height: 50, borderRadius: '50%',
                background: 'white', boxShadow: '0 3px 20px rgba(0,0,0,0.22)',
                border: '2.5px solid #007aff', cursor: 'pointer', fontSize: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>📍</button>
            )}
            {routeCoords.length > 0 && !inOverview && (
              <button onClick={() => { setInOverview(true); setOverviewCount(c => c + 1); }} style={{
                width: 50, height: 50, borderRadius: '50%',
                background: 'white', boxShadow: '0 3px 20px rgba(0,0,0,0.18)',
                border: '1.5px solid #e0e0e0', cursor: 'pointer', fontSize: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>🗺</button>
            )}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, background: 'white', borderRadius: '20px 20px 0 0', boxShadow: '0 -3px 20px rgba(0,0,0,0.08)' }}>

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 7, paddingBottom: 1 }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: '#e0e0e0' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
          {ambulanceId && <span style={{ fontSize: 10, color: '#ccc', letterSpacing: 0.2 }}>🚑 {ambulanceId.replace('amb-', 'אמב. ')}</span>}
          {locationLocked && <span style={{ fontSize: 10, color: '#e65100', fontWeight: 600 }}>🔒 מיקום נעול</span>}
        </div>

        {activeCase && routeInfo && (() => {
          const arrival = new Date(Date.now() + routeInfo.time * 1000)
            .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
          return (
            <div style={{ margin: '2px 12px 0', padding: '7px 12px', background: isEmergency ? '#fff0ef' : '#f0fff4', border: `1.5px solid ${isEmergency ? '#ff3b30' : '#34c759'}`, borderRadius: 12, direction: 'rtl', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0, flex: 1, marginLeft: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 1 }}>{activeCase.hospitalName ? 'פינוי ליעד' : 'יעד'}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeCase.hospitalName ? `🏥 ${activeCase.hospitalName}` : `📍 ${activeCase.address}`}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0, borderRight: '1px solid #e8e8e8', paddingRight: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: isEmergency ? '#ff3b30' : '#007aff', lineHeight: 1 }}>{arrival}</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{fmtTime(routeInfo.time)}</div>
              </div>
            </div>
          );
        })()}

        {activeCase && activeCase.status === 'active' && (
          <div style={{ padding: '4px 12px 0' }}>
            {!arrivedAtScene ? (
              <button onClick={handleArrived} style={{ width: '100%', height: 40, background: 'linear-gradient(135deg,#34c759,#28a745)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'white', fontFamily: 'inherit' }}>
                ✓ הגעתי לאירוע
              </button>
            ) : activeCase.hospitalName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>🏥 בדרך ל: {activeCase.hospitalName}</div>
                <button onClick={() => setFinishEvacConfirm(true)} style={{ width: '100%', height: 40, background: 'linear-gradient(135deg,#34c759,#28a745)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'white', fontFamily: 'inherit' }}>
                  ✓ סיום פינוי
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleOpenHospitalPicker} style={{ flex: 1, height: 40, background: 'linear-gradient(135deg,#ff3b30,#ff6b35)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: 'white', fontFamily: 'inherit' }}>
                  🏥 כן, נדרש פינוי
                </button>
                <button onClick={() => setNoEvacConfirm(true)} style={{ flex: 1, height: 40, background: '#f5f7fa', border: '1.5px solid #34c759', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#34c759', fontFamily: 'inherit' }}>
                  ✓ לא, סגור קריאה
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))' }}>

          {!activeCase && (
            <button onClick={() => setDisconnectOpen(true)} style={{ width: 40, height: 40, flexShrink: 0, background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🔌
            </button>
          )}

          {!activeCase && (
            <button onClick={() => setSearchOpen(true)} style={{ flex: 1, height: 40, background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 15 }}>🔍</span>
              <span style={{ fontSize: 13, color: routeInfo ? '#1a1a2e' : '#aaa', fontWeight: routeInfo ? 600 : 400 }}>
                {routeInfo ? 'שנה מסלול' : 'לאן?'}
              </span>
            </button>
          )}

          <button onClick={toggleEmergency} style={{
            minHeight: 40, padding: '0 12px', display: 'flex', alignItems: 'center',
            background: isEmergency ? '#fff0ef' : '#f0f9f0',
            border: `1.5px solid ${isEmergency ? '#ff3b30' : '#34c759'}`,
            borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12,
            color: isEmergency ? '#ff3b30' : '#34c759',
            whiteSpace: 'nowrap', fontFamily: 'inherit',
            animation: isEmergency ? 'emergencyPulse 1.4s ease-in-out infinite' : 'none',
          }}>
            {isEmergency ? '🚨 חירום' : '✓ שגרה'}
          </button>

          {!activeCase && (
            <button onClick={handleToggleStatus} disabled={statusSaving} style={{
              minHeight: 40, padding: '0 12px', display: 'flex', alignItems: 'center',
              background: driverStatus === 'available' ? '#f0f9f0' : '#f5f5f5',
              border: `1.5px solid ${driverStatus === 'available' ? '#34c759' : '#aaa'}`,
              borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12,
              color: driverStatus === 'available' ? '#34c759' : '#888',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              {statusSaving ? '...' : (driverStatus === 'available' ? '● פנוי' : '○ לא פעיל')}
            </button>
          )}

          {activeCase && activeCase.status === 'active' && (
            <button onClick={() => setCancelConfirm(true)} style={{ minHeight: 40, padding: '0 12px', display: 'flex', alignItems: 'center', background: '#fff0ef', border: '1.5px solid #ff3b30', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#ff3b30', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              ✕ בטל
            </button>
          )}

          {activeCase && activeCase.status === 'cancel_requested' && (
            <div style={{ minHeight: 40, padding: '0 10px', display: 'flex', alignItems: 'center', background: '#fff8e1', border: '1.5px solid #ff9500', borderRadius: 10, fontWeight: 600, fontSize: 11, color: '#ff9500', whiteSpace: 'nowrap' }}>
              ⏳ ממתין לביטול
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: 9, color: '#ccc', paddingBottom: 3 }}>
          © <a href="https://www.openstreetmap.org/copyright" style={{ color: '#ccc', textDecoration: 'none' }}>OpenStreetMap</a> © <a href="https://carto.com" style={{ color: '#ccc', textDecoration: 'none' }}>CARTO</a>
        </div>
      </div>

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

      {noEvacConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 710, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 22, padding: '28px 26px 22px', maxWidth: 320, width: '100%', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}>
            <div style={{ textAlign: 'center', fontSize: 48, lineHeight: 1, marginBottom: 14 }}>✓</div>
            <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>סגירת קריאה</div>
            <div style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>אין צורך בפינוי — הקריאה תיסגר והאמבולנס יהפוך לזמין. להמשיך?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setNoEvacConfirm(false)} style={{ flex: 1, padding: '13px', background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>ביטול</button>
              <button onClick={handleCompleteCase} disabled={noEvacSaving} style={{ flex: 1, padding: '13px', background: 'linear-gradient(135deg,#34c759,#28a745)', border: 'none', borderRadius: 14, cursor: noEvacSaving ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14, color: 'white' }}>
                {noEvacSaving ? '...' : 'כן, סגור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {finishEvacConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 710, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 22, padding: '28px 26px 22px', maxWidth: 320, width: '100%', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', direction: 'rtl', animation: 'slideUp 0.3s ease' }}>
            <div style={{ textAlign: 'center', fontSize: 48, lineHeight: 1, marginBottom: 14 }}>🏥</div>
            <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>סיום פינוי</div>
            <div style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>המטופל הועבר בהצלחה לבית החולים? הקריאה תיסגר והאמבולנס יהפוך לזמין.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setFinishEvacConfirm(false)} style={{ flex: 1, padding: '13px', background: '#f5f7fa', border: '1px solid #e8eaed', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>ביטול</button>
              <button onClick={handleCompleteCase} disabled={noEvacSaving} style={{ flex: 1, padding: '13px', background: 'linear-gradient(135deg,#34c759,#28a745)', border: 'none', borderRadius: 14, cursor: noEvacSaving ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14, color: 'white' }}>
                {noEvacSaving ? '...' : 'כן, סיום'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hospitalPickerOpen && (
        <HospitalPickerModal
          hospitals={hospitals} loading={hospitalLoading} error={hospitalError}
          onSelect={handleSelectHospital}
          onClose={() => setHospitalPickerOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchModal
          startText={startText} setStartText={setStartText}
          endText={endText}   setEndText={setEndText}
          onSelectStart={handleSelectStart}
          onSelectEnd={pos => setEndPos(pos)}
          startPos={startPos} endPos={endPos}
          loading={loading} error={error}
          onNavigate={() => fetchRoute(isEmergency, startPos, endPos, true)}
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
