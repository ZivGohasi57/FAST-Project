package core.models;

import java.util.List;

public class RouteResponse {
    private double totalDistanceMeters;
    private long estimatedTimeSeconds;
    private List<Coordinate> path;
    private List<StepInstruction> instructions;

    public RouteResponse(double totalDistanceMeters, long estimatedTimeSeconds,
                         List<Coordinate> path, List<StepInstruction> instructions) {
        this.totalDistanceMeters = totalDistanceMeters;
        this.estimatedTimeSeconds = estimatedTimeSeconds;
        this.path = path;
        this.instructions = instructions;
    }

    public double getTotalDistanceMeters()    { return totalDistanceMeters; }
    public void   setTotalDistanceMeters(double v) { this.totalDistanceMeters = v; }

    public long   getEstimatedTimeSeconds()   { return estimatedTimeSeconds; }
    public void   setEstimatedTimeSeconds(long v) { this.estimatedTimeSeconds = v; }

    public List<Coordinate>      getPath()         { return path; }
    public void                  setPath(List<Coordinate> p) { this.path = p; }

    public List<StepInstruction> getInstructions() { return instructions; }
    public void                  setInstructions(List<StepInstruction> i) { this.instructions = i; }
}
