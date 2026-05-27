package core.models;

public class DriverUser extends User {
    private String ambulanceNumber;

    public DriverUser() { super(); }

    public DriverUser(String id, String username, String password,
                      String ambulanceId, String displayName, String ambulanceNumber) {
        super(id, username, password, "driver", ambulanceId, displayName);
        this.ambulanceNumber = ambulanceNumber;
    }

    public String getAmbulanceNumber()          { return ambulanceNumber; }
    public void   setAmbulanceNumber(String v)  { ambulanceNumber = v; }
}
