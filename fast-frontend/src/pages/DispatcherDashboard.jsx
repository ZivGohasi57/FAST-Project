import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { API_BASE } from '../config.js';
const NOMINATIM  = 'https://nominatim.openstreetmap.org/search';
const MAP_CENTER = [32.1501, 34.8914]; // Hod HaSharon

// ── Icons ──────────────────────────────────────────────────────────────────────
const makeAmbIcon = (gradient) => L.divIcon({
  className: '',
  html: `<div style="width:36px;height:36px;border-radius:50%;background:${gradient};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2.5px white;">🚑</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
});
const iconAvailable = makeAmbIcon('linear-gradient(135deg,#34c759,#28a745)');
const iconBusy      = makeAmbIcon('linear-gradient(135deg,#ff9500,#e67e00)');
const iconEvent     = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#ff3b30,#ff6b35);display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2.5px white;">📍</div>`,
  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
});

// ── Auto-fit map bounds ────────────────────────────────────────────────────────
function AutoFit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
  }, [JSON.stringify(points)]); // eslint-disable-line
  return null;
}

// ── Format ETA seconds → "5:30 דק'" ──────────────────────────────────────────
const fmtETA = (sec) => {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')} דק'` : `${s}ש'`;
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function DispatcherDashboard() {
  const [ambulances,    setAmbulances]    = useState([]);
  const [address,       setAddress]       = useState('');
  const [suggestions,   setSuggestions]   = useState([]);
  const [eventPos,      setEventPos]      = useState(null);
  const [form,          setForm]          = useState({ patientDetails: '', description: '', urgency: 'emergency', notes: '' });
  const [etaResults,    setEtaResults]    = useState([]);
  const [activeCase,    setActiveCase]    = useState(null);
  const [assignedRoute, setAssignedRoute] = useState([]);
  const [updateText,    setUpdateText]    = useState('');
  const [updateSent,    setUpdateSent]    = useState(false);
  const [loadingEta,    setLoadingEta]    = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [error,         setError]         = useState('');
  const searchTimer = useRef(null);

  // ── Poll ambulances every 5s ───────────────────────────────────────────────
  useEffect(() => {
    const fetch = () =>
      axios.get(`${API_BASE}/api/ambulances`).then(r => setAmbulances(r.data)).catch(() => {});
    fetch();
    const iv = setInterval(fetch, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Address autocomplete ───────────────────────────────────────────────────
  const onAddressChange = (val) => {
    setAddress(val);
    setEventPos(null);
    setSuggestions([]);
    clearTimeout(searchTimer.current);
    if (val.length < 3) return;
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}?q=${encodeURIComponent(val)}&format=json&limit=5&countrycodes=il&accept-language=he,en`
        );
        setSuggestions(await res.json());
      } catch {}
    }, 420);
  };

  const selectSuggestion = (item) => {
    const label = item.display_name.split(',').slice(0, 2).join(',').trim();
    setEventPos({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label });
    setAddress(label);
    setSuggestions([]);
  };

  // ── Get ETAs ───────────────────────────────────────────────────────────────
  const handleGetETAs = async () => {
    if (!eventPos) { setError('יש לבחור כתובת מהרשימה'); return; }
    setError('');
    setLoadingEta(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/eta`, {
        params: { endLat: eventPos.lat, endLon: eventPos.lon },
      });
      setEtaResults(data);
    } catch { setError('שגיאה בחישוב זמני הגעה'); }
    setLoadingEta(false);
  };

  // ── Assign ambulance ───────────────────────────────────────────────────────
  const handleAssign = async (ambulanceId, driverName) => {
    setLoadingAssign(true);
    setError('');
    try {
      const { data: caseData } = await axios.post(`${API_BASE}/api/cases`, {
        address:        eventPos.label,
        lat:            eventPos.lat,
        lon:            eventPos.lon,
        description:    form.description,
        patientDetails: form.patientDetails,
        urgency:        form.urgency,
        notes:          form.notes,
      });
      await axios.post(`${API_BASE}/api/cases/assign`, { caseId: caseData.id, ambulanceId });
      setActiveCase({ ...caseData, assignedAmbulanceId: ambulanceId, assignedDriverName: driverName });

      const amb = ambulances.find(a => a.id === ambulanceId);
      if (amb) {
        const { data: route } = await axios.get(`${API_BASE}/api/route`, {
          params: {
            startLat: amb.lat, startLon: amb.lon,
            endLat: eventPos.lat, endLon: eventPos.lon,
            isEmergency: form.urgency === 'emergency',
          },
        });
        if (route?.path) setAssignedRoute(route.path.map(p => [p.lat, p.lon]));
      }
    } catch { setError('שגיאה בהפניית האמבולנס'); }
    setLoadingAssign(false);
  };

  // ── Send patient condition update to crew ──────────────────────────────────
  const handleSendUpdate = async () => {
    if (!activeCase || !updateText.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/cases/update`, {
        caseId: activeCase.id,
        notes:  updateText.trim(),
      });
      setUpdateText('');
      setUpdateSent(true);
      setTimeout(() => setUpdateSent(false), 2500);
    } catch { setError('שגיאה בשליחת עדכון'); }
  };

  // ── Complete case ──────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!activeCase) return;
    try {
      await axios.post(`${API_BASE}/api/cases/complete`, { caseId: activeCase.id });
      setActiveCase(null);
      setAssignedRoute([]);
      setEtaResults([]);
      setEventPos(null);
      setAddress('');
      setForm({ patientDetails: '', description: '', urgency: 'emergency', notes: '' });
    } catch { setError('שגיאה בסיום קריאה'); }
  };

  const mapPoints = [
    ...ambulances.map(a => [a.lat, a.lon]),
    ...(eventPos ? [[eventPos.lat, eventPos.lon]] : []),
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', direction: 'rtl' }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div style={{ width: 380, background: '#f8f9fb', borderLeft: '1px solid #e8eaed', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ background: '#1a1a2e', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>🚑</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>מוקד פיקוד</div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>FAST Dispatch</div>
          </div>
          <div style={{ marginRight: 'auto', textAlign: 'left' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{ambulances.filter(a => a.status === 'available').length}</div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>זמינים</div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fff0ef', color: '#c0392b', padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #ffd5d0', flexShrink: 0 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Case Form (hidden after assignment) ─── */}
        {!activeCase && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={s.sectionTitle}>קריאה חדשה</div>

            {/* Address with autocomplete */}
            <div>
              <label style={s.label}>כתובת האירוע</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={address}
                  onChange={e => onAddressChange(e.target.value)}
                  placeholder="הכנס כתובת..."
                  style={{ ...s.input, borderColor: eventPos ? '#34c759' : '#e8eaed', paddingLeft: eventPos ? 32 : 12 }}
                />
                {eventPos && (
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#34c759', fontSize: 14 }}>✓</span>
                )}
                {suggestions.length > 0 && (
                  <div style={s.dropdown}>
                    {suggestions.map((item, i) => (
                      <div
                        key={i}
                        onMouseDown={() => selectSuggestion(item)}
                        style={s.dropdownItem}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <span style={{ color: '#ff3b30', marginLeft: 8, flexShrink: 0 }}>📍</span>
                        <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>
                          {item.display_name.split(',').slice(0, 3).join(',')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Patient details */}
            <div>
              <label style={s.label}>פרטי המטופל</label>
              <textarea
                value={form.patientDetails}
                onChange={e => setForm(f => ({ ...f, patientDetails: e.target.value }))}
                placeholder="גיל, מצב, תסמינים..."
                rows={2}
                style={{ ...s.input, resize: 'none', paddingTop: 10 }}
              />
            </div>

            {/* Description */}
            <div>
              <label style={s.label}>תיאור האירוע</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="תיאור קצר של האירוע..."
                style={s.input}
              />
            </div>

            {/* Urgency toggle */}
            <div>
              <label style={s.label}>דחיפות</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { val: 'emergency', label: '🚨 חירום',  active: '#ff3b30' },
                  { val: 'routine',   label: '🚗 שגרה',   active: '#34c759' },
                ].map(({ val, label, active }) => (
                  <button
                    key={val}
                    onClick={() => setForm(f => ({ ...f, urgency: val }))}
                    style={{
                      flex: 1, padding: '10px 0', border: '1.5px solid',
                      borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      fontFamily: 'inherit',
                      borderColor: form.urgency === val ? active : '#e8eaed',
                      background:  form.urgency === val ? `${active}18` : 'white',
                      color:       form.urgency === val ? active : '#888',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Initial notes to crew */}
            <div>
              <label style={s.label}>הוראות ראשוניות לצוות</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="הוראות לצוות האמבולנס..."
                style={s.input}
              />
            </div>

            <button
              onClick={handleGetETAs}
              disabled={!eventPos || loadingEta}
              style={{
                ...s.btn,
                background: eventPos ? '#1a1a2e' : '#e0e0e0',
                color:      eventPos ? 'white'   : '#aaa',
                cursor:     eventPos ? 'pointer' : 'not-allowed',
              }}
            >
              {loadingEta ? '⏳ מחשב זמני הגעה...' : '📡 קבל זמני הגעה'}
            </button>
          </div>
        )}

        {/* ── ETA Results ─────────────────────────────────────────────────────── */}
        {etaResults.length > 0 && !activeCase && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={s.sectionTitle}>בחר אמבולנס</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {etaResults.map(row => (
                <div
                  key={row.ambulanceId}
                  style={{
                    background: 'white', borderRadius: 12, padding: '12px 14px',
                    border: '1px solid #e8eaed',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>🚑 {row.driverName}</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span style={{ fontSize: 12, color: '#555' }}>
                        🚗 <b style={{ color: '#007aff' }}>{fmtETA(row.routineEtaSec)}</b>
                      </span>
                      <span style={{ fontSize: 12, color: '#555' }}>
                        🚨 <b style={{ color: '#ff3b30' }}>{fmtETA(row.emergencyEtaSec)}</b>
                      </span>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 5, color: row.status === 'available' ? '#34c759' : '#ff9500', fontWeight: 600 }}>
                      ● {row.status === 'available' ? 'זמין' : 'עסוק'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAssign(row.ambulanceId, row.driverName)}
                    disabled={loadingAssign || row.status !== 'available'}
                    style={{
                      padding: '9px 16px', border: 'none', borderRadius: 10,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      background: row.status === 'available' ? '#ff3b30' : '#e0e0e0',
                      color:      row.status === 'available' ? 'white'   : '#aaa',
                    }}
                  >
                    {loadingAssign ? '...' : 'הפנה'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active Case Panel ────────────────────────────────────────────────── */}
        {activeCase && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Case summary */}
            <div style={{ background: '#fff8e1', border: '1px solid #ffcc02', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#7a5900', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🚨</span> קריאה פעילה — {activeCase.id}
              </div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                <div>📍 {activeCase.address}</div>
                <div>🚑 נהג: <b>{activeCase.assignedDriverName}</b></div>
                {activeCase.patientDetails && <div>👤 {activeCase.patientDetails}</div>}
                {activeCase.urgency === 'emergency'
                  ? <div style={{ color: '#ff3b30', fontWeight: 600 }}>🚨 חירום</div>
                  : <div style={{ color: '#34c759', fontWeight: 600 }}>🚗 שגרה</div>
                }
              </div>
            </div>

            {/* Patient update */}
            <div style={s.sectionTitle}>עדכון מצב לצוות</div>
            <textarea
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              placeholder="שלח עדכון על מצב המטופל לצוות האמבולנס..."
              rows={3}
              style={{ ...s.input, resize: 'none', paddingTop: 10 }}
            />
            <button
              onClick={handleSendUpdate}
              disabled={!updateText.trim()}
              style={{
                ...s.btn,
                background: updateText.trim() ? '#007aff' : '#e0e0e0',
                color:      updateText.trim() ? 'white'   : '#aaa',
                cursor:     updateText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {updateSent ? '✓ נשלח בהצלחה' : '📤 שלח עדכון לצוות'}
            </button>

            <div style={{ width: '100%', height: 1, background: '#e8eaed' }} />

            <button
              onClick={handleComplete}
              style={{ ...s.btn, background: '#1a1a2e', color: 'white', cursor: 'pointer' }}
            >
              ✅ סיים קריאה
            </button>
          </div>
        )}
      </div>

      {/* ── MAP ─────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={MAP_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {mapPoints.length > 0 && <AutoFit points={mapPoints} />}

          {/* Ambulance markers */}
          {ambulances.map(amb => (
            <Marker
              key={amb.id}
              position={[amb.lat, amb.lon]}
              icon={amb.status === 'available' ? iconAvailable : iconBusy}
            >
              <Popup>
                <div style={{ direction: 'rtl', minWidth: 130, fontSize: 13 }}>
                  <b>{amb.driverName}</b><br />
                  <span style={{ color: amb.status === 'available' ? '#34c759' : '#ff9500', fontWeight: 600 }}>
                    ● {amb.status === 'available' ? 'זמין' : 'עסוק'}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Event location */}
          {eventPos && (
            <Marker position={[eventPos.lat, eventPos.lon]} icon={iconEvent}>
              <Popup>
                <div style={{ direction: 'rtl', fontSize: 13 }}>
                  <b>📍 מיקום האירוע</b><br />
                  <span style={{ color: '#666' }}>{eventPos.label}</span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route of assigned ambulance */}
          {assignedRoute.length > 0 && (
            <>
              <Polyline positions={assignedRoute} color="#007aff" weight={8}  opacity={0.2} />
              <Polyline positions={assignedRoute} color="#007aff" weight={4}  opacity={0.9} />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  label: {
    display: 'block', fontSize: 12, color: '#666', marginBottom: 5, fontWeight: 600,
  },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e8eaed', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', background: 'white',
    direction: 'rtl',
  },
  btn: {
    width: '100%', padding: '12px 0', border: 'none',
    borderRadius: 10, fontWeight: 700, fontSize: 14,
    fontFamily: 'inherit', transition: 'opacity 0.2s',
  },
  dropdown: {
    position: 'absolute', top: '100%', right: 0, left: 0,
    background: 'white', border: '1px solid #e8eaed',
    borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 600, maxHeight: 200, overflowY: 'auto',
    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
  },
  dropdownItem: {
    display: 'flex', alignItems: 'flex-start',
    padding: '10px 12px', cursor: 'pointer',
    borderTop: '1px solid #f5f5f5', background: 'white',
  },
};
