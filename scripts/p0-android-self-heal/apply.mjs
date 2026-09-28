import fs from 'node:fs';

const file = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
if (!fs.existsSync(file)) throw new Error(`[p0-android-self-heal] arquivo ausente: ${file}`);

let source = fs.readFileSync(file, 'utf8');

function replaceOnce(anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`[p0-android-self-heal] âncora ausente: ${label}`);
  source = source.replace(anchor, replacement);
}

if (!source.includes('CREWCHECK_SHELL_WATCHDOG_DELAY_MS')) {
  replaceOnce(
    '    private static final int MAX_PDF_BYTES = 35 * 1024 * 1024;\n',
    '    private static final int MAX_PDF_BYTES = 35 * 1024 * 1024;\n' +
      '    private static final String CREWCHECK_APP_URL = "https://crewcheck.online?app=1";\n' +
      '    private static final long CREWCHECK_SHELL_WATCHDOG_DELAY_MS = 3200L;\n' +
      '    private static final int CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS = 3;\n',
    'constantes do watchdog',
  );
}

if (!source.includes('private TextView crewCheckBootStatusText;')) {
  replaceOnce(
    '    private BroadcastReceiver watchSyncRequestReceiver;\n',
    '    private BroadcastReceiver watchSyncRequestReceiver;\n' +
      '    private TextView crewCheckBootStatusText;\n' +
      '    private int crewCheckShellRecoveryAttempts = 0;\n' +
      '    private int crewCheckPageGeneration = 0;\n',
    'campos do watchdog',
  );
}

if (source.includes('        webView.setBackgroundColor(Color.WHITE);')) {
  replaceOnce(
    '        webView.setBackgroundColor(Color.WHITE);',
    '        webView.setBackgroundColor(Color.parseColor("#071D33"));',
    'fundo branco da WebView',
  );
}

if (!source.includes('showCrewCheckBootStatus("Abrindo CrewCheck…");')) {
  replaceOnce(
    '        rootLayout.addView(webView);\n',
    '        rootLayout.addView(webView);\n        showCrewCheckBootStatus("Abrindo CrewCheck…");\n',
    'montagem da WebView',
  );
}

if (!source.includes('scheduleCrewCheckShellWatchdog(view, generation);')) {
  replaceOnce(
    '                syncLifeCompanionToCrewCheckAndWatch("page-finished");\n                view.postDelayed(() -> requestCrewCheckWatchSnapshotFromWeb("page-finished"), 700);',
    '                syncLifeCompanionToCrewCheckAndWatch("page-finished");\n' +
      '                final int generation = ++crewCheckPageGeneration;\n' +
      '                scheduleCrewCheckShellWatchdog(view, generation);\n' +
      '                view.postDelayed(() -> requestCrewCheckWatchSnapshotFromWeb("page-finished"), 700);',
    'onPageFinished',
  );
}

if (source.includes('                        view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);\n                        view.loadUrl("https://crewcheck.online?app=1");')) {
  replaceOnce(
    '                    try {\n                        view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);\n                        view.loadUrl("https://crewcheck.online?app=1");\n                    } catch (Exception ignored) {}',
    '                    recoverCrewCheckShell(view, "main-frame-error");',
    'onReceivedError',
  );
}

if (!source.includes('public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse)')) {
  const receivedErrorEnd = `            @Override\n            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {\n                super.onReceivedError(view, request, error);\n                if (request != null && request.isForMainFrame()) {\n                    recoverCrewCheckShell(view, "main-frame-error");\n                }\n            }\n`;
  replaceOnce(
    receivedErrorEnd,
    receivedErrorEnd +
      `\n            @Override\n            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {\n                super.onReceivedHttpError(view, request, errorResponse);\n                if (request != null && request.isForMainFrame() && errorResponse != null\n                        && errorResponse.getStatusCode() >= 500) {\n                    recoverCrewCheckShell(view, "http-" + errorResponse.getStatusCode());\n                }\n            }\n`,
    'onReceivedHttpError',
  );
}

