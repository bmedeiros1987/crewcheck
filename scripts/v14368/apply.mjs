import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14368] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14368] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;

  next = replaceRequired(
    next,
    '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;',
    '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;\n    private String pendingSharedPdfId;',
    'estado persistente do PDF compartilhado',
  );

  next = replaceRequired(
    next,
    `            if (Intent.ACTION_SEND.equals(action)) {\n                Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);\n                if (stream instanceof Uri) uri = (Uri) stream;\n            } else if (Intent.ACTION_VIEW.equals(action)) {`,
    `            if (Intent.ACTION_SEND.equals(action)) {\n                Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);\n                if (stream instanceof Uri) uri = (Uri) stream;\n                if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {\n                    uri = intent.getClipData().getItemAt(0).getUri();\n                }\n            } else if (Intent.ACTION_VIEW.equals(action)) {`,
    'fallback ClipData no compartilhamento Android',
  );

  next = replaceRequired(
    next,
    `        pendingSharedPdfName = filename;\n        pendingSharedPdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP);\n        dispatchPendingSharedPdf();`,
    `        pendingSharedPdfName = filename;\n        pendingSharedPdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP);\n        pendingSharedPdfId = "share_" + System.currentTimeMillis() + "_" + Math.abs(filename.hashCode()) + "_" + bytes.length;\n        dispatchPendingSharedPdf();`,
    'identificador do PDF compartilhado',
  );

  next = replaceRequired(
    next,
    `            payload.put("sourceFileName", pendingSharedPdfName == null ? "iFlight_RosterReport.pdf" : pendingSharedPdfName);\n            payload.put("dataBase64", pendingSharedPdfBase64);`,
    `            payload.put("sourceFileName", pendingSharedPdfName == null ? "iFlight_RosterReport.pdf" : pendingSharedPdfName);\n            payload.put("shareId", pendingSharedPdfId == null ? "" : pendingSharedPdfId);\n            payload.put("dataBase64", pendingSharedPdfBase64);`,
    'shareId no payload nativo',
  );

  next = replaceRequired(
    next,
    `            webView.evaluateJavascript(js, null);\n            pendingSharedPdfBase64 = null;\n            pendingSharedPdfName = null;\n            Toast.makeText(this, "Dados recebidos pelo CrewCheck. Importando escala...", Toast.LENGTH_LONG).show();`,
    `            webView.evaluateJavascript(js, null);`,
    'retenção do PDF até confirmação do cliente',
  );

  if (!next.includes('public boolean acknowledgeSharedPdf(final String shareId)')) {
    const anchor = `        @JavascriptInterface\n        public boolean requestLocation() {`;
    if (!next.includes(anchor)) throw new Error('[v14368] Âncora do bridge nativo não localizada.');
    const method = `        @JavascriptInterface\n        public boolean acknowledgeSharedPdf(final String shareId) {\n            synchronized (MainActivity.this) {\n                String expected = pendingSharedPdfId == null ? "" : pendingSharedPdfId;\n                String received = shareId == null ? "" : shareId.trim();\n                if (pendingSharedPdfBase64 != null && (received.isEmpty() || expected.isEmpty() || expected.equals(received))) {\n                    pendingSharedPdfBase64 = null;\n                    pendingSharedPdfName = null;\n                    pendingSharedPdfId = null;\n                }\n            }\n            return true;\n        }\n\n`;
    next = next.replace(anchor, `${method}${anchor}`);
  }

  return next;
});

update('android-wrapper/app/src/main/AndroidManifest.xml', (source) => {
  if (source.includes('android:mimeType="application/octet-stream"')) return source;
  const pdfFilter = `            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="application/pdf" />\n            </intent-filter>`;
  if (!source.includes(pdfFilter)) throw new Error('[v14368] Intent filter PDF não localizado.');
  const octetFilter = `${pdfFilter}\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="application/octet-stream" />\n            </intent-filter>`;
  return source.replace(pdfFilter, octetFilter);
});

update('client/src/pages/Home.tsx', (source) => {
  if (source.includes('crewcheck:native-pdf') && source.includes('acknowledgeSharedPdf')) return source;
  const anchor = `  const [presentationRevision, setPresentationRevision] = useState(0);`;
  if (!source.includes(anchor)) throw new Error('[v14368] Estado de apresentação do Home não localizado.');
  const bridge = `${anchor}\n  const nativePdfClaimsRef = useRef<Set<string>>(new Set());\n  useEffect(() => {\n    let alive = true;\n    const consumeNativePdf = async (payload: any) => {\n      const dataBase64 = String(payload?.dataBase64 || '').trim();\n      if (!alive || !dataBase64) return;\n      const filename = String(payload?.filename || payload?.sourceFileName || 'CrewCheck-escala.pdf').trim() || 'CrewCheck-escala.pdf';\n      const shareId = String(payload?.shareId || \`legacy:${'${filename}'}:${'${dataBase64.length}'}\`);\n      if (nativePdfClaimsRef.current.has(shareId)) return;\n      nativePdfClaimsRef.current.add(shareId);\n      try {\n        toast.message('PDF compartilhado recebido. Importando escala...');\n        const binary = window.atob(dataBase64);\n        const bytes = new Uint8Array(binary.length);\n        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);\n        const file = new File([bytes], filename.toLowerCase().endsWith('.pdf') ? filename : \`${'${filename}'}.pdf\`, { type: 'application/pdf' });\n        await handleFile({ target: { files: [file] } } as unknown as ChangeEvent<HTMLInputElement>);\n        try { (window as any).AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId); } catch {}\n        try { delete (window as any).__crewcheckPendingNativePdf; } catch {}\n      } catch (error) {\n        nativePdfClaimsRef.current.delete(shareId);\n        toast.error(error instanceof Error ? error.message : 'Não consegui importar o PDF compartilhado.');\n        setView('import');\n      }\n    };\n    const onNativePdf = (event: Event) => { void consumeNativePdf((event as CustomEvent).detail); };\n    window.addEventListener('crewcheck:native-pdf', onNativePdf as EventListener);\n    const pending = (window as any).__crewcheckPendingNativePdf;\n    if (pending) window.setTimeout(() => { void consumeNativePdf(pending); }, 0);\n    return () => { alive = false; window.removeEventListener('crewcheck:native-pdf', onNativePdf as EventListener); };\n  }, [bundle]);`;
  return source.replace(anchor, bridge);
});

console.log('[v14368] Compartilhar PDF no Android usa o fluxo canônico de importação e só limpa o buffer após ACK do cliente.');
