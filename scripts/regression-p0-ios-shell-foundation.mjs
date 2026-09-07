/**
 * P0 — fundação iOS/TestFlight.
 *
 * O adaptador iOS não pode inventar produto. Ele reutiliza dois contratos que já
 * existem e são exercitados por outros gates:
 *
 *   - `crewcheck:native-pdf` + `window.__crewcheckPendingNativePdf`, o mesmo
 *     caminho do Android (`scripts/v14368/apply.mjs`) e do PWA
 *     (`client/src/lib/pwaSharedPdfRuntime.ts`);
 *   - `window.CrewCheckNative`, a fachada que `crewcheckPremiumRuntime.ts` já
 *     consome.
 *
 * Consequência direta: PARSER AIMS, canonicalRoster, APZ e segmentação de
 * jornadas não são tocados por esta frente. Este arquivo prova o comportamento
 * do adaptador e trava essa fronteira.
 *
 * Casos sintéticos e inline. Nenhum fixture, nenhum PDF real, nenhum dado
 * pessoal.
 */

import { readFileSync } from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-ios-foundation-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/iosNativeRuntime.ts'],
});
const ios = harness.load('iosNativeRuntime');

const checker = createChecker('P0 — fundação iOS (shell, deep link, share de PDF)');
const { check } = checker;

// Janela sintética mínima: só o que o adaptador realmente usa.
function makeWindow({ native = true, storage = {} } = {}) {
  const events = [];
  const store = { ...storage };
  const win = {
    events,
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent(event) { events.push({ type: event.type, detail: event.detail }); return true; },
    posted: [],
  };
  if (native) {
    win.webkit = { messageHandlers: { crewcheckIos: { postMessage: (value) => win.posted.push(value) } } };
  }
  return win;
}

const pdfBase64 = (body = 'conteudo sintetico') => Buffer.from(`%PDF-1.7\n${body}`, 'binary').toString('base64');

// ---------------------------------------------------------------------------
// 1. App inicializa — inclusive fora do iOS.
// ---------------------------------------------------------------------------
{
  const web = makeWindow({ native: false });
  let threw = false;
  try { ios.installIosNativeRuntime(web); } catch { threw = true; }
  check('web comum: instalar o runtime iOS não lança', !threw);
  check('web comum: nada é instalado (sem host nativo reconhecido)',
    ios.installIosNativeRuntime(web) === false && !web.CrewCheckNative);

  let threwNull = false;
  try { ios.installIosNativeRuntime(null); ios.installIosNativeRuntime(undefined); } catch { threwNull = true; }
  check('janela ausente não derruba o bootstrap', !threwNull);

  const host = makeWindow();
  check('host iOS: runtime instala e publica a fachada',
    ios.installIosNativeRuntime(host) === true && typeof host.CrewCheckNative?.openExternal === 'function');
  check('instalação é idempotente', ios.installIosNativeRuntime(host) === true);
}

// A fachada do Android nunca pode ser sobrescrita: quem instala primeiro manda.
{
  const host = makeWindow();
  const androidFacade = { marker: 'android' };
  host.CrewCheckNative = androidFacade;
  ios.installIosNativeRuntime(host);
  check('fachada pré-existente (Android) não é sobrescrita', host.CrewCheckNative === androidFacade);
}

// ---------------------------------------------------------------------------
// 2. Deep link válido.
// ---------------------------------------------------------------------------
for (const [raw, esperado] of [
  ['crewcheck://import', 'import'],
  ['crewcheck:///roster', 'roster'],
  ['crewcheck://CALENDAR', 'calendar'],
  ['crewcheck://wakeup?shareId=abc-123', 'wakeup'],
]) {
  const alvo = ios.parseCrewCheckDeepLink(raw);
  check(`deep link válido ${raw} resolve para ${esperado}`, alvo?.view === esperado, JSON.stringify(alvo));
}
{
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const entregue = host.__crewcheckIosBridge.openDeepLink('crewcheck://import');
  const evento = host.events.find((item) => item.type === 'crewcheck:set-view');
  check('deep link válido dispara a navegação interna existente',
    entregue === true && evento?.detail === 'import', JSON.stringify(host.events));
}

