package routing.parsers;

import com.graphhopper.reader.ReaderWay;
import com.graphhopper.routing.ev.EdgeIntAccess;
import com.graphhopper.routing.ev.EncodedValueLookup;
import com.graphhopper.routing.ev.Roundabout;
import com.graphhopper.routing.ev.VehicleAccess;
import com.graphhopper.routing.util.parsers.OSMRoadAccessParser;
import com.graphhopper.routing.util.TransportationMode;
import com.graphhopper.routing.util.WayAccess;
import com.graphhopper.routing.util.parsers.CarAccessParser;
import com.graphhopper.util.PMap;

/**
 * Custom access parser for ambulance vehicles in EMERGENCY mode.
 *
 * Key behavior vs standard CarAccessParser:
 * - CONTRAFLOW: Both directions are set accessible, allowing wrong-way driving.
 * - NO-GO zones: pedestrian ways and unpaved roads are blocked (design doc safety requirement).
 * - All motor roads (incl. one-way streets) are accessible in both directions.
 */
public class AmbulanceAccessParser extends CarAccessParser {

    public AmbulanceAccessParser(EncodedValueLookup lookup, PMap properties) {
        super(
            lookup.getBooleanEncodedValue(VehicleAccess.key("ambulance")),
            lookup.getBooleanEncodedValue(Roundabout.KEY),
            properties,
            OSMRoadAccessParser.toOSMRestrictions(TransportationMode.CAR)
        );
    }

    /**
     * Determines if a road is accessible for ambulances.
     * Blocks pedestrian ways and unpaved roads per design doc safety constraints.
     */
    @Override
    public WayAccess getAccess(ReaderWay way) {
        String highway = way.getTag("highway", "");

        // No-go zones: pedestrian and cycling infrastructure
        if (highway.equals("steps") || highway.equals("footway") ||
                highway.equals("path") || highway.equals("pedestrian") ||
                highway.equals("cycleway")) {
            return WayAccess.CAN_SKIP;
        }

        // No-go zones: unpaved roads (safety requirement from design doc)
        String surface = way.getTag("surface", "");
        if (surface.equals("unpaved") || surface.equals("dirt") ||
                surface.equals("gravel") || surface.equals("grass") ||
                surface.equals("sand") || surface.equals("ground")) {
            return WayAccess.CAN_SKIP;
        }

        // Must be a motor road
        if (!highwayValues.contains(highway)) {
            return WayAccess.CAN_SKIP;
        }

        return WayAccess.WAY;
    }

    /**
     * Sets BOTH directions accessible for all allowed motor roads.
     * Exception: roundabouts always obey their one-way direction (too dangerous to contraflow).
     */
    @Override
    public void handleWayTags(int edgeId, EdgeIntAccess edgeIntAccess, ReaderWay way) {
        if (getAccess(way) == WayAccess.CAN_SKIP) {
            accessEnc.setBool(false, edgeId, edgeIntAccess, false);
            accessEnc.setBool(true, edgeId, edgeIntAccess, false);
            return;
        }

        // Roundabouts: respect one-way direction even in emergency mode
        boolean isRoundabout = way.hasTag("junction", "roundabout") || way.hasTag("junction", "circular");
        if (isRoundabout) {
            // Let the parent CarAccessParser handle it — it correctly encodes one-way roundabout direction
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        // CONTRAFLOW: allow both forward and backward traversal on regular roads
        accessEnc.setBool(false, edgeId, edgeIntAccess, true);
        accessEnc.setBool(true, edgeId, edgeIntAccess, true);
    }
}
