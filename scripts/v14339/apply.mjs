import fs from 'node:fs';

const VERSION = '14.3.39';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14339] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14339] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

const historyViewBlock = `function historyPeriodLabel(item: any): string {
  const month = Number(item?.month || 0);
  const year = Number(item?.year || 0);
  if (!month || !year) return 'Escala com período a confirmar';
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1, 12)));
    return 'Escala de ' + formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return \`Escala de \${String(month).padStart(2, '0')}/\${year}\`;
  }
}
function historyImportedLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Data de importação não disponível';
  const normalized = /^\\d{4}-\\d{2}-\\d{2}\\s/.test(raw) ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return 'Data de importação não disponível';
  try {
    const timezone = storage.get('crewcheck_timezone', 'America/Sao_Paulo') || 'America/Sao_Paulo';
    const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timezone }).format(date);
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(date);
    return \`Importada em \${day} às \${time}\`;
  } catch {
    return 'Importada em ' + new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
}
function historyOriginalFileName(item: any): string {
  return String(item?.sourceFileName || '').trim() || 'Nome original não informado';
}
function historySortValue(item: any): number {
  const year = Number(item?.year || 0);
  const month = Number(item?.month || 0);
  return year * 100 + month;
}
function sortRosterHistoryChronologically(items: any[]): any[] {
  return [...items].sort((a, b) => historySortValue(b) - historySortValue(a)
    || String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))
    || Number(Boolean(b?.isActive)) - Number(Boolean(a?.isActive)));
}
function DatabaseView({ setBundle, setView }: { setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      listSavedRosters(72).catch(() => []),
      getDatabaseStatus().catch(() => ({ ok: false, connected: false, message: 'Histórico local ativo' })),
    ]).then(([saved, database]) => {
      setItems(sortRosterHistoryChronologically(saved));
      setStatus(database);
    }).finally(() => setLoading(false));
  }, []);
  async function open(item: any) {
    try {
      const data = item?.id ? await openSavedRoster(item.id) : await openActiveRoster();
      if (data?.roster) {
        const compliance = data.compliance || analyzeSafe(data.roster);
        const source = historyPeriodLabel(item);
        setBundle({ roster: data.roster, compliance, source });
        saveRoster(data.roster, source);
        setView('cockpit');
        toast.success(\`\${source} aberta.\`);
      }
    } catch {
      toast.error('Não consegui abrir esta escala do histórico.');
    }
  }
  return <><Brand back/>
    <section className="cz-panel-head cz-panel-head-compact cc-history-head-v14339"><h1>Histórico de escalas</h1><p>{status?.connected ? 'Banco conectado · cópia local protegida' : 'Modo local protegido · sincronização pendente'}</p></section>
    <section className="cc-history-summary-v14339" aria-label="Resumo do histórico"><span><Database/><b>{items.length}</b><small>{items.length === 1 ? 'período salvo' : 'períodos salvos'}</small></span><p>Organizado pelo mês de referência, do mais recente para o mais antigo. O nome original do PDF permanece preservado apenas como referência.</p></section>
    <section className="cz-stack-list cc-history-list-v14339">
      {loading ? <article className="cz-empty-real cz-history-empty"><RotateCcw/><h2>Carregando histórico</h2><p>Verificando escalas locais e sincronizadas.</p></article>
        : items.length ? items.map((item: any) => <article className="cc-history-card-v14339" key={item.id} data-active={Boolean(item.isActive)}>
          <div className="cc-history-period-v14339"><span className="cc-history-icon-v14339"><CalendarDays/></span><div><small>MÊS DE REFERÊNCIA</small><h2>{historyPeriodLabel(item)}</h2><p>{historyImportedLabel(item.createdAt)}</p></div>{item.isActive && <em>Ativa</em>}</div>
          <div className="cc-history-file-v14339"><FileText/><span><small>Arquivo original</small><strong title={historyOriginalFileName(item)}>{historyOriginalFileName(item)}</strong></span></div>
          <div className="cc-history-meta-v14339"><span>{item.storageReady ? 'Sincronizada' : item.importStatus?.includes('local') ? 'Salva neste dispositivo' : status?.connected ? 'Disponível no banco' : 'Cópia local'}</span>{item.base && <span>Base {item.base}</span>}</div>
          <button className="primary" onClick={() => open(item)}><CalendarDays/> Abrir escala <ChevronRight/></button>
        </article>)
        : <article className="cz-empty-real cz-history-empty"><Database/><h2>Nenhuma escala salva</h2><p>Importe uma escala oficial. Cada mês ficará identificado pelo período e pela data de importação.</p></article>}
    </section>
  </>;
}`;

update('client/src/lib/databaseClient.ts', (source) => {
  const oldSort = `    const sorted = merged.sort((a, b) => Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) || String(b.year || 0).localeCompare(String(a.year || 0)) || Number(b.month || 0) - Number(a.month || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, limit);`;
  const newSort = `    const sorted = merged.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(b.month || 0) - Number(a.month || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || Number(Boolean(b.isActive)) - Number(Boolean(a.isActive))).slice(0, limit);`;
  if (source.includes(newSort)) return source;
  if (!source.includes(oldSort)) throw new Error('[v14339] Ordenação do histórico não localizada.');
  return source.replace(oldSort, newSort);
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: histórico mensal legível, cronológico e responsivo';`);
  next = replaceBlock(next, 'function DatabaseView(', 'function CrewToolsView(', historyViewBlock, 'Histórico de escalas');
  return next;
});

