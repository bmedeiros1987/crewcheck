import fs from 'node:fs';

const VERSION = '14.3.16';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14318] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14318] Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${addition}`);
}

update('server/v139/index.mjs', (source) => {
  let next = source;
  if (!next.includes("from '../v14316/controlCenter.mjs'")) {
    const anchor = "import { handleMailerSendWebhook } from '../v1412/mailersendWebhook.mjs';";
    next = insertAfter(next, anchor, "import { handleV14316ControlRoute } from '../v14316/controlCenter.mjs';\nimport { handleTelegramLocationAndPlaces } from '../v14316/telegramLocation.mjs';", 'imports v14.3.16');
  }
  if (!next.includes('await handleV14316ControlRoute(req, res, url)')) {
    next = insertAfter(next, 'export async function handleV139Route(req, res, url) {', '  if (await handleV14316ControlRoute(req, res, url)) return true;', 'rotas v14.3.16');
  }
  if (!next.includes('await handleTelegramLocationAndPlaces(update)')) {
    const block = "  const update = (messageOrUpdate?.message || messageOrUpdate?.edited_message) ? messageOrUpdate : { message: messageOrUpdate };\n  if (await handleTelegramLocationAndPlaces(update)) return true;";
    next = insertAfter(next, 'export async function handleV139Telegram(messageOrUpdate, sendTelegram) {', block, 'Telegram localização');
  }
  return next;
});

update('client/src/App.tsx', (source) => {
  let next = source;
  if (!next.includes("import GuardianPublicPage from './pages/GuardianPublicPage';")) {
    const anchor = 'import TelegramConnectPage from "./pages/TelegramConnectPage";';
    next = insertAfter(next, anchor, "import GuardianPublicPage from './pages/GuardianPublicPage';", 'página Guardian');
  }
  if (!next.includes('<Route path="/guardian" component={GuardianPublicPage} />')) {
    next = next.replace('    <Route path="/visitor" component={VisitorAccessPage} />', '    <Route path="/guardian" component={GuardianPublicPage} />\n    <Route path="/visitor" component={VisitorAccessPage} />');
  }
  next = next.replace("'/delete-account', '/visitor', '/share/'", "'/delete-account', '/guardian', '/visitor', '/share/'");
  return next.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`);
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  if (!next.includes('  LifeBuoy,')) next = next.replace('  Lock,\n', '  Lock,\n  LifeBuoy,\n  QrCode,\n');
  if (!next.includes("import GuardianCenterView from '@/components/v14316/GuardianCenterView';")) {
    const anchor = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";
    next = insertAfter(next, anchor, "import GuardianCenterView from '@/components/v14316/GuardianCenterView';\nimport SupportCenterView from '@/components/v14316/SupportCenterView';\nimport AdminControlCenter from '@/components/v14316/AdminControlCenter';", 'componentes v14.3.16');
  }
  if (!/\| 'guardian'\b/.test(next)) next = next.replace(/\| 'admin';/, "| 'guardian' | 'support' | 'admin';");
  if (!next.includes("['guardian','Guardian'")) {
    const anchor = "['manual','Manual CrewCheck','Ajuda, PDFs e tutorial',BookOpen],";
    if (!next.includes(anchor)) throw new Error('[v14318] Item Manual não encontrado no menu.');
    next = next.replace(anchor, `${anchor} ['guardian','Guardian','QR de emergência protegido',QrCode], ['support','Suporte','Problemas e sugestões',LifeBuoy],`);
  }
  if (!next.includes("return 'guardian';")) {
    const anchor = "if (value === 'life' || value === 'crewcheck-life' || value === 'saude' || value === 'saúde' || value === 'bem-estar') return 'life';";
    if (!next.includes(anchor)) throw new Error('[v14318] Normalização Life não encontrada.');
    next = next.replace(anchor, `${anchor}\n  if (value === 'guardian' || value === 'emergencia-qr' || value === 'emergência-qr') return 'guardian';\n  if (value === 'support' || value === 'suporte' || value === 'ajuda-suporte') return 'support';`);
  }
  if (!next.includes("view === 'guardian' && <GuardianCenterView")) {
    const anchor = "    {view === 'manual' && <ManualCenterView/>}";
    if (!next.includes(anchor)) throw new Error('[v14318] Render Manual não encontrado.');
    next = next.replace(anchor, `${anchor}\n    {view === 'guardian' && <GuardianCenterView/>}\n    {view === 'support' && <SupportCenterView/>}`);
  }
  if (!next.includes('<AdminControlCenter/>')) {
    if (next.includes("{view === 'admin' && <Admin bundle={bundle}/>}")) next = next.replace("{view === 'admin' && <Admin bundle={bundle}/>}", "{view === 'admin' && <><AdminControlCenter/><Admin bundle={bundle}/></>}");
    else if (next.includes("{view === 'admin' && <Admin/>}")) next = next.replace("{view === 'admin' && <Admin/>}", "{view === 'admin' && <><AdminControlCenter/><Admin/></>}");
  }

  if (!next.includes('async function refreshSmartDepartureLocation')) {
    const anchor = 'function eventRouteOrigin(event: ZeroLeg): string {';
    const helper = `async function refreshSmartDepartureLocation(): Promise<string> {
  try {
    const position = await getCurrentGeoPosition();
    const value = coordsLabel(position.lat, position.lng);
    storage.set('crewcheck_last_geo', value);
    void reverseGeocodePosition(position.lat, position.lng);
    return value;
  } catch {
    return storage.get('crewcheck_last_geo', '');
  }
}
`;
    if (!next.includes(anchor)) throw new Error('[v14318] Origem da Saída Inteligente não encontrada.');
    next = next.replace(anchor, `${helper}\n${anchor}`);
  }

  const smartCardOld = `    setRoute(null);
    fetchRoutePreviewInfo(eventRouteOrigin(event), eventRouteDestination(event), 'driving')
      .then((next) => { if (alive) setRoute(next); })
      .catch(() => { if (alive) setRoute({ ok: false, message: 'Estimativa local protegida.' }); });`;
  const smartCardNew = `    setRoute(null);
    void (async () => {
      const currentOrigin = await refreshSmartDepartureLocation();
      const calculated = await fetchRoutePreviewInfo(currentOrigin || eventRouteOrigin(event), eventRouteDestination(event), 'driving');
      if (alive) setRoute(calculated || { ok: false, message: 'Estimativa local protegida.' });
      if (calculated?.ok) void authFetch('/api/control/telemetry', { method: 'POST', body: JSON.stringify({ kind: 'route_calculation' }) }).catch(() => undefined);
    })();`;
  if (next.includes(smartCardOld)) next = next.replace(smartCardOld, smartCardNew);

  if (next.includes("const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));") && !next.includes('const [locationVersion, setLocationVersion]')) {
    next = next.replace("const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));", "const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));\n  const [locationVersion, setLocationVersion] = useState(0);");
  }
  const departureEffect = `  useEffect(() => {
    setRoute(null);
    setRoutePending(true);
    setOriginLabel(eventRouteOriginLabel(event));
  }, [event.id, event.origin, event.destination, event.hotel]);`;
  if (next.includes(departureEffect)) {
    next = next.replace(departureEffect, `  useEffect(() => {
    let alive = true;
    setRoute(null);
    setRoutePending(true);
    setOriginLabel(eventRouteOriginLabel(event));
    void refreshSmartDepartureLocation().then((origin) => {
      if (!alive || !origin) return;
      setOriginLabel(loadNearbyAddress(origin)?.shortAddress || 'Localização atual');
      setLocationVersion((value) => value + 1);
    });
    return () => { alive = false; };
  }, [event.id, event.origin, event.destination, event.hotel]);`);
  }
  if (next.includes('const [locationVersion, setLocationVersion]')) {
    next = next.replace('<GoogleMapsRoutePreview event={event} mode={mode}', '<GoogleMapsRoutePreview key={`${event.id}-${locationVersion}`} event={event} mode={mode}');
  }

  if (!next.includes("kind: 'app_open'")) {
    const anchor = 'export default function Home() {';
    if (next.includes(anchor)) next = next.replace(anchor, `${anchor}\n  useEffect(() => { void authFetch('/api/control/telemetry', { method: 'POST', body: JSON.stringify({ kind: 'app_open' }) }).catch(() => undefined); }, []);`);
  }
  return next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Guardian QR, suporte por ticket, dashboard agregada, Health Connect contínuo e localização operacional';`);
});

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;
  if (!next.includes('function healthFreshnessLabel')) {
    const anchor = 'function integrationLabel(status: NativeHealthStatus): string {';
    const helper = `function healthFreshnessLabel(value?: string): string {
  if (!value) return 'Aguardando a primeira leitura';
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age) || age < 0) return 'Atualizado agora';
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return 'Atualizado agora';
  if (minutes === 1) return 'Atualizado há 1 minuto';
  return \`Atualizado há \${minutes} minutos\`;
}
`;
    if (!next.includes(anchor)) throw new Error('[v14318] Estado do Health Connect não encontrado.');
    next = next.replace(anchor, `${helper}\n${anchor}`);
  }
  if (!next.includes('crewcheckHealthContinuousSync')) {
    const anchor = '  const metrics = useMemo(() => {';
    if (!next.includes(anchor)) throw new Error('[v14318] Métricas Life não encontradas.');
    const effect = `  useEffect(() => {
    if (!consent.active) return;
    let running = false;
    const refresh = () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      const sent = postAndroid('status');
      if (sent) postAndroid('readSummary', { days: 7, consentAccepted: true });
      window.setTimeout(() => { running = false; }, 4000);
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const resume = () => refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('crewcheck:native-ready', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('crewcheck:native-ready', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [consent.active, nativeStatus.allGranted, nativeStatus.availability]);
  const healthSyncLabel = healthFreshnessLabel(nativeSummary.capturedAt);
  const crewcheckHealthContinuousSync = true;
`;
    next = next.replace(anchor, `${effect}\n${anchor}`);
  }
  if (!next.includes('data-health-sync="continuous"')) {
    const anchor = '    <LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>';
    if (!next.includes(anchor)) throw new Error('[v14318] Painel Life não encontrado.');
    const strip = `    <div className="cc-life-sync-strip" data-health-sync="continuous"><span className={nativeSummary.ok ? 'ready' : 'pending'}></span><div><strong>{nativeSummary.ok ? 'Sincronização contínua ativa' : 'Aguardando dados do Health Connect'}</strong><small>{healthSyncLabel} · atualização automática a cada minuto com o app aberto</small></div><button type="button" onClick={() => { postAndroid('status'); postAndroid('readSummary', { days: 7, consentAccepted: true }); }}><RefreshCw/> Atualizar agora</button></div>`;
    next = next.replace(anchor, `${strip}\n${anchor}`);
  }
  return next.replace(/APK 14\.3\.\d+/g, `APK ${VERSION}`);
});

