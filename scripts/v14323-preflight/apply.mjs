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

if (changed) fs.writeFileSync(serverPath, source, 'utf8');
