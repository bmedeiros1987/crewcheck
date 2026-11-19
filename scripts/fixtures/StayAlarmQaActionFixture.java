package com.crewcheck.app;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.net.Uri;

/** Verifies action binding with Android API classes in JVM, without an Android process. */
public final class StayAlarmQaActionFixture {
    static int checks;

    private static void check(boolean value, String detail) {
        checks++;
        if (!value) throw new AssertionError(detail);
    }

    private static Context packageOnly(String packageName) {
        return new ContextWrapper(null) {
            @Override public String getPackageName() { return packageName; }
        };
    }

    private static Intent intent(String action, Uri data) {
        return new Intent(action).setData(data);
    }

    public static void main(String[] args) {
        String snooze = StayAlarmQaAlerts.SNOOZE, dismiss = StayAlarmQaAlerts.DISMISS;
        String key = "stay-hotel-apz:synthetic-a:fixture-event";
        long revision = 5L, scheduledAt = 2_000_000_000_000L;
        Uri original = StayAlarmQaAlerts.controlUri(snooze, key, revision, scheduledAt);
        check(StayAlarmQaAlerts.matchesControl(snooze, original, key, revision, scheduledAt), "complete action binding");
        check(!StayAlarmQaAlerts.matchesControl(dismiss, original, key, revision, scheduledAt), "cannot exchange actions");
        check(!StayAlarmQaAlerts.matchesControl(snooze, original, key + "-other", revision, scheduledAt), "cannot exchange occurrence");
        check(!StayAlarmQaAlerts.matchesControl(snooze, original, key, revision + 1, scheduledAt), "cannot exchange revision");
        check(!StayAlarmQaAlerts.matchesControl(snooze, original, key, revision, scheduledAt + 1), "cannot exchange instant");
        check(!StayAlarmQaAlerts.matchesControl(snooze, null, key, revision, scheduledAt), "missing identity fails closed");
        check(!StayAlarmQaAlerts.matchesControl(snooze, original, null, revision, scheduledAt), "missing key fails closed");
        check(!StayAlarmQaAlerts.matchesControl("awake", original, key, revision, scheduledAt), "awake is not a QA action");
        Intent prior = intent(snooze, original);
        check(!prior.filterEquals(intent(snooze, StayAlarmQaAlerts.controlUri(snooze, key, revision + 1, scheduledAt))),
            "new revision receives a distinct PendingIntent identity");
        check(!prior.filterEquals(intent(snooze, StayAlarmQaAlerts.controlUri(snooze, key, revision, scheduledAt + 1))),
            "new instant receives a distinct PendingIntent identity");
        check(!prior.filterEquals(intent(dismiss, StayAlarmQaAlerts.controlUri(dismiss, key, revision, scheduledAt))),
            "other action receives a distinct PendingIntent identity");
        check(!StayAlarmQaAlerts.enabled(packageOnly("com.crewcheck.app")), "release package has no QA actions");
        check(!StayAlarmQaAlerts.enabled(packageOnly("com.crewcheck.app.mcctest")), "standard debug package has no QA actions");
        check(!StayAlarmQaAlerts.enabled(packageOnly("com.crewcheck.app.stayaccept")),
            "acceptance package must contain the exact QA run and attempt");
        check(!StayAlarmQaAlerts.enabled(null), "no fixture context means no controls");
        System.out.println("PASS " + checks + " QA action identity checks; JVM only, no Android notification or playback");
    }
}
