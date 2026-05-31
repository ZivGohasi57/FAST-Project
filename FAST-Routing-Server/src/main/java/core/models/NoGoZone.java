package core.models;

import java.time.*;

public class NoGoZone {
    private String id;
    private String name;
    private String type = "permanent";
    private double minLat, maxLat, minLon, maxLon;

    private String dailyStart;
    private String dailyEnd;

    private long onceStart;
    private long onceEnd;

    public NoGoZone() {}

    public boolean contains(double lat, double lon) {
        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    }

    public boolean isCurrentlyActive() {
        if (type == null || "permanent".equals(type)) return true;

        if ("daily".equals(type)) {
            if (dailyStart == null || dailyEnd == null) return true;
            try {
                LocalTime now   = LocalTime.now(ZoneId.of("Asia/Jerusalem"));
                LocalTime start = LocalTime.parse(dailyStart);
                LocalTime end   = LocalTime.parse(dailyEnd);
                return start.isBefore(end)
                    ? (!now.isBefore(start) && !now.isAfter(end))
                    : (!now.isBefore(start) || !now.isAfter(end));
            } catch (Exception e) { return true; }
        }

        if ("once".equals(type)) {
            long now = System.currentTimeMillis();
            return now >= onceStart && now <= onceEnd;
        }

        return true;
    }

    public String getId()               { return id; }
    public void   setId(String v)       { id = v; }
    public String getName()             { return name; }
    public void   setName(String v)     { name = v; }
    public String getType()             { return type; }
    public void   setType(String v)     { type = v != null ? v : "permanent"; }
    public double getMinLat()           { return minLat; }
    public void   setMinLat(double v)   { minLat = v; }
    public double getMaxLat()           { return maxLat; }
    public void   setMaxLat(double v)   { maxLat = v; }
    public double getMinLon()           { return minLon; }
    public void   setMinLon(double v)   { minLon = v; }
    public double getMaxLon()           { return maxLon; }
    public void   setMaxLon(double v)   { maxLon = v; }
    public String getDailyStart()       { return dailyStart; }
    public void   setDailyStart(String v)  { dailyStart = v; }
    public String getDailyEnd()         { return dailyEnd; }
    public void   setDailyEnd(String v)    { dailyEnd = v; }
    public long   getOnceStart()        { return onceStart; }
    public void   setOnceStart(long v)  { onceStart = v; }
    public long   getOnceEnd()          { return onceEnd; }
    public void   setOnceEnd(long v)    { onceEnd = v; }
}
