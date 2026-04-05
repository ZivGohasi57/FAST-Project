package api.controllers;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import core.models.RouteRequest;
import core.models.RouteResponse;
import routing.engine.FastRoutingEngine;
import routing.engine.FastRoutingEngineClient;
import routing.strategies.EmergencyRoutingStrategy;
import routing.strategies.RoutineRoutingStrategy;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.HashMap;
import java.util.Map;

public class RoutingController {

    // Shared engine — built once at startup (loads / builds the graph from OSM)
    private static final FastRoutingEngineClient ENGINE_CLIENT =
            new FastRoutingEngineClient("export.osm", "graph-cache-v2");

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8082), 0);
        server.createContext("/api/route", new RouteHandler());
        server.setExecutor(null);
        server.start();
        System.out.println("FAST API Server is running on http://localhost:8082");
    }

    static class RouteHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type,Authorization");
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            if ("GET".equals(exchange.getRequestMethod())) {
                Map<String, String> params = queryToMap(exchange.getRequestURI().getQuery());

                double startLat = Double.parseDouble(params.get("startLat"));
                double startLon = Double.parseDouble(params.get("startLon"));
                double endLat   = Double.parseDouble(params.get("endLat"));
                double endLon   = Double.parseDouble(params.get("endLon"));
                boolean isEmergency = Boolean.parseBoolean(params.get("isEmergency"));

                FastRoutingEngine engine = new FastRoutingEngine(
                        isEmergency
                                ? new EmergencyRoutingStrategy(ENGINE_CLIENT)
                                : new RoutineRoutingStrategy(ENGINE_CLIENT)
                );

                RouteRequest request = new RouteRequest(startLat, startLon, endLat, endLon, isEmergency);
                RouteResponse response = engine.getOptimalRoute(request);

                Gson gson = new Gson();
                String jsonResponse = gson.toJson(response);

                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                byte[] responseBytes = jsonResponse.getBytes();
                exchange.sendResponseHeaders(200, responseBytes.length);

                OutputStream os = exchange.getResponseBody();
                os.write(responseBytes);
                os.close();
            }
        }
    }

    private static Map<String, String> queryToMap(String query) {
        Map<String, String> result = new HashMap<>();
        if (query == null) return result;
        for (String param : query.split("&")) {
            String[] entry = param.split("=");
            if (entry.length > 1) {
                result.put(entry[0], entry[1]);
            }
        }
        return result;
    }
}
