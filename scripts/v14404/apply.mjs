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
  `import { buildInfobipTtsRequest, infobipConfiguration, infobipProviderErrorDetail, infobipPublicStatus } from './server/v1396/infobip.mjs';`,
  'import do diagnostico Infobip',
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

