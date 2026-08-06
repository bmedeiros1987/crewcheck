import fs from 'node:fs';

const VERSION = '14.3.87c';
const file = 'server/whatsapp.mjs';
if (!fs.existsSync(file)) throw new Error('[v14387c] server/whatsapp.mjs ausente.');
let source = fs.readFileSync(file, 'utf8');

const inboundAnchor = 'export function extractWhatsAppInboundMessages(payload = {}) {';
const diagnosticHelper = `export function extractWhatsAppStatusDiagnostics(payload = {}) {\n  const diagnostics = [];\n  const entries = Array.isArray(payload?.entry) ? payload.entry : [];\n  for (const entry of entries) {\n    const changes = Array.isArray(entry?.changes) ? entry.changes : [];\n    for (const change of changes) {\n      if (String(change?.field || '') !== 'messages') continue;\n      const value = change?.value || {};\n      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {\n        const state = String(status?.status || 'unknown').trim().slice(0, 32);\n        const errors = Array.isArray(status?.errors) ? status.errors : [];\n        const errorCodes = [...new Set(errors.map((error) => String(error?.code || '').trim()).filter(Boolean))].slice(0, 6);\n        const errorTitles = [...new Set(errors.map((error) => String(error?.title || '').trim().slice(0, 120)).filter(Boolean))].slice(0, 6);\n        diagnostics.push({ status: state, errorCodes, errorTitles });\n      }\n    }\n  }\n  return diagnostics;\n}\n\n`;
if (!source.includes('export function extractWhatsAppStatusDiagnostics(payload = {})')) {
  if (!source.includes(inboundAnchor)) throw new Error('[v14387c] âncora de inbound não encontrada.');
  source = source.replace(inboundAnchor, `${diagnosticHelper}${inboundAnchor}`);
}

const processAnchor = `  const events = extractWhatsAppEvents(payload, rawBody);\n  const inbound = extractWhatsAppInboundMessages(payload);`;
const processReplacement = `  const events = extractWhatsAppEvents(payload, rawBody);\n  const inbound = extractWhatsAppInboundMessages(payload);\n  const statusDiagnostics = extractWhatsAppStatusDiagnostics(payload);\n  for (const diagnostic of statusDiagnostics) {\n    const safe = JSON.stringify(diagnostic);\n    if (diagnostic.status === 'failed') console.warn('[crewcheck:whatsapp:status]', safe);\n    else console.info('[crewcheck:whatsapp:status]', safe);\n  }`;
if (!source.includes('const statusDiagnostics = extractWhatsAppStatusDiagnostics(payload);')) {
  if (!source.includes(processAnchor)) throw new Error('[v14387c] âncora de processamento não encontrada.');
  source = source.replace(processAnchor, processReplacement);
}

const sendAnchor = `    const messageId = String(result?.messages?.[0]?.id || '');\n    return { ok: true, messageId };`;
const sendReplacement = `    const messageId = String(result?.messages?.[0]?.id || '');\n    console.info('[crewcheck:whatsapp:send]', JSON.stringify({ status: 'accepted', graphVersion: graphVersion(), messageIdReceived: Boolean(messageId) }));\n    return { ok: true, messageId };`;
if (!source.includes("status: 'accepted', graphVersion: graphVersion()")) {
  if (!source.includes(sendAnchor)) throw new Error('[v14387c] âncora de envio aceito não encontrada.');
  source = source.replace(sendAnchor, sendReplacement);
}

for (const required of [
  'export function extractWhatsAppStatusDiagnostics(payload = {})',
  "[crewcheck:whatsapp:status]",
  "status: 'accepted', graphVersion: graphVersion()",
]) {
  if (!source.includes(required)) throw new Error(`[v14387c] contrato não aplicado: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387c] CrewCheck ${VERSION}: logs seguros de aceite e status assíncrono do WhatsApp ativados.`);
