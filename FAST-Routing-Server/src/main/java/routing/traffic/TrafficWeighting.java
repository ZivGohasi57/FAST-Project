package routing.traffic;

import com.graphhopper.routing.ev.BooleanEncodedValue;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.EdgeIteratorState;

public class TrafficWeighting implements Weighting {

    private final Weighting          base;
    private final TrafficData        trafficData;
    private final BooleanEncodedValue carAccessEnc;

    public TrafficWeighting(Weighting base, TrafficData trafficData,
                            BooleanEncodedValue carAccessEnc) {
        this.base         = base;
        this.trafficData  = trafficData;
        this.carAccessEnc = carAccessEnc;
    }

    @Override
    public double calcMinWeightPerDistance() {
        return base.calcMinWeightPerDistance();
    }

    @Override
    public double calcEdgeWeight(EdgeIteratorState edgeState, boolean reverse) {
        int    edgeId     = edgeState.getEdge();
        double multiplier = trafficData.getWeightMultiplier(edgeId);

        if (multiplier > 1.0 && isContraflow(edgeState, reverse)) {
            return 1e15;
        }

        return base.calcEdgeWeight(edgeState, reverse) * multiplier;
    }

    @Override
    public long calcEdgeMillis(EdgeIteratorState edgeState, boolean reverse) {
        int    edgeId     = edgeState.getEdge();
        double multiplier = trafficData.getWeightMultiplier(edgeId);

        if (multiplier > 1.0 && isContraflow(edgeState, reverse)) {
            return Long.MAX_VALUE / 2;
        }

        return (long) (base.calcEdgeMillis(edgeState, reverse) * multiplier);
    }

    private boolean isContraflow(EdgeIteratorState edgeState, boolean reverse) {
        boolean carAllowed = reverse
                ? edgeState.getReverse(carAccessEnc)
                : edgeState.get(carAccessEnc);
        return !carAllowed;
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