// ---------------------------------------------------------------------------
// 3. Deep link inválido falha com segurança — sem navegar, sem lançar.
// ---------------------------------------------------------------------------
for (const raw of [
  '', '   ', 'não é url', 'https://exemplo.test/import', 'javascript:alert(1)',
  'crewcheck://', 'crewcheck://admin', 'crewcheck://maintenance', 'crewcheck://../../etc/passwd',
  'file:///etc/passwd', 'crewcheck://import?shareId=' + 'x'.repeat(200),
  'crewcheck://import?shareId=../escape',
]) {
  check(`deep link recusado com segurança: ${JSON.stringify(raw)}`,
    ios.parseCrewCheckDeepLink(raw) === null, JSON.stringify(ios.parseCrewCheckDeepLink(raw)));
}
{
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const entregue = host.__crewcheckIosBridge.openDeepLink('crewcheck://admin');
  check('deep link inválido não navega e não lança',
    entregue === false && host.events.length === 0, JSON.stringify(host.events));
}
// `admin` e `maintenance` ficam fora da allowlist de propósito: são superfícies
// administrativas e não devem ser alcançáveis por link externo.
check('allowlist não expõe superfície administrativa',
  !ios.IOS_DEEP_LINK_VIEWS.includes('admin') && !ios.IOS_DEEP_LINK_VIEWS.includes('maintenance'));

// ---------------------------------------------------------------------------
// 4. PDF compartilhado chega ao adaptador e entra pelo contrato existente.
// ---------------------------------------------------------------------------
{
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const ok = host.__crewcheckIosBridge.receiveSharedPdf({
    sourceFileName: 'escala.pdf', shareId: 'inbox-1', dataBase64: pdfBase64(),
  });
  const evento = host.events.find((item) => item.type === 'crewcheck:native-pdf');
  check('PDF compartilhado é aceito pelo adaptador', ok === true);
  check('PDF entra pelo MESMO evento do Android/PWA, sem parser próprio',
    evento?.detail?.dataBase64 === pdfBase64() && evento?.detail?.sourceFileName === 'escala.pdf',
    JSON.stringify(evento?.detail && { ...evento.detail, dataBase64: '<omitido>' }));
  check('payload pendente fica disponível para quem montar depois',
    host.__crewcheckPendingNativePdf?.shareId === 'ios:inbox-1');
  check('nome sem extensão é normalizado para .pdf',
    ios.normalizeSharedPdfName('escala-agosto') === 'escala-agosto.pdf');
  check('nome com diretório é reduzido ao nome simples',
    ios.normalizeSharedPdfName('/var/mobile/tmp/../escala.pdf') === 'escala.pdf',
    ios.normalizeSharedPdfName('/var/mobile/tmp/../escala.pdf'));
}

// ---------------------------------------------------------------------------
// 5. Arquivo inválido é rejeitado antes do pipeline.
// ---------------------------------------------------------------------------
{
  const naoPdf = Buffer.from('PK zip disfarcado', 'binary').toString('base64');
  const casos = [
    ['vazio', { dataBase64: '' }, 'empty'],
    ['não é PDF', { dataBase64: naoPdf }, 'not_a_pdf'],
    ['base64 corrompido', { dataBase64: '@@@nao-e-base64@@@' }, 'undecodable'],
    // Pre-checagem: base64 cresce ~4/3, entao o limite estoura antes de alocar.
    ['acima do limite (pre-checagem)', { dataBase64: 'A'.repeat(Math.ceil((ios.IOS_SHARED_PDF_MAX_BYTES * 4) / 3) + 8) }, 'too_large'],
    // Caminho pos-decodificacao: PDF legitimo, porem grande demais.
    ['acima do limite (PDF real gigante)',
      { dataBase64: Buffer.concat([Buffer.from('%PDF-1.7\n', 'binary'), Buffer.alloc(ios.IOS_SHARED_PDF_MAX_BYTES + 16, 0x41)]).toString('base64') },
      'too_large'],
  ];
  for (const [rotulo, payload, motivo] of casos) {
    const r = ios.validateSharedPdf(payload);
    check(`arquivo inválido recusado (${rotulo}) com motivo ${motivo}`,
      r.ok === false && r.reason === motivo, JSON.stringify(r));
  }
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const ok = host.__crewcheckIosBridge.receiveSharedPdf({ dataBase64: naoPdf });
  check('arquivo inválido NÃO chega ao pipeline de importação',
    ok === false && !host.events.some((item) => item.type === 'crewcheck:native-pdf'),
    JSON.stringify(host.events.map((item) => item.type)));
  check('arquivo inválido produz erro visível pelo canal já existente',
    host.events.some((item) => item.type === 'crewcheck:pwa-share-error'));
  check('arquivo inválido não deixa payload pendente', !host.__crewcheckPendingNativePdf);
}

