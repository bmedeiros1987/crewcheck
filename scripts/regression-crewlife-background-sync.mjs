import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Execute the real service with deterministic transport doubles. Android lifecycle,
// IPC and radio delivery still require Gradle/device validation; this is not an E2E test.
const root = 'android-wrapper/app/src/main/java/com/crewcheck/app/';
const dir = mkdtempSync(join(tmpdir(), 'crewlife-background-'));
const files = [];
function source(path, content) {
  const file = join(dir, path);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, content);
  files.push(file);
}
try {
  source('android/content/Intent.java', `package android.content; public class Intent {
    public Intent(String action) {} public Intent setPackage(String name) { return this; }
  }`);
  source('com/google/android/gms/wearable/MessageEvent.java', `package com.google.android.gms.wearable;
    public interface MessageEvent { String getPath(); String getSourceNodeId(); byte[] getData(); }`);
  source('com/google/android/gms/wearable/WearableListenerService.java', `package com.google.android.gms.wearable;
    public class WearableListenerService {
      public static int broadcasts; public void onMessageReceived(MessageEvent event) {}
      public String getPackageName() { return "com.crewcheck.app"; }
      public void sendBroadcast(android.content.Intent intent) { broadcasts++; }
    }`);
  source('com/crewcheck/app/Doubles.java', `package com.crewcheck.app;
    final class MainActivity { static final String ACTION_WATCH_SYNC_REQUEST="request"; }
    final class CrewCheckWatchPublisher {
      static final String REQUEST_SYNC_PATH="/crewcheck/watch/request-sync/v1";
      static int calls; static void republishLast(Object context) { calls++; }
    }
    final class CrewCheckWatchDeviceTelemetry {
      static final String STATUS_RESPONSE_PATH="/crewcheck/watch/device-status/response/v1";
      static int calls; static void saveStatus(Object c,String node,byte[] data) { calls++; }
    }
    final class CrewLifeCompanionBackgroundSync {
      static int calls; static void republishCurrent(Object context) { calls++; }
    }`);
  source('com/crewcheck/app/CrewCheckWatchSyncService.java', readFileSync(root + 'CrewCheckWatchSyncService.java', 'utf8'));
  source('com/crewcheck/app/ServiceContract.java', `package com.crewcheck.app;
    import com.google.android.gms.wearable.*;
    public final class ServiceContract {
      static MessageEvent event(String path) { return new MessageEvent() {
        public String getPath(){return path;} public String getSourceNodeId(){return "test-node";}
        public byte[] getData(){return new byte[0];}
      };}
      static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);}
      public static void main(String[] args) {
        CrewCheckWatchSyncService service=new CrewCheckWatchSyncService();
        service.onMessageReceived(event("/irrelevant"));
        check(CrewLifeCompanionBackgroundSync.calls==0,"Unrelated message must not read health");
        service.onMessageReceived(event(CrewCheckWatchDeviceTelemetry.STATUS_RESPONSE_PATH));
        check(CrewCheckWatchDeviceTelemetry.calls==1,"Telemetry route preserved");
        check(CrewLifeCompanionBackgroundSync.calls==0,"Telemetry must not read health");
        service.onMessageReceived(event(CrewCheckWatchPublisher.REQUEST_SYNC_PATH));
        check(CrewCheckWatchPublisher.calls==1,"Roster resend preserved");
        check(WearableListenerService.broadcasts==1,"Foreground notification preserved");
        check(CrewLifeCompanionBackgroundSync.calls==1,
          "CrewLife request has no background resend when Activity is absent");
        System.out.println("Service contract: PASS (no Activity instance)");
      }
    }`);
  execFileSync('javac', ['--release', '17', '-d', join(dir, 'classes'), ...files], { stdio: 'inherit' });
  execFileSync('java', ['-cp', join(dir, 'classes'), 'com.crewcheck.app.ServiceContract'], { stdio: 'inherit' });
  if (process.argv.includes('--service-only')) process.exitCode = 0;
  else {
    const engine = root + 'CrewLifeBackgroundSync.java';
    const test = 'scripts/fixtures/CrewLifeBackgroundSyncContract.java';
    assert.ok(existsSync(engine), 'Missing tested background engine');
    assert.ok(existsSync(test), 'Missing behavioral test');
    execFileSync('javac', ['--release', '17', '-d', join(dir, 'engine'), engine, test], { stdio: 'inherit' });
    execFileSync('java', ['-cp', join(dir, 'engine'), 'com.crewcheck.app.CrewLifeBackgroundSyncContract'], { stdio: 'inherit' });
    const adapter = readFileSync(root + 'CrewLifeCompanionBackgroundSync.java', 'utf8');
    assert.match(adapter, /WatchHealthConsent\.isRevocationPending/);
    assert.match(adapter, /CrewLifeWatchPublisher\.publishCrewLife/);
    assert.match(adapter, /content:\/\/com\.crewcheck\.life\.summary\/v1\/current/);
    assert.match(adapter, /CancellationSignal/);
    assert.doesNotMatch(adapter, /com\.samsung\.android\.sdk|android\.permission\.health\.|startActivity|\.putString\(|\.insert\(|\.delete\(|\.update\(/);
    console.log('CrewLife background sync: all contracts PASS');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
