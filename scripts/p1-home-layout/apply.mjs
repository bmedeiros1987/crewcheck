import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p1-home-layout] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

const importLine = "import { HomeLayoutShell, type HomeLayoutSlot } from '@/components/v1391/HomeLayoutShell';";
if (!source.includes(importLine)) {
  const typeAnchor = '\ntype ZeroView =';
  if (!source.includes(typeAnchor)) throw new Error('[p1-home-layout] limite estrutural dos imports não localizado');
  source = source.replace(typeAnchor, `\n${importLine}\n${typeAnchor.slice(1)}`);
}

if (!source.includes('function PersonalizedCockpit(')) {
  const start = source.indexOf('function Cockpit(');
  const end = source.indexOf('\nfunction rosterCode', start);
  if (start < 0 || end < 0) throw new Error('[p1-home-layout] Cockpit não localizado');
  const cockpit = source.slice(start, end);
  const returnStart = cockpit.lastIndexOf('  return <>');
  const returnEnd = cockpit.lastIndexOf('</>;');
  if (returnStart < 0 || returnEnd < returnStart) throw new Error('[p1-home-layout] retorno canônico do Cockpit não localizado');
  const wrappedCockpit = cockpit.slice(0, returnStart)
    + '  return <PersonalizedCockpit events={events} compliance={compliance} setView={setView} onUpload={onUpload} openMenu={openMenu} canonicalContent={<>'
    + cockpit.slice(returnStart + '  return <>'.length, returnEnd)
    + '</>} />;'
    + cockpit.slice(returnEnd + '</>;'.length);
  source = source.slice(0, start) + wrappedCockpit + source.slice(end);
  const block = `function PersonalizedCockpit({ events, compliance, setView, onUpload, openMenu, canonicalContent }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void; canonicalContent: React.ReactNode }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const dutyLimit = event.kind === 'flight' && !event.placeholder ? getPublishedDutyLimitSummary(event.day, compliance?.legalProfile) : null;
  const slots: HomeLayoutSlot[] = [
    {
      id: 'summary',
      label: 'Resumo operacional',
      description: 'Alertas operacionais e acesso ao painel completo.',
      content: <button className="cz-mini-status" onClick={() => setView('alerts')}><Bell/><strong>Alertas operacionais</strong><span>{alertCount ? alertCount + ' confirmado(s)' : 'Nenhum alerta confirmado'}</span><ChevronRight/></button>,
    },
    {
      id: 'finance',
      label: 'Atalhos financeiros',
      description: 'Diárias e salário no motor financeiro único.',
      content: <section className="cz-money-row">
        <div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>Abrir</strong></div>
        <div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>Financeiro</strong></div>
      </section>,
    },
    {
      id: 'next',
      label: 'Próxima programação',
      description: 'Ação principal e programação canônica.',
      content: <>
        <section className="cz-section-head"><h2>Próxima Programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver todas' : 'Importar'} <ChevronRight size={18}/></button></section>
        {loaded && !event.placeholder
          ? <FlightCard event={event}/>
          : <article className="cz-empty-real"><Upload/><h2>{loaded ? 'Nenhuma programação futura' : 'Nenhuma escala real carregada'}</h2><p>{loaded ? 'A escala foi carregada, mas não há evento operacional futuro após agora. Confira se o período importado está correto.' : 'Suba o PDF oficial para ativar a escala completa e os recursos operacionais com dados reais.'}</p><button onClick={onUpload}>Importar PDF agora</button></article>}
      </>,
    },
    {
      id: 'limits',
      label: 'Alertas e limites',
      description: 'Alertas operacionais não podem ser ocultados.',
      content: dutyLimit
        ? <button className="cz-mini-status" onClick={() => setView('regulation')}><ShieldCheck/><strong>Limite desta jornada</strong><span>{dutyLimit.usedHours.toFixed(1).replace('.', ',')} h de {dutyLimit.maxDutyHours.toFixed(1).replace('.', ',')} h · margem {Math.max(0, dutyLimit.remainingHours).toFixed(1).replace('.', ',')} h</span><ChevronRight/></button>
        : null,
    },
    {
      id: 'smart',
      label: 'Próxima ação inteligente',
      description: 'Contexto da programação sem recalcular regras.',
      content: <SmartCard event={event} setView={setView}/>,
    },
  ];

  return <HomeLayoutShell slots={slots} standardContent={canonicalContent}/>;
}
`;
  const wrapperAnchor = source.indexOf('\nfunction rosterCode', start);
  source = source.slice(0, wrapperAnchor) + '\n' + block + source.slice(wrapperAnchor);
}


