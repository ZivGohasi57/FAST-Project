package routing.traffic;

import com.graphhopper.routing.ev.BooleanEncodedValue;
import com.graphhopper.routing.ev.EnumEncodedValue;
import com.graphhopper.routing.ev.RoadClass;
import com.graphhopper.routing.ev.VehicleAccess;
import com.graphhopper.routing.util.AllEdgesIterator;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.storage.NodeAccess;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class TrafficSimulator {

    private static final int  TICK_INTERVAL_SEC   = 30;
    private static final int  INITIAL_DELAY_SEC   = 15;
    private static final long JAM_MIN_DURATION_MS = 2 * 60_000L;
    private static final long JAM_EXTRA_RANGE_MS  = 9 * 60_000L;

    private static final double CENTER_LAT   = 32.1668;
    private static final double CENTER_LON   = 34.9201;
    private static final double URBAN_RADIUS = 0.015;  // ≈1.5 km

    private static final double MORNING_START = 6.5;   // 06:30
    private static final double MORNING_END   = 9.5;   // 09:30
    private static final double EVENING_START = 15.5;  // 15:30
    private static final double EVENING_END   = 19.0;  // 19:00
    private static final double NIGHT_END     = 5.0;   // night ends at 05:00
    private static final double NIGHT_START   = 22.0;  // night starts at 22:00

    private final List<Integer> outboundPrimaryEdges   = new ArrayList<>();
    private final List<Integer> inboundPrimaryEdges    = new ArrayList<>();
    private final List<Integer> outboundSecondaryEdges = new ArrayList<>();
    private final List<Integer> inboundSecondaryEdges  = new ArrayList<>();
    private final List<Integer> urbanEdges             = new ArrayList<>(); // primary/secondary near center
    private final List<Integer> tertiaryEdges          = new ArrayList<>();
    private final List<Integer> residentialEdges       = new ArrayList<>();

    private final TrafficData trafficData;
    private final ScheduledExecutorService scheduler;
    private final Random random;
    private final ConcurrentHashMap<Integer, Long> jamExpiry;

    public TrafficSimulator(BaseGraph graph, EncodingManager encodingManager, TrafficData trafficData) {
        this.trafficData = trafficData;
        this.random      = new Random();
        this.jamExpiry   = new ConcurrentHashMap<>();
        this.scheduler   = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "fast-traffic-sim");
            t.setDaemon(true);
            return t;
        });
        buildEdgeLists(graph, encodingManager);
        logEdgeCounts();
    }

    private double distToCenter(double lat, double lon) {
        double dlat = lat - CENTER_LAT;
        double dlon = lon - CENTER_LON;
        return Math.sqrt(dlat * dlat + dlon * dlon);
    }

    private void buildEdgeLists(BaseGraph graph, EncodingManager em) {
        EnumEncodedValue<RoadClass> rcEnc = em.getEnumEncodedValue(RoadClass.KEY, RoadClass.class);
        BooleanEncodedValue carAccessEnc  = em.getBooleanEncodedValue(VehicleAccess.key("car"));
        NodeAccess nodes                  = graph.getNodeAccess();

        AllEdgesIterator iter = graph.getAllEdges();
        while (iter.next()) {
            if (!iter.get(carAccessEnc)) continue;

            int edgeId   = iter.getEdge();
            RoadClass rc = iter.get(rcEnc);

            int    baseNode = iter.getBaseNode();
            int    adjNode  = iter.getAdjNode();
            double baseLat  = nodes.getLat(baseNode);
            double baseLon  = nodes.getLon(baseNode);
            double adjLat   = nodes.getLat(adjNode);
            double adjLon   = nodes.getLon(adjNode);
            double midLat   = (baseLat + adjLat) / 2.0;
            double midLon   = (baseLon + adjLon) / 2.0;

            boolean isUrban = distToCenter(midLat, midLon) < URBAN_RADIUS;

            if (rc == RoadClass.PRIMARY || rc == RoadClass.TRUNK || rc == RoadClass.MOTORWAY) {
                if (isUrban) {
                    urbanEdges.add(edgeId);
                } else {
                    // Edge moves away from center → outbound; towards center → inbound
                    double distBase = distToCenter(baseLat, baseLon);
                    double distAdj  = distToCenter(adjLat,  adjLon);
                    if (distAdj >= distBase) outboundPrimaryEdges.add(edgeId);
                    else                    inboundPrimaryEdges.add(edgeId);
                }
            } else if (rc == RoadClass.SECONDARY) {
                if (isUrban) {
                    urbanEdges.add(edgeId);
                } else {
                    double distBase = distToCenter(baseLat, baseLon);
                    double distAdj  = distToCenter(adjLat,  adjLon);
                    if (distAdj >= distBase) outboundSecondaryEdges.add(edgeId);
                    else                    inboundSecondaryEdges.add(edgeId);
                }
            } else if (rc == RoadClass.TERTIARY) {
                tertiaryEdges.add(edgeId);
            } else if (rc == RoadClass.RESIDENTIAL) {
                residentialEdges.add(edgeId);
            }
        }
    }

    private void logEdgeCounts() {
        System.out.printf("[TrafficSim] Edge counts — outPrimary:%d  inPrimary:%d  " +
                "outSecondary:%d  inSecondary:%d  urban:%d  tertiary:%d  residential:%d%n",
                outboundPrimaryEdges.size(), inboundPrimaryEdges.size(),
                outboundSecondaryEdges.size(), inboundSecondaryEdges.size(),
                urbanEdges.size(), tertiaryEdges.size(), residentialEdges.size());
    }

    public void start() {
        scheduler.scheduleAtFixedRate(this::tick, INITIAL_DELAY_SEC, TICK_INTERVAL_SEC, TimeUnit.SECONDS);
    }

    public void stop() {
        scheduler.shutdownNow();
        trafficData.clearAll();
    }

    private enum TimeOfDay { MORNING_RUSH, EVENING_RUSH, NIGHT, NORMAL }

    private TimeOfDay getTimeOfDay() {
        LocalTime now = LocalTime.now();
        double t = now.getHour() + now.getMinute() / 60.0;
        if (t >= MORNING_START && t <= MORNING_END) return TimeOfDay.MORNING_RUSH;
        if (t >= EVENING_START && t <= EVENING_END) return TimeOfDay.EVENING_RUSH;
        if (t >= NIGHT_START || t <= NIGHT_END)     return TimeOfDay.NIGHT;
        return TimeOfDay.NORMAL;
    }

    private void tick() {
        dissolveExpiredJams();

        switch (getTimeOfDay()) {

            case MORNING_RUSH -> {
                // Outbound roads are congested; urban core is busy
                createJams(outboundPrimaryEdges,   0.65, 5);
                createJams(outboundSecondaryEdges, 0.45, 4);
                createJams(inboundPrimaryEdges,    0.10, 2);
                createJams(inboundSecondaryEdges,  0.08, 1);
                createJams(urbanEdges,             0.55, 5);
                createJams(tertiaryEdges,          0.15, 2);
                createJams(residentialEdges,       0.05, 1);
            }

            case EVENING_RUSH -> {
                // Inbound roads are congested; urban core is busy
                createJams(inboundPrimaryEdges,    0.65, 5);
                createJams(inboundSecondaryEdges,  0.45, 4);
                createJams(outboundPrimaryEdges,   0.10, 2);
                createJams(outboundSecondaryEdges, 0.08, 1);
                createJams(urbanEdges,             0.55, 5);
                createJams(tertiaryEdges,          0.15, 2);
                createJams(residentialEdges,       0.05, 1);
            }

            case NIGHT -> {
                // Minimal traffic — only an occasional primary jam
                createJams(outboundPrimaryEdges, 0.05, 1);
                createJams(inboundPrimaryEdges,  0.05, 1);
                createJams(urbanEdges,           0.05, 1);
            }

            default -> {
                // Normal hours — primary/urban roads are somewhat busier
                createJams(outboundPrimaryEdges,   0.30, 3);
                createJams(inboundPrimaryEdges,    0.30, 3);
                createJams(outboundSecondaryEdges, 0.20, 2);
                createJams(inboundSecondaryEdges,  0.20, 2);
                createJams(urbanEdges,             0.40, 4);
                createJams(tertiaryEdges,          0.12, 2);
                createJams(residentialEdges,       0.04, 1);
            }
        }
    }

    private void dissolveExpiredJams() {
        long now = System.currentTimeMillis();
        jamExpiry.entrySet().removeIf(entry -> {
            if (now >= entry.getValue()) {
                trafficData.clearCongestion(entry.getKey());
                return true;
            }
            return false;
        });
    }

    private void createJams(List<Integer> edges, double probability, int maxAttempts) {
        if (edges.isEmpty()) return;
        for (int i = 0; i < maxAttempts; i++) {
            if (random.nextDouble() < probability) {
                int edgeId = edges.get(random.nextInt(edges.size()));
                CongestionLevel level = pickLevel();
                long ttl = JAM_MIN_DURATION_MS + (long) (random.nextDouble() * JAM_EXTRA_RANGE_MS);
                trafficData.setCongestion(edgeId, level);
                jamExpiry.put(edgeId, System.currentTimeMillis() + ttl);
            }
        }
    }

    private CongestionLevel pickLevel() {
        int r = random.nextInt(10);
        if (r < 5) return CongestionLevel.LIGHT;
        if (r < 8) return CongestionLevel.MEDIUM;
        return CongestionLevel.HEAVY;
    }
}
