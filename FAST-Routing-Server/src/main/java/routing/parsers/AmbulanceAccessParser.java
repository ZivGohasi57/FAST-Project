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


/// ambulanceaccessparser - set ambulance access rules, ambu;ance can access wherever car can.
/// and ambulance can go contraflow if not on highway
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

    @Override
    public WayAccess getAccess(ReaderWay way) {
        String highway = way.getTag("highway", "");

        if ("steps".equals(highway) || "footway".equals(highway) ||
                "path".equals(highway) || "pedestrian".equals(highway) ||
                "cycleway".equals(highway)) {
            return WayAccess.CAN_SKIP;
        }

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

    @Override
    public void handleWayTags(int edgeId, EdgeIntAccess edgeIntAccess, ReaderWay way) {
        if (getAccess(way) == WayAccess.CAN_SKIP) {
            accessEnc.setBool(false, edgeId, edgeIntAccess, false);
            accessEnc.setBool(true,  edgeId, edgeIntAccess, false);
            return;
        }

        boolean isRoundabout = way.hasTag("junction", "roundabout")
                            || way.hasTag("junction", "circular");
        if (isRoundabout) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        String highway = way.getTag("highway", "");

        boolean isNonUrban = highway.startsWith("motorway") || highway.startsWith("trunk");
        if (isNonUrban) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        boolean isOneWay = way.hasTag("oneway", "yes") || way.hasTag("oneway", "1")
                        || way.hasTag("oneway", "true");
        if (isOneWay && dualDetector.isDual(way.getId())) {
            super.handleWayTags(edgeId, edgeIntAccess, way);
            return;
        }

        accessEnc.setBool(false, edgeId, edgeIntAccess, true);
        accessEnc.setBool(true,  edgeId, edgeIntAccess, true);
    }
}
