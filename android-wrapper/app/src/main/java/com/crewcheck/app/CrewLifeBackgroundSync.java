package com.crewcheck.app;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Pure coordination/projection for a background resend, not a health-data collector. */
final class CrewLifeBackgroundSync {
    static final long MAX_AGE_MS = 6L * 60 * 60 * 1000;
    enum Outcome { SUBMITTED, CONSENT_REQUIRED, NO_SUMMARY, STALE, INVALID, PROVIDER_BLOCKED, ERROR }

    interface Port {
        /** Empty unless the existing mirror grant is active and no revocation is pending. */
        String authorization();
        Set<String> categories();
        long nowEpochMs();
        Map<String, ?> readSummary() throws Exception;
        /** Submission is NOT an acknowledgement that a watch received the DataItem. */
        void submit(Map<String, Object> summary) throws Exception;
    }

    private CrewLifeBackgroundSync() {}

    static Outcome run(Port port) {
        try {
            String grant = port.authorization();
            if (grant == null || grant.isBlank()) return Outcome.CONSENT_REQUIRED;
            Set<String> categories = Set.copyOf(port.categories());
            if (!categories.contains("recovery") && !categories.contains("sleep")
                    && !categories.contains("activity")) return Outcome.CONSENT_REQUIRED;

            Map<String, ?> source = port.readSummary();
            if (source == null || source.isEmpty()) return Outcome.NO_SUMMARY;
            if (!Boolean.TRUE.equals(source.get("automatic"))) return Outcome.INVALID;
            if (source.containsKey("schemaVersion") && integer(source.get("schemaVersion")) != 1L) {
                return Outcome.INVALID;
            }
            long generated = integer(source.get("generatedAtEpochMs"));
            long now = port.nowEpochMs();
            if (generated <= 0 || generated > now) return Outcome.INVALID;
            long until = Math.addExact(generated, MAX_AGE_MS);
            if (source.containsKey("validUntilEpochMs")) {
                long declared = integer(source.get("validUntilEpochMs"));
                if (declared < generated) return Outcome.INVALID;
                until = Math.min(until, declared);
            }
            if (until <= now) return Outcome.STALE;

            Map<String, Object> out = new LinkedHashMap<>();
            if (categories.contains("recovery") && copy(source, out, "energyScore", "recoveryScore", 100)) {
                out.put("scoreKind", "ENERGY");
                out.put("recoveryLabel", "DESCONHECIDA");
            }
            if (categories.contains("sleep")) copy(source, out, "sleepMinutes", "sleepMinutes", 1440);
            if (categories.contains("activity")) {
                copy(source, out, "steps", "steps", 200_000);
                String activity = source.containsKey("activeMinutes") ? "activeMinutes" : "activityMinutes";
                if (source.containsKey("activeMinutes") && source.containsKey("activityMinutes")
                        && integer(source.get("activeMinutes")) != integer(source.get("activityMinutes"))) {
                    return Outcome.INVALID;
                }
                copy(source, out, activity, "activeMinutes", 1440);
            }
            if (out.isEmpty()) return Outcome.NO_SUMMARY;
            out.put("schemaVersion", 1);
            out.put("generatedAtEpochMs", generated);
            out.put("validUntilEpochMs", until);

            // A revoke/regrant or category change during IPC invalidates this attempt.
            if (!grant.equals(port.authorization())) return Outcome.CONSENT_REQUIRED;
            if (until <= port.nowEpochMs()) return Outcome.STALE;
            port.submit(out);
            return Outcome.SUBMITTED;
        } catch (SecurityException denied) {
            return Outcome.PROVIDER_BLOCKED;
        } catch (IllegalArgumentException | ArithmeticException malformed) {
            return Outcome.INVALID;
        } catch (Exception unavailable) {
            return Outcome.ERROR;
        }
    }

    private static boolean copy(Map<String, ?> source, Map<String, Object> out,
                                String from, String to, int max) {
        if (!source.containsKey(from) || source.get(from) == null) return false;
        long value = integer(source.get(from));
        if (value < 0 || value > max) throw new IllegalArgumentException("Invalid aggregate");
        out.put(to, (int) value);
        return true;
    }

    private static long integer(Object value) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("Numeric value required");
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || Math.abs(number) > 9_007_199_254_740_991d
                || number != Math.rint(number)) throw new IllegalArgumentException("Invalid integer");
        return ((Number) value).longValue();
    }
}
