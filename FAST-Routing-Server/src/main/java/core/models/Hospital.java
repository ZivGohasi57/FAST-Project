package core.models;

public class Hospital {
    private String id;
    private String name;
    private double lat;
    private double lon;

    public Hospital() {}
    public Hospital(String id, String name, double lat, double lon) {
        this.id = id; this.name = name; this.lat = lat; this.lon = lon;
    }

    public String getId()           { return id; }
    public void   setId(String v)   { id = v; }
    public String getName()         { return name; }
    public void   setName(String v) { name = v; }
    public double getLat()          { return lat; }
    public void   setLat(double v)  { lat = v; }
    public double getLon()          { return lon; }
    public void   setLon(double v)  { lon = v; }
}
