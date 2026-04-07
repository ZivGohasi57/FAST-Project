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
import routing.DualCarriagewayDetector;

/**
 * Custom access parser for ambulance vehicles in EMERGENCY mode.
 *
 * Contraflow rules (both must hold for contraflow to be permitted):
 *
 *   1. URBAN ROAD ONLY
 *      motorway / motorway_link / trunk / trunk_link  →  contraflow BLOCKED
 *      (These are inter-city or controlled-access roads; too dangerous.)
 *
 *   2. NO PARALLEL ROAD IN THE CORRECT DIRECTION
 *      If there is another one-way road within ~40 m running in the opposite
 *      direction (dual carriageway pattern), contraflow is BLOCKED.
 *      The DualCarriagewayDetector pre-computes this from the OSM data.
 *
 * Additionally:
 *   - Roundabouts always respect one-way direction (even in emergency).
 *   - Pedestrian / cycling / unpaved ways are blocked.
 */
public class AmbulanceAccessParser extends CarAccessParser {

    private final DualCarriagewayDetector dualDetector;

    public AmbulanceAccessParser(EncodedValueLookup lookup, PMap properties,
                                 DualCarriagewayDetector dualDetector) {
        super(
            lookup.getBooleanEncodedValue(VehicleAccess.key("ambulance")),
            lookup.getBooleanEncodedValue(Roundabout.KEY),
            properties,
            OSMRoadAccessParser.toOSMRestrictions(TransportationMode.CAR)
        );
        this.dualDetector = dualDetector;
    }

    // ── Accessibility check ───────────────────────────────────────────────────

    @Override
    public WayAccess getAccess(ReaderWay way) {
        String highway = way.getTag("highway", "");

        // Pedestrian / cycling infrastructure
        if ("steps".equals(highway) || "footway".equals(highway) ||
                "path".equals(highway) || "pedestrian".equals(highway) ||
                "cycleway".equals(highway)) {
            return WayAccess.CAN_SKIP;
        }

        // Unpaved surfaces
        String surface = way.getTag("surface", "");
        if ("unpaved".equals(surface) || "dirt".equals(surface) ||
                "gravel".equals(surface) || "grass".equals(surface) ||
                "sand".equals(surface)  || "ground".equals(surface)) {
            return WayAccess.CAN_SKIP;
        }

        if (!highwayValues.contains(highway)) {
            return WayAccess.CAN_SKIP;
        }

        return WayAccess.WAY;
    }

    // ── Tag handling (direction encoding) ────────────────────────────────────

    @Override
    public void handleWayTags(int edgeId, EdgeIntAccess edgeIntAccess, ReaderWay way) {
        if (getAccess(way) == WayAccess.CAN_SKIP) {
            accessEnc.setBool(false, edgeId, edgeIntAccess, false);
            accessEnc.setBool(true,  edgeId, edgeIntAccess, false);
            return;
        }

        // ── Rule 0: roundabouts — always one-way, even in emergency ───────────
        boolean isRoundabout = way.hasTag("junction", "roundabout")
                            || way.hasTag("junction", "circular");
        if (isRoundabout) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        String highway = way.getTag("highway", "");

        // ── Rule 1: non-urban roads (motorway / trunk) — no contraflow ────────
        boolean isNonUrban = highway.startsWith("motorway") || highway.startsWith("trunk");
        if (isNonUrban) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        // ── Rule 2: dual carriageway — parallel road exists — no contraflow ───
        // Only applies to one-way roads (bidirectional roads have no contraflow issue).
        boolean isOneWay = way.hasTag("oneway", "yes") || way.hasTag("oneway", "1")
                        || way.hasTag("oneway", "true");
        if (isOneWay && dualDetector.isDual(way.getId())) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        // ── CONTRAFLOW ALLOWED: urban road, no parallel road ─────────────────
        accessEnc.setBool(false, edgeId, edgeIntAccess, true);
        accessEnc.setBool(true,  edgeId, edgeIntAccess, true);
    }
}
