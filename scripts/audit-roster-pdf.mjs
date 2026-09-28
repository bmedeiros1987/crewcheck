#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parsePdfOnServer } from '../server/rosterParser.mjs';

const HELP = `Uso:\n  node scripts/audit-roster-pdf.mjs <arquivo.pdf> [outros.pdf] [--out-dir pasta]\n\nSaída:\n  Relatórios JSON anonimizados. O PDF e o texto bruto nunca são gravados.`;

function parseArgs(argv) {
  const files = [];
  let outDir = '.artifacts/roster-audit';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true, files, outDir };
    if (arg === '--out-dir') { outDir = argv[++i] || outDir; continue; }
    files.push(arg);
  }
  return { help: false, files, outDir };
}

function eventKey(day) {
  const legs = (day.legs || []).map((leg) => [leg.origin, leg.destination, leg.departureTime, leg.arrivalTime, leg.workType].join('-')).join('|');
  return [day.date, day.type, day.pairingCode, day.dutyReport, day.dutyDebrief, legs].join('~');
}

function sanitizeRoster(roster) {
  return {
    schemaVersion: 1,
    sourceFormat: 'automatic-pdf-audit',
    timezone: 'America/Sao_Paulo',
    period: { month: roster.month, year: roster.year },
    base: roster.base || null,
    rank: roster.rank || null,
    totals: roster.totals || {},
    events: (roster.days || []).map((day) => ({
      date: day.date,
      type: day.type,
      pairingCode: day.pairingCode || null,
      dutyReport: day.dutyReport || null,
      dutyDebrief: day.dutyDebrief || null,
      hotel: day.hotel || null,
      legs: (day.legs || []).map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        departureTime: leg.departureTime,
        arrivalTime: leg.arrivalTime,
        workType: leg.workType || 'OP',
        isNextDay: Boolean(leg.isNextDay),
      })),
    })),
  };
}

function auditCanonical(report, diagnostics) {
  const findings = [];
  const seen = new Set();
  let previousDestination = null;
  for (const event of report.events) {
    const key = eventKey(event);
    if (seen.has(key)) findings.push({ code: 'DUPLICATE_EVENT', severity: 'error', date: event.date });
    seen.add(key);
    for (const leg of event.legs) {
      if (previousDestination && leg.origin && previousDestination !== leg.origin) {
        findings.push({ code: 'PHYSICAL_DISCONTINUITY', severity: 'review', date: event.date, expectedOrigin: previousDestination, actualOrigin: leg.origin });
      }
      previousDestination = leg.destination || previousDestination;
    }
    if (['DO','DOF','DR','OFF','DOP','DOPR','HSB','HSBE','ASB'].includes(event.type) && event.legs.length) {
      findings.push({ code: 'INACTIVE_EVENT_WITH_FLIGHT', severity: 'error', date: event.date, type: event.type });
    }
  }
  if (diagnostics.confidence === 'baixa') findings.push({ code: 'LOW_PARSE_CONFIDENCE', severity: 'review', details: diagnostics.message });
  const status = findings.some((f) => f.severity === 'error') ? 'divergent' : findings.length ? 'review' : 'approved';
  return { status, findings };
}

async function auditFile(file, outDir) {
  if (extname(file).toLowerCase() !== '.pdf') throw new Error(`Formato não suportado: ${file}`);
  const bytes = await readFile(resolve(file));
  const pdfHash = createHash('sha256').update(bytes).digest('hex');
  const { roster, diagnostics } = await parsePdfOnServer({ filename: basename(file), dataBase64: bytes.toString('base64') });
  const sanitized = sanitizeRoster(roster);
  const canonical = auditCanonical(sanitized, diagnostics);
  const structuralSignature = createHash('sha256').update(JSON.stringify(sanitized.events)).digest('hex');
  const output = {
    generatedAt: new Date().toISOString(),
    sourceId: pdfHash.slice(0, 16),
    structuralSignature,
    diagnostics: { ...diagnostics, message: diagnostics.message },
    canonical,
    roster: sanitized,
    privacy: { rawPdfStored: false, rawTextStored: false, personalDataStored: false },
  };
  await mkdir(outDir, { recursive: true });
  const target = resolve(outDir, `${output.sourceId}.audit.json`);
  await writeFile(target, JSON.stringify(output, null, 2));
  return { file, target, status: canonical.status, findings: canonical.findings.length };
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.files.length) {
  console.log(HELP);
  process.exit(args.help ? 0 : 1);
}

let failed = false;
for (const file of args.files) {
  try {
    const result = await auditFile(file, args.outDir);
    console.log(`[${result.status}] ${result.file} -> ${result.target} (${result.findings} achados)`);
    if (result.status === 'divergent') failed = true;
  } catch (error) {
    failed = true;
    console.error(`[error] ${file}: ${error.message}`);
  }
}
process.exit(failed ? 2 : 0);
