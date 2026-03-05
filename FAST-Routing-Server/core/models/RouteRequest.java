package core.models;

public class RouteRequest {
    private double startLat;
    private double startLon;
    private double endLat;
    private double endLon;
    private boolean isEmergency;

    public RouteRequest(double startLat, double startLon, double endLat, double endLon, boolean isEmergency) {
        this.startLat = startLat;
        this.startLon = startLon;
        this.endLat = endLat;
        this.endLon = endLon;
        this.isEmergency = isEmergency;
    }

    public double getStartLat() { return startLat; }
    public void setStartLat(double startLat) { this.startLat = startLat; }

    public double getStartLon() { return startLon; }
    public void setStartLon(double startLon) { this.startLon = startLon; }

    public double getEndLat() { return endLat; }
    public void setEndLat(double endLat) { this.endLat = endLat; }

    public double getEndLon() { return endLon; }
    public void setEndLon(double endLon) { this.endLon = endLon; }

    public boolean isEmergency() { return isEmergency; }
    public void setEmergency(boolean emergency) { isEmergency = emergency; }
}