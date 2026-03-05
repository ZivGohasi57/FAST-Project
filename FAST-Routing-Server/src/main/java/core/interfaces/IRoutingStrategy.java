package core.interfaces;

import core.models.RouteRequest;
import core.models.RouteResponse;

public interface IRoutingStrategy {
    RouteResponse calculateRoute(RouteRequest request);
}