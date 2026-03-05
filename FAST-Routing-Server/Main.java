import core.models.RouteRequest;
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
        engine.getOptimalRoute(request);

        System.out.println("--- Emergency Profile ---");
        engine.setStrategy(emergencyStrategy);
        request.setEmergency(true);
        engine.getOptimalRoute(request);
    }
}