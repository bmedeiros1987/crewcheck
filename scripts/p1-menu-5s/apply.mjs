import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p1-menu-5s] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

const preferenceImport = "import { MENU_FAVORITES_LIMIT, menuEntryMatches, readMenuFavorites, saveMenuFavorites } from '@/lib/menuPreference';";
const cssImport = "import '@/components/v1391/menu-5s.css';";
if (!source.includes(preferenceImport)) {
  const typeAnchor = '\ntype ZeroView =';
  if (!source.includes(typeAnchor)) throw new Error('[p1-menu-5s] limite estrutural dos imports não localizado');
  source = source.replace(typeAnchor, `\n${preferenceImport}\n${cssImport}\n${typeAnchor.slice(1)}`);
}

const menuStart = source.indexOf('function MenuDrawer(');
const menuEnd = source.indexOf('\nfunction ', menuStart + 'function MenuDrawer('.length);
if (menuStart < 0 || menuEnd < 0) throw new Error('[p1-menu-5s] limite exato do MenuDrawer preparado não localizado');

const allowedDeclaration = `const MENU_5S_ALLOWED_IDS: ZeroView[] = [
  'cockpit','roster','compare','departure','wakeup','weather','presentation','mycar',
  'radar','alerts','regulation','load','emergency','import','iflight','bids','map','database','crewlocker',
  'perdiem','salary','crew','concierge','hotels','gyms','routine','community','life',
  'reports','calendar','exports','plans','settings','manual','guardian','support','crewlock',
  'updates','maintenance','admin',
];

`;
if (!source.includes('const MENU_5S_ALLOWED_IDS:')) {
  source = source.slice(0, menuStart) + allowedDeclaration + source.slice(menuStart);
}

let nextMenuStart = source.indexOf('function MenuDrawer(');
let nextMenuEnd = source.indexOf('\nfunction ', nextMenuStart + 'function MenuDrawer('.length);
let block = source.slice(nextMenuStart, nextMenuEnd);

if (!block.includes('const [menuQuery,')) {
  const stateAnchor = "  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));";
  if (!block.includes(stateAnchor)) throw new Error('[p1-menu-5s] estado do perfil no menu não localizado');
  const states = `
  const accountId = storedUser?.id || null;
  const [menuQuery, setMenuQuery] = useState('');
  const [menuStatus, setMenuStatus] = useState('');
  const [editingFavorites, setEditingFavorites] = useState(false);
  const menuPanelRef = useRef<HTMLElement | null>(null);
  const pendingFavoriteFocus = useRef<ZeroView | null>(null);
  const closeMenuRef = useRef(close);
  closeMenuRef.current = close;
  useEffect(() => {
    setEditingFavorites(false);
    if (!open) return;
    const previousFocus = document.activeElement;
    const panel = menuPanelRef.current;
    panel?.querySelector<HTMLButtonElement>('.cz-menu-close')?.focus({ preventScroll: true });
    const onMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenuRef.current();
      } else if (event.key === 'Tab' && panel) {
        const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
          .filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!panel.contains(document.activeElement)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onMenuKeyDown);
    return () => {
      document.removeEventListener('keydown', onMenuKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected
          && (document.activeElement === document.body || panel?.contains(document.activeElement))) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);
  const [menuFavorites, setMenuFavorites] = useState(() => readMenuFavorites(window.localStorage, accountId, MENU_5S_ALLOWED_IDS));
  useEffect(() => {
    setMenuFavorites(readMenuFavorites(window.localStorage, accountId, MENU_5S_ALLOWED_IDS));
    setMenuQuery('');
    setMenuStatus('');
    setEditingFavorites(false);
  }, [accountId]);
  useEffect(() => {
    if (!open) return;
    const panel = menuPanelRef.current;
    if (!panel) return;
    const target = pendingFavoriteFocus.current;
    pendingFavoriteFocus.current = null;
    if (target) {
      const equivalent = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-menu-favorite-id]'))
        .find((control) => control.dataset.menuFavoriteId === target);
      equivalent?.focus({ preventScroll: true });
    }
    if (!panel.contains(document.activeElement)) {
      panel.querySelector<HTMLInputElement>('.cc-menu-search input')?.focus({ preventScroll: true });
    }
  }, [open, menuFavorites, menuQuery, editingFavorites, accountId]);`;
  block = block.replace(stateAnchor, stateAnchor + states);
}

