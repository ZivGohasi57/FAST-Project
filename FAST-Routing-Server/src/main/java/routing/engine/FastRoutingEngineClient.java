package routing.engine;

import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.GraphHopper;
import com.graphhopper.GraphHopperConfig;
import com.graphhopper.ResponsePath;
import com.graphhopper.config.Profile;
import com.graphhopper.json.Statement;
import com.graphhopper.util.CustomModel;
import com.graphhopper.util.Instruction;
import com.graphhopper.util.InstructionList;
import com.graphhopper.util.PointList;
import com.graphhopper.util.details.PathDetail;
import core.interfaces.IRoutingEngineClient;
import core.models.Coordinate;
import core.models.RouteRequest;
import core.models.RouteResponse;
import core.models.StepInstruction;
import routing.AmbulanceImportRegistry;
import routing.TrafficSignalIndex;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Embedded GraphHopper routing engine client.
 *
 * Profiles
 * --------
 * ambulance_routine  : standard car routing, one-way restrictions respected.
 * ambulance_emergency: ambulance vehicle, bidirectional (contraflow), speed-optimised.
 *                      With-traffic: 1.2× speed limit.  Contraflow: 0.7× speed limit.
 */
public class FastRoutingEngineClient implements IRoutingEngineClient {

    // ── Time calculation constants ────────────────────────────────────────────
    // Emergency speed factors are encoded in the CustomModel:
    //   with-traffic: 1.2× ambulance_average_speed (20% above limit)
    //   contraflow   : 0.7× ambulance_average_speed (caution, against flow)
    // GraphHopper therefore returns path.getTime() that already reflects real ambulance speed.

    // Intersection delay constants (seconds)
    private static final double ROUTINE_SIGNAL_DELAY     = 90.0;   // red light wait
    private static final double ROUTINE_NO_SIGNAL_DELAY  = 20.0;   // yield / slow-roll
    private static final double EMERGENCY_SIGNAL_DELAY   = 30.0;   // siren clears light
    private static final double EMERGENCY_NO_SIGNAL_DELAY = 10.0;  // siren + slow check

    /** Radius in metres to match an instruction node against a traffic_signals OSM node. */
    private static final double SIGNAL_RADIUS_M = 20.0;

    // ── Fields ────────────────────────────────────────────────────────────────
    private final GraphHopper hopper;
    private final TrafficSignalIndex signalIndex;

    /**
     * @param osmFile       path to the OSM data file (e.g. "export.osm")
     * @param graphCacheDir directory for the graph cache
     */
    public FastRoutingEngineClient(String osmFile, String graphCacheDir) {
        hopper      = buildHopper(osmFile, graphCacheDir);
        signalIndex = new TrafficSignalIndex(osmFile);
    }

    /** Exposes the signal index so the controller can serve a /api/signals endpoint. */
    public TrafficSignalIndex getSignalIndex() {
        return signalIndex;
    }

    // -------------------------------------------------------------------------
    // IRoutingEngineClient
    // -------------------------------------------------------------------------

    @Override
    public RouteResponse fetchRoute(RouteRequest request, String profileName) {
        boolean isEmergency = "ambulance_emergency".equals(profileName);

        GHRequest ghRequest = new GHRequest(
                request.getStartLat(), request.getStartLon(),
                request.getEndLat(), request.getEndLon()
        ).setProfile(profileName);

        // Request car_access per-edge so we can detect contraflow segments
        if (isEmergency) {
            ghRequest.setPathDetails(List.of("car_access"));
        }

        GHResponse ghResponse = hopper.route(ghRequest);

        if (ghResponse.hasErrors()) {
            System.err.println("[FAST] Routing error for profile '" + profileName + "': " + ghResponse.getErrors());
            return new RouteResponse(0.0, 0L, new ArrayList<>(), new ArrayList<>());
        }

        ResponsePath path = ghResponse.getBest();
        PointList points = path.getPoints();

        List<Coordinate> coordinates = new ArrayList<>(points.size());
        for (int i = 0; i < points.size(); i++) {
            coordinates.add(new Coordinate(points.getLat(i), points.getLon(i)));
        }

        long timeSec = calculateTime(path, isEmergency);
        List<StepInstruction> steps = buildSteps(path, isEmergency);

        return new RouteResponse(path.getDistance(), timeSec, coordinates, steps);
    }

    // -------------------------------------------------------------------------
    // Step instruction builder
    // -------------------------------------------------------------------------

    /**
     * Converts GraphHopper's InstructionList into StepInstruction records.
     *
     * GraphHopper model:
     *   instr[i].getDistance() = length of the road segment AFTER instr[i]'s maneuver.
     *
     * We re-index so that step[i].distanceMeters = distance the driver must travel
     * BEFORE executing step[i]'s maneuver (= instr[i-1].getDistance()).
     *
     * Contraflow detection: for emergency routes, PathDetails "car_access" is requested.
     * A segment has car_access=false when the ambulance traverses it against the normal
     * one-way direction (contraflow).
     */
    private List<StepInstruction> buildSteps(ResponsePath path, boolean isEmergency) {
        InstructionList instructions = path.getInstructions();

        // Retrieve car_access PathDetails (present only for emergency routes)
        Map<String, List<PathDetail>> allDetails = path.getPathDetails();
        List<PathDetail> carAccessDetails = (isEmergency && allDetails != null)
                ? allDetails.getOrDefault("car_access", Collections.emptyList())
                : Collections.emptyList();

        List<StepInstruction> steps = new ArrayList<>(instructions.size());
        int ptIdx = 0; // running index into path.getPoints()

        for (int i = 0; i < instructions.size(); i++) {
            Instruction instr = instructions.get(i);
            int segSize = instr.getPoints().size();
            int segEnd  = ptIdx + Math.max(segSize - 1, 0);

            // Distance the driver travels BEFORE this maneuver = previous segment's length
            double distanceTo = (i == 0) ? 0.0 : instructions.get(i - 1).getDistance();

            // Contraflow: any PathDetail in [ptIdx, segEnd] with car_access=false
            boolean contraflow = false;
            if (isEmergency) {
                for (PathDetail detail : carAccessDetails) {
                    if (detail.getFirst() <= segEnd && detail.getLast() >= ptIdx
                            && Boolean.FALSE.equals(detail.getValue())) {
                        contraflow = true;
                        break;
                    }
                }
            }

            steps.add(new StepInstruction(instr.getSign(), instr.getName(), distanceTo, contraflow));

            ptIdx = (segEnd > ptIdx) ? segEnd : ptIdx + 1;
        }

        return steps;
    }

