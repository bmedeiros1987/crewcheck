import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const output = mkdtempSync(path.join(os.tmpdir(), 'crewcheck-stay-native-'));
const sources = ['android-wrapper/app/src/main/java/com/crewcheck/app/NotificationTiming.java',
 'android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmEngine.java', 'scripts/fixtures/StayAlarmEngineFixture.java'];
try {
 if (process.env.STAY_ECJ_JAR) execFileSync('java', ['-jar', process.env.STAY_ECJ_JAR, '-17', '-d', output, ...sources], { stdio: 'inherit' });
 else execFileSync('javac', ['-d', output, ...sources], { stdio: 'inherit' });
 execFileSync('java', ['-cp', output, 'StayAlarmEngineFixture'], { stdio: 'inherit', timeout: 30000 });
} finally { rmSync(output, { recursive: true, force: true }); }