// ---------------------------------------------------------------------------
// 6. Estado de importação não duplica publicação.
// ---------------------------------------------------------------------------
{
  // O dedupe efetivo é do Home (`nativePdfClaimsRef`, injetado por v14.3.68) e é
  // indexado por `shareId`. O contrato do adaptador é: o MESMO arquivo produz
  // SEMPRE o mesmo `shareId`, senão o dedupe do Home não consegue agir.
  const payload = { sourceFileName: 'escala.pdf', dataBase64: pdfBase64() };
  const a = ios.validateSharedPdf(payload);
  const b = ios.validateSharedPdf({ ...payload });
  check('mesmo arquivo sem shareId próprio gera shareId estável (dedupe do Home funciona)',
    a.ok && b.ok && a.value.shareId === b.value.shareId, JSON.stringify([a.value?.shareId, b.value?.shareId]));

  const diferente = ios.validateSharedPdf({ sourceFileName: 'escala.pdf', dataBase64: pdfBase64('outro conteudo') });
  check('arquivo diferente gera shareId diferente',
    diferente.ok && diferente.value.shareId !== a.value.shareId);

  const comId = ios.validateSharedPdf({ ...payload, shareId: 'inbox-9' });
  check('shareId do nativo é prefixado por origem, sem colidir com Android/PWA',
    comId.ok && comId.value.shareId === 'ios:inbox-9');

  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  host.__crewcheckIosBridge.receiveSharedPdf({ ...payload, shareId: 'inbox-9' });
  host.__crewcheckIosBridge.receiveSharedPdf({ ...payload, shareId: 'inbox-9' });
  const ids = host.events.filter((item) => item.type === 'crewcheck:native-pdf').map((item) => item.detail.shareId);
  check('reenvio do mesmo item mantém a MESMA chave de dedupe',
    ids.length === 2 && ids[0] === ids[1] && ids[0] === 'ios:inbox-9', JSON.stringify(ids));

  check('confirmação de consumo é encaminhada ao nativo',
    host.CrewCheckNative.acknowledgeSharedPdf('ios:inbox-9') === true
    && host.posted.some((m) => m.name === 'acknowledgeSharedPdf'));
  check('confirmação sem id é recusada', host.CrewCheckNative.acknowledgeSharedPdf('') === false);
}

// ---------------------------------------------------------------------------
// 7. Permissões não concedidas não quebram o app.
// ---------------------------------------------------------------------------
{
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const n = host.CrewCheckNative;
  check('sem permissão concedida, requestNotifications devolve false (não simula concessão)',
    n.requestNotifications() === false);
  check('sem permissão concedida, requestLocation devolve false', n.requestLocation() === false);
  check('permissionStatus reflete ausência de permissão',
    n.permissionStatus().location === false && n.permissionStatus().notifications === false);
  check('o pedido chega ao nativo mesmo quando a resposta é negativa',
    host.posted.some((m) => m.name === 'requestNotifications')
    && host.posted.some((m) => m.name === 'requestLocation'));

  const concedido = makeWindow({ storage: {
    crewcheck_location_permission: 'granted', crewcheck_notifications_permission: 'granted',
  } });
  ios.installIosNativeRuntime(concedido);
  check('com permissão concedida, o status reflete a concessão real',
    concedido.CrewCheckNative.permissionStatus().location === true
    && concedido.CrewCheckNative.permissionStatus().notifications === true);

  // localStorage indisponível (modo privado / storage bloqueado) não pode lançar.
  const semStorage = makeWindow();
  delete semStorage.localStorage;
  ios.installIosNativeRuntime(semStorage);
  let threw = false;
  try { semStorage.CrewCheckNative.permissionStatus(); } catch { threw = true; }
  check('storage indisponível não derruba a consulta de permissões', !threw);
}

