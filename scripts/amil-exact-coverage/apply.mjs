import fs from 'node:fs';
function replace(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[amil-coverage] Missing anchor: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}
const path = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('cc-amil-exact-coverage')) {
  source = "// cc-amil-exact-coverage\nimport { amilConfirmedProviders, amilUnknownMessage, AMIL_GUIDE_URL } from '../../../shared/amil-coverage.mjs';\n" + source;
  source = replace(source, "planCode: 'S450' | 'S750'; state?: string; city?: string; query?: string; care: string", "planCode: 'S450' | 'S750'; productCode: string; networkCode: string; serviceCode: string; specialty: string; state?: string; city?: string; query?: string; care: string");
  source = replace(source, "    if (options.coordinates) { params.set('latitude', String(options.coordinates.lat)); params.set('longitude', String(options.coordinates.lon)); }", "    for (const key of ['productCode', 'networkCode', 'serviceCode', 'specialty'] as const) params.set(key, options[key]);");
  source = replace(source, 'providers: Array.isArray(response.providers) ? response.providers : []', 'providers: amilConfirmedProviders(response.providers, options)');
  source = replace(source, "  const [amilCare, setAmilCare]", "  const [amilProduct, setAmilProduct] = useState('');\n  const [amilNetwork, setAmilNetwork] = useState('');\n  const [amilService, setAmilService] = useState('PS');\n  const [amilSpecialty, setAmilSpecialty] = useState('');\n  const amilSearchSequence = useRef(0);\n  useEffect(() => { const reset = () => { amilSearchSequence.current++; setAmilProviders([]); setAmilTotal(0); }; window.addEventListener('crewcheck:auth-changed', reset); window.addEventListener('crewcheck:auth-expired', reset); return () => { reset(); window.removeEventListener('crewcheck:auth-changed', reset); window.removeEventListener('crewcheck:auth-expired', reset); }; }, []);\n  const amilSelectionKey = JSON.stringify([amilPlan, amilProduct, amilNetwork, amilService, amilSpecialty, amilCare, amilState, amilCity, amilQuery, category]);\n  const amilSelectionRef = useRef('');\n  amilSelectionRef.current = amilSelectionKey;\n  useEffect(() => { setAmilProviders([]); setAmilTotal(0); setAmilMessage(amilUnknownMessage(amilPlan)); return () => { amilSearchSequence.current++; }; }, [amilSelectionKey]);\n  const [amilCare, setAmilCare]");
  // The selection key belongs after all its state declarations (and result state).
  const start = source.indexOf('  const amilSearchSequence =');
  const end = source.indexOf('  const [amilCare,', start);
  const guard = source.slice(start, end);
  source = source.slice(0, start) + source.slice(end);
  const anchor = '  async function search() {';
  source = replace(source, anchor, guard + anchor);
  source = replace(source, "    if (!location || (locationMode === 'current' && !coordinates)) return;", "    if (category !== 'hospital' && (!location || (locationMode === 'current' && !coordinates))) return;");
  source = replace(source, '    setLoading(true);\n    try {\n      // cc-v14407: wellhub-live-official', '    const requestSequence = ++amilSearchSequence.current;\n    const requestSelection = amilSelectionRef.current;\n    setLoading(true);\n    try {\n      // cc-v14407: wellhub-live-official');
  source = replace(source, 'found = await fetchNearbyPlaces(location, category, customQuery);', "found = category === 'hospital' ? [] : await fetchNearbyPlaces(location, category, customQuery);");
  source = replace(source, 'planCode: amilPlan, state: amilState', 'planCode: amilPlan, productCode: amilProduct, networkCode: amilNetwork, serviceCode: amilService, specialty: amilSpecialty, state: amilState');
  source = replace(source, '        setAmilProviders(amil.providers);', '        if (requestSequence !== amilSearchSequence.current || requestSelection !== amilSelectionRef.current) return;\n        setAmilProviders(amil.providers);');
  source = replace(source, "  const allPlaces = [...manualPlaces.filter((place) => place.category === category), ...places]", "  const allPlaces = (category === 'hospital' ? [] : [...manualPlaces.filter((place) => place.category === category), ...places])");
  source = replace(source, '{selected && <section className="cz-place-detail-card">', '{category !== \'hospital\' && selected && <section className="cz-place-detail-card">');
  source = replace(source, '  sourcePrintedAt?: string;', '  sourceVerifiedAt?: string;\n  sourcePrintedAt?: string;');
  source = replace(source, "  const amilResultsSection = category === 'hospital'", "  const visibleAmilProviders = amilConfirmedProviders(amilProviders, { planCode: amilPlan, productCode: amilProduct, networkCode: amilNetwork, serviceCode: amilService, specialty: amilSpecialty, state: amilState, city: amilCity, query: amilQuery });\n  const amilResultsSection = category === 'hospital'");
  source = replace(source, "provider.mapsQuery || [provider.name, provider.city, provider.state].filter(Boolean).join(' ')", "[provider.name, provider.address, provider.city, provider.state].join(', ')");
  source = replace(source, '<h2>Atendimento coberto pelo plano</h2>', '<h2>Compatibilidade confirmada pela fonte oficial</h2>');
  source = source.replace(/<label><span>Tipo de atendimento<\/span><select value=\{amilCare\}[\s\S]*?<\/select><\/label>/, '');
  source = replace(source, '    {amilProviders.length ? <div', '    <div className="cc-amil-filter-grid"><label>Produto exato (código público)<input value={amilProduct} onChange={event => setAmilProduct(event.target.value)} placeholder="Produto/variante QP ou QC" maxLength={60}/></label><label>Rede exata (código público)<input value={amilNetwork} onChange={event => setAmilNetwork(event.target.value)} placeholder="Código da rede no Guia Amil" maxLength={60}/></label><label>Serviço específico<select value={amilService} onChange={event => setAmilService(event.target.value)}><option value="PS">Pronto-socorro</option><option value="PS24H">Pronto-socorro 24h</option><option value="PA">Pronto atendimento</option><option value="H">Hospital eletivo</option><option value="M">Maternidade</option><option value="PSI">Pronto-socorro infantil</option></select></label><label>Especialidade exata<input value={amilSpecialty} onChange={event => setAmilSpecialty(event.target.value)} placeholder="Ex.: PRONTO SOCORRO ADULTO" maxLength={100}/></label></div><p>Não informe CPF, carteirinha ou dados de saúde. S450/S750 não comprovam sozinhos a variante e a rede.</p>\n    {amilProviders.length ? <div');
  source = replace(source, "provider.sourcePrintedAt ? `PDF impresso em ${new Intl.DateTimeFormat('pt-BR').format(new Date(`${provider.sourcePrintedAt}T12:00:00`))} · página ${provider.sourcePage || '—'}` : 'Fonte publicada · data no documento'", "provider.sourceVerifiedAt ? `Fonte oficial consultada em ${provider.sourceVerifiedAt}` : 'Data oficial não confirmada'");
  source = replace(source, '<span><ShieldCheck/> Coberto no {provider.planCode || amilPlan}</span>', '<span><ShieldCheck/> Rede confirmada: {provider.planCode} · produto {amilProduct} · rede {amilNetwork} · serviço {amilService} · {amilSpecialty}</span><a href={provider.sourceUrl} target="_blank" rel="noreferrer">Fonte oficial da unidade</a>');
  source = replace(source, "amilMessage || 'Escolha a UF e o tipo de atendimento para ver somente prestadores publicados para o plano selecionado.'", 'amilMessage || amilUnknownMessage(amilPlan)');
  source = replace(source, 'Snapshot informativo extraído dos PDFs publicados.', 'A lista inclui apenas evidência oficial atual para o produto, rede, unidade, serviço e região selecionados; não garante autorização individual.');
  source = replace(source, '  </section> : null;\n\n  return <><Brand back/>{amilResultsSection}', '    <a href={AMIL_GUIDE_URL} target="_blank" rel="noreferrer">Conferir no Guia Amil</a>\n  </section> : null;\n\n  return <><Brand back/>{amilResultsSection}');
  source = replace(source, "{!(category === 'gym' && plan === 'wellhub') && <button onClick={() => openPlacesInGoogleMaps", "{category !== 'hospital' && !(category === 'gym' && plan === 'wellhub') && <button onClick={() => openPlacesInGoogleMaps");
  source = replace(source, '<section className="cz-stack-list cz-places-results">', "{category !== 'hospital' && <section className=\"cz-stack-list cz-places-results\">");
  source = replace(source, '</div></article>}</section>\n  </>;\n}', '</div></article>}</section>}\n  </>;\n}');
  const renderStart = source.indexOf('  const amilResultsSection =');
  const renderEnd = source.indexOf('  return <><Brand back/>{amilResultsSection}', renderStart);
  source = source.slice(0, renderStart) + source.slice(renderStart, renderEnd).replaceAll('amilProviders', 'visibleAmilProviders').replaceAll('amilTotal', 'visibleAmilProviders.length') + source.slice(renderEnd);
  fs.writeFileSync(path, source);
}
// Preserve the older fallback route without issuing any generic hospital lookup.
const serverPath = 'server.mjs';
let server = fs.readFileSync(serverPath, 'utf8');
if (!server.includes("from './shared/amil-coverage.mjs'")) server = "import { amilUnknownMessage } from './shared/amil-coverage.mjs';\n" + server;
const oldHospitalReply = fs.readFileSync('scripts/v14365/hospitals-reply.snippet', 'utf8').trim();
const safeHospitalReply = 'async function conciergeHospitalsReply(snapshot) {\n  return amilUnknownMessage();\n}';
server = replace(server, oldHospitalReply, safeHospitalReply);
fs.writeFileSync(serverPath, server);
