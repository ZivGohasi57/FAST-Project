package core.models;

/**
 * One navigation step returned in the route response.
 *
 * sign             — GraphHopper turn sign (0=straight, 2=right, -2=left, 4=arrive, 6=roundabout …)
 * streetName       — name of the road AFTER the maneuver
 * distanceMeters   — distance the driver must travel BEFORE executing this maneuver
 * contraflow       — true when the segment leading up to this step goes against the normal
 *                    car direction (ambulance emergency contraflow only)
 * exitNumber       — for USE_ROUNDABOUT (sign=6): which exit to take (1, 2, 3 …); 0 otherwise
 */
public class StepInstruction {
    private int     sign;
    private String  streetName;
    private double  distanceMeters;
    private boolean contraflow;
    private int     exitNumber;   // roundabout exit; 0 = not a roundabout step

    public StepInstruction(int sign, String streetName, double distanceMeters,
                           boolean contraflow, int exitNumber) {
        this.sign           = sign;
        this.streetName     = streetName;
        this.distanceMeters = distanceMeters;
        this.contraflow     = contraflow;
        this.exitNumber     = exitNumber;
    }

    public int     getSign()            { return sign; }
    public String  getStreetName()      { return streetName; }
    public double  getDistanceMeters()  { return distanceMeters; }
    public boolean isContraflow()       { return contraflow; }
    public int     getExitNumber()      { return exitNumber; }
}
