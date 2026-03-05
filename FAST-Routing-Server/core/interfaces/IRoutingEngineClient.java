package core.interfaces;

import core.models.RouteRequest;
import core.models.RouteResponse;

public interface IRoutingEngineClient {
    RouteResponse fetchRoute(RouteRequest request, String profileName);
}