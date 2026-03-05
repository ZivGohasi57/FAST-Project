package routing.engine;

import core.interfaces.IRoutingEngineClient;
import core.models.RouteRequest;
import core.models.RouteResponse;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;

public class FastRoutingEngineClient implements IRoutingEngineClient {

    private final String baseUrl;
    private final HttpClient httpClient;

    public FastRoutingEngineClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newHttpClient();
    }

    @Override
    public RouteResponse fetchRoute(RouteRequest request, String profileName) {
        try {
            String url = String.format("%s/route?point=%f,%f&point=%f,%f&profile=%s",
                    baseUrl,
                    request.getStartLat(), request.getStartLon(),
                    request.getEndLat(), request.getEndLon(),
                    profileName);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            System.out.println(response.body());

            return new RouteResponse(0.0, 0L, new ArrayList<>());

        } catch (Exception e) {
            e.printStackTrace();
            return new RouteResponse(0.0, 0L, new ArrayList<>());
        }
    }
}