import fs from 'node:fs';

const VERSION = '14.3.14';
function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) { if (optional) return; throw new Error(`[v14314] Arquivo ausente: ${path}`); }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('server/v1404/telegram-language.mjs', (source) => {
  let next = source;
  if (!next.includes('CREWCHECK_ACTIVITY_LABELS')) {
    next = next.replace("const DIGIT_WORDS =", `const CREWCHECK_AIRPORT_LABELS = Object.freeze({
  BSB:'Brasília', SBBR:'Brasília', GRU:'São Paulo — Guarulhos', SBGR:'São Paulo — Guarulhos', CGH:'São Paulo — Congonhas', SBSP:'São Paulo — Congonhas',
  CWB:'Curitiba', SBCT:'Curitiba', GIG:'Rio de Janeiro — Galeão', SBGL:'Rio de Janeiro — Galeão', SDU:'Rio de Janeiro — Santos Dumont', SBRJ:'Rio de Janeiro — Santos Dumont',
  SSA:'Salvador', SBSV:'Salvador', SLZ:'São Luís', SBSL:'São Luís', FOR:'Fortaleza', SBFZ:'Fortaleza', REC:'Recife', SBRF:'Recife', POA:'Porto Alegre', SBPA:'Porto Alegre',
  RAO:'Ribeirão Preto', SBRP:'Ribeirão Preto', PMW:'Palmas', SBPJ:'Palmas', VCP:'Campinas — Viracopos', SBKP:'Campinas — Viracopos', CNF:'Belo Horizonte — Confins', SBCF:'Belo Horizonte — Confins',
  MIA:'Miami', KMIA:'Miami', JFK:'Nova York — John F. Kennedy', KJFK:'Nova York — John F. Kennedy', LHR:'Londres — Heathrow', EGLL:'Londres — Heathrow',
  CDG:'Paris — Charles de Gaulle', LFPG:'Paris — Charles de Gaulle', MAD:'Madri — Barajas', LEMD:'Madri — Barajas', BCN:'Barcelona — El Prat', LEBL:'Barcelona — El Prat',
  LIS:'Lisboa', LPPT:'Lisboa', FCO:'Roma — Fiumicino', LIRF:'Roma — Fiumicino', FRA:'Frankfurt', EDDF:'Frankfurt', HND:'Tóquio — Haneda', RJTT:'Tóquio — Haneda', DXB:'Dubai', OMDB:'Dubai'
});

const CREWCHECK_ACTIVITY_LABELS = Object.freeze({
  DO:'folga', DOF:'folga regulamentar', DOP:'folga programada', OFF:'folga', ASB:'sobreaviso', HSB:'sobreaviso', HSBE:'sobreaviso especial',
  RES:'reserva operacional', RSV:'reserva operacional', MT:'reunião operacional', CRM:'treinamento de gerenciamento de recursos da tripulação',
  RCFI:'treinamento recorrente', EAD:'treinamento a distância', PS:'deslocamento como passageiro', EXTRA:'deslocamento como passageiro', DH:'deslocamento como passageiro',
  DEADHEAD:'deslocamento como passageiro', PERNOITE:'pernoite em hotel', HOTEL:'pernoite em hotel', VOO:'voo'
});

const CREWCHECK_HOUR_WORDS = ['meia-noite','uma hora','duas horas','três horas','quatro horas','cinco horas','seis horas','sete horas','oito horas','nove horas','dez horas','onze horas','meio-dia','treze horas','quatorze horas','quinze horas','dezesseis horas','dezessete horas','dezoito horas','dezenove horas','vinte horas','vinte e uma horas','vinte e duas horas','vinte e três horas'];

export function translatedAirportName(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  return CREWCHECK_AIRPORT_LABELS[normalized] || airportName(normalized) || normalized || 'local a confirmar';
}

export function translatedActivityLabel(code = '') {
  const normalized = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CREWCHECK_ACTIVITY_LABELS[normalized] || String(code || 'atividade').toLowerCase();
}

export function translateAviationText(value = '') {
  let text = String(value || '').replace(/\\b(?:EXTRA|PS|DEADHEAD|DH)\\b/gi, 'deslocamento como passageiro');
  return text.replace(/\\b(SB[A-Z]{2}|[A-Z]{3}|K[A-Z]{3}|L[A-Z]{3}|E[A-Z]{3}|O[A-Z]{3}|R[A-Z]{3})\\b/g, (code) => CREWCHECK_AIRPORT_LABELS[code] || code);
}

const DIGIT_WORDS =`);
  }
  next = next.replace(/export function spokenTime\(value = '', fallback = 'horário a confirmar'\) \{[\s\S]*?\n\}/, `export function spokenTime(value = '', fallback = 'horário a confirmar') {
  const match = String(value || '').match(/(?:T|\\s|^)(\\d{1,2}):(\\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23) return fallback;
  const hourText = CREWCHECK_HOUR_WORDS[hour];
  return minute ? hourText + ' e ' + minute + ' ' + (minute === 1 ? 'minuto' : 'minutos') : hourText;
}`);
  next = next.replace(/function shortAirportName\(code = ''\) \{[\s\S]*?\n\}/, `function shortAirportName(code = '') {
  return translatedAirportName(code);
}`);
  next = next.replace("const activity = String(record.code || 'atividade').toLowerCase();", "const activity = translatedActivityLabel(record.code || 'atividade');");
  next = next.replace('e a chave termina em', 'e a programação termina em');
  if (!next.includes('translatedAirportName') || !next.includes('translatedActivityLabel') || !next.includes('vinte e duas horas')) throw new Error('[v14314] Tradução aeronáutica incompleta.');
  return next;
});

