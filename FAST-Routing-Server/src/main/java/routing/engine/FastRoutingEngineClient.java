package routing.engine;

import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.GraphHopper;
import com.graphhopper.GraphHopperConfig;
import com.graphhopper.ResponsePath;
import com.graphhopper.config.Profile;
import com.graphhopper.json.Statement;
import com.graphhopper.util.CustomModel;
import com.graphhopper.util.PointList;
import core.interfaces.IRoutingEngineClient;
import core.models.Coordinate;
import core.models.RouteRequest;
import core.models.RouteResponse;
import routing.AmbulanceImportRegistry;

import java.util.ArrayList;
import java.util.List;

/**
 * Embedded GraphHopper routing engine client.
 *
 * Replaces the previous HTTP-based client that called the standalone GraphHopper server.
 * By embedding GH directly we can register the AmbulanceImportRegistry, which adds:
 *   - ambulance_access  (bidirectional — contraflow capability)
 *   - ambulance_average_speed (same speeds as car, stored per-direction)
 *
 * Profiles
 * --------
 * ambulance_routine  : standard car routing, one-way restrictions respected.
 * ambulance_emergency: ambulance vehicle, bidirectional (contraflow), speed-optimised,
 *                      distance-influence = 0 (pure time minimisation).
 */
public class FastRoutingEngineClient implements IRoutingEngineClient {

    private final GraphHopper hopper;

    /**
     * @param osmFile      path to the OSM data file (e.g. "export.osm")
     * @param graphCacheDir  directory for the graph cache (rebuilt automatically if encoded values change)
     */
    public FastRoutingEngineClient(String osmFile, String graphCacheDir) {
        hopper = buildHopper(osmFile, graphCacheDir);
    }

    // -------------------------------------------------------------------------
    // IRoutingEngineClient
    // -------------------------------------------------------------------------

    @Override
    public RouteResponse fetchRoute(RouteRequest request, String profileName) {
        GHRequest ghRequest = new GHRequest(
                request.getStartLat(), request.getStartLon(),
                request.getEndLat(), request.getEndLon()
        ).setProfile(profileName);

        GHResponse ghResponse = hopper.route(ghRequest);

        if (ghResponse.hasErrors()) {
            System.err.println("[FAST] Routing error for profile '" + profileName + "': " + ghResponse.getErrors());
            return new RouteResponse(0.0, 0L, new ArrayList<>());
        }

        ResponsePath path = ghResponse.getBest();
        PointList points = path.getPoints();

        List<Coordinate> coordinates = new ArrayList<>(points.size());
        for (int i = 0; i < points.size(); i++) {
            coordinates.add(new Coordinate(points.getLat(i), points.getLon(i)));
        }

        return new RouteResponse(path.getDistance(), path.getTime(), coordinates);
    }

    // -------------------------------------------------------------------------
    // Internal setup
    // -------------------------------------------------------------------------

    private GraphHopper buildHopper(String osmFile, String graphCacheDir) {
        GraphHopper gh = new GraphHopper();
        gh.setOSMFile(osmFile);
        gh.setGraphHopperLocation(graphCacheDir);

        // Register our custom ambulance vehicle (ambulance_access + ambulance_average_speed)
        gh.setImportRegistry(new AmbulanceImportRegistry());

        // Encoded values: standard car + ambulance + road properties
        GraphHopperConfig config = new GraphHopperConfig();
        config.putObject("graph.encoded_values",
                "car_access, car_average_speed, ambulance_access, ambulance_average_speed, road_class, surface");
        config.putObject("import.osm.ignored_highways",
                "footway,cycleway,path,pedestrian,steps");
        gh.init(config);
        // Override OSM file and cache dir (init() may reset them from the empty config)
        gh.setOSMFile(osmFile);
        gh.setGraphHopperLocation(graphCacheDir);

        // --- ambulance_routine profile ---
        // Standard car routing: obeys one-way streets (car_access = false blocks reverse).
        // The priority check "!car_access → multiply 0" produces infinite weight for
        // wrong-way directions, so the DirectedEdgeFilter correctly excludes them.
        CustomModel routineModel = new CustomModel()
                .setDistanceInfluence(15.0)
                .addToPriority(Statement.If("surface == UNPAVED", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("!car_access", Statement.Op.MULTIPLY, "0"))
                .addToSpeed(Statement.If("true", Statement.Op.LIMIT, "car_average_speed"));

        Profile routineProfile = new Profile("ambulance_routine")
                .setWeighting("custom")
                .setCustomModel(routineModel);

        // --- ambulance_emergency profile ---
        // Uses ambulance_average_speed (bidirectional on all motor roads) — contraflow.
        // distance_influence = 0: pure time optimisation (fastest arrival, not shortest path).
        // Residential roads slightly penalised (priority 0.8) to prefer main roads.
        // !ambulance_access = 0: blocks roundabout wrong-way directions (encoded as false by AmbulanceAccessParser).
        CustomModel emergencyModel = new CustomModel()
                .setDistanceInfluence(0.0)
                .addToPriority(Statement.If("surface == UNPAVED", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("!ambulance_access", Statement.Op.MULTIPLY, "0"))
                .addToPriority(Statement.If("road_class == RESIDENTIAL", Statement.Op.MULTIPLY, "0.8"))
                .addToSpeed(Statement.If("true", Statement.Op.LIMIT, "ambulance_average_speed"));

        Profile emergencyProfile = new Profile("ambulance_emergency")
                .setWeighting("custom")
                .setCustomModel(emergencyModel);

        gh.setProfiles(routineProfile, emergencyProfile);

        gh.importOrLoad();
        return gh;
    }
}
