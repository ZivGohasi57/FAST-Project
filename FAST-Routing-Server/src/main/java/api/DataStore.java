package api;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
import core.models.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class DataStore {

    private static final DataStore INSTANCE = new DataStore();
    public static DataStore getInstance() { return INSTANCE; }

    private final Firestore db;
    private final Map<String, String> sessions = new ConcurrentHashMap<>();

    private DataStore() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                String credJson = System.getenv("FIREBASE_CREDENTIALS");
                if (credJson == null || credJson.isBlank())
                    throw new RuntimeException("FIREBASE_CREDENTIALS env var not set");
                GoogleCredentials creds = GoogleCredentials.fromStream(
                    new ByteArrayInputStream(credJson.getBytes(StandardCharsets.UTF_8)));
                FirebaseApp.initializeApp(FirebaseOptions.builder().setCredentials(creds).build());
            }
            db = FirestoreClient.getFirestore();
            seedIfEmpty();
        } catch (Exception e) {
            throw new RuntimeException("Firestore init failed: " + e.getMessage(), e);
        }
    }

    private void seedIfEmpty() throws Exception {
        if (!db.collection("users").limit(1).get().get().isEmpty()) return;

        putUser(new User("u1", "driver1",     "123", "driver",     "amb-1", "יוסי כהן"));
        putUser(new User("u2", "driver2",     "123", "driver",     "amb-2", "משה לוי"));
        putUser(new User("u3", "dispatcher1", "123", "dispatcher", null,    "רחל גולן"));
        putUser(new User("u4", "manager1",    "123", "manager",    null,    "דוד ישראלי"));
        putAmbulance(new AmbulanceInfo("amb-1", "u1", "יוסי כהן", 32.1668, 34.9201, "available"));
        putAmbulance(new AmbulanceInfo("amb-2", "u2", "משה לוי",  32.1720, 34.9280, "available"));

        db.collection("meta").document("counters")
            .set(Map.of("caseSeq", 1L, "userSeq", 10L, "zoneSeq", 1L)).get();
    }

    // ── Counter ───────────────────────────────────────────────────────────────

    private long nextSeq(String field) {
        DocumentReference ref = db.collection("meta").document("counters");
        try {
            return db.runTransaction(tx -> {
                DocumentSnapshot snap = tx.get(ref).get();
                Long cur = snap.getLong(field);
                long val = cur != null ? cur : 1L;
                tx.update(ref, field, val + 1L);
                return val;
            }).get();
        } catch (Exception e) {
            throw new RuntimeException("Counter error: " + field, e);
        }
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    public void putUser(User u) {
        try { db.collection("users").document(u.getId()).set(toMap(u)).get(); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    public User getById(String id) {
        try {
            DocumentSnapshot s = db.collection("users").document(id).get().get();
            return s.exists() ? toUser(Objects.requireNonNull(s.getData())) : null;
        } catch (Exception e) { return null; }
    }

    public User getByUsername(String uname) {
        try {
            QuerySnapshot s = db.collection("users").whereEqualTo("username", uname).limit(1).get().get();
            return s.isEmpty() ? null : toUser(s.getDocuments().get(0).getData());
        } catch (Exception e) { return null; }
    }

    public Collection<User> allUsers() {
        try {
            return db.collection("users").get().get().getDocuments().stream()
                .map(d -> toUser(d.getData())).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void deleteUser(String id) {
        try { db.collection("users").document(id).delete().get(); }
        catch (Exception e) { /* ignore */ }
    }

    public String nextUserId() { return "u" + nextSeq("userSeq"); }

    // ── Sessions (in-memory — ephemeral by design) ────────────────────────────

    public void putSession(String token, String userId) { sessions.put(token, userId); }

    public User getUserByToken(String token) {
        String uid = sessions.get(token);
        return uid != null ? getById(uid) : null;
    }

    // ── Cases ─────────────────────────────────────────────────────────────────

    public CaseRecord createCase(CaseRecord c) {
        c.setId("case-" + nextSeq("caseSeq"));
        c.setStatus("pending");
        c.setCreatedAt(System.currentTimeMillis());
        try { db.collection("cases").document(c.getId()).set(toMap(c)).get(); }
        catch (Exception e) { throw new RuntimeException(e); }
        return c;
    }

    public CaseRecord getCaseById(String id) {
        try {
            DocumentSnapshot s = db.collection("cases").document(id).get().get();
            return s.exists() ? toCase(Objects.requireNonNull(s.getData())) : null;
        } catch (Exception e) { return null; }
    }

    public Collection<CaseRecord> allCases() {
        try {
            return db.collection("cases").get().get().getDocuments().stream()
                .map(d -> toCase(d.getData())).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void assignCase(String caseId, String ambulanceId) {
        try {
            AmbulanceInfo a = getAmbulance(ambulanceId);
            db.collection("cases").document(caseId).update(
                "status", "active",
                "assignedAmbulanceId", ambulanceId,
                "assignedDriverName", a != null ? a.getDriverName() : ""
            ).get();
            if (a != null) db.collection("ambulances").document(ambulanceId).update("status", "busy").get();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public CaseRecord getActiveForAmbulance(String ambulanceId) {
        try {
            return db.collection("cases")
                .whereEqualTo("assignedAmbulanceId", ambulanceId)
                .get().get().getDocuments().stream()
                .map(d -> toCase(d.getData()))
                .filter(c -> "active".equals(c.getStatus()) || "cancel_requested".equals(c.getStatus()))
                .findFirst().orElse(null);
        } catch (Exception e) { return null; }
    }

    public void updateCaseNotes(String caseId, String notes, String patientDetails) {
        try {
            Map<String, Object> updates = new HashMap<>();
            if (notes != null) {
                CaseRecord c = getCaseById(caseId);
                if (c == null) return;
                String ts  = new java.text.SimpleDateFormat("HH:mm").format(new Date());
                String cur = c.getNotes();
                updates.put("notes", (cur == null || cur.isEmpty())
                    ? "[" + ts + "] " + notes
                    : cur + "\n[" + ts + "] " + notes);
            }
            if (patientDetails != null) updates.put("patientDetails", patientDetails);
            if (!updates.isEmpty()) db.collection("cases").document(caseId).update(updates).get();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void completeCase(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c == null) return;
            db.collection("cases").document(caseId).update("status", "completed").get();
            if (c.getAssignedAmbulanceId() != null)
                db.collection("ambulances").document(c.getAssignedAmbulanceId()).update("status", "available").get();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void requestCancel(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c != null && "active".equals(c.getStatus()))
                db.collection("cases").document(caseId).update("status", "cancel_requested").get();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void cancelCase(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c == null) return;
            db.collection("cases").document(caseId).update("status", "cancelled").get();
            if (c.getAssignedAmbulanceId() != null)
                db.collection("ambulances").document(c.getAssignedAmbulanceId()).update("status", "available").get();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    // ── No-Go Zones ───────────────────────────────────────────────────────────

    public NoGoZone addNoGoZone(NoGoZone z) {
        z.setId("zone-" + nextSeq("zoneSeq"));
        try { db.collection("nogozones").document(z.getId()).set(toMap(z)).get(); }
        catch (Exception e) { throw new RuntimeException(e); }
        return z;
    }

    public Collection<NoGoZone> allNoGoZones() {
        try {
            return db.collection("nogozones").get().get().getDocuments().stream()
                .map(d -> toZone(d.getData())).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void deleteNoGoZone(String id) {
        try { db.collection("nogozones").document(id).delete().get(); }
        catch (Exception e) { /* ignore */ }
    }

    // ── Ambulances ────────────────────────────────────────────────────────────

    public Collection<AmbulanceInfo> allAmbulances() {
        try {
            return db.collection("ambulances").get().get().getDocuments().stream()
                .map(d -> toAmbulance(d.getData())).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public AmbulanceInfo getAmbulance(String id) {
        try {
            DocumentSnapshot s = db.collection("ambulances").document(id).get().get();
            return s.exists() ? toAmbulance(Objects.requireNonNull(s.getData())) : null;
        } catch (Exception e) { return null; }
    }

    public void putAmbulance(AmbulanceInfo a) {
        try { db.collection("ambulances").document(a.getId()).set(toMap(a)).get(); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    public void updateLocation(String id, double lat, double lon) {
        try { db.collection("ambulances").document(id).update("lat", lat, "lon", lon).get(); }
        catch (Exception e) { /* ignore */ }
    }

    // ── Converters ────────────────────────────────────────────────────────────

    private Map<String, Object> toMap(User u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());           m.put("username",    u.getUsername());
        m.put("password", u.getPassword()); m.put("role",      u.getRole());
        m.put("ambulanceId", u.getAmbulanceId()); m.put("displayName", u.getDisplayName());
        return m;
    }

    private User toUser(Map<String, Object> m) {
        return new User(str(m, "id"), str(m, "username"), str(m, "password"),
            str(m, "role"), (String) m.get("ambulanceId"), str(m, "displayName"));
    }

    private Map<String, Object> toMap(AmbulanceInfo a) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", a.getId());         m.put("driverId",   a.getDriverId());
        m.put("driverName", a.getDriverName()); m.put("lat", a.getLat());
        m.put("lon", a.getLon());       m.put("status",     a.getStatus());
        return m;
    }

    private AmbulanceInfo toAmbulance(Map<String, Object> m) {
        return new AmbulanceInfo(str(m, "id"), str(m, "driverId"), str(m, "driverName"),
            dbl(m, "lat"), dbl(m, "lon"), str(m, "status"));
    }

    private Map<String, Object> toMap(CaseRecord c) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId());                       m.put("address",     c.getAddress());
        m.put("lat", c.getLat());                     m.put("lon",         c.getLon());
        m.put("description", c.getDescription());     m.put("patientDetails", c.getPatientDetails());
        m.put("urgency", c.getUrgency());             m.put("notes",       c.getNotes());
        m.put("status", c.getStatus());               m.put("createdAt",   c.getCreatedAt());
        m.put("assignedAmbulanceId", c.getAssignedAmbulanceId());
        m.put("assignedDriverName",  c.getAssignedDriverName());
        return m;
    }

    private CaseRecord toCase(Map<String, Object> m) {
        CaseRecord c = new CaseRecord();
        c.setId(str(m, "id"));                       c.setAddress(str(m, "address"));
        c.setLat(dbl(m, "lat"));                     c.setLon(dbl(m, "lon"));
        c.setDescription(str(m, "description"));     c.setPatientDetails(str(m, "patientDetails"));
        c.setUrgency(str(m, "urgency", "routine"));  c.setNotes(str(m, "notes"));
        c.setStatus(str(m, "status", "pending"));
        c.setAssignedAmbulanceId((String) m.get("assignedAmbulanceId"));
        c.setAssignedDriverName(str(m, "assignedDriverName"));
        Object ts = m.get("createdAt");
        c.setCreatedAt(ts instanceof Number ? ((Number) ts).longValue() : 0L);
        return c;
    }

    private Map<String, Object> toMap(NoGoZone z) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", z.getId());       m.put("name",   z.getName());
        m.put("minLat", z.getMinLat()); m.put("maxLat", z.getMaxLat());
        m.put("minLon", z.getMinLon()); m.put("maxLon", z.getMaxLon());
        return m;
    }

    private NoGoZone toZone(Map<String, Object> m) {
        NoGoZone z = new NoGoZone();
        z.setId(str(m, "id"));       z.setName(str(m, "name"));
        z.setMinLat(dbl(m, "minLat")); z.setMaxLat(dbl(m, "maxLat"));
        z.setMinLon(dbl(m, "minLon")); z.setMaxLon(dbl(m, "maxLon"));
        return z;
    }

    private String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v instanceof String ? (String) v : "";
    }
    private String str(Map<String, Object> m, String k, String def) {
        Object v = m.get(k); return v instanceof String ? (String) v : def;
    }
    private double dbl(Map<String, Object> m, String k) {
        Object v = m.get(k); return v instanceof Number ? ((Number) v).doubleValue() : 0.0;
    }
}
