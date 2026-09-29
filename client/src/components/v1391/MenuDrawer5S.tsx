import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  ChevronRight,
  Clock,
  CloudSun,
  Database,
  DollarSign,
  FileText,
  GitCompareArrows,
  Home as HomeIcon,
  Hotel,
  Lock,
  Map as MapIcon,
  Plane,
  Radar,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getStoredUser } from '@/lib/authClient';
import {
  MENU_FAVORITES_LIMIT,
  menuEntryMatches,
  readMenuFavorites,
  saveMenuFavorites,
} from '@/lib/menuPreference';
import './menu-5s.css';

type MenuIcon = LucideIcon;
type MenuGroup = 'Hoje e escala' | 'Operação' | 'Pernoite' | 'Financeiro' | 'Serviços' | 'Conta' | 'Administração';
type MenuEntry = { id: string; label: string; description: string; icon: MenuIcon; group: MenuGroup };

const GROUPS: MenuGroup[] = ['Hoje e escala', 'Operação', 'Pernoite', 'Financeiro', 'Serviços', 'Conta', 'Administração'];

const BASE_ENTRIES: MenuEntry[] = [
  { id: 'cockpit', label: 'Início', description: 'Próxima programação e ações', icon: HomeIcon, group: 'Hoje e escala' },
  { id: 'roster', label: 'Escala completa', description: 'Cards, Lista, AIMS e Calendário', icon: CalendarDays, group: 'Hoje e escala' },
  { id: 'compare', label: 'Planejado x atual', description: 'Mudanças da escala', icon: GitCompareArrows, group: 'Hoje e escala' },
  { id: 'import', label: 'Importar escala', description: 'PDF oficial e escala ativa', icon: Upload, group: 'Hoje e escala' },
  { id: 'bids', label: 'BIDS', description: 'Preferências da próxima escala', icon: CalendarDays, group: 'Hoje e escala' },
  { id: 'calendar', label: 'Calendário', description: 'Google Calendar e ICS', icon: CalendarDays, group: 'Hoje e escala' },
  { id: 'iflight', label: 'Push iFlight', description: 'Importação assistida', icon: Upload, group: 'Hoje e escala' },

  { id: 'alerts', label: 'Irregularidades', description: 'Alertas confirmados', icon: AlertTriangle, group: 'Operação' },
  { id: 'regulation', label: 'Regulamentação', description: 'RBAC 117, ACT e limites', icon: ShieldCheck, group: 'Operação' },
  { id: 'load', label: 'Carga de trabalho', description: 'Horas utilizadas e limites', icon: BriefcaseBusiness, group: 'Operação' },
  { id: 'departure', label: 'Planejador de Saída', description: 'Quando sair, rota e trânsito', icon: Car, group: 'Operação' },
  { id: 'presentation', label: 'Apresentação', description: 'Local, hotel e ajuste manual', icon: Clock, group: 'Operação' },
  { id: 'radar', label: 'Radar de voos', description: 'Busca, portão e status', icon: Radar, group: 'Operação' },
  { id: 'weather', label: 'Meteorologia', description: 'METAR, TAF e alertas', icon: CloudSun, group: 'Operação' },
  { id: 'map', label: 'Mapa do mês', description: 'Programações por localidade', icon: MapIcon, group: 'Operação' },
  { id: 'mycar', label: 'Meu carro', description: 'Estacionamento e rota', icon: Car, group: 'Operação' },

  { id: 'hotels', label: 'Pernoite e hotéis', description: 'Estadia, quarto e entorno', icon: Hotel, group: 'Pernoite' },
  { id: 'wakeup', label: 'Despertador', description: 'Alarmes do pernoite', icon: Bell, group: 'Pernoite' },
  { id: 'concierge', label: 'Concierge', description: 'Ajuda contextual da estadia', icon: Send, group: 'Pernoite' },

  { id: 'salary', label: 'Salário', description: 'Previsões e adicionais', icon: DollarSign, group: 'Financeiro' },
  { id: 'perdiem', label: 'Diárias', description: 'Valores semanais e mensais', icon: BriefcaseBusiness, group: 'Financeiro' },
  { id: 'crew', label: 'Crew / Chefe', description: 'Tripulação e adicional', icon: UserRound, group: 'Financeiro' },

  { id: 'routine', label: 'Rotina', description: 'Atividades e descanso', icon: ShieldCheck, group: 'Serviços' },
  { id: 'gyms', label: 'Locais próximos', description: 'Academias, saúde e serviços', icon: MapIcon, group: 'Serviços' },
  { id: 'reports', label: 'Relatórios', description: 'Indicadores e histórico', icon: FileText, group: 'Serviços' },
  { id: 'exports', label: 'Exportar', description: 'PDF e compartilhamento', icon: Share2, group: 'Serviços' },
  { id: 'database', label: 'Histórico', description: 'Escalas salvas', icon: Database, group: 'Serviços' },
  { id: 'community', label: 'Pessoas e compartilhar', description: 'QR, visitantes e chat', icon: UserRound, group: 'Serviços' },
  { id: 'features', label: 'Índice funcional', description: 'Fallback de todas as ferramentas', icon: Settings, group: 'Serviços' },

  { id: 'plans', label: 'Assinaturas', description: 'Planos, recursos e ligações', icon: ShieldCheck, group: 'Conta' },
  { id: 'settings', label: 'Configurações', description: 'Perfil, integrações e preferências', icon: Settings, group: 'Conta' },
];

const ADMIN_ENTRIES: MenuEntry[] = [
  { id: 'updates', label: 'Atualizações', description: 'Hotfix e pacote ZIP', icon: Upload, group: 'Administração' },
  { id: 'maintenance', label: 'Manutenção', description: 'Prévia administrativa', icon: Lock, group: 'Administração' },
  { id: 'admin', label: 'Admin', description: 'Saúde, APIs, termos e operação', icon: ShieldCheck, group: 'Administração' },
];

