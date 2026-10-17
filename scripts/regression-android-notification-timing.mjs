import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Characterize the actual receiver policy with a fixed synthetic clock. This
// does not schedule an OS alarm, grant permission or display a notification.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-notification-timing-'));
try {
  const source = 'android-wrapper/app/src/main/java/com/crewcheck/app/NotificationTiming.java';
  const receiver = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckNotificationReceiver.java', 'utf8');
  const activity = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'utf8');
  assert.match(receiver, /NotificationTiming\.shouldAttempt\(intent\.getLongExtra\("scheduledAt", 0L\), System\.currentTimeMillis\(\), true\)/);
  assert.match(activity, /alarm\.setAndAllowWhileIdle\(android\.app\.AlarmManager\.RTC_WAKEUP, when, pendingIntent\)/);
  const harness = path.join(temp, 'TimingAudit.java');
  fs.writeFileSync(harness, `import com.crewcheck.app.NotificationTiming;
public class TimingAudit {
  static int cases = 0;
  static void check(long scheduled, long now, boolean permission, boolean expected) {
    boolean actual = NotificationTiming.shouldAttempt(scheduled, now, permission);
    if (actual != expected) throw new AssertionError("scheduled=" + scheduled + " now=" + now);
    cases++;
  }
  public static void main(String[] args) {
    long at = 1800000000000L;
    check(at, at - 1, true, false);
    check(at, at, true, true);
    check(at, at + 1, true, true);
    check(at, at + 119999, true, true);
    check(at, at + 120000, true, true);
    check(at, at + 120001, true, false);
    check(at, at + 600000, true, false);
    check(at, at + 3600000, true, false);
    check(at, at, false, false);
    check(at, at + 120000, false, false);
    check(0, at, true, false);
    check(-1, at, true, false);
    System.out.println("PASS actual Java NotificationTiming: " + cases + " fixed-clock cases; 120000ms inclusive, 120001ms/10min/1h discarded; no OS alarm or send");
  }
}`);
  const run = args => {
    const result = spawnSync('java', args, { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  // The installed Java runtime can contain jdk.compiler even without a javac
  // executable. Use its real compiler module; do not substitute a JS port.
  run(['com.sun.tools.javac.Main', '-d', temp, source, harness]);
  process.stdout.write(run(['-cp', temp, 'TimingAudit']));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