update('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', (source) => {
  if (source.includes('fun refreshFromHost()')) return source;
  const anchor = '    private fun isTrustedOrigin';
  if (!source.includes(anchor)) throw new Error('[v14318] Ponte Health Connect sem âncora.');
  return source.replace(anchor, `    fun refreshFromHost() {
        handleMessage("{\\\"action\\\":\\\"status\\\"}")
        handleMessage("{\\\"action\\\":\\\"readSummary\\\",\\\"days\\\":7,\\\"consentAccepted\\\":true}")
    }

${anchor}`);
}, { optional: true });

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  if (source.includes('healthBridge.refreshFromHost()')) return source;
  const anchor = '    @Override\n    protected void onDestroy() {';
  if (!source.includes(anchor)) throw new Error('[v14318] onDestroy Android não encontrado.');
  return source.replace(anchor, `    @Override
    protected void onResume() {
        super.onResume();
        if (healthBridge != null && webView != null) webView.postDelayed(() -> healthBridge.refreshFromHost(), 450);
    }

${anchor}`);
}, { optional: true });

update('client/src/pages/VisitorAccessPage.tsx', (source) => {
  let next = source;
  if (!next.includes('function visitorRealDay')) {
    const anchor = 'export default function VisitorAccessPage() {';
    const helper = `function visitorRealDay(day: any): boolean {
  const rawDate = String(day?.date || day?.data || '').trim();
  const validDate = /^\\d{4}-\\d{2}-\\d{2}/.test(rawDate) || /^\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?$/.test(rawDate);
  const code = String(day?.type || day?.pairingCode || day?.activity || '').trim();
  const legs = Array.isArray(day?.legs) ? day.legs.filter((leg: any) => leg && (leg.flightNumber || leg.flight || (leg.origin && leg.destination))) : [];
  const stay = String(day?.hotel || day?.hotelName || '').trim();
  return validDate && Boolean(code || legs.length || stay);
}
function visitorDayTitle(day: any): string {
  const code = String(day?.type || day?.pairingCode || day?.activity || '').trim();
  if (code) return code;
  const first = Array.isArray(day?.legs) ? day.legs.find((leg: any) => leg?.flightNumber || leg?.flight) : null;
  if (first) return String(first.flightNumber || first.flight);
  if (day?.hotel || day?.hotelName) return 'Pernoite';
  return '';
}
`;
    if (!next.includes(anchor)) throw new Error('[v14318] Portal visitante não encontrado.');
    next = next.replace(anchor, `${helper}\n${anchor}`);
  }
  next = next.replace("  const days = data?.roster?.days || [];", "  const days = (data?.roster?.days || []).filter(visitorRealDay);");
  next = next.replace('<p>Programação autorizada pelo titular.</p>', '<p>Programação real compartilhada pelo titular, sem completar datas ou atividades ausentes.</p>');
  next = next.replace("<h3>{day.type || day.pairingCode || 'Programação'}</h3>", '<h3>{visitorDayTitle(day)}</h3>');
  return next;
});

