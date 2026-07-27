import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error('[v14337-compat] Home.tsx ausente.');
let source = fs.readFileSync(homePath, 'utf8');

const oldMenuViews = "'compare','load','concierge']";
const newMenuViews = "'compare','load','concierge','life','manual','guardian','support']";
if (!source.includes(newMenuViews)) {
  if (!source.includes(oldMenuViews)) throw new Error('[v14337-compat] Lista de views do menu inferior não localizada.');
  source = source.replace(oldMenuViews, newMenuViews);
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
const newDocuments = `    { title: 'Documentos', items: [
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
if (!source.includes(newDocuments)) {
  if (!source.includes(oldDocuments)) throw new Error('[v14337-compat] Grupo Documentos e conta não localizado.');
  source = source.replace(oldDocuments, newDocuments);
}

const oldCockpitSignature = "function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {";
const compatibleCockpitSignature = "function Cockpit({ events, compliance, setView, onUpload, openMenu }: { bundle?: BundleState; events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {";
if (!source.includes(compatibleCockpitSignature)) {
  if (!source.includes(oldCockpitSignature)) throw new Error('[v14337-compat] Contrato do Cockpit/FlyDeck não localizado.');
  source = source.replace(oldCockpitSignature, compatibleCockpitSignature);
}

for (const marker of ["['life','CrewCheck Life'", "['manual','Manual CrewCheck'", "['guardian','Guardian'", "['support','Suporte'", 'bundle?: BundleState']) {
  if (!source.includes(marker)) throw new Error(`[v14337-compat] Contrato preservado ausente: ${marker}`);
}

fs.writeFileSync(homePath, source, 'utf8');
console.log('[v14337-compat] Life, Manual, Guardian, Suporte e contrato bundle do FlyDeck preservados.');
