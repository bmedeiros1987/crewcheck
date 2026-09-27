import fs from 'node:fs';

const HOME = 'client/src/pages/Home.tsx';
const MARKER = 'P1_546_PULSE_ACTIVE_ROSTER_FINALIZER';

if (!fs.existsSync(HOME)) throw new Error('[p1-546-live] Home.tsx ausente no finalizador.');
let source = fs.readFileSync(HOME, 'utf8');

if (!source.includes(MARKER)) {
  const anchor = "        setBundle({ roster: active.roster, compliance, source: 'Escala ativa sincronizada' });";
  if (!source.includes(anchor)) throw new Error('[p1-546-live] setBundle da escala ativa final não localizado.');
  const pulse = [
    anchor,
    `        // ${MARKER}: apresentação apenas; a reconciliação canônica continua autoritativa.`,
    '        publishCrewCheckNotice({',
    '          id: `active-roster:${serverRevision}`,',
    '          dedupeKey: `active-roster:${serverRevision}`,',
    "          tone: 'informativo',",
    "          priority: 'baixa',",
    "          title: 'Escala sincronizada',",
    "          detail: 'A escala ativa da sua conta foi atualizada neste aparelho.',",
    '          autoDismissMs: 6_500,',
    "          systemNotification: 'never',",
    "          action: { label: 'Ver escala', view: 'roster' },",
    '        });',
  ].join('\n');
  source = source.replace(anchor, pulse);
}

if (!source.includes(MARKER)) throw new Error('[p1-546-live] finalizador não conseguiu instalar Pulse da escala ativa.');
fs.writeFileSync(HOME, source, 'utf8');
console.log('[p1-546-live] escala ativa reconciliada alimenta o Pulse sem alterar a fonte canônica.');
