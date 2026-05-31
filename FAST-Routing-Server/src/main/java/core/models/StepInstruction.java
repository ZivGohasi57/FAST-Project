package core.models;

public class StepInstruction {
    private int     sign;
    private String  streetName;
    private double  distanceMeters;
    private boolean contraflow;
    private int     exitNumber;

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