update('server/v1403/premium-helpers.snippet', (source) => {
  if (source.includes('function conciergeFamilyReturnReply')) return source;
  const anchor = 'async function conciergeIdentityFlow';
  if (!source.includes(anchor)) throw new Error('[v14314] Âncora do Concierge ausente.');
  const block = `function conciergeFamilySubject(profile = {}, snapshot = {}) {
  const relation = String(snapshot?.visitor?.relationship || snapshot?.preferences?.visitorRelationship || profile?.relationship || '').toLowerCase();
  if (/esposa|companheira|mãe|filha/.test(relation)) return 'ela';
  if (/marido|companheiro|pai|filho/.test(relation)) return 'ele';
  return 'a pessoa';
}

function conciergeFamilyCapitalizedSubject(profile = {}, snapshot = {}) {
  const subject = conciergeFamilySubject(profile, snapshot);
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

function conciergeFamilyReturnReply(snapshot = {}, profile = {}) {
  const subject = conciergeFamilySubject(profile, snapshot);
  const subjectTitle = conciergeFamilyCapitalizedSubject(profile, snapshot);
  const records = conciergeProgramRecords(snapshot?.roster || {}).filter((record) => record.end > new Date());
  const base = String(snapshot?.preferences?.base || profile?.base || snapshot?.roster?.base || '').toUpperCase();
  const returnRecord = records.find((record) => String(record.legs?.at(-1)?.destination || '').toUpperCase() === base) || records.at(-1);
  if (!returnRecord) return 'Não encontrei um retorno confirmado na escala compartilhada.';
  const place = translatedAirportName(returnRecord.legs?.at(-1)?.destination || base);
  const arrival = spokenTime(returnRecord.legs?.at(-1)?.arrivalTime || returnRecord.endTime);
  return subjectTitle + ' deve retornar por ' + place + ', com chegada prevista para ' + arrival + '. O horário pode mudar conforme a operação.';
}

function conciergeFamilyCityReply(snapshot = {}, profile = {}) {
  const subject = conciergeFamilySubject(profile, snapshot);
  const subjectTitle = conciergeFamilyCapitalizedSubject(profile, snapshot);
  const shared = snapshot?.preferences?.location || snapshot?.location;
  if (shared?.city) return subjectTitle + ' está em ' + shared.city + '. Essa informação foi compartilhada pelo titular.';
  const current = conciergeProgramRecords(snapshot?.roster || {}).find((record) => record.start <= new Date() && record.end >= new Date());
  const code = current?.legs?.at(-1)?.destination || current?.legs?.[0]?.origin || current?.day?.location || '';
  return code ? subjectTitle + ' está com programação em ' + translatedAirportName(code) + '. A localização exata não foi compartilhada.' : 'A cidade atual não está disponível nas permissões compartilhadas.';
}

function conciergeFamilyContactReply(snapshot = {}, profile = {}) {
  const subject = conciergeFamilySubject(profile, snapshot);
  const subjectTitle = conciergeFamilyCapitalizedSubject(profile, snapshot);
  const current = conciergeProgramRecords(snapshot?.roster || {}).find((record) => record.start <= new Date() && record.end >= new Date());
  if (!current) return 'Não há atividade operacional confirmada agora. Ainda assim, não consigo garantir que ' + subject + ' esteja disponível para atender.';
  const code = String(current.code || '').toUpperCase();
  if (current.legs?.length) return subjectTitle + ' está em uma programação de voo. É melhor aguardar o término previsto para ' + spokenTime(current.endTime) + '.';
  if (/PERNOITE|HOTEL|DESCANSO|REPOUSO/.test(code)) return subjectTitle + ' está em período de descanso. Prefira enviar uma mensagem e aguardar a resposta.';
  return subjectTitle + ' está em ' + translatedActivityLabel(code) + ' até ' + spokenTime(current.endTime) + ' e pode não conseguir atender agora.';
}

`;
  return source.replace(anchor, block + anchor);
});