    // -------------------------------------------------------------------------
    // Time calculation
    // -------------------------------------------------------------------------

    /**
     * Calculates estimated travel time:
     *
     * Routine:   drive_time_at_speed_limit  + 20 s/intersection  + 90 s/signalised-intersection
     * Emergency: drive_time (encoded: 1.2× with-traffic, 0.7× contraflow) + 10/30 s/intersection
     */
    private long calculateTime(ResponsePath path, boolean isEmergency) {
        // Base drive time from GraphHopper (already reflects actual ambulance speeds for emergency)
        double driveTimeSec = path.getTime() / 1000.0;

        // Emergency speeds are already encoded in the CustomModel (1.2× with-traffic,
        // 0.7× contraflow), so path.getTime() already reflects real ambulance travel time.

        // Intersection penalties
        InstructionList instructions = path.getInstructions();
        double intersectionDelay = 0.0;

        // Index 0 = START, last = FINISH — no intersection penalty at either
        for (int i = 1; i < instructions.size() - 1; i++) {
            Instruction instr = instructions.get(i);
            int sign = instr.getSign();

            // Roundabouts have continuous yielding flow — no hard stop penalty
            if (sign == Instruction.USE_ROUNDABOUT || sign == Instruction.LEAVE_ROUNDABOUT) continue;

            PointList pts = instr.getPoints();
            if (pts.isEmpty()) continue;
            double lat = pts.getLat(0);
            double lon = pts.getLon(0);

            if (signalIndex.hasSignalNear(lat, lon, SIGNAL_RADIUS_M)) {
                intersectionDelay += isEmergency ? EMERGENCY_SIGNAL_DELAY : ROUTINE_SIGNAL_DELAY;
            } else {
                intersectionDelay += isEmergency ? EMERGENCY_NO_SIGNAL_DELAY : ROUTINE_NO_SIGNAL_DELAY;
            }
        }

        return Math.round(driveTimeSec + intersectionDelay);
    }

    // -------------------------------------------------------------------------
    // Internal setup
    // -------------------------------------------------------------------------

    private GraphHopper buildHopper(String osmFile, String graphCacheDir) {
        GraphHopper gh = new GraphHopper();
        gh.setOSMFile(osmFile);
        gh.setGraphHopperLocation(graphCacheDir);

        gh.setImportRegistry(new AmbulanceImportRegistry());

        GraphHopperConfig config = new GraphHopperConfig();
        config.putObject("graph.encoded_values",
                "car_access, car_average_speed, ambulance_access, ambulance_average_speed, road_class, surface");
        config.putObject("import.osm.ignored_highways",
                "footway,cycleway,path,pedestrian,steps");
        gh.init(config);
        gh.setOSMFile(osmFile);
        gh.setGraphHopperLocation(graphCacheDir);

        // --- ambulance_routine profile ---
        CustomModel routineModel = new CustomModel()
                .setDistanceInfluence(15.0)
                .addToPriority(Statement.If("surface == UNPAVED", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("!car_access", Statement.Op.MULTIPLY, "0"))
                .addToSpeed(Statement.If("true", Statement.Op.LIMIT, "car_average_speed"));

        Profile routineProfile = new Profile("ambulance_routine")
                .setWeighting("custom")
                .setCustomModel(routineModel);

        // --- ambulance_emergency profile ---
        // Speed rules (applied in order):
        //   1. Limit to ambulance_average_speed (OSM speed limit)
        //   2. car_access=true  → ×1.2 (with-traffic: 20% above limit)
        //   3. car_access=false → ×0.7 (contraflow: caution, max 70% of posted limit)
        CustomModel emergencyModel = new CustomModel()
                .setDistanceInfluence(0.0)
                .addToPriority(Statement.If("surface == UNPAVED", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("!ambulance_access", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("road_class == RESIDENTIAL", Statement.Op.MULTIPLY, "0.8"))
                .addToSpeed(Statement.If("true", Statement.Op.LIMIT, "ambulance_average_speed"))
                .addToSpeed(Statement.If("car_access", Statement.Op.MULTIPLY, "1.2"))
                .addToSpeed(Statement.If("!car_access", Statement.Op.MULTIPLY, "0.7"));

        Profile emergencyProfile = new Profile("ambulance_emergency")
                .setWeighting("custom")
                .setCustomModel(emergencyModel);

        gh.setProfiles(routineProfile, emergencyProfile);

        gh.importOrLoad();
        return gh;
    }
}