// Alert visibility is finalized here because later canonical generators materialize Home.tsx.
const alertVisibilityImports = "import { currentAccountId } from '@/lib/rosterChangeAwareness';\nimport {\n  activeComplianceAlerts,\n  complianceAlertFingerprint,\n  dismissComplianceAlertUntilRosterUpdate,\n  filterActionableComplianceAlerts,\n  informationalComplianceAlerts,\n  readComplianceAlertDismissals,\n  resetComplianceAlertDismissals,\n  visibleInformationalComplianceAlerts,\n} from '@/lib/complianceAlertVisibility';\n";
if (!source.includes("from '@/lib/complianceAlertVisibility'")) {
  const typeAnchor = '\ntype ZeroView =';
  if (!source.includes(typeAnchor)) throw new Error('[p1-home-layout] limite estrutural de alertas não localizado');
  source = source.replace(typeAnchor, '\n' + alertVisibilityImports + typeAnchor.slice(1));
}
const pulseImportBefore = "import { crewCheckNotificationPermission, publishCrewCheckNotice, requestCrewCheckNotificationPermission, setCrewCheckDeviceNotificationsEnabled } from '@/components/pulse/pulseRuntime';";
const pulseImportAfter = "import { crewCheckNotificationPermission, currentCrewCheckPulseState, dismissCrewCheckPulse, publishCrewCheckNotice, requestCrewCheckNotificationPermission, setCrewCheckDeviceNotificationsEnabled } from '@/components/pulse/pulseRuntime';";
if (source.includes(pulseImportBefore)) source = source.replace(pulseImportBefore, pulseImportAfter);
if (!source.includes('currentCrewCheckPulseState')) throw new Error('[p1-home-layout] runtime Pulse incompatível com visibilidade dos alertas');

if (source.includes('\ntype ComplianceAlertDisposition')) {
  const actionableStart = source.indexOf('function actionableComplianceAlerts(');
  const dispositionStart = source.indexOf('\ntype ComplianceAlertDisposition', actionableStart);
  const analyzeStart = source.indexOf('\nfunction analyzeSafe(', dispositionStart);
  if (actionableStart < 0 || dispositionStart < 0 || analyzeStart < 0) throw new Error('[p1-home-layout] bloco legado de alertas não localizado');
  source = source.slice(0, actionableStart) + "function complianceAlertRosterRevision(): string {\n  try {\n    const payload = JSON.parse(storage.get('crewcheck_latest_roster_bundle', 'null'));\n    const roster = payload?.roster || payload;\n    return String(payload?.updatedAt || rosterFingerprint(roster) || 'unversioned-roster');\n  } catch {\n    return 'unversioned-roster';\n  }\n}\n\nfunction complianceAlertStorage(): Storage | null {\n  try { return window.localStorage; } catch { return null; }\n}\n\nfunction actionableComplianceAlerts(compliance: ComplianceResult | null): any[] {\n  const raw = Array.isArray((compliance as any)?.alerts) ? (compliance as any).alerts : [];\n  const store = complianceAlertStorage();\n  if (!store) return filterActionableComplianceAlerts(raw);\n  return activeComplianceAlerts(raw, store, currentAccountId(), complianceAlertRosterRevision());\n}\n" + source.slice(analyzeStart + 1);
}

