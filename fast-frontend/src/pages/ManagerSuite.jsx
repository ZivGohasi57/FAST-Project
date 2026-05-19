import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Rectangle, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { API_BASE } from '../config.js';
const MAP_CENTER = [32.1501, 34.8914];

const TABS = [
  { id: 'users',  icon: '👥', label: 'משתמשים'    },
  { id: 'events', icon: '📋', label: 'אירועים'     },
  { id: 'zones',  icon: '🚫', label: 'אזורי איסור' },
];

const ROLE_LABELS = { driver: 'נהג', dispatcher: 'מוקדן', manager: 'מנהל' };
const ROLE_COLORS = {
  driver:     { bg: '#e3f2fd', color: '#1565c0' },
  dispatcher: { bg: '#f3e5f5', color: '#6a1b9a' },
  manager:    { bg: '#fff3e0', color: '#e65100' },
};
const STATUS_LABEL = { pending: '⏳ ממתין', active: '🟢 פעיל', completed: '✅ הסתיים' };

const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('he-IL') + '  ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
};

function ZoneDrawer({ active, onPoint }) {
  useMapEvents({ click: (e) => active && onPoint([e.latlng.lat, e.latlng.lng]) });
  return null;
}

const cornerIcon = L.divIcon({
  className: '',
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#ff3b30;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  iconSize: [12, 12], iconAnchor: [6, 6],
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

export default function ManagerSuite() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('users');

  const [users,     setUsers]     = useState([]);
  const [userForm,  setUserForm]  = useState({ username: '', password: '', role: 'driver', displayName: '', ambulanceId: '' });
  const [userError, setUserError] = useState('');
  const [userOk,    setUserOk]    = useState(false);

  const [cases,        setCases]        = useState([]);
  const [expandedCase, setExpandedCase] = useState(null);
  const [eventFilter,  setEventFilter]  = useState('all');

  const [zones,       setZones]       = useState([]);
  const [drawMode,    setDrawMode]    = useState(false);
  const [corner1,     setCorner1]     = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [zoneName,    setZoneName]    = useState('');
  const [zoneError,   setZoneError]   = useState('');

  useEffect(() => {
    if (tab === 'users')  fetchUsers();
    if (tab === 'events') fetchCases();
    if (tab === 'zones')  fetchZones();
  }, [tab]); // eslint-disable-line

  const fetchUsers = () => axios.get(`${API_BASE}/api/users`).then(r => setUsers(r.data)).catch(() => {});
  const fetchCases = () => axios.get(`${API_BASE}/api/cases`).then(r => setCases(r.data)).catch(() => {});
  const fetchZones = () => axios.get(`${API_BASE}/api/nogozones`).then(r => setZones(r.data)).catch(() => {});

  const handleAddUser = async () => {
    if (!userForm.username || !userForm.password || !userForm.displayName) {
      setUserError('יש למלא את כל השדות המסומנים ב-*'); return;
    }
    if (userForm.role === 'driver' && !userForm.ambulanceId) {
      setUserError('נהג חייב לקבל מזהה אמבולנס'); return;
    }
    setUserError('');
    try {
      await axios.post(`${API_BASE}/api/users`, userForm);
      setUserForm({ username: '', password: '', role: 'driver', displayName: '', ambulanceId: '' });
      setUserOk(true); setTimeout(() => setUserOk(false), 2500);
      fetchUsers();
    } catch { setUserError('שגיאה בהוספת משתמש'); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('למחוק משתמש זה?')) return;
    await axios.delete(`${API_BASE}/api/users?id=${id}`).catch(() => {});
    fetchUsers();
  };

  const handleMapPoint = (pt) => {
    if (!corner1) { setCorner1(pt); }
    else {
      setPendingZone({ minLat: Math.min(corner1[0], pt[0]), maxLat: Math.max(corner1[0], pt[0]), minLon: Math.min(corner1[1], pt[1]), maxLon: Math.max(corner1[1], pt[1]) });
      setCorner1(null); setDrawMode(false);
    }
  };

  const handleSaveZone = async () => {
    if (!zoneName.trim()) { setZoneError('יש לתת שם לאזור'); return; }
    setZoneError('');
    try {
      await axios.post(`${API_BASE}/api/nogozones`, { name: zoneName.trim(), ...pendingZone });
      setPendingZone(null); setZoneName(''); fetchZones();
    } catch { setZoneError('שגיאה בשמירת האזור'); }
  };

  const cancelDraw = () => { setDrawMode(false); setCorner1(null); setPendingZone(null); setZoneName(''); setZoneError(''); };
  const handleDeleteZone = async (id) => { await axios.delete(`${API_BASE}/api/nogozones?id=${id}`).catch(() => {}); fetchZones(); };

  const filteredCases = cases.filter(c => eventFilter === 'all' || c.status === eventFilter);

  // ── Layout wrappers ────────────────────────────────────────────────────────
  const Sidebar = () => (
    <div style={{
      ...(isMobile
        ? { width: '100%', background: '#1a1a2e', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: '6px 0', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }
        : { width: 60, background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 6, flexShrink: 0 })
    }}>
      {!isMobile && <div style={{ color: 'white', fontSize: 20, marginBottom: 12 }}>⚙️</div>}
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} title={t.label} style={{
          ...(isMobile
            ? { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', gap: 2 }
            : { width: 42, height: 42, borderRadius: 10 }),
          border: 'none', cursor: 'pointer', fontSize: isMobile ? 22 : 20,
          background: tab === t.id ? 'rgba(255,255,255,0.18)' : 'transparent',
          transition: 'background 0.2s',
        }}>
          {t.icon}
          {isMobile && <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>{t.label}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', direction: 'rtl' }}>

      {/* Sidebar: left on desktop, top on mobile (we put it at bottom for mobile) */}
      {!isMobile && <Sidebar />}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8f9fb', minHeight: 0 }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e8eaed', padding: isMobile ? '11px 16px' : '13px 22px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>{TABS.find(t => t.id === tab)?.icon}</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{TABS.find(t => t.id === tab)?.label}</div>
        </div>

        <div style={{ flex: 1, overflow: tab === 'zones' ? 'hidden' : 'auto', padding: tab === 'zones' ? 0 : (isMobile ? 14 : 22), minHeight: 0 }}>

          {/* ══ USERS TAB ══ */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>

              {/* Add user form — on mobile comes first */}
              {isMobile && (
                <div style={{ width: '100%', ...s.card }}>
                  <div style={s.cardTitle}>הוסף משתמש</div>
                  <UserForm userForm={userForm} setUserForm={setUserForm} userError={userError} userOk={userOk} handleAddUser={handleAddUser} />
                </div>
              )}

              {/* Table */}
              <div style={{ flex: 1, ...s.card, overflowX: 'auto' }}>
                <div style={s.cardTitle}>משתמשים פעילים ({users.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 380 : 'unset' }}>
                  <thead>
                    <tr>{['שם תצוגה', 'שם משתמש', 'תפקיד', 'אמבולנס', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={s.td}><b style={{ whiteSpace: 'nowrap' }}>{u.displayName}</b></td>
                        <td style={s.td}><code style={{ fontSize: 12, color: '#666' }}>{u.username}</code></td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background: ROLE_COLORS[u.role]?.bg, color: ROLE_COLORS[u.role]?.color }}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        </td>
                        <td style={s.td}><code style={{ fontSize: 12, color: '#888' }}>{u.ambulanceId ?? '—'}</code></td>
                        <td style={s.td}><button onClick={() => handleDeleteUser(u.id)} style={s.deleteBtn}>מחק</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add user form — desktop only on the right */}
              {!isMobile && (
                <div style={{ width: 290, ...s.card, flexShrink: 0 }}>
                  <div style={s.cardTitle}>הוסף משתמש</div>
                  <UserForm userForm={userForm} setUserForm={setUserForm} userError={userError} userOk={userOk} handleAddUser={handleAddUser} />
                </div>
              )}
            </div>
          )}

          {/* ══ EVENTS TAB ══ */}
          {tab === 'events' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {[['all', 'הכל'], ['pending', 'ממתינים'], ['active', 'פעילים'], ['completed', 'הסתיימו']].map(([val, label]) => (
                  <button key={val} onClick={() => setEventFilter(val)} style={{
                    padding: '7px 14px', border: '1.5px solid', borderRadius: 20,
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                    borderColor: eventFilter === val ? '#1a1a2e' : '#e0e0e0',
                    background:  eventFilter === val ? '#1a1a2e' : 'white',
                    color:       eventFilter === val ? 'white'   : '#666',
                  }}>{label}</button>
                ))}
                <button onClick={fetchCases} style={{ marginRight: 'auto', padding: '7px 14px', border: '1px solid #e0e0e0', borderRadius: 20, background: 'white', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#666' }}>
                  🔄 רענן
                </button>
              </div>

              {filteredCases.length === 0 && (
                <div style={{ color: '#bbb', textAlign: 'center', padding: 60, fontSize: 15 }}>אין אירועים</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredCases.map(c => (
                  <div key={c.id} style={s.card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                          <code style={{ fontSize: 11, color: '#aaa', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{c.id}</code>
                          <span style={{ ...s.badge, background: c.urgency === 'emergency' ? '#fff0ef' : '#f0fff4', color: c.urgency === 'emergency' ? '#ff3b30' : '#34c759' }}>
                            {c.urgency === 'emergency' ? '🚨 חירום' : '🚗 שגרה'}
                          </span>
                          <span style={s.badge}>{STATUS_LABEL[c.status] ?? c.status}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {c.address}</div>
                        {c.assignedDriverName && <div style={{ fontSize: 13, color: '#777', marginTop: 3 }}>🚑 {c.assignedDriverName}</div>}
                      </div>
                      <div style={{ textAlign: 'left', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{fmtTime(c.createdAt)}</div>
                        <div style={{ textAlign: 'center', marginTop: 6, color: '#bbb' }}>{expandedCase === c.id ? '▲' : '▼'}</div>
                      </div>
                    </div>

                    {expandedCase === c.id && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                          {c.description && <div style={s.detailBox}><div style={s.detailLabel}>תיאור האירוע</div><div>{c.description}</div></div>}
                          {c.patientDetails && <div style={s.detailBox}><div style={s.detailLabel}>פרטי מטופל</div><div>{c.patientDetails}</div></div>}
                        </div>
                        {c.notes ? (
                          <div>
                            <div style={{ ...s.detailLabel, marginBottom: 6 }}>📋 היסטוריית עדכוני מוקד</div>
                            <div style={{ background: '#f5f7fa', borderRadius: 10, padding: '12px 14px', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-line', lineHeight: 2, color: '#333' }}>
                              {c.notes}
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: '#ccc', fontSize: 13 }}>אין עדכוני מוקד לקריאה זו</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ZONES TAB ══ */}
          {tab === 'zones' && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%' }}>

              {/* Zones sidebar */}
              <div style={{
                width: isMobile ? '100%' : 300,
                maxHeight: isMobile ? '45vh' : 'unset',
                background: '#f8f9fb', borderLeft: isMobile ? 'none' : '1px solid #e8eaed',
                borderBottom: isMobile ? '1px solid #e8eaed' : 'none',
                overflowY: 'auto', padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
              }}>
                <div style={s.cardTitle}>אזורי איסור</div>
                <div style={{ fontSize: 12, color: '#7a5900', lineHeight: 1.6, background: '#fff8e1', padding: '9px 11px', borderRadius: 10, border: '1px solid #ffe082' }}>
                  באזורים אלו, גם בחירום האמבולנס מחויב לנסוע לפי חוקי התנועה הרגילים.
                </div>

                {!drawMode && !pendingZone && (
                  <button onClick={() => setDrawMode(true)} style={{ ...s.btn, background: '#1a1a2e', color: 'white', cursor: 'pointer' }}>
                    ✏️ סמן אזור חדש
                  </button>
                )}

                {drawMode && (
                  <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
                    <b style={{ color: '#1565c0' }}>{corner1 ? '📍 לחץ נקודה שנייה' : '📍 לחץ נקודה ראשונה'}</b>
                    <div style={{ marginTop: 8 }}>
                      <button onClick={cancelDraw} style={{ padding: '5px 14px', border: '1px solid #ccc', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>ביטול</button>
                    </div>
                  </div>
                )}

                {pendingZone && (
                  <div style={{ ...s.card, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✅ תן שם לאזור</div>
                    {zoneError && <div style={{ color: '#c0392b', fontSize: 12, marginBottom: 6 }}>⚠️ {zoneError}</div>}
                    <input value={zoneName} onChange={e => setZoneName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveZone()}
                      placeholder='לדוג׳: מרכז העיר' style={{ ...s.input, marginBottom: 10 }} autoFocus />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleSaveZone} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 9, background: '#ff3b30', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>💾 שמור</button>
                      <button onClick={cancelDraw} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 9, background: '#e0e0e0', color: '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
                    </div>
                  </div>
                )}

                {zones.length === 0 && !drawMode && !pendingZone && (
                  <div style={{ color: '#ccc', textAlign: 'center', fontSize: 13, padding: 16 }}>אין אזורי איסור</div>
                )}

                {zones.map(z => (
                  <div key={z.id} style={{ background: 'white', border: '1px solid #ffd5d0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🚫</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{z.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{z.minLat.toFixed(4)}° – {z.maxLat.toFixed(4)}°</div>
                    </div>
                    <button onClick={() => handleDeleteZone(z.id)} style={s.deleteBtn}>מחק</button>
                  </div>
                ))}
              </div>

              {/* Map */}
              <div style={{ flex: 1, minHeight: isMobile ? '55vw' : 'unset' }}>
                <MapContainer center={MAP_CENTER} zoom={13} style={{ height: '100%', width: '100%', cursor: (drawMode || corner1) ? 'crosshair' : 'grab' }}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                  <ZoneDrawer active={drawMode || !!corner1} onPoint={handleMapPoint} />
                  {zones.map(z => (
                    <Rectangle key={z.id} bounds={[[z.minLat, z.minLon], [z.maxLat, z.maxLon]]} color="#ff3b30" weight={2} fillOpacity={0.18}>
                      <Popup><b>🚫 {z.name}</b></Popup>
                    </Rectangle>
                  ))}
                  {pendingZone && <Rectangle bounds={[[pendingZone.minLat, pendingZone.minLon], [pendingZone.maxLat, pendingZone.maxLon]]} color="#ff9500" weight={2} fillOpacity={0.2} dashArray="6 4" />}
                  {corner1 && <Marker position={corner1} icon={cornerIcon} />}
                </MapContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      {isMobile && <Sidebar />}
    </div>
  );
}

function UserForm({ userForm, setUserForm, userError, userOk, handleAddUser }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {userError && <div style={{ color: '#c0392b', fontSize: 13, background: '#fff0ef', padding: '8px 10px', borderRadius: 8 }}>⚠️ {userError}</div>}
      {userOk    && <div style={{ color: '#27ae60', fontSize: 13, background: '#eafaf1', padding: '8px 10px', borderRadius: 8 }}>✓ המשתמש נוסף</div>}
      <div>
        <label style={s.label}>תפקיד</label>
        <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value, ambulanceId: '' }))} style={s.input}>
          <option value="driver">נהג</option>
          <option value="dispatcher">מוקדן</option>
          <option value="manager">מנהל</option>
        </select>
      </div>
      <div>
        <label style={s.label}>שם תצוגה *</label>
        <input value={userForm.displayName} onChange={e => setUserForm(f => ({ ...f, displayName: e.target.value }))} style={s.input} placeholder="ישראל ישראלי" />
      </div>
      <div>
        <label style={s.label}>שם משתמש *</label>
        <input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} style={s.input} placeholder="israel123" />
      </div>
      <div>
        <label style={s.label}>סיסמה *</label>
        <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} style={s.input} placeholder="••••••••" />
      </div>
      {userForm.role === 'driver' && (
        <div>
          <label style={s.label}>מזהה אמבולנס *</label>
          <input value={userForm.ambulanceId} onChange={e => setUserForm(f => ({ ...f, ambulanceId: e.target.value }))} style={s.input} placeholder="amb-3" />
        </div>
      )}
      <button onClick={handleAddUser} style={{ ...s.btn, background: '#1a1a2e', color: 'white', cursor: 'pointer', marginTop: 4 }}>
        + הוסף משתמש
      </button>
    </div>
  );
}

const s = {
  card:        { background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e8eaed', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  cardTitle:   { fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#1a1a2e' },
  th:          { textAlign: 'right', padding: '8px 12px', fontSize: 12, color: '#aaa', fontWeight: 600, borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap' },
  td:          { padding: '10px 12px', borderBottom: '1px solid #f5f5f5', fontSize: 14, verticalAlign: 'middle' },
  badge:       { display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#f0f0f0', color: '#666' },
  label:       { display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 },
  input:       { width: '100%', padding: '10px 11px', borderRadius: 9, border: '1px solid #e8eaed', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', direction: 'rtl', background: 'white' },
  btn:         { width: '100%', padding: '12px 0', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, fontFamily: 'inherit' },
  deleteBtn:   { padding: '5px 12px', border: '1px solid #ffd5d0', borderRadius: 8, background: '#fff0ef', color: '#c0392b', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  detailBox:   { background: '#f8f9fb', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#444' },
  detailLabel: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
};
