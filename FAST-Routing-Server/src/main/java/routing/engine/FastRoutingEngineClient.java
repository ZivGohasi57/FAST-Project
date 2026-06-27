package routing.engine;

import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.GraphHopperConfig;
import routing.traffic.CongestionLevel;
import routing.traffic.FASTGraphHopper;
import routing.traffic.TrafficData;
import com.graphhopper.ResponsePath;
import com.graphhopper.config.Profile;
import com.graphhopper.json.Statement;
import com.graphhopper.routing.ev.DecimalEncodedValue;
import com.graphhopper.routing.ev.VehicleSpeed;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.util.CustomModel;
import com.graphhopper.util.EdgeIteratorState;
import com.graphhopper.util.FetchMode;
import com.graphhopper.util.Instruction;
import com.graphhopper.util.InstructionList;
import com.graphhopper.util.RoundaboutInstruction;
import com.graphhopper.util.PointList;
import com.graphhopper.util.details.PathDetail;
import core.interfaces.IRoutingEngineClient;
import core.models.Coordinate;
import core.models.RouteRequest;
import core.models.RouteResponse;
import core.models.StepInstruction;
import routing.AmbulanceImportRegistry;
import routing.DualCarriagewayDetector;
import routing.TrafficSignalIndex;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class FastRoutingEngineClient implements IRoutingEngineClient {

    private static final long   CONTRAFLOW_MIN_SAVING_SEC  = 30L;
    private static final double ROUTINE_SIGNAL_DELAY       = 90.0;
    private static final double ROUTINE_NO_SIGNAL_DELAY    = 20.0;
    private static final double EMERGENCY_SIGNAL_DELAY     = 30.0;
    private static final double EMERGENCY_NO_SIGNAL_DELAY  = 10.0;
    private static final double SIGNAL_RADIUS_M            = 20.0;

    private final FASTGraphHopper  hopper;
    private final TrafficSignalIndex signalIndex;

    public FastRoutingEngineClient(String osmFile, String graphCacheDir) {
        DualCarriagewayDetector dualDetector = DualCarriagewayDetector.build(osmFile);
        hopper      = buildHopper(osmFile, graphCacheDir, dualDetector);
        signalIndex = new TrafficSignalIndex(osmFile);
    }

    public TrafficSignalIndex getSignalIndex() {
        return signalIndex;
    }

    public TrafficData getTrafficData() {
        return hopper.getTrafficData();
    }

    /// Function Name: gettrafficoverlay
    /// purpuse:  return list of all congested routes
    /// improtant functions: 
    /// hopper.getTrafficData().getAllCongestion() - return congestion level by road
    ///  hopper.getEncodingManager().getDecimalEncodedValue(VehicleSpeed.key("car") - return the speed from the encoded 
    ///  value of the edge 
    /// 
    ///
    public List<Map<String, Object>> getTrafficOverlay() {
        BaseGraph graph = hopper.getBaseGraph();
        Map<Integer, CongestionLevel> congestion = hopper.getTrafficData().getAllCongestion();
        DecimalEncodedValue speedEnc =
                hopper.getEncodingManager().getDecimalEncodedValue(VehicleSpeed.key("car"));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<Integer, CongestionLevel> entry : congestion.entrySet()) {
            int edgeId = entry.getKey(); // road segment id
            CongestionLevel level = entry.getValue(); // CongestionLevel for specific road segment

            EdgeIteratorState edge = graph.getEdgeIteratorState(edgeId, Integer.MIN_VALUE); // min int mean no matter the direction of the road
            if (edge == null) continue;

            PointList pts = edge.fetchWayGeometry(FetchMode.ALL); // import all of the pts of the road segment 
            if (pts.isEmpty()) continue;

            List<double[]> points = new ArrayList<>(pts.size());
            for (int i = 0; i < pts.size(); i++) {
                points.add(new double[]{pts.getLat(i), pts.getLon(i)});
            }

            double baseSpeedKmh = edge.get(speedEnc);
            int avgSpeedKmh = (int) Math.round(baseSpeedKmh * level.getSpeedFactor());

            Map<String, Object> seg = new LinkedHashMap<>();
            seg.put("points",      points);
            seg.put("level",       level.name());
            seg.put("avgSpeedKmh", avgSpeedKmh);
            result.add(seg);
        }
        return result;
    }

    @Override
    public RouteResponse fetchRoute(RouteRequest request, String profileName) {
        boolean isEmergency = "ambulance_emergency".equals(profileName);

        GHRequest ghRequest = new GHRequest(
                request.getStartLat(), request.getStartLon(),
                request.getEndLat(), request.getEndLon()
        ).setProfile(profileName);

        if (isEmergency) {
            ghRequest.setPathDetails(List.of("car_access"));
        }

        GHResponse ghResponse = hopper.route(ghRequest);

        if (ghResponse.hasErrors()) {
            System.err.println("[FAST] Routing error for profile '" + profileName + "': " + ghResponse.getErrors());
            return new RouteResponse(0.0, 0L, new ArrayList<>(), new ArrayList<>());
        }

        ResponsePath path = ghResponse.getBest();

        if (isEmergency && pathUsesContraflow(path)) {
            GHResponse legalResponse = hopper.route(new GHRequest(
                    request.getStartLat(), request.getStartLon(),
                    request.getEndLat(), request.getEndLon()
            ).setProfile("ambulance_routine"));

            if (!legalResponse.hasErrors()) {
                ResponsePath legalPath  = legalResponse.getBest();
                long emergencyMs        = calculateTime(path,      true);
                long legalMs            = calculateTime(legalPath, false);
                long savingSec          = legalMs - emergencyMs;

                if (savingSec < CONTRAFLOW_MIN_SAVING_SEC) {
                    System.out.println("[FAST] Contraflow saves only " + savingSec
                            + "s < " + CONTRAFLOW_MIN_SAVING_SEC + "s threshold — using legal route.");
                    path        = legalPath;
                    isEmergency = false;
                } else {
                    System.out.println("[FAST] Contraflow approved: saves " + savingSec + "s.");
                }
            }
        }

        PointList points = path.getPoints();
        List<Coordinate> coordinates = new ArrayList<>(points.size());
        for (int i = 0; i < points.size(); i++) {
            coordinates.add(new Coordinate(points.getLat(i), points.getLon(i)));
        }

        long timeSec = calculateTime(path, isEmergency);
        List<StepInstruction> steps = buildSteps(path, isEmergency);

        return new RouteResponse(path.getDistance(), timeSec, coordinates, steps);
    }

    /// Function Name: pathusescontraflow
    /// purpuse:  check if route uses contraflow
    private boolean pathUsesContraflow(ResponsePath path) {
        Map<String, List<PathDetail>> details = path.getPathDetails();
        if (details == null) return false;
        for (PathDetail detail : details.getOrDefault("car_access", Collections.emptyList())) {
            if (Boolean.FALSE.equals(detail.getValue())) return true;
        }
        return false;
    }

