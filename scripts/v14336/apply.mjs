import fs from 'node:fs';

const VERSION = '14.3.36';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const preferencesSnippet = fs.readFileSync('scripts/v14336/server-preferences.snippet', 'utf8').trim();
const wrapperSnippet = fs.readFileSync('scripts/v14336/reply-wrapper.snippet', 'utf8').trim();
const voiceReplySnippet = fs.readFileSync('scripts/v14336/voice-reply.snippet', 'utf8').trim();
const askSnippet = fs.readFileSync('scripts/v14336/concierge-ask.snippet', 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14336] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14336] Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value.trimEnd()}`);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14336] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14336] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14336] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

update('server.mjs', (source) => {
  let next = source;
  const importAnchor = "} from './server/v14335/concierge-location.mjs';";
  const personalityImport = `import {
  normalizeConciergeMode as normalizeConciergeModeV14336,
  normalizeConciergeVoiceProfile as normalizeConciergeVoiceProfileV14336,
  normalizeConciergePreferences as normalizeConciergePreferencesV14336,
  publicConciergeVoiceCatalog as publicConciergeVoiceCatalogV14336,
  conciergeVoiceIdForPreferences as conciergeVoiceIdForPreferencesV14336,
  decorateConciergeReply as decorateConciergeReplyV14336,
} from './server/v14336/concierge-personality.mjs';`;
  next = insertAfterRequired(next, importAnchor, personalityImport, 'import de personalidade e voz');

  if (!next.includes('async function buildTelegramConciergeReplyCore(')) {
    next = replaceRequired(next, 'async function buildTelegramConciergeReply(text = \'\', profile = {}, snapshot = null) {', 'async function buildTelegramConciergeReplyCore(text = \'\', profile = {}, snapshot = null) {', 'renomear núcleo de respostas');
  }
  next = insertBeforeRequired(next, 'async function buildTelegramConciergeReplyCore(', preferencesSnippet, 'preferências do Concierge');
  next = insertBeforeRequired(next, 'async function buildTelegramConciergeReplyCore(', wrapperSnippet, 'wrapper de personalidade');
  next = replaceBlock(next, 'async function sendHumanTelegramVoiceReply(', 'async function sendTelegramVoiceBuffer(', voiceReplySnippet, 'voz selecionada nas respostas de áudio');
  next = replaceBlock(next, 'async function handleTelegramConciergeAsk(', 'function telegramMessagePdfDocument(', askSnippet, 'preferências no app');
  next = replaceRequired(next, 'const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript);', 'const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot);', 'voz escolhida no áudio recebido');
  next = next.replace('commandsRestored: true,', 'commandsRestored: true, conciergeModes: [\'formal\',\'comic\'], conciergeVoiceOptions: conciergeVoiceOptionsV14336(), safeHumor: true,');
  return next;
});

const clientSettingsHelpers = `async function fetchTelegramConciergeSettings() {
  const response = await fetch('/api/telegram/concierge/ask', { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  return payload || { voiceOptions: [{ id: 'default', label: 'Padrão do CrewCheck' }, { id: 'bruno', label: 'Bruno' }] };
}
async function saveTelegramConciergePreferences(preferences: { mode: 'formal' | 'comic'; voiceProfile: string }) {
  const response = await fetch('/api/telegram/concierge/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ ...telegramConciergeIdentity(), text: '/preferencias', preferences }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não consegui salvar as preferências do Concierge.');
  return payload;
}`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Concierge formal ou cômico leve, voz configurável e humor operacionalmente seguro';`);

  next = insertBeforeRequired(next, 'function Brand(', clientSettingsHelpers, 'cliente de preferências do Concierge');
  next = replaceRequired(
    next,
    "  const [busy, setBusy] = useState('');\n  const hasLocalRoster =",
    "  const [busy, setBusy] = useState('');\n  const [conciergeMode, setConciergeMode] = useState<'formal' | 'comic'>('formal');\n  const [voiceProfile, setVoiceProfile] = useState('default');\n  const [voiceOptions, setVoiceOptions] = useState<Array<{ id: string; label: string }>>([{ id: 'default', label: 'Padrão do CrewCheck' }, { id: 'bruno', label: 'Bruno' }]);\n  const hasLocalRoster =",
    'estados de estilo e voz',
  );
  next = replaceRequired(
    next,
    "      const [linkResponse, rosterPayload, diagnosticPayload] = await Promise.all([",
    "      const [linkResponse, rosterPayload, diagnosticPayload, settingsPayload] = await Promise.all([",
    'carregamento das opções de voz',
  );
  next = replaceRequired(
    next,
    "        admin ? fetch('/api/telegram/diagnostic', { cache: 'no-store' }).then((response) => response.json()).catch(() => null) : Promise.resolve(null),\n      ]);",
    "        admin ? fetch('/api/telegram/diagnostic', { cache: 'no-store' }).then((response) => response.json()).catch(() => null) : Promise.resolve(null),\n        fetchTelegramConciergeSettings(),\n      ]);",
    'consulta de configurações',
  );
  next = replaceRequired(
    next,
    "      setTelegramDiagnostic(diagnosticPayload);",
    "      setTelegramDiagnostic(diagnosticPayload);\n      const preferences = rosterPayload?.snapshot?.preferences || {};\n      setConciergeMode(preferences.mode === 'comic' || preferences.personalityMode === 'comic' ? 'comic' : 'formal');\n      setVoiceProfile(String(preferences.voiceProfile || 'default'));\n      if (Array.isArray(settingsPayload?.voiceOptions) && settingsPayload.voiceOptions.length) setVoiceOptions(settingsPayload.voiceOptions);",
    'restaurar preferências',
  );
  const saveFunction = `  async function saveConciergeStyle(nextMode = conciergeMode, nextVoice = voiceProfile) {
    setBusy('preferences');
    try {
      const payload = await saveTelegramConciergePreferences({ mode: nextMode, voiceProfile: nextVoice });
      const preferences = payload?.preferences || { mode: nextMode, voiceProfile: nextVoice };
      setConciergeMode(preferences.mode === 'comic' ? 'comic' : 'formal');
      setVoiceProfile(String(preferences.voiceProfile || 'default'));
      if (Array.isArray(payload?.voiceOptions) && payload.voiceOptions.length) setVoiceOptions(payload.voiceOptions);
      toast.success('Preferências do Concierge atualizadas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar as preferências.');
    } finally {
      setBusy('');
    }
  }
`;
  next = insertBeforeRequired(next, '  async function repairWebhook()', saveFunction, 'salvar estilo do Concierge');
  const settingsSection = `    <section className="cz-toolbox cc-concierge-preferences">
      <h2>Estilo e voz do Concierge</h2>
      <p>O modo cômico é impessoal e ocasional. Ele nunca altera aeroporto, voo, horário, portão, regulamentação, meteorologia ou orientação de segurança.</p>
      <div className="cz-tool-actions">
        <button className={conciergeMode === 'formal' ? 'primary' : ''} onClick={() => saveConciergeStyle('formal', voiceProfile)} disabled={Boolean(busy)}><ShieldCheck/> Formal (profissional)</button>
        <button className={conciergeMode === 'comic' ? 'primary' : ''} onClick={() => saveConciergeStyle('comic', voiceProfile)} disabled={Boolean(busy)}><MessageCircle/> Cômico leve (impessoal)</button>
      </div>
      <label><span>Voz das respostas em áudio</span><select className="cz-calendar-select" value={voiceProfile} onChange={(event) => { const nextVoice = event.target.value; setVoiceProfile(nextVoice); saveConciergeStyle(conciergeMode, nextVoice); }} disabled={Boolean(busy)}>{voiceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <p className="cz-mini-status">Texto recebido responde por texto. Áudio recebido responde por áudio quando a resposta for curta e operacional. A voz padrão continua sob controle do administrador.</p>
    </section>
`;
  next = insertBeforeRequired(next, '    {admin && <section className={`cz-toolbox cc-telegram-diagnostic', settingsSection, 'painel de estilo e voz');
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
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`));
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`));
update('client/public/release.json', () => JSON.stringify({ version: VERSION, build: VERSION_DIGITS, channel: 'web', updatePolicy: 'automatic', notes: 'Concierge com modo formal/cômico leve, voz selecionável e humor seguro com intervalo mínimo de 12 horas.' }, null, 2) + '\n', { optional: true });

console.log(`[v14336] Concierge com modo formal/cômico leve, voz configurável por catálogo seguro e frases ocasionais sem alterar dados operacionais. Versão ${VERSION}.`);
