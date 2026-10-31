import assert from 'node:assert/strict';

process.env.CREWCHECK_P1_IFLIGHT_AUTOSYNC_SKIP_APPLY = '1';
const { patchIFlightAutoSyncHome, patchIFlightAutoSyncAndroid } = await import('./p1-iflight-autosync/apply.mjs');

// ---------- patch web (Home.tsx) ----------
const homeBefore = `import { toast } from 'sonner';
function confirmX() {
  const confirmed = await requestCrewCheckImportConfirmation(decision);
}
function IFlightPushView({ actions }: { actions: QuickActions }) {
  const automaticIFlightAuthorized = false;
  return null;
}

function dutyHoursForRosterDay(day: RosterDay): number { return 0; }
function Home() {
  const [presentationRevision, setPresentationRevision] = useState(0);
}`;
const homeAfter = patchIFlightAutoSyncHome(homeBefore);
assert.doesNotMatch(homeAfter, /automaticIFlightAuthorized/, 'o kill switch web deve sair');
assert.match(homeAfter, /from '@\/lib\/iflightAutoSync'/);
assert.match(homeAfter, /from '@\/lib\/useIFlightAutoSync'/);
assert.match(homeAfter, /IFLIGHT_AUTOSYNC_ADMIN_ONLY = true/, 'continua restrito ao admin por padrão');
assert.match(homeAfter, /Conectar ao iFlight/);
assert.match(homeAfter, /Importar PDF manualmente/, 'o fallback manual continua disponível');
assert.match(homeAfter, /__crewcheckSilentImport === true\) return \{ \.\.\.decision, ok: true \};\n  const confirmed = await requestCrewCheckImportConfirmation\(decision\);/, 'só a pergunta é dispensada na importação automática');
assert.match(homeAfter, /startIFlightAutoSync\(\)/);
assert.match(homeAfter, /setIFlightImporter\(async \(file: File\)/);
assert.equal(patchIFlightAutoSyncHome(homeAfter), homeAfter, 'o patch web deve ser idempotente');

// ---------- patch Android ----------
const androidBefore = `public class MainActivity extends Activity {
  private static final boolean IFLIGHT_AUTOPULL_AUTHORIZED = false;
    private String activeIFlightConfigJson = "{}";
    private void openIFlightPortal(String url, String configJson, String requestId) {
        activeIFlightConfigJson = sanitizeJsonConfig(configJson);
        view.setWebViewClient(new WebViewClient() {
            public void onPageFinished(WebView view, String pageUrl) {
                if (isAuthOrLoginUrl(pageUrl)) {
                    // Não injeta cliques/datas enquanto o usuário digita login, senha ou MFA.
                    return;
                }
            }
        });
        rootLayout.addView(container);
    }
    private void finishIFlightWithPayload(final JSONObject payload) {
    }
}`;
const androidAfter = patchIFlightAutoSyncAndroid(androidBefore);
assert.match(androidAfter, /IFLIGHT_AUTOPULL_AUTHORIZED = true/);
assert.doesNotMatch(androidAfter, /IFLIGHT_AUTOPULL_AUTHORIZED = false/);
assert.match(androidAfter, /optBoolean\("silent", false\)/);
assert.match(androidAfter, /container\.setVisibility\(View\.INVISIBLE\)/);
assert.match(androidAfter, /IFLIGHT_LOGIN_REQUIRED/);
assert.match(androidAfter, /IFLIGHT_TIMEOUT/);
assert.match(androidAfter, /scheduleSilentLoginCheck\(view\);/);
assert.equal(patchIFlightAutoSyncAndroid(androidAfter), androidAfter, 'o patch Android deve ser idempotente');

// ---------- núcleo da sincronização ----------
const store = new Map();
const listeners = new Map();
const windowStub = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  dispatchEvent: (event) => { for (const fn of listeners.get(event.type) || []) fn(event); return true; },
  addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) || []), fn]); },
  removeEventListener: (type, fn) => { listeners.set(type, (listeners.get(type) || []).filter((item) => item !== fn)); },
  setInterval, clearInterval, setTimeout, clearTimeout,
};
globalThis.window = windowStub;
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const sync = await import('../client/src/lib/iflightAutoSync.ts');

const pdfBase64 = Buffer.from('%PDF-1.4 teste').toString('base64');
let bridgeCalls = [];
let bridgeResult;
windowStub.CrewCheckIFlight = {
  openPortalAndImport: async (url, options) => { bridgeCalls.push({ url, options }); return bridgeResult; },
};

// opções: PDF, portal CWP oficial, silencioso só na atualização automática
const visible = sync.buildIFlightPortalOptions(false, new Date(2026, 9, 9));
const silent = sync.buildIFlightPortalOptions(true, new Date(2026, 9, 9));
assert.equal(visible.format, 'pdf', 'o fluxo usa PDF porque o leitor de calendário em texto não tem parser no servidor');
assert.equal(visible.silent, false);
assert.equal(silent.silent, true);
assert.equal(silent.portalUrl, 'https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage');
assert.equal(silent.periodMonth, '10');
assert.equal(silent.fromDate, '01-Oct-2026');
assert.equal(silent.toDate, '31-Oct-2026');
assert.equal(silent.privacyMode, 'lgpd_no_credentials');
assert.equal(silent.clickSend, false);
assert.doesNotMatch(JSON.stringify(silent), /senha|password|token/i, 'nenhuma credencial nas opções');

