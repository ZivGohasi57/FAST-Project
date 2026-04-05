package routing;

import com.graphhopper.routing.ev.DecimalEncodedValueImpl;
import com.graphhopper.routing.ev.DefaultImportRegistry;
import com.graphhopper.routing.ev.ImportUnit;
import com.graphhopper.routing.ev.VehicleAccess;
import com.graphhopper.routing.ev.VehicleSpeed;
import routing.parsers.AmbulanceAccessParser;
import routing.parsers.AmbulanceSpeedParser;

/**
 * Extends GraphHopper's default import registry to add support for the "ambulance" vehicle type.
 *
 * This allows GH to build the graph with two additional encoded values:
 *   - ambulance_access   : bidirectional access for all motor roads (contraflow)
 *   - ambulance_average_speed : same speed values as car, but stored independently
 *
 * The emergency routing profile uses these values, enabling contraflow while
 * the routine profile continues using car_access (one-way restricted).
 */
public class AmbulanceImportRegistry extends DefaultImportRegistry {

    @Override
    public ImportUnit createImportUnit(String name) {

        if (VehicleAccess.key("ambulance").equals(name)) {
            return ImportUnit.create(
                name,
                props -> VehicleAccess.create("ambulance"),
                (lookup, props) -> new AmbulanceAccessParser(lookup, props),
                "roundabout"
            );
        }

        if (VehicleSpeed.key("ambulance").equals(name)) {
            return ImportUnit.create(
                name,
                props -> new DecimalEncodedValueImpl(
                    name,
                    props.getInt("speed_bits", 7),
                    props.getDouble("speed_factor", 2.0),
                    true  // storeTwoDirections — required for bidirectional speed
                ),
                (lookup, props) -> new AmbulanceSpeedParser(lookup),
                "ferry_speed"
            );
        }

        return super.createImportUnit(name);
    }
}
