import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[v14.3.23-preflight] server.mjs ausente.');

let source = fs.readFileSync(serverPath, 'utf8');
let changed = false;

function findNextTopLevelFunction(sourceText, fromIndex) {
  const tail = sourceText.slice(fromIndex);
  const match = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m.exec(tail);
  return match ? fromIndex + match.index : -1;
}

function normalizeDispatchLine(sourceText, { call, canonical, appliedMarker, extraGuard, label }) {
  const lines = sourceText.split('\n');
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (extraGuard && lines[index] === extraGuard) continue;
    if (trimmed.startsWith('if (') && trimmed.includes(`return ${call}(snapshot);`)) matches.push(index);
  }

  if (matches.length !== 1) {
    const symbolIndex = sourceText.indexOf(call);
    const diagnostic = symbolIndex >= 0
      ? sourceText.slice(Math.max(0, symbolIndex - 140), Math.min(sourceText.length, symbolIndex + 320)).replace(/\s+/g, ' ')
      : `${call} ausente`;
    throw new Error(`[v14.3.23-preflight] ${label} não reconhecido com segurança. Ocorrências: ${matches.length}. Contexto: ${diagnostic}`);
  }

  let lineIndex = matches[0];
  let localChanged = false;

  if (!sourceText.includes(appliedMarker) && lines[lineIndex] !== canonical) {
    lines[lineIndex] = canonical;
    localChanged = true;
    console.log(`[v14.3.23-preflight] ${label} normalizado para o patch legado.`);
  } else {
    console.log(`[v14.3.23-preflight] ${label} preservado e reconhecido.`);
  }

  if (extraGuard && !lines.includes(extraGuard)) {
    lines.splice(lineIndex, 0, extraGuard);
    lineIndex += 1;
    localChanged = true;
    console.log(`[v14.3.23-preflight] linguagem natural adicional preservada em ${label}.`);
  }

  return { source: lines.join('\n'), changed: localChanged };
}

function normalizeFallbackLine(sourceText) {
  const appliedMarker = 'Posso conversar sobre sua escala de forma mais natural.';
  if (sourceText.includes(appliedMarker)) {
    console.log('[v14.3.23-preflight] fallback conversacional já aplicado.');
    return { source: sourceText, changed: false };
  }

  const canonical = "  return `Entendi sua mensagem, mas preciso de um comando operacional mais específico.\\n\\n${conciergeHelp(profile.name)}`;";
  if (sourceText.includes(canonical)) {
    console.log('[v14.3.23-preflight] fallback conversacional preservado e reconhecido.');
    return { source: sourceText, changed: false };
  }

  const lines = sourceText.split('\n');
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith('return ')) continue;
    if (trimmed.includes('Não entendi exatamente o que você quer consultar') || trimmed.includes('Entendi sua mensagem, mas preciso de um comando operacional mais específico')) matches.push(index);
  }

  if (matches.length !== 1) {
    const phraseIndex = sourceText.search(/Não entendi exatamente|Entendi sua mensagem, mas preciso/);
    const diagnostic = phraseIndex >= 0
      ? sourceText.slice(Math.max(0, phraseIndex - 120), Math.min(sourceText.length, phraseIndex + 360)).replace(/\s+/g, ' ')
      : 'retorno conversacional ausente';
    throw new Error(`[v14.3.23-preflight] fallback conversacional não reconhecido com segurança. Ocorrências: ${matches.length}. Contexto: ${diagnostic}`);
  }

  lines[matches[0]] = canonical;
  console.log('[v14.3.23-preflight] fallback conversacional normalizado para o patch legado.');
  return { source: lines.join('\n'), changed: true };
}

const startMarker = 'function conciergePlaceLines(places = []) {';
const start = source.indexOf(startMarker);

