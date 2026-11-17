package com.crewcheck.health;

import org.json.JSONObject;
import java.time.*;

/** Local v1 projection: query freshness and metric validity are separate. No SDK/network. */
public final class CompanionFreshness {
    private static final long SIX_HOURS = 6 * 60 * 60 * 1000L;
    private static final String[] METRICS = {"energyScore", "sleepMinutes", "sleepScore", "steps",
            "activeMinutes", "caloriesBurned", "distanceMeters"};
    private CompanionFreshness() {}

    public static JSONObject filter(JSONObject source, long now) throws Exception {
        JSONObject out = new JSONObject(source.toString());
        JSONObject validity = new JSONObject();
        long generated = source.optLong("generatedAtEpochMs", 0);
        long transportEnd = generated > 0 && generated <= now && generated <= Long.MAX_VALUE - SIX_HOURS
                ? generated + SIX_HOURS : 0;
        long earliest = transportEnd;
        boolean any = false;
        for (String key : METRICS) {
            long expiry = 0;
            String reason = "no_data";
            Object value = source.opt(key);
            if (value instanceof Number && Double.isFinite(((Number)value).doubleValue())
                    && ((Number)value).doubleValue() >= 0) {
                reason = "sample_time_unknown";
                if (key.equals("energyScore")) {
                    if (((Number)value).doubleValue() <= 100)
                        expiry = dateEnd(source.optString("energyDate"), source.optString("energyZoneId"), now);
                } else if (key.startsWith("sleep")) {
                    long end = absolute(source.optString("sleepEndInstant"));
                    if (end > 0 && end <= now && end <= Long.MAX_VALUE - 24 * 60 * 60 * 1000L)
                        expiry = end + 24 * 60 * 60 * 1000L;
                } else {
                    expiry = dateEnd(source.optString("day"), source.optString("sourceZoneId"), now);
                }
                expiry = Math.min(expiry, transportEnd);
                if (expiry > now) { any = true; earliest = Math.min(earliest, expiry); reason = "valid"; }
                else { reason = expiry > 0 ? "stale" : reason; expiry = 0; }
            }
            if (expiry == 0) out.put(key, JSONObject.NULL);
            JSONObject metric = new JSONObject();
            metric.put("state", reason);
            metric.put("validUntilEpochMs", expiry);
            validity.put(key, metric);
        }
        if (out.isNull("sleepMinutes")) {
            out.put("sleepStart", JSONObject.NULL);
            out.put("sleepEnd", JSONObject.NULL);
        }
        out.put("metricValidity", validity);
        out.put("validUntilEpochMs", any ? earliest : 0);
        return out;
    }

    // A date-only measurement has calendar-day precision. Source timezone is mandatory;
    // do not reinterpret a legacy date using the phone's current timezone after travel.
    private static long dateEnd(String date, String zone, long now) {
        try {
            ZoneId id = ZoneId.of(zone);
            LocalDate day = LocalDate.parse(date);
            if (!day.equals(Instant.ofEpochMilli(now).atZone(id).toLocalDate())) return 0;
            return day.plusDays(1).atStartOfDay(id).toInstant().toEpochMilli();
        } catch (Exception invalid) { return 0; }
    }
    private static long absolute(String value) {
        try { return Instant.parse(value).toEpochMilli(); }
        catch (Exception invalid) {
            try { return OffsetDateTime.parse(value).toInstant().toEpochMilli(); }
            catch (Exception missingOffset) { return 0; }
        }
    }
}
