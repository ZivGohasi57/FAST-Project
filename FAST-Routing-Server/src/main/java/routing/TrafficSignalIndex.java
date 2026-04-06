package routing;

import org.xml.sax.Attributes;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Loads all highway=traffic_signals nodes from the OSM file at startup.
 * Used by RouteTimeCalculator to distinguish signalised from unsignalised intersections.
 */
public class TrafficSignalIndex {

    private final double[] lats;
    private final double[] lons;

    public TrafficSignalIndex(String osmFilePath) {
        List<double[]> signals = new ArrayList<>();

        try {
            SAXParser parser = SAXParserFactory.newInstance().newSAXParser();
            parser.parse(new File(osmFilePath), new DefaultHandler() {
                private double curLat, curLon;
                private boolean insideNode = false;

                @Override
                public void startElement(String uri, String local, String qName, Attributes attrs) {
                    if ("node".equals(qName)) {
                        String lat = attrs.getValue("lat");
                        String lon = attrs.getValue("lon");
                        if (lat != null && lon != null) {
                            curLat = Double.parseDouble(lat);
                            curLon = Double.parseDouble(lon);
                            insideNode = true;
                        }
                    } else if ("tag".equals(qName) && insideNode) {
                        if ("highway".equals(attrs.getValue("k")) &&
                                "traffic_signals".equals(attrs.getValue("v"))) {
                            signals.add(new double[]{curLat, curLon});
                        }
                    }
                }

                @Override
                public void endElement(String uri, String local, String qName) {
                    if ("node".equals(qName)) insideNode = false;
                }
            });
        } catch (Exception e) {
            System.err.println("[FAST] TrafficSignalIndex: failed to parse OSM — " + e.getMessage());
        }

        lats = new double[signals.size()];
        lons = new double[signals.size()];
        for (int i = 0; i < signals.size(); i++) {
            lats[i] = signals.get(i)[0];
            lons[i] = signals.get(i)[1];
        }
        System.out.printf("[FAST] TrafficSignalIndex: loaded %d traffic signal nodes%n", lats.length);
    }

    /**
     * Returns true if any traffic_signals node lies within radiusMeters of (lat, lon).
     * Uses a bounding-box pre-filter for speed; exact distance check is skipped since
     * the tolerance is small (15 m) and the approximation is sufficient at city scale.
     */
    public boolean hasSignalNear(double lat, double lon, double radiusMeters) {
        // 1 degree latitude ≈ 111 320 m; longitude degree shrinks by cos(lat)
        double dLat = radiusMeters / 111_320.0;
        double dLon = radiusMeters / (111_320.0 * Math.cos(Math.toRadians(lat)));

        for (int i = 0; i < lats.length; i++) {
            if (Math.abs(lats[i] - lat) <= dLat && Math.abs(lons[i] - lon) <= dLon) {
                return true;
            }
        }
        return false;
    }

    /** Returns all loaded traffic-signal nodes as Coordinate objects. */
    public List<core.models.Coordinate> getAllSignals() {
        List<core.models.Coordinate> result = new ArrayList<>(lats.length);
        for (int i = 0; i < lats.length; i++) {
            result.add(new core.models.Coordinate(lats[i], lons[i]));
        }
        return result;
    }

    public int size() {
        return lats.length;
    }
}
