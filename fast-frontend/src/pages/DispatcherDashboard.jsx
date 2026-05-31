import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { API_BASE } from '../config.js';
const NOMINATIM  = 'https://nominatim.openstreetmap.org/search';
const MAP_CENTER = [32.1501, 34.8914];

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

function AutoFit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
  }, [JSON.stringify(points)]); // eslint-disable-line
  return null;
}

const fmtETA = (sec) => {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')} דק'` : `${s}ש'`;
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

export default function DispatcherDashboard() {
  const isMobile = useIsMobile();
  const [showMap,       setShowMap]       = useState(false);
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
  const [tab,           setTab]           = useState('new');
  const [missions,      setMissions]      = useState([]);
  const searchTimer        = useRef(null);
  const missionsFetchedRef = useRef(false);

  useEffect(() => {
    const fetch = () =>
      axios.get(`${API_BASE}/api/ambulances`).then(r => setAmbulances(r.data)).catch(() => {});
    fetch();
    const iv = setInterval(fetch, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchMissions = () =>
      axios.get(`${API_BASE}/api/cases`)
        .then(r => {
          const active = r.data.filter(c => c.status === 'active' || c.status === 'cancel_requested');
          setMissions(active);
          // On first load, restore activeCase from Firestore if session was lost (e.g. page refresh)
          if (!missionsFetchedRef.current) {
            missionsFetchedRef.current = true;
            if (active.length > 0) {
              setActiveCase(prev => prev ?? active[0]);
            }
          }
        })
        .catch(() => { missionsFetchedRef.current = true; });
    fetchMissions();
    const iv = setInterval(fetchMissions, 5000);
    return () => clearInterval(iv);
  }, []);

  const onAddressChange = (val) => {
    setAddress(val); setEventPos(null); setSuggestions([]);
    clearTimeout(searchTimer.current);
    if (val.length < 3) return;
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${NOMINATIM}?q=${encodeURIComponent(val)}&format=json&limit=5&countrycodes=il&accept-language=he,en`);
        setSuggestions(await res.json());
      } catch {}
    }, 420);
  };

  const selectSuggestion = (item) => {
    const label = item.display_name.split(',').slice(0, 2).join(',').trim();
    setEventPos({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label });
    setAddress(label); setSuggestions([]);
  };

  const handleGetETAs = async () => {
    if (!eventPos) { setError('יש לבחור כתובת מהרשימה'); return; }
    setError(''); setLoadingEta(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/eta`, { params: { endLat: eventPos.lat, endLon: eventPos.lon } });
      setEtaResults(data);
    } catch { setError('שגיאה בחישוב זמני הגעה'); }
    setLoadingEta(false);
  };

  const handleAssign = async (ambulanceId, driverName, ambulanceNumber) => {
    setLoadingAssign(true); setError('');
    try {
      const { data: caseData } = await axios.post(`${API_BASE}/api/cases`, {
        address: eventPos.label, lat: eventPos.lat, lon: eventPos.lon,
        description: form.description, patientDetails: form.patientDetails,
        urgency: form.urgency, notes: form.notes,
      });
      await axios.post(`${API_BASE}/api/cases/assign`, { caseId: caseData.id, ambulanceId });
      setActiveCase({ ...caseData, assignedAmbulanceId: ambulanceId, assignedDriverName: driverName, assignedAmbulanceNumber: ambulanceNumber });
      const amb = ambulances.find(a => a.id === ambulanceId);
      if (amb) {
        const { data: route } = await axios.get(`${API_BASE}/api/route`, {
          params: { startLat: amb.lat, startLon: amb.lon, endLat: eventPos.lat, endLon: eventPos.lon, isEmergency: form.urgency === 'emergency' },
        });
        if (route?.path) setAssignedRoute(route.path.map(p => [p.lat, p.lon]));
      }
      if (isMobile) setShowMap(true);
    } catch { setError('שגיאה בהפניית האמבולנס'); }
    setLoadingAssign(false);
  };

  const handleSendUpdate = async () => {
    if (!activeCase || !updateText.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/cases/update`, { caseId: activeCase.id, notes: updateText.trim() });
      setUpdateText(''); setUpdateSent(true);
      setTimeout(() => setUpdateSent(false), 2500);
    } catch { setError('שגיאה בשליחת עדכון'); }
  };

  const handleComplete = async () => {
    if (!activeCase) return;
    try {
      await axios.post(`${API_BASE}/api/cases/complete`, { caseId: activeCase.id });
      setActiveCase(null); setAssignedRoute([]); setEtaResults([]);
      setEventPos(null); setAddress('');
      setForm({ patientDetails: '', description: '', urgency: 'emergency', notes: '' });
      if (isMobile) setShowMap(false);
    } catch { setError('שגיאה בסיום קריאה'); }
  };

  const handleCancelCase = async (caseId) => {
    try {
      await axios.post(`${API_BASE}/api/cases/cancel`, { caseId });
      setMissions(prev => prev.filter(m => m.id !== caseId));
      if (activeCase?.id === caseId) {
        setActiveCase(null); setAssignedRoute([]); setEtaResults([]);
        setEventPos(null); setAddress('');
        setForm({ patientDetails: '', description: '', urgency: 'emergency', notes: '' });
        if (isMobile) setShowMap(false);
      }
    } catch { setError('שגיאה בביטול קריאה'); }
  };

  const mapPoints = [
    ...ambulances.map(a => [a.lat, a.lon]),
    ...(eventPos ? [[eventPos.lat, eventPos.lon]] : []),
  ];

  const panelStyle = {
    width: isMobile ? '100%' : 380,
    display: isMobile && showMap ? 'none' : 'flex',
    flexDirection: 'column',
    background: '#f8f9fb',
    borderLeft: isMobile ? 'none' : '1px solid #e8eaed',
    overflowY: 'auto',
    height: '100dvh',
  };

  const mapStyle = {
    flex: isMobile ? 'unset' : 1,
    width: isMobile ? '100%' : undefined,
    height: isMobile ? '100dvh' : undefined,
    display: isMobile && !showMap ? 'none' : 'block',
    position: 'relative',
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', direction: 'rtl' }}>

      {/* ── PANEL ── */}
      <div style={panelStyle}>
        <div style={{ background: '#1a1a2e', color: 'white', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)', paddingBottom: 14, paddingLeft: 18, paddingRight: 18, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>🚑</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>מוקד פיקוד</div>
            <div style={{ fontSize: 10, opacity: 0.55 }}>FAST Dispatch</div>
          </div>
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{ambulances.filter(a => a.status === 'available').length}</div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>זמינים</div>
            </div>
            {isMobile && (
              <button onClick={() => setShowMap(true)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: 'white', fontSize: 20, padding: '4px 10px', cursor: 'pointer' }}>
                🗺
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fff0ef', color: '#c0392b', padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #ffd5d0', flexShrink: 0 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
          {[
            { id: 'new',      label: 'קריאה חדשה',    icon: '➕' },
            { id: 'missions', label: 'משימות פעילות', icon: '🚑',
              badge: missions.filter(m => m.status === 'cancel_requested').length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '11px 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#1a1a2e' : '#888',
              borderBottom: tab === t.id ? '2px solid #1a1a2e' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              position: 'relative',
            }}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span style={{
                  background: '#ff3b30', color: 'white',
                  borderRadius: 10, padding: '0 6px',
                  fontSize: 11, fontWeight: 700, lineHeight: '18px', minWidth: 18,
                  display: 'inline-block', textAlign: 'center',
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'new' && !activeCase && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={s.sectionTitle}>קריאה חדשה</div>

            <div>
              <label style={s.label}>כתובת האירוע</label>
              <div style={{ position: 'relative' }}>
                <input value={address} onChange={e => onAddressChange(e.target.value)} placeholder="הכנס כתובת..."
                  style={{ ...s.input, borderColor: eventPos ? '#34c759' : '#e8eaed', paddingLeft: eventPos ? 32 : 12 }} />
                {eventPos && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#34c759', fontSize: 14 }}>✓</span>}
                {suggestions.length > 0 && (
                  <div style={s.dropdown}>
                    {suggestions.map((item, i) => (
                      <div key={i} onMouseDown={() => selectSuggestion(item)} style={s.dropdownItem}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <span style={{ color: '#ff3b30', marginLeft: 8, flexShrink: 0 }}>📍</span>
                        <span style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>{item.display_name.split(',').slice(0, 3).join(',')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={s.label}>פרטי המטופל</label>
              <textarea value={form.patientDetails} onChange={e => setForm(f => ({ ...f, patientDetails: e.target.value }))}
                placeholder="גיל, מצב, תסמינים..." rows={2} style={{ ...s.input, resize: 'none', paddingTop: 10 }} />
            </div>

            <div>
              <label style={s.label}>תיאור האירוע</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="תיאור קצר..." style={s.input} />
            </div>

            <div>
              <label style={s.label}>דחיפות</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ val: 'emergency', label: '🚨 חירום', active: '#ff3b30' }, { val: 'routine', label: '🚗 שגרה', active: '#34c759' }].map(({ val, label, active }) => (
                  <button key={val} onClick={() => setForm(f => ({ ...f, urgency: val }))} style={{
                    flex: 1, padding: '11px 0', border: '1.5px solid', borderRadius: 10,
                    fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    borderColor: form.urgency === val ? active : '#e8eaed',
                    background:  form.urgency === val ? `${active}18` : 'white',
                    color:       form.urgency === val ? active : '#888',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={s.label}>הוראות ראשוניות לצוות</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="הוראות לצוות..." style={s.input} />
            </div>

            <button onClick={handleGetETAs} disabled={!eventPos || loadingEta} style={{
              ...s.btn, background: eventPos ? '#1a1a2e' : '#e0e0e0',
              color: eventPos ? 'white' : '#aaa', cursor: eventPos ? 'pointer' : 'not-allowed',
            }}>
              {loadingEta ? '⏳ מחשב...' : '📡 קבל זמני הגעה'}
            </button>
          </div>
        )}

        {tab === 'new' && etaResults.length > 0 && !activeCase && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={s.sectionTitle}>בחר אמבולנס</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {etaResults.map(row => (
                <div key={row.ambulanceId} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>🚑 אמב. {row.ambulanceNumber || ambulances.find(a => a.id === row.ambulanceId)?.ambulanceNumber || row.ambulanceId?.replace('amb-', '')}</div>
                    {row.driverName && <div style={{ fontSize: 12, color: '#888', marginBottom: 5 }}>{row.driverName}</div>}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#555' }}>🚗 <b style={{ color: '#007aff' }}>{fmtETA(row.routineEtaSec)}</b></span>
                      <span style={{ fontSize: 12, color: '#555' }}>🚨 <b style={{ color: '#ff3b30' }}>{fmtETA(row.emergencyEtaSec)}</b></span>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, color: row.status === 'available' ? '#34c759' : '#ff9500', fontWeight: 600 }}>
                      ● {row.status === 'available' ? 'זמין' : 'עסוק'}
                    </div>
                  </div>
                  <button onClick={() => handleAssign(row.ambulanceId, row.driverName, row.ambulanceNumber || ambulances.find(a => a.id === row.ambulanceId)?.ambulanceNumber)}
                    disabled={loadingAssign || row.status !== 'available'} style={{
                      padding: '10px 18px', border: 'none', borderRadius: 10,
                      fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      background: row.status === 'available' ? '#ff3b30' : '#e0e0e0',
                      color:      row.status === 'available' ? 'white'   : '#aaa',
                    }}>
                    {loadingAssign ? '...' : 'הפנה'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'new' && activeCase && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#fff8e1', border: '1px solid #ffcc02', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#7a5900', marginBottom: 8 }}>🚨 קריאה פעילה — {activeCase.id}</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.9 }}>
                <div>📍 {activeCase.address}</div>
                <div>🚑 אמבולנס: <b>{activeCase.assignedAmbulanceNumber || activeCase.assignedAmbulanceId?.replace('amb-', '')}</b>{activeCase.assignedDriverName && <span style={{ color: '#999', fontWeight: 400 }}> ({activeCase.assignedDriverName})</span>}</div>
                {activeCase.patientDetails && <div>👤 {activeCase.patientDetails}</div>}
                {activeCase.urgency === 'emergency'
                  ? <div style={{ color: '#ff3b30', fontWeight: 600 }}>🚨 חירום</div>
                  : <div style={{ color: '#34c759', fontWeight: 600 }}>🚗 שגרה</div>}
              </div>
            </div>

            <div style={s.sectionTitle}>עדכון מצב לצוות</div>
            <textarea value={updateText} onChange={e => setUpdateText(e.target.value)}
              placeholder="שלח עדכון לצוות..." rows={3} style={{ ...s.input, resize: 'none', paddingTop: 10 }} />
            <button onClick={handleSendUpdate} disabled={!updateText.trim()} style={{
              ...s.btn, background: updateText.trim() ? '#007aff' : '#e0e0e0',
              color: updateText.trim() ? 'white' : '#aaa', cursor: updateText.trim() ? 'pointer' : 'not-allowed',
            }}>
              {updateSent ? '✓ נשלח' : '📤 שלח עדכון לצוות'}
            </button>
            <div style={{ width: '100%', height: 1, background: '#e8eaed' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleComplete} style={{ ...s.btn, flex: 1, background: '#1a1a2e', color: 'white', cursor: 'pointer' }}>
                ✅ סיים קריאה
              </button>
              <button onClick={() => activeCase && handleCancelCase(activeCase.id)} style={{
                ...s.btn, flex: 1,
                background: '#fff0ef', border: '1.5px solid #ff3b30',
                color: '#ff3b30', cursor: 'pointer',
              }}>
                ✕ בטל קריאה
              </button>
            </div>
          </div>
        )}
        {tab === 'missions' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={s.sectionTitle}>משימות פעילות — {missions.length}</div>
            {missions.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#aaa', fontSize: 14, padding: '40px 0' }}>
                אין משימות פעילות כרגע
              </div>
            ) : missions.map(m => (
              <div key={m.id} style={{
                background: m.status === 'cancel_requested' ? '#fffbf0' : 'white',
                border: `1.5px solid ${m.status === 'cancel_requested' ? '#ff9500' : '#e8eaed'}`,
                borderRadius: 14, padding: '13px 14px',
                animation: m.status === 'cancel_requested' ? 'cancelPulse 1.8s ease-in-out infinite' : 'none',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#999' }}>{m.id}</span>
                  {m.status === 'cancel_requested' && (
                    <span style={{
                      background: '#fff0d6', color: '#ff9500',
                      border: '1px solid #ff9500',
                      borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                    }}>
                      ⚠️ בקשת ביטול מהנהג
                    </span>
                  )}
                  <span style={{
                    marginRight: 'auto', fontSize: 11, fontWeight: 700,
                    color: m.urgency === 'emergency' ? '#ff3b30' : '#34c759',
                  }}>
                    {m.urgency === 'emergency' ? '🚨 חירום' : '🚗 שגרה'}
                  </span>
                </div>
                {/* Details */}
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.9, marginBottom: 10 }}>
                  <div>📍 {m.address}</div>
                  <div>🚑 אמב. {ambulances.find(a => a.id === m.assignedAmbulanceId)?.ambulanceNumber || m.assignedAmbulanceId?.replace('amb-', '') || m.assignedDriverName}</div>
                  {m.patientDetails && <div>👤 {m.patientDetails}</div>}
                </div>
                {/* Cancel button */}
                <button
                  onClick={() => handleCancelCase(m.id)}
                  style={{
                    width: '100%', padding: '9px 0',
                    background: '#fff0ef', border: '1.5px solid #ff3b30',
                    borderRadius: 10, cursor: 'pointer',
                    fontWeight: 700, fontSize: 13, color: '#ff3b30',
                    fontFamily: 'inherit',
                  }}
                >
                  ✕ בטל קריאה
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cancelPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,149,0,0); }
          50%      { box-shadow: 0 0 0 4px rgba(255,149,0,0.3); }
        }
      `}</style>

      {/* ── MAP ── */}
      <div style={mapStyle}>
        {isMobile && (
          <button onClick={() => setShowMap(false)} style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14, zIndex: 999,
            background: 'white', border: 'none', borderRadius: 20,
            padding: '8px 16px', fontWeight: 700, fontSize: 14,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)', cursor: 'pointer',
            direction: 'rtl',
          }}>
            ← חזור
          </button>
        )}
        <MapContainer center={MAP_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {mapPoints.length > 0 && <AutoFit points={mapPoints} />}
          {ambulances.map(amb => (
            <Marker key={amb.id} position={[amb.lat, amb.lon]} icon={amb.status === 'available' ? iconAvailable : iconBusy}>
              <Popup><div style={{ direction: 'rtl', minWidth: 130, fontSize: 13 }}>
                <b>🚑 אמב. {amb.ambulanceNumber || amb.id?.replace('amb-', '')}</b><br />
                {amb.driverName && <span style={{ color: '#888', fontSize: 12 }}>{amb.driverName}<br /></span>}
                <span style={{ color: amb.status === 'available' ? '#34c759' : '#ff9500', fontWeight: 600 }}>
                  ● {amb.status === 'available' ? 'זמין' : 'עסוק'}
                </span>
              </div></Popup>
            </Marker>
          ))}
          {eventPos && (
            <Marker position={[eventPos.lat, eventPos.lon]} icon={iconEvent}>
              <Popup><div style={{ direction: 'rtl', fontSize: 13 }}><b>📍 מיקום האירוע</b><br /><span style={{ color: '#666' }}>{eventPos.label}</span></div></Popup>
            </Marker>
          )}
          {assignedRoute.length > 0 && (
            <>
              <Polyline positions={assignedRoute} color="#007aff" weight={8} opacity={0.2} />
              <Polyline positions={assignedRoute} color="#007aff" weight={4} opacity={0.9} />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

const s = {
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8 },
  label:  { display: 'block', fontSize: 12, color: '#666', marginBottom: 5, fontWeight: 600 },
  input:  { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #e8eaed', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white', direction: 'rtl' },
  btn:    { width: '100%', padding: '13px 0', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', transition: 'opacity 0.2s' },
  dropdown: { position: 'absolute', top: '100%', right: 0, left: 0, background: 'white', border: '1px solid #e8eaed', borderTop: 'none', borderRadius: '0 0 10px 10px', zIndex: 600, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' },
  dropdownItem: { display: 'flex', alignItems: 'flex-start', padding: '10px 12px', cursor: 'pointer', borderTop: '1px solid #f5f5f5', background: 'white' },
};
