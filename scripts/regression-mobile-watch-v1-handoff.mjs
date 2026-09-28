import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Forbidden ${label}: ${needle}`);
  }
}

const publisher = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java');
const telemetry = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchDeviceTelemetry.java');
const syncService = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchSyncService.java');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const watchContext = read('client/src/lib/watchContext.ts');
const contract = read('docs/mobile_watch_snapshot_v1_contract.md');

requireText(publisher, 'strictOptionalBoolean(source, "premiumAccess", false)', 'strict fail-closed premium default');
requireText(publisher, 'strictRequiredJsonInteger(source, "schemaVersion")', 'schemaVersion strict JSON integer');
requireText(publisher, 'strictRequiredJsonInteger(source, "generatedAtEpochMs")', 'generatedAt strict JSON integer');
requireText(publisher, 'strictRequiredJsonInteger(source, "validUntilEpochMs")', 'validUntil strict JSON integer');
requireText(publisher, 'cleanItem.put("kind", normalizeScheduleKind(item));', 'schedule kind canonical downgrade');
requireText(publisher, 'strictOptionalBoolean(source, "remoteStand", false)', 'remoteStand strict boolean default');
requireText(publisher, 'strictOptionalBoolean(source, "changed", false)', 'changed strict boolean default');
forbidText(publisher, 'source.optInt("schemaVersion", 0)', 'coercive schemaVersion parsing');
forbidText(publisher, 'source.optLong("generatedAtEpochMs", 0L)', 'coercive generatedAt parsing');
forbidText(publisher, 'source.optLong("validUntilEpochMs", 0L)', 'coercive validUntil parsing');
forbidText(publisher, 'source.optBoolean("premiumAccess", false)', 'coercive premium boolean parsing');
requireText(publisher, 'if (premiumAccess) {', 'premium projection gate');
requireText(publisher, 'copySchedule(source, out, premiumAccess)', 'schedule premium boundary');
requireText(publisher, 'out.put("changed", false)', 'downgrade changed reset');
requireText(publisher, 'out.put("source", "canonical-roster")', 'canonical source marker');
requireText(publisher, '"token", "accessToken", "refreshToken", "authorization"', 'sensitive-field rejection');

requireText(watchContext, 'premiumAccess: boolean;', 'watchSnapshot v1 additive entitlement field');
requireText(watchContext, 'premiumAccess = storedWatchPremiumAccess()', 'mobile entitlement producer default');
requireText(watchContext, 'return Boolean(getStoredUser()?.premiumAccess);', 'stored entitlement source');

requireText(telemetry, 'STATUS_REQUEST_PATH = "/crewcheck/watch/device-status/request/v1"', 'telemetry request v1');
requireText(telemetry, 'STATUS_RESPONSE_PATH = "/crewcheck/watch/device-status/response/v1"', 'telemetry response v1');
requireText(telemetry, 'REQUEST_WINDOW_MS = 5_000L', 'bounded nonce window');
requireText(telemetry, 'boolean legacyResponse = responseRequestId.isEmpty();', 'old-peer telemetry compatibility');
requireText(telemetry, 'if (!legacyResponse && !verifiedRoundTrip) return;', 'mismatched nonce rejection');
requireText(telemetry, 'private static String exactRequestId(JSONObject source)', 'exact opaque nonce parser');
requireText(telemetry, 'value.codePointCount(0, value.length()) > 64', 'nonce Unicode code point bound');
requireText(telemetry, 'value.getBytes(StandardCharsets.UTF_8).length > 256', 'nonce UTF-8 byte bound');
requireText(telemetry, 'Character.isISOControl', 'nonce control-character rejection');
requireText(telemetry, 'json.optBoolean("round", false)', 'phone cache round=false default');
requireText(telemetry, 'source.optBoolean("round", false)', 'peer response round=false default');
forbidText(telemetry, 'clean(source.optString("requestId", ""), 64)', 'requestId normalization before correlation');
forbidText(telemetry, 'clean(prefs.getString(KEY_PENDING_REQUEST_ID, ""), 64)', 'pending nonce normalization before correlation');

requireText(syncService, 'CrewCheckWatchDeviceTelemetry.STATUS_RESPONSE_PATH.equals(path)', 'phone telemetry routing');
requireText(syncService, 'CrewCheckWatchPublisher.republishLast(this)', 'cached snapshot fast path');
requireText(manifest, 'android:name=".CrewCheckDeviceHubActivity"', 'Device Hub activity');
requireText(manifest, 'android:pathPrefix="/crewcheck/watch/device-status/response/"', 'telemetry manifest filter');

requireText(contract, 'missing `premiumAccess` means `false`', 'old-phone/new-peer compatibility documentation');
requireText(contract, 'JSON integer values, never numeric strings or fractional numbers', 'strict required numeric type documentation');
requireText(contract, 'Only the JSON boolean `true` enables Premium', 'strict optional boolean documentation');
requireText(contract, 'invalid or missing `schedule[].kind` becomes `duty`', 'schedule kind downgrade documentation');
requireText(contract, 'Republish therefore **never turns stale data into fresh data**', 'stale/offline documentation');
requireText(contract, 'durable Android/PWA shared-PDF handoff from #797 or its successor', 'PDF durability merge gate');
requireText(contract, 'without trim, normalization or rewriting', 'exact nonce documentation');
requireText(contract, '`round` defaults to `false`', 'device-status round default documentation');

console.log('mobile watch v1 handoff regression: PASS');