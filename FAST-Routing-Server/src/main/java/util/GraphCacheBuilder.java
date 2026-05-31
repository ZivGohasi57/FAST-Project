package util;

import routing.engine.FastRoutingEngineClient;

public class GraphCacheBuilder {
    public static void main(String[] args) {
        String osmFile  = args.length > 0 ? args[0] : "export.osm";
        String cacheDir = args.length > 1 ? args[1] : "graph-cache-v2";
        System.out.println("[FAST] Pre-building GraphHopper graph cache: " + osmFile + " → " + cacheDir);
        new FastRoutingEngineClient(osmFile, cacheDir);
        System.out.println("[FAST] Graph cache ready.");
    }
}
