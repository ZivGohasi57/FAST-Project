package core.models;

/**
 * One navigation step returned in the route response.
 *
 * sign             — GraphHopper turn sign (0=straight, 2=right, -2=left, 4=arrive, 6=roundabout …)
 * streetName       — name of the road AFTER the maneuver
 * distanceMeters   — distance the driver must travel BEFORE executing this maneuver
 * contraflow       — true when the segment leading up to this step goes against the normal
 *                    car direction (ambulance emergency contraflow only)
 */
public class StepInstruction {
    private int    sign;
    private String streetName;
    private double distanceMeters;
    private boolean contraflow;

    public StepInstruction(int sign, String streetName, double distanceMeters, boolean contraflow) {
        this.sign           = sign;
        this.streetName     = streetName;
        this.distanceMeters = distanceMeters;
        this.contraflow     = contraflow;
    }

    public int     getSign()            { return sign; }
    public String  getStreetName()      { return streetName; }
    public double  getDistanceMeters()  { return distanceMeters; }
    public boolean isContraflow()       { return contraflow; }
}
