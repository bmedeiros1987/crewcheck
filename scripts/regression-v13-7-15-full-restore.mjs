import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('client/src/pages/Home.tsx');
const css = read('client/src/index.css');
const server = read('server.mjs');
const email = read('client/src/lib/emailClient.ts');
const pdf = read('client/src/lib/pdfExport.ts');
const dashboard = read('client/src/components/premium/Dashboard.tsx');
const render = read('render.yaml');
const pkg = JSON.parse(read('package.json'));

function assert(condition, message) {
  if (!condition) throw new Error(`[v13.7.15] ${message}`);
}

assert(pkg.version === '13.7.15', 'versão do pacote incorreta');
assert(home.includes("const visibleAlertCount ="), 'contador visível de alertas não foi definido');
assert(home.includes("alertSignature={complianceAlertSignature(compliance)}"), 'alertas novos não usam assinatura real');
assert(!dashboard.includes("alertsCount || 3") && !dashboard.includes(">3</b>"), 'dashboard ainda contém 3 alertas fictícios');
assert(home.includes('images.kiwi.com/airlines/64/') && !home.includes('<strong>LATAM</strong>'), 'logos reais/dinâmicos de companhias não estão ativos');
assert(home.includes("saveRadarSnapshot(event") && home.includes("Radar sincronizado"), 'radar não exporta portão/status ao card');
assert((home.match(/Rota inteligente/g) || []).length === 1, 'Rota inteligente deve existir uma única vez');
assert(home.includes("<MapIcon/> Mapa do mês</button><button onClick={() => setView('exports')"), 'Mapa do mês não está dentro de Escala');
assert(home.includes('Compartilhar PDF') && home.includes('Enviar por e-mail'), 'Mapa do mês não está compartilhável');
assert(home.includes("testAlarm('telegram-call')") && home.includes('Teste de ligação do admin'), 'testes de ligação não foram restaurados');
assert(home.includes("return authFetch<any>(url"), 'teste do despertador não está autenticado');
assert(!home.includes('mailto:'), 'envio por e-mail ainda usa aplicativo externo');
assert(email.includes('contentBase64') && email.includes("mimeType: 'application/pdf'"), 'cliente não envia PDF anexado');
assert(server.includes("url.pathname === '/api/email/share'") && server.includes('api.mailersend.com/v1/email'), 'backend de e-mail interno ausente');
assert(server.includes("attachments: [{ filename: fileName, content: contentBase64"), 'MailerSend não recebe o PDF');
assert(server.includes('api.callmebot.com/start.php') && server.includes('telegramLinkedUsernameForEmail'), 'ligação via Telegram não está operacional');
assert(server.includes("if (wantsPhoneCall && !identity.admin)"), 'teste telefônico admin não está protegido');
assert(pdf.includes('const url = URL.createObjectURL(blob);') && !pdf.includes('const url = triggerBlobDownload(blob, fileName);'), 'exportação PDF dispara download duplicado');
assert(render.includes('MAILERSEND_API_KEY') && render.includes('CALLMEBOT_TELEGRAM_CALL_ENABLED'), 'blueprint não contém integrações restauradas');
assert(css.includes('CrewCheck v13.7.15 — Visual') && css.includes('.cz-brand-row{position:static!important'), 'cabeçalho/layout final não foi aplicado');
assert(css.includes('--cc1515-light-title:#071829') && css.includes('--cc1515-dark-title:#ffffff'), 'contraste claro/escuro incompleto');
console.log('CrewCheck v13.7.15 full restore regression OK');
