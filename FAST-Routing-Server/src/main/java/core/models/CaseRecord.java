package core.models;

public class CaseRecord {
    private String id;
    private String address;
    private double lat;
    private double lon;
    private String description;
    private String patientDetails;
    private String urgency;           // "routine" | "emergency"
    private String notes;
    private String assignedAmbulanceId;
    private String assignedDriverName;
    private String status;            // "pending" | "active" | "completed"
    private long   createdAt;

    public CaseRecord() {}
    // full getters/setters for all fields
    public String getId()                       { return id; }
    public void   setId(String v)               { id = v; }
    public String getAddress()                  { return address; }
    public void   setAddress(String v)          { address = v; }
    public double getLat()                      { return lat; }
    public void   setLat(double v)              { lat = v; }
    public double getLon()                      { return lon; }
    public void   setLon(double v)              { lon = v; }
    public String getDescription()              { return description; }
    public void   setDescription(String v)      { description = v; }
    public String getPatientDetails()           { return patientDetails; }
    public void   setPatientDetails(String v)   { patientDetails = v; }
    public String getUrgency()                  { return urgency; }
    public void   setUrgency(String v)          { urgency = v; }
    public String getNotes()                    { return notes; }
    public void   setNotes(String v)            { notes = v; }
    public String getAssignedAmbulanceId()      { return assignedAmbulanceId; }
    public void   setAssignedAmbulanceId(String v) { assignedAmbulanceId = v; }
    public String getAssignedDriverName()       { return assignedDriverName; }
    public void   setAssignedDriverName(String v)  { assignedDriverName = v; }
    public String getStatus()                   { return status; }
    public void   setStatus(String v)           { status = v; }
    public long   getCreatedAt()                { return createdAt; }
    public void   setCreatedAt(long v)          { createdAt = v; }
}
