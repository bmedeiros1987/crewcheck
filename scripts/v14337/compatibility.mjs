import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error('[v14337-compat] Home.tsx ausente.');
let source = fs.readFileSync(homePath, 'utf8');

const oldMenuViews = "'compare','load','concierge']";
const partialMenuViews = "'compare','load','concierge','life','manual','guardian','support']";
const completeMenuViews = "'compare','load','concierge','life','manual','guardian','support','crewlock','emergency','crewlocker']";
if (!source.includes(completeMenuViews)) {
  if (source.includes(partialMenuViews)) source = source.replace(partialMenuViews, completeMenuViews);
  else if (source.includes(oldMenuViews)) source = source.replace(oldMenuViews, completeMenuViews);
  else throw new Error('[v14337-compat] Lista de views do menu inferior não localizada.');
}

const bottomStart = source.indexOf('function BottomNav(');
const bottomEnd = bottomStart >= 0 ? source.indexOf('function KpiCard(', bottomStart) : -1;
if (bottomStart < 0 || bottomEnd < 0) throw new Error('[v14337-compat] Bloco BottomNav não localizado.');
let bottomBlock = source.slice(bottomStart, bottomEnd);
if (!bottomBlock.includes('createPortal(<nav className="cz-bottom-nav"')) {
  const directStart = '  return <nav className="cz-bottom-nav" aria-label="Navegação principal">';
  const directEnd = '  })}</nav>;\n}';
  if (!bottomBlock.includes(directStart) || !bottomBlock.includes(directEnd)) throw new Error('[v14337-compat] Rodapé direto sem âncora segura.');
  bottomBlock = bottomBlock
    .replace(directStart, '  return createPortal(<nav className="cz-bottom-nav" aria-label="Navegação principal">')
    .replace(directEnd, '  })}</nav>, document.body);\n}');
  source = `${source.slice(0, bottomStart)}${bottomBlock}${source.slice(bottomEnd)}`;
}

const oldOperation = `      ['radar','Radar de voos','Portão, terminal e status',Radar],
      ['alerts','Irregularidades','Alertas confirmados',AlertTriangle],
      ['regulation','Regulamentação','RBAC 117, ACT e limites',ShieldCheck],
      ['load','Carga de trabalho','Horas usadas e disponíveis',BriefcaseBusiness],`;
const newOperation = `      ['radar','Radar de voos','Portão, terminal e status',Radar],
      ['alerts','Irregularidades','Alertas confirmados',AlertTriangle],
      ['regulation','Regulamentação','RBAC 117, ACT e limites',ShieldCheck],
      ['load','Carga de trabalho','Horas usadas e disponíveis',BriefcaseBusiness],
      ['emergency','Emergência','Contatos e orientação já configurados',ShieldCheck],`;
if (!source.includes(newOperation)) {
  if (!source.includes(oldOperation)) throw new Error('[v14337-compat] Grupo Em operação não localizado.');
  source = source.replace(oldOperation, newOperation);
}

const oldPlanning = `      ['bids','BIDS / PBS','Preferências da próxima escala',CalendarDays],
      ['map','Mapa do mês','Rotas publicadas',MapIcon],
      ['database','Histórico','Escalas salvas',Database],`;
const newPlanning = `      ['bids','BIDS / PBS','Preferências da próxima escala',CalendarDays],
      ['map','Mapa do mês','Rotas publicadas',MapIcon],
      ['database','Histórico','Escalas salvas',Database],
      ['crewlocker','Crew Locker','Documentos e itens da tripulação',BriefcaseBusiness],`;
if (!source.includes(newPlanning)) {
  if (!source.includes(oldPlanning)) throw new Error('[v14337-compat] Grupo Escala e planejamento não localizado.');
  source = source.replace(oldPlanning, newPlanning);
}

const oldRoutine = `      ['routine','Rotina','Descanso, treino e preparação',ShieldCheck],
      ['community','Pessoas e visitantes','Compartilhamento e contatos',UserRound],`;
