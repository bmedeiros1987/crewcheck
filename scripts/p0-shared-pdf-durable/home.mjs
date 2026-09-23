import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p0-shared-pdf:home] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`[p0-shared-pdf:home] âncora ausente: ${label}`);
  source = source.replace(before, after);
}

if (!source.includes("from '@/lib/pwaSharedPdfRuntime'")) {
  const anchor = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";
  replaceOnce(
    anchor,
    `${anchor}\nimport { acknowledgePwaSharedPdf, claimPendingPwaSharedPdf, consumePendingPwaShareError } from '@/lib/pwaSharedPdfRuntime';`,
    'PWA shared PDF import',
  );
}

if (source.includes('const nativePdfClaimsRef = useRef<Set<string>>(new Set());')) {
  const legacy = /\n  const nativePdfClaimsRef = useRef<Set<string>>\(new Set\(\)\);\n  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[bundle\]\);/;
  const upgraded = source.replace(legacy, '');
  if (upgraded === source) throw new Error('[p0-shared-pdf:home] listener Base64 legado não localizado por inteiro');
  source = upgraded;
}

if (!source.includes('const bundleRef = useRef(bundle);')) {
  replaceOnce(
    '  const [bundle, setBundle] = useState<BundleState>(loadRoster());',
    '  const [bundle, setBundle] = useState<BundleState>(loadRoster());\n  const bundleRef = useRef(bundle);\n  const sharedPdfClaimsRef = useRef<Set<string>>(new Set());',
    'bundle ref + shared claims',
  );
}

if (!source.includes('const importSharedPdfFile = async (')) {
  const anchor = '  useWeatherLandingMonitor(flightEvent);';
  const block = `  useWeatherLandingMonitor(flightEvent);

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
      const filename = filenameRaw.toLowerCase().endsWith('.pdf') ? filenameRaw : filenameRaw + '.pdf';
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
      const shareId = String(payload?.shareId || ('android:' + file.name + ':' + file.size));
      await importSharedPdfFile(file, shareId, async () => {
        try { (window as any).AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId); } catch {}
        try { delete (window as any).__crewcheckPendingNativePdf; } catch {}
      });
    };

    const consumePwaPdf = async () => {
      try {
        const claim = await claimPendingPwaSharedPdf();
        if (!claim) return;
        await importSharedPdfFile(claim.file, 'pwa:' + claim.shareId, async () => {
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
  replaceOnce(anchor, block, 'durable shared PDF consumer');
}

if (!source.includes('async function processRosterFile(file: File): Promise<boolean>')) {
  const pattern = /  async function handleFile\(inputEvent: ChangeEvent<HTMLInputElement>\) \{[\s\S]*?\n  \}\n\n  async function copyCurrentSummarySilently/;
  if (!pattern.test(source)) throw new Error('[p0-shared-pdf:home] handleFile não localizado');
  source = source.replace(pattern, `  async function processRosterFile(file: File): Promise<boolean> {
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
      toast.success(decision.toastText || 'Escala real importada e detalhes liberados.');
      if (parsed.source === 'server-fallback') toast.message('Leitura alternativa concluída.');
      if (opensComparison) toast.info(String(importComparison?.summary.changedDays || 0) + ' dia(s) com mudanças em relação à escala planejada.');
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

fs.writeFileSync(path, source, 'utf8');
console.log('[p0-shared-pdf:home] native/PWA handoff converges on canonical importer and ACKs only after success.');
