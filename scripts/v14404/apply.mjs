import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14404] Ancora nao encontrada: ${label}`);
  return source.replace(before, after);
}

const path = 'server.mjs';
const before = fs.readFileSync(path, 'utf8');
let after = replaceOnce(
  before,
  `import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';`,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipConfiguration, infobipProviderErrorDetail, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './server/v1396/infobip.mjs';`,
  'import do diagnostico Infobip',
);
after = replaceOnce(
  after,
  `    usedConfiguredVoice = false;
  }
  let message = result.ok ? 'Ligação Premium iniciada pela Infobip.' : result.message || 'A Infobip não aceitou a ligação agora.';`,
  `    usedConfiguredVoice = false;
  }
  if (!result.ok && infobipRejectedUnsupportedLanguage(result.providerMessage)) {
    const fallbackRequest = buildInfobipEnglishFallbackRequest(request);
    result = await fetchVoiceProvider(fallbackRequest.url, {
      method: 'POST',
      headers: fallbackRequest.headers,
      body: JSON.stringify(fallbackRequest.body),
    }, 18_000);
    usedConfiguredVoice = false;
  }
  let message = result.ok ? 'Ligação Premium iniciada pela Infobip.' : result.message || 'A Infobip não aceitou a ligação agora.';`,
  'fallback de idioma aceito pela conta',
);
after = replaceOnce(
  after,
  `  else if (Number(result.status) === 400) message = 'A Infobip recusou o número de origem/destino, a voz ou o texto da chamada. Use números com DDI e confirme o remetente Voice.';`,
  `  else if (Number(result.status) === 400) {
    const detail = infobipProviderErrorDetail(result.providerMessage);
    message = \`A Infobip recusou a ligação.\${detail ? \` Motivo: \${detail}\` : ' Confirme o remetente Voice e os números com DDI.'}\`;
  }`,
  'motivo seguro do erro 400',
);
if (after !== before) fs.writeFileSync(path, after, 'utf8');

const fastAckPath = 'server/telegram-fast-ack.mjs';
const fastAckBefore = fs.readFileSync(fastAckPath, 'utf8');
let fastAckAfter = replaceOnce(
  fastAckBefore,
  `import { buildInfobipTtsRequest, infobipPublicStatus } from './v1396/infobip.mjs';`,
  `import { buildInfobipEnglishFallbackRequest, buildInfobipTtsRequest, infobipPublicStatus, infobipRejectedUnsupportedLanguage } from './v1396/infobip.mjs';`,
  'import do fallback no scheduler',
);
fastAckAfter = replaceOnce(
  fastAckAfter,
  `    const response = await fetch(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: controller.signal,
    });
    const raw = await response.text().catch(() => '');
    return { ok: response.ok, configured: true, provider: 'infobip', status: response.status, raw: raw.slice(0, 500) };`,
  `    let response = await fetch(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: controller.signal,
    });
    let raw = await response.text().catch(() => '');
    if (infobipRejectedUnsupportedLanguage(raw)) {
      const fallbackRequest = buildInfobipEnglishFallbackRequest(request);
      response = await fetch(fallbackRequest.url, {
        method: 'POST', headers: fallbackRequest.headers, body: JSON.stringify(fallbackRequest.body), signal: controller.signal,
      });
      raw = await response.text().catch(() => '');
    }
    const accepted = response.ok && !/\\"groupName\\"\\s*:\\s*\\"REJECTED\\"/i.test(raw);
    return { ok: accepted, configured: true, provider: 'infobip', status: response.status, raw: raw.slice(0, 500) };`,
  'fallback de idioma no despertador persistente',
);
if (fastAckAfter !== fastAckBefore) fs.writeFileSync(fastAckPath, fastAckAfter, 'utf8');
