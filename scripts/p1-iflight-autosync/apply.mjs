import fs from 'node:fs';

// Liga o AutoPull do iFlight (antes travado pelo kill switch da v14.3.56) e acrescenta a
// atualização automática: login/MFA uma vez na página oficial, depois o CrewCheck reaproveita a
// sessão do navegador interno e baixa/importa o PDF da escala em segundo plano.

const MARKER = 'IFLIGHT_AUTOSYNC_P1';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[p1-iflight-autosync] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[p1-iflight-autosync] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

const IMPORTS = `import { connectIFlight, hasIFlightBridge, IFLIGHT_INTERVAL_OPTIONS, setIFlightAutoSyncEnabled, setIFlightAutoSyncInterval, setIFlightImporter, startIFlightAutoSync, syncIFlightNow } from '@/lib/iflightAutoSync';
import { useIFlightAutoSync } from '@/lib/useIFlightAutoSync';`;

const VIEW = `// ${MARKER}: AutoPull ligado. Defina como false para liberar a todos os usuários.
const IFLIGHT_AUTOSYNC_ADMIN_ONLY = true;

function formatIFlightSyncTime(timestamp: number) {
  if (!timestamp) return 'ainda não sincronizou';
  return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function IFlightPushView({ actions }: { actions: QuickActions }) {
  const sync = useIFlightAutoSync();
  const native = hasIFlightBridge();

  if (IFLIGHT_AUTOSYNC_ADMIN_ONLY && !isAdmin()) return <><Brand back/><section className="cz-empty-real"><Lock/><h2>Acesso restrito</h2><p>A atualização automática do iFlight está disponível somente para o administrador por enquanto.</p></section></>;

  async function connect() {
    const result = await connectIFlight();
    if (result.ok) toast.success('iFlight conectado. A escala será atualizada automaticamente.');
    else toast.error(result.message);
  }

  async function syncNow() {
    if (sync.needsLogin) { await connect(); return; }
    const result = await syncIFlightNow({ silent: true });
    if (result.ok) toast.success('Escala atualizada pelo iFlight.');
    else toast.error(result.message);
  }

  const title = !native ? 'Disponível no app Android'
    : sync.running ? 'Sincronizando com o iFlight…'
    : sync.needsLogin ? 'Sessão expirada: entre de novo'
    : sync.enabled ? 'Conectado ao iFlight'
    : 'Ainda não conectado';
  const stepClass = (active: boolean) => (active ? 'active' : '');

  return <><Brand back/><section className="cz-panel-head"><h1>Atualização automática do iFlight</h1><p>Você entra uma vez com login e MFA na página oficial do iFlight. O CrewCheck mantém a sessão aberta neste aparelho e atualiza a escala sozinho, sem guardar sua senha.</p></section>
    <section className="cz-toolbox cc-iflight-wizard"><header><ShieldCheck/><div><small>{sync.enabled ? 'ATUALIZAÇÃO AUTOMÁTICA LIGADA' : 'ATUALIZAÇÃO AUTOMÁTICA DESLIGADA'}</small><h2>{title}</h2></div></header>
      <div className="cc-iflight-steps"><article className={stepClass(!sync.enabled || sync.needsLogin)}><span>1</span><div><strong>Login e MFA</strong><small>Digitados por você na página oficial do iFlight, só quando a sessão expirar.</small></div></article><article className={stepClass(sync.enabled && !sync.needsLogin)}><span>2</span><div><strong>Leitura automática</strong><small>Com o app aberto, o CrewCheck baixa o PDF da escala a cada {sync.intervalMinutes} min.</small></div></article><article><span>3</span><div><strong>Importação</strong><small>O mesmo leitor do PDF manual, com as checagens de integridade.</small></div></article></div>
      <div className="cz-tool-actions"><button className="primary" disabled={!native || sync.running} onClick={connect}><Lock/> {sync.enabled && !sync.needsLogin ? 'Entrar de novo no iFlight' : 'Conectar ao iFlight'}</button><button disabled={!native || sync.running || !sync.enabled} onClick={syncNow}><Check/> Atualizar agora</button><button onClick={actions.upload}><Upload/> Importar PDF manualmente</button></div>
      {native && <div className="cz-tool-actions"><button disabled={!sync.enabled && !sync.lastSuccessAt} onClick={() => setIFlightAutoSyncEnabled(!sync.enabled)}>{sync.enabled ? 'Pausar atualização automática' : 'Retomar atualização automática'}</button>{IFLIGHT_INTERVAL_OPTIONS.map((minutes) => <button key={minutes} className={sync.intervalMinutes === minutes ? 'primary' : ''} onClick={() => setIFlightAutoSyncInterval(minutes)}>{minutes < 60 ? minutes + ' min' : minutes / 60 + ' h'}</button>)}</div>}
    </section>
    <section className="cz-mini-status"><p><strong>Última atualização:</strong> {formatIFlightSyncTime(sync.lastSuccessAt)}</p>{sync.lastError && <p><strong>Atenção:</strong> {sync.lastError}</p>}{!native && <p><strong>Neste aparelho:</strong> o navegador comum não permite ler o iFlight. Use o app Android do CrewCheck ou importe o PDF manualmente.</p>}<p><strong>Como funciona:</strong> a sessão fica salva só neste aparelho, dentro do navegador interno. As atualizações acontecem enquanto o CrewCheck estiver aberto; se a sessão expirar, o app avisa e você entra de novo com login e MFA.</p></section>
  </>;
}`;

const HOME_HOOK = `  // ${MARKER}: o importador usa o fluxo canônico de PDF e roda sem pedir confirmação a cada atualização.
  useEffect(() => {
    setIFlightImporter(async (file: File) => { await handleFile({ target: { files: [file] } } as unknown as ChangeEvent<HTMLInputElement>); });
    return () => setIFlightImporter(null);
  }, [bundle]);
  useEffect(() => startIFlightAutoSync(), []);`;

