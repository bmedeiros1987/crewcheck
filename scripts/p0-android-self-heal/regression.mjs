import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
const source = fs.readFileSync(path, 'utf8');

for (const required of [
  'CREWCHECK_SHELL_WATCHDOG_DELAY_MS',
  'CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS',
  'CREWCHECK_FAST_REVEAL_DELAY_MS',
  'CREWCHECK_PROGRESS_DELAY_MS',
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
  'private android.widget.ProgressBar crewCheckBootProgress;',
  'R.drawable.crewcheck_logo_neon',
  'android.R.attr.progressBarStyleHorizontal',
  'progress.setVisibility(View.INVISIBLE)',
  'CREWCHECK_PROGRESS_DELAY_MS',
  'Color.parseColor("#00010E")',
]) {
  assert.ok(source.includes(required), `self-heal contract missing: ${required}`);
}

for (const forbiddenVisualCopy of [
  '"Entrando no CrewCheck"',
  '"Sincronizando sua escala e preparando sua experiência."',
  '"Carregamento seguro · isso leva só alguns segundos"',
  'brandName.setText("CrewCheck")',
]) {
  assert.ok(!source.includes(forbiddenVisualCopy),
    `boot visual must be logo-only before delayed progress: ${forbiddenVisualCopy}`);
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

const showStart = source.indexOf('private void showCrewCheckBootStatus(final String message)');
const showEnd = source.indexOf('\n    private void hideCrewCheckBootStatus', showStart);
assert.ok(showStart >= 0 && showEnd > showStart, 'boot overlay boundaries missing');
const bootOverlay = source.slice(showStart, showEnd);
assert.match(bootOverlay, /crewCheckBootProgress\.setVisibility\(View\.INVISIBLE\)/);
assert.match(bootOverlay, /postDelayed\(\(\) -> \{/);
assert.match(bootOverlay, /crewCheckBootProgress\.setVisibility\(View\.VISIBLE\)/);
assert.ok(
  bootOverlay.indexOf('View.INVISIBLE') < bootOverlay.indexOf('View.VISIBLE'),
  'progress must start hidden and appear only after the delay',
);

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

console.log('[p0-android-self-heal] PASS — logo-only splash, delayed progress and non-destructive blank-screen recovery preserved.');