update('server/v1403/premium-helpers.snippet', (source) => {
  if (source.includes('function conciergeLayoverAwareReply')) return source;
  const anchor = 'async function conciergeIdentityFlow';
  if (!source.includes(anchor)) throw new Error('[v14318] Helper do Concierge não encontrado.');
  const helper = `function conciergeLayoverAwareReply(snapshot = {}) {
  const days = Array.isArray(snapshot?.roster?.days) ? snapshot.roster.days : [];
  const stays = days.filter((day) => {
    const code = String(day?.type || day?.pairingCode || day?.activity || day?.rawText || '').toUpperCase();
    return Boolean(day?.hotel || day?.hotelName || /PERNOITE|HOTEL|LAYOVER|ESTADIA|PNI|PN/.test(code));
  });
  if (!stays.length) return conciergeHotelsReply(snapshot);
  const rows = stays.slice(0, 6).map((day) => {
    const date = String(day?.date || day?.data || '').trim() || 'data publicada não identificada';
    const hotel = String(day?.hotel || day?.hotelName || '').trim();
    const place = String(day?.airport || day?.base || day?.destination || '').trim();
    const state = /INATIV|ENCERR|FINALIZ/i.test(String(day?.status || day?.rawText || '')) ? 'pernoite já encerrado' : 'pernoite publicado';
    return '• ' + date + ': ' + state + (hotel ? ' · ' + hotel : '') + (place ? ' · ' + place : '');
  });
  return ['Encontrei os pernoites publicados na escala, inclusive os que não estão ativos agora:', '', ...rows].join('\\n');
}
`;
  return source.replace(anchor, `${helper}\n${anchor}`);
});

