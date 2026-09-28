import fs from 'node:fs';

/**
 * Menu premium: ordem por importância, grupos coerentes e um ícone por destino.
 *
 * Roda no fim da cadeia, e não dentro de v14337, porque o menu final é montado por
 * vários scripts (v14337 escreve o bloco, compatibility.mjs e v1434/v1435/v14317
 * reinserem destinos, v14343 e v14344 reescrevem cabeçalho e botão casando string
 * exata). Reordenar na origem quebraria essas âncoras. Aqui o bloco já está pronto:
 * este passo lê os itens que existem, reagrupa e devolve — sem tocar no JSX do botão,
 * que é contrato do v14344, nem no cabeçalho, que é contrato do v14343/p0-fast-logout.
 *
 * Destino que apareça na origem e não esteja na política não é descartado: cai em
 * "Outros destinos". Perder entrada de menu é perder a única porta de uma tela.
 */

const HOME = 'client/src/pages/Home.tsx';
const MARKER = 'ordem por importância operacional — p1-menu-premium';

/** Ordem dos grupos = ordem do dia do tripulante, do agora ao eventual. */
const GROUPS = [
  { title: 'Hoje', views: ['cockpit', 'roster', 'compare'] },
  { title: 'Preparação', views: ['departure', 'wakeup', 'presentation', 'weather', 'mycar'] },
  { title: 'Em operação', views: ['radar', 'alerts', 'regulation', 'load', 'emergency'] },
  { title: 'Escala e planejamento', views: ['import', 'iflight', 'bids', 'map', 'database'] },
  { title: 'Financeiro', views: ['perdiem', 'salary', 'crew'] },
  { title: 'Rotina e apoio', views: ['routine', 'life', 'hotels', 'gyms', 'concierge', 'community'] },
  { title: 'Documentos', views: ['crewlocker', 'crewlock', 'reports', 'calendar', 'exports'] },
  { title: 'Conta, ajuda e segurança', views: ['settings', 'plans', 'guardian', 'manual', 'support'] },
];

const ADMIN_GROUP = { title: 'Administração', views: ['updates', 'maintenance', 'admin'] };
const FALLBACK_GROUP = { title: 'Outros destinos', views: [] };

/**
 * Um ícone por destino.
 *
 * Antes ShieldCheck servia regulamentação, emergência, rotina, Life, assinatura e
 * admin ao mesmo tempo; BriefcaseBusiness servia carga, diárias e Crew Locker. Ícone
 * repetido em seis linhas não identifica nada — o olho passa a ler só o texto.
 *
 * O RÓTULO é chave: atlas-1c-semantic-navigation.css escolhe o tom de cor do item por
 * [data-menu-label]. Renomear aqui sem atualizar lá tira a cor do item, sem erro
 * nenhum. Por isso só as descrições mudaram; os rótulos são os que já existiam.
 * A regressão cobre os dois lados.
 */