export function patchIFlightAutoSyncHome(source) {
  if (source.includes(MARKER)) return source;
  let next = source;

  next = replaceRequired(next, "import { toast } from 'sonner';", `import { toast } from 'sonner';\n${IMPORTS}`, 'import do toast');

  const start = next.indexOf('function IFlightPushView(');
  const end = start >= 0 ? next.indexOf('function dutyHoursForRosterDay(', start) : -1;
  if (start < 0 || end < 0) throw new Error(`[p1-iflight-autosync] Fluxo iFlight não localizado. start=${start} end=${end}`);
  const eol = next.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  next = `${next.slice(0, start)}${VIEW.replace(/\n/g, eol)}${eol}${eol}${next.slice(end)}`;

  const confirmNeedle = 'const confirmed = await requestCrewCheckImportConfirmation(decision);';
  next = replaceRequired(
    next,
    confirmNeedle,
    `// Atualização automática do iFlight: a checagem de integridade acima continua valendo; só a pergunta é dispensada.
  if ((window as unknown as { __crewcheckSilentImport?: boolean }).__crewcheckSilentImport === true) return { ...decision, ok: true };
  ${confirmNeedle}`,
    'confirmação de importação',
  );

  const anchor = '  const [presentationRevision, setPresentationRevision] = useState(0);';
  next = replaceRequired(next, anchor, `${anchor}\n${HOME_HOOK}`, 'estado de apresentação do Home');
  return next;
}

export function patchIFlightAutoSyncAndroid(source) {
  if (source.includes('scheduleSilentLoginCheck')) return source;
  let next = source;

  next = replaceRequired(
    next,
    'private static final boolean IFLIGHT_AUTOPULL_AUTHORIZED = false;',
    'private static final boolean IFLIGHT_AUTOPULL_AUTHORIZED = true;',
    'kill switch do AutoPull',
  );

  next = replaceRequired(
    next,
    '    private String activeIFlightConfigJson = "{}";',
    '    private String activeIFlightConfigJson = "{}";\n    private boolean activeIFlightSilent = false;',
    'estado do portal silencioso',
  );

  next = replaceRequired(
    next,
    '        activeIFlightConfigJson = sanitizeJsonConfig(configJson);',
    `        activeIFlightConfigJson = sanitizeJsonConfig(configJson);
        boolean silentRequested = false;
        int silentTimeoutSeconds = 150;
        try {
            JSONObject portalConfig = new JSONObject(activeIFlightConfigJson);
            silentRequested = portalConfig.optBoolean("silent", false);
            silentTimeoutSeconds = Math.max(30, Math.min(300, portalConfig.optInt("silentTimeoutSeconds", 150)));
        } catch (Exception ignored) {}
        final boolean silentRun = silentRequested;
        final int silentTimeoutMs = silentTimeoutSeconds * 1000;
        activeIFlightSilent = silentRun;`,
    'leitura da configuração silenciosa',
  );

  next = replaceRequired(
    next,
    '        rootLayout.addView(container);',
    `        rootLayout.addView(container);
        if (silentRun) {
            // Atualização automática: o portal oficial carrega invisível reaproveitando a sessão salva.
            container.setVisibility(View.INVISIBLE);
            final String silentRequestId = requestId;
            portalWebView.postDelayed(() -> {
                if (silentRequestId != null && silentRequestId.equals(activeIFlightRequestId) && activeIFlightSilent) {
                    finishIFlightWithCode("IFLIGHT_TIMEOUT", "O iFlight não respondeu a tempo. Tentarei de novo mais tarde.");
                }
            }, silentTimeoutMs);
        }`,
    'portal invisível na atualização automática',
  );

  next = replaceRequired(
    next,
    '                if (isAuthOrLoginUrl(pageUrl)) {\n                    // Não injeta cliques/datas',
    '                if (isAuthOrLoginUrl(pageUrl)) {\n                    scheduleSilentLoginCheck(view);\n                    // Não injeta cliques/datas',
    'detecção de login na atualização automática',
  );

  next = replaceRequired(
    next,
    '    private void finishIFlightWithPayload(final JSONObject payload) {',
    `    private void finishIFlightWithCode(String code, String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("ok", false);
            payload.put("code", code);
            payload.put("error", message == null ? "Importação iFlight interrompida." : message);
            finishIFlightWithPayload(payload);
        } catch (Exception ignored) {}
    }

    // Atualização automática: se a sessão expirou o portal cai na tela de login/MFA. Não mostramos
    // essa tela escondida; encerramos para o CrewCheck pedir que o usuário entre de novo.
    private void scheduleSilentLoginCheck(final WebView view) {
        if (!activeIFlightSilent || view == null) return;
        final String requestId = activeIFlightRequestId;
        view.postDelayed(() -> {
            if (requestId == null || !requestId.equals(activeIFlightRequestId) || !activeIFlightSilent) return;
            if (portalWebView == view && isAuthOrLoginUrl(lastIFlightUrl)) {
                finishIFlightWithCode("IFLIGHT_LOGIN_REQUIRED", "A sessão do iFlight expirou. Entre de novo com login e MFA.");
            }
        }, 20000);
    }

    private void finishIFlightWithPayload(final JSONObject payload) {`,
    'helpers da atualização automática',
  );

  return next;
}

if (process.env.CREWCHECK_P1_IFLIGHT_AUTOSYNC_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', patchIFlightAutoSyncHome);
  update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', patchIFlightAutoSyncAndroid, { optional: true });
  console.log('[p1-iflight-autosync] AutoPull do iFlight ligado com atualização automática de sessão.');
}