if (!source.includes('private void verifyCrewCheckShellMounted(final WebView target, final int generation)')) {
  const methods = `\n    private void showCrewCheckBootStatus(final String message) {\n        runOnUiThread(() -> {\n            try {\n                if (rootLayout == null) return;\n                if (crewCheckBootStatusText == null) {\n                    TextView status = new TextView(MainActivity.this);\n                    status.setTextColor(Color.WHITE);\n                    status.setTextSize(15f);\n                    status.setGravity(Gravity.CENTER);\n                    status.setPadding(dp(28), dp(28), dp(28), dp(28));\n                    status.setBackgroundColor(Color.parseColor("#071D33"));\n                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(\n                            FrameLayout.LayoutParams.MATCH_PARENT,\n                            FrameLayout.LayoutParams.MATCH_PARENT\n                    );\n                    rootLayout.addView(status, params);\n                    crewCheckBootStatusText = status;\n                }\n                crewCheckBootStatusText.setText(message == null ? "Abrindo CrewCheck…" : message);\n                crewCheckBootStatusText.setVisibility(View.VISIBLE);\n                crewCheckBootStatusText.bringToFront();\n            } catch (Exception ignored) {}\n        });\n    }\n\n    private void hideCrewCheckBootStatus() {\n        runOnUiThread(() -> {\n            try {\n                if (crewCheckBootStatusText != null) crewCheckBootStatusText.setVisibility(View.GONE);\n            } catch (Exception ignored) {}\n        });\n    }\n\n    private void scheduleCrewCheckShellWatchdog(final WebView target, final int generation) {\n        if (target == null) return;\n        target.postDelayed(\n                () -> verifyCrewCheckShellMounted(target, generation),\n                CREWCHECK_SHELL_WATCHDOG_DELAY_MS\n        );\n    }\n\n    private void verifyCrewCheckShellMounted(final WebView target, final int generation) {\n        if (target == null || target != webView || generation != crewCheckPageGeneration) return;\n        final String probe = "(function(){try{" +\n                "var root=document.getElementById('root');" +\n                "var text=((document.body&&document.body.innerText)||'').trim();" +\n                "return !!(root&&root.children&&root.children.length>0&&text.length>8);" +\n                "}catch(e){return false;}})();";\n        try {\n            target.evaluateJavascript(probe, value -> {\n                if (target != webView || generation != crewCheckPageGeneration) return;\n                boolean mounted = "true".equalsIgnoreCase(String.valueOf(value));\n                if (mounted) {\n                    crewCheckShellRecoveryAttempts = 0;\n                    try { target.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT); } catch (Exception ignored) {}\n                    hideCrewCheckBootStatus();\n                    return;\n                }\n                recoverCrewCheckShell(target, "shell-not-mounted");\n            });\n        } catch (Exception error) {\n            recoverCrewCheckShell(target, "shell-probe-failed");\n        }\n    }\n\n    private void recoverCrewCheckShell(final WebView target, final String reason) {\n        if (target == null || target != webView) return;\n        runOnUiThread(() -> {\n            try {\n                crewCheckShellRecoveryAttempts += 1;\n                showCrewCheckBootStatus(\n                        crewCheckShellRecoveryAttempts <= CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS\n                                ? "Recuperando o CrewCheck…"\n                                : "Reconectando ao CrewCheck…"\n                );\n\n                // Limpa somente cache de navegação/WebView. Cookies, localStorage,\n                // sessão, escala e o resumo local do CrewLife permanecem intactos.\n                try { target.stopLoading(); } catch (Exception ignored) {}\n                try { target.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE); } catch (Exception ignored) {}\n                try { target.clearCache(true); } catch (Exception ignored) {}\n\n                long delay = crewCheckShellRecoveryAttempts <= CREWCHECK_MAX_FAST_RECOVERY_ATTEMPTS\n                        ? 500L\n                        : 10_000L;\n                target.postDelayed(() -> {\n                    try {\n                        String suffix = "&recovery=" + crewCheckShellRecoveryAttempts\n                                + "&reason=" + Uri.encode(reason == null ? "unknown" : reason)\n                                + "&t=" + System.currentTimeMillis();\n                        target.loadUrl(CREWCHECK_APP_URL + suffix);\n                    } catch (Exception ignored) {}\n                }, delay);\n            } catch (Exception ignored) {}\n        });\n    }\n`;

  const anchor = '    @Override\n    protected void onResume() {';
  replaceOnce(anchor, methods + '\n' + anchor, 'onResume');
}

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-android-self-heal] watchdog de shell + recuperação sem apagar sessão/dados aplicado.');
