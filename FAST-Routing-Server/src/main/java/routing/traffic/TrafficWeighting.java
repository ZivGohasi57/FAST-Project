package routing.traffic;

import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.EdgeIteratorState;

public class TrafficWeighting implements Weighting {

    private final Weighting base;
    private final TrafficData trafficData;

    public TrafficWeighting(Weighting base, TrafficData trafficData) {
        this.base = base;
        this.trafficData = trafficData;
    }

    @Override
    public double calcMinWeightPerDistance() {
        return base.calcMinWeightPerDistance();
    }

    @Override
    public double calcEdgeWeight(EdgeIteratorState edgeState, boolean reverse) {
        return base.calcEdgeWeight(edgeState, reverse)
                * trafficData.getWeightMultiplier(edgeState.getEdge());
    }

    @Override
    public long calcEdgeMillis(EdgeIteratorState edgeState, boolean reverse) {
        return (long) (base.calcEdgeMillis(edgeState, reverse)
                * trafficData.getWeightMultiplier(edgeState.getEdge()));
    }

    @Override
    public double calcTurnWeight(int inEdge, int viaNode, int outEdge) {
        return base.calcTurnWeight(inEdge, viaNode, outEdge);
    }

    @Override
    public long calcTurnMillis(int inEdge, int viaNode, int outEdge) {
        return base.calcTurnMillis(inEdge, viaNode, outEdge);
    }

    @Override
    public boolean hasTurnCosts() {
        return base.hasTurnCosts();
    }

    @Override
    public String getName() {
        return "traffic|" + base.getName();
    }
}