function localValue(key: string, fallback = ''): string {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function MenuDrawer5S({
  open,
  close,
  view,
  setView,
  admin,
}: {
  open: boolean;
  close: () => void;
  view: string;
  setView: (view: string) => void;
  admin: boolean;
}) {
  const storedUser = getStoredUser();
  const accountId = storedUser?.id || null;
  const entries = useMemo(() => admin ? [...BASE_ENTRIES, ...ADMIN_ENTRIES] : BASE_ENTRIES, [admin]);
  const allowedIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const [favorites, setFavorites] = useState(() => readMenuFavorites(window.localStorage, accountId, allowedIds));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setFavorites(readMenuFavorites(window.localStorage, accountId, allowedIds));
    setQuery('');
    setStatus('');
  }, [accountId, allowedIds]);

  const profileName = localValue('crewcheck_profile_display_name', String(storedUser?.name || storedUser?.email || 'Tripulante CrewCheck'));
  const profileAvatar = localValue('crewcheck_profile_avatar');
  const initials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';
  const favoriteEntries = favorites.map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is MenuEntry => Boolean(entry));
  const filtered = entries.filter((entry) => menuEntryMatches(query, entry.label, entry.description, entry.group));
  const visibleGroups = GROUPS.map((group) => ({ group, entries: filtered.filter((entry) => entry.group === group) })).filter((section) => section.entries.length);

  function jump(id: string) {
    setView(id);
    close();
  }

  function toggleFavorite(id: string) {
    if (!accountId) {
      setStatus('Entre na sua conta para salvar favoritos.');
      return;
    }
    const exists = favorites.includes(id);
    if (!exists && favorites.length >= MENU_FAVORITES_LIMIT) {
      setStatus(`Escolha até ${MENU_FAVORITES_LIMIT} favoritos.`);
      return;
    }
    const next = exists ? favorites.filter((favorite) => favorite !== id) : [...favorites, id];
    if (!saveMenuFavorites(window.localStorage, accountId, allowedIds, next)) {
      setStatus('Não foi possível salvar os favoritos neste dispositivo.');
      return;
    }
    setFavorites(next);
    setStatus(exists ? 'Favorito removido.' : 'Favorito adicionado.');
  }

  if (!open) return null;

  return <div className="cz-menu-overlay" role="dialog" aria-modal="true" aria-label="Menu CrewCheck">
    <button className="cz-menu-backdrop" onClick={close} aria-label="Fechar menu" />
    <aside className="cz-menu-panel" data-crew-menu-panel="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
      <header className="cz-menu-header">
        <div className="cz-menu-identity" aria-label="CrewCheck">
          <span className="cz-menu-brandmark" title="CrewCheck"><Plane size={22}/></span>
          <button className="cz-menu-profile" onClick={() => jump('settings')} type="button" aria-label="Abrir perfil">
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span><strong>{profileName}</strong><small>{admin ? 'Administrador · Premium Unlimited' : 'Abrir perfil'}</small></span>
          </button>
        </div>
        <button className="cz-menu-close" onClick={close} aria-label="Fechar menu"><X/></button>
      </header>

      <div className="cz-menu-scroll" data-crew-menu-scroll="true">
        <section className="cc-menu-search">
          <label>
            <Search aria-hidden="true"/>
            <span className="sr-only">Buscar função</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar função" inputMode="search" autoComplete="off"/>
          </label>
        </section>
        <p className="cc-menu-status" role="status" aria-live="polite">{status}</p>

        {!query && favoriteEntries.length > 0 && <>
          <h3 className="cc-menu-section-heading">Favoritos</h3>
          <section className="cc-menu-favorites" aria-label="Favoritos do menu">
            {favoriteEntries.map((entry) => {
              const Icon = entry.icon;
              return <button key={entry.id} type="button" className="cc-menu-favorite-chip" onClick={() => jump(entry.id)}><Icon aria-hidden="true"/><span>{entry.label}</span></button>;
            })}
          </section>
        </>}

        <section className="cz-menu-section" aria-label={query ? 'Resultados da busca' : 'Índice completo'}>
          <h3>{query ? 'Resultados da busca' : 'Índice completo'}</h3>
          {visibleGroups.map(({ group, entries: groupEntries }) => <div className="cz-menu-section cz-menu-group cc-menu-index-group" data-menu-group={group} key={group}>
            <h4>{group}</h4>
            {groupEntries.map((entry) => {
              const Icon = entry.icon;
              const favorite = favorites.includes(entry.id);
              return <div className="cc-menu-index-row" key={entry.id}>
                <button type="button" className={`cc-menu-destination ${view === entry.id ? 'active' : ''}`} data-menu-label={entry.id === 'hotels' ? 'Hotéis' : entry.label} onClick={() => jump(entry.id)}>
                  <Icon aria-hidden="true"/><span><strong>{entry.label}</strong><small>{entry.description}</small></span><ChevronRight aria-hidden="true"/>
                </button>
                <button type="button" className="cc-menu-favorite" aria-label={favorite ? `Remover ${entry.label} dos favoritos` : `Adicionar ${entry.label} aos favoritos`} aria-pressed={favorite} onClick={() => toggleFavorite(entry.id)}>{favorite ? '★' : '☆'}</button>
              </div>;
            })}
          </div>)}
          {visibleGroups.length === 0 && <p className="cc-menu-empty">Nenhuma função encontrada. Tente outro termo.</p>}
        </section>
      </div>
    </aside>
  </div>;
}
