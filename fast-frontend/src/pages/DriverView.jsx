import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import MapDisplay from '../components/MapDisplay';

import { API_BASE } from '../config.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// ── Turn sign → Hebrew text ───────────────────────────────────────────────────
const SIGN_TEXT = {
  [-3]: 'פנה חדה שמאלה',
  [-2]: 'פנה שמאלה',
  [-1]: 'שמור שמאלה',
  [0]:  'המשך ישר',
  [1]:  'שמור ימינה',
  [2]:  'פנה ימינה',
  [3]:  'פנה חדה ימינה',
  [4]:  'הגעת ליעד',
  [6]:  'כיכר',
  [-6]: 'צא מהכיכר',
  [7]:  'שמור שמאלה',
  [8]:  'שמור ימינה',
};
const signText = (sign) => SIGN_TEXT[sign] ?? 'המשך';

// ── SVG arrow — rotates to point in the turn direction ───────────────────────
// Rotation degrees (clockwise from "up") per GraphHopper sign:
const SIGN_ROTATION = {
  [-3]: -130, [-2]: -90, [-1]: -45,
  [0]:    0,
  [1]:   45,  [2]:  90, [3]: 130,
  [-6]:  60,  // leave roundabout
  [7]:  -45,  [8]:  45,
};

function TurnArrow({ sign, size = 34, color = 'white' }) {
  // Destination pin
  if (sign === 4) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="12" r="8" stroke={color} strokeWidth="2.5"/>
        <circle cx="16" cy="12" r="3.5" fill={color}/>
        <line x1="16" y1="20" x2="16" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }

  // Roundabout: circular arrow with exit number
  if (sign === 6) return null; // handled by RoundaboutArrow in InstructionBanner

  const rot = SIGN_ROTATION[sign] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         style={{ transform: `rotate(${rot}deg)`, display: 'block' }}>
      {/* Stem */}
      <line x1="16" y1="27" x2="16" y2="9" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      {/* Arrowhead */}
      <path d="M9 17 L16 7 L23 17" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ── Roundabout SVG icon — circular arrow (CCW) with exit number ───────────────
