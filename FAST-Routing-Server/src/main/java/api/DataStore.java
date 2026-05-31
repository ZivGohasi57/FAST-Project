package api;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.gson.*;
import core.models.*;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.*;

public class DataStore {

    private static final String PROJECT_ID = System.getenv().getOrDefault("FIREBASE_PROJECT_ID", "");
    private static final String BASE_URL   =
            "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";
    private static final List<String> SCOPES =
            List.of("https://www.googleapis.com/auth/cloud-platform");

    // ── In-memory cache ───────────────────────────────────────────────────────

    private static class CacheEntry {
        final List<Map<String, Object>> data;
        final long expires;
        CacheEntry(List<Map<String, Object>> data, long ttlMs) {
            this.data    = data;
            this.expires = System.currentTimeMillis() + ttlMs;
        }
        boolean isValid() { return System.currentTimeMillis() < expires; }
    }

    // IMPORTANT: COL_TTL must be declared BEFORE INSTANCE to avoid null during static init
    private static final Map<String, Long> COL_TTL = Map.of(
        "cases",      2_000L,
        "ambulances", 2_000L,
        "users",      60_000L,
        "nogozones",  60_000L
    );

    private static final DataStore INSTANCE = new DataStore();
    public static DataStore getInstance() { return INSTANCE; }

