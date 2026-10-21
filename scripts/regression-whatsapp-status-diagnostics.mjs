import fs from 'node:fs';

function expect(condition, message) {
  if (!condition) throw new Error(`[WhatsApp diagnostics] ${message}`);
}

const mod = await import('../server/whatsapp.mjs');
expect(typeof mod.extractWhatsAppStatusDiagnostics === 'function', 'Helper de diagnóstico não foi exportado.');

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        statuses: [{
          id: 'wamid.SENSITIVE_MESSAGE_ID',
          recipient_id: '5561999999999',
          status: 'failed',
          timestamp: '1786021200',
          errors: [{
            code: 131026,
            title: 'Message undeliverable',
            message: 'Sensitive diagnostic body that must not be logged',
            error_data: { details: 'Sensitive details that must not be logged' },
          }],
        }],
      },
    }],
  }],
};

const diagnostics = mod.extractWhatsAppStatusDiagnostics(payload);
expect(diagnostics.length === 1, `Esperado 1 status; recebido ${diagnostics.length}.`);
expect(diagnostics[0].status === 'failed', 'Status failed não preservado.');
expect(diagnostics[0].errorCodes?.[0] === '131026', 'Código de erro não preservado.');
expect(diagnostics[0].errorTitles?.[0] === 'Message undeliverable', 'Título técnico não preservado.');

const serialized = JSON.stringify(diagnostics);
for (const secret of ['wamid.SENSITIVE_MESSAGE_ID', '5561999999999', 'Sensitive diagnostic body', 'Sensitive details']) {
  expect(!serialized.includes(secret), `Diagnóstico seguro vazou dado proibido: ${secret}`);
}

const server = fs.readFileSync('server/whatsapp.mjs', 'utf8');
expect(server.includes("[crewcheck:whatsapp:status]"), 'Log de status assíncrono não foi integrado.');
expect(server.includes("status: 'accepted', graphVersion: graphVersion(), messageIdReceived: Boolean(messageId)"), 'Aceite síncrono da Graph API não é registrado de forma segura.');
expect(!server.includes("recipient_id: status?.recipient_id"), 'Log não pode expor destinatário.');

console.log('[WhatsApp diagnostics] OK — status/código/título técnico visíveis sem telefone, message ID, conteúdo ou detalhes sensíveis.');

// Presence-only configuration is not evidence of provider routing or delivery.
const keys=['WHATSAPP_VERIFY_TOKEN','META_APP_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID'];
for(const name of keys)process.env[name]='synthetic-diagnostics-only';
const originalFetch=globalThis.fetch;let networkCalls=0;
globalThis.fetch=()=>{networkCalls++;throw Error('diagnostics must not send');};
try {
  let body='',status=0;
  const response={writeHead(code){status=code;},end(value){body+=value;}};
  await mod.handleWhatsAppRoute({method:'GET'},response,new URL('https://example.invalid/api/whatsapp/health'));
  const health=JSON.parse(body);
  expect(status===200&&health.inbound&&health.outbound,'Legacy configuration flags preserved.');
  expect(health.provider==='meta_cloud_api'&&health.configurationOnly===true,'Provider and configuration-only scope explicit.');
  expect(health.deliveryProof==='not_checked','No invented delivery proof.');
  expect(!/pronto|ready/i.test(health.message),'Presence cannot claim operational readiness.');
  expect(!body.includes('synthetic-diagnostics-only'),'No credential value exposed.');
  expect(networkCalls===0,'Health must not contact a provider.');
} finally {globalThis.fetch=originalFetch;for(const name of keys)delete process.env[name];}
console.log('PASS provider diagnostics: Meta configuration only, no Infobip readiness or delivery claim, no network/secret exposure');