const OVERRIDES = {
  cockpit: ['FlightDeck', 'Sequência operacional do dia', 'HomeIcon'],
  roster: ['Escala oficial', 'Todos os dias e programações', 'CalendarDays'],
  compare: ['Planejado x atual', 'Mudanças da escala publicada', 'GitCompareArrows'],

  departure: ['Saída Inteligente', 'Quando sair, rota e trânsito', 'Navigation'],
  wakeup: ['Despertador', 'Alarmes e canais configurados', 'BellRing'],
  presentation: ['Apresentação', 'Horário publicado e ajustes', 'Clock'],
  weather: ['Meteorologia', 'METAR, TAF e alertas', 'CloudSun'],
  mycar: ['Meu carro', 'Estacionamento e deslocamento', 'Car'],

  radar: ['Radar de voos', 'Portão, terminal e status', 'Radar'],
  alerts: ['Irregularidades', 'Alertas confirmados', 'AlertTriangle'],
  regulation: ['Regulamentação', 'RBAC 117, ACT e limites', 'ShieldCheck'],
  load: ['Carga de trabalho', 'Horas usadas e disponíveis', 'Gauge'],
  emergency: ['Emergência', 'Contatos e orientação já configurados', 'Siren'],

  import: ['Importar escala', 'PDF oficial da empresa', 'Upload'],
  iflight: ['Push iFlight', 'Importação assistida pelo iFlight', 'Plane'],
  bids: ['BIDS / PBS', 'Preferências da próxima escala', 'CalendarPlus'],
  map: ['Mapa do mês', 'Rotas publicadas', 'MapIcon'],
  database: ['Histórico', 'Escalas salvas', 'History'],

  perdiem: ['Diárias', 'Previsão semanal e mensal', 'Banknote'],
  salary: ['Salário', 'Produção e adicionais', 'DollarSign'],
  crew: ['Tripulação e função', 'Composição e adicionais', 'Users'],

  routine: ['Rotina', 'Descanso, treino e preparação', 'Dumbbell'],
  life: ['CrewCheck Life', 'Bem-estar e dados pessoais opcionais', 'HeartPulse'],
  hotels: ['Hotéis', 'Pernoite e entorno', 'Hotel'],
  gyms: ['Locais próximos', 'Academias, saúde e serviços', 'MapPin'],
  concierge: ['Concierge', 'Perguntas sobre a escala', 'MessageCircle'],
  community: ['Pessoas e visitantes', 'Compartilhamento e contatos', 'UserPlus'],

  // Crew Locker e CrewLock são telas diferentes com nomes quase iguais, e estavam em
  // grupos distantes um do outro. Ficam lado a lado, e a descrição diz qual é qual.
  crewlocker: ['Crew Locker', 'Documentos no aparelho, com validade', 'FileLock2'],
  crewlock: ['CrewLock', 'Cofre de arquivos protegido por PIN', 'LockKeyhole'],
  reports: ['Relatórios', 'Indicadores da operação', 'BarChart3'],
  calendar: ['Calendário', 'Google Calendar e ICS', 'CalendarCheck2'],
  exports: ['Exportar', 'PDF e compartilhamento', 'Share2'],

  settings: ['Configurações', 'Perfil e preferências', 'Settings'],
  plans: ['Assinaturas', 'Plano e franquias', 'Crown'],
  guardian: ['Guardian', 'QR de emergência protegido', 'QrCode'],
  manual: ['Manual CrewCheck', 'Ajuda e orientação de uso', 'BookOpen'],
  support: ['Suporte', 'Problemas e sugestões', 'LifeBuoy'],

  updates: ['Atualizações', 'Hotfix e pacote interno', 'RefreshCw'],
  maintenance: ['Manutenção', 'Prévia administrativa', 'Wrench'],
  admin: ['Admin', 'Saúde, termos e operação', 'Shield'],
};

/** Ícones que a política usa e que o Home.tsx ainda não importa. */
const REQUIRED_ICONS = [
  'BellRing', 'Gauge', 'Siren', 'CalendarPlus', 'History', 'Banknote', 'Users', 'UserPlus',
  'FileLock2', 'LockKeyhole', 'BarChart3', 'CalendarCheck2', 'Crown', 'RefreshCw', 'Wrench', 'Shield',
];