    private final GoogleCredentials credentials;
    private final HttpClient         http = HttpClient.newHttpClient();
    private final Gson               gson = new Gson();
    private final Map<String, String> sessions = new ConcurrentHashMap<>();
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    private DataStore() {
        String sa = System.getenv("FIREBASE_SERVICE_ACCOUNT");
        if (sa == null || sa.isBlank())
            throw new RuntimeException("FIREBASE_SERVICE_ACCOUNT env var is not set");
        try {
            credentials = ServiceAccountCredentials
                    .fromStream(new ByteArrayInputStream(sa.getBytes(StandardCharsets.UTF_8)))
                    .createScoped(SCOPES);
            seedIfEmpty();
        } catch (IOException e) {
            throw new RuntimeException("Firebase credentials init failed: " + e.getMessage(), e);
        }
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    private String token() {
        try {
            credentials.refreshIfExpired();
            return credentials.getAccessToken().getTokenValue();
        } catch (IOException e) { throw new RuntimeException("Firebase token refresh failed", e); }
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────

    private String httpGet(String url) {
        try {
            var req = HttpRequest.newBuilder().uri(URI.create(url))
                    .header("Authorization", "Bearer " + token()).GET().build();
            return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    private String httpPatch(String url, String body) {
        try {
            var req = HttpRequest.newBuilder().uri(URI.create(url))
                    .header("Authorization", "Bearer " + token())
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(body)).build();
            return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    private void httpDelete(String url) {
        try {
            var req = HttpRequest.newBuilder().uri(URI.create(url))
                    .header("Authorization", "Bearer " + token()).DELETE().build();
            http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    // ── Firestore value conversion ────────────────────────────────────────────

    private JsonObject toFirestoreDoc(Map<String, Object> doc) {
        JsonObject fields = new JsonObject();
        for (var e : doc.entrySet()) fields.add(e.getKey(), toFsValue(e.getValue()));
        JsonObject wrapper = new JsonObject(); wrapper.add("fields", fields); return wrapper;
    }

    private JsonElement toFsValue(Object val) {
        JsonObject v = new JsonObject();
        if      (val == null)                                   v.add("nullValue", JsonNull.INSTANCE);
        else if (val instanceof String  s)                      v.addProperty("stringValue",  s);
        else if (val instanceof Boolean b)                      v.addProperty("booleanValue", b);
        else if (val instanceof Double || val instanceof Float) v.addProperty("doubleValue",  ((Number)val).doubleValue());
        else if (val instanceof Number  n)                      v.addProperty("integerValue", String.valueOf(n.longValue()));
        else                                                    v.addProperty("stringValue",  val.toString());
        return v;
    }

    private Map<String, Object> fromFirestoreDoc(JsonObject doc) {
        JsonObject fields = doc.has("fields") ? doc.getAsJsonObject("fields") : new JsonObject();
        Map<String, Object> map = new HashMap<>();
        for (var e : fields.entrySet()) {
            JsonObject v = e.getValue().getAsJsonObject();
            if      (v.has("stringValue"))  map.put(e.getKey(), v.get("stringValue").getAsString());
            else if (v.has("integerValue")) map.put(e.getKey(), Long.parseLong(v.get("integerValue").getAsString()));
            else if (v.has("doubleValue"))  map.put(e.getKey(), v.get("doubleValue").getAsDouble());
            else if (v.has("booleanValue")) map.put(e.getKey(), v.get("booleanValue").getAsBoolean());
            else                            map.put(e.getKey(), null);
        }
        return map;
    }

    private String docId(JsonObject doc) {
        String name = doc.get("name").getAsString();
        return name.substring(name.lastIndexOf('/') + 1);
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    private void putDoc(String col, String id, Map<String, Object> doc) {
        httpPatch(BASE_URL + "/" + col + "/" + id, gson.toJson(toFirestoreDoc(doc)));
        cache.remove(col);
    }

    private Map<String, Object> getDoc(String col, String id) {
        JsonObject obj = gson.fromJson(httpGet(BASE_URL + "/" + col + "/" + id), JsonObject.class);
        if (obj == null || obj.has("error")) return null;
        Map<String, Object> map = fromFirestoreDoc(obj);
        map.put("id", id);
        return map;
    }

    private void deleteDoc(String col, String id) {
        httpDelete(BASE_URL + "/" + col + "/" + id);
        cache.remove(col);
    }

    private List<Map<String, Object>> listCol(String col) {
        CacheEntry entry = cache.get(col);
        if (entry != null && entry.isValid()) return entry.data;

        JsonObject obj = gson.fromJson(httpGet(BASE_URL + "/" + col + "?pageSize=500"), JsonObject.class);
        List<Map<String, Object>> result = new ArrayList<>();
        if (obj != null && obj.has("documents")) {
            for (JsonElement el : obj.getAsJsonArray("documents")) {
                JsonObject d  = el.getAsJsonObject();
                Map<String, Object> map = fromFirestoreDoc(d);
                map.put("id", docId(d));
                result.add(map);
            }
        }
        long ttl = COL_TTL.getOrDefault(col, 5_000L);
        cache.put(col, new CacheEntry(result, ttl));
        return result;
    }

    // ── Counters ──────────────────────────────────────────────────────────────

    private synchronized long nextSeq(String field) {
        Map<String, Object> doc = getDoc("counters", "sequences");
        if (doc == null) doc = new HashMap<>();
        long cur  = doc.containsKey(field) ? ((Number) doc.get(field)).longValue() : 1L;
        doc.put(field, cur + 1);
        doc.remove("id");
        putDoc("counters", "sequences", doc);
        return cur;
    }

    // ── Seed ──────────────────────────────────────────────────────────────────

    private void seedIfEmpty() {
        if (!listCol("users").isEmpty()) return;

        putUser(new DriverUser("u1", "driver1",     "123", "amb-1", "יוסי כהן", "101"));
        putUser(new DriverUser("u2", "driver2",     "123", "amb-2", "משה לוי",  "102"));
        putUser(new User("u3", "dispatcher1", "123", "dispatcher", null, "רחל גולן"));
        putUser(new User("u4", "manager1",    "123", "manager",    null, "דוד ישראלי"));

        AmbulanceInfo a1 = new AmbulanceInfo("amb-1", "u1", "יוסי כהן", 32.1668, 34.9201, "available");
        a1.setAmbulanceNumber("101");
        AmbulanceInfo a2 = new AmbulanceInfo("amb-2", "u2", "משה לוי",  32.1720, 34.9280, "available");
        a2.setAmbulanceNumber("102");
        putAmbulance(a1);
        putAmbulance(a2);

        Map<String, Object> seq = new HashMap<>();
        seq.put("caseSeq", 1L); seq.put("userSeq", 10L); seq.put("zoneSeq", 1L);
        putDoc("counters", "sequences", seq);
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    public void putUser(User u)    { putDoc("users", u.getId(), userToMap(u)); }
    public void deleteUser(String id) { deleteDoc("users", id); }

    public User getById(String id) {
        Map<String, Object> d = getDoc("users", id); return d != null ? toUser(d) : null;
    }

    public User getByUsername(String uname) {
        return listCol("users").stream()
                .filter(d -> uname.equals(d.get("username")))
                .findFirst().map(this::toUser).orElse(null);
    }

    public Collection<User> allUsers() {
        return listCol("users").stream().map(this::toUser).collect(Collectors.toList());
    }

    public String nextUserId() { return "u" + nextSeq("userSeq"); }

    // ── Sessions (in-memory — ephemeral by design) ────────────────────────────

    public void putSession(String token, String userId)  { sessions.put(token, userId); }
    public User getUserByToken(String token) {
        String uid = sessions.get(token); return uid != null ? getById(uid) : null;
    }

    // ── Cases ─────────────────────────────────────────────────────────────────

    public CaseRecord createCase(CaseRecord c) {
        c.setId("case-" + nextSeq("caseSeq"));
        c.setStatus("pending");
        c.setCreatedAt(System.currentTimeMillis());
        putDoc("cases", c.getId(), caseToMap(c));
        return c;
    }

    public CaseRecord getCaseById(String id) {
        Map<String, Object> d = getDoc("cases", id); return d != null ? toCase(d) : null;
    }

    public Collection<CaseRecord> allCases() {
        return listCol("cases").stream().map(this::toCase).collect(Collectors.toList());
    }

    public void assignCase(String caseId, String ambulanceId) {
        AmbulanceInfo a   = getAmbulance(ambulanceId);
        Map<String, Object> cd = getDoc("cases", caseId);
        if (cd == null) return;
        cd.put("status", "active");
        cd.put("assignedAmbulanceId", ambulanceId);
        cd.put("assignedDriverName",  a != null ? a.getDriverName() : "");
        cd.remove("id");
        putDoc("cases", caseId, cd);
        // Set status=busy AND activeCaseId so the driver's ambulance poll can deliver the case
        String url = BASE_URL + "/ambulances/" + ambulanceId
                + "?updateMask.fieldPaths=status&updateMask.fieldPaths=activeCaseId";
        Map<String, Object> ap = new HashMap<>();
        ap.put("status", "busy"); ap.put("activeCaseId", caseId);
        httpPatch(url, gson.toJson(toFirestoreDoc(ap)));
        cache.remove("ambulances");
    }

    public CaseRecord getActiveForAmbulance(String ambulanceId) {
        return listCol("cases").stream()
                .filter(d -> ambulanceId.equals(d.get("assignedAmbulanceId")))
                .filter(d -> { String s = (String) d.get("status");
                               return "active".equals(s) || "cancel_requested".equals(s); })
                .map(this::toCase).findFirst().orElse(null);
    }

    public void updateCaseNotes(String caseId, String notes, String patientDetails) {
        Map<String, Object> doc = getDoc("cases", caseId);
        if (doc == null) return;
        if (notes != null) {
            String ts  = new java.text.SimpleDateFormat("HH:mm").format(new Date());
            String cur = (String) doc.get("notes");
            doc.put("notes", (cur == null || cur.isEmpty())
                    ? "[" + ts + "] " + notes
                    : cur + "\n[" + ts + "] " + notes);
        }
        if (patientDetails != null) doc.put("patientDetails", patientDetails);
        doc.remove("id");
        putDoc("cases", caseId, doc);
    }

    public void markArrival(String caseId) {
        String url = BASE_URL + "/cases/" + caseId + "?updateMask.fieldPaths=arrivalTime";
        Map<String, Object> m = new HashMap<>();
        m.put("arrivalTime", System.currentTimeMillis());
        httpPatch(url, gson.toJson(toFirestoreDoc(m)));
        cache.remove("cases");
    }

    public void completeCase(String caseId) {
        Map<String, Object> doc = getDoc("cases", caseId);
        if (doc == null) return;
        String ambId = (String) doc.get("assignedAmbulanceId");
        doc.put("status", "completed"); doc.remove("id");
        putDoc("cases", caseId, doc);
        if (ambId != null) {
            String url = BASE_URL + "/ambulances/" + ambId
                    + "?updateMask.fieldPaths=status&updateMask.fieldPaths=activeCaseId";
            Map<String, Object> ap = new HashMap<>();
            ap.put("status", "available"); ap.put("activeCaseId", (Object) null);
            httpPatch(url, gson.toJson(toFirestoreDoc(ap)));
            cache.remove("ambulances");
        }
    }

    public void requestCancel(String caseId) {
        Map<String, Object> doc = getDoc("cases", caseId);
        if (doc != null && "active".equals(doc.get("status"))) {
            doc.put("status", "cancel_requested"); doc.remove("id");
            putDoc("cases", caseId, doc);
        }
    }

    public void cancelCase(String caseId) {
        Map<String, Object> doc = getDoc("cases", caseId);
        if (doc == null) return;
        String ambId = (String) doc.get("assignedAmbulanceId");
        doc.put("status", "cancelled"); doc.remove("id");
        putDoc("cases", caseId, doc);
        if (ambId != null) {
            String url = BASE_URL + "/ambulances/" + ambId
                    + "?updateMask.fieldPaths=status&updateMask.fieldPaths=activeCaseId";
            Map<String, Object> ap = new HashMap<>();
            ap.put("status", "available"); ap.put("activeCaseId", (Object) null);
            httpPatch(url, gson.toJson(toFirestoreDoc(ap)));
            cache.remove("ambulances");
        }
    }

    // ── No-Go Zones ───────────────────────────────────────────────────────────

    public NoGoZone addNoGoZone(NoGoZone z) {
        z.setId("zone-" + nextSeq("zoneSeq"));
        putDoc("nogozones", z.getId(), zoneToMap(z));
        return z;
    }

    /** All zones that are currently active — used by routing engine. */
    public Collection<NoGoZone> allNoGoZones() {
        return listCol("nogozones").stream()
                .map(this::toZone)
                .filter(NoGoZone::isCurrentlyActive)
                .collect(Collectors.toList());
    }

    /** All zones regardless of schedule — used by manager UI. */
    public Collection<NoGoZone> allNoGoZonesRaw() {
        return listCol("nogozones").stream().map(this::toZone).collect(Collectors.toList());
    }

    public void deleteNoGoZone(String id) { deleteDoc("nogozones", id); }

    // ── Ambulances ────────────────────────────────────────────────────────────

    public Collection<AmbulanceInfo> allAmbulances() {
        return listCol("ambulances").stream().map(this::toAmbulance).collect(Collectors.toList());
    }

    public AmbulanceInfo getAmbulance(String id) {
        Map<String, Object> d = getDoc("ambulances", id); return d != null ? toAmbulance(d) : null;
    }

    public void putAmbulance(AmbulanceInfo a) { putDoc("ambulances", a.getId(), ambulanceToMap(a)); }
    public void deleteAmbulance(String id)   { deleteDoc("ambulances", id); }

    public void assignDriverToAmbulance(String ambulanceId, String driverId) {
        User driver = getById(driverId);
        if (driver == null) return;

        // Release driver from their old ambulance (if different)
        String oldAmbId = driver.getAmbulanceId();
        if (oldAmbId != null && !oldAmbId.isEmpty() && !oldAmbId.equals(ambulanceId)) {
            Map<String, Object> oldAmb = getDoc("ambulances", oldAmbId);
            if (oldAmb != null && driverId.equals(oldAmb.get("driverId"))) {
                oldAmb.put("driverId", ""); oldAmb.put("driverName", "");
                oldAmb.remove("id");
                putDoc("ambulances", oldAmbId, oldAmb);
            }
        }

        // Assign driver to new ambulance
        Map<String, Object> ambDoc = getDoc("ambulances", ambulanceId);
        if (ambDoc == null) return;
        ambDoc.put("driverId",   driverId);
        ambDoc.put("driverName", driver.getDisplayName());
        ambDoc.put("status",     "available");
        ambDoc.remove("id");
        putDoc("ambulances", ambulanceId, ambDoc);

        // Partial-update driver's ambulanceId in Firestore
        String url = BASE_URL + "/users/" + driverId + "?updateMask.fieldPaths=ambulanceId";
        Map<String, Object> m = new HashMap<>();
        m.put("ambulanceId", ambulanceId);
        httpPatch(url, gson.toJson(toFirestoreDoc(m)));
        cache.remove("users");
    }

    public void setAmbulanceStatus(String id, String status) {
        patchStatus("ambulances", id, status);
    }

    public void disconnectDriver(String ambulanceId) {
        Map<String, Object> ambDoc = getDoc("ambulances", ambulanceId);
        if (ambDoc == null) return;
        String driverId = (String) ambDoc.get("driverId");
        ambDoc.put("driverId",   "");
        ambDoc.put("driverName", "");
        ambDoc.put("status",     "offline");
        ambDoc.remove("id");
        putDoc("ambulances", ambulanceId, ambDoc);
        // Clear ambulanceId from driver's Firestore profile
        if (driverId != null && !driverId.isEmpty()) {
            String url = BASE_URL + "/users/" + driverId + "?updateMask.fieldPaths=ambulanceId";
            Map<String, Object> m = new HashMap<>();
            m.put("ambulanceId", (Object) null);
            httpPatch(url, gson.toJson(toFirestoreDoc(m)));
            cache.remove("users");
        }
    }

    public void updateLocation(String id, double lat, double lon) {
        // Skip driver GPS updates when a manager has manually locked the position
        Map<String, Object> existing = getDoc("ambulances", id);
        if (existing != null && Boolean.TRUE.equals(existing.get("locationLocked"))) return;
        String url = BASE_URL + "/ambulances/" + id
                + "?updateMask.fieldPaths=lat&updateMask.fieldPaths=lon";
        Map<String, Object> partial = new HashMap<>();
        partial.put("lat", lat); partial.put("lon", lon);
        httpPatch(url, gson.toJson(toFirestoreDoc(partial)));
        cache.remove("ambulances");
    }

    public void overrideLocation(String id, double lat, double lon) {
        String url = BASE_URL + "/ambulances/" + id
                + "?updateMask.fieldPaths=lat&updateMask.fieldPaths=lon&updateMask.fieldPaths=locationLocked";
        Map<String, Object> partial = new HashMap<>();
        partial.put("lat", lat); partial.put("lon", lon); partial.put("locationLocked", true);
        httpPatch(url, gson.toJson(toFirestoreDoc(partial)));
        cache.remove("ambulances");
    }

    public void releaseLocationLock(String id) {
        String url = BASE_URL + "/ambulances/" + id + "?updateMask.fieldPaths=locationLocked";
        Map<String, Object> partial = new HashMap<>();
        partial.put("locationLocked", false);
        httpPatch(url, gson.toJson(toFirestoreDoc(partial)));
        cache.remove("ambulances");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void patchStatus(String col, String id, String status) {
        String url = BASE_URL + "/" + col + "/" + id + "?updateMask.fieldPaths=status";
        Map<String, Object> m = new HashMap<>(); m.put("status", status);
        httpPatch(url, gson.toJson(toFirestoreDoc(m)));
        cache.remove(col);
    }

    // ── Model converters ──────────────────────────────────────────────────────

    private Map<String, Object> userToMap(User u) {
        Map<String, Object> m = new HashMap<>();
        m.put("username", u.getUsername()); m.put("password",    u.getPassword());
        m.put("role",     u.getRole());     m.put("ambulanceId", u.getAmbulanceId());
        m.put("displayName", u.getDisplayName());
        if (u instanceof DriverUser du && du.getAmbulanceNumber() != null)
            m.put("ambulanceNumber", du.getAmbulanceNumber());
        return m;
    }

    private User toUser(Map<String, Object> m) {
        String role = str(m, "role");
        if ("driver".equals(role)) {
            return new DriverUser(str(m,"id"), str(m,"username"), str(m,"password"),
                    (String) m.get("ambulanceId"), str(m,"displayName"),
                    str(m,"ambulanceNumber"));
        }
        return new User(str(m,"id"), str(m,"username"), str(m,"password"),
                role, (String) m.get("ambulanceId"), str(m,"displayName"));
    }

    private Map<String, Object> ambulanceToMap(AmbulanceInfo a) {
        Map<String, Object> m = new HashMap<>();
        m.put("driverId",       a.getDriverId());     m.put("driverName", a.getDriverName());
        m.put("lat",            a.getLat());           m.put("lon",        a.getLon());
        m.put("status",         a.getStatus());
        m.put("locationLocked", a.isLocationLocked());
        m.put("activeCaseId",   a.getActiveCaseId());
        if (a.getAmbulanceNumber() != null) m.put("ambulanceNumber", a.getAmbulanceNumber());
        return m;
    }

    private AmbulanceInfo toAmbulance(Map<String, Object> m) {
        AmbulanceInfo a = new AmbulanceInfo(str(m,"id"), str(m,"driverId"), str(m,"driverName"),
                dbl(m,"lat"), dbl(m,"lon"), str(m,"status"));
        a.setAmbulanceNumber((String) m.get("ambulanceNumber"));
        a.setLocationLocked(Boolean.TRUE.equals(m.get("locationLocked")));
        a.setActiveCaseId((String) m.get("activeCaseId"));
        return a;
    }

    private Map<String, Object> caseToMap(CaseRecord c) {
        Map<String, Object> m = new HashMap<>();
        m.put("address",        c.getAddress());       m.put("lat",             c.getLat());
        m.put("lon",            c.getLon());            m.put("description",     c.getDescription());
        m.put("patientDetails", c.getPatientDetails()); m.put("urgency",         c.getUrgency());
        m.put("notes",          c.getNotes());          m.put("status",          c.getStatus());
        m.put("createdAt",      c.getCreatedAt());      m.put("arrivalTime",     c.getArrivalTime());
        m.put("assignedAmbulanceId", c.getAssignedAmbulanceId());
        m.put("assignedDriverName",  c.getAssignedDriverName());
        return m;
    }

    private CaseRecord toCase(Map<String, Object> m) {
        CaseRecord c = new CaseRecord();
        c.setId(str(m,"id"));                    c.setAddress(str(m,"address"));
        c.setLat(dbl(m,"lat"));                  c.setLon(dbl(m,"lon"));
        c.setDescription(str(m,"description"));  c.setPatientDetails(str(m,"patientDetails"));
        c.setUrgency(str(m,"urgency","routine")); c.setNotes(str(m,"notes"));
        c.setStatus(str(m,"status","pending"));
        c.setAssignedAmbulanceId((String) m.get("assignedAmbulanceId"));
        c.setAssignedDriverName(str(m,"assignedDriverName"));
        Object ts = m.get("createdAt");
        c.setCreatedAt(ts instanceof Number ? ((Number) ts).longValue() : 0L);
        Object at = m.get("arrivalTime");
        c.setArrivalTime(at instanceof Number ? ((Number) at).longValue() : 0L);
        return c;
    }

    private Map<String, Object> zoneToMap(NoGoZone z) {
        Map<String, Object> m = new HashMap<>();
        m.put("name",   z.getName());   m.put("type",   z.getType() != null ? z.getType() : "permanent");
        m.put("minLat", z.getMinLat()); m.put("maxLat", z.getMaxLat());
        m.put("minLon", z.getMinLon()); m.put("maxLon", z.getMaxLon());
        if (z.getDailyStart() != null) m.put("dailyStart", z.getDailyStart());
        if (z.getDailyEnd()   != null) m.put("dailyEnd",   z.getDailyEnd());
        if (z.getOnceStart()  != 0)    m.put("onceStart",  z.getOnceStart());
        if (z.getOnceEnd()    != 0)    m.put("onceEnd",    z.getOnceEnd());
        return m;
    }

    private NoGoZone toZone(Map<String, Object> m) {
        NoGoZone z = new NoGoZone();
        z.setId(str(m,"id")); z.setName(str(m,"name")); z.setType(str(m,"type","permanent"));
        z.setMinLat(dbl(m,"minLat")); z.setMaxLat(dbl(m,"maxLat"));
        z.setMinLon(dbl(m,"minLon")); z.setMaxLon(dbl(m,"maxLon"));
        Object ds = m.get("dailyStart"); if (ds instanceof String) z.setDailyStart((String) ds);
        Object de = m.get("dailyEnd");   if (de instanceof String) z.setDailyEnd((String) de);
        Object os = m.get("onceStart");  if (os instanceof Number) z.setOnceStart(((Number) os).longValue());
        Object oe = m.get("onceEnd");    if (oe instanceof Number) z.setOnceEnd(((Number) oe).longValue());
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
