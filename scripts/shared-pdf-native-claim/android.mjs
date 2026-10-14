import fs from 'node:fs';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
if (!fs.existsSync(path)) throw new Error(`[p0-shared-pdf:android] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`[p0-shared-pdf:android] âncora ausente: ${label}`);
  source = source.replace(before, after);
}

if (!source.includes('private String pendingSharedPdfId;')) {
  replaceOnce(
    '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;',
    '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;\n    private String pendingSharedPdfId;',
    'pendingSharedPdfId',
  );
}

if (!source.includes('restorePendingSharedPdfFromInbox();')) {
  replaceOnce(
    '        registerWatchSyncRequestReceiver();\n',
    '        registerWatchSyncRequestReceiver();\n        restorePendingSharedPdfFromInbox();\n',
    'restore inbox on cold start',
  );
}

if (!source.includes('intent.getClipData().getItemAt(0).getUri()')) {
  replaceOnce(
    '                if (stream instanceof Uri) uri = (Uri) stream;\n            } else if (Intent.ACTION_VIEW.equals(action)) {',
    '                if (stream instanceof Uri) uri = (Uri) stream;\n                if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {\n                    uri = intent.getClipData().getItemAt(0).getUri();\n                }\n            } else if (Intent.ACTION_VIEW.equals(action)) {',
    'ACTION_SEND ClipData fallback',
  );
}

if (!source.includes('SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES')) {
  const pattern = /    private void readIncomingPdfUri\(Uri uri\) throws Exception \{[\s\S]*?\n    \}\n\n    private void returnPdfBase64FromPortal/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:android] readIncomingPdfUri não localizado');
  source = source.replace(pattern, `    private void readIncomingPdfUri(Uri uri) throws Exception {
        readIncomingPdfUri(uri, sharedPdfReceiptOwner);
    }

    private void readIncomingPdfUri(Uri uri, String initialOwner) throws Exception {
        SharedPdfInbox.PendingPdf pending = SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES, initialOwner);
        pendingSharedPdfId = pending.id;
        pendingSharedPdfName = pending.fileName;
        pendingSharedPdfBase64 = null;
        Toast.makeText(this, "PDF recebido. Processando a escala automaticamente...", Toast.LENGTH_LONG).show();
        dispatchPendingSharedPdf();
    }

    private void restorePendingSharedPdfFromInbox() {
        try {
            SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(this);
            if (pending == null) {
                pendingSharedPdfId = null;
                pendingSharedPdfName = null;
                pendingSharedPdfBase64 = null;
                return;
            }
            pendingSharedPdfId = pending.id;
            pendingSharedPdfName = pending.fileName;
            pendingSharedPdfBase64 = null;
        } catch (Exception ignored) {}
    }

    private void returnPdfBase64FromPortal`);
}

if (!source.includes('public String readSharedPdfChunk(final String shareId')) {
  const pattern = /        @JavascriptInterface\n        public boolean acknowledgeSharedPdf\(final String shareId\) \{[\s\S]*?\n        \}\n\n        @JavascriptInterface\n        public boolean requestLocation\(\) \{/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:android] acknowledge/requestLocation não localizado');
  source = source.replace(pattern, `        @JavascriptInterface
        public String readSharedPdfChunk(final String shareId, final String offsetRaw, final String lengthRaw) {
            try {
                long offset = Long.parseLong(offsetRaw == null || offsetRaw.trim().isEmpty() ? "0" : offsetRaw.trim());
                int length = Integer.parseInt(lengthRaw == null || lengthRaw.trim().isEmpty() ? "0" : lengthRaw.trim());
                byte[] chunk = SharedPdfInbox.readChunk(MainActivity.this, shareId, offset, length, MAX_PDF_BYTES);
                return Base64.encodeToString(chunk, Base64.NO_WRAP);
            } catch (Exception error) {
                return "";
            }
        }

        @JavascriptInterface
        public String sharedPdfStatus() {
            try {
                SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(MainActivity.this);
                if (pending == null) return "{}";
                JSONObject payload = new JSONObject();
                payload.put("shareId", pending.id);
                payload.put("sourceFileName", pending.fileName);
                payload.put("byteLength", pending.file.length());
                payload.put("transport", "android-private-inbox");
                return payload.toString();
            } catch (Exception error) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean acknowledgeSharedPdf(final String shareId) {
            synchronized (MainActivity.this) {
                boolean acknowledged = SharedPdfInbox.acknowledge(MainActivity.this, shareId);
                if (!acknowledged) return false;
                pendingSharedPdfBase64 = null;
                pendingSharedPdfName = null;
                pendingSharedPdfId = null;
                return true;
            }
        }

        @JavascriptInterface
        public boolean requestLocation() {`);
}

if (!source.includes('payload.put("transport", "android-private-inbox")')) {
  const pattern = /    private void dispatchPendingSharedPdf\(\) \{[\s\S]*?\n    \}\n\n    private void injectIFlightAutomation/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:android] dispatchPendingSharedPdf não localizado');
  source = source.replace(pattern, `    private void dispatchPendingSharedPdf() {
        if (webView == null) return;
        try {
            SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(this);
            if (pending == null) return;
            pendingSharedPdfId = pending.id;
            pendingSharedPdfName = pending.fileName;
            pendingSharedPdfBase64 = null;

            JSONObject payload = new JSONObject();
            payload.put("ok", true);
            payload.put("filename", pending.fileName);
            payload.put("sourceFileName", pending.fileName);
            payload.put("shareId", pending.id);
            payload.put("byteLength", pending.file.length());
            payload.put("transport", "android-private-inbox");
            String js = "(function(){var payload=" + payload.toString() + ";window.__crewcheckPendingNativePdf=payload;window.dispatchEvent(new CustomEvent('crewcheck:native-pdf',{detail:payload}));})();";
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) {
            // Keep the private inbox untouched. A later page load/resume can retry.
        }
    }

    private void injectIFlightAutomation`);
}


// Extend only #825 receiver/inbox transport; never replay its Home importer.
if (!source.includes('public boolean claimSharedPdf(')) {
  source = source.replace('    private String pendingSharedPdfId;', '    private String pendingSharedPdfId;\n    private boolean sharedPdfIncomingHandled;\n    private volatile boolean sharedPdfTrustedPage;\n    private volatile String sharedPdfReceiptOwner;\n    private boolean sharedPdfSessionReported;\n    private Intent sharedPdfStartupIntent;');
  const bridge = fs.readFileSync(new URL('./claim-bridge.snippet', import.meta.url), 'utf8');
  const request = '        @JavascriptInterface\n        public boolean requestLocation() {';
  if (!source.includes(request)) throw new Error('[shared-pdf-claim] requestLocation anchor missing');
  source = source.replace(request, bridge + request);
  source = source.replace(/        public String readSharedPdfChunk\(final String shareId, final String offsetRaw, final String lengthRaw\) \{[\s\S]*?\n        \}/,
    '        public String readSharedPdfChunk(final String shareId, final String offsetRaw, final String lengthRaw) { return ""; }');
  source = source.replace(/        public boolean acknowledgeSharedPdf\(final String shareId\) \{[\s\S]*?\n        \}/,
    '        public boolean acknowledgeSharedPdf(final String shareId) { return false; }');
  source = source.replace('            try {\n                SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(MainActivity.this);',
    '            if (!sharedPdfTrustedPage) return "{}";\n            try {\n                SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(MainActivity.this);');
  source = source.replace('                payload.put("transport", "android-private-inbox");',
    '                payload.put("transport", "android-private-inbox");\n                payload.put("ownershipProtocol", "explicit-account-claim-v1");\n                payload.put("owner", SharedPdfInbox.owner(MainActivity.this));\n                payload.put("phase", SharedPdfInbox.phase(MainActivity.this));');
  source = source.replace('        super.onCreate(savedInstanceState);',
    '        super.onCreate(savedInstanceState);\n        sharedPdfIncomingHandled = savedInstanceState != null && savedInstanceState.getBoolean("ccSharedPdfIncomingHandled", false);');
  source = source.replace('        setIntent(intent);\n        handleIncomingPdfIntent(intent);', '        sharedPdfIncomingHandled = false;\n        sharedPdfStartupIntent = null;\n        setIntent(intent);\n        handleIncomingPdfIntent(intent);');
  source = source.replace('        handleIncomingPdfIntent(getIntent());', '        if (!sharedPdfIncomingHandled) sharedPdfStartupIntent = getIntent();');
  const finished = '            public void onPageFinished(WebView view, String url) {\n                super.onPageFinished(view, url);';
  if (!source.includes(finished)) throw new Error('[shared-pdf-claim] main page lifecycle missing');
  source = source.replace(finished, '            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {\n                sharedPdfTrustedPage = isCrewCheckWebUrl(url);\n                super.onPageStarted(view, url, icon);\n            }\n\n' + finished + '\n                sharedPdfTrustedPage = isCrewCheckWebUrl(url);');
  const incoming = /    private void handleIncomingPdfIntent\(Intent intent\) \{[\s\S]*?\n    \}\n\n    private void readIncomingPdfUri/;
  if (!incoming.test(source)) throw new Error('[shared-pdf-claim] receiver missing');
  source = source.replace(incoming, `    private void handleIncomingPdfIntent(Intent intent) {
        if (!sharedPdfSessionReported) { sharedPdfStartupIntent = intent; return; }
        handleIncomingPdfIntent(intent, sharedPdfReceiptOwner);
    }

    private void handleIncomingPdfIntent(Intent intent, String initialOwner) {
        if (intent == null) return;
        try {
            String action = intent.getAction();
            if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;
            // Consume even a rejected batch; recreation must not replay the delivery.
            sharedPdfIncomingHandled = true;
            Intent consumed = new Intent(this, MainActivity.class);
            consumed.setAction(Intent.ACTION_MAIN);
            setIntent(consumed);
            Uri uri = SharedPdfIncomingIntent.uniquePdfUri(intent, getContentResolver());
            if (uri == null) return;
            readIncomingPdfUri(uri, initialOwner);
        } catch (Exception error) {
            Toast.makeText(this, error.getMessage() == null ? "Não consegui receber o PDF compartilhado." : error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("ccSharedPdfIncomingHandled", sharedPdfIncomingHandled);
        super.onSaveInstanceState(state);
    }

    private void readIncomingPdfUri`);
  source = source.replace('PDF recebido. Processando a escala automaticamente...', 'PDF guardado. Confirme a conta antes de importar.');
}
fs.writeFileSync(path, source, 'utf8');
console.log('[p0-shared-pdf:android] durable private inbox materialized.');
