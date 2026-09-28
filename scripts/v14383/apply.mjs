import fs from 'node:fs';

const VERSION = '14.3.83';

function update(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14383] Arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

if (!fs.existsSync('server/whatsapp.mjs')) throw new Error('[v14383] Handler oficial do WhatsApp ausente.');

update('server.mjs', (source) => {
  let next = source;
  const oldImport = "import { handleWhatsAppRoute } from './server/whatsapp.mjs';";
  const newImport = "import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';";
  if (next.includes(oldImport)) next = next.replace(oldImport, newImport);
  if (!next.includes(newImport)) throw new Error('[v14383] Import do WhatsApp não localizado após v14.3.82.');

  const marker = 'http.createServer(async (req, res) => {';
  const binding = `configureWhatsAppConcierge(async ({ email, text }) => {\n  const profile = { email: String(email || '').trim().toLowerCase(), name: '', linked: true, channel: 'whatsapp' };\n  const snapshot = await conciergeLoadSnapshot(profile);\n  profile.name = snapshot?.name || 'Tripulante';\n  return buildTelegramConciergeReply(String(text || ''), profile, snapshot);\n});\n`;
  if (!next.includes('configureWhatsAppConcierge(async ({ email, text }) => {')) {
    if (!next.includes(marker)) throw new Error('[v14383] Servidor HTTP não localizado para configurar Concierge WhatsApp.');
    next = next.replace(marker, `${binding}\n${marker}`);
  }
  return next;
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  if (!next.includes('async function openWhatsAppBinding()')) {
    const marker = 'async function openTelegramBinding() {';
    if (!next.includes(marker)) throw new Error('[v14383] Fluxo de vínculo Telegram não localizado.');
    const functionSource = `async function openWhatsAppBinding() {\n  try {\n    const result = await authFetch<{ ok: boolean; code: string; expiresInMinutes: number; openUrl?: string; message?: string }>('/api/whatsapp/link/start', {\n      method: 'POST',\n      body: JSON.stringify({ consentConcierge: true }),\n    });\n    if (!result?.code) throw new Error('Não consegui gerar o código de vínculo.');\n    if (result.openUrl) window.open(result.openUrl, '_blank', 'noopener,noreferrer');\n    else {\n      try { await navigator.clipboard.writeText(result.code); } catch {}\n    }\n    toast.success(\`Código de vínculo WhatsApp: \${result.code}. Válido por \${result.expiresInMinutes || 10} minutos.\`);\n  } catch (error) {\n    toast.error(error instanceof Error ? error.message : 'Não consegui iniciar o vínculo do WhatsApp.');\n  }\n}\n\n`;
    next = next.replace(marker, `${functionSource}${marker}`);
  }

  const telegramButton = '<button onClick={openTelegramBinding}><Send/> Vincular Telegram</button>';
  const whatsappButton = '<button onClick={openWhatsAppBinding}><Send/> Vincular WhatsApp</button>';
  if (!next.includes(whatsappButton)) {
    if (!next.includes(telegramButton)) throw new Error('[v14383] Botão de vínculo Telegram não localizado.');
    next = next.replace(telegramButton, `${telegramButton}${whatsappButton}`);
  }
  return next;
});

const serverSource = fs.readFileSync('server.mjs', 'utf8');
if (!serverSource.includes('configureWhatsAppConcierge(async ({ email, text }) => {')) throw new Error('[v14383] Concierge WhatsApp não foi conectado ao motor compartilhado.');
const homeSource = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
if (!homeSource.includes('Vincular WhatsApp')) throw new Error('[v14383] Ação de vínculo WhatsApp não ficou visível no cliente.');

console.log(`[v14383] CrewCheck ${VERSION}: vínculo seguro + Concierge textual oficial do WhatsApp preparados.`);
