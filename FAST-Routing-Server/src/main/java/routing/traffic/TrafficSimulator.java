package routing.traffic;

import com.graphhopper.routing.ev.BooleanEncodedValue;
import com.graphhopper.routing.ev.EnumEncodedValue;
import com.graphhopper.routing.ev.RoadClass;
import com.graphhopper.routing.ev.VehicleAccess;
import com.graphhopper.routing.util.AllEdgesIterator;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.storage.BaseGraph;

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

    private static final double P_PRIMARY     = 0.35;
    private static final double P_SECONDARY   = 0.25;
    private static final double P_TERTIARY    = 0.12;
    private static final double P_RESIDENTIAL = 0.05;

    private static final int MAX_NEW_PRIMARY     = 3;
    private static final int MAX_NEW_SECONDARY   = 3;
    private static final int MAX_NEW_TERTIARY    = 2;
    private static final int MAX_NEW_RESIDENTIAL = 1;

    private final TrafficData trafficData;
    private final ScheduledExecutorService scheduler;
    private final List<Integer> primaryEdges;
    private final List<Integer> secondaryEdges;
    private final List<Integer> tertiaryEdges;
    private final List<Integer> residentialEdges;
    private final Random random;
    private final ConcurrentHashMap<Integer, Long> jamExpiry;

    public TrafficSimulator(BaseGraph graph, EncodingManager encodingManager, TrafficData trafficData) {
        this.trafficData      = trafficData;
        this.random           = new Random();
        this.jamExpiry        = new ConcurrentHashMap<>();
        this.primaryEdges     = new ArrayList<>();
        this.secondaryEdges   = new ArrayList<>();
        this.tertiaryEdges    = new ArrayList<>();
        this.residentialEdges = new ArrayList<>();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "fast-traffic-sim");
            t.setDaemon(true);
            return t;
        });
        buildEdgeLists(graph, encodingManager);
    }

    private void buildEdgeLists(BaseGraph graph, EncodingManager em) {
        EnumEncodedValue<RoadClass> rcEnc =
                em.getEnumEncodedValue(RoadClass.KEY, RoadClass.class);
        BooleanEncodedValue carAccessEnc =
                em.getBooleanEncodedValue(VehicleAccess.key("car"));

        AllEdgesIterator iter = graph.getAllEdges();
        while (iter.next()) {
            if (!iter.get(carAccessEnc)) continue;
            int edgeId = iter.getEdge();
            RoadClass rc = iter.get(rcEnc);
            if (rc == RoadClass.PRIMARY || rc == RoadClass.TRUNK || rc == RoadClass.MOTORWAY) {
                primaryEdges.add(edgeId);
            } else if (rc == RoadClass.SECONDARY) {
                secondaryEdges.add(edgeId);
            } else if (rc == RoadClass.TERTIARY) {
                tertiaryEdges.add(edgeId);
            } else if (rc == RoadClass.RESIDENTIAL) {
                residentialEdges.add(edgeId);
            }
        }
    }

    public void start() {
        scheduler.scheduleAtFixedRate(
                this::tick, INITIAL_DELAY_SEC, TICK_INTERVAL_SEC, TimeUnit.SECONDS);
    }

    public void stop() {
        scheduler.shutdownNow();
        trafficData.clearAll();
    }

    private void tick() {
        dissolveExpiredJams();
        createJams(primaryEdges,     P_PRIMARY,     MAX_NEW_PRIMARY);
        createJams(secondaryEdges,   P_SECONDARY,   MAX_NEW_SECONDARY);
        createJams(tertiaryEdges,    P_TERTIARY,    MAX_NEW_TERTIARY);
        createJams(residentialEdges, P_RESIDENTIAL, MAX_NEW_RESIDENTIAL);
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
