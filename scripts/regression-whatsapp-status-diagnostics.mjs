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
