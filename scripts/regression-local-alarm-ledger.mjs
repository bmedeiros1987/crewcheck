// Compiles and runs the production LocalAlarmLedger against fake storage/OS (no Android SDK).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const output = mkdtempSync(path.join(os.tmpdir(), 'crewcheck-local-alarm-'));
const app = 'android-wrapper/app/src/main/java/com/crewcheck/app/';
const sources = [`${app}NotificationTiming.java`, `${app}NotificationIdentity.java`, `${app}NotificationLedger.java`, `${app}LocalAlarmLedger.java`, 'scripts/fixtures/LocalAlarmLedgerFixture.java'];
try {
  execFileSync('javac', ['-d', output, ...sources], { stdio: 'inherit' });
  execFileSync('java', ['-cp', output, 'LocalAlarmLedgerFixture'], { stdio: 'inherit', timeout: 30000 });
} finally { rmSync(output, { recursive: true, force: true }); }
