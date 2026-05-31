package routing;

import com.graphhopper.routing.ev.DecimalEncodedValueImpl;
import com.graphhopper.routing.ev.DefaultImportRegistry;
import com.graphhopper.routing.ev.ImportUnit;
import com.graphhopper.routing.ev.VehicleAccess;
import com.graphhopper.routing.ev.VehicleSpeed;
import routing.parsers.AmbulanceAccessParser;
import routing.parsers.AmbulanceSpeedParser;

public class AmbulanceImportRegistry extends DefaultImportRegistry {

    private final DualCarriagewayDetector dualDetector;

    public AmbulanceImportRegistry(DualCarriagewayDetector dualDetector) {
        this.dualDetector = dualDetector;
    }

    @Override
    public ImportUnit createImportUnit(String name) {

        if (VehicleAccess.key("ambulance").equals(name)) {
            final DualCarriagewayDetector det = dualDetector;
            return ImportUnit.create(
                name,
                props -> VehicleAccess.create("ambulance"),
                (lookup, props) -> new AmbulanceAccessParser(lookup, props, det),
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
                    true
                ),
                (lookup, props) -> new AmbulanceSpeedParser(lookup),
                "ferry_speed"
            );
        }

        return super.createImportUnit(name);
    }
}
