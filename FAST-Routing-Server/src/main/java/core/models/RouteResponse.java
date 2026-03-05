package core.models;

import java.util.List;

public class RouteResponse {
    private double totalDistanceMeters;
    private long estimatedTimeSeconds;
    private List<Coordinate> path;

    public RouteResponse(double totalDistanceMeters, long estimatedTimeSeconds, List<Coordinate> path) {
        this.totalDistanceMeters = totalDistanceMeters;
        this.estimatedTimeSeconds = estimatedTimeSeconds;
        this.path = path;
    }

    public double getTotalDistanceMeters() { return totalDistanceMeters; }
    public void setTotalDistanceMeters(double totalDistanceMeters) { this.totalDistanceMeters = totalDistanceMeters; }

    public long getEstimatedTimeSeconds() { return estimatedTimeSeconds; }
    public void setEstimatedTimeSeconds(long estimatedTimeSeconds) { this.estimatedTimeSeconds = estimatedTimeSeconds; }

    public List<Coordinate> getPath() { return path; }
    public void setPath(List<Coordinate> path) { this.path = path; }
}