if (source.includes('function Alerts({ compliance }:')) {
  const alertsStart = source.indexOf('function Alerts({ compliance }:');
  const alertsEnd = source.indexOf('\nfunction routeDurationMinutes', alertsStart);
  if (alertsEnd < 0) throw new Error('[p1-home-layout] tela legada de alertas não localizada');
  source = source.slice(0, alertsStart) + "function Alerts({ compliance }: { compliance: ComplianceResult | null }) {\n  const [, setDispositionRevision] = useState(0);\n  const store = complianceAlertStorage();\n  const accountId = currentAccountId();\n  const rosterRevision = complianceAlertRosterRevision();\n  const raw = Array.isArray((compliance as any)?.alerts) ? (compliance as any).alerts : [];\n  const list = actionableComplianceAlerts(compliance).slice(0, 12);\n  const informational = store\n    ? visibleInformationalComplianceAlerts(raw, store, accountId, rosterRevision)\n    : informationalComplianceAlerts(raw);\n  const dismissedCount = store\n    ? readComplianceAlertDismissals(store, accountId, rosterRevision).length\n    : 0;\n\n  function ignoreUntilRosterUpdate(alert: any) {\n    if (!store || !dismissComplianceAlertUntilRosterUpdate(store, accountId, rosterRevision, alert)) return;\n    const pulse = currentCrewCheckPulseState().message as ({ category?: string } | null);\n    if (pulse?.category === 'compliance') dismissCrewCheckPulse();\n    setDispositionRevision((value) => value + 1);\n    toast.success('Alerta ocultado até a próxima atualização da escala.', {\n      description: 'Uma nova importação ou sincronização refará a análise e poderá exibi-lo novamente.',\n    });\n  }\n\n  function restoreIgnoredAlerts() {\n    if (!store) return;\n    resetComplianceAlertDismissals(store, accountId);\n    setDispositionRevision((value) => value + 1);\n  }\n\n  return <>\n    <Brand back/>\n    <section className=\"cz-panel-head\">\n      <h1>Irregularidades e alertas</h1>\n      <p>Primeiro aparecem ocorrências que exigem ação. Explicações e análises incompletas ficam recolhidas abaixo.</p>\n    </section>\n    {list.length\n      ? <section className=\"cz-alert-stack\">{list.map((alert: any, idx: number) => {\n          const warning = String(alert.severity || '').toLowerCase() === 'warning';\n          return <article className={alert.severity === 'error' ? 'danger' : 'warn'} key={`${complianceAlertFingerprint(alert)}-${idx}`}>\n            <AlertTriangle/>\n            <div>\n              <h2>{alert.title}</h2>\n              <p>{alert.description}</p>\n              <span>{alert.severity === 'error' ? 'Confirmada' : 'Atenção'}</span>\n              <b>Confiança: {alert.severity === 'error' ? 'alta' : 'média'}</b>\n              {warning && <button type=\"button\" onClick={() => ignoreUntilRosterUpdate(alert)}>Ignorar até a próxima atualização</button>}\n            </div>\n            <ChevronRight/>\n          </article>;\n        })}</section>\n      : <article className=\"cz-empty-real\">\n          <ShieldCheck/>\n          <h2>Nenhuma irregularidade ativa</h2>\n          <p>{dismissedCount ? 'Os avisos dispensados voltarão a ser avaliados na próxima atualização da escala.' : 'Não há ocorrência confirmada que exija ação agora.'}</p>\n        </article>}\n    {dismissedCount > 0 && <article className=\"cz-alert-detail\">\n      <h2>Ocultados até a próxima atualização <b>{dismissedCount}</b></h2>\n      <footer><button onClick={restoreIgnoredAlerts}><RotateCcw/> Mostrar novamente agora</button></footer>\n    </article>}\n    {informational.length > 0 && <details className=\"cz-alert-detail\">\n      <summary>Análises incompletas <b>{informational.length}</b></summary>\n      <div>\n        {informational.map((alert) => <div key={complianceAlertFingerprint(alert)}>\n          <p><strong>{alert.title || 'Histórico insuficiente'}</strong> {alert.description}</p>\n          {alert.coverage?.missingDates?.length ? <p><strong>Cobertura faltante</strong> {alert.coverage.missingDates.length} dia(s) necessários para a janela de {alert.coverage.windowDays || 28} dias.</p> : null}\n          {alert.details ? <p>{alert.details}</p> : null}\n          <button type=\"button\" onClick={() => ignoreUntilRosterUpdate(alert)}>Ignorar até a próxima atualização</button>\n        </div>)}\n      </div>\n    </details>}\n    <details className=\"cz-alert-detail\">\n      <summary>Como o CrewCheck analisa</summary>\n      <div>\n        <p><strong>O que o sistema avalia</strong> Jornada, repouso, madrugadas, limites, reserva, sobreaviso, acionamento, pernoite e alterações.</p>\n        <p><strong>Dados usados</strong> Somente a escala importada ou sincronizada. Dados demonstrativos foram removidos.</p>\n      </div>\n    </details>\n  </>;\n}\n" + source.slice(alertsEnd);
}
for (const marker of [
  "from '@/lib/complianceAlertVisibility'",
  'function complianceAlertRosterRevision()',
  'Ignorar até a próxima atualização',
  'Análises incompletas',
  'visibleInformationalComplianceAlerts',
]) {
  if (!source.includes(marker)) throw new Error('[p1-home-layout] materialização de alertas incompleta: ' + marker);
}

fs.writeFileSync(path, source, 'utf8');
console.log('[p1-home-layout] modos Padrão, Personalizada e Mista materializados após finalizadores canônicos.');
