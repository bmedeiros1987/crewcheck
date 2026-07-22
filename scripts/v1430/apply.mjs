import fs from 'node:fs';

const VERSION = '14.3.0';
function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  if (!next.includes('function crewcheckPlanExperience')) {
    next = next.replace('export default function Home() {', `function crewcheckPlanExperience() {
  const user = getStoredUser() as any;
  const raw = String(user?.plan || user?.subscriptionPlan || user?.tier || '').toLowerCase();
  const premium = Boolean(user?.premium || user?.isPremium || /premium|pro|unlimited|partner|admin/.test(raw));
  return {
    premium,
    planLabel: premium ? 'Premium' : 'Gratuito',
    guestLimit: premium ? 5 : 1,
    meteoFavorites: premium ? 20 : 2,
    meteoFollowHours: premium ? 24 : 3,
  };
}

function minutesValue(value: unknown): number | null {
  const match = String(value || '').match(/(\\d{1,2}):(\\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function rosterNightMetrics(roster: CrewRoster) {
  const rows = (Array.isArray(roster?.days) ? roster.days : []).map((day: any) => {
    const date = rosterDayIso(day);
    const starts = [day.dutyReport, day.presentation, day.startTime, ...(day.legs || []).flatMap((leg: any) => [leg.presentationTime, leg.departureTime])].map(minutesValue).filter((v): v is number => v !== null);
    const ends = [day.dutyDebrief, day.endTime, ...(day.legs || []).map((leg: any) => leg.arrivalTime)].map(minutesValue).filter((v): v is number => v !== null);
    const crossesNight = starts.some((v) => v < 360) || ends.some((v) => v > 0 && v <= 360) || (starts.some((v) => v >= 1080) && ends.some((v) => v <= 360));
    return { date, crossesNight };
  }).filter((row) => row.date && row.crossesNight).sort((a, b) => a.date.localeCompare(b.date));
  let currentSequence = 0;
  let previous: Date | null = null;
  for (const row of rows) {
    const date = new Date(row.date + 'T12:00:00');
    const adjacent = previous && Math.round((date.getTime() - previous.getTime()) / 86400000) === 1;
    currentSequence = adjacent ? currentSequence + 1 : 1;
    previous = date;
  }
  const latest = rows.at(-1)?.date ? new Date(rows.at(-1)!.date + 'T12:00:00') : null;
  const rolling168 = latest ? rows.filter((row) => { const d = new Date(row.date + 'T12:00:00'); const diff = (latest.getTime() - d.getTime()) / 3600000; return diff >= 0 && diff < 168; }).length : 0;
  return { currentSequence, rolling168, analyzedDays: Array.isArray(roster?.days) ? roster.days.length : 0 };
}

function ReliabilityAliveCard({ bundle }: { bundle: BundleState }) {
  const metrics = useMemo(() => rosterNightMetrics(bundle.roster), [bundle.roster]);
  const checkedAt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  return <section className="cc-reliability-alive" aria-label="Status do motor operacional"><header><span><ShieldCheck/><small>MOTOR OPERACIONAL</small><h2>Análise ativa e atualizada</h2></span><b>ON</b></header><div className="cc-reliability-grid"><article><small>Última análise</small><strong>{checkedAt}</strong><span>Escala e limites reavaliados</span></article><article><small>Madrugadas consecutivas</small><strong>{metrics.currentSequence} / 2</strong><span>{metrics.currentSequence <= 2 ? 'Dentro da referência geral' : 'Revisão necessária'}</span></article><article><small>Madrugadas em 168 h</small><strong>{metrics.rolling168} / 4</strong><span>{metrics.rolling168 <= 4 ? 'Dentro da referência geral' : 'Revisão necessária'}</span></article><article><small>Dias analisados</small><strong>{metrics.analyzedDays}</strong><span>Motor canônico ativo</span></article></div><p>O CrewCheck mostra também quando nenhuma notificação é necessária. Alertas jurídicos continuam dependendo da composição completa da jornada, ACT aplicável e dados oficiais.</p></section>;
}

function PremiumValueBridge({ setView }: { setView: (view: ZeroView) => void }) {
  const plan = crewcheckPlanExperience();
  if (plan.premium) return null;
  return <section className="cc-premium-value-bridge"><div><small>SEU CREWCHECK ESTÁ PROTEGIDO</small><h2>O gratuito continua confiável. O Premium acompanha você.</h2><p>Use escala, alertas essenciais e consultas com segurança. Migre quando quiser automações contínuas, mais favoritos, acompanhamento prolongado, convidados extras e inteligência em segundo plano.</p></div><div className="cc-value-comparison"><span><b>Gratuito</b>1 convidado · 2 favoritos meteo · acompanhamento por até 3 h</span><span><b>Premium</b>5 convidados · 20 favoritos · até 24 h · automações e alertas avançados</span></div><button onClick={() => setView('plans')}>Conhecer Premium <ChevronRight/></button></section>;
}

function MeteoFollowPanel({ event }: { event: ZeroLeg }) {
  const plan = crewcheckPlanExperience();
  const airports = Array.from(new Set([event?.origin, event?.destination].map((v) => String(v || '').toUpperCase()).filter((v) => /^[A-Z]{3,4}$/.test(v))));
  const [favorites, setFavorites] = useState<string[]>(() => { try { return JSON.parse(storage.get('crewcheck_meteo_favorites_v1', '[]')); } catch { return []; } });
  const [following, setFollowing] = useState<Record<string, number>>(() => { try { return JSON.parse(storage.get('crewcheck_meteo_follow_v1', '{}')); } catch { return {}; } });
  function favorite(code: string) {
    const exists = favorites.includes(code);
    if (!exists && favorites.length >= plan.meteoFavorites) { toast.info(\`Seu plano permite \${plan.meteoFavorites} favorito(s). O Premium amplia essa lista.\`); return; }
    const next = exists ? favorites.filter((item) => item !== code) : [...favorites, code];
    setFavorites(next); storage.set('crewcheck_meteo_favorites_v1', JSON.stringify(next));
  }
  function follow(code: string, hours: number) {
    const safeHours = Math.min(hours, plan.meteoFollowHours);
    const next = { ...following, [code]: Date.now() + safeHours * 3600000 };
    setFollowing(next); storage.set('crewcheck_meteo_follow_v1', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('crewcheck:meteo-follow-updated', { detail: { airport: code, until: next[code], changesOnly: true } }));
    toast.success(\`Acompanhamento de \${code} ativado por \${safeHours} h. Você será avisado somente quando houver nova emissão.\`);
  }
  return <section className="cc-meteo-follow"><header><div><small>METEOROLOGIA OPERACIONAL</small><h2>Pela escala e favoritos</h2><p>Favoritos para consulta rápida e acompanhamento sem excesso de notificações.</p></div><span>{plan.planLabel}</span></header><nav><button className="active">Pela escala</button><button>Favoritos ({favorites.length})</button><button>Pesquisar</button></nav><div className="cc-meteo-airports">{airports.length ? airports.map((code) => <article key={code}><strong>{code}</strong><small>{code === event.origin ? 'Origem da próxima programação' : 'Destino da próxima programação'}</small><div><button onClick={() => favorite(code)}>{favorites.includes(code) ? '★ Favoritado' : '☆ Favoritar'}</button><select defaultValue="3" aria-label={\`Tempo para seguir \${code}\`}><option value="3">3 horas</option>{plan.meteoFollowHours >= 6 && <option value="6">6 horas</option>}{plan.meteoFollowHours >= 12 && <option value="12">12 horas</option>}{plan.meteoFollowHours >= 24 && <option value="24">24 horas</option>}</select><button className="primary" onClick={(e) => { const select = e.currentTarget.parentElement?.querySelector('select') as HTMLSelectElement | null; follow(code, Number(select?.value || 3)); }}>Seguir METAR/TAF</button></div>{following[code] > Date.now() && <em>Ativo até {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(following[code]))} · somente novas emissões</em>}</article>) : <p>Importe uma escala para carregar origem e destino automaticamente.</p>}</div></section>;
}

export default function Home() {`);
  }

  next = next.replace(
    "{view === 'cockpit' && <Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>}",
    "{view === 'cockpit' && <><Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/><PremiumValueBridge setView={setView}/></>}"
  );
  next = next.replace(
    "{view === 'alerts' && <Alerts compliance={compliance}/>}",
    "{view === 'alerts' && <><ReliabilityAliveCard bundle={bundle}/><Alerts compliance={compliance}/></>}"
  );
  next = next.replace(
    "{view === 'weather' && <WeatherView event={flightEvent}/>}",
    "{view === 'weather' && <><MeteoFollowPanel event={flightEvent}/><WeatherView event={flightEvent}/></>}"
  );
  next = next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: gratuito confiável, Premium desejável, meteorologia seguida e motor operacional visível';`);
  return next;
});

update('client/src/main.tsx', (source) => source.includes('v1430/trust-and-conversion.css')
  ? source
  : source.replace('import "./components/v1429/reliability-premium.css";', 'import "./components/v1429/reliability-premium.css";\nimport "./components/v1430/trust-and-conversion.css";'));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - trustworthy free experience and natural Premium conversion`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.0'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-0-trust-premium.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1430] CrewCheck ${VERSION}: confiabilidade gratuita preservada e valor Premium apresentado sem bloqueios artificiais.`);
