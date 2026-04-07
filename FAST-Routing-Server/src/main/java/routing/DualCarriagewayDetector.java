package routing;

import org.xml.sax.Attributes;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import java.io.File;
import java.util.*;

/**
 * Detects dual-carriageway (divided) roads in the OSM dataset.
 *
 * A one-way road is classified as a dual carriageway if there is another one-way
 * road within PARALLEL_MAX_DIST_M metres whose direction is approximately opposite
 * (180° ± PARALLEL_ANGLE_TOL_DEG). This matches the classic divided-road pattern
 * where each carriageway is mapped as a separate one-way line.
 *
 * This is used by AmbulanceAccessParser to enforce the rule:
 *   "contraflow is only permitted when there is NO parallel road carrying traffic
 *    in the normal direction AND the road is an urban road."
 *
 * Usage: call DualCarriagewayDetector.build(osmFile) once at startup.
 */
public class DualCarriagewayDetector extends DefaultHandler {

    // ── Tuning parameters ─────────────────────────────────────────────────────
    /** Max distance (m) between two carriageways to be considered parallel. */
    private static final double PARALLEL_MAX_DIST_M    = 40.0;
    /** Directions must differ from 180° by less than this (degrees). */
    private static final double PARALLEL_ANGLE_TOL_DEG = 45.0;
    /** Spatial grid cell size (m). Must be > PARALLEL_MAX_DIST_M. */
    private static final double CELL_M  = 60.0;
    private static final double CELL_LAT = CELL_M / 111_320.0;
    // ~32° N (central Israel) for longitude normalisation
    private static final double CELL_LON = CELL_M / (111_320.0 * Math.cos(Math.toRadians(32.0)));

    /** Roads on which an ambulance might drive (matches GraphHopper car profile). */
    private static final Set<String> MOTOR_HIGHWAYS;
    static {
        MOTOR_HIGHWAYS = new HashSet<>(Arrays.asList(
            "motorway", "motorway_link", "trunk", "trunk_link",
            "primary",  "primary_link",
            "secondary","secondary_link",
            "tertiary", "tertiary_link",
            "unclassified", "residential", "living_street", "service"
        ));
    }

    // ── SAX state ─────────────────────────────────────────────────────────────
    private final Map<Long, double[]> nodeCoords = new HashMap<>(2_000_000);
    private boolean inWay   = false;
    private long    curWayId;
    private final List<Long> curNodes = new ArrayList<>();
    private String curHighway = "";
    private String curOneway  = "no";

    // Segments accumulated during parse (one per one-way motor way)
    private final List<SegmentData> segments = new ArrayList<>();

    // Final result: way IDs that have a parallel carriageway
    private final Set<Long> dualWayIds = new HashSet<>();

    // ── Public API ────────────────────────────────────────────────────────────

    public static DualCarriagewayDetector build(String osmFile) {
        DualCarriagewayDetector handler = new DualCarriagewayDetector();
        try {
            SAXParserFactory factory = SAXParserFactory.newInstance();
            SAXParser parser = factory.newSAXParser();
            parser.parse(new File(osmFile), handler);
            handler.detectDuals();
            System.out.println("[DualCarriageway] Scanned " + handler.segments.size()
                + " one-way segments; detected " + handler.dualWayIds.size()
                + " dual-carriageway way(s).");
        } catch (Exception e) {
            System.err.println("[DualCarriageway] Parse error: " + e.getMessage());
        }
        // Free node coordinates — no longer needed after detection
        handler.nodeCoords.clear();
        handler.segments.clear();
        return handler;
    }

    /** Returns true when the OSM way has a parallel counterpart (dual carriageway). */
    public boolean isDual(long wayId) {
        return dualWayIds.contains(wayId);
    }

    // ── SAX callbacks ─────────────────────────────────────────────────────────

    @Override
    public void startElement(String uri, String localName, String qName, Attributes atts) {
        if ("node".equals(qName)) {
            String id  = atts.getValue("id");
            String lat = atts.getValue("lat");
            String lon = atts.getValue("lon");
            if (id != null && lat != null && lon != null) {
                nodeCoords.put(Long.parseLong(id),
                    new double[]{ Double.parseDouble(lat), Double.parseDouble(lon) });
            }
        } else if ("way".equals(qName)) {
            inWay      = true;
            curWayId   = Long.parseLong(atts.getValue("id"));
            curNodes.clear();
            curHighway = "";
            curOneway  = "no";
        } else if (inWay) {
            if ("nd".equals(qName)) {
                curNodes.add(Long.parseLong(atts.getValue("ref")));
            } else if ("tag".equals(qName)) {
                String k = atts.getValue("k");
                String v = atts.getValue("v");
                if ("highway".equals(k)) curHighway = v;
                else if ("oneway".equals(k)) curOneway = v;
            }
        }
    }