update('server/v1403/build-reply.snippet', (source) => source.replace('return conciergeHotelsReply(snapshot);', 'return conciergeLayoverAwareReply(snapshot);'));

update('client/src/pages/AboutUsPage.tsx', (source) => {
  let next = source;
  if (!next.includes('CREWCHECK_FOUNDER_PHOTO')) next = `import { CREWCHECK_FOUNDER_PHOTO } from '@/components/v14316/founderPhoto';\n\n${next}`;
  next = next.replace('mailto:bruno@crewcheck.online?subject=Demonstração%20CrewCheck', 'mailto:suporte@crewcheck.com.br?subject=Demonstração%20CrewCheck');
  next = next.replace('<span className="cc-about-eyebrow">Nossa história</span>', '<span className="cc-about-eyebrow">Nossa origem</span>');
  if (!next.includes('cc-about-founder-photo')) {
    next = next.replace('<article className="cc-about-founder">\n          <span className="cc-about-eyebrow">Fundador</span>', '<article className="cc-about-founder">\n          <img className="cc-about-founder-photo" src={CREWCHECK_FOUNDER_PHOTO} alt="Bruno Saraiva de Medeiros, fundador do CrewCheck"/>\n          <div className="cc-about-founder-copy"><span className="cc-about-eyebrow">Quem constrói o CrewCheck</span>');
    next = next.replace('O CrewCheck foi desenvolvido a partir da experiência prática com escalas, jornadas, deslocamentos e desafios da rotina operacional.</p>\n        </article>', 'O CrewCheck foi desenvolvido a partir da experiência prática com escalas, jornadas, deslocamentos, fadiga e desafios da rotina operacional.</p></div>\n        </article>');
  }
  if (!next.includes('.cc-about-founder-photo{')) {
    next = next.replace('.cc-about-role{', '.cc-about-founder{display:grid!important;grid-template-columns:220px 1fr;gap:28px;align-items:center}.cc-about-founder-photo{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:center 28%;border-radius:22px;border:1px solid #365779;box-shadow:0 18px 45px rgba(0,0,0,.28)}.cc-about-founder-copy .cc-about-eyebrow{margin-top:0}.cc-about-role{');
    next = next.replace('@media(max-width:720px){', '@media(max-width:720px){\n          .cc-about-founder{grid-template-columns:1fr!important}.cc-about-founder-photo{max-width:280px;margin:auto}');
  }
  return next;
});

