package core.models;

public class AmbulanceInfo {
    private String id;
    private String driverId;
    private String driverName;
    private double lat;
    private double lon;
    private String status;          // "available" | "busy" | "offline"
    private String  ambulanceNumber;
    private boolean locationLocked;
    private String  activeCaseId;

    public AmbulanceInfo() {}
    public AmbulanceInfo(String id, String driverId, String driverName,
                          double lat, double lon, String status) {
        this.id = id; this.driverId = driverId; this.driverName = driverName;
        this.lat = lat; this.lon = lon; this.status = status;
    }




    
    public String  getId()                        { return id; }
    public String  getDriverId()                  { return driverId; }
    public String  getDriverName()                { return driverName; }
    public double  getLat()                       { return lat; }
    public void    setLat(double v)               { lat = v; }
    public double  getLon()                       { return lon; }
    public void    setLon(double v)               { lon = v; }
    public String  getStatus()                    { return status; }
    public void    setStatus(String v)            { status = v; }
    public void    setId(String v)                { id = v; }
    public void    setDriverId(String v)          { driverId = v; }
    public void    setDriverName(String v)        { driverName = v; }
    public String  getAmbulanceNumber()           { return ambulanceNumber; }
    public void    setAmbulanceNumber(String v)   { ambulanceNumber = v; }
    public boolean isLocationLocked()             { return locationLocked; }
    public void    setLocationLocked(boolean v)   { locationLocked = v; }
    public String  getActiveCaseId()              { return activeCaseId; }
    public void    setActiveCaseId(String v)      { activeCaseId = v; }
}
