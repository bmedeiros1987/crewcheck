import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
const source = fs.readFileSync(path, 'utf8');

for (const required of [
  'CREWCHECK_SHELL_WATCHDOG_DELAY_MS',
  'CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS',
  'CREWCHECK_FAST_REVEAL_DELAY_MS',
  'showCrewCheckBootStatus("Abrindo CrewCheck…")',
  'scheduleCrewCheckShellWatchdog(view, generation)',
  'probeCrewCheckShellAndHideIfMounted(final WebView target, final int generation)',
  'verifyCrewCheckShellMounted(final WebView target, final int generation)',
  'recoverCrewCheckShell(view, "main-frame-error")',
  'public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse)',
  'target.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE)',
  'target.clearCache(true)',
  'target.loadUrl(CREWCHECK_APP_URL + suffix)',
  'webView.setBackgroundColor(Color.parseColor("#071D33"))',
  'private LinearLayout crewCheckBootOverlay;',
  'private TextView crewCheckBootDetailText;',
  'new android.widget.ImageView(MainActivity.this)',
  'R.drawable.crewcheck_icon_site',
  'new android.widget.ProgressBar(MainActivity.this)',
  '"Entrando no CrewCheck"',
  '"Sincronizando sua escala e preparando sua experiência."',
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

const fastProbeStart = source.indexOf('private void probeCrewCheckShellAndHideIfMounted(final WebView target, final int generation)');
const fastProbeEnd = source.indexOf('\n    private void verifyCrewCheckShellMounted', fastProbeStart);
assert.ok(fastProbeStart >= 0 && fastProbeEnd > fastProbeStart, 'fast reveal probe boundaries missing');
const fastProbe = source.slice(fastProbeStart, fastProbeEnd);
assert.match(fastProbe, /hideCrewCheckBootStatus\(\)/);
assert.doesNotMatch(fastProbe, /recoverCrewCheckShell/, 'fast reveal probe must never trigger recovery before the watchdog deadline');

assert.match(source, /target\.postDelayed\(\(\) -> probeCrewCheckShellAndHideIfMounted\(target, generation\), CREWCHECK_FAST_REVEAL_DELAY_MS\)/);
assert.match(recovery, /crewCheckShellRecoveryAttempts <= CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS/);
assert.match(recovery, /10_000L/);
assert.match(recovery, /Uri\.encode\(reason == null \? "unknown" : reason\)/);

console.log('[p0-android-self-heal] PASS — premium fast boot reveals mounted shell early and preserves non-destructive recovery.');
