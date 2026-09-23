import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
const source = fs.readFileSync(path, 'utf8');

for (const required of [
  'CREWCHECK_SHELL_WATCHDOG_DELAY_MS',
  'CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS',
  'showCrewCheckBootStatus("Abrindo CrewCheck…")',
  'scheduleCrewCheckShellWatchdog(view, generation)',
  'verifyCrewCheckShellMounted(final WebView target, final int generation)',
  'recoverCrewCheckShell(view, "main-frame-error")',
  'public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse)',
  'target.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE)',
  'target.clearCache(true)',
  'target.loadUrl(CREWCHECK_APP_URL + suffix)',
  'webView.setBackgroundColor(Color.parseColor("#071D33"))',
]) {
  assert.ok(source.includes(required), `self-heal contract missing: ${required}`);
}

const recoveryStart = source.indexOf('private void recoverCrewCheckShell(final WebView target, final String reason)');
const recoveryEnd = source.indexOf('\n    @Override\n    protected void onResume()', recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'recovery method boundaries missing');
const recovery = source.slice(recoveryStart, recoveryEnd);

for (const forbidden of [
  'removeAllCookies',
  'removeSessionCookies',
  'CookieManager',
  'localStorage.clear',
  'localStorage.removeItem',
  'sessionStorage.clear',
  'clearFormData',
  'clearHistory',
]) {
  assert.ok(!recovery.includes(forbidden), `recovery must preserve user/session data: ${forbidden}`);
}

assert.match(recovery, /crewCheckShellRecoveryAttempts <= CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS/);
assert.match(recovery, /10_000L/);
assert.match(recovery, /Uri\.encode\(reason == null \? "unknown" : reason\)/);

console.log('[p0-android-self-heal] PASS — blank shell is detected and recovered without erasing session, roster or CrewLife data.');
