import fs from 'node:fs';
const path='client/src/pages/Home.tsx';let source=fs.readFileSync(path,'utf8');
if(!source.includes("from '@/lib/stayDisplayOrder'")) {
 source="import { orderStayDisplay } from '@/lib/stayDisplayOrder';\n"+source;
 const start=source.indexOf('function HotelsView('),end=source.indexOf('\nfunction ',start+10);let block=source.slice(start,end);
 const replace=(a,b)=>{if(!block.includes(a))throw Error(`[menu-organization] missing stay anchor ${a.slice(0,60)}`);block=block.replace(a,b)};
 replace("  const stays = events.filter((event) => event.kind === 'stay' || event.hotel);", "  const [stayNow,setStayNow] = useState(Date.now);\n  useEffect(() => { const timer = window.setInterval(() => setStayNow(Date.now()),60_000); return () => window.clearInterval(timer); }, []);\n  const stayDisplay = orderStayDisplay(events.filter((event) => event.kind === 'stay' || event.hotel),stayNow);\n  const stays = stayDisplay.events;");
 replace("useState(() => contextualStayId(stays))", "useState('')");
 replace('  const contextualEventId = contextualStayId(stays);', "  const contextualEventId = stayDisplay.recommended?.id || '';");
 replace("if (!stays.some((event) => event.id === selectedEventId)) setSelectedEventId(contextualStayId(stays));", "if (selectedEventId && !stays.some((event) => event.id === selectedEventId)) setSelectedEventId('');");
 replace('<section className="cz-toolbox cz-hotel-finder">', '<section className="cz-stay-context" aria-label="Pernoite pela escala"><strong>{selectedEventId ? "Selecionado manualmente" : stayDisplay.ambiguous ? "Há intervalos de pernoite sobrepostos. Selecione manualmente." : stayDisplay.recommended ? stayDisplay.label(stayDisplay.recommended.id) : "Não há pernoite atual ou próximo com intervalo confirmado."}</strong><p>{selectedEvent ? `${selectedEvent.hotel || "Hotel não informado"} · ${selectedEvent.destination || selectedEvent.origin || "Local não informado"} · Apresentação ${selectedEvent.presentation || "a confirmar"}` : "A escala não confirma um hotel atual. Você pode selecionar ou informar um pernoite."}</p>{selectedEventId && <button type="button" onClick={() => setSelectedEventId(\'\')}>Voltar à sugestão da escala</button>}</section>\n    <section className="cz-toolbox cz-hotel-finder">');
 replace('{stays.length > 1 && <label', '{stays.length > 0 && <label');
 replace('{stays.map((stay) => <option', '<option value="">Escolher pernoite</option>{stays.map((stay) => <option');
 replace('{dateChip(stay.date)} · {stay.destination', '{stayDisplay.label(stay.id)} · {dateChip(stay.date)} · {stay.destination');
 replace('<h3>{current?.hotelName || safe(event.hotel, `Hotel em ${city(event.destination)}`)}</h3>', '<small className="cc-stay-state">{stayDisplay.label(event.id)}</small><h3>{current?.hotelName || safe(event.hotel, `Hotel em ${city(event.destination)}`)}</h3><strong>Apresentação {current?.presentationTime || safe(event.presentation, "A confirmar")}</strong>');
 // Keep vital hotel/presentation information in the shelf; make the long service/action panel progressive.
 replace('<div className="cz-detail-grid"><div><span>Quarto</span>', '<details className="cc-stay-more"><summary>Detalhes e serviços deste pernoite</summary><div className="cz-detail-grid"><div><span>Quarto</span>');
 replace('</p>}</article>; }) : <article className="cz-empty-real"><Hotel/>', '</p>}</details></article>; }) : <article className="cz-empty-real"><Hotel/>');
 source=source.slice(0,start)+block+source.slice(end);
}
fs.writeFileSync(path,source);
console.log('[menu-organization] canonical stay ordering; no inferred hotel, location or duration');
// Reuse existing account preferences and the filtered live menu catalog.
source=fs.readFileSync(path,'utf8');
if(!source.includes("from '@/lib/menuUsagePreference'")) {
 source="import { consumePendingNavigationContext } from '@/lib/navigationContext';\nimport { suggestedMenuShortcuts, recordMenuUse } from '@/lib/menuUsagePreference';\nimport { searchMenuTargets } from '@/lib/menuNestedSearch';\nimport { MenuPersonalization } from '@/components/v1391/MenuPersonalization';\n"+source;
 const replace=(a,b)=>{if(!source.includes(a))throw Error(`[menu-organization] missing menu anchor ${a.slice(0,70)}`);source=source.replace(a,b)};
 replace('    setViewState(nextView);', "    if (nextView !== view) recordMenuUse(localStorage, getStoredUser()?.id, nextView, MENU_5S_ALLOWED_IDS.filter(id => isAdmin() || !['updates','maintenance','admin'].includes(id)));\n    setViewState(nextView);");
 replace('  const favoriteItems = menuFavorites\n', '  const visibleShortcutIds = suggestedMenuShortcuts(localStorage,accountId,allMenuItems.map(([id])=>id));\n  const nestedResults = searchMenuTargets(menuQuery,allMenuItems.map(([id])=>id));\n  const favoriteItems = visibleShortcutIds\n');
 replace('!menuFavorites.includes(viewId)', '!visibleShortcutIds.includes(viewId)');
 replace('    setMenuFavorites(next);', "    setMenuFavorites(next);window.dispatchEvent(new Event('crewcheck:menu-favorites'));");
 replace("button:not([disabled]), input:not([disabled]), [tabindex=\"0\"]", "button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex=\"0\"]");
 replace('  const jump = (v: ZeroView)', `  const jumpNested = (item: ReturnType<typeof searchMenuTargets>[number]) => {
    if (item.id === 'home-personalization') { setMenuQuery(''); requestAnimationFrame(() => { const editor=document.getElementById('cc-menu-personalization') as HTMLDetailsElement | null; if(editor) { editor.open=true; editor.scrollIntoView({block:'start'}); editor.querySelector<HTMLElement>('summary')?.focus(); } }); return; }
    setPendingNavigationContext({sourceView:'menu-search',targetView:item.view,programId:item.id,policy:'once'});
    setView(item.view as ZeroView);close();requestAnimationFrame(()=>window.dispatchEvent(new Event('crewcheck:menu-setting-focus')));
  };
  const jump = (v: ZeroView)`);
 replace('        <p className="cc-menu-status"', `        <MenuPersonalization catalog={allMenuItems.map(([id,label])=>({id,label}))} onChange={()=>setMenuFavorites(readMenuFavorites(localStorage,accountId,MENU_5S_ALLOWED_IDS))}/>
        {nestedResults.length > 0 && <section className="cc-menu-nested-results" aria-label="Configurações encontradas"><h3>Dentro dos menus</h3>{nestedResults.map(item=><button type="button" key={item.id} data-sharing-target={item.view === 'community' ? 'true' : undefined} onClick={()=>jumpNested(item)}><Settings aria-hidden="true"/><span><strong>{item.label}</strong><small>{item.path}</small></span><ChevronRight aria-hidden="true"/></button>)}</section>}
        <p className="cc-menu-status"`);
 replace('<span className="cc-menu-favorite-glyph" aria-hidden="true">★</span>', `<span className="cc-menu-favorite-glyph" aria-hidden="true">{menuFavorites.includes(v) ? '★' : '☆'}</span>`);
 replace('<h3>Favoritos</h3>', '<h3>Fixados e mais usados</h3>');
 replace("aria-label={'Remover ' + label + ' dos favoritos'} aria-pressed={true}", "aria-label={menuFavorites.includes(v) ? 'Remover ' + label + ' dos favoritos' : 'Fixar ' + label + ' nos favoritos'} aria-pressed={menuFavorites.includes(v)}");
 replace('catalogGroups.length === 0 && (menuQuery', 'catalogGroups.length === 0 && nestedResults.length === 0 && (menuQuery');
 replace('const favorites = readMenuFavorites(window.localStorage, accountId, allowed.map(([id]) => id));', 'const favorites = suggestedMenuShortcuts(window.localStorage, accountId, allowed.map(([id]) => id));');
 // Home request opens the existing editor inside Menu, no parallel preference storage.
 replace("    const open = () => setDrawer(true);", "    const open = (event?: Event) => { setDrawer(true); if ((event as CustomEvent)?.detail?.personalize) requestAnimationFrame(() => { const editor=document.getElementById('cc-menu-personalization') as HTMLDetailsElement | null; if(editor){ editor.open=true; editor.scrollIntoView({block:'start'}); editor.querySelector<HTMLElement>('summary')?.focus(); } }); };");
 // Explicit nested destinations are presentation anchors around existing controls.
 const labels = {'theme':'Modo claro premium','pulse':'CrewCheck Pulse','wakeup-phone':'Telefone do despertador','virtual-base':'Base virtual','telegram':'Notificações via Telegram'};
 for(const [id,label] of Object.entries(labels)) {
  const pattern=new RegExp(`<((?:Toggle|Field)Setting) ([^\\n]*label="${label}"[^\\n]*?)/>`);
  if(!pattern.test(source))throw Error(`[menu-organization] unavailable nested setting ${id}`);
  source=source.replace(pattern,`<div id="cc-setting-${id}" tabIndex={-1}><$1 $2/></div>`);
 }
 replace('<section className="cc-location-settings">','<section id="cc-setting-location" tabIndex={-1} className="cc-location-settings">');
 replace('function SettingsView({ setView, actions }: { setView: (v: ZeroView) => void; actions: QuickActions }) {', `function SettingsView({ setView, actions }: { setView: (v: ZeroView) => void; actions: QuickActions }) {
  useEffect(() => { const focusSetting=()=>{ const context=consumePendingNavigationContext('settings'); if(context?.sourceView !== 'menu-search' || !['theme','location','pulse','wakeup-phone','virtual-base','telegram'].includes(context.programId || '')) return; requestAnimationFrame(() => { const target=document.getElementById('cc-setting-'+context.programId); target?.scrollIntoView({block:'center'}); target?.focus({preventScroll:true}); }); };focusSetting();window.addEventListener('crewcheck:menu-setting-focus',focusSetting);return()=>window.removeEventListener('crewcheck:menu-setting-focus',focusSetting); }, []);`);
}
fs.writeFileSync(path,source);
console.log('[menu-organization] account-local usage, shared preferences, nested setting destinations');
source=fs.readFileSync(path,'utf8');
if(!source.includes('const availableMenuIds =')) {
 const start=source.indexOf('function MenuDrawer('),end=source.indexOf('\nfunction ',start+10);let block=source.slice(start,end);
 block=block.replaceAll('MENU_5S_ALLOWED_IDS','availableMenuIds');
 block=block.replace('  const accountId = storedUser?.id || null;', "  const accountId = storedUser?.id || null;\n  const availableMenuIds = MENU_5S_ALLOWED_IDS.filter(id => admin || !['updates','maintenance','admin'].includes(id));\n  useEffect(() => { const refresh=()=>setMenuFavorites(readMenuFavorites(localStorage,accountId,availableMenuIds));window.addEventListener('storage',refresh);window.addEventListener('crewcheck:menu-favorites',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('crewcheck:menu-favorites',refresh)}; },[accountId,admin]);");
 block=block.replace('}, [accountId]);','}, [accountId,admin]);');
 block=block.replace('    const exists = menuFavorites.includes(target);', '    const currentFavorites = readMenuFavorites(localStorage,accountId,availableMenuIds);\n    const exists = currentFavorites.includes(target);');
 block=block.replace('!exists && menuFavorites.length >= MENU_FAVORITES_LIMIT','!exists && currentFavorites.length >= MENU_FAVORITES_LIMIT');
 block=block.replace('exists ? menuFavorites.filter((item) => item !== target) : [...menuFavorites, target]', 'exists ? currentFavorites.filter((item) => item !== target) : [...currentFavorites, target]');
 source=source.slice(0,start)+block+source.slice(end);
 fs.writeFileSync(path,source);
}
source=fs.readFileSync(path,'utf8');
if(!source.includes('cc-hotel-catalog-disclosure')) {
 const start=source.indexOf('function HotelsView('),end=source.indexOf('\nfunction ',start+10);let block=source.slice(start,end);
 const selector=block.match(/\{stays\.length > 0 && <label[^\n]+<\/label>\}/)?.[0];
 if(!selector)throw Error('[menu-organization] missing stay selection');
 block=block.replace(selector,'');
 block=block.replace('<strong>{stayDisplay.ambiguous ?', '<strong>{selectedEventId ? "Selecionado manualmente" : stayDisplay.ambiguous ?');
 block=block.replace('</p>{selectedEventId &&', `</p>${selector}{selectedEventId &&`);
 block=block.replace('<section className="cz-toolbox cz-hotel-finder">','<details className="cc-hotel-catalog-disclosure"><summary>Pesquisar hotel ou informar dados</summary><section className="cz-toolbox cz-hotel-finder">');
 block=block.replace('</section>\n\n    {editorOpen &&','</section></details>\n\n    {editorOpen &&');
 source=source.slice(0,start)+block+source.slice(end);fs.writeFileSync(path,source);
}

// Use the existing catalog icon in the fixed-order editor as well.
source=fs.readFileSync(path,'utf8').replaceAll('catalog={allMenuItems.map(([id,label])=>({id,label}))}', 'catalog={allMenuItems.map(([id,label,,Icon])=>({id,label,Icon}))}');
fs.writeFileSync(path,source);
