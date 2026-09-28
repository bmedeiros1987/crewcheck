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

if (!source.includes('SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES)')) {
  const pattern = /    private void readIncomingPdfUri\(Uri uri\) throws Exception \{[\s\S]*?\n    \}\n\n    private void returnPdfBase64FromPortal/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:android] readIncomingPdfUri não localizado');
  source = source.replace(pattern, `    private void readIncomingPdfUri(Uri uri) throws Exception {
        SharedPdfInbox.PendingPdf pending = SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES);
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

fs.writeFileSync(path, source, 'utf8');
console.log('[p0-shared-pdf:android] durable private inbox materialized.');
