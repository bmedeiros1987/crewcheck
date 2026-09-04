import fs from 'node:fs';

const TAG = '[v14406]';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`${TAG} Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} Bloco ausente: ${label}`);
  return source.replace(before, after);
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Ancora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Ancora ausente: ${label}`);
  return source.replace(anchor, `${value}\n${anchor}`);
}

const wellhubImport = "import { WELLHUB_PLAN_OPTIONS, isWellhubPlan, searchVerifiedWellhubPartners, verifiedWellhubPartnerFromPlaceId, wellhubPlanLabel, type WellhubPlan } from '@/lib/wellhubVerifiedCatalog';";

const gymSearchBefore = [
  "      const gymQuery = category === 'gym'",
  "        ? plan === 'wellhub'",
  "          ? partnerChains.join(' ') + ' academia parceira Wellhub'",
  "          : plan === 'smartfit' ? 'Smart Fit academia'",
  "          : partnerChains.join(' ') + ' Smart Fit academia'",
  "        : '';",
  "      const customQuery = [searchTerm.trim(), gymQuery].filter(Boolean).join(' ');",
  "      const found = await fetchNearbyPlaces(location, category, customQuery);",
].join('\n');

const gymSearchAfter = [
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

const originalGymProvider = `{category === 'gym' && <><p className="cz-gym-provider-note">Wellhub é um benefício corporativo que conecta empresas a academias parceiras; não é uma academia. A busca mostra os estabelecimentos dentro do CrewCheck. Confirme a elegibilidade no canal da empresa antes de sair.</p><div className="cz-tool-actions cz-provider-actions"><button className={plan === 'ambos' ? 'active' : ''} onClick={() => choosePlan('ambos')}>Todas</button><button className={plan === 'wellhub' ? 'active' : ''} onClick={() => choosePlan('wellhub')}>Wellhub</button><button className={plan === 'smartfit' ? 'active' : ''} onClick={() => choosePlan('smartfit')}>Smart Fit</button></div></>}`;
const verifiedGymProvider = `{category === 'gym' && <><p className="cz-gym-provider-note"><ShieldCheck/> No modo Wellhub, o CrewCheck só lista unidades com página oficial do Wellhub e plano mínimo confirmado. Google Maps não é usado para afirmar parceria ou elegibilidade; quando disponível, serve apenas para rota até um endereço já verificado.</p><div className="cz-tool-actions cz-provider-actions"><button className={plan === 'wellhub' ? 'active' : ''} onClick={() => choosePlan('wellhub')}>Wellhub verificado</button><button className={plan === 'smartfit' ? 'active' : ''} onClick={() => choosePlan('smartfit')}>Smart Fit direta</button></div>{plan === 'wellhub' && <div className="cz-form-grid"><label><span>Seu plano Wellhub</span><select value={wellhubPlan} onChange={(event) => chooseWellhubPlan(event.target.value)}>{WELLHUB_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="cz-mini-status"><ShieldCheck/> Snapshot verificado em fonte oficial. A unidade só entra na lista quando o plano mínimo está publicado pelo próprio Wellhub.</p></div>}</>}`;

function patchHome(source) {
  let next = source;

  if (!next.includes(wellhubImport)) {
    const preferredAnchor = "import { loadFreshNearbyCurrentGeo, loadNearbyPlacesOrigin, saveNearbyPlacesOrigin, type NearbyPlacesOriginMode } from '@/lib/nearbyPlacesOrigin';";
    const fallbackAnchor = "import '@/components/v1399/premium.css';";
    if (next.includes(preferredAnchor)) next = insertAfterRequired(next, preferredAnchor, wellhubImport, 'import Wellhub');
    else next = insertAfterRequired(next, fallbackAnchor, wellhubImport, 'import Wellhub fallback');
  }

  next = replaceRequired(
    next,
    "const DEFAULT_GYM_PARTNER_CHAINS = ['Selfit', 'Panobianco', 'Bluefit', 'Corpo e Saúde', 'Pratique', 'Fórmula', 'Bodytech', 'Fábrica de Monstros', 'Ultra'];",
    "const DEFAULT_GYM_PARTNER_CHAINS = ['Academia Gaviões', 'Gaviões', 'SkyFit', 'Selfit', 'Panobianco', 'Bluefit', 'Corpo e Saúde', 'Pratique', 'Fórmula', 'Bodytech', 'Fábrica de Monstros', 'Ultra'];",
    'redes de check-in',
  );

  next = replaceRequired(
    next,
    "  const [plan, setPlan] = useState(() => storage.get('crewcheck:gym-provider-plan', 'wellhub'));",
    "  const [plan, setPlan] = useState<'wellhub' | 'smartfit'>(() => storage.get('crewcheck:gym-provider-plan', 'wellhub') === 'smartfit' ? 'smartfit' : 'wellhub');\n  const [wellhubPlan, setWellhubPlan] = useState<WellhubPlan>(() => { const saved = storage.get('crewcheck:wellhub-plan', 'basic'); return isWellhubPlan(saved) ? saved : 'basic'; });",
    'estado de plano Wellhub',
  );

  next = replaceRequired(
    next,
    "  function choosePlan(value: string) {\n    setPlan(value);\n    storage.set('crewcheck:gym-provider-plan', value);\n  }",
    "  function choosePlan(value: 'wellhub' | 'smartfit') {\n    setPlan(value);\n    storage.set('crewcheck:gym-provider-plan', value);\n    setPlaces([]);\n    setSelected(null);\n  }\n  function chooseWellhubPlan(value: string) {\n    if (!isWellhubPlan(value)) return;\n    setWellhubPlan(value);\n    storage.set('crewcheck:wellhub-plan', value);\n    setPlaces([]);\n    setSelected(null);\n  }",
    'seletor de plano Wellhub',
  );

  next = replaceRequired(next, gymSearchBefore, gymSearchAfter, 'busca Wellhub verificada');

  next = next.replace(
    "  useEffect(() => { search(); }, [location, category, plan, amilPlan, amilCare, amilState]);",
    "  useEffect(() => { search(); }, [location, category, plan, wellhubPlan, amilPlan, amilCare, amilState]);",
  );

  next = next.replace(
    "  const visiblePlaces = allPlaces\n    .filter((place) => !onlyOpen || place.openNow !== false)",
    "  const visiblePlaces = allPlaces\n    .filter((place) => (category === 'gym' && plan === 'wellhub') || !onlyOpen || place.openNow !== false)",
  );

  next = insertAfterRequired(
    next,
    "  const categoryMeta = PLACE_CATEGORY_META[category];",
    "  const selectedWellhub = category === 'gym' && plan === 'wellhub' && selected ? verifiedWellhubPartnerFromPlaceId(selected.id) : null;",
    'metadados oficiais selecionados',
  );

  if (!next.includes('Wellhub verificado</button>')) next = replaceRequired(next, originalGymProvider, verifiedGymProvider, 'controles Wellhub');

  const openFilter = `<button className={onlyOpen ? 'active' : ''} onClick={() => { const next = !onlyOpen; setOnlyOpen(next); storage.set('crewcheck:gym-only-open', next ? '1' : '0'); }}><Clock/> {onlyOpen ? 'Somente abertos' : 'Incluir fechados'}</button>`;
  const openFilterAfter = `{category === 'gym' && plan === 'wellhub' ? <button disabled><Clock/> Horários publicados pelo Wellhub</button> : <button className={onlyOpen ? 'active' : ''} onClick={() => { const next = !onlyOpen; setOnlyOpen(next); storage.set('crewcheck:gym-only-open', next ? '1' : '0'); }}><Clock/> {onlyOpen ? 'Somente abertos' : 'Incluir fechados'}</button>}`;
  if (!next.includes('Horários publicados pelo Wellhub')) next = replaceRequired(next, openFilter, openFilterAfter, 'sem falso aberto agora');

  const mapsSearch = `<button onClick={() => openPlacesInGoogleMaps(category, location)}><MapIcon/> Ver busca no Google Maps</button>`;
  const mapsSearchAfter = `{!(category === 'gym' && plan === 'wellhub') && <button onClick={() => openPlacesInGoogleMaps(category, location)}><MapIcon/> Ver busca no Google Maps</button>}`;
  if (!next.includes("!(category === 'gym' && plan === 'wellhub')")) next = replaceRequired(next, mapsSearch, mapsSearchAfter, 'Maps fora da descoberta Wellhub');

  const sourceCard = `    {selectedWellhub && <section className="cz-toolbox cc-wellhub-source"><header><div><ShieldCheck/><span><small>FONTE OFICIAL WELLHUB</small><h2>Unidade verificada</h2></span></div><strong>A partir do {wellhubPlanLabel(selectedWellhub.minimumPlan)}</strong></header><p>{selectedWellhub.name} consta no diretório público oficial do Wellhub. Fonte conferida em {new Intl.DateTimeFormat('pt-BR').format(new Date(selectedWellhub.verifiedAt + 'T12:00:00'))}.{selectedWellhub.accessNote ? ' ' + selectedWellhub.accessNote : ''}</p><div className="cz-tool-actions"><a href={selectedWellhub.sourceUrl} target="_blank" rel="noreferrer"><ShieldCheck/> Abrir página oficial no Wellhub</a></div></section>}`;
  if (!next.includes('FONTE OFICIAL WELLHUB')) {
    next = insertBeforeRequired(next, `    {selected && <section className="cz-place-detail-card">`, sourceCard, 'fonte oficial da unidade');
  }

  next = next.replace(
    '<section className="cz-panel-head cz-panel-head-compact"><h1>Locais próximos</h1><p>Pesquise, compare e trace a rota dentro do CrewCheck. O Google Maps é opcional.</p></section>',
    '<section className="cz-panel-head cz-panel-head-compact"><h1>Locais próximos</h1><p>Para Wellhub, parceria e plano vêm da fonte oficial. Mapas e geolocalização servem somente para contexto e rota.</p></section>',
  );

  return next;
}

function patchConciergeGymSearch(source) {
  const legacyPair = "  const partnerChains = 'Selfit Panobianco Bluefit Corpo e Saúde Pratique Fórmula Bodytech Fábrica de Monstros Ultra';\n  const query = plan === 'smartfit' ? 'Smart Fit academia aberta agora' : plan === 'wellhub' ? `${partnerChains} academia parceira aberta agora` : `Smart Fit ${partnerChains} academia aberta agora`;";
  const safePair = "  if (plan !== 'smartfit') return 'Wellhub no CrewCheck usa somente unidades e planos verificados no diretório oficial. Abra Academias no app para consultar o catálogo verificado; a busca genérica por mapas foi desativada para não inferir parceria.';\n  const query = 'Smart Fit academia aberta agora';";
  let next = source.split(legacyPair).join(safePair);
  next = next.split("`Academias próximas · busca ${plan === 'ambos' ? 'Wellhub + Smart Fit' : plan}:`").join("`Academias próximas · Smart Fit direta:`");
  next = next.split("'Wellhub é um benefício corporativo, não uma academia. Confirme parceria, elegibilidade, lotação e horário nos canais oficiais antes de sair.'").join("'Esta busca é de Smart Fit direta e não confirma parceria Wellhub. Para Wellhub, use o catálogo verificado no app.'");
  return next;
}

update('client/src/pages/Home.tsx', patchHome);
update('server.mjs', patchConciergeGymSearch);
update('scripts/v14335/gyms-reply.snippet', patchConciergeGymSearch, { optional: true });

console.log(`${TAG} Wellhub usa somente catalogo verificado; Maps nao define parceria nem plano.`);
