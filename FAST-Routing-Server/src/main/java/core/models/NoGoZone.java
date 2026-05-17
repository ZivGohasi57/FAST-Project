package core.models;

public class NoGoZone {
    private String id;
    private String name;
    private double minLat;
    private double maxLat;
    private double minLon;
    private double maxLon;

    public NoGoZone() {}

    public boolean contains(double lat, double lon) {
        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    }

    public String getId()             { return id; }
    public void   setId(String v)     { id = v; }
    public String getName()           { return name; }
    public void   setName(String v)   { name = v; }
    public double getMinLat()         { return minLat; }
    public void   setMinLat(double v) { minLat = v; }
    public double getMaxLat()         { return maxLat; }
    public void   setMaxLat(double v) { maxLat = v; }
    public double getMinLon()         { return minLon; }
    public void   setMinLon(double v) { minLon = v; }
    public double getMaxLon()         { return maxLon; }
    public void   setMaxLon(double v) { maxLon = v; }
}
