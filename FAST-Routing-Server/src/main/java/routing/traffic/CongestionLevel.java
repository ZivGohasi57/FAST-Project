package routing.traffic;

public enum CongestionLevel {

    LIGHT(0.70),
    MEDIUM(0.45),
    HEAVY(0.25);

    private final double speedFactor;

    CongestionLevel(double speedFactor) {
        this.speedFactor = speedFactor;
    }

    public double getWeightMultiplier() {
        return 1.0 / speedFactor;
    }

    public double getSpeedFactor() {
        return speedFactor;
    }
}
