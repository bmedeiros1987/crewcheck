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

console.log('OK: P0 #333 MailerSend webhook privacy regression');
