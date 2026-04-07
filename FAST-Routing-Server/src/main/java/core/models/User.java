package core.models;

public class User {
    private String id;
    private String username;
    private String password;   // plain text (student project)
    private String role;       // "driver" | "dispatcher" | "manager"
    private String ambulanceId; // null unless role=driver
    private String displayName;

    public User() {}
    public User(String id, String username, String password,
                String role, String ambulanceId, String displayName) {
        this.id = id; this.username = username; this.password = password;
        this.role = role; this.ambulanceId = ambulanceId; this.displayName = displayName;
    }
    public String getId()           { return id; }
    public void   setId(String v)   { id = v; }
    public String getUsername()     { return username; }
    public String getPassword()     { return password; }
    public String getRole()         { return role; }
    public String getAmbulanceId()  { return ambulanceId; }
    public String getDisplayName()  { return displayName; }
    public void setUsername(String v)    { username = v; }
    public void setPassword(String v)    { password = v; }
    public void setRole(String v)        { role = v; }
    public void setAmbulanceId(String v) { ambulanceId = v; }
    public void setDisplayName(String v) { displayName = v; }
}
