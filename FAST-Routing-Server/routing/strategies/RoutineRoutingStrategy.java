package routing.strategies;

import core.interfaces.IRoutingStrategy;
import core.interfaces.IRoutingEngineClient;
import core.models.RouteRequest;
import core.models.RouteResponse;

public class RoutineRoutingStrategy implements IRoutingStrategy {

    private IRoutingEngineClient engineClient;

    public RoutineRoutingStrategy(IRoutingEngineClient engineClient) {
        this.engineClient = engineClient;
    }

    @Override
    public RouteResponse calculateRoute(RouteRequest request) {
        return engineClient.fetchRoute(request, "ambulance_routine");
    }
}