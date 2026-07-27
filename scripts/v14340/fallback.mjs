import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14340-fallback] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14340-fallback] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

const resilientBlock = String.raw`async function parsePDFResilient(file: File): Promise<{ roster: CrewRoster; source: 'local' | 'server-fallback' }> {
  try {
    const roster = await parsePDF(file);
    const rawText = String((roster as any)?.rawText || '');
    const sourceFlightTokens = Array.from(new Set(rawText.match(/\bLA\s*\d{3,4}\b/gi) || []));
    const parsedFlightCount = Array.isArray(roster?.days)
      ? roster.days.reduce((sum, day) => sum + (Array.isArray(day?.legs) ? day.legs.length : 0), 0)
      : 0;
    if (sourceFlightTokens.length > 0 && parsedFlightCount === 0) {
      storage.set('crewcheck_last_pdf_local_error', 'Voos identificados; leitura visual alternativa acionada automaticamente.');
      const serverRoster = await parsePDFOnServer(file);
      return { roster: serverRoster, source: 'server-fallback' };
    }
    return { roster, source: 'local' };
  } catch (localError) {
    storage.set('crewcheck_last_pdf_local_error', sanitizePdfImportError(localError));
    const roster = await parsePDFOnServer(file);
    return { roster, source: 'server-fallback' };
  }
}`;

update('client/src/pages/Home.tsx', (source) => replaceBlock(
  source,
  'async function parsePDFResilient(',
  'function OpeningVideo(',
  resilientBlock,
  'fallback automático de PDF com voos não reconhecidos',
));

console.log('[v14340-fallback] CrewRosterReport com voos e zero etapas força leitura visual do servidor sem bloquear a importação.');