// ---------------------------------------------------------------------------
// 8. Ausência de push/background não bloqueia o uso normal.
// ---------------------------------------------------------------------------
{
  const host = makeWindow();
  ios.installIosNativeRuntime(host);
  const n = host.CrewCheckNative;
  check('background mode responde false no iOS (capacidade inexistente, não simulada)',
    n.requestBackgroundMode() === false);
  check('openPowerSettings responde false no iOS', n.openPowerSettings() === false);
  // `crewcheckPremiumRuntime` cai no caminho web quando recebe false; é assim que
  // a ausência de push deixa de ser bloqueio.
  check('a fachada continua utilizável depois de recusar capacidades',
    typeof n.openExternal === 'function' && typeof n.acknowledgeSharedPdf === 'function');

  check('openExternal aceita http(s)', n.openExternal('https://crewcheck.app') === true);
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'crewcheck://admin', '', 'tel:+5561999999999']) {
    check(`openExternal recusa esquema não-http: ${JSON.stringify(url)}`, n.openExternal(url) === false);
  }
}

// ---------------------------------------------------------------------------
// 9. Fronteira do #530 — o núcleo da escala não é tocado por esta frente.
// ---------------------------------------------------------------------------
{
  const fonte = readFileSync(new URL('../client/src/lib/iosNativeRuntime.ts', import.meta.url), 'utf8');
  // A checagem roda sobre o CODIGO, sem comentarios: os comentarios deste
  // runtime citam esses modulos justamente para declarar que NAO os tocam, e
  // uma busca por substring na prosa reprovaria a propria documentacao.
  const codigo = fonte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linha) => linha.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
  for (const proibido of ['aimsParser', 'canonicalRoster', 'complianceEngine', 'pdfParser', 'rosterNormalizer']) {
    check(`runtime iOS não importa nem referencia ${proibido} no código`,
      !codigo.includes(proibido), codigo.split('\n').filter((l) => l.includes(proibido)).join(' | '));
  }
  check('runtime iOS não tem import de módulo algum do núcleo da escala',
    !/^\s*import\s/m.test(codigo), codigo.split('\n').filter((l) => /^\s*import\s/.test(l)).join(' | '));
  check('runtime iOS não contém fallback APZ nem campo de apresentação',
    !/\bAPZ\b/i.test(codigo) && !codigo.includes('dutyReport') && !codigo.includes('presentationTime'));
  check('runtime iOS reutiliza o evento compartilhado em vez de criar outro',
    fonte.includes("'crewcheck:native-pdf'"));

  const main = readFileSync(new URL('../client/src/main.tsx', import.meta.url), 'utf8');
  check('runtime iOS carrega no bootstrap', main.includes("import './lib/iosNativeRuntime';"));
  check('runtimes já existentes seguem no bootstrap',
    main.includes("import './lib/pwaSharedPdfRuntime';")
    && main.includes("import './lib/crewcheckPremiumRuntime';"));
}

// ---------------------------------------------------------------------------
// 10. Segurança — nenhum segredo e nenhum dado sensível em log.
// ---------------------------------------------------------------------------
{
  const fonte = readFileSync(new URL('../client/src/lib/iosNativeRuntime.ts', import.meta.url), 'utf8');
  check('nenhum console.* no runtime iOS', !/console\.(log|info|warn|error|debug)/.test(fonte));
  check('nenhum segredo/credencial embutida',
    !/(api[_-]?key|secret|password|bearer\s+[A-Za-z0-9])/i.test(fonte));
  check('token de autenticação não é lido por este runtime',
    !fonte.includes('crewcheck_auth_token'));
}

