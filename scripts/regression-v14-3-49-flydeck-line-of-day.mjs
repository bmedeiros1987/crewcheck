import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.49] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.49] ${message}`);
}

const home = read('client/src/pages/Home.tsx');
const component = read('client/src/components/v14349/OperationalDayTimeline.tsx');
const css = read('client/src/components/v14349/operational-day-timeline.css');
const applyChain = read('scripts/v139/apply.mjs');
const patch = read('scripts/v14349/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(home.includes("import OperationalDayTimeline from '@/components/v14349/OperationalDayTimeline';"), 'Import da Linha do Dia não encontrado no FlyDeck.');
expect(home.includes('<OperationalDayTimeline events={events}'), 'Linha do Dia não renderizada no FlyDeck.');
expect(!home.includes('COPILOTO CRONOLÓGICO'), 'Copiloto cronológico antigo ainda visível.');
expect(home.indexOf('<SmartCard event={departureEvent} setView={setView}/>') < home.indexOf('<OperationalDayTimeline events={events}'), 'Linha do Dia deve aparecer depois da Saída Inteligente.');

expect(component.includes('export function buildOperationalDayTimeline'), 'Construtor da cronologia não está exposto para testes futuros.');
expect(component.includes("title: 'Folga'"), 'Folga não possui apresentação própria na Linha do Dia.');
expect(component.includes("title: 'Repouso'"), 'Repouso não está diferenciado de folga.');
expect(component.includes("eyebrow: 'Descanso'"), 'Descanso não está separado de programação.');
expect(component.includes("title: 'Pernoite'"), 'Pernoite não possui marco próprio.');
expect(component.includes("eyebrow: 'Apresentação'"), 'Apresentação não aparece na cronologia.');
expect(component.includes('.slice(0, 7)'), 'Linha do Dia não limita densidade visual.');
expect(component.includes('filter((event) => !event.placeholder)'), 'Eventos placeholder não são filtrados.');
expect(component.includes('REST_DAY_PATTERN') && component.includes('REST_RECOVERY_PATTERN'), 'Regras visuais de folga e repouso não estão explícitas.');
expect(!component.includes('Boolean(event.hotel)'), 'Hotel não pode transformar automaticamente uma programação em pernoite.');
expect(!component.includes('90 * 60 * 1000'), 'Linha do Dia não pode inventar saída fixa de 90 minutos.');
expect(component.includes('isDistinctUpcomingPresentation'), 'Apresentação passada ou duplicada não está protegida.');
expect(component.includes('result.setDate(result.getDate() - 1)'), 'Apresentação anterior à meia-noite não está protegida.');
expect(component.includes('aria-hidden="true"'), 'Ícones decorativos não estão protegidos para leitores de tela.');

expect(css.includes('@media (max-width: 760px)'), 'Responsividade mobile ausente.');
expect(css.includes("[data-theme='dark']"), 'Modo escuro ausente.');
expect(css.includes('@media (prefers-reduced-transparency: reduce)'), 'Fallback sem transparência ausente.');
expect(css.includes('minmax(0, 1fr)'), 'Proteção contra estouro horizontal ausente.');

expect(applyChain.includes("await import('../v14349/apply.mjs');"), 'v14.3.49 não está na preparação canônica.');
expect(packageJson.version === '14.3.49', `Versão esperada 14.3.49; recebida ${packageJson.version}.`);
expect(Boolean(packageJson.scripts?.['regression:v14.3.49:flydeck-line-of-day']), 'Script de regressão não registrado.');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[v14.3.49] OK — Linha do Dia substitui o Copiloto, diferencia descanso e não inventa horário de saída.');
