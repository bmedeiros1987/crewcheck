import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, pattern, message) => {
  if (!(pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern))) throw new Error(message);
};

const gradle = read('android-wrapper/wear/build.gradle');
const activity = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const dataLayer = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
const telemetry = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchDeviceTelemetry.java');
const telemetryTest = read('android-wrapper/wear/src/test/java/com/crewcheck/watch/WatchDeviceTelemetryTest.java');
const watchface = read('android-wrapper/watchface/src/main/res/raw/watchface.xml');
const matrix = read('docs/crewwatch_galaxy_compatibility.md');
const protocol = read('docs/peripherals/device_status_v1.md');

requireText(gradle, /minSdk\s+30\b/, 'CrewWatch must keep API 30 baseline for Galaxy Watch4+');
requireText(activity, 'isRoundScreen()', 'Wear UI must branch on round geometry');
requireText(activity, 'applySafePadding()', 'Wear UI must enforce circular safe padding');
requireText(activity, 'InputDevice.SOURCE_ROTARY_ENCODER', 'Wear UI must support rotary/bezel');
requireText(activity, 'HapticFeedbackConstants.CLOCK_TICK', 'Wear UI must use restrained haptics');
requireText(activity, 'AmbientModeSupport', 'Wear UI must support AOD/ambient');
requireText(activity, /isStale\s*\(/, 'Wear UI must surface stale state');
requireText(activity, /OFFLINE|Offline|offline/, 'Wear UI must surface offline state');
requireText(watchface, /WatchFace|watch/i, 'Watch Face Format resource must remain present');

requireText(telemetry, '/crewcheck/watch/device-status/request/v1', 'Wear status request path missing');
requireText(telemetry, '/crewcheck/watch/device-status/response/v1', 'Wear status response path missing');
requireText(telemetry, 'MAX_STATUS_BYTES = 4 * 1024', 'Status payload must remain bounded');
requireText(telemetry, 'MAX_REQUEST_BYTES = MAX_REQUEST_ID_CHARS * 4', 'Status request payload must remain bounded');
requireText(telemetry, 'parseRequestId', 'Wear must validate the diagnostic nonce before echoing it');
requireText(telemetry, 'CodingErrorAction.REPORT', 'malformed UTF-8 must fail closed instead of being normalized');
requireText(telemetry, /Character\.isISOControl/, 'control characters must not enter correlation ids');
requireText(telemetry, 'BATTERY_PROPERTY_CAPACITY', 'Wear must report battery when available');
requireText(telemetry, 'snapshotGeneratedAtEpochMs', 'Wear must report snapshot freshness metadata');
requireText(dataLayer, 'WatchDeviceTelemetry.STATUS_REQUEST_PATH', 'Wear Data Layer must answer status pings');
requireText(dataLayer, 'messageEvent.getData()', 'Wear must pass request nonce to telemetry responder');
requireText(dataLayer, 'WatchEntitlements.premiumFromSnapshot', 'stacked Galaxy candidate must retain parent stale-entitlement hardening');
requireText(telemetryTest, 'validOpaqueNonceIsEchoedExactly', 'exact nonce echo regression test missing');
requireText(telemetryTest, 'whitespaceInsideNonceIsNotRewritten', 'nonce normalization regression test missing');
requireText(telemetryTest, 'unicodeLimitCountsCodePointsNotUtf16Units', 'Unicode code-point limit regression test missing');
requireText(telemetryTest, 'malformedUtf8FallsBackToLegacyUnverified', 'malformed UTF-8 regression test missing');
requireText(telemetryTest, 'invalidOrOversizedNonceFallsBackToLegacyUnverified', 'invalid nonce fallback regression test missing');

for (const family of ['Galaxy Watch4','Galaxy Watch5','Galaxy Watch6','Galaxy Watch7','Galaxy Watch8','Galaxy Watch9','Watch Ultra2']) {
  requireText(matrix, family, `compatibility matrix missing ${family}`);
}
requireText(matrix, 'Free ↔ Premium', 'matrix must cover entitlement transitions');
requireText(matrix, 'foreground/background/process-dead', 'matrix must cover phone lifecycle');
requireText(matrix, 'handoff para Mobile Core', 'matrix must hand phone implementation to Mobile Core');
requireText(matrix, 'Galaxy Watch físico', 'physical release gate must remain explicit');

requireText(protocol, 'request path: `/crewcheck/watch/device-status/request/v1`', 'portable request path docs missing');
requireText(protocol, 'response path: `/crewcheck/watch/device-status/response/v1`', 'portable response path docs missing');
requireText(protocol, 'UTF-8 estrito', 'strict UTF-8 request semantics must be documented');
requireText(protocol, '64 Unicode code points e 256 bytes', 'portable nonce bounds must be documented');
requireText(protocol, 'sem trim, normalização ou reescrita', 'nonce echo must be documented as exact');
requireText(protocol, 'caractere de controle', 'invalid nonce fallback must be documented');
requireText(protocol, '5 segundos', 'correlation timeout must be documented');
requireText(protocol, 'legacy/unverified', 'old peer behavior must be documented');
requireText(protocol, 'não conclui nem substitui o teste ativo', 'mismatched nonce behavior must be documented');
requireText(protocol, 'não pode transformar retroativamente um timeout em sucesso', 'late response behavior must be documented');
requireText(protocol, 'Handoff para Mobile Core', 'phone implementation handoff must be explicit');
requireText(protocol, 'não deve cherry-pick nem reintroduzir', 'ownership no-reintroduction rule must be explicit');

console.log('[CrewWatch Galaxy] PASS — Galaxy round/AOD behavior, stacked parent safety and peripheral-only device-status v1 responder contract are guarded.');
