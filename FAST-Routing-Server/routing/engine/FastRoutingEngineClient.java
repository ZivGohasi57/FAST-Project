package routing.engine;

import core.interfaces.IRoutingEngineClient;
import core.models.Coordinate;
import core.models.RouteRequest;
import core.models.RouteResponse;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;

public class FastRoutingEngineClient implements IRoutingEngineClient {

    private final String baseUrl;
    private final HttpClient httpClient;
    private final Gson gson;

    public FastRoutingEngineClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newHttpClient();
        this.gson = new Gson();
    }

    @Override
    public RouteResponse fetchRoute(RouteRequest request, String profileName) {
        try {
            String url = String.format("%s/route?point=%f,%f&point=%f,%f&profile=%s&points_encoded=false",
                    baseUrl,
                    request.getStartLat(), request.getStartLon(),
                    request.getEndLat(), request.getEndLon(),
                    profileName);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            JsonObject jsonObject = gson.fromJson(response.body(), JsonObject.class);
            JsonArray paths = jsonObject.getAsJsonArray("paths");
            JsonObject firstPath = paths.get(0).getAsJsonObject();

            double distance = firstPath.get("distance").getAsDouble();
            long time = firstPath.get("time").getAsLong();

            JsonObject pointsObj = firstPath.getAsJsonObject("points");
            JsonArray coordinatesArray = pointsObj.getAsJsonArray("coordinates");

            List<Coordinate> pathCoordinates = new ArrayList<>();
            for (JsonElement element : coordinatesArray) {
                JsonArray coord = element.getAsJsonArray();
                double lon = coord.get(0).getAsDouble();
                double lat = coord.get(1).getAsDouble();
                pathCoordinates.add(new Coordinate(lat, lon));
            }

            return new RouteResponse(distance, time, pathCoordinates);

        } catch (Exception e) {
            e.printStackTrace();
            return new RouteResponse(0.0, 0L, new ArrayList<>());
        }
    }
}