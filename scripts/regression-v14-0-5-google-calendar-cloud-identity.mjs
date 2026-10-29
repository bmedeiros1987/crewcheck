import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');

const read = (file) => fs.readFileSync(file, 'utf8');
const metadata = JSON.parse(read('package.json'));
const android = read('android-wrapper/app/build.gradle');
const calendar = read('client/src/lib/googleCalendarSync.ts');
const bridge = read('client/src/lib/googleCalendarOAuthBridge.ts');
const serverBridge = read('server/v1405/google-calendar-oauth.mjs');
const server = read('server.mjs');
const render = read('render.yaml');

assert.equal(metadata.version, '14.0.5');
assert.match(android, /versionCode 140005\b/);
assert.match(android, /versionName '14\.0\.5'/);

assert.match(calendar, /googleCalendarOAuthBridge/);
assert.match(calendar, /calendar\.events\.owned/);
assert.match(calendar, /calendar\.calendarlist\.readonly/);
assert.doesNotMatch(calendar, /https:\/\/www\.googleapis\.com\/auth\/calendar(?:\.events|\.calendarlist)?['"\s]/);
assert.match(calendar, /include_granted_scopes: false/);
assert.match(calendar, /error_callback:/);
assert.match(calendar, /isEmbeddedCrewCheckWebView/);
assert.match(calendar, /connectGoogleCalendarViaServer/);
assert.match(calendar, /serverGoogleCalendarFetch/);
assert.match(calendar, /localStorage\.removeItem\(CLIENT_ID_OVERRIDE_KEY\)/);
assert.match(calendar, /const calendarId = normalizeGoogleCalendarId\(settings\.selectedCalendarId\) \|\| 'primary'/);
assert.match(calendar, /\/users\/me\/calendarList\?minAccessRole=owner/);
assert.match(calendar, /origin_mismatch/);
assert.match(calendar, /disallowed_useragent/);

assert.match(bridge, /CrewCheckNative/);
assert.match(bridge, /openExternal/);
assert.match(bridge, /\/api\/google-calendar\/oauth\/start/);
assert.match(bridge, /\/api\/google-calendar\/oauth\/status/);
assert.match(bridge, /\/api\/google-calendar\/oauth\/proxy/);
assert.match(bridge, /GOOGLE_OAUTH_POPUP_BLOCKED/);

assert.match(serverBridge, /code_challenge_method: 'S256'/);
assert.match(serverBridge, /access_type: 'offline'/);
assert.match(serverBridge, /refresh_token/);
assert.match(serverBridge, /aes-256-gcm/);
assert.match(serverBridge, /crewcheck_google_oauth_store/);
assert.match(serverBridge, /export function validateGoogleCalendarProxyRequest/);
assert.match(serverBridge, /payload\?\.accessRole === 'owner'/);
assert.match(serverBridge, /GOOGLE_PATH_BLOCKED/);
assert.match(serverBridge, /calendar\.events\.owned/);
assert.match(serverBridge, /calendar\.calendarlist\.readonly/);
assert.doesNotMatch(serverBridge, /https:\/\/www\.googleapis\.com\/auth\/calendar['"\s]/);

assert.match(server, /handleGoogleCalendarOAuthRoute/);
assert.match(server, /googleCalendarOAuthReliability/);
assert.match(server, /cc1371Verify\(cc1371RequestToken\(req\)\)/);
assert.match(render, /VITE_GOOGLE_CLIENT_ID/);
assert.match(render, /GOOGLE_OAUTH_WEB_CLIENT_ID/);
assert.match(render, /GOOGLE_OAUTH_WEB_CLIENT_SECRET/);
assert.match(render, /GOOGLE_OAUTH_REDIRECT_URI/);
assert.match(render, /https:\/\/crewcheck\.online\/api\/google-calendar\/oauth\/callback/);
assert.match(render, /CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY/);

console.log('CrewCheck v14.0.5 Google Calendar Cloud Identity, external browser OAuth, encrypted token and owned-calendar proxy OK.');
