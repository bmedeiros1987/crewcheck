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

function normalizeDispatchLine(sourceText, { call, canonical, appliedMarker, label }) {
  if (sourceText.includes(appliedMarker)) {
    console.log(`[v14.3.23-preflight] ${label} já aplicado.`);
    return { source: sourceText, changed: false };
  }

  const lines = sourceText.split('\n');
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('if (') && trimmed.includes(`return ${call}(snapshot);`)) matches.push(index);
  }

  if (matches.length !== 1) {
    const symbolIndex = sourceText.indexOf(call);
    const diagnostic = symbolIndex >= 0
      ? sourceText.slice(Math.max(0, symbolIndex - 140), Math.min(sourceText.length, symbolIndex + 320)).replace(/\s+/g, ' ')
      : `${call} ausente`;
    throw new Error(`[v14.3.23-preflight] ${label} não reconhecido com segurança. Ocorrências: ${matches.length}. Contexto: ${diagnostic}`);
  }

  const lineIndex = matches[0];
  if (lines[lineIndex] === canonical) {
    console.log(`[v14.3.23-preflight] ${label} preservado e reconhecido.`);
    return { source: sourceText, changed: false };
  }

  lines[lineIndex] = canonical;
  console.log(`[v14.3.23-preflight] ${label} normalizado para o patch legado.`);
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

for (const config of [
  {
    call: 'conciergeHotelsReply',
    canonical: hotelDispatchAnchor,
    appliedMarker: 'return conciergeStayReply(snapshot);',
    label: 'intenção de pernoite',
  },
  {
    call: 'conciergeGymsReply',
    canonical: gymDispatchAnchor,
    appliedMarker: 'return conciergeHospitalsReply(snapshot);',
    label: 'intenção de hospitais',
  },
  {
    call: 'conciergeRoutineReply',
    canonical: routineDispatchAnchor,
    appliedMarker: 'posso treinar',
    label: 'perguntas naturais de rotina',
  },
]) {
  const result = normalizeDispatchLine(source, config);
  source = result.source;
  changed = changed || result.changed;
}

if (changed) fs.writeFileSync(serverPath, source, 'utf8');
