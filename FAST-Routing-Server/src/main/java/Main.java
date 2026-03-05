import core.models.Coordinate;
import core.models.RouteRequest;
import core.models.RouteResponse;
import routing.engine.FastRoutingEngine;
import routing.engine.FastRoutingEngineClient;
import routing.strategies.EmergencyRoutingStrategy;
import routing.strategies.RoutineRoutingStrategy;

public class Main {
    public static void main(String[] args) {
        FastRoutingEngineClient client = new FastRoutingEngineClient("http://localhost:8080");

        RoutineRoutingStrategy routineStrategy = new RoutineRoutingStrategy(client);
        EmergencyRoutingStrategy emergencyStrategy = new EmergencyRoutingStrategy(client);

        FastRoutingEngine engine = new FastRoutingEngine(routineStrategy);

        RouteRequest request = new RouteRequest(32.1668139, 34.9201287, 32.165000, 34.922000, false);

        System.out.println("--- Routine Profile ---");
        RouteResponse routineResponse = engine.getOptimalRoute(request);
        printResponse(routineResponse);

        System.out.println("\n--- Emergency Profile ---");
        engine.setStrategy(emergencyStrategy);
        request.setEmergency(true);
        RouteResponse emergencyResponse = engine.getOptimalRoute(request);
        printResponse(emergencyResponse);
    }

    private static void printResponse(RouteResponse response) {
        System.out.println("Distance: " + response.getTotalDistanceMeters() + " meters");
        System.out.println("Time: " + (response.getEstimatedTimeSeconds() / 1000.0) + " seconds");
        System.out.println("Path points count: " + response.getPath().size());
        
        if (!response.getPath().isEmpty()) {
            Coordinate first = response.getPath().get(0);
            Coordinate last = response.getPath().get(response.getPath().size() - 1);
            System.out.println("Start Node: [" + first.getLat() + ", " + first.getLon() + "]");
            System.out.println("End Node: [" + last.getLat() + ", " + last.getLon() + "]");
        }
    }
}