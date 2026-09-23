import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[p0-shared-pdf] arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[p0-shared-pdf] âncora ausente: ${label}`);
  return source.replace(before, after);
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;

  // v14.3.68 already adds a share id. Keep the old preparer compatible, then
  // upgrade its in-memory handoff to an app-private durable inbox here.
  if (!next.includes('private String pendingSharedPdfId;')) {
    next = replaceOnce(
      next,
      '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;',
      '    private String pendingSharedPdfBase64;\n    private String pendingSharedPdfName;\n    private String pendingSharedPdfId;',
      'pendingSharedPdfId',
    );
  }

  if (!next.includes('restorePendingSharedPdfFromInbox();')) {
    next = replaceOnce(
      next,
      '        registerWatchSyncRequestReceiver();\n',
      '        registerWatchSyncRequestReceiver();\n        restorePendingSharedPdfFromInbox();\n',
      'restore inbox on cold start',
    );
  }

  if (!next.includes('intent.getClipData().getItemAt(0).getUri()')) {
    next = replaceOnce(
      next,
      '                if (stream instanceof Uri) uri = (Uri) stream;\n            } else if (Intent.ACTION_VIEW.equals(action)) {',
      '                if (stream instanceof Uri) uri = (Uri) stream;\n                if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {\n                    uri = intent.getClipData().getItemAt(0).getUri();\n                }\n            } else if (Intent.ACTION_VIEW.equals(action)) {',
      'ACTION_SEND ClipData fallback',
    );
  }

  if (!next.includes('SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES)')) {
    const readPattern = /    private void readIncomingPdfUri\(Uri uri\) throws Exception \{[\s\S]*?\n    \}\n\n    private void returnPdfBase64FromPortal/;
    if (!readPattern.test(next)) throw new Error('[p0-shared-pdf] readIncomingPdfUri não localizado');
    next = next.replace(readPattern, `    private void readIncomingPdfUri(Uri uri) throws Exception {
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

  if (!next.includes('public String readSharedPdfChunk(final String shareId')) {
    const bridgePattern = /        @JavascriptInterface\n        public boolean acknowledgeSharedPdf\(final String shareId\) \{[\s\S]*?\n        \}\n\n        @JavascriptInterface\n        public boolean requestLocation\(\) \{/;
    const replacement = `        @JavascriptInterface
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
        public boolean requestLocation() {`;
    if (!bridgePattern.test(next)) throw new Error('[p0-shared-pdf] bridge acknowledge/requestLocation não localizado');
    next = next.replace(bridgePattern, replacement);
  }

  if (!next.includes('payload.put("transport", "android-private-inbox")')) {
    const dispatchPattern = /    private void dispatchPendingSharedPdf\(\) \{[\s\S]*?\n    \}\n\n    private void injectIFlightAutomation/;
    if (!dispatchPattern.test(next)) throw new Error('[p0-shared-pdf] dispatchPendingSharedPdf não localizado');
    next = next.replace(dispatchPattern, `    private void dispatchPendingSharedPdf() {
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

  return next;
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source;

  if (!next.includes("from '@/lib/pwaSharedPdfRuntime'")) {
    const anchor = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";
    next = replaceOnce(
      next,
      anchor,
      `${anchor}\nimport { acknowledgePwaSharedPdf, claimPendingPwaSharedPdf, consumePendingPwaShareError } from '@/lib/pwaSharedPdfRuntime';`,
      'PWA shared PDF import',
    );
  }

  // Remove the legacy v14.3.68 Base64 listener. It ACKed after handleFile returned,
  // even though handleFile swallowed cancellation/errors. Durable ACK belongs only
  // after processRosterFile explicitly reports success.
  next = next.replace(
    /\n  const nativePdfClaimsRef = useRef<Set<string>>\(new Set\(\)\);\n  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[bundle\]\);/,
    '',
  );

  if (!next.includes('const bundleRef = useRef(bundle);')) {
    next = replaceOnce(
      next,
      '  const [bundle, setBundle] = useState<BundleState>(loadRoster());',
      '  const [bundle, setBundle] = useState<BundleState>(loadRoster());\n  const bundleRef = useRef(bundle);\n  const sharedPdfClaimsRef = useRef<Set<string>>(new Set());',
      'bundle ref + shared claims',
    );
  }

  if (!next.includes('const importSharedPdfFile = async (')) {
    const anchor = '  useWeatherLandingMonitor(flightEvent);';
    const block = `${anchor}

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    let mounted = true;

    const importSharedPdfFile = async (
      file: File,
      shareId: string,
      acknowledge: () => Promise<void>,
    ) => {
      const id = String(shareId || '').trim();
      if (!mounted || !id || sharedPdfClaimsRef.current.has(id)) return;
      sharedPdfClaimsRef.current.add(id);
      try {
        toast.message('PDF compartilhado recebido. Processando escala automaticamente...');
        const imported = await processRosterFile(file);
        if (!imported) {
          sharedPdfClaimsRef.current.delete(id);
          setView('import');
          return;
        }
        await acknowledge();
        toast.success('PDF compartilhado processado e escala atualizada.');
      } catch (error) {
        sharedPdfClaimsRef.current.delete(id);
        toast.error(error instanceof Error ? error.message : 'Não consegui processar o PDF compartilhado.');
        setView('import');
      }
    };

    const fileFromNativePayload = async (payload: any): Promise<File | null> => {
      const filenameRaw = String(payload?.filename || payload?.sourceFileName || 'CrewCheck-escala.pdf').trim() || 'CrewCheck-escala.pdf';
      const filename = filenameRaw.toLowerCase().endsWith('.pdf') ? filenameRaw : \`${'${filenameRaw}'}.pdf\`;
      const shareId = String(payload?.shareId || '').trim();
      const dataBase64 = String(payload?.dataBase64 || '').trim();
      let bytes: Uint8Array;

      if (dataBase64) {
        const binary = window.atob(dataBase64);
        bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      } else {
        const expectedLength = Number(payload?.byteLength || 0);
        const nativeBridge = (window as any).AndroidCrewCheckNative;
        if (!shareId || !Number.isFinite(expectedLength) || expectedLength <= 0 || expectedLength > 35 * 1024 * 1024
          || typeof nativeBridge?.readSharedPdfChunk !== 'function') {
          return null;
        }
        bytes = new Uint8Array(expectedLength);
        const chunkSize = 192 * 1024;
        let offset = 0;
        while (offset < expectedLength) {
          const requested = Math.min(chunkSize, expectedLength - offset);
          const encoded = String(nativeBridge.readSharedPdfChunk(shareId, String(offset), String(requested)) || '');
          if (!encoded) throw new Error('Não consegui ler o PDF compartilhado do armazenamento local.');
          const binary = window.atob(encoded);
          if (!binary.length || binary.length > requested) throw new Error('O PDF compartilhado retornou um bloco inválido.');
          for (let index = 0; index < binary.length; index += 1) bytes[offset + index] = binary.charCodeAt(index);
          offset += binary.length;
        }
        if (offset !== expectedLength) throw new Error('O PDF compartilhado foi recebido de forma incompleta.');
      }

      if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
        throw new Error('O arquivo compartilhado não parece ser um PDF válido.');
      }
      return new File([bytes], filename, { type: 'application/pdf', lastModified: Date.now() });
    };

    const consumeNativePdf = async (payload: any) => {
      const file = await fileFromNativePayload(payload);
      if (!file) return;
      const shareId = String(payload?.shareId || \`android:${'${file.name}'}:${'${file.size}'}\`);
      await importSharedPdfFile(file, shareId, async () => {
        try { (window as any).AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId); } catch {}
        try { delete (window as any).__crewcheckPendingNativePdf; } catch {}
      });
    };

    const consumePwaPdf = async () => {
      try {
        const claim = await claimPendingPwaSharedPdf();
        if (!claim) return;
        await importSharedPdfFile(claim.file, \`pwa:${'${claim.shareId}'}\`, async () => {
          await acknowledgePwaSharedPdf(claim.shareId);
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não consegui abrir o PDF compartilhado pelo PWA.');
        setView('import');
      }
    };

    const onNativePdf = (event: Event) => { void consumeNativePdf((event as CustomEvent).detail); };
    const onPwaPdfReady = () => { void consumePwaPdf(); };
    const onPwaShareError = (event: Event) => {
      const message = String((event as CustomEvent)?.detail?.message || '').trim();
      if (message) toast.error(message);
    };

    window.addEventListener('crewcheck:native-pdf', onNativePdf as EventListener);
    window.addEventListener('crewcheck:pwa-pdf-ready', onPwaPdfReady as EventListener);
    window.addEventListener('crewcheck:pwa-share-error', onPwaShareError as EventListener);

    const pendingNative = (window as any).__crewcheckPendingNativePdf;
    if (pendingNative) window.setTimeout(() => { void consumeNativePdf(pendingNative); }, 0);
    const pendingError = consumePendingPwaShareError();
    if (pendingError) toast.error(pendingError);
    void consumePwaPdf();

    return () => {
      mounted = false;
      window.removeEventListener('crewcheck:native-pdf', onNativePdf as EventListener);
      window.removeEventListener('crewcheck:pwa-pdf-ready', onPwaPdfReady as EventListener);
      window.removeEventListener('crewcheck:pwa-share-error', onPwaShareError as EventListener);
    };
  }, []);`;
    next = replaceOnce(next, anchor, block, 'durable shared PDF consumer');
  }

  if (!next.includes('async function processRosterFile(file: File): Promise<boolean>')) {
    const handlePattern = /  async function handleFile\(inputEvent: ChangeEvent<HTMLInputElement>\) \{[\s\S]*?\n  \}\n\n  async function copyCurrentSummarySilently/;
    if (!handlePattern.test(next)) throw new Error('[p0-shared-pdf] handleFile não localizado');
    next = next.replace(handlePattern, `  async function processRosterFile(file: File): Promise<boolean> {
    setBusy(true);
    try {
      const parsed = await parsePDFResilient(file);
      const roster = parsed.roster;
      const decision = confirmRosterImport(roster, file.name);
      if (!decision.ok) {
        toast.message(decision.toastText || 'Importação cancelada.');
        return false;
      }
      const plannedSnapshot = preservePlannedRosterBeforeImport(bundleRef.current, roster);
      const importComparison = plannedSnapshot && sameRosterPeriod(plannedSnapshot.roster, roster)
        ? compareRosters(plannedSnapshot.roster, roster)
        : null;
      const opensComparison = Boolean(importComparison && !importComparison.summary.unchanged);
      const newCompliance = saveRoster(roster, file.name);
      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);
      storage.set('crewcheck_last_import_guardian_period', decision.periodLabel);
      storage.set('crewcheck_last_pdf_import_source', parsed.source);
      const nextBundle = { roster, compliance: newCompliance, source: file.name };
      bundleRef.current = nextBundle;
      setBundle(nextBundle);
      syncRosterWithTelegramConcierge(roster, file.name).catch(() => undefined);
      syncPlatformRoster(roster, newCompliance, file.name).catch(() => toast.message('Escala salva neste dispositivo; a sincronização com o banco será tentada novamente.'));
      sessionStorage.setItem('crewcheck_force_view_once', opensComparison ? 'compare' : 'roster');
      setView(opensComparison ? 'compare' : 'roster');
      toast.success(\`${'${decision.toastText'} || 'Escala real importada e detalhes liberados.'}${'${parsed.source'} === 'server-fallback' ? ' Leitura alternativa concluída.' : ''}\`);
      if (opensComparison) toast.info(\`${'${importComparison?.summary.changedDays'} || 0} dia(s) com mudanças em relação à escala planejada.\`);
      if (!decision.hasFuture) toast.error('A escala importada não possui programação futura após agora.');
      setLocation('/result');
      return true;
    } catch (error) {
      toast.error(sanitizePdfImportError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {
    const file = inputEvent.target.files?.[0];
    if (!file) return;
    try {
      await processRosterFile(file);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function copyCurrentSummarySilently`);
  }

  return next;
});

console.log('[p0-shared-pdf] Android private inbox + PWA durable handoff convergem no importador canônico e só ACK após sucesso.');
