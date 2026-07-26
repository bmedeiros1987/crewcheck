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
    const declarationPatterns = [
      /(?:async\s+)?function\s+conciergeRoutineReply\s*\(([^)]*)\)\s*\{/m,
      /(?:const|let|var)\s+conciergeRoutineReply\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{/m,
      /(?:const|let|var)\s+conciergeRoutineReply\s*=\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>\s*\{/m,
    ];

    let declarationMatch = null;
    for (const pattern of declarationPatterns) {
      const candidate = pattern.exec(source);
      if (!candidate) continue;
      const params = String(candidate[1] || '');
      if (!/\bsnapshot\b/.test(params)) continue;
      declarationMatch = candidate;
      break;
    }

    if (!declarationMatch) {
      const nearby = source.indexOf('conciergeRoutineReply');
      const diagnostic = nearby >= 0
        ? source.slice(Math.max(0, nearby - 80), nearby + 240).replace(/\s+/g, ' ').slice(0, 300)
        : 'símbolo ausente';
      throw new Error(`[v14.3.23-preflight] declaração de conciergeRoutineReply não reconhecida com segurança. Contexto: ${diagnostic}`);
    }

    const declarationStart = declarationMatch.index;
    const bodyStart = declarationStart + declarationMatch[0].length;
    const nextPattern = /(?:const|let)\s+next\s*=\s*conciergeNextProgram\(\s*snapshot\?\.roster\s*(?:,\s*[^)]*)?\)\s*;/m;
    const nearbyBody = source.slice(bodyStart, bodyStart + 1800);
    const nextMatch = nextPattern.exec(nearbyBody);
    if (!nextMatch) {
      throw new Error('[v14.3.23-preflight] início funcional de conciergeRoutineReply não reconhecido com segurança.');
    }

    const prefix = nearbyBody.slice(0, nextMatch.index);
    const commentsRemoved = prefix
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*(?:\n|$)/g, '')
      .trim();
    if (commentsRemoved) {
      throw new Error('[v14.3.23-preflight] conciergeRoutineReply contém lógica antes de conciergeNextProgram; normalização automática recusada.');
    }

    const replaceEnd = bodyStart + nextMatch.index + nextMatch[0].length;
    source = `${source.slice(0, declarationStart)}${canonicalRoutineStart}${source.slice(replaceEnd)}`;
    changed = true;
    console.log('[v14.3.23-preflight] declaração e início de conciergeRoutineReply normalizados antes da inserção contextual.');
  } else {
    console.log('[v14.3.23-preflight] início de conciergeRoutineReply já está no formato canônico.');
  }
} else {
  console.log('[v14.3.23-preflight] contexto de rotina e hospitais já está completo.');
}

if (changed) fs.writeFileSync(serverPath, source, 'utf8');
