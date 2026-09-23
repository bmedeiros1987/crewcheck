import fs from 'node:fs';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
if (!fs.existsSync(path)) throw new Error(`[p0-shared-pdf:dispatch] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

const durableDispatchMarker = `private void dispatchPendingSharedPdf() {
        if (webView == null) return;
        try {
            SharedPdfInbox.PendingPdf pending = SharedPdfInbox.peek(this);`;

if (!source.includes(durableDispatchMarker)) {
  const pattern = /    private void dispatchPendingSharedPdf\(\) \{[\s\S]*?\n    \}\n\n    private void injectIFlightAutomation/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:dispatch] dispatchPendingSharedPdf não localizado');
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
console.log('[p0-shared-pdf:dispatch] durable metadata-only dispatch materialized.');