    @Override
    public void endElement(String uri, String localName, String qName) {
        if ("way".equals(qName) && inWay) {
            processWay();
            inWay = false;
        }
    }

    // ── Way processing ────────────────────────────────────────────────────────

    private void processWay() {
        if (!MOTOR_HIGHWAYS.contains(curHighway)) return;
        if (curNodes.size() < 2) return;

        boolean isMajorHighway = curHighway.startsWith("motorway") || curHighway.startsWith("trunk");
        boolean isOneway = "yes".equals(curOneway) || "1".equals(curOneway)
                        || "true".equals(curOneway) || isMajorHighway;
        if (!isOneway) return;

        double[] start = nodeCoords.get(curNodes.get(0));
        double[] end   = nodeCoords.get(curNodes.get(curNodes.size() - 1));
        if (start == null || end == null) return;

        double midLat = (start[0] + end[0]) / 2.0;
        double midLon = (start[1] + end[1]) / 2.0;
        double bear   = bearing(start[0], start[1], end[0], end[1]);

        segments.add(new SegmentData(curWayId, midLat, midLon, bear));
    }

    // ── Parallel detection ────────────────────────────────────────────────────

    private void detectDuals() {
        // Build spatial grid
        Map<Long, List<SegmentData>> grid = new HashMap<>();
        for (SegmentData seg : segments) {
            long key = cellKey(seg.midLat, seg.midLon);
            if (!grid.containsKey(key)) grid.put(key, new ArrayList<>());
            grid.get(key).add(seg);
        }

        // For each segment, check neighbourhood for an opposing parallel
        for (SegmentData seg : segments) {
            if (hasParallel(seg, grid)) {
                dualWayIds.add(seg.wayId);
            }
        }
    }

    private boolean hasParallel(SegmentData seg, Map<Long, List<SegmentData>> grid) {
        int row = (int) Math.floor(seg.midLat / CELL_LAT);
        int col = (int) Math.floor(seg.midLon / CELL_LON);
        for (int dr = -1; dr <= 1; dr++) {
            for (int dc = -1; dc <= 1; dc++) {
                long key = ((long)(row + dr) << 32) | ((long)(col + dc) & 0xFFFFFFFFL);
                List<SegmentData> bucket = grid.get(key);
                if (bucket == null) continue;
                for (SegmentData other : bucket) {
                    if (other.wayId != seg.wayId && isOppositeParallel(seg, other)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static boolean isOppositeParallel(SegmentData a, SegmentData b) {
        // Approximate Euclidean distance in metres
        double dLat = (a.midLat - b.midLat) * 111_320.0;
        double dLon = (a.midLon - b.midLon) * 111_320.0 * Math.cos(Math.toRadians(a.midLat));
        if (dLat * dLat + dLon * dLon > PARALLEL_MAX_DIST_M * PARALLEL_MAX_DIST_M) return false;

        // Directions must differ by ~180°
        double diff = Math.abs((a.bearing - b.bearing + 360.0) % 360.0 - 180.0);
        return diff <= PARALLEL_ANGLE_TOL_DEG;
    }

    // ── Geometry helpers ──────────────────────────────────────────────────────

    private static long cellKey(double lat, double lon) {
        int row = (int) Math.floor(lat / CELL_LAT);
        int col = (int) Math.floor(lon / CELL_LON);
        return ((long) row << 32) | ((long) col & 0xFFFFFFFFL);
    }

    private static double bearing(double lat1, double lon1, double lat2, double lon2) {
        double dLon  = Math.toRadians(lon2 - lon1);
        double lat1r = Math.toRadians(lat1);
        double lat2r = Math.toRadians(lat2);
        double y = Math.sin(dLon) * Math.cos(lat2r);
        double x = Math.cos(lat1r) * Math.sin(lat2r)
                 - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
        return Math.toDegrees(Math.atan2(y, x));
    }

    // ── Data class ────────────────────────────────────────────────────────────

    private static class SegmentData {
        final long   wayId;
        final double midLat, midLon, bearing;

        SegmentData(long wayId, double midLat, double midLon, double bearing) {
            this.wayId   = wayId;
            this.midLat  = midLat;
            this.midLon  = midLon;
            this.bearing = bearing;
        }
    }
}