update('client/src/components/v1434/ManualCenterView.tsx', (source) => source
  .replace(/V14\.3\.4/g, `V${VERSION}`)
  .replace('Manual completo, guia rápido e tutorial interativo no mesmo lugar.', 'Manual completo, guias rápidos, Guardian, Health Connect, visitante, Telegram, Saída Inteligente, suporte e privacidade no mesmo lugar.')
  .replace('<article><BookOpen/><h2>Consulta no sistema</h2>', '<article><BookOpen/><h2>Guardian, visitante e suporte</h2><p>QR de emergência, escala compartilhada fiel ao PDF e abertura de tickets sem expor o e-mail pessoal.</p><a href="/manual.html#guardian">Abrir guia</a></article><article><BookOpen/><h2>Consulta no sistema</h2>'));

update('client/src/components/v14316/control-center.css', (source) => source.includes('.cc-life-sync-strip') ? source : `${source}\n.cc-life-sync-strip{display:flex;align-items:center;gap:12px;margin:14px 0;padding:14px 16px;border:1px solid rgba(34,211,238,.22);border-radius:18px;background:rgba(8,145,178,.08)}.cc-life-sync-strip>span{width:11px;height:11px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 5px rgba(251,191,36,.12)}.cc-life-sync-strip>span.ready{background:#4ade80;box-shadow:0 0 0 5px rgba(74,222,128,.12)}.cc-life-sync-strip>div{display:grid;flex:1;gap:2px}.cc-life-sync-strip small{color:#cbd5e1}.cc-life-sync-strip button{display:flex;gap:8px;align-items:center;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;border-radius:13px;padding:10px 12px;font-weight:800}@media(max-width:620px){.cc-life-sync-strip{align-items:flex-start;flex-wrap:wrap}.cc-life-sync-strip button{width:100%;justify-content:center}}\n`);

for (const path of ['client/src/pages/AuthPage.tsx']) update(path, (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140316').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - Guardian QR, continuous Health Connect, live Telegram location, truthful visitor roster, support tickets and aggregate admin control`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.16'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-16-control-center.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14318] CrewCheck ${VERSION}: Guardian, Life contínuo, Telegram por distância, escala visitante fiel, suporte e dashboard LGPD.`);
