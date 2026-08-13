import fs from 'node:fs';

const VERSION = '14.3.82';
const VERSION_CODE = 140382;

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
  let next = source;
  const whatsappImportPresent = /import\s*\{[^}]*\bhandleWhatsAppRoute\b[^}]*\}\s*from\s*['"]\.\/server\/whatsapp\.mjs['"];?/.test(next);
  if (!whatsappImportPresent) {
    next = insertAfter(
      next,
      "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';",
      "import { handleWhatsAppRoute } from './server/whatsapp.mjs';",
      'import do WhatsApp',
    );
  }
  next = insertBefore(
    next,
    '  if (await handleV139Route(req, res, url)) return;',
    '  if (await handleWhatsAppRoute(req, res, url)) return;',
    'rota pública do WhatsApp antes das rotas autenticadas',
  );
  if (!next.includes('handleWhatsAppRoute(req, res, url)')) {
    throw new Error('[v14382] Roteamento oficial do WhatsApp não ficou acessível.');
  }
  return next.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`);
});

const whatsappSource = fs.readFileSync('server/whatsapp.mjs', 'utf8');
if (!whatsappSource.includes("url.pathname !== '/api/whatsapp/webhook'")) {
  throw new Error('[v14382] Endpoint /api/whatsapp/webhook ausente no handler oficial.');
}

// A preparação terminal precisa preservar a correlação mínima do MailerSend.
// Writers posteriores ao v14.2.1 reconstroem delivery.mjs; por isso reaplicamos aqui
// apenas os dois headers seguros necessários para ligar o 202 aos webhooks posteriores.
update('server/v139/delivery.mjs', (source) => {
  const oldResponse = `    const raw = await response.text().catch(() => '');\n    return { ok: response.ok, status: response.status, raw };`;
  const newResponse = `    const raw = await response.text().catch(() => '');\n    const messageId = cleanText(response.headers.get('x-message-id') || '', 180);\n    const sendPaused = /^true$/i.test(String(response.headers.get('x-send-paused') || '').trim());\n    const accepted = response.ok;\n    return {\n      ok: accepted && !sendPaused,\n      accepted,\n      status: response.status,\n      raw: sendPaused && !raw\n        ? 'O provedor aceitou a solicitação, mas pausou o envio (x-send-paused=true).'\n        : raw,\n      messageId,\n      sendPaused,\n    };`;
  if (source.includes(oldResponse)) return source.replace(oldResponse, newResponse);
  if (!source.includes("response.headers.get('x-message-id')") || !source.includes("response.headers.get('x-send-paused')")) {
    throw new Error('[v14382] Correlação segura do MailerSend não pôde ser aplicada.');
  }
  return source;
});

// A cadeia Android executa todos os patches antes de derivar versionCode/versionName.
// v14.3.81 é um writer de release anterior; v14.3.82 deve deixar o valor final
// monotônico para que o Play não reutilize o código já emitido pelo artefato anterior.
update('client/public/release.json', (source) => {
  const release = JSON.parse(source);
  release.version = VERSION;
  return `${JSON.stringify(release, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`));
update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`));
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('server/platform.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`));

console.log(`[v14382] CrewCheck ${VERSION} (${VERSION_CODE}): webhook oficial preparado, correlação MailerSend preservada e release Android/Play alinhada.`);
