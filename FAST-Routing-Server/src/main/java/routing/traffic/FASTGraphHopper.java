package routing.traffic;

import com.graphhopper.GraphHopper;
import com.graphhopper.routing.DefaultWeightingFactory;
import com.graphhopper.routing.WeightingFactory;

public class FASTGraphHopper extends GraphHopper {

    private final TrafficData trafficData = new TrafficData();
    private TrafficSimulator trafficSimulator;

    @Override
    public GraphHopper importOrLoad() {
        GraphHopper result = super.importOrLoad();
        trafficSimulator = new TrafficSimulator(
                getBaseGraph(), getEncodingManager(), trafficData);
        trafficSimulator.start();
        return result;
    }

    @Override
    protected WeightingFactory createWeightingFactory() {
        WeightingFactory base = new DefaultWeightingFactory(
                getBaseGraph(), getEncodingManager());
        return (profile, hints, disableTurnCosts) ->
                new TrafficWeighting(base.createWeighting(profile, hints, disableTurnCosts), trafficData);
    }

    public TrafficData getTrafficData() {
        return trafficData;
    }

    @Override
    public void close() {
        if (trafficSimulator != null) trafficSimulator.stop();
        super.close();
    }
}
