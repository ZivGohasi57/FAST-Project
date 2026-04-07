import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import MapDisplay from '../components/MapDisplay';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const API_BASE  = 'http://localhost:8082';

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
      position: 'absolute', top: 16, left: 16, right: 16,
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

  const [startText, setStartText] = useState('');
  const [endText,   setEndText]   = useState('');
  const [startPos,  setStartPos]  = useState(null);
  const [endPos,    setEndPos]    = useState(null);

  const endInputRef = useRef(null);

  // Fetch traffic signals once at startup
  useEffect(() => {
    axios.get(`${API_BASE}/api/signals`)
      .then(res => setTrafficSignals(res.data))
      .catch(() => {}); // non-critical, fail silently
  }, []);

  // Auto-route once both points selected
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

  const canNavigate = startPos && endPos && !loading;

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden',
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

        {/* ── BOTTOM BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 16px' }}>
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
        </div>
      </div>

      <style>{`
        @keyframes emergencyPulse {
          0%,100% { box-shadow: 0 0 0px rgba(255,59,48,0); }
          50%      { box-shadow: 0 0 10px rgba(255,59,48,0.6); }
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
