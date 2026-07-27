import fs from 'node:fs';

const VERSION = '14.3.41';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const wrapperSnippet = fs.readFileSync('scripts/v14338/reply-wrapper.snippet', 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14341] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}
function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14341] Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value.trimEnd()}`);
}
function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14341] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

update('server.mjs', (source) => {
  let next = source;
  const importAnchor = "} from './server/v14336/concierge-personality.mjs';";
  const semanticImport = `import {
  normalizeConciergeNaturalTextV14341 as normalizeConciergeNaturalTextV14338,
  interpretConciergeNaturalTextV14341 as interpretConciergeNaturalTextV14338,
  buildConciergeContextV14341 as buildConciergeContextV14338,
  isConciergeContextFreshV14341 as isConciergeContextFreshV14338,
} from './server/v14341/concierge-semantic.mjs';`;
  next = insertAfterRequired(next, importAnchor, semanticImport, 'import do interpretador semântico');
  next = replaceBlock(next, 'async function buildTelegramConciergeReply(', 'async function buildTelegramConciergeReplyCore(', wrapperSnippet, 'wrapper contextual do Concierge');
  next = next.replace(
    "    modes: [{ id: 'formal', label: 'Formal (profissional)' }, { id: 'comic', label: 'Cômico leve (impessoal)' }],\n    message: 'Concierge pronto.',",
    "    modes: [{ id: 'formal', label: 'Formal (profissional)' }, { id: 'comic', label: 'Cômico leve (impessoal)' }],\n    naturalLanguage: true,\n    shortContext: true,\n    contextTtlHours: 6,\n    message: 'Concierge pronto para perguntas naturais com contexto curto.',",
  );
  next = next.replace("    message: 'Resposta operacional gerada.',", "    message: 'Resposta operacional contextual gerada.',");
  next = next.replace(
    "commandsRestored: true, conciergeModes: ['formal','comic'], conciergeVoiceOptions: conciergeVoiceOptionsV14336(), safeHumor: true,",
    "commandsRestored: true, conciergeModes: ['formal','comic'], conciergeVoiceOptions: conciergeVoiceOptionsV14336(), safeHumor: true, semanticConversation: true, semanticContextTtlHours: 6,",
  );
  if (!next.includes("from './server/v14341/concierge-semantic.mjs'") || !next.includes('conciergeSemanticScheduleDateReplyV14338') || !next.includes('semanticConversation: true')) {
    throw new Error('[v14341] Integração semântica incompleta no servidor.');
  }
  return next;
});

const semanticPanel = `    <section className="cz-toolbox cc-concierge-semantic" data-concierge-semantic="v14.3.41">
      <h2>Converse normalmente</h2>
      <p>Você não precisa decorar comandos. Pergunte como falaria com um colega: o Concierge identifica data, voo, aeroporto e assunto, mantendo somente um contexto operacional curto para entender continuações.</p>
      <div className="cz-routine-strip"><span>“O que tenho dia 15?”</span><span>“Que horas me apresento?”</span><span>“E o portão?”</span><span>“Depois desse voo?”</span><span>“Quando volto para a base?”</span></div>
      <p className="cz-mini-status">O contexto expira em até 6 horas e guarda apenas referências mínimas, como data, voo e aeroporto. O texto integral da conversa não é salvo nesse contexto.</p>
    </section>`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge semântico com perguntas naturais e contexto operacional curto';`);
  next = next.replace(
    '<section className="cz-panel-head"><h1>Concierge Telegram</h1><p>Envie sua escala em PDF ao bot, use os comandos antigos e consulte radar, portão, saída, meteorologia, hotéis, academias e rotina por texto ou voz.</p></section>',
    '<section className="cz-panel-head"><h1>Concierge CrewCheck</h1><p>Converse naturalmente sobre sua escala. O Concierge usa a programação ativa para responder sobre apresentação, voo, portão, saída, meteorologia, pernoite, retorno à base e rotina.</p></section>',
  );
  next = next.replace(
    '<KpiCard icon={Wifi} title="Comandos" value="Restaurados" detail="texto, voz e localização"/>',
    '<KpiCard icon={Wifi} title="Compreensão" value="Natural" detail="texto, voz, localização e contexto"/>',
  );
  if (!next.includes('data-concierge-semantic="v14.3.41"')) {
    const anchor = '    <section className="cz-toolbox cc-concierge-preferences">';
    if (!next.includes(anchor)) throw new Error('[v14341] Painel de preferências do Concierge não localizado.');
    next = next.replace(anchor, `${semanticPanel}\n${anchor}`);
  }
  next = next
    .replace('<h2>Prévia dos comandos</h2>', '<h2>Teste a conversa</h2>')
    .replace('Teste aqui a mesma resposta operacional que o bot usa. No Telegram, também funciona com perguntas naturais e mensagem de voz.', 'Faça uma pergunta completa ou use os botões apenas como atalhos. Perguntas relacionadas podem continuar com frases curtas, como “e o portão?” ou “e depois?”.')
    .replace('placeholder="Ex.: qual o portão do LA3730?"', 'placeholder="Ex.: o que tenho na próxima sexta? Depois pergunte: e que horas me apresento?"');
  if (!next.includes('Converse normalmente') || !next.includes('contexto expira em até 6 horas') || !next.includes('title="Compreensão" value="Natural"')) {
    throw new Error('[v14341] Interface semântica do Concierge incompleta.');
  }
  return next;
});

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, build: VERSION_DIGITS, channel: 'web', updatePolicy: 'automatic', notes: 'Concierge com linguagem natural, datas flexíveis, referências de voo e contexto operacional curto.' }, null, 2)}\n`, { optional: true });

console.log(`[v14341] CrewCheck ${VERSION}: Concierge semântico com linguagem natural, datas flexíveis, referências e contexto curto sem armazenar a conversa integral.`);
