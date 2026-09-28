import fs from 'node:fs';

const source = fs.readFileSync('server/v1412/mailersendWebhook.mjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(source.includes("recipientIdentity"), 'destinatário é pseudonimizado antes da persistência');
assert(source.includes("createHash('sha256')"), 'hash SHA-256 é usado para identidade do destinatário');
assert(source.includes('recipientDomain'), 'somente domínio é preservado para diagnóstico operacional');
assert(source.includes('sanitizedDeliverySnapshot'), 'payload persistido é reduzido a snapshot sanitizado');
assert(!source.includes('JSON.stringify(body),'), 'payload bruto do webhook não é persistido');
assert(!/const\s+subject\s*=\s*safeString\(data\?\.subject/.test(source), 'assunto do e-mail não é extraído para persistência');
assert(/\[type, eventId, messageId, emailId, recipient\.stored, null, JSON\.stringify\(snapshot\)/.test(source), 'subject fica nulo e recipient persistido é pseudonimizado');
assert(source.includes('[crewcheck:email:delivery]'), 'diagnóstico sanitizado de entrega está presente');
assert(!source.includes("console.info('[crewcheck:email:delivery]', JSON.stringify(body"), 'log não despeja payload bruto');
assert(source.includes('function readRawJsonBody'), 'webhook preserva o corpo bruto recebido para validar assinatura');
assert(source.includes('({ body, rawBody } = await readRawJsonBody(req'), 'handler usa parser que retorna JSON e raw body juntos');
assert(source.includes("createHmac('sha256', secret).update(rawBody)"), 'HMAC é calculado sobre o raw body exato');
assert(source.includes("Buffer.from(supplied, 'hex')") && source.includes("Buffer.from(expected, 'hex')"), 'assinaturas hexadecimais são comparadas em tempo constante');
assert(!source.includes('const rawBody = JSON.stringify(body || {})'), 'assinatura não é mais validada contra JSON reconstruído');
assert(source.includes("const secret = webhookSecret();") && source.includes("if (!secret) {"), 'POST falha fechado quando o signing secret não está configurado');
assert(source.includes("code: 'WEBHOOK_NOT_CONFIGURED'") && source.includes('503'), 'configuração ausente retorna diagnóstico sanitizado sem aceitar evento');
assert(!source.includes("if (!secret) return true"), 'ausência de secret nunca aprova assinatura');

console.log('OK: P0 #333 MailerSend webhook privacy + fail-closed signature regression');
