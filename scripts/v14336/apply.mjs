import fs from 'node:fs';

const VERSION = '14.3.36';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14336] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14336] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14336] Ponto ausente: ${label}`);
  return source.replace(before, after);
}

const helpers = `const CONCIERGE_PERSONALITY_MODES = new Set(['formal', 'comic']);
const CONCIERGE_VOICE_PROFILES = new Set(['default', 'bruno', 'daniel']);
function conciergePersonality(snapshot = null) {
  const mode = String(snapshot?.preferences?.conciergePersonality || 'formal').trim().toLowerCase();
  return CONCIERGE_PERSONALITY_MODES.has(mode) ? mode : 'formal';
}
function conciergeVoiceProfile(snapshot = null) {
  const profile = String(snapshot?.preferences?.conciergeVoiceProfile || 'default').trim().toLowerCase();
  return CONCIERGE_VOICE_PROFILES.has(profile) ? profile : 'default';
}
function conciergeComicAlias(airport = '') {
  const code = String(airport || '').trim().toUpperCase();
  const aliases = { MAB: 'Marabalas', IMP: 'Imperatrevas', CNF: 'Conflitos' };
  return aliases[code] || '';
}
function conciergeDeterministicPick(seed = '', values = []) {
  if (!values.length) return '';
  const hash = String(seed || '').split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  return values[hash % values.length] || '';
}
function conciergeComicLine(snapshot = null, record = null) {
  if (conciergePersonality(snapshot) !== 'comic' || !record) return '';
  const destination = String(record.legs?.at(-1)?.destination || record.day?.destination || '').trim().toUpperCase();
  if (!destination) return '';
  const alias = conciergeComicAlias(destination);
  const seed = `${conciergeRecordDateKey(record)}:${destination}:${record.legs?.[0]?.flightNumber || record.code || ''}`;
  const options = [
    alias ? `${destination}, também conhecido por aqui como ${alias}.` : '',
    `De novo para ${destination}? Aproveita para atualizar o porta-retrato.`,
    `Destino ${destination} confirmado. O resto é com a mala e a dignidade.`,
  ].filter(Boolean);
  return conciergeDeterministicPick(seed, options);
}
function conciergeApplyPersonality(reply = '', snapshot = null, record = null) {
  const text = String(reply || '').trim();
  if (!text || conciergePersonality(snapshot) !== 'comic') return text;
  const joke = conciergeComicLine(snapshot, record);
  return joke ? `${text}\n\n${joke}` : text;
}
async function conciergePreferencesReply(text, profile, snapshot) {
  const lower = String(text || '').toLowerCase();
  const personalityMatch = lower.match(/(?:modo|personalidade)\s+(formal|c[oô]mic[oa])/i);
  const voiceMatch = lower.match(/(?:voz)\s+(padr[aã]o|default|bruno|daniel)/i);
  const updates = {};
  if (personalityMatch) updates.conciergePersonality = /c[oô]mic/i.test(personalityMatch[1]) ? 'comic' : 'formal';
  if (voiceMatch) updates.conciergeVoiceProfile = /padr[aã]o|default/i.test(voiceMatch[1]) ? 'default' : voiceMatch[1].toLowerCase();
  if (updates.conciergeVoiceProfile === 'daniel' && String(process.env.CREWCHECK_ALLOW_DANIEL_VOICE || 'false').toLowerCase() !== 'true') {
    return 'A voz Daniel não está liberada pelo administrador. Mantive a voz padrão do CrewCheck.';
  }
  if (Object.keys(updates).length) {
    await conciergeSaveSnapshotAsync(profile, null, { preferences: updates });
    snapshot = { ...(snapshot || {}), preferences: { ...(snapshot?.preferences || {}), ...updates } };
  }
  const mode = conciergePersonality(snapshot);
  const voice = conciergeVoiceProfile(snapshot);
  return [
    'Preferências do Concierge',
    `Modo: ${mode === 'comic' ? 'cômico impessoal' : 'formal profissional'}`,
    `Voz: ${voice === 'default' ? 'padrão do administrador' : voice}`,
    '',
    'Comandos: /modo formal · /modo comico · /voz padrao · /voz bruno' + (String(process.env.CREWCHECK_ALLOW_DANIEL_VOICE || 'false').toLowerCase() === 'true' ? ' · /voz daniel' : ''),
    'O humor nunca altera voo, aeroporto, horário, regulamentação ou orientação de segurança.',
  ].join('\n');
}`;

update('server.mjs', (source) => {
  let next = insertBeforeRequired(source, 'async function buildTelegramConciergeReply(', helpers, 'preferências do Concierge');
  next = replaceRequired(
    next,
    "  if (!value || /^\\/(?:start|ajuda|help|comandos)(?:@\\S+)?$/i.test(value) || /^(ajuda|comandos)$/i.test(value)) return conciergeHelp(profile.name);",
    "  if (!value || /^\\/(?:start|ajuda|help|comandos)(?:@\\S+)?$/i.test(value) || /^(ajuda|comandos)$/i.test(value)) return conciergeHelp(profile.name);\n  if (/^\\/(?:modo|personalidade|voz)(?:@\\S+)?\\b/i.test(value) || /\\b(?:modo|personalidade)\\s+(?:formal|c[oô]mic[oa])\\b/i.test(lower) || /\\bvoz\\s+(?:padr[aã]o|default|bruno|daniel)\\b/i.test(lower)) return conciergePreferencesReply(value, profile, snapshot);",
    'despacho de preferências',
  );
  next = next.replace(
    "  const next = conciergeNextProgram(roster);\n  return next ? `Próxima programação\\n\\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada na escala ativa.';",
    "  const next = conciergeNextProgram(roster);\n  return next ? conciergeApplyPersonality(`Próxima programação\\n\\n${conciergeFormatProgram(next)}`, snapshot, next) : 'Nenhuma programação futura detectada na escala ativa.';",
  );
  next = next.replace(
    "    return [`${mode === 'today' ? 'Hoje' : 'Amanhã'}:`, '', ...found.map((record) => conciergeFormatProgram(record))].join('\\n\\n');",
    "    return conciergeApplyPersonality([`${mode === 'today' ? 'Hoje' : 'Amanhã'}:`, '', ...found.map((record) => conciergeFormatProgram(record))].join('\\n\\n'), snapshot, found[0]);",
  );
  next = next.replace(
    "    return [`Escala ativa · ${String(roster.month || '').padStart(2, '0')}/${roster.year || ''}`, `${roster.crewName || 'Tripulante'} · Base ${roster.base || '—'}`, `${stats.days} dias · ${stats.flights} voos · ${stats.programs} programações`, '', next ? `Próxima:\\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada.'].join('\\n');",
    "    return conciergeApplyPersonality([`Escala ativa · ${String(roster.month || '').padStart(2, '0')}/${roster.year || ''}`, `${roster.crewName || 'Tripulante'} · Base ${roster.base || '—'}`, `${stats.days} dias · ${stats.flights} voos · ${stats.programs} programações`, '', next ? `Próxima:\\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada.'].join('\\n'), snapshot, next);",
  );
  next = next.replace(
    "  return lines.join('\\n');\n}\nasync function conciergeWeatherReply",
    "  return conciergeApplyPersonality(lines.join('\\n'), snapshot, info?.record);\n}\nasync function conciergeWeatherReply",
  );
  next = next.replace(
    "async function sendHumanTelegramVoiceReply(chatId, reply, transcript = '') {",
    "async function sendHumanTelegramVoiceReply(chatId, reply, transcript = '', snapshot = null) {",
  );
  next = next.replace(
    "  const audio = await sendTelegramTtsAudio(chatId, reply, { caption: telegramShouldEchoTranscript() ? String(reply || '').slice(0, 900) : '' });",
    "  const audio = await sendTelegramTtsAudio(chatId, reply, { voiceProfile: conciergeVoiceProfile(snapshot), caption: telegramShouldEchoTranscript() ? String(reply || '').slice(0, 900) : '' });",
  );
  next = next.replace(
    "    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript);",
    "    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot);",
  );
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge formal/cômico e voz configurável com segurança operacional';`));
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
update('client/public/release.json', () => `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Concierge com modo formal/cômico e voz configurável, sem alterar dados operacionais.' }, null, 2)}\n`, { optional: true });

console.log(`[v14336] Concierge ${VERSION}: modo formal/cômico, voz configurável e humor seguro por destino.`);