const newRoutine = `      ['routine','Rotina','Descanso, treino e preparação',ShieldCheck],
      ['community','Pessoas e visitantes','Compartilhamento e contatos',UserRound],
      ['life','CrewCheck Life','Bem-estar e dados pessoais opcionais',ShieldCheck],`;
if (!source.includes(newRoutine)) {
  if (!source.includes(oldRoutine)) throw new Error('[v14337-compat] Grupo Rotina e apoio não localizado.');
  source = source.replace(oldRoutine, newRoutine);
}

const oldDocuments = `    { title: 'Documentos e conta', items: [
      ['reports','Relatórios','Indicadores existentes',FileText],
      ['calendar','Calendário','Google Calendar e ICS',CalendarDays],
      ['exports','Exportar','PDF e compartilhamento',Share2],
      ['plans','Assinaturas','Plano e franquias',ShieldCheck],
      ['settings','Configurações','Perfil e preferências',Settings],
    ] },`;
const partialDocuments = `    { title: 'Documentos', items: [
      ['reports','Relatórios','Indicadores existentes',FileText],
      ['calendar','Calendário','Google Calendar e ICS',CalendarDays],
      ['exports','Exportar','PDF e compartilhamento',Share2],
    ] },
    { title: 'Conta, ajuda e segurança', items: [
      ['plans','Assinaturas','Plano e franquias',ShieldCheck],
      ['settings','Configurações','Perfil e preferências',Settings],
      ['manual','Manual CrewCheck','Ajuda e orientação de uso',FileText],
      ['guardian','Guardian','QR de emergência protegido',QrCode],
      ['support','Suporte','Problemas e sugestões',LifeBuoy],
    ] },`;
const completeDocuments = `    { title: 'Documentos', items: [
      ['reports','Relatórios','Indicadores existentes',FileText],
      ['calendar','Calendário','Google Calendar e ICS',CalendarDays],
      ['exports','Exportar','PDF e compartilhamento',Share2],
    ] },
    { title: 'Conta, ajuda e segurança', items: [
      ['plans','Assinaturas','Plano e franquias',ShieldCheck],
      ['settings','Configurações','Perfil e preferências',Settings],
      ['manual','Manual CrewCheck','Ajuda e orientação de uso',FileText],
      ['guardian','Guardian','QR de emergência protegido',QrCode],
      ['support','Suporte','Problemas e sugestões',LifeBuoy],
      ['crewlock','CrewLock','Documentos protegidos existentes',Lock],
    ] },`;
if (!source.includes(completeDocuments)) {
  if (source.includes(partialDocuments)) source = source.replace(partialDocuments, completeDocuments);
  else if (source.includes(oldDocuments)) source = source.replace(oldDocuments, completeDocuments);
  else throw new Error('[v14337-compat] Grupos Documentos/Conta não localizados.');
}

const oldCockpitSignature = "function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {";
const compatibleCockpitSignature = "function Cockpit({ events, compliance, setView, onUpload, openMenu }: { bundle?: BundleState; events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {";
if (!source.includes(compatibleCockpitSignature)) {
  if (!source.includes(oldCockpitSignature)) throw new Error('[v14337-compat] Contrato do Cockpit/FlyDeck não localizado.');
  source = source.replace(oldCockpitSignature, compatibleCockpitSignature);
}

for (const marker of [
  "['life','CrewCheck Life'", "['manual','Manual CrewCheck'", "['guardian','Guardian'", "['support','Suporte'",
  "['crewlock','CrewLock'", "['emergency','Emergência'", "['crewlocker','Crew Locker'",
  'bundle?: BundleState', 'createPortal(<nav className="cz-bottom-nav"',
]) {
  if (!source.includes(marker)) throw new Error(`[v14337-compat] Contrato preservado ausente: ${marker}`);
}

fs.writeFileSync(homePath, source, 'utf8');
console.log('[v14337-compat] Destinos existentes, contrato bundle e portal mobile do FlyDeck preservados.');