// sem importador pronto: não baixa nada e registra o erro
bridgeResult = { ok: true, dataBase64: pdfBase64, filename: 'iFlight_RosterReport.pdf' };
let result = await sync.syncIFlightNow({ silent: true });
assert.equal(result.ok, false);
assert.equal(result.code, 'NO_IMPORTER');

// sucesso: importa o PDF e liga a atualização automática ao conectar
let imported = [];
sync.setIFlightImporter(async (file) => {
  imported.push({ name: file.name, type: file.type, size: file.size });
  windowStub.dispatchEvent(new CustomEvent('crewcheck:roster-updated'));
  assert.equal(windowStub.__crewcheckSilentImport, true, 'importação automática não pede confirmação');
});
result = await sync.connectIFlight();
assert.equal(result.ok, true);
assert.deepEqual(imported.map((i) => [i.name, i.type]), [['iFlight_RosterReport.pdf', 'application/pdf']]);
assert.equal(windowStub.__crewcheckSilentImport, undefined, 'a flag de importação silenciosa é removida');
assert.equal(bridgeCalls.at(-1).options.silent, false, 'a conexão inicial mostra o portal para login e MFA');
let state = sync.getIFlightAutoSyncState();
assert.equal(state.enabled, true);
assert.equal(state.needsLogin, false);
assert.ok(state.lastSuccessAt > 0);

// importador que não salvou escala (PDF ilegível) não conta como sucesso
sync.setIFlightImporter(async () => undefined);
result = await sync.syncIFlightNow({ silent: true });
assert.equal(result.ok, false);
assert.equal(result.code, 'IMPORT_FAILED');
state = sync.getIFlightAutoSyncState();
assert.match(state.lastError, /não conseguiu ler/);

// sessão expirada: para as tentativas silenciosas até o usuário entrar de novo
sync.setIFlightImporter(async () => { windowStub.dispatchEvent(new CustomEvent('crewcheck:roster-updated')); });
bridgeResult = { ok: false, code: 'IFLIGHT_LOGIN_REQUIRED', error: 'expirou' };
result = await sync.syncIFlightNow({ silent: true });
assert.equal(result.code, 'IFLIGHT_LOGIN_REQUIRED');
state = sync.getIFlightAutoSyncState();
assert.equal(state.needsLogin, true);
assert.equal(sync.isIFlightSyncDue({ ...state, lastAttemptAt: 0 }, Date.now()), false, 'sessão expirada não dispara portal escondido de novo');

// reconectar limpa o aviso e volta a agendar
bridgeResult = { ok: true, dataBase64: pdfBase64, filename: 'iFlight_RosterReport.pdf' };
result = await sync.connectIFlight();
assert.equal(result.ok, true);
assert.equal(sync.getIFlightAutoSyncState().needsLogin, false);

// agenda: intervalo normal, espera maior depois de erro, nada se estiver pausado
const base = { ...sync.getIFlightAutoSyncState(), enabled: true, needsLogin: false, running: false, intervalMinutes: 30, lastError: '' };
const t0 = 1_000_000_000;
assert.equal(sync.isIFlightSyncDue({ ...base, lastAttemptAt: t0 }, t0 + 29 * 60_000), false);
assert.equal(sync.isIFlightSyncDue({ ...base, lastAttemptAt: t0 }, t0 + 30 * 60_000), true);
assert.equal(sync.isIFlightSyncDue({ ...base, lastAttemptAt: t0, lastSuccessAt: t0 - 1, lastError: 'x' }, t0 + 10 * 60_000), false);
assert.equal(sync.isIFlightSyncDue({ ...base, lastAttemptAt: t0, lastSuccessAt: t0 - 1, lastError: 'x' }, t0 + 15 * 60_000), true);
assert.equal(sync.isIFlightSyncDue({ ...base, enabled: false, lastAttemptAt: 0 }, t0), false);
assert.equal(sync.isIFlightSyncDue({ ...base, running: true, lastAttemptAt: 0 }, t0), false);

// intervalo inválido é ignorado
sync.setIFlightAutoSyncInterval(60);
assert.equal(sync.getIFlightAutoSyncState().intervalMinutes, 60);
sync.setIFlightAutoSyncInterval(1);
assert.equal(sync.getIFlightAutoSyncState().intervalMinutes, 60);

// fora do app Android não há ponte nativa
delete windowStub.CrewCheckIFlight;
assert.equal(sync.hasIFlightBridge(), false);
result = await sync.syncIFlightNow({ silent: true });
assert.equal(result.code, 'NO_BRIDGE');

console.log('[p1-iflight-autosync] AutoPull ligado, sessão expirada tratada, importação automática sem confirmação e agenda validados.');
