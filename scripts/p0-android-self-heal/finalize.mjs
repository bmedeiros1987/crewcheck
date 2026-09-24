import fs from 'node:fs';

const file = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
if (!fs.existsSync(file)) throw new Error(`[p0-android-self-heal:finalize] arquivo ausente: ${file}`);
let source = fs.readFileSync(file, 'utf8');

const errorMarker = '            @Override\n            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {';
const clientCloseMarker = '        });\n        webView.setWebChromeClient';

if (!source.includes('recoverCrewCheckShell(view, "main-frame-error")')
    || !source.includes('public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse)')) {
  const start = source.indexOf(errorMarker);
  const end = source.indexOf(clientCloseMarker, start);
  if (start < 0 || end < 0) {
    throw new Error('[p0-android-self-heal:finalize] WebViewClient/onReceivedError canônico não localizado.');
  }

  const replacement = `            @Override\n            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {\n                super.onReceivedError(view, request, error);\n                if (request != null && request.isForMainFrame()) {\n                    recoverCrewCheckShell(view, "main-frame-error");\n                }\n            }\n\n            @Override\n            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {\n                super.onReceivedHttpError(view, request, errorResponse);\n                if (request != null && request.isForMainFrame() && errorResponse != null\n                        && errorResponse.getStatusCode() >= 500) {\n                    recoverCrewCheckShell(view, "http-" + errorResponse.getStatusCode());\n                }\n            }\n`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

for (const required of [
  'CREWCHECK_SHELL_WATCHDOG_DELAY_MS',
  'scheduleCrewCheckShellWatchdog(view, generation)',
  'private void recoverCrewCheckShell(final WebView target, final String reason)',
  'recoverCrewCheckShell(view, "main-frame-error")',
  'public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse)',
]) {
  if (!source.includes(required)) throw new Error(`[p0-android-self-heal:finalize] contrato ausente: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-android-self-heal:finalize] hooks finais de erro/HTTP reafirmados após android-play/layout.');

// Phone-only post-finalizer: after every native/store transform has settled, attach
// the non-disruptive Google Play availability bridge without touching roster state.
await import('../mobile-play-update/apply.mjs');