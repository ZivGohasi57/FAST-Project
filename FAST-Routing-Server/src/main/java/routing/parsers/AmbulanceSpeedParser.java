package routing.parsers;

import com.graphhopper.routing.ev.EncodedValueLookup;
import com.graphhopper.routing.ev.FerrySpeed;
import com.graphhopper.routing.ev.VehicleSpeed;
import com.graphhopper.routing.util.parsers.CarAverageSpeedParser;

/// retrieve information on possible speed for ambulance based on car speed.
/// ambulance can go both ways with car speed because of contraflow
public class AmbulanceSpeedParser extends CarAverageSpeedParser {

    public AmbulanceSpeedParser(EncodedValueLookup lookup) {
        super(
            lookup.getDecimalEncodedValue(VehicleSpeed.key("ambulance")),
            lookup.getDecimalEncodedValue(FerrySpeed.KEY)
        );
    }
}