function RoundaboutArrow({ exitNumber = 0, size = 36, color = 'white' }) {
  const cx = 18, cy = 18, r = 10;
  // SVG arc: counterclockwise 300° (leaving a gap at bottom for entry road)
  // Arc from (cx+r, cy) → same point minus a small gap, large arc, CCW sweep (0)
  // We use stroke-dasharray on the full circle to simulate the 300° arc
  const circ = 2 * Math.PI * r;
  const dashLen = circ * (300 / 360);
  const gapLen  = circ - dashLen;
  // Offset so the gap is at the bottom center
  const offset  = circ * (90 / 360) + gapLen / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        {/* CCW ring (gap at the bottom where the entry road is) */}
        <circle
          cx={cx} cy={cy} r={r}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${dashLen} ${gapLen}`}
          strokeDashoffset={offset}
          transform={`scale(-1,1) translate(-36,0)`}  /* flip X → makes it CCW visually */
        />
        {/* Arrowhead at top of circle, pointing left (CCW direction) */}
        <path d={`M ${cx-5} ${cy-r-3} L ${cx} ${cy-r} L ${cx-3} ${cy-r+5}`}
              stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Entry road from bottom */}
        <line x1={cx} y1="36" x2={cx} y2={cy+r+2}
              stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      {/* Exit number centred inside the circle */}
      {exitNumber > 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color, fontSize: Math.round(size * 0.36), fontWeight: 800, lineHeight: 1,
        }}>
          {exitNumber}
        </div>
      )}
    </div>
  );
}

// ── Address search input with Nominatim autocomplete ─────────────────────────
function AddressInput({ icon, value, onChange, onSelect, placeholder, inputRef }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const timerRef = useRef(null);

  const fetchSuggestions = useCallback(async (query) => {
    if (query.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=il&accept-language=he,en`
      );
      setSuggestions(await res.json());
    } catch { setSuggestions([]); }
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(val), 420);
  };

  const handleSelect = (item) => {
    const label = item.display_name.split(',').slice(0, 2).join(',').trim();
    onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label });
    onChange(label);
    setSuggestions([]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={s.inputRow}>
        <span style={{ fontSize: 13, marginRight: 8, userSelect: 'none' }}>{icon}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Escape' && setSuggestions([])}
          placeholder={placeholder}
          style={s.input}
          autoComplete="off"
        />
        {loading && <span style={{ color: '#bbb', fontSize: 11, paddingRight: 8 }}>…</span>}
        {value && (
          <button onClick={() => { onChange(''); onSelect(null); setSuggestions([]); }} style={s.clearBtn}>✕</button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div style={s.dropdown}>
          {suggestions.map((item, i) => (
            <div
              key={i}
              onMouseDown={() => handleSelect(item)}
              style={s.dropdownItem}
              onMouseEnter={e  => e.currentTarget.style.background = '#f0f4ff'}
              onMouseLeave={e  => e.currentTarget.style.background = 'white'}
            >
              <span style={{ color: '#007aff', marginRight: 8, fontSize: 12 }}>📍</span>
              <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{item.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (sec) => {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

// ── Instruction banner (top overlay) ─────────────────────────────────────────
function InstructionBanner({ instructions, isEmergency }) {
  if (!instructions?.length) return null;

  // Find the first non-START instruction (sign ≠ 0 at index 0 is the heading step)
  // instructions[0] = start heading; instructions[1] = first actual turn, etc.
  // We show instructions[1] (next maneuver) if it exists, else instructions[0].
  const next = instructions.length > 1 ? instructions[1] : instructions[0];
  if (!next) return null;

  const distStr = next.distanceMeters >= 1000
    ? `${(next.distanceMeters / 1000).toFixed(1)} ק"מ`
    : `${Math.round(next.distanceMeters)} מ'`;

  const isArrive = next.sign === 4;
  const isContraflow = isEmergency && next.contraflow;

  const bg      = isContraflow ? 'rgba(220,30,20,0.92)'
                : isEmergency  ? 'rgba(30,30,30,0.88)'
                               : 'rgba(30,30,30,0.88)';
  const border  = isContraflow ? '2px solid #ff6b6b' : 'none';

  const isRoundabout = next.sign === 6 || next.sign === -6;
  const iconColor    = isContraflow ? '#ffcdd2' : 'white';

  // Build instruction label
  let instrLabel;
  if (next.sign === 6) {
    instrLabel = next.exitNumber > 0
      ? `כיכר — יציאה ${next.exitNumber}`
      : 'היכנס לכיכר';
    if (next.streetName) instrLabel += ` → ${next.streetName}`;
  } else {
    instrLabel = signText(next.sign);
    if (next.streetName) instrLabel += ` — ${next.streetName}`;
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 16, right: 16,
      zIndex: 600,
      background: bg,
      border,
      borderRadius: 16,
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      backdropFilter: 'blur(6px)',
    }}>
      {/* Direction icon */}
      <div style={{ flexShrink: 0, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isRoundabout
          ? <RoundaboutArrow exitNumber={next.exitNumber ?? 0} size={36} color={iconColor} />
          : <TurnArrow sign={next.sign} size={34} color={iconColor} />
        }
      </div>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isArrive && (
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 }}>
            בעוד {distStr}
          </div>
        )}
        <div style={{
          color: 'white', fontSize: 15, fontWeight: 700,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {instrLabel}
        </div>
        {isContraflow && (
          <div style={{ color: '#ffcdd2', fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            ⚠️ פנייה מסוכנת — נסיעה נגד כיוון התנועה
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DriverView() {
  const [isEmergency,    setIsEmergency]    = useState(false);
  const [searchOpen,     setSearchOpen]     = useState(true);
  const [routeCoords,    setRouteCoords]    = useState([]);
  const [routeInfo,      setRouteInfo]      = useState(null);
  const [instructions,   setInstructions]   = useState([]);
  const [trafficSignals, setTrafficSignals] = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [activeCase,     setActiveCase]     = useState(null);
  const [arrivedAtScene, setArrivedAtScene] = useState(false);
  const [isLocForced,    setIsLocForced]    = useState(false);
  const forcedLocationRef = useRef(null);

  const [startText, setStartText] = useState('');
  const [endText,   setEndText]   = useState('');
  const [startPos,  setStartPos]  = useState(null);
  const [endPos,    setEndPos]    = useState(null);

  const endInputRef    = useRef(null);
  const prevCaseIdRef  = useRef(null);
  const [newCaseAlert,  setNewCaseAlert]  = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // Fetch traffic signals once at startup
  useEffect(() => {
    axios.get(`${API_BASE}/api/signals`)
      .then(res => setTrafficSignals(res.data))
      .catch(() => {});
  }, []);

  // Auto-GPS: set start position from device and update server every 30s
  useEffect(() => {
    const auth  = JSON.parse(localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    const update = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        // When manager has locked this ambulance's location, don't override startPos with GPS
        if (!forcedLocationRef.current) {
          const pos = { lat: coords.latitude, lon: coords.longitude, label: 'מיקום נוכחי' };
          setStartPos(pos);
          setStartText('📍 מיקום נוכחי');
        }
        if (ambId) {
          axios.post(`${API_BASE}/api/ambulances/location`, {
            ambulanceId: ambId, lat: coords.latitude, lon: coords.longitude,
          }).catch(() => {});
        }
      }, () => {});
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, []);

  // Poll own ambulance to detect manager-forced location lock/unlock
  useEffect(() => {
    const auth  = JSON.parse(localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId) return;
    const poll = () =>
      axios.get(`${API_BASE}/api/ambulances`)
        .then(r => {
          const amb = r.data.find(a => a.id === ambId);
          if (amb?.locationLocked) {
            const forced = { lat: amb.lat, lon: amb.lon, label: 'מיקום ידני' };
            const prev = forcedLocationRef.current;
            if (!prev || prev.lat !== forced.lat || prev.lon !== forced.lon) {
              forcedLocationRef.current = forced;
              setIsLocForced(true);
              setStartPos(forced);
              setStartText('🔒 מיקום ידני');
            }
          } else if (forcedLocationRef.current) {
            forcedLocationRef.current = null;
            setIsLocForced(false);
            // Restore GPS position
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(({ coords }) => {
                const pos = { lat: coords.latitude, lon: coords.longitude, label: 'מיקום נוכחי' };
                setStartPos(pos);
                setStartText('📍 מיקום נוכחי');
              }, () => {});
            }
          }
        })
        .catch(() => {});
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  // Poll active case for dispatcher updates every 5s
  useEffect(() => {
    const auth  = JSON.parse(localStorage.getItem('fastAuth') || '{}');
    const ambId = auth.ambulanceId;
    if (!ambId) return;
    const poll = () =>
      axios.get(`${API_BASE}/api/cases/active`, { params: { ambulanceId: ambId } })
        .then(r => {
          const c = r.data;
          if (c && c.status === 'cancelled') {
            setActiveCase(null);
            prevCaseIdRef.current = null;
            setRouteCoords([]);
            setRouteInfo(null);
            setInstructions([]);
            setEndPos(null);
            setEndText('');
            setSearchOpen(true);
          } else {
            setActiveCase(c);
          }
        })
        .catch(() => {});
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // Auto-navigate when dispatcher assigns a new case
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
  }, [activeCase]);

  // Auto-dismiss new case alert after 8s
  useEffect(() => {
    if (!newCaseAlert) return;
    const t = setTimeout(() => setNewCaseAlert(false), 8000);
    return () => clearTimeout(t);
  }, [newCaseAlert]);

  // Auto-route once both GPS position and destination are set
  useEffect(() => {
    if (startPos && endPos) fetchRoute(isEmergency, startPos, endPos);
  }, [startPos, endPos]); // eslint-disable-line

  const fetchRoute = useCallback(async (emergency, start, end) => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/route`, {
        params: {
          startLat: start.lat, startLon: start.lon,
          endLat:   end.lat,   endLon:   end.lon,
          isEmergency: emergency,
        }
      });
      if (data?.path) {
        setRouteCoords(data.path.map(p => [p.lat, p.lon]));
        setRouteInfo({ distance: data.totalDistanceMeters, time: data.estimatedTimeSeconds });
        setInstructions(data.instructions ?? []);
        setSearchOpen(false);
      }
    } catch {
      setError('Could not calculate route.');
    }
    setLoading(false);
  }, []);

  const handleSelectStart = (pos) => {
    setStartPos(pos);
    if (pos) setTimeout(() => endInputRef.current?.focus(), 50);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lon: coords.longitude, label: 'My Location' };
        setStartPos(pos);
        setStartText('My Location');
      },
      () => setError('Location access denied.')
    );
  };

  const toggleEmergency = () => {
    const next = !isEmergency;
    setIsEmergency(next);
    if (startPos && endPos) fetchRoute(next, startPos, endPos);
  };

  const handleCancelRequest = async () => {
    if (!activeCase) return;
    try {
      await axios.post(`${API_BASE}/api/cases/cancel-request`, { caseId: activeCase.id });
      setCancelConfirm(false);
    } catch {}
  };

  const handleArrived = async () => {
    if (!activeCase) return;
    try {
      await axios.post(`${API_BASE}/api/cases/arrive`, { caseId: activeCase.id });
      setArrivedAtScene(true);
    } catch {}
  };

  const canNavigate = startPos && endPos && !loading;

  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', overflow: 'hidden',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Full-screen map ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapDisplay
          routeCoordinates={routeCoords}
          startPos={startPos ? [startPos.lat, startPos.lon] : null}
          endPos={endPos     ? [endPos.lat,   endPos.lon]   : null}
          isEmergency={isEmergency}
          trafficSignals={trafficSignals}
        />
      </div>

      {/* ── Instruction banner (top) ── */}
      {instructions.length > 0 && (
        <InstructionBanner instructions={instructions} isEmergency={isEmergency} />
      )}

      {/* ── Forced location notice (only when not navigating, to avoid overlap) ── */}
      {isLocForced && !instructions.length && (
        <div style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          left: 16, right: 16,
          background: 'rgba(122, 89, 0, 0.90)',
          backdropFilter: 'blur(6px)',
          borderRadius: 14, padding: '10px 16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 590, direction: 'rtl',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
          <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>מיקום הוגדר ידנית על-ידי המנהל</div>
        </div>
      )}

      {/* ── Dispatcher notes banner (last update only) ── */}
      {activeCase?.notes && (() => { const last = activeCase.notes.split('\n').filter(Boolean).pop(); return last ? (
        <div style={{
          position: 'absolute',
          top: instructions.length > 0
            ? 'calc(env(safe-area-inset-top, 0px) + 102px)'
            : 'calc(env(safe-area-inset-top, 0px) + 16px)',
          left: 16, right: 16,
          background: 'rgba(255, 149, 0, 0.94)',
          backdropFilter: 'blur(6px)',
          borderRadius: 14,
          padding: '10px 16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 590,
          direction: 'rtl',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 11, marginBottom: 3, opacity: 0.85 }}>עדכון מוקד</div>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>{last}</div>
          </div>
        </div>
      ) : null; })()}

      {/* ── New case alert overlay ── */}
      {newCaseAlert && activeCase && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
          onClick={() => setNewCaseAlert(false)}
        >
          <div style={{
            background: 'white',
            borderRadius: 22,
            padding: '28px 26px 22px',
            maxWidth: 360, width: '100%',
            boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
            direction: 'rtl',
            animation: 'slideUp 0.3s ease',
          }}
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div style={{ textAlign: 'center', fontSize: 52, lineHeight: 1, marginBottom: 14 }}>
              {activeCase.urgency === 'emergency' ? '🚨' : '📋'}
            </div>

            {/* Title */}
            <div style={{
              textAlign: 'center',
              fontSize: 20, fontWeight: 800,
              color: activeCase.urgency === 'emergency' ? '#ff3b30' : '#1a1a2e',
              marginBottom: 6,
            }}>
              קריאה חדשה התקבלה
            </div>

            {/* Urgency badge */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <span style={{
                display: 'inline-block',
                background: activeCase.urgency === 'emergency' ? '#fff0ef' : '#f0f9f0',
                color: activeCase.urgency === 'emergency' ? '#ff3b30' : '#34c759',
                border: `1.5px solid ${activeCase.urgency === 'emergency' ? '#ff3b30' : '#34c759'}`,
                borderRadius: 20, padding: '2px 12px',
                fontSize: 12, fontWeight: 700,
              }}>
                {activeCase.urgency === 'emergency' ? 'חירום' : 'שגרה'}
              </span>
            </div>

            {/* Address */}
            <div style={{
              background: '#f5f7fa', borderRadius: 12, padding: '12px 14px',
              marginBottom: 12,
            }}>
              <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 600 }}>כתובת האירוע</div>
              <div style={{ color: '#1a1a2e', fontSize: 15, fontWeight: 700 }}>{activeCase.address}</div>
            </div>

            {/* Patient details */}
            {activeCase.patientDetails && (
              <div style={{
                background: '#f5f7fa', borderRadius: 12, padding: '10px 14px',
                marginBottom: 12,
              }}>
                <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 600 }}>פרטי מטופל</div>
                <div style={{ color: '#333', fontSize: 13 }}>{activeCase.patientDetails}</div>
              </div>
            )}

            {/* Auto-nav notice */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              color: '#007aff', fontSize: 13, fontWeight: 600, marginBottom: 20,
            }}>
              <span style={{ fontSize: 16 }}>🧭</span>
              <span>הניווט מתחיל אוטומטית…</span>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setNewCaseAlert(false)}
              style={{
                width: '100%', padding: '13px',
                background: activeCase.urgency === 'emergency'
                  ? 'linear-gradient(135deg,#ff3b30,#ff6b35)'
                  : 'linear-gradient(135deg,#007aff,#5ac8fa)',
                color: 'white', border: 'none', borderRadius: 14,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              הבנתי, נווט
            </button>
          </div>
        </div>
      )}

      {/* ── Cancel confirmation overlay ── */}
      {cancelConfirm && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 710,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 22,
            padding: '28px 26px 22px',
            maxWidth: 320, width: '100%',
            boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
            direction: 'rtl',
            animation: 'slideUp 0.3s ease',
          }}>
            <div style={{ textAlign: 'center', fontSize: 48, lineHeight: 1, marginBottom: 14 }}>⚠️</div>
            <div style={{
              textAlign: 'center', fontSize: 19, fontWeight: 800,
              color: '#1a1a2e', marginBottom: 8,
            }}>
              ביטול נסיעה
            </div>
            <div style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 }}>
              שליחת בקשת ביטול למוקדן. האם להמשיך?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCancelConfirm(false)}
                style={{
                  flex: 1, padding: '13px',
                  background: '#f5f7fa', border: '1px solid #e8eaed',
                  borderRadius: 14, cursor: 'pointer',
                  fontWeight: 600, fontSize: 14, color: '#555',
                }}
              >
                לא
              </button>
              <button
                onClick={handleCancelRequest}
                style={{
                  flex: 1, padding: '13px',
                  background: 'linear-gradient(135deg,#ff3b30,#ff6b35)',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, color: 'white',
                }}
              >
                כן, בטל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom sheet ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'white',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        zIndex: 500,
        transition: 'all 0.3s ease',
      }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e0' }} />
        </div>

        {/* ── ROUTE INFO strip ── */}
        {routeInfo && (
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            padding: '6px 12px 8px',
            borderBottom: '1px solid #f0f0f0',
          }}>
            <StatBlock value={fmtDist(routeInfo.distance)} label="מרחק" color="#007aff" />
            <div style={{ width: 1, height: 24, background: '#f0f0f0' }} />
            <StatBlock value={fmtTime(routeInfo.time)} label="זמן הגעה" color={isEmergency ? '#ff3b30' : '#34c759'} />
            <div style={{ width: 1, height: 24, background: '#f0f0f0' }} />
            <StatBlock value={isEmergency ? '🚨' : '🚗'} label={isEmergency ? 'חירום' : 'שגרה'} color="#aaa" large />
          </div>
        )}

        {/* ── SEARCH PANEL (collapsible) ── */}
        <div style={{
          overflow: 'hidden',
          maxHeight: searchOpen ? '320px' : '0px',
          transition: 'max-height 0.35s ease',
        }}>
          <div style={{ padding: '14px 20px 6px' }}>
            {/* Start row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <AddressInput
                  icon="🟢"
                  value={startText}
                  onChange={setStartText}
                  onSelect={handleSelectStart}
                  placeholder="נקודת מוצא…"
                />
              </div>
              <button onClick={handleUseMyLocation} title="Use current location" style={s.iconBtn}>
                📍
              </button>
            </div>

            {/* Destination row */}
            <AddressInput
              icon="🔴"
              value={endText}
              onChange={setEndText}
              onSelect={(pos) => setEndPos(pos)}
              placeholder="יעד…"
              inputRef={endInputRef}
            />

            {/* Navigate button */}
            <button
              onClick={() => fetchRoute(isEmergency, startPos, endPos)}
              disabled={!canNavigate}
              style={{
                ...s.navBtn,
                marginTop: 12,
                background: canNavigate
                  ? (isEmergency ? 'linear-gradient(135deg,#ff3b30,#ff6b35)' : 'linear-gradient(135deg,#007aff,#5ac8fa)')
                  : '#f0f0f0',
                color: canNavigate ? 'white' : '#bbb',
                cursor: canNavigate ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? '⏳  מחשב…' : '▶  נווט'}
            </button>

            {error && (
              <div style={{ color: '#ff3b30', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{error}</div>
            )}
          </div>
        </div>

        {/* ── ARRIVE AT SCENE ── */}
        {activeCase && activeCase.status === 'active' && (
          <div style={{ padding: '0 16px 10px' }}>
            {!arrivedAtScene ? (
              <button
                onClick={handleArrived}
                style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(135deg,#34c759,#28a745)',
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, color: 'white',
                }}
              >
                ✓ הגעתי לאירוע
              </button>
            ) : (
              <div style={{
                width: '100%', padding: '11px',
                background: '#e6f9ec', border: '1.5px solid #34c759',
                borderRadius: 12, textAlign: 'center',
                fontWeight: 600, fontSize: 13, color: '#34c759',
              }}>
                ✓ הגעה לאירוע נרשמה
              </div>
            )}
          </div>
        )}

        {/* ── BOTTOM BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={() => setSearchOpen(o => !o)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              background: '#f5f7fa', border: '1px solid #e8eaed',
              borderRadius: 12, padding: '12px 16px', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#eef1f7'}
            onMouseLeave={e => e.currentTarget.style.background = '#f5f7fa'}
          >
            <span style={{ fontSize: 18 }}>{searchOpen ? '✕' : '🔍'}</span>
            <span style={{ fontSize: 14, color: '#555', fontWeight: 500 }}>
              {searchOpen ? 'סגור' : (routeInfo ? 'שנה מסלול' : 'לאן?')}
            </span>
          </button>

          {/* Emergency toggle */}
          <button
            onClick={toggleEmergency}
            style={{
              padding: '12px 16px',
              background: isEmergency ? '#fff0ef' : '#f0f9f0',
              border: `1.5px solid ${isEmergency ? '#ff3b30' : '#34c759'}`,
              borderRadius: 12, cursor: 'pointer',
              fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
              color: isEmergency ? '#ff3b30' : '#34c759',
              whiteSpace: 'nowrap',
              transition: 'all 0.25s',
              animation: isEmergency ? 'emergencyPulse 1.4s ease-in-out infinite' : 'none',
            }}
          >
            {isEmergency ? '🚨 חירום' : '✓ שגרה'}
          </button>

          {/* Cancel trip — shown when an active case is assigned */}
          {activeCase && activeCase.status === 'active' && (
            <button
              onClick={() => setCancelConfirm(true)}
              style={{
                padding: '12px 14px',
                background: '#fff0ef',
                border: '1.5px solid #ff3b30',
                borderRadius: 12, cursor: 'pointer',
                fontWeight: 700, fontSize: 12,
                color: '#ff3b30',
                whiteSpace: 'nowrap',
              }}
            >
              ביטול נסיעה
            </button>
          )}

          {/* Cancel pending indicator */}
          {activeCase && activeCase.status === 'cancel_requested' && (
            <div style={{
              padding: '10px 12px',
              background: '#fff8e1',
              border: '1.5px solid #ff9500',
              borderRadius: 12,
              fontWeight: 600, fontSize: 11,
              color: '#ff9500',
              whiteSpace: 'nowrap',
            }}>
              ⏳ בקשת ביטול נשלחה
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes emergencyPulse {
          0%,100% { box-shadow: 0 0 0px rgba(255,59,48,0); }
          50%      { box-shadow: 0 0 10px rgba(255,59,48,0.6); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: #bbb; }
      `}</style>
    </div>
  );
}

function StatBlock({ value, label, color, large }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 54 }}>
      <div style={{ color, fontSize: large ? 17 : 15, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      <div style={{ color: '#999', fontSize: 10, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const s = {
  inputRow: {
    display: 'flex', alignItems: 'center',
    background: '#f5f7fa',
    border: '1px solid #e8eaed',
    borderRadius: 10, padding: '0 10px',
  },
  input: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: '#1a1a2e', padding: '12px 0', fontSize: 14,
  },
  clearBtn: {
    background: 'none', border: 'none', color: '#ccc',
    cursor: 'pointer', fontSize: 12, padding: '0 2px',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: 'white',
    border: '1px solid #e8eaed',
    borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 600, maxHeight: 220, overflowY: 'auto',
    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
  },
  dropdownItem: {
    display: 'flex', alignItems: 'flex-start',
    padding: '10px 12px', cursor: 'pointer',
    borderTop: '1px solid #f5f5f5',
    background: 'white', transition: 'background 0.15s',
  },
  iconBtn: {
    padding: '0 13px', background: '#f5f7fa',
    border: '1px solid #e8eaed', borderRadius: 10,
    fontSize: 18, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  navBtn: {
    width: '100%', padding: '13px',
    fontWeight: 700, fontSize: 14, letterSpacing: 0.3,
    border: 'none', borderRadius: 12,
    transition: 'opacity 0.2s',
  },
};
