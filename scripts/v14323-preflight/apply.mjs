import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[v14.3.23-preflight] server.mjs ausente.');

let source = fs.readFileSync(serverPath, 'utf8');
let changed = false;

const startMarker = 'function conciergePlaceLines(places = []) {';
const start = source.indexOf(startMarker);

if (start >= 0) {
  const endMarker = '\n}\n\n';
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('[v14.3.23-preflight] fim de conciergePlaceLines não localizado.');

  const currentBlock = source.slice(start, end + 2);
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
      source = `${source.slice(0, start)}${canonicalBlock}${source.slice(end + 2)}`;
      changed = true;
      console.log('[v14.3.23-preflight] conciergePlaceLines normalizado semanticamente antes do patch legado.');
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
    const routineStartPattern = /(?:async\s+)?function\s+conciergeRoutineReply\s*\(\s*snapshot\s*(?:=\s*[^)]*)?\)\s*\{\s*const\s+next\s*=\s*conciergeNextProgram\(\s*snapshot\?\.roster\s*\)\s*;/m;
    if (!routineStartPattern.test(source)) {
      throw new Error('[v14.3.23-preflight] assinatura ou início de conciergeRoutineReply não reconhecido com segurança.');
    }
    source = source.replace(routineStartPattern, canonicalRoutineStart);
    changed = true;
    console.log('[v14.3.23-preflight] início de conciergeRoutineReply normalizado antes da inserção contextual.');
  } else {
    console.log('[v14.3.23-preflight] início de conciergeRoutineReply já está no formato canônico.');
  }
} else {
  console.log('[v14.3.23-preflight] contexto de rotina e hospitais já está completo.');
}

if (changed) fs.writeFileSync(serverPath, source, 'utf8');