/// Function Name: buildsteps
    /// purpuse:  build route by instruction like: turn right, roundabout etc.
    private List<StepInstruction> buildSteps(ResponsePath path, boolean isEmergency) {
        InstructionList instructions = path.getInstructions();

        Map<String, List<PathDetail>> allDetails = path.getPathDetails();
        List<PathDetail> carAccessDetails = (isEmergency && allDetails != null)
                ? allDetails.getOrDefault("car_access", Collections.emptyList())
                : Collections.emptyList();

        List<StepInstruction> steps = new ArrayList<>(instructions.size());
        int ptIdx = 0;

        for (int i = 0; i < instructions.size(); i++) {
            Instruction instr   = instructions.get(i);
            int segSize         = instr.getPoints().size();
            int segEnd          = ptIdx + Math.max(segSize - 1, 0);
            double distanceTo   = (i == 0) ? 0.0 : instructions.get(i - 1).getDistance();

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

            int exitNumber = (instr instanceof RoundaboutInstruction)
                    ? ((RoundaboutInstruction) instr).getExitNumber()
                    : 0;

            steps.add(new StepInstruction(instr.getSign(), instr.getName(), distanceTo, contraflow, exitNumber));

            ptIdx = (segEnd > ptIdx) ? segEnd : ptIdx + 1;
        }

        return steps;
    }

/// Function Name: calculatetime
    /// purpuse:  calculate the cummulative delay time based on which intersections we go thorugh
    private long calculateTime(ResponsePath path, boolean isEmergency) {
        double driveTimeSec = path.getTime() / 1000.0;

        InstructionList instructions = path.getInstructions();
        double intersectionDelay = 0.0;

        for (int i = 1; i < instructions.size() - 1; i++) {
            Instruction instr = instructions.get(i);
            int sign = instr.getSign();

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
/// Function Name: buildhopper
    /// purpuse:  the "main" function, builds the graph and emergency and routine profiles
    private FASTGraphHopper buildHopper(String osmFile, String graphCacheDir, DualCarriagewayDetector dualDetector) {
        FASTGraphHopper gh = new FASTGraphHopper();
        gh.setImportRegistry(new AmbulanceImportRegistry(dualDetector));

        GraphHopperConfig config = new GraphHopperConfig();
        config.putObject("graph.location", graphCacheDir);
        config.putObject("graph.encoded_values",
                "car_access, car_average_speed, ambulance_access, ambulance_average_speed, road_class, surface");
        config.putObject("import.osm.ignored_highways",
                "footway,cycleway,path,pedestrian,steps");

        gh.setOSMFile(osmFile);
        gh.init(config);

        CustomModel routineModel = new CustomModel()
                .setDistanceInfluence(15.0)
                .addToPriority(Statement.If("surface == UNPAVED", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("!car_access", Statement.Op.MULTIPLY, "0"))
                .addToSpeed(Statement.If("true", Statement.Op.LIMIT, "car_average_speed"));

        Profile routineProfile = new Profile("ambulance_routine")
                .setWeighting("custom")
                .setCustomModel(routineModel);

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