const ITEM = /\['([A-Za-z][A-Za-z0-9_]*)','([^']*)','([^']*)',\s*([A-Za-z_][A-Za-z0-9_]*)\]/g;

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[p1-menu-premium] ${path} ausente.`);
  return fs.readFileSync(path, 'utf8');
}

function parseItems(literal) {
  const items = new Map();
  for (const match of literal.matchAll(ITEM)) {
    items.set(match[1], { view: match[1], label: match[2], desc: match[3], icon: match[4] });
  }
  return items;
}

function renderItem(item) {
  const override = OVERRIDES[item.view];
  const label = override ? override[0] : item.label;
  const desc = override ? override[1] : item.desc;
  const icon = override ? override[2] : item.icon;
  return `      ['${item.view}','${label}','${desc}',${icon}],`;
}

function renderGroup(group, items) {
  const lines = group.views
    .filter((view) => items.has(view))
    .map((view) => renderItem(items.get(view)));
  if (!lines.length) return '';
  return `    { title: '${group.title}', items: [\n${lines.join('\n')}\n    ] },`;
}

function boundedSlice(source, open, closeToken, context) {
  const start = source.indexOf(open);
  if (start < 0) throw new Error(`[p1-menu-premium] ${context} não localizado.`);
  const end = source.indexOf(closeToken, start);
  if (end < 0) throw new Error(`[p1-menu-premium] fim de ${context} não localizado.`);
  return { start, end: end + closeToken.length };
}

const home = read(HOME);
if (home.includes(MARKER)) {
  console.log('[p1-menu-premium] Menu já normalizado; nada a fazer.');
} else {
  const menuStart = home.indexOf('function MenuDrawer(');
  const menuEnd = home.indexOf('function Cockpit(', menuStart);
  if (menuStart < 0 || menuEnd < 0) throw new Error('[p1-menu-premium] MenuDrawer não localizado.');
  const block = home.slice(menuStart, menuEnd);

  const groupsRange = boundedSlice(block, '  const groups: Array<{ title: string; items: MenuItem[] }> = [', '\n  ];', 'declaração de grupos');
  const adminRange = boundedSlice(block, '  if (admin) groups.push({', '] });', 'grupo de administração');

  const groupsLiteral = block.slice(groupsRange.start, groupsRange.end);
  const adminLiteral = block.slice(adminRange.start, adminRange.end);

  const groupItems = parseItems(groupsLiteral);
  const adminItems = parseItems(adminLiteral);
  if (!groupItems.size) throw new Error('[p1-menu-premium] Nenhum destino encontrado no menu.');

  const placed = new Set(GROUPS.flatMap((group) => group.views));
  const leftovers = [...groupItems.keys()].filter((view) => !placed.has(view));
  const policy = leftovers.length
    ? [...GROUPS, { ...FALLBACK_GROUP, views: leftovers }]
    : GROUPS;

  const rendered = policy.map((group) => renderGroup(group, groupItems)).filter(Boolean);
  const nextGroups = [
    `  // ${MARKER}: do que acontece agora para o que é eventual.`,
    '  const groups: Array<{ title: string; items: MenuItem[] }> = [',
    ...rendered,
    '  ];',
  ].join('\n');

  const adminLines = ADMIN_GROUP.views
    .filter((view) => adminItems.has(view))
    .map((view) => renderItem(adminItems.get(view)));
  const adminLeftovers = [...adminItems.keys()].filter((view) => !ADMIN_GROUP.views.includes(view));
  for (const view of adminLeftovers) adminLines.push(renderItem(adminItems.get(view)));
  const nextAdmin = `  if (admin) groups.push({ title: '${ADMIN_GROUP.title}', items: [\n${adminLines.join('\n')}\n  ] });`;

  let nextBlock = block.slice(0, groupsRange.start) + nextGroups + block.slice(groupsRange.end);
  const shiftedAdmin = boundedSlice(nextBlock, '  if (admin) groups.push({', '] });', 'grupo de administração');
  nextBlock = nextBlock.slice(0, shiftedAdmin.start) + nextAdmin + nextBlock.slice(shiftedAdmin.end);

  const before = parseItems(block);
  const after = parseItems(nextBlock);
  for (const view of before.keys()) {
    if (!after.has(view)) throw new Error(`[p1-menu-premium] Destino perdido na reorganização: ${view}`);
  }
  if (after.size !== before.size) throw new Error('[p1-menu-premium] Contagem de destinos mudou na reorganização.');

  let nextHome = home.slice(0, menuStart) + nextBlock + home.slice(menuEnd);

  const importMatch = nextHome.match(/import \{([^}]+)\} from 'lucide-react';/);
  if (!importMatch) throw new Error('[p1-menu-premium] Import do lucide-react não localizado.');
  const declared = new Set(importMatch[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean));
  const missing = REQUIRED_ICONS.filter((icon) => !declared.has(icon));
  if (missing.length) {
    // A lista do lucide é multilinha e termina em vírgula. Cortar só o espaço deixaria
    // "Search,, BellRing" — import inválido.
    const body = importMatch[1].replace(/[\s,]*$/, '');
    const multiline = importMatch[1].includes('\n');
    const appended = multiline
      ? `${body},\n  ${missing.join(',\n  ')},\n`
      : `${body}, ${missing.join(', ')} `;
    nextHome = nextHome.replace(importMatch[0], `import {${appended}} from 'lucide-react';`);
  }

  const used = [...after.values()].map((item) => (OVERRIDES[item.view] ? OVERRIDES[item.view][2] : item.icon));
  for (const icon of used) {
    const local = icon === 'HomeIcon' ? 'Home as HomeIcon' : icon === 'MapIcon' ? 'Map as MapIcon' : icon;
    if (!declared.has(icon) && !REQUIRED_ICONS.includes(icon) && !nextHome.includes(local)) {
      throw new Error(`[p1-menu-premium] Ícone sem import: ${icon}`);
    }
  }

  fs.writeFileSync(HOME, nextHome, 'utf8');
  console.log(`[p1-menu-premium] Menu reorganizado: ${policy.length} grupos, ${after.size} destinos, ícone único por destino.`);
}
