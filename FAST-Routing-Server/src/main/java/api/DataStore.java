package api;

import com.google.gson.*;
import core.models.*;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.*;

public class DataStore {

    private static final DataStore INSTANCE = new DataStore();
    public static DataStore getInstance() { return INSTANCE; }

    private final String project;
    private final String clientEmail;
    private final PrivateKey privateKey;
    private final HttpClient http = HttpClient.newHttpClient();
    private final Gson gson = new Gson();

    private volatile String accessToken;
    private volatile long tokenExpiresAt = 0;

    private final Map<String, String> sessions = new ConcurrentHashMap<>();
    private final AtomicLong caseSeq = new AtomicLong(1);
    private final AtomicLong userSeq = new AtomicLong(10);
    private final AtomicLong zoneSeq = new AtomicLong(1);

    private static final String FS_BASE = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents";

    private DataStore() {
        try {
            String credJson = System.getenv("FIREBASE_CREDENTIALS");
            if (credJson == null || credJson.isBlank())
                throw new RuntimeException("FIREBASE_CREDENTIALS env var not set");

            JsonObject creds = JsonParser.parseString(credJson).getAsJsonObject();
            project = creds.get("project_id").getAsString();
            clientEmail = creds.get("client_email").getAsString();

            String pem = creds.get("private_key").getAsString()
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s+", "");
            byte[] keyBytes = Base64.getDecoder().decode(pem);
            privateKey = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(keyBytes));

            refreshToken();
            initCounters();
            seedIfEmpty();
        } catch (Exception e) {
            throw new RuntimeException("DataStore init failed: " + e.getMessage(), e);
        }
    }

    // ── OAuth2 ────────────────────────────────────────────────────────────────

    private synchronized void refreshToken() throws Exception {
        long now = System.currentTimeMillis() / 1000;
        String header  = base64url(gson.toJson(Map.of("alg", "RS256", "typ", "JWT")));
        String payload = base64url(gson.toJson(Map.of(
            "iss",   clientEmail,
            "scope", "https://www.googleapis.com/auth/datastore",
            "aud",   "https://oauth2.googleapis.com/token",
            "iat",   now,
            "exp",   now + 3600
        )));
        String sigInput = header + "." + payload;
        Signature sig = Signature.getInstance("SHA256withRSA");
        sig.initSign(privateKey);
        sig.update(sigInput.getBytes(StandardCharsets.UTF_8));
        String jwt = sigInput + "." + base64url(sig.sign());

        String body = "grant_type=" + URLEncoder.encode("urn:ietf:params:oauth:grant-type:jwt-bearer", StandardCharsets.UTF_8)
            + "&assertion=" + URLEncoder.encode(jwt, StandardCharsets.UTF_8);

        HttpResponse<String> resp = http.send(
            HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .header("Content-Type", "application/x-www-form-urlencoded").build(),
            HttpResponse.BodyHandlers.ofString());

        JsonObject r = JsonParser.parseString(resp.body()).getAsJsonObject();
        if (!r.has("access_token"))
            throw new RuntimeException("Token error: " + resp.body());
        accessToken = r.get("access_token").getAsString();
        tokenExpiresAt = System.currentTimeMillis() + (r.get("expires_in").getAsLong() - 60) * 1000;
    }

    private String token() {
        if (System.currentTimeMillis() >= tokenExpiresAt) {
            try { refreshToken(); } catch (Exception e) { throw new RuntimeException(e); }
        }
        return accessToken;
    }

    private static String base64url(String s)  { return base64url(s.getBytes(StandardCharsets.UTF_8)); }
    private static String base64url(byte[] b)  { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }

    // ── Firestore HTTP helpers ────────────────────────────────────────────────

    private String fsUrl(String path) {
        return String.format(FS_BASE, project) + "/" + path;
    }

    private JsonObject fsGet(String path) throws Exception {
        HttpResponse<String> r = http.send(
            HttpRequest.newBuilder(URI.create(fsUrl(path)))
                .GET().header("Authorization", "Bearer " + token()).build(),
            HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() == 404) return null;
        JsonObject obj = JsonParser.parseString(r.body()).getAsJsonObject();
        return obj.has("error") ? null : obj;
    }

    private void fsPatch(String path, JsonObject fields) throws Exception {
        String body = "{\"fields\":" + gson.toJson(fields) + "}";
        http.send(
            HttpRequest.newBuilder(URI.create(fsUrl(path)))
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body))
                .header("Authorization", "Bearer " + token())
                .header("Content-Type", "application/json").build(),
            HttpResponse.BodyHandlers.ofString());
    }

    private void fsPatchFields(String path, Map<String, Object> updates) throws Exception {
        StringBuilder url = new StringBuilder(fsUrl(path));
        boolean first = true;
        for (String field : updates.keySet()) {
            url.append(first ? "?" : "&")
               .append("updateMask.fieldPaths=")
               .append(URLEncoder.encode(field, StandardCharsets.UTF_8));
            first = false;
        }
        String body = "{\"fields\":" + gson.toJson(toFields(updates)) + "}";
        http.send(
            HttpRequest.newBuilder(URI.create(url.toString()))
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body))
                .header("Authorization", "Bearer " + token())
                .header("Content-Type", "application/json").build(),
            HttpResponse.BodyHandlers.ofString());
    }

    private void fsDelete(String path) throws Exception {
        http.send(
            HttpRequest.newBuilder(URI.create(fsUrl(path)))
                .DELETE().header("Authorization", "Bearer " + token()).build(),
            HttpResponse.BodyHandlers.ofString());
    }

    private List<JsonObject> fsList(String collection) throws Exception {
        HttpResponse<String> r = http.send(
            HttpRequest.newBuilder(URI.create(fsUrl(collection)))
                .GET().header("Authorization", "Bearer " + token()).build(),
            HttpResponse.BodyHandlers.ofString());
        JsonObject root = JsonParser.parseString(r.body()).getAsJsonObject();
        if (!root.has("documents")) return Collections.emptyList();
        List<JsonObject> docs = new ArrayList<>();
        for (JsonElement el : root.getAsJsonArray("documents")) docs.add(el.getAsJsonObject());
        return docs;
    }

    private List<JsonObject> fsQuery(String collection, String field, Object value) throws Exception {
        JsonObject fieldRef = new JsonObject();
        fieldRef.addProperty("fieldPath", field);
        JsonObject fieldFilter = new JsonObject();
        fieldFilter.add("field", fieldRef);
        fieldFilter.addProperty("op", "EQUAL");
        fieldFilter.add("value", toFirestoreValue(value));
        JsonObject where = new JsonObject();
        where.add("fieldFilter", fieldFilter);

        JsonObject from = new JsonObject();
        from.addProperty("collectionId", collection);
        JsonArray fromArr = new JsonArray();
        fromArr.add(from);

        JsonObject structuredQuery = new JsonObject();
        structuredQuery.add("from", fromArr);
        structuredQuery.add("where", where);
        JsonObject query = new JsonObject();
        query.add("structuredQuery", structuredQuery);

        String url = "https://firestore.googleapis.com/v1/projects/" + project
            + "/databases/(default)/documents:runQuery";
        HttpResponse<String> r = http.send(
            HttpRequest.newBuilder(URI.create(url))
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(query)))
                .header("Authorization", "Bearer " + token())
                .header("Content-Type", "application/json").build(),
            HttpResponse.BodyHandlers.ofString());

        List<JsonObject> docs = new ArrayList<>();
        for (JsonElement el : JsonParser.parseString(r.body()).getAsJsonArray()) {
            JsonObject obj = el.getAsJsonObject();
            if (obj.has("document")) docs.add(obj.getAsJsonObject("document"));
        }
        return docs;
    }

    // ── Firestore value format ────────────────────────────────────────────────

    private JsonObject toFirestoreValue(Object v) {
        JsonObject o = new JsonObject();
        if (v == null)                               o.addProperty("nullValue", "NULL_VALUE");
        else if (v instanceof String)                o.addProperty("stringValue", (String) v);
        else if (v instanceof Double || v instanceof Float)
                                                     o.addProperty("doubleValue", ((Number) v).doubleValue());
        else if (v instanceof Number)                o.addProperty("integerValue", String.valueOf(((Number) v).longValue()));
        else if (v instanceof Boolean)               o.addProperty("booleanValue", (Boolean) v);
        else                                         o.addProperty("stringValue", v.toString());
        return o;
    }

    private JsonObject toFields(Map<String, Object> m) {
        JsonObject fields = new JsonObject();
        for (Map.Entry<String, Object> e : m.entrySet())
            fields.add(e.getKey(), toFirestoreValue(e.getValue()));
        return fields;
    }

    private Map<String, Object> fromFields(JsonObject doc) {
        if (!doc.has("fields")) return Collections.emptyMap();
        Map<String, Object> m = new HashMap<>();
        for (Map.Entry<String, JsonElement> e : doc.getAsJsonObject("fields").entrySet()) {
            JsonObject val = e.getValue().getAsJsonObject();
            if      (val.has("stringValue"))  m.put(e.getKey(), val.get("stringValue").getAsString());
            else if (val.has("integerValue")) m.put(e.getKey(), Long.parseLong(val.get("integerValue").getAsString()));
            else if (val.has("doubleValue"))  m.put(e.getKey(), val.get("doubleValue").getAsDouble());
            else if (val.has("booleanValue")) m.put(e.getKey(), val.get("booleanValue").getAsBoolean());
            else if (val.has("nullValue"))    m.put(e.getKey(), null);
        }
        return m;
    }

    // ── Counters ──────────────────────────────────────────────────────────────

    private void initCounters() throws Exception {
        JsonObject doc = fsGet("meta/counters");
        if (doc == null) return;
        Map<String, Object> m = fromFields(doc);
        if (m.containsKey("caseSeq")) caseSeq.set(((Number) m.get("caseSeq")).longValue());
        if (m.containsKey("userSeq")) userSeq.set(((Number) m.get("userSeq")).longValue());
        if (m.containsKey("zoneSeq")) zoneSeq.set(((Number) m.get("zoneSeq")).longValue());
    }

    private void saveCounters() {
        try {
            fsPatch("meta/counters", toFields(Map.of(
                "caseSeq", caseSeq.get(),
                "userSeq", userSeq.get(),
                "zoneSeq", zoneSeq.get()
            )));
        } catch (Exception e) { /* non-fatal */ }
    }

    // ── Seed ──────────────────────────────────────────────────────────────────

    private void seedIfEmpty() throws Exception {
        if (!fsList("users").isEmpty()) return;

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
        try { fsPatch("users/" + u.getId(), toFields(userToMap(u))); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    public User getById(String id) {
        try {
            JsonObject doc = fsGet("users/" + id);
            return doc != null ? toUser(fromFields(doc)) : null;
        } catch (Exception e) { return null; }
    }

    public User getByUsername(String uname) {
        try {
            List<JsonObject> docs = fsQuery("users", "username", uname);
            return docs.isEmpty() ? null : toUser(fromFields(docs.get(0)));
        } catch (Exception e) { return null; }
    }

    public Collection<User> allUsers() {
        try {
            return fsList("users").stream().map(d -> toUser(fromFields(d))).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void deleteUser(String id) {
        try { fsDelete("users/" + id); } catch (Exception e) { /* ignore */ }
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
        try { fsPatch("cases/" + c.getId(), toFields(caseToMap(c))); }
        catch (Exception e) { throw new RuntimeException(e); }
        return c;
    }

    public CaseRecord getCaseById(String id) {
        try {
            JsonObject doc = fsGet("cases/" + id);
            return doc != null ? toCase(fromFields(doc)) : null;
        } catch (Exception e) { return null; }
    }

    public Collection<CaseRecord> allCases() {
        try {
            return fsList("cases").stream().map(d -> toCase(fromFields(d))).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void assignCase(String caseId, String ambulanceId) {
        try {
            AmbulanceInfo a = getAmbulance(ambulanceId);
            Map<String, Object> caseUpdates = new HashMap<>();
            caseUpdates.put("status", "active");
            caseUpdates.put("assignedAmbulanceId", ambulanceId);
            caseUpdates.put("assignedDriverName", a != null ? a.getDriverName() : "");
            fsPatchFields("cases/" + caseId, caseUpdates);
            if (a != null) fsPatchFields("ambulances/" + ambulanceId, Map.of("status", "busy"));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public CaseRecord getActiveForAmbulance(String ambulanceId) {
        try {
            return fsQuery("cases", "assignedAmbulanceId", ambulanceId).stream()
                .map(d -> toCase(fromFields(d)))
                .filter(c -> "active".equals(c.getStatus()) || "cancel_requested".equals(c.getStatus()))
                .findFirst().orElse(null);
        } catch (Exception e) { return null; }
    }

    public void updateCaseNotes(String caseId, String notes, String patientDetails) {
        try {
            JsonObject doc = fsGet("cases/" + caseId);
            if (doc == null) return;
            Map<String, Object> m = fromFields(doc);
            Map<String, Object> updates = new HashMap<>();
            if (notes != null) {
                String ts  = new java.text.SimpleDateFormat("HH:mm").format(new Date());
                String cur = (String) m.get("notes");
                updates.put("notes", (cur == null || cur.isEmpty())
                    ? "[" + ts + "] " + notes
                    : cur + "\n[" + ts + "] " + notes);
            }
            if (patientDetails != null) updates.put("patientDetails", patientDetails);
            if (!updates.isEmpty()) fsPatchFields("cases/" + caseId, updates);
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void completeCase(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c == null) return;
            fsPatchFields("cases/" + caseId, Map.of("status", "completed"));
            if (c.getAssignedAmbulanceId() != null)
                fsPatchFields("ambulances/" + c.getAssignedAmbulanceId(), Map.of("status", "available"));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void requestCancel(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c != null && "active".equals(c.getStatus()))
                fsPatchFields("cases/" + caseId, Map.of("status", "cancel_requested"));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void cancelCase(String caseId) {
        try {
            CaseRecord c = getCaseById(caseId);
            if (c == null) return;
            fsPatchFields("cases/" + caseId, Map.of("status", "cancelled"));
            if (c.getAssignedAmbulanceId() != null)
                fsPatchFields("ambulances/" + c.getAssignedAmbulanceId(), Map.of("status", "available"));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    // ── No-Go Zones ───────────────────────────────────────────────────────────

    public NoGoZone addNoGoZone(NoGoZone z) {
        z.setId("zone-" + zoneSeq.getAndIncrement());
        saveCounters();
        try { fsPatch("nogozones/" + z.getId(), toFields(zoneToMap(z))); }
        catch (Exception e) { throw new RuntimeException(e); }
        return z;
    }

    public Collection<NoGoZone> allNoGoZones() {
        try {
            return fsList("nogozones").stream().map(d -> toZone(fromFields(d))).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public void deleteNoGoZone(String id) {
        try { fsDelete("nogozones/" + id); } catch (Exception e) { /* ignore */ }
    }

    // ── Ambulances ────────────────────────────────────────────────────────────

    public Collection<AmbulanceInfo> allAmbulances() {
        try {
            return fsList("ambulances").stream().map(d -> toAmbulance(fromFields(d))).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    public AmbulanceInfo getAmbulance(String id) {
        try {
            JsonObject doc = fsGet("ambulances/" + id);
            return doc != null ? toAmbulance(fromFields(doc)) : null;
        } catch (Exception e) { return null; }
    }

    public void putAmbulance(AmbulanceInfo a) {
        try { fsPatch("ambulances/" + a.getId(), toFields(ambulanceToMap(a))); }
        catch (Exception e) { throw new RuntimeException(e); }
    }

    public void updateLocation(String id, double lat, double lon) {
        try {
            Map<String, Object> upd = new HashMap<>();
            upd.put("lat", lat);
            upd.put("lon", lon);
            fsPatchFields("ambulances/" + id, upd);
        } catch (Exception e) { /* ignore */ }
    }

    // ── Model <-> Map converters ──────────────────────────────────────────────

    private Map<String, Object> userToMap(User u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());           m.put("username",    u.getUsername());
        m.put("password", u.getPassword()); m.put("role",      u.getRole());
        m.put("ambulanceId", u.getAmbulanceId()); m.put("displayName", u.getDisplayName());
        return m;
    }

    private User toUser(Map<String, Object> m) {
        return new User(str(m,"id"), str(m,"username"), str(m,"password"),
            str(m,"role"), (String) m.get("ambulanceId"), str(m,"displayName"));
    }

    private Map<String, Object> ambulanceToMap(AmbulanceInfo a) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", a.getId()); m.put("driverId",  a.getDriverId());
        m.put("driverName", a.getDriverName()); m.put("lat", a.getLat());
        m.put("lon", a.getLon()); m.put("status", a.getStatus());
        return m;
    }

    private AmbulanceInfo toAmbulance(Map<String, Object> m) {
        return new AmbulanceInfo(str(m,"id"), str(m,"driverId"), str(m,"driverName"),
            dbl(m,"lat"), dbl(m,"lon"), str(m,"status"));
    }

    private Map<String, Object> caseToMap(CaseRecord c) {
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
