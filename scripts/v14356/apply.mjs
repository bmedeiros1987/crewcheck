import fs from 'node:fs';

const VERSION = '14.3.56';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14356] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

const adminOnlyIFlightView = `function IFlightPushView({ actions }: { actions: QuickActions }) {
  const admin = isAdmin();
  const automaticIFlightAuthorized = false;

  if (!admin) return <><Brand back/><section className="cz-empty-real"><Lock/><h2>Acesso restrito</h2><p>A automação do iFlight está disponível somente no laboratório do administrador.</p></section></>;

  function startAutomaticImport() {
    if (!automaticIFlightAuthorized) {
      toast.error('AutoPull iFlight desativado enquanto aguardamos autorização formal.');
      return;
    }
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Automação do iFlight</h1><p>Fluxo totalmente automático preparado, mas tecnicamente desabilitado até o recebimento da autorização formal da empresa.</p></section>
    <section className="cz-toolbox cc-iflight-wizard"><header><ShieldCheck/><div><small>LABORATÓRIO DO ADMINISTRADOR · AGUARDANDO AUTORIZAÇÃO FORMAL</small><h2>AutoPull protegido</h2></div></header>
      <div className="cc-iflight-steps"><article className="active"><span>1</span><div><strong>Autorização corporativa</strong><small>Pendente; nenhuma sessão será iniciada.</small></div></article><article><span>2</span><div><strong>Leitura automática</strong><small>Preparada e bloqueada pelo kill switch.</small></div></article><article><span>3</span><div><strong>Importação da escala</strong><small>Será liberada somente após autorização formal.</small></div></article></div>
      <div className="cz-tool-actions"><button className="primary" disabled={!automaticIFlightAuthorized} onClick={startAutomaticImport}><Lock/> AutoPull desativado</button><button onClick={actions.upload}><Upload/> Importar PDF manualmente</button></div>
    </section>
    <section className="cz-mini-status"><p><strong>Status:</strong> aguardando autorização formal da empresa.</p><p><strong>Bloqueio ativo:</strong> o CrewCheck não abre o iFlight, não acessa login, MFA, cookies ou sessão e não faz leitura automática enquanto a autorização estiver desativada.</p><p><strong>Acesso:</strong> esta preparação aparece somente para administradores.</p></section>
  </>;
}`;

export function patchIFlightSemiAutomaticV14356(source) {
  const start = source.indexOf('function IFlightPushView(');
  const end = start >= 0 ? source.indexOf('function dutyHoursForRosterDay(', start) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14356] Fluxo iFlight não localizado. start=${start} end=${end}`);
  if (source.slice(start, end).includes('automaticIFlightAuthorized')) return source;
  const eol = source.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  return `${source.slice(0, start)}${adminOnlyIFlightView.replace(/\n/g, eol)}${eol}${eol}${source.slice(end)}`;
}

export function patchIFlightAndroidAuthorizationLockV14356(source) {
  if (source.includes('IFLIGHT_AUTOPULL_AUTHORIZED')) return source;
  const classNeedle = 'public class MainActivity extends Activity {';
  const bridgeNeedle = '  public class CrewCheckIFlightBridge {';
  if (!source.includes(classNeedle) || !source.includes(bridgeNeedle)) throw new Error('[v14356] Ponte Android do iFlight não localizada.');
  let patched = source.replace(classNeedle, `${classNeedle}\n  private static final boolean IFLIGHT_AUTOPULL_AUTHORIZED = false;`);
  patched = patched.replace(bridgeNeedle, `  private void rejectIFlightAutomation(final String requestId) {\n    Toast.makeText(this, "AutoPull iFlight desativado: aguardando autorização formal.", Toast.LENGTH_LONG).show();\n    final String payload = "{\\\"ok\\\":false,\\\"code\\\":\\\"IFLIGHT_AUTHORIZATION_PENDING\\\",\\\"error\\\":\\\"AutoPull iFlight desativado enquanto aguardamos autorização formal.\\\"}";\n    webView.evaluateJavascript("window.CrewCheckIFlightCallback&&window.CrewCheckIFlightCallback('" + escapeJs(requestId) + "'," + payload + ");", null);\n  }\n\n${bridgeNeedle}`);
  return patched.replace(/public void openPortalAndImport\(final String url, final String configJson, final String requestId\) \{\s*/, `public void openPortalAndImport(final String url, final String configJson, final String requestId) {\n      if (!IFLIGHT_AUTOPULL_AUTHORIZED) {\n        runOnUiThread(() -> rejectIFlightAutomation(requestId));\n        return;\n      }\n      `);
}

if (process.env.CREWCHECK_V14356_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', (source) => patchIFlightSemiAutomaticV14356(source)
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: AutoPull iFlight preparado, exclusivo do admin e desativado por autorização';`));
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic-safe', notes: 'AutoPull iFlight preparado, exclusivo do administrador e desativado até autorização formal.' }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - admin-gated iFlight automation`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.56:iflight-assisted-download'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-56-iflight-assisted-download.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140356').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
  update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', patchIFlightAndroidAuthorizationLockV14356, { optional: true });
  update('server.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });
  update('server/platform.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });
  console.log(`[v14356] CrewCheck ${VERSION}: AutoPull iFlight preparado, exclusivo do admin e desativado por autorização.`);
}