if (!block.includes('const filteredGroups =')) {
  const jumpAnchor = "  const jump = (v: ZeroView) => { setView(v); close(); };";
  if (!block.includes(jumpAnchor)) throw new Error('[p1-menu-5s] salto do menu não localizado');
  const behavior = `
  const allMenuItems = groups.flatMap((group) => group.items);
  const favoriteItems = menuFavorites
    .map((id) => allMenuItems.find(([viewId]) => viewId === id))
    .filter((item): item is MenuItem => Boolean(item));
  const filteredGroups = groups
    .map((group) => ({ ...group, items: group.items.filter(([, label, desc]) => menuEntryMatches(menuQuery, label, desc, group.title)) }))
    .filter((group) => group.items.length > 0);
  const catalogGroups = menuQuery
    ? filteredGroups
    : filteredGroups
      .map((group) => ({ ...group, items: group.items.filter(([viewId]) => !menuFavorites.includes(viewId)) }))
      .filter((group) => group.items.length > 0);
  const toggleMenuFavorite = (target: ZeroView) => {
    if (!accountId) {
      setMenuStatus('Entre na sua conta para salvar favoritos.');
      return;
    }
    const exists = menuFavorites.includes(target);
    if (!exists && menuFavorites.length >= MENU_FAVORITES_LIMIT) {
      setMenuStatus('Escolha até ' + MENU_FAVORITES_LIMIT + ' favoritos.');
      return;
    }
    const next = exists ? menuFavorites.filter((item) => item !== target) : [...menuFavorites, target];
    if (!saveMenuFavorites(window.localStorage, accountId, MENU_5S_ALLOWED_IDS, next)) {
      setMenuStatus('Não foi possível salvar os favoritos neste dispositivo.');
      return;
    }
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.dataset.menuFavoriteId === target) {
      pendingFavoriteFocus.current = target;
    }
    setMenuFavorites(next);
    setMenuStatus(exists ? 'Favorito removido.' : 'Favorito adicionado.');
  };
`;
  block = block.replace(jumpAnchor, behavior + jumpAnchor);
}

if (!block.includes('className="cc-menu-search"')) {
  const listStart = block.indexOf('        {groups.map((group) => <section className="cz-menu-section cz-menu-group"');
  const listEnd = block.indexOf('\n      </div>', listStart);
  if (listStart < 0 || listEnd < 0) throw new Error('[p1-menu-5s] renderização agrupada preparada não localizada');
  const enhanced = `        <section className="cc-menu-search">
          <label><span className="sr-only">Buscar função</span><input value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} placeholder="Buscar função" inputMode="search" autoComplete="off"/><Search aria-hidden="true"/></label>
        </section>
        <p className="cc-menu-status" role="status" aria-live="polite">{menuStatus}</p>
        {!menuQuery && accountId && <section className="cc-menu-favorites" aria-label="Favoritos do menu">
          <div className="cc-menu-favorites-head">
            <h3>Favoritos</h3>
            <button type="button" className="cc-menu-edit-favorites" aria-pressed={editingFavorites} onClick={() => { setEditingFavorites((current) => !current); setMenuStatus(''); }}>{editingFavorites ? 'Concluir' : 'Editar favoritos'}</button>
          </div>
          {favoriteItems.length === 0 && <p className="cc-menu-favorites-empty">{editingFavorites ? 'Toque em ☆ para escolher até ' + MENU_FAVORITES_LIMIT + ' favoritos.' : 'Nenhum favorito. Use Editar favoritos para escolher.'}</p>}
          <div>{favoriteItems.map(([v, label, , Icon]) => <div className="cc-menu-favorite-slot" data-editing={editingFavorites ? 'true' : 'false'} key={v}>
            <button type="button" className="cc-menu-favorite-chip" data-menu-label={label} onClick={() => jump(v)}><Icon aria-hidden="true"/><span>{label}</span></button>
            {editingFavorites && <button type="button" className="cc-menu-favorite" data-menu-favorite-id={v} aria-label={'Remover ' + label + ' dos favoritos'} aria-pressed={true} onClick={() => toggleMenuFavorite(v)}><span className="cc-menu-favorite-glyph" aria-hidden="true">★</span></button>}
          </div>)}</div>
        </section>}
        {catalogGroups.map((group) => <section className="cz-menu-section cz-menu-group cc-menu-index-group" data-menu-group={group.title} key={group.title}><h3>{group.title}</h3>{group.items.map(([v, label, desc, Icon]) => {
          const favorite = menuFavorites.includes(v);
          return <div className="cc-menu-index-row" data-editing={editingFavorites ? 'true' : 'false'} key={v}>
            <button type="button" className={\`cc-menu-destination \${view === v ? 'active' : ''}\`} onClick={() => jump(v)} aria-label={label} title={label + ' — ' + desc} data-menu-label={label} data-menu-description={desc}><Icon aria-hidden="true"/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight aria-hidden="true"/></button>
            {editingFavorites && <button type="button" className="cc-menu-favorite" data-menu-favorite-id={v} aria-label={favorite ? 'Remover ' + label + ' dos favoritos' : 'Adicionar ' + label + ' aos favoritos'} aria-pressed={favorite} onClick={() => toggleMenuFavorite(v)}><span className="cc-menu-favorite-glyph" aria-hidden="true">{favorite ? '★' : '☆'}</span></button>}
          </div>;
        })}</section>)}
        {catalogGroups.length === 0 && (menuQuery || favoriteItems.length === 0) && <p className="cc-menu-empty">Nenhuma função encontrada. Tente outro termo.</p>}`;
  block = block.slice(0, listStart) + enhanced + block.slice(listEnd);
}

block = block.replace('<aside className="cz-menu-panel"', '<aside ref={menuPanelRef} className="cz-menu-panel"');

source = source.slice(0, nextMenuStart) + block + source.slice(nextMenuEnd);
fs.writeFileSync(path, source, 'utf8');
console.log('[p1-menu-5s] favoritos por conta e busca adicionados ao menu agrupado canônico, sem remover destinos.');
