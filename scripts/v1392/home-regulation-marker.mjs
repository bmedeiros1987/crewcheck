import { spawnSync } from 'node:child_process';

const LEGACY_IMPORT = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";
const PREPARED_IMPORT = "import ManualRegulationView, { regulationForScheduleDay } from '@/components/v1432/ManualRegulationView';";
const TOUR_IMPORT = "import FirstAccessTour from '@/components/v1432/FirstAccessTour';";
const LEGACY_ROUTE = "    {view === 'regulation' && <ManualRegulationView compliance={compliance}/>}";
const PREPARED_ROUTE = "    {view === 'regulation' && <ManualRegulationView compliance={compliance} scheduleDay={event?.day}/>}";

function parsesModule(source) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source, encoding: 'utf8', timeout: 5_000, maxBuffer: 1_000_000,
    env: { NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1 && /\bSyntaxError:/.test(result.stderr)) return false;
  throw new Error('Home preparation could not validate imports.');
}

function activeImport(prefix, declaration) {
  const index = prefix.indexOf(declaration);
  if (index < 0 || prefix.indexOf(declaration, index + 1) >= 0) return false;
  // Change a quote-free token: comments and string/template decoys still parse.
  return !parsesModule(`${prefix.slice(0, index)}@${prefix.slice(index + 6)}`);
}

export function requireHomeRegulationMarker(source) {
  const boundary = source.indexOf('\ntype ZeroView =');
  // Only strip inline type modifiers inside complete import declarations.
  // This is an import-marker check, not a TSX parser; check/build validate Home.
  const prefix = boundary < 0 ? '' : source.slice(0, boundary).replace(
    /^import\s+[\w$\s{},*]+?\s+from\s+(['"])[^'"\r\n]+\1;$/gm,
    declaration => declaration.replace(/([{,]\s*)type\s+([A-Za-z_$][\w$]*)(?=\s*[,}])/g, '$1$2'),
  );
  if (boundary >= 0 && parsesModule(prefix)) {
    const legacy = activeImport(prefix, LEGACY_IMPORT);
    const prepared = activeImport(prefix, PREPARED_IMPORT);
    const lines = source.split('\n');
    if (legacy && !prepared && lines.filter(line => line === LEGACY_ROUTE).length === 1) return source;
    // v1432 upgrades the component and its published-day input. Accept that
    // exact later producer state without restoring or rewriting old UI code.
    if (prepared && !legacy && activeImport(prefix, TOUR_IMPORT)
      && lines.filter(line => line === PREPARED_ROUTE).length === 1
      && !lines.includes(LEGACY_ROUTE)) return source;
  }
  throw new Error('v13.9.2: marcador ausente em client/src/pages/Home.tsx: @/components/v1392/ManualRegulationView (ou substituição v1432 completa)');
}
