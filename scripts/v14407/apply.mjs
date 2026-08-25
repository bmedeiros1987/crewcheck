import fs from 'node:fs';

const TAG = '[v14407]';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`${TAG} Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Ancora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Ancora ausente: ${label}`);
  return source.replace(anchor, `${value}\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after.trim())) return source;
  if (!source.includes(before)) throw new Error(`${TAG} Bloco ausente: ${label}`);
  return source.replace(before, after);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`${TAG} Funcao ausente: ${label}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n${source.slice(end)}`;
}

const liveImport = "import { fetchWellhubRoutineSuggestion, fetchWellhubVerifiedSearch, type WellhubRoutineSuggestion } from '@/lib/wellhubLive';";
const staticImport = "import { WELLHUB_PLAN_OPTIONS, isWellhubPlan, searchVerifiedWellhubPartners, verifiedWellhubPartnerFromPlaceId, wellhubPlanLabel, type WellhubPlan } from '@/lib/wellhubVerifiedCatalog';";

const staticSearch = [
  "      let found: NearbyPlace[];",
  "      if (category === 'gym' && plan === 'wellhub') {",
  "        const cachedAddress = locationMode === 'current' && coordinateLabel ? loadNearbyAddress(coordinateLabel) : null;",
  "        const verifiedLocation = locationMode === 'current'",
  "          ? [cachedAddress?.city || amilCity, cachedAddress?.state || amilState].filter(Boolean).join(' ')",
  "          : [resolvedLayoverLocation, target ? city(target.destination || target.origin) : ''].filter(Boolean).join(' ');",
  "        found = searchVerifiedWellhubPartners({",
  "          userPlan: wellhubPlan,",
  "          query: searchTerm.trim(),",
  "          locationText: verifiedLocation,",
  "          limit: 60,",
  "        }).map((partner) => ({",
  "          id: 'wellhub:' + partner.id,",
  "          name: partner.name,",
  "          category: 'gym',",
  "          address: partner.address,",
  "          openingHours: partner.openingHours,",
  "          rating: partner.rating,",
  "          openNow: partner.is24Hours ? true : undefined,",
  "        })) as NearbyPlace[];",
  "      } else {",
  "        const gymQuery = category === 'gym' ? 'Smart Fit academia' : '';",
  "        const customQuery = [searchTerm.trim(), gymQuery].filter(Boolean).join(' ');",
  "        found = await fetchNearbyPlaces(location, category, customQuery);",
  "      }",
].join('\n');

const liveSearch = [
  "      // cc-v14407: wellhub-live-official",
  "      let found: NearbyPlace[];",
  "      if (category === 'gym' && plan === 'wellhub') {",
  "        const cachedAddress = locationMode === 'current' && coordinateLabel ? loadNearbyAddress(coordinateLabel) : null;",
  "        const verifiedLocation = locationMode === 'current'",
  "          ? [cachedAddress?.city || amilCity, cachedAddress?.state || amilState].filter(Boolean).join(' ')",
  "          : [resolvedLayoverLocation, target ? city(target.destination || target.origin) : ''].filter(Boolean).join(' ');",
  "        const payload = await fetchWellhubVerifiedSearch({",
  "          plan: wellhubPlan,",
  "          query: searchTerm.trim(),",
  "          activity: wellhubActivity.trim(),",
  "          location: verifiedLocation,",
  "          limit: 60,",
  "        });",
  "        found = (payload.partners || []).map((partner) => ({",
  "          id: 'wellhub:' + partner.id,",
  "          name: partner.name,",
  "          category: 'gym',",
  "          address: partner.address,",
  "          openingHours: partner.openingHours,",
  "          rating: partner.rating,",
  "          openNow: partner.is24Hours ? true : undefined,",
  "          wellhubActivities: partner.activities || [],",
  "          wellhubMinimumPlan: partner.minimumPlan,",
  "          wellhubSourceUrl: partner.sourceUrl,",
  "          wellhubVerifiedAt: partner.verifiedAt,",
  "        })) as NearbyPlace[];",
  "      } else {",
  "        const gymQuery = category === 'gym' ? 'Smart Fit academia' : '';",
  "        const customQuery = [searchTerm.trim(), gymQuery].filter(Boolean).join(' ');",
  "        found = await fetchNearbyPlaces(location, category, customQuery);",
  "      }",
].join('\n');

const routineCard = `function WellhubRoutineCard({ next }: { next: ZeroLeg | null }) {
  const [suggestion, setSuggestion] = useState<WellhubRoutineSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const rawPlan = storage.get('crewcheck:wellhub-plan', 'basic');
  const plan = (isWellhubPlan(rawPlan) ? rawPlan : 'basic') as WellhubPlan;
  const activity = storage.get('crewcheck:wellhub-activity', '').trim();
  const location = next ? (hotelSearchLocation(next) || [city(next.origin), next.origin].filter(Boolean).join(' ')) : '';
  useEffect(() => {
    if (!next) { setSuggestion(null); return; }
    let alive = true;
    setLoading(true);
    fetchWellhubRoutineSuggestion({ plan, activity, location, nextAt: eventStartDateTime(next).toISOString(), durationMinutes: 45, bufferMinutes: 120 })
      .then((result) => { if (alive) setSuggestion(result); })
      .catch(() => { if (alive) setSuggestion({ ok: false, message: 'Não consegui cruzar a rotina com os horários verificados agora.' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [next?.id, plan, activity, location]);
  if (!next) return null;
  return <section className="cz-toolbox cc-wellhub-routine" data-cc-wellhub-routine="true">
    <header><div><Dumbbell/><span><small>WELLHUB + ROTINA</small><h2>Janela compatível com sua escala</h2></span></div><strong>{wellhubPlanLabel(plan)}{activity ? ' · ' + activity : ''}</strong></header>
    {loading ? <p>Conferindo plano, modalidade, horário da unidade e próxima apresentação…</p> : suggestion?.ok && suggestion.gym ? <>
      <p><strong>{suggestion.gym.name}</strong> · {suggestion.gym.city}/{suggestion.gym.state}. Sugestão operacional: {suggestion.date} das <strong>{suggestion.startTime}</strong> às <strong>{suggestion.endTime}</strong>, preservando {suggestion.bufferMinutes} min antes da próxima programação.</p>
      <div className="cz-routine-strip"><span>A partir do {wellhubPlanLabel(suggestion.gym.minimumPlan)}</span>{suggestion.gym.openingHours?.slice(0, 2).map((hour) => <span key={hour}>{hour}</span>)}{suggestion.gym.activities?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
      <p className="cz-mini-status"><ShieldCheck/> Fonte oficial Wellhub. {suggestion.caution}</p>
      <div className="cz-tool-actions"><a href={suggestion.gym.sourceUrl} target="_blank" rel="noreferrer"><ShieldCheck/> Conferir unidade no Wellhub</a><button onClick={() => openNearbyPlaces('gym', location)}><Dumbbell/> Ver outras academias</button></div>
    </> : <p>{suggestion?.message || 'Sem janela confirmada com os horários verificados.'}</p>}
  </section>;
}
`;

function patchHome(source) {
  let next = source;
  next = insertAfterRequired(next, staticImport, liveImport, 'import do Wellhub live');

  if (!next.includes('wellhubActivities?: string[];')) {
    next = replaceRequired(next,
      "  openingHours?: string[];\n  manual?: boolean;",
      "  openingHours?: string[];\n  wellhubActivities?: string[];\n  wellhubMinimumPlan?: WellhubPlan;\n  wellhubSourceUrl?: string;\n  wellhubVerifiedAt?: string;\n  manual?: boolean;",
      'metadados Wellhub em NearbyPlace');
  }

  next = insertAfterRequired(next,
    "  const [wellhubPlan, setWellhubPlan] = useState<WellhubPlan>(() => { const saved = storage.get('crewcheck:wellhub-plan', 'basic'); return isWellhubPlan(saved) ? saved : 'basic'; });",
    "  const [wellhubActivity, setWellhubActivity] = useState(() => storage.get('crewcheck:wellhub-activity', ''));",
    'estado da modalidade Wellhub');

  next = insertAfterRequired(next,
    "  function chooseWellhubPlan(value: string) {\n    if (!isWellhubPlan(value)) return;\n    setWellhubPlan(value);\n    storage.set('crewcheck:wellhub-plan', value);\n    setPlaces([]);\n    setSelected(null);\n  }",
    "  function chooseWellhubActivity(value: string) {\n    setWellhubActivity(value);\n    storage.set('crewcheck:wellhub-activity', value.trim());\n    setPlaces([]);\n    setSelected(null);\n  }",
    'preferencia de modalidade Wellhub');

  if (!next.includes('// cc-v14407: wellhub-live-official')) next = replaceRequired(next, staticSearch, liveSearch, 'busca oficial por modalidade');

  next = next.replace(
    "  useEffect(() => { search(); }, [location, category, plan, wellhubPlan, amilPlan, amilCare, amilState]);",
    "  useEffect(() => { search(); }, [location, category, plan, wellhubPlan, wellhubActivity, amilPlan, amilCare, amilState]);",
  );

  const planControl = `<label><span>Seu plano Wellhub</span><select value={wellhubPlan} onChange={(event) => chooseWellhubPlan(event.target.value)}>{WELLHUB_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="cz-mini-status"><ShieldCheck/> Snapshot verificado em fonte oficial. A unidade só entra na lista quando o plano mínimo está publicado pelo próprio Wellhub.</p>`;
  const activityControl = `<label><span>Seu plano Wellhub</span><select value={wellhubPlan} onChange={(event) => chooseWellhubPlan(event.target.value)}>{WELLHUB_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Modalidade desejada</span><input value={wellhubActivity} onChange={(event) => chooseWellhubActivity(event.target.value)} placeholder="Ex.: musculação, Pilates, HIIT, dança, Power Bike"/></label><p className="cz-mini-status"><ShieldCheck/> Plano, modalidade e horários são cruzados somente com páginas oficiais verificadas do Wellhub. Você pode escrever qualquer modalidade; quando a fonte não confirmar, o CrewCheck não inventa.</p>`;
  if (!next.includes('Modalidade desejada</span>')) next = replaceRequired(next, planControl, activityControl, 'campo de modalidade');

  if (!next.includes("gymActivity: storage.get('crewcheck:wellhub-activity'")) {
    const askAnchor = "      text,\n      ...(currentLocation ? {";
    const askReplacement = "      text,\n      preferences: {\n        gymPlan: storage.get('crewcheck:gym-provider-plan', 'wellhub'),\n        wellhubPlan: storage.get('crewcheck:wellhub-plan', 'basic'),\n        gymActivity: storage.get('crewcheck:wellhub-activity', ''),\n      },\n      ...(currentLocation ? {";
    next = replaceRequired(next, askAnchor, askReplacement, 'sincronizacao de preferencias com Concierge');
  }

  next = insertBeforeRequired(next, 'function RoutineView({ bundle }: { bundle: BundleState }) {', routineCard, 'cartao Wellhub da Rotina');
  if (!next.includes('<WellhubRoutineCard next={next}/>')) {
    const routineAnchor = `<button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'presentation' }))}><Clock/> Ver apresentação</button></div></section><section className="cz-stack-list">`;
    const routineAfter = `<button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'presentation' }))}><Clock/> Ver apresentação</button></div></section><WellhubRoutineCard next={next}/><section className="cz-stack-list">`;
    next = replaceRequired(next, routineAnchor, routineAfter, 'integracao Rotina + horario de academia');
  }
  return next;
}

const serverImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";

const conciergeGyms = `// cc-v14407:concierge-gyms
async function conciergeGymsReply(snapshot, text = '', profile = {}) {
  const preferences = snapshot?.preferences || {};
  const lower = String(text || '').toLowerCase();
  const provider = /smart\s*fit/i.test(text) && !/wellhub|gympass/i.test(text) ? 'smartfit' : /wellhub|gympass/i.test(text) ? 'wellhub' : String(preferences.gymPlan || 'wellhub');
  const detectedPlan = detectWellhubPlanFromText(text);
  const detectedActivity = detectWellhubActivityFromText(text);
  const wellhubPlan = detectedPlan || (isWellhubPlanServer(preferences.wellhubPlan) ? preferences.wellhubPlan : 'basic');
  const activity = detectedActivity || String(preferences.gymActivity || '').trim();

  if ((detectedPlan || detectedActivity || provider !== preferences.gymPlan) && profile?.email) {
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: {
      gymPlan: provider,
      ...(detectedPlan ? { wellhubPlan: detectedPlan } : {}),
      ...(detectedActivity ? { gymActivity: detectedActivity } : {}),
    } });
    if (saved) snapshot = saved;
  }

  if (provider === 'smartfit') {
    const locationState = conciergeLocationContextV14335(snapshot);
    const stay = conciergeCurrentStay(snapshot?.roster);
    if (!locationState.fresh && !stay?.hotel) return locationState.message;
    const places = await conciergeSearchPlaces('Smart Fit academia', locationState.fresh ? '' : stay.hotel, locationState.fresh ? locationState.location : null, 6);
    if (!places.length) return 'Não encontrei unidade Smart Fit direta agora. Esta busca não afirma parceria Wellhub.';
    return ['Smart Fit direta:', locationState.fresh ? conciergeLocationLineV14335(snapshot) : 'Contexto do pernoite: ' + stay.hotel, '', conciergePlaceLines(places), '', 'Esta busca é de Smart Fit direta e não confirma elegibilidade Wellhub.'].join('\n');
  }

  const stay = conciergeCurrentStay(snapshot?.roster);
  const next = conciergeNextProgram(snapshot?.roster);
  const airport = next?.legs?.[0]?.origin || snapshot?.roster?.base || '';
  const location = snapshot?.preferences?.location || {};
  const locationText = [location.city, location.state, stay?.hotel, WEATHER_AIRPORT_POINTS[airport]?.city, airport].filter(Boolean).join(' ');
  const query = String(text || '').match(/(?:rede|academia)\s+([\p{L}0-9 .&+-]{2,40})/iu)?.[1]?.replace(/\b(?:com|que|perto|em|no|na)\b[\s\S]*$/i, '').trim() || '';
  const partners = await searchVerifiedWellhub({ plan: wellhubPlan, query: /meu plano|modalidade|wellhub|gympass/i.test(query) ? '' : query, activity, locationText, limit: 8 });

  if (!partners.length) {
    return [
      'Wellhub verificado · ' + wellhubPlanLabelServer(wellhubPlan) + (activity ? ' · ' + activity : ''),
      activity ? 'Não encontrei essa modalidade confirmada nas páginas oficiais das unidades que o catálogo atual cobre.' : 'Não encontrei unidade verificada compatível com esse filtro no catálogo atual.',
      'O CrewCheck não usa Google Maps ou apenas o nome da rede para inventar parceria ou modalidade. Tente outra modalidade, cidade ou deixe o campo livre.',
    ].join('\n');
  }

  const lines = partners.map((partner, index) => {
    const activities = partner.activities?.length ? partner.activities.slice(0, 6).join(', ') : activity ? 'modalidade confirmada na página oficial' : 'consulte a página oficial para modalidades';
    return [
      `${index + 1}. ${partner.name} · ${partner.city}/${partner.state}`,
      `   Plano mínimo: ${wellhubPlanLabelServer(partner.minimumPlan)} · Horário: ${(partner.openingHours || []).join(' | ') || 'não publicado no snapshot'}`,
      `   Modalidades: ${activities}`,
      `   Fonte oficial: ${partner.sourceUrl}`,
    ].join('\n');
  });
  return [
    `Wellhub verificado · seu plano ${wellhubPlanLabelServer(wellhubPlan)}${activity ? ` · modalidade ${activity}` : ''}`,
    locationText ? `Contexto: ${locationText}. A localização só ordena os resultados; não define elegibilidade.` : 'Sem cidade confirmada; mostrando unidades compatíveis do catálogo verificado.',
    '', ...lines,
    '', 'Para alterar: diga “meu plano Wellhub é Silver+” ou “quero modalidade Pilates”. A fonte de parceria, plano, modalidade e horário continua sendo o Wellhub.',
  ].join('\n');
}
`;

const conciergeRoutine = `// cc-v14407:concierge-routine
async function conciergeRoutineReply(snapshot, text = '') {
  const next = conciergeNextProgram(snapshot?.roster);
  if (!next) return 'Envie ou sincronize sua escala para eu montar a rotina de recuperação, treino, alimentação e sono.';
  const hours = (next.start.getTime() - Date.now()) / 3_600_000;
  const duty = Number(next.day?.dutyHours || 0);
  const items = [];
  if (hours <= 12) items.push('Prioridade operacional: preserve descanso e preparação; se treinar, mantenha uma sessão curta e compatível com sua recuperação.');
  else if (hours <= 24) items.push('Janela curta: o CrewCheck prioriza uma sessão breve e encerra com margem antes da próxima apresentação.');
  else items.push('Há uma janela maior; a sugestão de academia continua limitada pelos horários reais publicados e pela próxima programação.');
  if (duty >= 10) items.push(`Jornada prevista de ${duty.toFixed(1).replace('.', ',')} h: preserve margem para refeição, deslocamento e recuperação.`);
  if (next.legs?.length >= 3) items.push(`${next.legs.length} etapas no dia: o CrewCheck reduz a prioridade de treino para preservar tempo operacional.`);

  const preferences = snapshot?.preferences || {};
  const detectedActivity = detectWellhubActivityFromText(text);
  const activity = detectedActivity || String(preferences.gymActivity || '').trim();
  const plan = detectWellhubPlanFromText(text) || (isWellhubPlanServer(preferences.wellhubPlan) ? preferences.wellhubPlan : '');
  if (plan && String(preferences.gymPlan || 'wellhub') !== 'smartfit') {
    const stay = conciergeCurrentStay(snapshot?.roster);
    const airport = next?.legs?.[0]?.origin || snapshot?.roster?.base || '';
    const location = preferences.location || {};
    const locationText = [location.city, location.state, stay?.hotel, WEATHER_AIRPORT_POINTS[airport]?.city, airport].filter(Boolean).join(' ');
    const gymWindow = await buildWellhubRoutineSuggestion({ plan, activity, locationText, nextAt: next.start.toISOString(), durationMinutes: hours <= 12 ? 30 : 45, bufferMinutes: 120 });
    if (gymWindow.ok && gymWindow.gym) {
      items.push(`Academia compatível: ${gymWindow.gym.name} (${wellhubPlanLabelServer(gymWindow.gym.minimumPlan)}), ${gymWindow.date} de ${gymWindow.startTime} a ${gymWindow.endTime}.`);
      items.push(`Horário oficial: ${(gymWindow.gym.openingHours || []).join(' | ')}.${activity ? ` Modalidade: ${activity}.` : ''}`);
      items.push(`Fonte oficial: ${gymWindow.gym.sourceUrl}`);
    } else {
      items.push(`Academia: ${gymWindow.message}`);
    }
  } else {
    items.push('Academia: defina seu plano Wellhub no app ou diga “meu plano Wellhub é Basic+/Silver/Gold...” para cruzar plano, modalidade, horário e escala.');
  }
  items.push(`Próxima programação: ${conciergeProgramTitle(next)} · ${conciergeDateLabel(next)} · apresentação ${conciergePresentationTime(next)}.`);
  return ['Rotina sugerida', ...items.map((item) => `• ${item}`)].join('\n');
}
`;

function patchServer(source) {
  let next = source;
  const importAnchor = "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';";
  next = insertAfterRequired(next, importAnchor, serverImport, 'import do motor Wellhub');
  next = replaceBetween(next, 'async function conciergeGymsReply(', 'function conciergeRoutineReply(', conciergeGyms, 'Concierge academias');
  next = replaceBetween(next, 'function conciergeRoutineReply(', 'function conciergePerDiemReply(', conciergeRoutine, 'Concierge rotina');

  next = next.replace(
    "if (/^\\/academias?(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto)\\b/i.test(lower)) return conciergeGymsReply(snapshot);",
    "if (/^\\/(?:academias?|wellhub)(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto|meu plano (?:wellhub )?(?:basic|silver|gold|platinum|diamond|starter|digital))\\b/i.test(lower)) return conciergeGymsReply(snapshot, value, profile);",
  );
  next = next.replace(
    "if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot);",
    "if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot, value);",
  );

  const locationSave = "  if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: body.location } });";
  const preferenceSave = `  const incomingGymPreferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : null;
  if (incomingGymPreferences) {
    const gymPlan = ['wellhub', 'smartfit'].includes(String(incomingGymPreferences.gymPlan || '')) ? String(incomingGymPreferences.gymPlan) : undefined;
    const wellhubPlan = isWellhubPlanServer(incomingGymPreferences.wellhubPlan) ? String(incomingGymPreferences.wellhubPlan) : undefined;
    const gymActivity = String(incomingGymPreferences.gymActivity || '').trim().slice(0, 80);
    snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: {
      ...(gymPlan ? { gymPlan } : {}),
      ...(wellhubPlan ? { wellhubPlan } : {}),
      ...(gymActivity ? { gymActivity } : {}),
    } });
  }`;
  next = insertAfterRequired(next, locationSave, preferenceSave, 'preferencias do app no Concierge');

  const routeAnchor = "if (url.pathname === '/api/telegram/link/start') return handleTelegramLinkStart(req, res, url);";
  const routes = `  if (url.pathname === '/api/wellhub/search') return handleWellhubSearchRoute(req, res, url);
  if (url.pathname === '/api/wellhub/routine') return handleWellhubRoutineRoute(req, res, url);`;
  next = insertBeforeRequired(next, routeAnchor, routes, 'rotas Wellhub verificadas');
  return next;
}

update('client/src/pages/Home.tsx', patchHome);
update('server.mjs', patchServer);

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.scripts ||= {};
  data.scripts['regression:v14.4.07:wellhub-concierge-routine'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-4-07-wellhub-concierge-routine.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`${TAG} Concierge Wellhub: plano + modalidade + horarios oficiais + Rotina.`);
