package com.crewcheck.app;

/** Pure timing boundary used by the actual broadcast receiver. */
public final class NotificationTiming {
    private NotificationTiming() {}
    public static boolean shouldAttempt(long scheduledAt, long now, boolean permission) {
        return permission && scheduledAt > 0 && now >= scheduledAt && now - scheduledAt <= 120_000L;
    }
}
