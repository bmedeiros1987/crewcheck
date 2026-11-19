package com.crewcheck.app;

import android.content.Context;
import android.os.UserManager;
import java.time.Instant;
import java.util.UUID;
import org.json.JSONObject;

/** Device-protected records for the isolated, native-only alarm test. */
final class StayAlarmQaBoot {
    static final String JOURNAL = "crewcheck_stay_qa_boot_journal_v2";
    static final String AUTHORITY = "crewcheck_stay_qa_boot_authority_v2";

    private StayAlarmQaBoot() {}

    static boolean unlocked(Context context) {
        UserManager manager = context.getSystemService(UserManager.class);
        return manager != null && manager.isUserUnlocked();
    }

    static int slot(String owner) {
        if (StayAlarmPhysicalFixture.ACCOUNT_A.equals(owner)) return 1;
        if (StayAlarmPhysicalFixture.ACCOUNT_B.equals(owner)) return 2;
        throw new IllegalArgumentException("Unknown fixture slot");
    }

    static String slotOwner(long slot) {
        if (slot == 1) return StayAlarmPhysicalFixture.ACCOUNT_A;
        if (slot == 2) return StayAlarmPhysicalFixture.ACCOUNT_B;
        throw new IllegalArgumentException("Unknown fixture slot");
    }

    static String epoch(String value) {
        if (value == null || !UUID.fromString(value).toString().equals(value))
            throw new IllegalArgumentException("Invalid fixture generation");
        return value;
    }

    private static String operation(String value) {
        if (value != null && value.matches("local-alert:[0-9]{1,19}:(SNOOZE|DISMISS)(:next)?")) return value;
        return epoch(value);
    }

    static JSONObject encode(StayAlarmEngine.Record record) throws Exception {
        if (!StayAlarmPhysicalFixture.EVENT.equals(record.event)
            || !StayAlarmEngine.identity(record.owner, record.event).equals(record.key))
            throw new IllegalArgumentException("Outside the synthetic fixture");
        return new JSONObject()
            .put("v", 2).put("slot", slot(record.owner)).put("generation", epoch(record.ownerEpoch))
            .put("operation", operation(record.operation)).put("revision", record.revision)
            .put("due", record.alarm).put("validUntil", record.apz).put("state", record.state);
    }

    static StayAlarmEngine.Record decode(String raw) throws Exception {
        JSONObject record = new JSONObject(raw);
        if (record.length() != 8 || StayAlarmAndroid.integer(record, "v") != 2)
            throw new IllegalArgumentException("Invalid Direct Boot schema");
        String owner = slotOwner(StayAlarmAndroid.integer(record, "slot"));
        String event = StayAlarmPhysicalFixture.EVENT;
        String state = record.getString("state");
        long due = StayAlarmAndroid.integer(record, "due");
        long validUntil = StayAlarmAndroid.integer(record, "validUntil");
        long revision = StayAlarmAndroid.integer(record, "revision");
        boolean cancellation = "pending-cancel".equals(state) || "cancelled".equals(state);
        if (revision <= 0 || (cancellation ? due != 0 || validUntil != 0 : due <= 0 || validUntil <= due))
            throw new IllegalArgumentException("Invalid Direct Boot record");
        if (!cancellation && !"pending-schedule".equals(state) && !"pending-snooze".equals(state)
            && !"scheduled".equals(state) && !"attempted".equals(state) && !"delivery-unknown".equals(state)
            && !"expired".equals(state) && !"blocked".equals(state))
            throw new IllegalArgumentException("Invalid Direct Boot state");
        return new StayAlarmEngine.Record(StayAlarmEngine.identity(owner, event), owner,
            epoch(record.getString("generation")), event, operation(record.getString("operation")), revision,
            cancellation ? "" : Instant.ofEpochMilli(due).toString(), due, validUntil,
            cancellation ? "relative" : "absolute", state);
    }
}
