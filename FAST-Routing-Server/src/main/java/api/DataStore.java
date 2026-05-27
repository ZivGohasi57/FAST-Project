package api;

import com.google.gson.*;
import com.google.gson.reflect.TypeToken;
import core.models.*;

import java.io.*;
import java.lang.reflect.Type;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.*;

public class DataStore {

    private static final DataStore INSTANCE = new DataStore();
    public static DataStore getInstance() { return INSTANCE; }

    private final Gson gson = new GsonBuilder().setPrettyPrinting().serializeNulls().create();
    private final Path dataDir;

    private final Map<String, Map<String, Map<String, Object>>> store = new ConcurrentHashMap<>();
    private final Map<String, String> sessions = new ConcurrentHashMap<>();
    private final AtomicLong caseSeq = new AtomicLong(1);
    private final AtomicLong userSeq = new AtomicLong(10);
    private final AtomicLong zoneSeq = new AtomicLong(1);

    private static final String USERS      = "users";
    private static final String CASES      = "cases";
    private static final String AMBULANCES = "ambulances";
    private static final String NOGOZONES  = "nogozones";

    private DataStore() {
        dataDir = Paths.get("data");
        try {
            Files.createDirectories(dataDir);
            for (String col : new String[]{USERS, CASES, AMBULANCES, NOGOZONES})
                store.put(col, new ConcurrentHashMap<>(loadCollection(col)));
            loadCounters();
            seedIfEmpty();
        } catch (Exception e) {
            throw new RuntimeException("DataStore init failed: " + e.getMessage(), e);
        }
    }

    // ── Persistence helpers ────────────────────────────────────────────────────

    private Map<String, Map<String, Object>> loadCollection(String name) throws IOException {
        Path file = dataDir.resolve(name + ".json");
        if (!Files.exists(file)) return new HashMap<>();
        Type type = new TypeToken<Map<String, Map<String, Object>>>(){}.getType();
        Map<String, Map<String, Object>> result = gson.fromJson(Files.readString(file), type);
        return result != null ? result : new HashMap<>();
    }

    private synchronized void saveCollection(String name) {
        try {
            Files.writeString(dataDir.resolve(name + ".json"), gson.toJson(store.get(name)));
        } catch (IOException e) { /* non-fatal */ }
    }

    private void loadCounters() throws IOException {
        Path file = dataDir.resolve("counters.json");
        if (!Files.exists(file)) return;
        Type type = new TypeToken<Map<String, Object>>(){}.getType();
        Map<String, Object> m = gson.fromJson(Files.readString(file), type);
        if (m == null) return;
        if (m.containsKey("caseSeq")) caseSeq.set(((Number) m.get("caseSeq")).longValue());
        if (m.containsKey("userSeq")) userSeq.set(((Number) m.get("userSeq")).longValue());
        if (m.containsKey("zoneSeq")) zoneSeq.set(((Number) m.get("zoneSeq")).longValue());
    }

    private void saveCounters() {
        try {
            Map<String, Object> m = new HashMap<>();
            m.put("caseSeq", caseSeq.get());
            m.put("userSeq", userSeq.get());
            m.put("zoneSeq", zoneSeq.get());
            Files.writeString(dataDir.resolve("counters.json"), gson.toJson(m));
        } catch (IOException e) { /* non-fatal */ }
    }

    private Map<String, Object> getDoc(String collection, String id) {
        return store.get(collection).get(id);
    }

    private void putDoc(String collection, String id, Map<String, Object> doc) {
        store.get(collection).put(id, doc);
        saveCollection(collection);
    }

    private void patchDoc(String collection, String id, Map<String, Object> updates) {
        Map<String, Object> existing = store.get(collection).getOrDefault(id, new HashMap<>());
        Map<String, Object> merged = new HashMap<>(existing);
        merged.putAll(updates);
        store.get(collection).put(id, merged);
        saveCollection(collection);
    }

    private void deleteDoc(String collection, String id) {
        store.get(collection).remove(id);
        saveCollection(collection);
    }

    private Collection<Map<String, Object>> listCollection(String collection) {
        return store.get(collection).values();
    }

    private List<Map<String, Object>> queryCollection(String collection, String field, Object value) {
        return store.get(collection).values().stream()
            .filter(doc -> Objects.equals(doc.get(field), value))
            .collect(Collectors.toList());
    }

    // ── Seed ──────────────────────────────────────────────────────────────────