if (start >= 0) {
  const end = findNextTopLevelFunction(source, start + startMarker.length);
  if (end < 0) throw new Error('[v14.3.23-preflight] limite estrutural de conciergePlaceLines não localizado.');

  const currentBlock = source.slice(start, end).trimEnd();
  const alreadySemantic = currentBlock.includes('place.distanceKm') && currentBlock.includes('const distance');

  if (alreadySemantic) {
    const canonicalBlock = [
      'function conciergePlaceLines(places = []) {',
      '  return places.map((place, index) => {',
      "    const distance = Number.isFinite(place.distanceKm) ? ` · ${place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1).replace(`.`, `,`)} km`}` : '';",
      "    return `${index + 1}. ${place.name}${distance}${place.rating ? ` · nota ${place.rating}` : ``}${place.openNow === true ? ` · aberto agora` : place.openNow === false ? ` · fechado agora` : ``}\\n${place.address || place.mapsUrl || ``}`;",
      "  }).join('\\n\\n');",
      '}',
    ].join('\n');

    if (currentBlock !== canonicalBlock) {
      source = `${source.slice(0, start)}${canonicalBlock}${source.slice(end)}`;
      changed = true;
      console.log('[v14.3.23-preflight] conciergePlaceLines normalizado com escapes preservados e sem remover funções seguintes.');
    } else {
      console.log('[v14.3.23-preflight] conciergePlaceLines já está no formato canônico.');
    }
  } else {
    console.log('[v14.3.23-preflight] formato legado de locais preservado para aplicação normal do v14.3.23.');
  }
} else {
  console.log('[v14.3.23-preflight] conciergePlaceLines ainda não existe; aplicação normal do v14.3.23 continuará.');
}

const contextAlreadyComplete = source.includes('function conciergeStayRecords(')
  && source.includes('function conciergeContextualRoutineReply(')
  && source.includes('async function conciergeHospitalsReply(');

if (!contextAlreadyComplete) {
  const canonicalRoutineStart = "function conciergeRoutineReply(snapshot) {\n  const next = conciergeNextProgram(snapshot?.roster);";
  if (!source.includes(canonicalRoutineStart)) {
    const routineStartPattern = /function\s+conciergeRoutineReply\s*\(\s*snapshot\s*(?:=\s*[^)]*)?\)\s*\{\s*const\s+next\s*=\s*conciergeNextProgram\(\s*snapshot\?\.roster\s*\)\s*;/m;
    if (!routineStartPattern.test(source)) {
      const nameIndex = source.indexOf('conciergeRoutineReply');
      const diagnostic = nameIndex >= 0
        ? source.slice(Math.max(0, nameIndex - 100), Math.min(source.length, nameIndex + 300)).replace(/\s+/g, ' ')
        : 'símbolo ausente após a normalização de locais';
      throw new Error(`[v14.3.23-preflight] início de conciergeRoutineReply não reconhecido com segurança. Contexto: ${diagnostic}`);
    }
    source = source.replace(routineStartPattern, canonicalRoutineStart);
    changed = true;
    console.log('[v14.3.23-preflight] início de conciergeRoutineReply normalizado antes da inserção contextual.');
  } else {
    console.log('[v14.3.23-preflight] início de conciergeRoutineReply preservado e reconhecido.');
  }
} else {
  console.log('[v14.3.23-preflight] contexto de rotina e hospitais já está completo.');
}

const hotelDispatchAnchor = String.raw`  if (/^\/(?:hoteis|hotéis|hotel)(?:@\S+)?\b/i.test(value) || /\b(hotel|hot[eé]is|pernoite)\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
const gymDispatchAnchor = String.raw`  if (/^\/academias?(?:@\S+)?\b/i.test(value) || /\b(academia|wellhub|gympass|smart fit|treino perto)\b/i.test(lower)) return conciergeGymsReply(snapshot);`;
const routineDispatchAnchor = String.raw`  if (/^\/rotina(?:@\S+)?\b/i.test(value) || /\b(rotina|recupera[cç][aã]o|treino hoje)\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;
const hotelExtraGuard = String.raw`  if (/\b(onde vou dormir|onde fico hoje)\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
const gymExtraGuard = String.raw`  if (/\bonde treinar\b/i.test(lower)) return conciergeGymsReply(snapshot);`;
const routineExtraGuard = String.raw`  if (/\bcomo organizar meu dia\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;

for (const config of [
  {
    call: 'conciergeHotelsReply',
    canonical: hotelDispatchAnchor,
    appliedMarker: 'return conciergeStayReply(snapshot);',
    extraGuard: hotelExtraGuard,
    label: 'intenção de pernoite',
  },
  {
    call: 'conciergeGymsReply',
    canonical: gymDispatchAnchor,
    appliedMarker: 'return conciergeHospitalsReply(snapshot);',
    extraGuard: gymExtraGuard,
    label: 'intenção de hospitais',
  },
  {
    call: 'conciergeRoutineReply',
    canonical: routineDispatchAnchor,
    appliedMarker: 'posso treinar',
    extraGuard: routineExtraGuard,
    label: 'perguntas naturais de rotina',
  },
]) {
  const result = normalizeDispatchLine(source, config);
  source = result.source;
  changed = changed || result.changed;
}

const fallbackResult = normalizeFallbackLine(source);
source = fallbackResult.source;
changed = changed || fallbackResult.changed;

if (changed) fs.writeFileSync(serverPath, source, 'utf8');
