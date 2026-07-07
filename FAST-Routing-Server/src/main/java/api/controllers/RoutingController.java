package api.controllers;

import api.DataStore;
import com.google.gson.*;
import com.sun.net.httpserver.*;
import core.models.*;
import routing.engine.*;
import routing.strategies.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class RoutingController {

    static final FastRoutingEngineClient ENGINE_CLIENT =
            new FastRoutingEngineClient("export.osm", "graph-cache-v2");

    static final DataStore DS   = DataStore.getInstance();
    static final Gson      GSON = new Gson();

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8082"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/route",      new RouteHandler());
        server.createContext("/api/signals",    new SignalsHandler());
        server.createContext("/api/traffic",    new TrafficHandler());
        server.createContext("/api/auth/login", new LoginHandler());
        server.createContext("/api/ambulances", new AmbulanceHandler());
        server.createContext("/api/cases",      new CaseHandler());
        server.createContext("/api/eta",        new EtaHandler());
        server.createContext("/api/users",      new UserHandler());
        server.createContext("/api/nogozones",  new NoGoZoneHandler());
        server.createContext("/api/hospitals",  new HospitalHandler());
        server.setExecutor(null);
        server.start();
        System.out.println("FAST API Server is running on port " + port);
    }

    static String hashPassword(String plain) {
        try {
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            PBEKeySpec spec = new PBEKeySpec(plain.toCharArray(), salt, 65_536, 256);
            byte[] hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec).getEncoded();
            return Base64.getEncoder().encodeToString(salt) + ":" + Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    static boolean verifyPassword(String plain, String stored) {
        try {
            if (!stored.contains(":")) return plain.equals(stored);
            String[] parts = stored.split(":", 2);
            byte[] salt         = Base64.getDecoder().decode(parts[0]);
            byte[] expectedHash = Base64.getDecoder().decode(parts[1]);
            PBEKeySpec spec = new PBEKeySpec(plain.toCharArray(), salt, 65_536, 256);
            byte[] actualHash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec).getEncoded();
            return java.util.Arrays.equals(expectedHash, actualHash);
        } catch (Exception e) { return false; }
    }

    static void cors(HttpExchange ex) throws IOException {
        ex.getResponseHeaders().set("Access-Control-Allow-Origin",  "*");
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }

    static boolean handleOptions(HttpExchange ex) throws IOException {
        if ("OPTIONS".equals(ex.getRequestMethod())) {
            cors(ex);
            ex.sendResponseHeaders(204, -1);
            ex.getResponseBody().close();
            return true;
        }
        return false;
    }

    static void sendJson(HttpExchange ex, Object data) throws IOException {
        cors(ex);
        byte[] bytes = GSON.toJson(data).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    static void sendStatus(HttpExchange ex, int code) throws IOException {
        cors(ex);
        ex.sendResponseHeaders(code, -1);
        ex.getResponseBody().close();
    }

    static JsonObject body(HttpExchange ex) throws IOException {
        String s = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        return s.isEmpty() ? new JsonObject() : JsonParser.parseString(s).getAsJsonObject();
    }

    static Map<String, String> queryMap(String query) {
        Map<String, String> m = new HashMap<>();
        if (query == null) return m;
        for (String p : query.split("&")) {
            String[] kv = p.split("=", 2);
            if (kv.length == 2) m.put(kv[0], URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        return m;
    }

    static class RouteHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;
            if (!"GET".equals(exchange.getRequestMethod())) { sendStatus(exchange, 405); return; }

            Map<String, String> params = queryMap(exchange.getRequestURI().getQuery());
            double  startLat    = Double.parseDouble(params.get("startLat"));
            double  startLon    = Double.parseDouble(params.get("startLon"));
            double  endLat      = Double.parseDouble(params.get("endLat"));
            double  endLon      = Double.parseDouble(params.get("endLon"));
            boolean isEmergency = Boolean.parseBoolean(params.get("isEmergency"));

            FastRoutingEngine engine = new FastRoutingEngine(
                isEmergency ? new EmergencyRoutingStrategy(ENGINE_CLIENT)
                            : new RoutineRoutingStrategy(ENGINE_CLIENT));
            RouteResponse resp = engine.getOptimalRoute(
                    new RouteRequest(startLat, startLon, endLat, endLon, isEmergency));

            if (isEmergency && resp.getPath() != null && !DS.allNoGoZones().isEmpty()) {
                boolean blocked = resp.getPath().stream()
                    .anyMatch(c -> DS.allNoGoZones().stream()
                        .anyMatch(z -> z.contains(c.getLat(), c.getLon())));
                if (blocked) {
                    resp = new FastRoutingEngine(new RoutineRoutingStrategy(ENGINE_CLIENT))
                        .getOptimalRoute(new RouteRequest(startLat, startLon, endLat, endLon, false));
                }
            }
            sendJson(exchange, resp);
        }
    }

    static class SignalsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;
            sendJson(exchange, ENGINE_CLIENT.getSignalIndex().getAllSignals());
        }
    }

    static class TrafficHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            if (!"GET".equals(ex.getRequestMethod())) { sendStatus(ex, 405); return; }
            sendJson(ex, ENGINE_CLIENT.getTrafficOverlay());
        }
    }

    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            if (!"POST".equals(ex.getRequestMethod())) { sendStatus(ex, 405); return; }

            JsonObject json = body(ex);
            String username = json.has("username") ? json.get("username").getAsString() : "";
            String password = json.has("password") ? json.get("password").getAsString() : "";

            User user = DS.getByUsername(username);
            if (user == null || !verifyPassword(password, user.getPassword())) {
                sendStatus(ex, 401);
                return;
            }
            String token = UUID.randomUUID().toString();
            DS.putSession(token, user.getId());

            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("token",       token);
            resp.put("role",        user.getRole());
            resp.put("userId",      user.getId());
            resp.put("ambulanceId", user.getAmbulanceId());
            resp.put("displayName", user.getDisplayName());
            sendJson(ex, resp);
        }
    }

    static class AmbulanceHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            String path   = ex.getRequestURI().getPath();
            String suffix = path.substring("/api/ambulances".length());
            String method = ex.getRequestMethod();

            if ("GET".equals(method) && suffix.isEmpty()) {
                sendJson(ex, new ArrayList<>(DS.allAmbulances()));

            } else if ("POST".equals(method) && suffix.isEmpty()) {
                JsonObject json = body(ex);
                String ambulanceNumber = json.get("ambulanceNumber").getAsString().trim();
                if (ambulanceNumber.isEmpty()) { sendStatus(ex, 400); return; }
                String ambId = "amb-" + ambulanceNumber;
                AmbulanceInfo a = new AmbulanceInfo(ambId, "", "", 32.1668, 34.9201, "offline");
                a.setAmbulanceNumber(ambulanceNumber);
                DS.putAmbulance(a);
                sendJson(ex, a);

            } else if ("DELETE".equals(method) && suffix.isEmpty()) {
                Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
                DS.deleteAmbulance(params.get("id"));
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/location".equals(suffix)) {
                JsonObject json = body(ex);
                DS.updateLocation(json.get("ambulanceId").getAsString(),
                                  json.get("lat").getAsDouble(),
                                  json.get("lon").getAsDouble());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/override-location".equals(suffix)) {
                JsonObject json = body(ex);
                DS.overrideLocation(json.get("ambulanceId").getAsString(),
                                    json.get("lat").getAsDouble(),
                                    json.get("lon").getAsDouble());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/release-location".equals(suffix)) {
                JsonObject json = body(ex);
                DS.releaseLocationLock(json.get("ambulanceId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/assign".equals(suffix)) {
                JsonObject json = body(ex);
                DS.assignDriverToAmbulance(json.get("ambulanceId").getAsString(),
                                           json.get("driverId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/status".equals(suffix)) {
                JsonObject json = body(ex);
                String newStatus = json.get("status").getAsString();
                if ("available".equals(newStatus) || "offline".equals(newStatus)) {
                    DS.setAmbulanceStatus(json.get("ambulanceId").getAsString(), newStatus);
                    sendStatus(ex, 200);
                } else {
                    sendStatus(ex, 400);
                }

            } else if ("POST".equals(method) && "/disconnect".equals(suffix)) {
                JsonObject json = body(ex);
                DS.disconnectDriver(json.get("ambulanceId").getAsString());
                sendStatus(ex, 200);

            } else {
                sendStatus(ex, 404);
            }
        }
    }

    static class CaseHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            String path   = ex.getRequestURI().getPath();
            String suffix = path.length() > "/api/cases".length()
                          ? path.substring("/api/cases".length()) : "";
            String method = ex.getRequestMethod();

            if ("POST".equals(method) && suffix.isEmpty()) {
                JsonObject json = body(ex);
                CaseRecord c = new CaseRecord();
                c.setAddress(       json.has("address")        ? json.get("address").getAsString()         : "");
                c.setLat(           json.has("lat")             ? json.get("lat").getAsDouble()              : 0);
                c.setLon(           json.has("lon")             ? json.get("lon").getAsDouble()              : 0);
                c.setDescription(   json.has("description")    ? json.get("description").getAsString()     : "");
                c.setPatientDetails(json.has("patientDetails") ? json.get("patientDetails").getAsString()  : "");
                c.setUrgency(       json.has("urgency")         ? json.get("urgency").getAsString()          : "routine");
                c.setNotes(         json.has("notes")           ? json.get("notes").getAsString()            : "");
                sendJson(ex, DS.createCase(c));

            } else if ("GET".equals(method) && suffix.isEmpty()) {
                List<CaseRecord> sorted = DS.allCases().stream()
                        .sorted((a, b) -> Long.compare(b.getCreatedAt(), a.getCreatedAt()))
                        .collect(Collectors.toList());
                sendJson(ex, sorted);

            } else if ("GET".equals(method) && "/active".equals(suffix)) {
                Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
                String ambulanceId = params.get("ambulanceId");
                CaseRecord c = ambulanceId != null ? DS.getActiveForAmbulance(ambulanceId) : null;
                sendJson(ex, c);

            } else if ("GET".equals(method) && suffix.length() > 1 && !"/active".equals(suffix)) {
                sendJson(ex, DS.getCaseById(suffix.substring(1)));

            } else if ("POST".equals(method) && "/assign".equals(suffix)) {
                JsonObject json = body(ex);
                DS.assignCase(json.get("caseId").getAsString(),
                              json.get("ambulanceId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/complete".equals(suffix)) {
                JsonObject json = body(ex);
                DS.completeCase(json.get("caseId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/update".equals(suffix)) {
                JsonObject json = body(ex);
                DS.updateCaseNotes(
                    json.get("caseId").getAsString(),
                    json.has("notes")          ? json.get("notes").getAsString()          : null,
                    json.has("patientDetails") ? json.get("patientDetails").getAsString() : null
                );
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/cancel-request".equals(suffix)) {
                JsonObject json = body(ex);
                DS.requestCancel(json.get("caseId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/cancel".equals(suffix)) {
                JsonObject json = body(ex);
                DS.cancelCase(json.get("caseId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/arrive".equals(suffix)) {
                JsonObject json = body(ex);
                DS.markArrival(json.get("caseId").getAsString());
                sendStatus(ex, 200);

            } else if ("POST".equals(method) && "/select-hospital".equals(suffix)) {
                JsonObject json = body(ex);
                DS.selectHospitalForCase(json.get("caseId").getAsString(),
                                         json.get("hospitalId").getAsString());
                sendStatus(ex, 200);

            } else {
                sendStatus(ex, 404);
            }
        }
    }

    static class EtaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            if (!"GET".equals(ex.getRequestMethod())) { sendStatus(ex, 405); return; }

            Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
            double endLat = Double.parseDouble(params.get("endLat"));
            double endLon = Double.parseDouble(params.get("endLon"));

            List<Map<String, Object>> results = new ArrayList<>();
            for (AmbulanceInfo amb : DS.allAmbulances()) {
                if (!"available".equals(amb.getStatus())) continue;
                if (amb.getDriverId() == null || amb.getDriverId().isEmpty()) continue;

                RouteRequest routineReq   = new RouteRequest(amb.getLat(), amb.getLon(), endLat, endLon, false);
                RouteRequest emergencyReq = new RouteRequest(amb.getLat(), amb.getLon(), endLat, endLon, true);

                RouteResponse routineResp   = new FastRoutingEngine(new RoutineRoutingStrategy(ENGINE_CLIENT)).getOptimalRoute(routineReq);
                RouteResponse emergencyResp = new FastRoutingEngine(new EmergencyRoutingStrategy(ENGINE_CLIENT)).getOptimalRoute(emergencyReq);

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("ambulanceId",     amb.getId());
                row.put("ambulanceNumber", amb.getAmbulanceNumber() != null ? amb.getAmbulanceNumber() : amb.getId().replace("amb-", ""));
                row.put("driverName",      amb.getDriverName());
                row.put("status",          amb.getStatus());
                row.put("routineEtaSec",   routineResp.getEstimatedTimeSeconds());
                row.put("emergencyEtaSec", emergencyResp.getEstimatedTimeSeconds());
                results.add(row);
            }
            sendJson(ex, results);
        }
    }

    static class UserHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            String method = ex.getRequestMethod();

            if ("GET".equals(method)) {
                List<Map<String, Object>> list = DS.allUsers().stream().map(u -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id",          u.getId());
                    m.put("username",    u.getUsername());
                    m.put("role",        u.getRole());
                    m.put("ambulanceId", u.getAmbulanceId());
                    m.put("displayName", u.getDisplayName());
                    if (u instanceof core.models.DriverUser du)
                        m.put("ambulanceNumber", du.getAmbulanceNumber());
                    return m;
                }).collect(Collectors.toList());
                sendJson(ex, list);

            } else if ("POST".equals(method)) {
                JsonObject json = body(ex);
                String id   = DS.nextUserId();
                String role = json.get("role").getAsString();
                String ambId = json.has("ambulanceId") && !json.get("ambulanceId").isJsonNull()
                        ? json.get("ambulanceId").getAsString() : null;
                String username = json.get("username").getAsString().trim().toLowerCase();
                String password = hashPassword(json.get("password").getAsString());

                User u;
                if ("driver".equals(role)) {
                    String ambulanceNumber = json.has("ambulanceNumber")
                            ? json.get("ambulanceNumber").getAsString() : "";
                    u = new core.models.DriverUser(id,
                            username,
                            password,
                            ambId,
                            json.get("displayName").getAsString(),
                            ambulanceNumber);
                } else {
                    u = new User(id,
                            username,
                            password,
                            role, ambId,
                            json.get("displayName").getAsString());
                }
                DS.putUser(u);
                if ("driver".equals(u.getRole()) && u.getAmbulanceId() != null
                        && DS.getAmbulance(u.getAmbulanceId()) == null) {
                    AmbulanceInfo newAmb = new AmbulanceInfo(
                            u.getAmbulanceId(), id, u.getDisplayName(), 32.1668, 34.9201, "available");
                    if (u instanceof core.models.DriverUser du)
                        newAmb.setAmbulanceNumber(du.getAmbulanceNumber());
                    DS.putAmbulance(newAmb);
                }
                Map<String, Object> resp = new LinkedHashMap<>();
                resp.put("id",          id);
                resp.put("username",    u.getUsername());
                resp.put("role",        u.getRole());
                resp.put("ambulanceId", u.getAmbulanceId());
                resp.put("displayName", u.getDisplayName());
                if (u instanceof core.models.DriverUser du)
                    resp.put("ambulanceNumber", du.getAmbulanceNumber());
                sendJson(ex, resp);

            } else if ("DELETE".equals(method)) {
                Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
                DS.deleteUser(params.get("id"));
                sendStatus(ex, 200);

            } else {
                sendStatus(ex, 405);
            }
        }
    }

    static class HospitalHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            String path   = ex.getRequestURI().getPath();
            String suffix = path.length() > "/api/hospitals".length()
                          ? path.substring("/api/hospitals".length()) : "";
            String method = ex.getRequestMethod();

            if ("GET".equals(method) && suffix.isEmpty()) {
                Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
                List<Hospital> hospitals = new ArrayList<>(DS.allHospitals());

                if (!params.containsKey("lat") || !params.containsKey("lon")) {
                    sendJson(ex, hospitals);
                    return;
                }

                double lat = Double.parseDouble(params.get("lat"));
                double lon = Double.parseDouble(params.get("lon"));

                List<Map<String, Object>> results = new ArrayList<>();
                for (Hospital h : hospitals) {
                    RouteRequest req = new RouteRequest(lat, lon, h.getLat(), h.getLon(), false);
                    RouteResponse resp = new FastRoutingEngine(new RoutineRoutingStrategy(ENGINE_CLIENT)).getOptimalRoute(req);

                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id",             h.getId());
                    row.put("name",           h.getName());
                    row.put("lat",            h.getLat());
                    row.put("lon",            h.getLon());
                    row.put("distanceMeters", resp.getTotalDistanceMeters());
                    row.put("etaSeconds",     resp.getEstimatedTimeSeconds());
                    results.add(row);
                }
                results.sort(Comparator.comparingLong(r -> ((Number) r.get("etaSeconds")).longValue()));
                sendJson(ex, results);

            } else if ("POST".equals(method) && "/update".equals(suffix)) {
                JsonObject json = body(ex);
                DS.updateHospital(json.get("id").getAsString(),
                                   json.get("name").getAsString(),
                                   json.get("lat").getAsDouble(),
                                   json.get("lon").getAsDouble());
                sendStatus(ex, 200);

            } else {
                sendStatus(ex, 404);
            }
        }
    }

    static class NoGoZoneHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            if (handleOptions(ex)) return;
            String method = ex.getRequestMethod();

            if ("GET".equals(method)) {
                sendJson(ex, DS.allNoGoZonesRaw());

            } else if ("POST".equals(method)) {
                JsonObject json = body(ex);
                core.models.NoGoZone z = new core.models.NoGoZone();
                z.setName(   json.get("name").getAsString());
                z.setMinLat( json.get("minLat").getAsDouble());
                z.setMaxLat( json.get("maxLat").getAsDouble());
                z.setMinLon( json.get("minLon").getAsDouble());
                z.setMaxLon( json.get("maxLon").getAsDouble());
                if (json.has("type"))       z.setType(json.get("type").getAsString());
                if (json.has("dailyStart")) z.setDailyStart(json.get("dailyStart").getAsString());
                if (json.has("dailyEnd"))   z.setDailyEnd(json.get("dailyEnd").getAsString());
                if (json.has("onceStart"))  z.setOnceStart(json.get("onceStart").getAsLong());
                if (json.has("onceEnd"))    z.setOnceEnd(json.get("onceEnd").getAsLong());
                sendJson(ex, DS.addNoGoZone(z));

            } else if ("DELETE".equals(method)) {
                Map<String, String> params = queryMap(ex.getRequestURI().getQuery());
                DS.deleteNoGoZone(params.get("id"));
                sendStatus(ex, 200);

            } else {
                sendStatus(ex, 405);
            }
        }
    }
}