    private void seedIfEmpty() {
        if (!store.get(USERS).isEmpty()) return;

        putUser(new User("u1", "driver1",     "123", "driver",     "amb-1", "יוסי כהן"));
        putUser(new User("u2", "driver2",     "123", "driver",     "amb-2", "משה לוי"));
        putUser(new User("u3", "dispatcher1", "123", "dispatcher", null,    "רחל גולן"));
        putUser(new User("u4", "manager1",    "123", "manager",    null,    "דוד ישראלי"));
        putAmbulance(new AmbulanceInfo("amb-1", "u1", "יוסי כהן", 32.1668, 34.9201, "available"));
        putAmbulance(new AmbulanceInfo("amb-2", "u2", "משה לוי",  32.1720, 34.9280, "available"));

        caseSeq.set(1); userSeq.set(10); zoneSeq.set(1);
        saveCounters();
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    public void putUser(User u) {
        putDoc(USERS, u.getId(), userToMap(u));
    }

    public User getById(String id) {
        Map<String, Object> doc = getDoc(USERS, id);
        return doc != null ? toUser(doc) : null;
    }

    public User getByUsername(String uname) {
        List<Map<String, Object>> docs = queryCollection(USERS, "username", uname);
        return docs.isEmpty() ? null : toUser(docs.get(0));
    }

    public Collection<User> allUsers() {
        return listCollection(USERS).stream().map(this::toUser).collect(Collectors.toList());
    }

    public void deleteUser(String id) {
        deleteDoc(USERS, id);
    }

    public String nextUserId() {
        String id = "u" + userSeq.getAndIncrement();
        saveCounters();
        return id;
    }

    // ── Sessions (in-memory — ephemeral by design) ────────────────────────────

    public void putSession(String token, String userId) { sessions.put(token, userId); }

    public User getUserByToken(String token) {
        String uid = sessions.get(token);
        return uid != null ? getById(uid) : null;
    }

    // ── Cases ─────────────────────────────────────────────────────────────────

    public CaseRecord createCase(CaseRecord c) {
        c.setId("case-" + caseSeq.getAndIncrement());
        saveCounters();
        c.setStatus("pending");
        c.setCreatedAt(System.currentTimeMillis());
        putDoc(CASES, c.getId(), caseToMap(c));
        return c;
    }

    public CaseRecord getCaseById(String id) {
        Map<String, Object> doc = getDoc(CASES, id);
        return doc != null ? toCase(doc) : null;
    }

    public Collection<CaseRecord> allCases() {
        return listCollection(CASES).stream().map(this::toCase).collect(Collectors.toList());
    }

    public void assignCase(String caseId, String ambulanceId) {
        AmbulanceInfo a = getAmbulance(ambulanceId);
        Map<String, Object> caseUpdates = new HashMap<>();
        caseUpdates.put("status", "active");
        caseUpdates.put("assignedAmbulanceId", ambulanceId);
        caseUpdates.put("assignedDriverName", a != null ? a.getDriverName() : "");
        patchDoc(CASES, caseId, caseUpdates);
        if (a != null) patchDoc(AMBULANCES, ambulanceId, Map.of("status", "busy"));
    }

    public CaseRecord getActiveForAmbulance(String ambulanceId) {
        return queryCollection(CASES, "assignedAmbulanceId", ambulanceId).stream()
            .map(this::toCase)
            .filter(c -> "active".equals(c.getStatus()) || "cancel_requested".equals(c.getStatus()))
            .findFirst().orElse(null);
    }

    public void updateCaseNotes(String caseId, String notes, String patientDetails) {
        Map<String, Object> doc = getDoc(CASES, caseId);
        if (doc == null) return;
        Map<String, Object> updates = new HashMap<>();
        if (notes != null) {
            String ts  = new java.text.SimpleDateFormat("HH:mm").format(new Date());
            String cur = (String) doc.get("notes");
            updates.put("notes", (cur == null || cur.isEmpty())
                ? "[" + ts + "] " + notes
                : cur + "\n[" + ts + "] " + notes);
        }
        if (patientDetails != null) updates.put("patientDetails", patientDetails);
        if (!updates.isEmpty()) patchDoc(CASES, caseId, updates);
    }

    public void completeCase(String caseId) {
        CaseRecord c = getCaseById(caseId);
        if (c == null) return;
        patchDoc(CASES, caseId, Map.of("status", "completed"));
        if (c.getAssignedAmbulanceId() != null)
            patchDoc(AMBULANCES, c.getAssignedAmbulanceId(), Map.of("status", "available"));
    }

    public void requestCancel(String caseId) {
        CaseRecord c = getCaseById(caseId);
        if (c != null && "active".equals(c.getStatus()))
            patchDoc(CASES, caseId, Map.of("status", "cancel_requested"));
    }

    public void cancelCase(String caseId) {
        CaseRecord c = getCaseById(caseId);
        if (c == null) return;
        patchDoc(CASES, caseId, Map.of("status", "cancelled"));
        if (c.getAssignedAmbulanceId() != null)
            patchDoc(AMBULANCES, c.getAssignedAmbulanceId(), Map.of("status", "available"));
    }

    // ── No-Go Zones ───────────────────────────────────────────────────────────

    public NoGoZone addNoGoZone(NoGoZone z) {
        z.setId("zone-" + zoneSeq.getAndIncrement());
        saveCounters();
        putDoc(NOGOZONES, z.getId(), zoneToMap(z));
        return z;
    }

    public Collection<NoGoZone> allNoGoZones() {
        return listCollection(NOGOZONES).stream().map(this::toZone).collect(Collectors.toList());
    }

    public void deleteNoGoZone(String id) {
        deleteDoc(NOGOZONES, id);
    }

    // ── Ambulances ────────────────────────────────────────────────────────────

    public Collection<AmbulanceInfo> allAmbulances() {
        return listCollection(AMBULANCES).stream().map(this::toAmbulance).collect(Collectors.toList());
    }

    public AmbulanceInfo getAmbulance(String id) {
        Map<String, Object> doc = getDoc(AMBULANCES, id);
        return doc != null ? toAmbulance(doc) : null;
    }

    public void putAmbulance(AmbulanceInfo a) {
        putDoc(AMBULANCES, a.getId(), ambulanceToMap(a));
    }

    public void updateLocation(String id, double lat, double lon) {
        Map<String, Object> upd = new HashMap<>();
        upd.put("lat", lat);
        upd.put("lon", lon);
        patchDoc(AMBULANCES, id, upd);
    }

    // ── Model <-> Map converters ──────────────────────────────────────────────

    private Map<String, Object> userToMap(User u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());             m.put("username",    u.getUsername());
        m.put("password", u.getPassword()); m.put("role",        u.getRole());
        m.put("ambulanceId", u.getAmbulanceId()); m.put("displayName", u.getDisplayName());
        return m;
    }