// ---------------------------------------------------------------------------
// 11. Paridade de contrato entre o lado nativo e o lado web.
//
// O erro clássico desta fronteira é o Swift chamar um nome que o TypeScript não
// expõe: compila dos dois lados e falha só no dispositivo. As asserções abaixo
// são estáticas de propósito — não há Xcode aqui — e travam exatamente isso.
// ---------------------------------------------------------------------------
{
  const ler = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
  const bridge = ler('ios-wrapper/App/CrewCheckNativeBridge.swift');
  const inbox = ler('ios-wrapper/App/CrewCheckSharedInbox.swift');
  const share = ler('ios-wrapper/ShareExtension/ShareViewController.swift');
  const shareInfo = ler('ios-wrapper/ShareExtension/Info.plist');
  const appEnt = ler('ios-wrapper/App/CrewCheck.entitlements');
  const shareEnt = ler('ios-wrapper/ShareExtension/CrewCheckShare.entitlements');
  const infoAdds = ler('ios-wrapper/App/Info.plist.additions.plist');
  const push = ler('ios-wrapper/App/CrewCheckPushAdapter.swift');
  const runtime = ler('client/src/lib/iosNativeRuntime.ts');

  // Nomes que o Swift invoca precisam existir no runtime web.
  for (const nome of ['receiveSharedPdf', 'openDeepLink']) {
    check(`paridade: o Swift chama ${nome} e o runtime web o expõe`,
      bridge.includes(nome) && runtime.includes(nome));
  }
  for (const nome of ['openExternal', 'requestNotifications', 'requestLocation', 'acknowledgeSharedPdf']) {
    check(`paridade: mensagem "${nome}" tratada no Swift e emitida pelo web`,
      bridge.includes(`case "${nome}"`) || bridge.includes(`"${nome}"`));
  }
  check('paridade: o handler WKWebView tem o nome que o web procura',
    bridge.includes('crewcheckIos') && runtime.includes('crewcheckIos'));
  check('paridade: as chaves de permissão são as mesmas dos dois lados',
    bridge.includes('crewcheck_location_permission') && runtime.includes('crewcheck_location_permission')
    && bridge.includes('crewcheck_notifications_permission') && runtime.includes('crewcheck_notifications_permission'));

  // App Group: extensão e app precisam do MESMO identificador, senão a caixa de
  // entrada simplesmente não existe para um dos lados.
  const grupo = 'group.com.crewcheck.app';
  check('App Group idêntico em app, extensão e código',
    appEnt.includes(grupo) && shareEnt.includes(grupo) && inbox.includes(grupo));

  // Segurança do caminho: shareId vira nome de diretório.
  check('acknowledge valida o shareId como UUID antes de usá-lo como caminho',
    inbox.includes('UUID(uuidString: raw) != nil'));
  check('nome de arquivo compartilhado é sanitizado no lado nativo também',
    inbox.includes('lastPathComponent') && inbox.includes('hasSuffix(".pdf")'));
  check('o nativo recusa não-PDF antes de gravar', inbox.includes('%PDF-'));

  // Share Extension: só PDF, um por vez.
  check('Share Extension aceita apenas PDF',
    shareInfo.includes('com.adobe.pdf') && !/public\.image|public\.url|public\.text/.test(shareInfo));
  check('Share Extension não interpreta o arquivo (sem parser próprio)',
    !/aimsParser|canonicalRoster|parse/i.test(share.replace(/\/\/.*$/gm, '')));

  // Permissões mínimas.
  check('não pedimos localização "Always"', !infoAdds.includes('NSLocationAlwaysUsageDescription'));
  check('background limitado a push remoto',
    infoAdds.includes('remote-notification')
    && !/<string>fetch<\/string>|<string>location<\/string>/.test(infoAdds));
  check('esquema de deep link declarado', infoAdds.includes('<string>crewcheck</string>'));
  check('permissão de calendário é somente escrita',
    infoAdds.includes('NSCalendarsWriteOnlyAccessUsageDescription')
    && !infoAdds.includes('NSCalendarsFullAccessUsageDescription'));

  // Push é adaptador, não comportamento.
  check('push só registra quando a permissão já foi concedida',
    push.includes('authorizationStatus == .authorized'));
  check('push não agenda nem inventa notificação local',
    !/UNMutableNotificationContent|scheduleNotification|UNTimeIntervalNotificationTrigger/.test(push));

  // Nenhum segredo nas fontes nativas.
  for (const [nome, fonte] of [['bridge', bridge], ['inbox', inbox], ['share', share], ['push', push]]) {
    check(`sem segredo embutido em ${nome}`,
      !/(api[_-]?key|client[_-]?secret|password|Bearer [A-Za-z0-9])/i.test(fonte));
    check(`sem log de conteúdo em ${nome}`, !/print\(|NSLog\(/.test(fonte));
  }
}

harness.cleanup();
process.exit(checker.report());
