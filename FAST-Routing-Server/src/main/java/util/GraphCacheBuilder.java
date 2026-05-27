package util;

import routing.engine.FastRoutingEngineClient;

/**
 * Standalone entry point used during Docker build to pre-import the OSM file
 * and write the GraphHopper graph cache to disk.
 *
 * At container runtime, FastRoutingEngineClient calls gh.importOrLoad() which
 * detects the pre-built cache and loads it in ~3 seconds instead of ~35 seconds.
 */
public class GraphCacheBuilder {
    public static void main(String[] args) {
        String osmFile  = args.length > 0 ? args[0] : "export.osm";
        String cacheDir = args.length > 1 ? args[1] : "graph-cache-v2";
        System.out.println("[FAST] Pre-building GraphHopper graph cache: " + osmFile + " → " + cacheDir);
        new FastRoutingEngineClient(osmFile, cacheDir);
        System.out.println("[FAST] Graph cache ready.");
    }
}
