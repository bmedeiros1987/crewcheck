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
const watchContext = read('client/src/lib/watchContext.ts');

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

console.log("Selective watch producer/sanitizer contract: PASS; Device Hub/CrewLife excluded");