const css = `
/* CrewCheck v14.3.39 — histórico cronológico e legível */
.cc-history-head-v14339 { margin-bottom: 14px; }
.cc-history-summary-v14339 { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 14px; padding: 15px 17px; margin-bottom: 16px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 20px; background: color-mix(in srgb, var(--cc-surface, #10233c) 91%, transparent); }
.cc-history-summary-v14339 > span { display: grid; grid-template-columns: auto auto; align-items: center; gap: 2px 9px; }
.cc-history-summary-v14339 svg { grid-row: 1 / span 2; width: 27px; height: 27px; }
.cc-history-summary-v14339 b { font-size: 1.25rem; line-height: 1; }
.cc-history-summary-v14339 small, .cc-history-summary-v14339 p { opacity: .76; }
.cc-history-summary-v14339 p { margin: 0; line-height: 1.4; overflow-wrap: anywhere; }
.cc-history-list-v14339 { display: grid !important; gap: 14px !important; }
.cc-history-card-v14339 { display: grid; grid-template-columns: minmax(0,1fr) auto; grid-template-areas: "period action" "file action" "meta action"; align-items: center; gap: 12px 18px; width: 100%; min-width: 0; padding: 18px; border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 24px; background: color-mix(in srgb, var(--cc-surface, #10233c) 94%, transparent); box-shadow: 0 14px 38px rgba(0,0,0,.14); overflow: hidden; }
.cc-history-card-v14339[data-active="true"] { border-color: color-mix(in srgb, #22d3ee 54%, transparent); }
.cc-history-period-v14339 { grid-area: period; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 12px; min-width: 0; }
.cc-history-icon-v14339 { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 15px; background: linear-gradient(135deg, rgba(217,70,239,.2), rgba(34,211,238,.2)); color: #67e8f9; }
.cc-history-period-v14339 > div { min-width: 0; }
.cc-history-period-v14339 small { display: block; margin-bottom: 3px; font-size: .7rem; font-weight: 850; letter-spacing: .12em; opacity: .68; }
.cc-history-period-v14339 h2 { margin: 0; max-width: 100%; font-size: clamp(1.15rem, 4.2vw, 1.55rem); line-height: 1.15; overflow-wrap: anywhere; word-break: normal; }
.cc-history-period-v14339 p { margin: 5px 0 0; font-size: .92rem; opacity: .76; line-height: 1.35; }
.cc-history-period-v14339 em { align-self: start; padding: 7px 10px; border-radius: 999px; background: rgba(34,211,238,.13); color: #67e8f9; font-size: .72rem; font-style: normal; font-weight: 900; white-space: nowrap; }
.cc-history-file-v14339 { grid-area: file; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 9px; min-width: 0; padding-top: 10px; border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
.cc-history-file-v14339 svg { width: 19px; opacity: .7; }
.cc-history-file-v14339 span { min-width: 0; display: grid; gap: 2px; }
.cc-history-file-v14339 small { font-size: .72rem; opacity: .62; }
.cc-history-file-v14339 strong { min-width: 0; max-width: 100%; font-size: .88rem; font-weight: 650; opacity: .82; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-history-meta-v14339 { grid-area: meta; display: flex; flex-wrap: wrap; gap: 7px; min-width: 0; }
.cc-history-meta-v14339 span { padding: 6px 9px; border-radius: 999px; background: color-mix(in srgb, currentColor 7%, transparent); font-size: .74rem; font-weight: 750; opacity: .82; }
.cc-history-card-v14339 > button { grid-area: action; display: inline-flex !important; align-items: center; justify-content: center; gap: 8px; width: auto !important; min-width: 150px !important; min-height: 48px; padding-inline: 16px !important; white-space: nowrap; }
@media (max-width: 620px) {
  .cc-history-summary-v14339 { grid-template-columns: 1fr; }
  .cc-history-card-v14339 { grid-template-columns: minmax(0,1fr); grid-template-areas: "period" "file" "meta" "action"; padding: 16px; border-radius: 22px; }
  .cc-history-card-v14339 > button { width: 100% !important; min-width: 0 !important; }
  .cc-history-period-v14339 { grid-template-columns: auto minmax(0,1fr); }
  .cc-history-period-v14339 em { grid-column: 2; justify-self: start; }
  .cc-history-file-v14339 strong { white-space: normal; overflow-wrap: anywhere; }
}
`;
update('client/src/index.css', (source) => source.includes('CrewCheck v14.3.39 — histórico cronológico') ? source : `${source.trimEnd()}\n${css}\n`);
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Histórico organizado por mês de referência e data de importação.' }, null, 2)}\n`, 'utf8');

console.log(`[v14339] CrewCheck ${VERSION}: histórico por mês de referência, importação legível, arquivo original preservado e ordem cronológica.`);
