import fs from 'node:fs';

const VERSION = '14.3.87d';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14387d] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

function replaceBlock(input, startMarker, endMarker, replacement, label) {
  const start = input.indexOf(startMarker);
  const end = start >= 0 ? input.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14387d] bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${input.slice(0, start)}${replacement.trimEnd()}\n\n${input.slice(end)}`;
}

const cssAnchor = "import '@/components/v1399/premium.css';";
const cssImport = "import '@/components/v14387/import-confirm.css';";
if (!source.includes(cssImport)) {
  if (!source.includes(cssAnchor)) throw new Error('[v14387d] âncora CSS não encontrada.');
  source = source.replace(cssAnchor, `${cssAnchor}\n${cssImport}`);
}

const confirmationBlock = `function requestCrewCheckImportConfirmation(decision: ImportGuardianDecision): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    document.querySelector('[data-crewcheck-import-confirm="true"]')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'cc-import-confirm-overlay';
    overlay.dataset.crewcheckImportConfirm = 'true';

    const dialog = document.createElement('section');
    dialog.className = 'cc-import-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cc-import-confirm-title');
    dialog.setAttribute('aria-describedby', 'cc-import-confirm-summary');

    const header = document.createElement('header');
    const eyebrow = document.createElement('small');
    eyebrow.textContent = 'IMPORTAÇÃO DE ESCALA';
    const title = document.createElement('h2');
    title.id = 'cc-import-confirm-title';
    title.textContent = 'Ativar esta escala?';
    header.append(eyebrow, title);

    const summary = document.createElement('p');
    summary.id = 'cc-import-confirm-summary';
    summary.className = 'cc-import-confirm-summary';
    summary.textContent = String(decision.summaryText || 'Confira os dados detectados antes de ativar.').replace(/^CrewCheck detectou esta escala:\s*/i, '').trim();

    const note = document.createElement('p');
    note.className = 'cc-import-confirm-note';
    note.textContent = 'A escala oficial e as comunicações da empresa prevalecem em caso de divergência.';

    const actions = document.createElement('footer');
    actions.className = 'cc-import-confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cc-import-confirm-cancel';
    cancel.textContent = 'Cancelar';
    const activate = document.createElement('button');
    activate.type = 'button';
    activate.className = 'cc-import-confirm-activate';
    activate.textContent = 'Ativar escala';
    actions.append(cancel, activate);

    dialog.append(header, summary, note, actions);
    overlay.append(dialog);

    const previousOverflow = document.body.style.overflow;
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      resolve(accepted);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };

    cancel.addEventListener('click', () => finish(false));
    activate.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(false); });
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    queueMicrotask(() => activate.focus());
  });
}

async function confirmRosterImport(roster: CrewRoster, sourceFileName: string): Promise<ImportGuardianDecision> {
  const decision = importGuardianSummary(roster, sourceFileName);
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  if (!days) {
    return {
      ...decision,
      ok: false,
      summaryText: 'O arquivo foi lido, mas nenhuma data de escala foi detectada. Verifique se é o PDF oficial da escala.',
      toastText: 'Nenhuma data de escala detectada.',
    };
  }
  const confirmed = await requestCrewCheckImportConfirmation(decision);
  return { ...decision, ok: confirmed };
}`;

if (!source.includes('function requestCrewCheckImportConfirmation(decision: ImportGuardianDecision)')) {
  source = replaceBlock(
    source,
    'function confirmRosterImport(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {',
    'function emptyRoster(): CrewRoster {',
    confirmationBlock,
    'confirmRosterImport',
  );
}

source = source.replace(
  '      const decision = confirmRosterImport(roster, source);',
  '      const decision = await confirmRosterImport(roster, source);',
);

const pdfStart = '      const decision = confirmRosterImport(roster, file.name);';
const pdfEnd = '      const plannedSnapshot = preservePlannedRosterBeforeImport(bundle, roster);';
if (source.includes(pdfStart)) {
  const pdfReplacement = `      const decision = await confirmRosterImport(roster, file.name);
      let auditImport = false;
      const detectedDays = Array.isArray(roster.days) ? roster.days.length : 0;
      if (!detectedDays) {
        toast.error('Nenhuma data de escala foi reconhecida. A importação não substituirá sua escala ativa; tente novamente para acionar a leitura visual alternativa.');
        return;
      }
      if (!decision.ok) {
        toast.message('Importação cancelada. Sua escala ativa foi preservada.');
        return;
      }`;
  source = replaceBlock(source, pdfStart, pdfEnd, pdfReplacement, 'consentimento PDF');
}

for (const required of [
  cssImport,
  'function requestCrewCheckImportConfirmation(decision: ImportGuardianDecision): Promise<boolean>',
  'async function confirmRosterImport(roster: CrewRoster, sourceFileName: string): Promise<ImportGuardianDecision>',
  'const decision = await confirmRosterImport(roster, source);',
  'const decision = await confirmRosterImport(roster, file.name);',
  "activate.textContent = 'Ativar escala';",
  "cancel.textContent = 'Cancelar';",
  "event.key === 'Escape'",
]) {
  if (!source.includes(required)) throw new Error(`[v14387d] contrato não aplicado: ${required}`);
}

const importScopeStart = source.indexOf('function confirmRosterImport(');
const importScopeEnd = source.indexOf('function emptyRoster()', importScopeStart);
const importScope = importScopeStart >= 0 && importScopeEnd > importScopeStart ? source.slice(importScopeStart, importScopeEnd) : '';
if (importScope.includes('window.confirm')) throw new Error('[v14387d] confirm nativo ainda presente no gate principal de importação.');
if (/overrideImport\s*=\s*window\.confirm/.test(source)) throw new Error('[v14387d] segundo confirm nativo de override ainda presente.');

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387d] CrewCheck ${VERSION}: importação usa um único modal responsivo; cancelar preserva a escala ativa.`);

await import('../p0-fast-logout/apply.mjs');
