import com.crewcheck.app.NotificationTiming;

public class NotificationTimingFixture {
    static void check(boolean value) { if (!value) throw new AssertionError("Native timing boundary"); }
    public static void main(String[] args) {
        long now = 1_000_000L;
        check(NotificationTiming.shouldAttempt(now, now, true));
        check(NotificationTiming.shouldAttempt(now - 120_000L, now, true));
        check(!NotificationTiming.shouldAttempt(now - 120_001L, now, true));
        check(!NotificationTiming.shouldAttempt(now + 1L, now, true));
        check(!NotificationTiming.shouldAttempt(now, now, false));
        check(!NotificationTiming.shouldAttempt(0L, now, true));
        check(!NotificationTiming.shouldAttempt(now, now + 86_400_000L, true));
        System.out.println("Native receiver timing: future, denied, unknown and expired/reboot-late alarms rejected; no device APIs used.");
    }
}