update('server/v1403/build-reply.snippet', (source) => {
  if (source.includes('conciergeFamilyReturnReply(snapshot')) return source;
  const anchor = "  if (/onde.*(estou|localiza)|perto de mim/i.test(lower))";
  if (!source.includes(anchor)) throw new Error('[v14314] Âncora de perguntas familiares ausente.');
  return source.replace(anchor, `  if (/\\b(?:quando|que dia|que horas).*(?:volta|retorna|chega).*(?:casa|base)|\\bquando (?:ele|ela|meu marido|minha esposa|meu filho|minha filha) volta\\b/i.test(lower)) return conciergeFamilyReturnReply(snapshot, profile);
  if (/\\b(?:qual cidade|onde).*(?:ele|ela|meu marido|minha esposa|meu filho|minha filha).*(?:esta|está|agora)|\\bonde (?:ele|ela) esta agora\\b/i.test(lower)) return conciergeFamilyCityReply(snapshot, profile);
  if (/\\b(?:posso|devo|é bom|e bom).*(?:ligar|telefonar)|\\b(?:ele|ela).*(?:pode atender|esta descansando|está descansando|esta dormindo|está dormindo)\\b/i.test(lower)) return conciergeFamilyContactReply(snapshot, profile);
${anchor}`);
});

update('client/src/components/platform/PlatformCenter.tsx', (source) => source
  .replace(/Programação autorizada pelo titular\./g, 'Programação compartilhada pelo titular, traduzida em linguagem simples.')
  .replace(/\bEXTRA\b/g, 'Passageiro')
  .replace(/\bPS\b/g, 'Passageiro'), { optional: true });

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140314').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => { const data = JSON.parse(source); data.version = VERSION; data.description = `CrewCheck v${VERSION} - tradução aeronáutica e Concierge Familiar Premium`; data.scripts ||= {}; data.scripts['regression:v14.3.14'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-14-aviation-family.mjs'; return `${JSON.stringify(data, null, 2)}\n`; });

console.log(`[v14314] CrewCheck ${VERSION}: tradução IATA/ICAO, atividades em linguagem simples e Concierge Familiar Premium.`);
