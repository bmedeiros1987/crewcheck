import fs from 'node:fs';
const path = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = '// stay-editor-context-v2';
if (!source.includes(marker)) {
  source = `${marker}\nimport { openStayProgramEditor, consumeStayEditorReturn, readStayEditorIntent, returnFromStayProgramEditor } from '@/lib/stayEditorNavigation';\nimport { savedStayEditorEvent } from '@/lib/stayEditorStore';\n` + source;
  const start = source.indexOf('function HotelsView('), end = source.indexOf('\nfunction ', start + 10);
  if (start < 0 || end < 0) throw new Error('Stay editor: HotelsView boundary unavailable');
  let block = source.slice(start, end);
  const replace = (before, after) => { if (!block.includes(before)) throw new Error(`Stay editor: missing anchor ${before.slice(0,80)}`); block = block.replace(before, after); };
  block = block.replace(/const \[selectedEventId, setSelectedEventId\] = useState\([^;]+;/, "const [selectedEventId, setSelectedEventId] = useState(() => consumeStayEditorReturn() || '');");
  replace('const refresh = () => listPlatformStays().then((payload) => setSaved(payload.stays || [])).catch(() => undefined);', `const refresh = () => { const token = getToken(); return listPlatformStays().then(payload => { if (token === getToken()) setSaved(payload.localOnly ? [] : payload.stays || []); }).catch(() => undefined); };`);
  replace('  useEffect(() => { refresh(); }, []);', `  useEffect(() => { refresh();
    const reset = () => { setSaved([]); setCompanions({}); setSelectedEventId(''); setEditorOpen(false); setQuery(''); setDraft({ hotelName: '', airport: '', stayDate: '', room: '', presentationTime: '', leadMinutes: '90', shareSameHotel: false, shareWithVisitors: false }); };
    const storage = (event: StorageEvent) => { if(['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key || '')) reset(); };
    window.addEventListener('crewcheck:auth-changed', reset); window.addEventListener('crewcheck:auth-expired', reset); window.addEventListener('storage', storage);
    return () => { window.removeEventListener('crewcheck:auth-changed', reset); window.removeEventListener('crewcheck:auth-expired', reset); window.removeEventListener('storage', storage); };
  }, []);`);
  // Explicit ID survives removal, leaving an unavailable state instead of another stay.
  block = block.replace(/const selectedEvent = [^;]+;/, "const selectedEvent = selectedEventId ? stays.filter(event => event.id === selectedEventId).length === 1 ? stays.find(event => event.id === selectedEventId)! : null : stays.find(event => event.id === contextualEventId) || null;");
  block = block.replace("if (selectedEventId && !stays.some((event) => event.id === selectedEventId)) setSelectedEventId('');", "// Explicit selection is retained when removed; no automatic fallback.");
  replace('  function savedFor(event: ZeroLeg) {', `  useEffect(() => {
    if (!selectedEventId) return;
    const card = document.querySelector<HTMLElement>('[data-stay-editor-selected="true"]');
    card?.scrollIntoView({ block: 'center' }); card?.focus({ preventScroll: true });
  }, [selectedEventId]);
  function savedFor(event: ZeroLeg) {
    const local = savedStayEditorEvent(event.id, event);
    if (local) return { ...local.draft, presentationTime: local.apzConfirmed ? local.draft.presentationTime : '', leadMinutes: local.choice?.mode === 'relative' ? local.choice.leadMinutes : undefined };`);
  block = block.replace("if (selectedEventId) setSelectedEventId('');", '// Retain removed explicit identity.');
  block = block.replace("return saved.find((item) =>", "const legacy = saved.find((item) =>").replace("|| saved.find((item) => String(item.stayDate || '').slice(0, 10) === date);", "|| saved.find((item) => String(item.stayDate || '').slice(0, 10) === date);\n    return legacy ? { ...legacy, presentationTime: '' } : null;");
  block = block.replace("current?.presentationTime || safe(event?.presentation, '')", "current?.presentationTime || ''");
  block = block.replace("onClick={() => openStaySurface(event, 'wakeup')}", "onClick={() => openStayProgramEditor(event)}");
  replace('onClick={() => openEditor(event)}><Save/> Editar pernoite', 'onClick={() => openStayProgramEditor(event)}><Save/> Editar pernoite e despertador');
  replace('key={`hotel-${event.id}`}><div className="cz-roster-main">', `key={\`hotel-\${event.id}\`} tabIndex={-1} data-stay-editor-selected={event.id === selectedEventId}><div className="cz-roster-main" role="button" tabIndex={0} aria-label={\`Editar pernoite \${event.id}\`} onClick={() => openStayProgramEditor(event)} onKeyDown={key => { if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); openStayProgramEditor(event); } }}>`);
  // Avoid presenting a roster/check-in clock as hotel APZ in either shelf or details.
  block = block.replaceAll("current?.presentationTime || safe(event.presentation, 'A confirmar')", "current?.presentationTime || 'APZ no hotel a confirmar'");
  block = block.replaceAll('current?.presentationTime || safe(event.presentation, "A confirmar")', "current?.presentationTime || 'APZ no hotel a confirmar'");
  block = block.replace('${selectedEvent.presentation || "a confirmar"}', '${savedFor(selectedEvent)?.presentationTime || "APZ no hotel a confirmar"}');
  replace('return <><Brand back/>', 'return <><Brand back/>{selectedEventId && !selectedEvent && <p role="alert">O pernoite selecionado não está mais na escala. Selecione outro explicitamente.</p>}');
  source = source.slice(0, start) + block + source.slice(end);
  source = source.replace('<PresentationStayManagerView events={events}/>', '<PresentationStayManagerView events={events} embedded/>');
  const brandStart = source.indexOf('function Brand('), brandEnd = source.indexOf('\nfunction ', brandStart + 10);
  let brand = source.slice(brandStart, brandEnd);
  const click = "  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));";
  if (!brand.includes(click)) throw new Error('Stay editor: Brand return anchor missing');
  brand = brand.replace(click, "  const stayReturn = back && Boolean(readStayEditorIntent());\n  const click = stayReturn ? returnFromStayProgramEditor : onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));");
  brand = brand.replace("aria-label={back ? 'Voltar ao FlightDeck' : 'Menu'}", "aria-label={stayReturn ? 'Voltar ao pernoite' : back ? 'Voltar ao FlightDeck' : 'Menu'}");
  source = source.slice(0, brandStart) + brand + source.slice(brandEnd);
  fs.writeFileSync(path, source);
}
