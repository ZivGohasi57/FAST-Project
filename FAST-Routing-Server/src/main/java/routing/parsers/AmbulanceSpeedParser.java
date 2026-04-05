package routing.parsers;

import com.graphhopper.routing.ev.EncodedValueLookup;
import com.graphhopper.routing.ev.FerrySpeed;
import com.graphhopper.routing.ev.VehicleSpeed;
import com.graphhopper.routing.util.parsers.CarAverageSpeedParser;

/**
 * Speed parser for ambulance vehicles.
 *
 * Extends CarAverageSpeedParser using the ambulance_average_speed encoded value instead of
 * car_average_speed. Both forward and backward speeds are set for every motor road, which
 * (combined with AmbulanceAccessParser's bidirectional access) enables contraflow routing
 * in the emergency profile.
 *
 * Speed values are identical to car speeds — the CustomModel's speed statements
 * can apply multipliers at routing time.
 */
public class AmbulanceSpeedParser extends CarAverageSpeedParser {

    public AmbulanceSpeedParser(EncodedValueLookup lookup) {
        super(
            lookup.getDecimalEncodedValue(VehicleSpeed.key("ambulance")),
            lookup.getDecimalEncodedValue(FerrySpeed.KEY)
        );
    }
}
