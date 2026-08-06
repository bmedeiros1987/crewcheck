import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[P0/#303/import] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function expect(condition, message) {
  if (!condition) throw new Error(`[P0/#303/import] ${message}`);
}

const home = read('client/src/pages/Home.tsx');
const css = read('client/src/components/v14387/import-confirm.css');
const patch = read('scripts/v14387d/apply.mjs');

expect(home.includes("import '@/components/v14387/import-confirm.css';"), 'CSS do modal de importação não foi carregado.');
expect(home.includes('function requestCrewCheckImportConfirmation(decision: ImportGuardianDecision): Promise<boolean>'), 'Promise do modal CrewCheck não existe.');
expect(home.includes("dialog.setAttribute('role', 'dialog')"), 'Modal precisa de role=dialog.');
expect(home.includes("dialog.setAttribute('aria-modal', 'true')"), 'Modal precisa ser aria-modal.');
expect(home.includes("activate.textContent = 'Ativar escala'"), 'CTA principal deve ser Ativar escala.');
expect(home.includes("cancel.textContent = 'Cancelar'"), 'CTA secundário deve ser Cancelar.');
expect(home.includes("event.key === 'Escape'"), 'Escape deve cancelar o modal.');
expect(home.includes("if (event.target === overlay) finish(false)"), 'Backdrop deve cancelar sem ativar a escala.');
expect(home.includes("note.textContent = 'A escala oficial e as comunicações da empresa prevalecem em caso de divergência.'"), 'Modal precisa manter ressalva da fonte oficial.');

expect(home.includes('async function confirmRosterImport(roster: CrewRoster, sourceFileName: string): Promise<ImportGuardianDecision>'), 'Gate de importação deve aguardar consentimento assíncrono.');
expect(home.includes('const decision = await confirmRosterImport(roster, source);'), 'Importação Telegram deve aguardar o mesmo modal.');
expect(home.includes('const decision = await confirmRosterImport(roster, file.name);'), 'Importação PDF deve aguardar o mesmo modal.');
expect(home.includes("toast.message('Importação cancelada. Sua escala ativa foi preservada.')"), 'Cancelar deve preservar a escala ativa explicitamente.');
expect(home.includes("toast.error('Nenhuma data de escala foi reconhecida."), 'Escala sem datas deve continuar bloqueada antes da ativação.');

expect(!home.includes('const confirmed = window.confirm(decision.summaryText);'), 'Confirm nativo principal não pode permanecer.');
expect(!/overrideImport\s*=\s*window\.confirm/.test(home), 'Segundo confirm nativo de override não pode permanecer.');

expect(css.includes('env(safe-area-inset-bottom'), 'Modal deve respeitar safe-area inferior.');
expect(css.includes('@media (max-width: 520px)'), 'Modal precisa de layout mobile dedicado.');
expect(css.includes('.cc-import-confirm-actions'), 'Ações do modal não possuem estilo dedicado.');
expect(css.includes('max-height: min(88svh'), 'Modal mobile precisa limitar altura e permitir scroll.');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/aimsParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/complianceEngine.ts',
  'client/src/lib/financialRules.ts',
]) {
  expect(!patch.includes(`'${protectedPath}'`), `Patch de UX não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[P0/#303/import] OK — uma única confirmação CrewCheck responsiva substitui os confirms nativos; cancelar preserva a escala ativa.');
