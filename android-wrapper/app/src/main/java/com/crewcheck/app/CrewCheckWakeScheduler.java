package com.crewcheck.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

public final class CrewCheckWakeScheduler {
    private static final String PREFS = "crewcheck_wake_alarms";
    private static final String PREFIX = "alarm:";

    private CrewCheckWakeScheduler() {}

    public static boolean canScheduleExact(Context context) {
        try {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (manager == null) return false;
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static boolean schedule(Context context, String wakeKey, long when, String label) {
        if (context == null || wakeKey == null || wakeKey.trim().isEmpty()) return false;
        if (when <= System.currentTimeMillis() + 1000L) return false;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null || !canScheduleExact(context)) return false;

        String key = wakeKey.trim();
        Intent wakeIntent = new Intent(context, CrewCheckWakeAlarmActivity.class);
        wakeIntent.setAction("com.crewcheck.app.WAKE_ALARM");
        wakeIntent.putExtra("wakeKey", key);
        wakeIntent.putExtra("label", label == null ? "CrewCheck" : label);
        wakeIntent.putExtra("when", when);

        int requestCode = requestCode(key);
        PendingIntent operation = PendingIntent.getActivity(
                context,
                requestCode,
                wakeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent showIntent = new Intent(context, MainActivity.class);
        showIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent showOperation = PendingIntent.getActivity(
                context,
                requestCode + 200_000,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(when, showOperation), operation);
            persist(context, key, when, label == null ? "CrewCheck" : label);
            return true;
        } catch (SecurityException denied) {
            return false;
        }
    }

    public static void cancel(Context context, String wakeKey) {
        if (context == null || wakeKey == null || wakeKey.trim().isEmpty()) return;
        try {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, CrewCheckWakeAlarmActivity.class);
            intent.setAction("com.crewcheck.app.WAKE_ALARM");
            PendingIntent pending = PendingIntent.getActivity(
                    context,
                    requestCode(wakeKey.trim()),
                    intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (manager != null && pending != null) {
                manager.cancel(pending);
                pending.cancel();
            }
        } catch (Exception ignored) {}
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREFIX + wakeKey.trim()).apply();
    }

    public static void acknowledge(Context context, String wakeKey) {
        if (context == null || wakeKey == null || wakeKey.trim().isEmpty()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREFIX + wakeKey.trim()).apply();
    }

    public static void rescheduleAll(Context context) {
        if (context == null || !canScheduleExact(context)) return;
        Map<String, ?> all = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll();
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> entry : all.entrySet()) {
            if (!entry.getKey().startsWith(PREFIX) || !(entry.getValue() instanceof String)) continue;
            String wakeKey = entry.getKey().substring(PREFIX.length());
            Parsed parsed = parse((String) entry.getValue());
            if (parsed == null || parsed.when <= now + 1000L) {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(entry.getKey()).apply();
                continue;
            }
            schedule(context, wakeKey, parsed.when, parsed.label);
        }
    }

    private static void persist(Context context, String wakeKey, long when, String label) {
        String encoded;
        try {
            encoded = Base64.getEncoder().encodeToString(label.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            encoded = "";
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PREFIX + wakeKey, when + "|" + encoded)
                .apply();
    }

    private static Parsed parse(String raw) {
        try {
            String[] parts = String.valueOf(raw).split("\\|", 2);
            long when = Long.parseLong(parts[0]);
            String label = "CrewCheck";
            if (parts.length > 1 && !parts[1].isEmpty()) {
                label = new String(Base64.getDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            }
            return new Parsed(when, label);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static int requestCode(String key) {
        return 10_000 + Math.abs(key.hashCode() % 180_000);
    }

    private static final class Parsed {
        final long when;
        final String label;
        Parsed(long when, String label) {
            this.when = when;
            this.label = label;
        }
    }
}
