import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const current = fs.readFileSync(path, 'utf8');
  const next = transform(current);
  if (next !== current) fs.writeFileSync(path, next, 'utf8');
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;

  if (!next.includes('function crewcheckAdminAuditAllowed')) {
    next = next.replace(
      'export default function Home() {',
      `function crewcheckAdminAuditAllowed(): boolean {
  const user = getStoredUser() as any;
  const email = String(user?.email || '').trim().toLowerCase();
  return ADMIN_EMAILS.includes(email) || Boolean(user?.isAdmin || user?.admin || user?.role === 'admin');
}

function crewcheckAuditRosterName(roster: CrewRoster): string {
  return String((roster as any)?.crewName || (roster as any)?.name || 'Tripulante de teste').trim() || 'Tripulante de teste';
}

export default function Home() {`,
    );
  }

  if (!next.includes("const [auditMode, setAuditMode]")) {
    next = next.replace(
      '  const [presentationRevision, setPresentationRevision] = useState(0);',
      `  const [presentationRevision, setPresentationRevision] = useState(0);
  const [auditMode, setAuditMode] = useState(() => sessionStorage.getItem('crewcheck_admin_audit_mode') === '1');
  const [auditName, setAuditName] = useState(() => sessionStorage.getItem('crewcheck_admin_audit_name') || '');`,
    );
  }

  if (!next.includes('function exitRosterAuditMode()')) {
    next = next.replace(
      '  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {',
      `  function exitRosterAuditMode() {
    try {
      const backupRaw = sessionStorage.getItem('crewcheck_admin_audit_backup');
      if (backupRaw) {
        const backup = JSON.parse(backupRaw) as BundleState;
        if (backup?.roster) setBundle(backup);
      } else {
        setBundle(loadRoster());
      }
      sessionStorage.removeItem('crewcheck_admin_audit_mode');
      sessionStorage.removeItem('crewcheck_admin_audit_name');
      sessionStorage.removeItem('crewcheck_admin_audit_source');
      sessionStorage.removeItem('crewcheck_admin_audit_backup');
      setAuditMode(false);
      setAuditName('');
      setView('cockpit');
      toast.success('Modo auditoria encerrado. Sua escala pessoal foi restaurada.');
    } catch {
      sessionStorage.removeItem('crewcheck_admin_audit_mode');
      setAuditMode(false);
      setBundle(loadRoster());
      setView('cockpit');
    }
  }

  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {`,
    );
  }

  next = next.replace(
`      const decision = confirmRosterImport(roster, file.name);
      if (!decision.ok) {
        toast.message(decision.toastText || 'Importação cancelada.');
        return;
      }`,
`      const decision = confirmRosterImport(roster, file.name);
      let auditImport = false;
      if (!decision.ok) {
        const adminAudit = crewcheckAdminAuditAllowed() && window.confirm(
          \`${'${decision.toastText || "A escala não corresponde ao perfil ativo."}'}\\n\\nImportar somente em Modo Auditoria? Nenhum alerta, Telegram, calendário, despertador ou sincronização será disparado.\`,
        );
        if (!adminAudit) {
          toast.message(decision.toastText || 'Importação cancelada.');
          return;
        }
        auditImport = true;
      }`,
  );

  next = next.replace(
`      const plannedSnapshot = preservePlannedRosterBeforeImport(bundle, roster);`,
`      if (auditImport) {
        const auditCompliance = analyzeSafe(roster);
        try {
          sessionStorage.setItem('crewcheck_admin_audit_backup', JSON.stringify(bundle));
          sessionStorage.setItem('crewcheck_admin_audit_mode', '1');
          sessionStorage.setItem('crewcheck_admin_audit_name', crewcheckAuditRosterName(roster));
          sessionStorage.setItem('crewcheck_admin_audit_source', file.name);
        } catch {}
        setBundle({ roster, compliance: auditCompliance, source: \`AUDITORIA · ${'${file.name}'}\` });
        setAuditMode(true);
        setAuditName(crewcheckAuditRosterName(roster));
        setView('roster');
        toast.success(\`Escala de ${'${crewcheckAuditRosterName(roster)}'} aberta em modo auditoria.\`);
        return;
      }
      const plannedSnapshot = preservePlannedRosterBeforeImport(bundle, roster);`,
  );

  if (!next.includes('cc-audit-mode-banner')) {
    next = next.replace(
      '    <div className="cz-wallpaper"/>',
      `    <div className="cz-wallpaper"/>
    {auditMode && <aside className="cc-audit-mode-banner" role="status"><div><ShieldCheck/><span><strong>Modo Auditoria de Escala</strong><small>{auditName || 'Tripulante de teste'} · dados temporários, sem notificações ou sincronização</small></span></div><button type="button" onClick={exitRosterAuditMode}><RotateCcw/> Encerrar teste</button></aside>}`,
    );
  }

  next = next
    .replace(/const DEFAULT_VERSION = '[^']+';/, "const DEFAULT_VERSION = '14.2.8';")
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.2.8: modo auditoria admin protegido e escala de teste isolada';");

  return next;
});

update('client/src/main.tsx', (source) => source.includes('v1428/audit-mode.css')
  ? source
  : source.replace('import "./components/v1419/premium-deluxe-phase2.css";', 'import "./components/v1419/premium-deluxe-phase2.css";\nimport "./components/v1428/audit-mode.css";'));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = '14.2.8';
  data.description = 'CrewCheck v14.2.8 - protected admin roster audit mode';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log('[v1428] Protected admin roster audit mode enabled.');
