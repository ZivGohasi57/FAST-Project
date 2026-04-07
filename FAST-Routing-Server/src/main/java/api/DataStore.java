package api;

import core.models.AmbulanceInfo;
import core.models.CaseRecord;
import core.models.User;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class DataStore {

    private static final DataStore INSTANCE = new DataStore();
    public static DataStore getInstance() { return INSTANCE; }

    private final Map<String, User>          users      = new ConcurrentHashMap<>();
    private final Map<String, CaseRecord>    cases      = new ConcurrentHashMap<>();
    private final Map<String, AmbulanceInfo> ambulances = new ConcurrentHashMap<>();
    private final Map<String, String>        sessions   = new ConcurrentHashMap<>(); // token→userId
    private final AtomicInteger              caseSeq    = new AtomicInteger(1);
    private final AtomicInteger              userSeq    = new AtomicInteger(10);

    private DataStore() {
        // ── Seed users ────────────────────────────────────────────────────
        putUser(new User("u1", "driver1",     "123", "driver",     "amb-1", "יוסי כהן"));
        putUser(new User("u2", "driver2",     "123", "driver",     "amb-2", "משה לוי"));
        putUser(new User("u3", "dispatcher1", "123", "dispatcher", null,    "רחל גולן"));
        putUser(new User("u4", "manager1",    "123", "manager",    null,    "דוד ישראלי"));

        // ── Seed ambulances (default position: Petah Tikva) ───────────────
        ambulances.put("amb-1", new AmbulanceInfo("amb-1","u1","יוסי כהן", 32.1668, 34.9201, "available"));
        ambulances.put("amb-2", new AmbulanceInfo("amb-2","u2","משה לוי",  32.1720, 34.9280, "available"));
    }

    // ── Users ─────────────────────────────────────────────────────────────
    public void putUser(User u) { users.put(u.getId(), u); }
    public User getById(String id) { return users.get(id); }
    public User getByUsername(String uname) {
        return users.values().stream()
                .filter(u -> u.getUsername().equals(uname))
                .findFirst().orElse(null);
    }
    public Collection<User> allUsers() { return Collections.unmodifiableCollection(users.values()); }
    public void deleteUser(String id)  { users.remove(id); }
    public String nextUserId() { return "u" + userSeq.getAndIncrement(); }

    // ── Sessions ──────────────────────────────────────────────────────────
    public void  putSession(String token, String userId) { sessions.put(token, userId); }
    public User  getUserByToken(String token) {
        String uid = sessions.get(token);
        return uid != null ? getById(uid) : null;
    }

    // ── Cases ─────────────────────────────────────────────────────────────
    public CaseRecord createCase(CaseRecord c) {
        String id = "case-" + caseSeq.getAndIncrement();
        c.setId(id);
        c.setStatus("pending");
        c.setCreatedAt(System.currentTimeMillis());
        cases.put(id, c);
        return c;
    }
    public CaseRecord getCaseById(String id) { return cases.get(id); }
    public Collection<CaseRecord> allCases() { return Collections.unmodifiableCollection(cases.values()); }

    public void assignCase(String caseId, String ambulanceId) {
        CaseRecord c = cases.get(caseId);
        AmbulanceInfo a = ambulances.get(ambulanceId);
        if (c != null) {
            c.setAssignedAmbulanceId(ambulanceId);
            c.setAssignedDriverName(a != null ? a.getDriverName() : "");
            c.setStatus("active");
        }
        if (a != null) a.setStatus("busy");
    }

    public CaseRecord getActiveForAmbulance(String ambulanceId) {
        return cases.values().stream()
                .filter(c -> ambulanceId.equals(c.getAssignedAmbulanceId())
                          && "active".equals(c.getStatus()))
                .findFirst().orElse(null);
    }

    public void completeCase(String caseId) {
        CaseRecord c = cases.get(caseId);
        if (c == null) return;
        c.setStatus("completed");
        if (c.getAssignedAmbulanceId() != null) {
            AmbulanceInfo a = ambulances.get(c.getAssignedAmbulanceId());
            if (a != null) a.setStatus("available");
        }
    }

    // ── Ambulances ────────────────────────────────────────────────────────
    public Collection<AmbulanceInfo> allAmbulances() {
        return Collections.unmodifiableCollection(ambulances.values());
    }
    public AmbulanceInfo getAmbulance(String id) { return ambulances.get(id); }
    public void putAmbulance(AmbulanceInfo a)     { ambulances.put(a.getId(), a); }
    public void updateLocation(String id, double lat, double lon) {
        AmbulanceInfo a = ambulances.get(id);
        if (a != null) { a.setLat(lat); a.setLon(lon); }
    }
}
