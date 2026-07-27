import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const writeReport = process.argv.includes('--write') || Boolean(process.env.RUNNER_TEMP);

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`[functional-audit] Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}
function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
function unique(values) {
  return [...new Set(values)];
}
function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const config = JSON.parse(read('config/functional-surfaces.json'));
const home = read('client/src/pages/Home.tsx');
const app = read('client/src/App.tsx');
const server = read('server.mjs');
const css = read('client/src/index.css');
const manifest = fs.existsSync(path.join(root, 'android-wrapper/app/src/main/AndroidManifest.xml'))
  ? read('android-wrapper/app/src/main/AndroidManifest.xml')
  : '';

const typeBlock = home.match(/type\s+ZeroView\s*=([\s\S]*?);/)?.[1] || '';
const typedViews = unique([...typeBlock.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((match) => match[1]));
const renderedViews = unique([...home.matchAll(/view\s*===\s*'([a-z][a-z0-9-]*)'/g)].map((match) => match[1]));
const menuStart = home.indexOf('function MenuDrawer(');
const menuEnd = menuStart >= 0 ? home.indexOf('function Cockpit(', menuStart) : -1;
const bottomStart = home.indexOf('function BottomNav(');
const bottomEnd = bottomStart >= 0 ? home.indexOf('function KpiCard(', bottomStart) : -1;
const navigationSource = [
  menuStart >= 0 && menuEnd > menuStart ? home.slice(menuStart, menuEnd) : '',
  bottomStart >= 0 && bottomEnd > bottomStart ? home.slice(bottomStart, bottomEnd) : '',
].join('\n');
const navigationViews = unique([...navigationSource.matchAll(/\['([a-z][a-z0-9-]*)'\s*,\s*'[^']+'/g)].map((match) => match[1]));

const errors = [];
const warnings = [];
const surfaceResults = config.surfaces.map((surface) => {
  const typed = typedViews.includes(surface.view);
  const rendered = home.includes(surface.render);
  const navTupleCount = count(navigationSource, new RegExp(`\\['${surface.view}'\\s*,`, 'g'));
  const actionCount = count(home, new RegExp(`setView\\('${surface.view}'\\)`, 'g'))
    + count(home, new RegExp(`detail:\\s*'${surface.view}'`, 'g'));
  const reachable = !surface.navigation || navTupleCount > 0 || actionCount > 0;
  const issues = [];
  if (!typed) issues.push('fora de ZeroView');
  if (!rendered) issues.push('sem renderização');
  if (!reachable) issues.push('sem caminho de navegação');
  if (navTupleCount > 2) issues.push(`navegação duplicada ${navTupleCount}x`);
  const status = issues.length ? (surface.critical ? 'FAIL' : 'WARN') : 'OK';
  const entry = { ...surface, typed, rendered, reachable, navTupleCount, actionCount, status, issues };
  if (issues.length) {
    const target = surface.critical ? errors : warnings;
    target.push(`${surface.id}: ${issues.join(', ')}`);
  }
  return entry;
});

for (const view of navigationViews) {
  if (!typedViews.includes(view)) errors.push(`menu aponta para view inexistente: ${view}`);
}
for (const view of renderedViews) {
  if (!typedViews.includes(view)) errors.push(`renderização usa view fora de ZeroView: ${view}`);
}

const criticalMarkers = [
  ['motor canônico disponível', home.includes('buildCanonicalRosterEvents') && home.includes('selectNextRosterEvent')],
  ['seleção específica da Saída Inteligente', home.includes('nextDepartureEvent')],
  ['voo real para Radar/Meteorologia', home.includes('nextRealFlight')],
  ['sincronização da escala com Concierge', home.includes('syncRosterWithTelegramConcierge')],
  ['rodapé fora do contêiner rolável', home.includes('createPortal(<nav className="cz-bottom-nav"') && home.includes('</nav>, document.body)')],
  ['marca canônica compartilhada', home.includes('data-crewcheck-brand="canonical"') && home.includes('<CrewCheckMark/>')],
  ['importação resiliente', home.includes('parsePDFResilient') && home.includes('confirmRosterImport')],
  ['fallback não oculta erro de importação', home.includes('sanitizePdfImportError')],
  ['servidor de Radar presente', server.includes('/api/radar-flight')],
  ['Concierge operacional presente', server.includes('/api/telegram/concierge/ask')],
  ['CSS do menu rolável presente', css.includes('.cz-menu-panel') && css.includes('overflow-y')),
];
for (const [label, ok] of criticalMarkers) if (!ok) errors.push(`marcador crítico ausente: ${label}`);

const publicRouteResults = config.publicRoutes.map((route) => {
  const present = app.includes(route.marker);
  if (!present) (route.critical ? errors : warnings).push(`rota pública ausente: ${route.path}`);
  return { ...route, present, status: present ? 'OK' : route.critical ? 'FAIL' : 'WARN' };
});

const securityChecks = [
  { id: 'health-read-only', ok: !manifest || !/android\.permission\.health\.WRITE_/i.test(manifest), detail: 'Manifest não solicita escrita no Health Connect' },
  { id: 'no-raw-conversation-context', ok: !server.includes('conciergeConversation: { originalText') && !server.includes('conciergeConversation: { transcript'), detail: 'Contexto do Concierge não contém texto bruto' },
  { id: 'admin-conditional-menu', ok: home.includes('if (admin) groups.push') || home.includes('if (admin) nav.push'), detail: 'Itens administrativos permanecem condicionais' },
];
for (const check of securityChecks) if (!check.ok) errors.push(`segurança: ${check.detail}`);

const report = {
  generatedAt: new Date().toISOString(),
  schemaVersion: config.schemaVersion,
  strict,
  summary: {
    surfaces: surfaceResults.length,
    ok: surfaceResults.filter((item) => item.status === 'OK').length,
    warnings: surfaceResults.filter((item) => item.status === 'WARN').length + warnings.length,
    failures: surfaceResults.filter((item) => item.status === 'FAIL').length + errors.length,
    typedViews: typedViews.length,
    renderedViews: renderedViews.length,
    navigationViews: navigationViews.length,
  },
  errors: unique(errors),
  warnings: unique(warnings),
  criticalMarkers: criticalMarkers.map(([label, ok]) => ({ label, ok })),
  securityChecks,
  publicRoutes: publicRouteResults,
  surfaces: surfaceResults,
};

const lines = [
  '# Auditoria funcional automática do CrewCheck',
  '',
  `Gerada em ${report.generatedAt}.`,
  '',
  `- Superfícies mapeadas: **${report.summary.surfaces}**`,
  `- Estáveis na verificação estrutural: **${report.summary.ok}**`,
  `- Avisos: **${report.summary.warnings}**`,
  `- Falhas bloqueadoras: **${report.summary.failures}**`,
  '',
  'Esta verificação confirma presença, renderização, alcance de navegação, fonte estrutural e proteções básicas. Ela não substitui teste manual em Android, iPad e desktop.',
  '',
  '| Prioridade | Grupo | Função | View | Status | Evidência |',
  '|---|---|---|---|---|---|',
  ...surfaceResults.map((item) => `| ${item.priority} | ${escapeMarkdown(item.group)} | ${escapeMarkdown(item.title)} | \`${item.view}\` | **${item.status}** | ${item.issues.length ? escapeMarkdown(item.issues.join('; ')) : 'tipo + render + navegação'} |`),
  '',
  '## Falhas bloqueadoras',
  '',
  ...(report.errors.length ? report.errors.map((item) => `- ${escapeMarkdown(item)}`) : ['- Nenhuma falha bloqueadora estrutural.']),
  '',
  '## Avisos',
  '',
  ...(report.warnings.length ? report.warnings.map((item) => `- ${escapeMarkdown(item)}`) : ['- Nenhum aviso estrutural.']),
  '',
  '## Próxima camada manual',
  '',
  '- ação principal;',
  '- estado vazio;',
  '- erro de rede;',
  '- permissões e plano;',
  '- tema claro/escuro;',
  '- Android, iPad e desktop;',
  '- consistência com a escala canônica.',
  '',
];

if (writeReport) {
  const defaultDir = process.env.RUNNER_TEMP
    ? path.join(process.env.RUNNER_TEMP, 'crewcheck-functional-audit')
    : path.join(root, 'artifacts', 'functional-audit');
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(path.join(defaultDir, 'functional-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(defaultDir, 'functional-audit.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`[functional-audit] Relatórios: ${defaultDir}`);
}

console.log(`[functional-audit] ${report.summary.ok}/${report.summary.surfaces} superfícies sem falha estrutural; ${report.errors.length} bloqueio(s); ${report.warnings.length} aviso(s).`);
for (const error of report.errors) console.error(`✗ ${error}`);
for (const warning of report.warnings) console.warn(`! ${warning}`);
if (strict && report.errors.length) process.exitCode = 1;
