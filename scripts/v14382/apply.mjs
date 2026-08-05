import fs from 'node:fs';

const VERSION = '14.3.82';

function update(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14382] Arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function insertAfter(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(marker)) throw new Error(`[v14382] Marcador não localizado: ${label}`);
  return source.replace(marker, `${marker}\n${addition}`);
}

function insertBefore(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(marker)) throw new Error(`[v14382] Marcador não localizado: ${label}`);
  return source.replace(marker, `${addition}\n${marker}`);
}

if (!fs.existsSync('server/whatsapp.mjs')) {
  throw new Error('[v14382] Handler oficial do WhatsApp ausente.');
}

update('server.mjs', (source) => {
  let next = insertAfter(
    source,
    "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';",
    "import { handleWhatsAppRoute } from './server/whatsapp.mjs';",
    'import do WhatsApp',
  );
  next = insertBefore(
    next,
    '  if (await handleV139Route(req, res, url)) return;',
    '  if (await handleWhatsAppRoute(req, res, url)) return;',
    'rota pública do WhatsApp antes das rotas autenticadas',
  );
  if (!next.includes('handleWhatsAppRoute(req, res, url)')) {
    throw new Error('[v14382] Roteamento oficial do WhatsApp não ficou acessível.');
  }
  return next;
});

const whatsappSource = fs.readFileSync('server/whatsapp.mjs', 'utf8');
if (!whatsappSource.includes("url.pathname !== '/api/whatsapp/webhook'")) {
  throw new Error('[v14382] Endpoint /api/whatsapp/webhook ausente no handler oficial.');
}

console.log(`[v14382] CrewCheck ${VERSION}: webhook oficial do WhatsApp Business preparado.`);
