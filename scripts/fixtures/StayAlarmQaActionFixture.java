package com.crewcheck.app;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.net.Uri;
import java.time.Instant;
import org.json.JSONObject;

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

    private static void rejectLegacyRecord(String record, String description) throws Exception {
        try {
            StayAlarmQaBoot.decode(record);
        } catch (IllegalArgumentException | org.json.JSONException rejected) {
            check(true, description);
            return;
        }
        throw new AssertionError(description);
    }

    private static void bootRoutingAndStorage() throws Exception {
        check(StayAlarmReceiver.bootRecoveryAction(Intent.ACTION_LOCKED_BOOT_COMPLETED, true), "QA recovers while locked");
        check(!StayAlarmReceiver.bootRecoveryAction(Intent.ACTION_BOOT_COMPLETED, true),
            "unlock at the due instant cannot cancel an already queued QA delivery");
        check(StayAlarmReceiver.bootRecoveryAction(Intent.ACTION_BOOT_COMPLETED, false), "normal receiver is unchanged");
        check(!StayAlarmReceiver.bootRecoveryAction(Intent.ACTION_LOCKED_BOOT_COMPLETED, false), "normal receiver cannot recover early");

        String owner = StayAlarmPhysicalFixture.ACCOUNT_A, event = StayAlarmPhysicalFixture.EVENT;
        String key = StayAlarmEngine.identity(owner, event);
        String generation = "7943e4b3-695d-4b9d-81c1-47ab57572f41";
        String operation = "1afe2b30-11ac-4a76-b29a-6d04242709af";
        long due = 2_000_000_000_000L;
        StayAlarmEngine.Record expected = new StayAlarmEngine.Record(key, owner, generation, event, operation,
            2, Instant.ofEpochMilli(due).toString(), due, due + 180_000, "absolute", "scheduled");
        String raw = StayAlarmQaBoot.encode(expected).toString();
        check(!raw.contains(owner) && !raw.contains(event) && !raw.contains("alarmAt") && !raw.contains("apz"),
            "device-protected record contains a synthetic slot and timing bounds only");
        check(expected.same(StayAlarmQaBoot.decode(raw)), "round-trip preserves occurrence and due time");
        StayAlarmEngine.Record tombstone = new StayAlarmEngine.Record(key, owner, generation, event,
            "local-alert:2:DISMISS", 3, "", 0, 0, "relative", "cancelled");
        check(tombstone.same(StayAlarmQaBoot.decode(StayAlarmQaBoot.encode(tombstone).toString())), "cancellation survives storage");
        rejectLegacyRecord(new JSONObject(raw).put("v", 1).toString(), "never imports an older journal record");
        rejectLegacyRecord(new JSONObject(raw).put("owner", owner).toString(), "records with a raw owner are rejected");
        rejectLegacyRecord(new JSONObject(raw).put("slot", 3).toString(), "only synthetic slots are permitted");
    }

    public static void main(String[] args) throws Exception {
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
        bootRoutingAndStorage();
        System.out.println("PASS " + checks + " QA action identity checks; JVM only, no Android notification or playback");
    }
}