    private User toUser(Map<String, Object> m) {
        return new User(str(m,"id"), str(m,"username"), str(m,"password"),
            str(m,"role"), (String) m.get("ambulanceId"), str(m,"displayName"));
    }

    private Map<String, Object> ambulanceToMap(AmbulanceInfo a) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", a.getId());     m.put("driverId",    a.getDriverId());
        m.put("driverName", a.getDriverName()); m.put("lat", a.getLat());
        m.put("lon", a.getLon());   m.put("status",      a.getStatus());
        return m;
    }

    private AmbulanceInfo toAmbulance(Map<String, Object> m) {
        return new AmbulanceInfo(str(m,"id"), str(m,"driverId"), str(m,"driverName"),
            dbl(m,"lat"), dbl(m,"lon"), str(m,"status"));
    }

    private Map<String, Object> caseToMap(CaseRecord c) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId());                       m.put("address",        c.getAddress());
        m.put("lat", c.getLat());                     m.put("lon",            c.getLon());
        m.put("description", c.getDescription());     m.put("patientDetails", c.getPatientDetails());
        m.put("urgency", c.getUrgency());             m.put("notes",          c.getNotes());
        m.put("status", c.getStatus());               m.put("createdAt",      c.getCreatedAt());
        m.put("assignedAmbulanceId", c.getAssignedAmbulanceId());
        m.put("assignedDriverName",  c.getAssignedDriverName());
        return m;
    }

    private CaseRecord toCase(Map<String, Object> m) {
        CaseRecord c = new CaseRecord();
        c.setId(str(m,"id"));                        c.setAddress(str(m,"address"));
        c.setLat(dbl(m,"lat"));                      c.setLon(dbl(m,"lon"));
        c.setDescription(str(m,"description"));      c.setPatientDetails(str(m,"patientDetails"));
        c.setUrgency(str(m,"urgency","routine"));     c.setNotes(str(m,"notes"));
        c.setStatus(str(m,"status","pending"));
        c.setAssignedAmbulanceId((String) m.get("assignedAmbulanceId"));
        c.setAssignedDriverName(str(m,"assignedDriverName"));
        Object ts = m.get("createdAt");
        c.setCreatedAt(ts instanceof Number ? ((Number)ts).longValue() : 0L);
        return c;
    }

    private Map<String, Object> zoneToMap(NoGoZone z) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", z.getId()); m.put("name",   z.getName());
        m.put("minLat", z.getMinLat()); m.put("maxLat", z.getMaxLat());
        m.put("minLon", z.getMinLon()); m.put("maxLon", z.getMaxLon());
        return m;
    }

    private NoGoZone toZone(Map<String, Object> m) {
        NoGoZone z = new NoGoZone();
        z.setId(str(m,"id")); z.setName(str(m,"name"));
        z.setMinLat(dbl(m,"minLat")); z.setMaxLat(dbl(m,"maxLat"));
        z.setMinLon(dbl(m,"minLon")); z.setMaxLon(dbl(m,"maxLon"));
        return z;
    }

    private String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v instanceof String ? (String) v : v != null ? v.toString() : "";
    }
    private String str(Map<String, Object> m, String k, String def) {
        Object v = m.get(k); return v instanceof String ? (String) v : def;
    }
    private double dbl(Map<String, Object> m, String k) {
        Object v = m.get(k); return v instanceof Number ? ((Number) v).doubleValue() : 0.0;
    }
}
