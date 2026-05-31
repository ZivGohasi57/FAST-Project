package routing.traffic;

import java.util.concurrent.ConcurrentHashMap;

public class TrafficData {

    private final ConcurrentHashMap<Integer, CongestionLevel> congestion = new ConcurrentHashMap<>();

    public void setCongestion(int edgeId, CongestionLevel level) {
        congestion.put(edgeId, level);
    }

    public void clearCongestion(int edgeId) {
        congestion.remove(edgeId);
    }

    public void clearAll() {
        congestion.clear();
    }

    public double getWeightMultiplier(int edgeId) {
        CongestionLevel level = congestion.get(edgeId);
        return level != null ? level.getWeightMultiplier() : 1.0;
    }

    public int activeJamCount() {
        return congestion.size();
    }
}
