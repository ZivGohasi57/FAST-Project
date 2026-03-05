package routing.engine;

import core.interfaces.IRoutingStrategy;
import core.models.RouteRequest;
import core.models.RouteResponse;

public class FastRoutingEngine {
    
    private IRoutingStrategy currentStrategy;

    public FastRoutingEngine(IRoutingStrategy initialStrategy) {
        this.currentStrategy = initialStrategy;
    }

    public void setStrategy(IRoutingStrategy newStrategy) {
        this.currentStrategy = newStrategy;
    }

    public RouteResponse getOptimalRoute(RouteRequest request) {
        return this.currentStrategy.calculateRoute(request);
    }
}