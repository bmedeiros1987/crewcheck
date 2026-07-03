import React, { useState, useEffect } from 'react';
import {
  Plane,
  CalendarDays,
  Bell,
  ShieldAlert,
  Dumbbell,
  Gauge,
  BarChart3,
  Settings,
  Home,
  Navigation,
  Clock,
  Coffee,
  DollarSign,
  Wifi,
  CloudUpload,
  LogOut,
  Sun,
  Moon,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FileText,
  Car,
  Monitor,
  Mail,
  Menu,
  TrendingUp,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */
type ViewKey = string;

interface SideDrawerProps {
  // Mobile drawer
  open?: boolean;
  onClose?: () => void;
  // Shared
  activeView: ViewKey;
  displayName: string;
  rank?: string;
  base?: string;
  errorsCount?: number;
  themeMode?: 'dark' | 'light' | 'system';
  onThemeToggle?: () => void;
  onChange: (view: ViewKey) => void;
  onOpenHomeView?: (view: string) => void;
  onNewRoster?: () => void;
  onPowerOff?: () => void;
}

interface DesktopSidebarProps {
  activeView: ViewKey;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  errorsCount?: number;
  themeMode?: 'dark' | 'light' | 'system';
  onThemeToggle?: () => void;
  onChange: (view: ViewKey) => void;
  onOpenHomeView?: (view: string) => void;
  onNewRoster?: () => void;
  onPowerOff?: () => void;
}

/* ── Nav config ─────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'Escala',
    items: [
      { view: 'home',         label: 'Cockpit',          caption: 'tela inicial',          icon: Home },
      { view: 'roster',       label: 'Minha Escala',     caption: 'agenda completa',       icon: CalendarDays },
      { view: 'import',       label: 'Importar iFlight', caption: 'PDF, AIMS ou oficial',  icon: CloudUpload },
      { view: 'summary',      label: 'Resumo',           caption: 'visão geral',           icon: LayoutDashboard },
    ],
  },
  {
    label: 'Conformidade',
    items: [
      { view: 'irregularities', label: 'Análise RBAC 117', caption: 'jornada e limites',    icon: ShieldAlert, badge: true },
      { view: 'alerts',         label: 'Alertas',          caption: 'somente avisos',       icon: Bell, badge: true },
      { view: 'fatigue',        label: 'Carga da Escala',  caption: 'fadiga e descanso',    icon: Gauge },
      { view: 'metrics',        label: 'Relatório Mensal', caption: 'métricas e exportações', icon: BarChart3 },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { view: 'flightboard', label: 'Radar de Voos',      caption: 'status e portão',           icon: Monitor },
      { view: 'departure',   label: 'Saída Inteligente',  caption: 'Maps · Uber/99',            icon: Navigation },
      { view: 'weather',     label: 'Meteorologia',       caption: 'METAR/TAF por escala',      icon: Wifi },
      { view: 'perdiem',     label: 'Diárias',            caption: 'previsão mensal',           icon: Coffee },
      { view: 'salary',      label: 'Salário',            caption: 'bonificação e variáveis',   icon: TrendingUp },
      { view: 'currency',    label: 'Moedas',             caption: 'cotação e diárias intl.',   icon: DollarSign },
      { view: 'parking',     label: 'Meu Carro',          caption: 'GPS, piso e vaga',          icon: Car },
      { view: 'gym',         label: 'Rotina',             caption: 'treino, estudo e vida',     icon: Dumbbell },
      { view: 'bids',        label: 'BIDS / PBS',         caption: 'janela de solicitação',     icon: Bell },
      { view: 'statistics',  label: 'Gerenciador',        caption: 'escalas salvas',            icon: BarChart3 },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { view: 'settings', label: 'Configurações',  caption: 'perfil, agenda e manual', icon: Settings },
      { view: 'support',  label: 'Ajuda & Suporte', caption: 'falar com suporte',      icon: Mail },
      { view: 'notes',    label: 'Notas Privadas',  caption: 'somente neste dispositivo', icon: FileText },
    ],
  },
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'CC';
}

/* ── Drawer Item ────────────────────────────────────────────── */
function DrawerItem({
  icon: Icon,
  label,
  caption,
  active,
  badge,
  errorsCount,
  onClick,
}: {
  icon: React.FC<{ size?: number }>;
  label: string;
  caption?: string;
  active?: boolean;
  badge?: boolean;
  errorsCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`cc-drawer-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="cc-drawer-item-icon">
        <Icon size={16} />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        {caption && (
          <span className="block text-xs leading-tight mt-0.5" style={{ color: 'var(--foreground-subtle)' }}>
            {caption}
          </span>
        )}
      </span>
      {badge && errorsCount != null && errorsCount > 0 && (
        <span
          className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold text-white"
          style={{ background: 'var(--event-alert)', minWidth: '1.25rem', textAlign: 'center' }}
        >
          {errorsCount}
        </span>
      )}
    </button>
  );
}

/* ── Mobile Drawer ──────────────────────────────────────────── */
export function MobileDrawer({
  open,
  onClose,
  activeView,
  displayName,
  rank,
  base,
  errorsCount = 0,
  themeMode = 'dark',
  onThemeToggle,
  onChange,
  onOpenHomeView,
  onNewRoster,
  onPowerOff,
}: SideDrawerProps) {
  const initials = getInitials(displayName);
  const isDark = themeMode === 'dark';

  const handleNav = (view: string) => {
    onChange(view);
    onClose?.();
  };

  const handleHomeNav = (view: string) => {
    onOpenHomeView?.(view);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="cc-drawer-overlay" onClick={onClose}>
      <aside
        className="cc-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #22d3ee, #6366f1)' }}>
              <Plane size={16} style={{ color: '#020810' }} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight" style={{ color: 'var(--foreground)' }}>CrewCheck</p>
              <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>Premium Roster</p>
            </div>
          </div>
          <button className="cc-icon-btn" onClick={onClose} aria-label="Fechar menu">
            <X size={16} />
          </button>
        </div>

        {/* Profile */}
        <button
          className="cc-drawer-profile"
          onClick={() => handleNav('settings')}
        >
          <div className="cc-avatar">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--foreground)' }}>
              {displayName || 'Tripulante'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--foreground-muted)' }}>
              {rank || 'Tripulante'} · {base || 'Base'} · Perfil
            </p>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--foreground-subtle)', flexShrink: 0 }} />
        </button>

        {/* Theme toggle */}
        <div className="cc-theme-row">
          <div className="flex items-center gap-2">
            {isDark ? <Moon size={15} style={{ color: 'var(--foreground-muted)' }} /> : <Sun size={15} style={{ color: 'var(--foreground-muted)' }} />}
            <span className="text-sm font-medium" style={{ color: 'var(--foreground-muted)' }}>
              {isDark ? 'Modo escuro' : 'Modo claro'}
            </span>
          </div>
          <button
            className={`cc-toggle ${isDark ? '' : 'on'}`}
            onClick={onThemeToggle}
            aria-label="Alternar tema"
          />
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto pb-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="cc-drawer-section">
              <p className="cc-drawer-section-label">{section.label}</p>
              {section.items.map((item) => {
                const isActive = item.view === activeView;
                const isHome = ['home', 'import', 'departure', 'bids', 'flightboard', 'weather', 'perdiem', 'salary', 'currency', 'parking', 'gym', 'statistics', 'support', 'notes', 'settings'].includes(item.view);
                return (
                  <DrawerItem
                    key={item.view}
                    icon={item.icon}
                    label={item.label}
                    caption={item.caption}
                    active={isActive}
                    badge={'badge' in item && item.badge}
                    errorsCount={errorsCount}
                    onClick={() => isHome ? handleHomeNav(item.view) : handleNav(item.view)}
                  />
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer actions */}
        <div
          className="p-3 space-y-2"
          style={{ borderTop: '1px solid var(--sidebar-border)' }}
        >
          <button
            onClick={() => { onNewRoster?.(); onClose?.(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition"
            style={{ background: 'var(--accent)', color: 'var(--primary-foreground)' }}
          >
            <CloudUpload size={15} />
            Nova escala
          </button>
          <button
            onClick={() => { onPowerOff?.(); onClose?.(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition"
            style={{ background: 'rgba(248,113,113,0.10)', color: 'var(--event-alert)', border: '1px solid rgba(248,113,113,0.20)' }}
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ── Desktop Sidebar ────────────────────────────────────────── */
export function DesktopSidebar({
  activeView,
  collapsed,
  onToggleCollapsed,
  errorsCount = 0,
  themeMode = 'dark',
  onThemeToggle,
  onChange,
  onOpenHomeView,
  onNewRoster,
  onPowerOff,
}: DesktopSidebarProps) {
  const isDark = themeMode === 'dark';

  const handleNav = (view: string) => {
    const isHome = ['home', 'import', 'departure', 'bids', 'flightboard', 'weather', 'perdiem', 'salary', 'currency', 'parking', 'gym', 'statistics', 'support', 'notes', 'settings'].includes(view);
    if (isHome) onOpenHomeView?.(view);
    else onChange(view);
  };

  return (
    <aside
      className={`cc-sidebar ${collapsed ? 'collapsed' : ''}`}
    >
      {/* Brand */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #22d3ee, #6366f1)' }}
            >
              <Plane size={18} style={{ color: '#020810' }} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight" style={{ color: 'var(--foreground)' }}>CrewCheck</p>
              <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>Premium Roster</p>
            </div>
          </div>
        )}
        <button
          className="cc-icon-btn"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{ marginLeft: collapsed ? 'auto' : undefined, marginRight: collapsed ? 'auto' : undefined }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="cc-sidebar-section-label">{section.label}</p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.view === activeView;
              return (
                <button
                  key={item.view}
                  className={`cc-sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNav(item.view)}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={17} style={{ flexShrink: 0 }} />
                  {!collapsed && (
                    <span className="cc-sidebar-label flex-1 min-w-0 text-left">
                      <span className="block text-sm font-medium truncate">{item.label}</span>
                    </span>
                  )}
                  {'badge' in item && item.badge && errorsCount > 0 && !collapsed && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'var(--event-alert)' }}
                    >
                      {errorsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Theme toggle + actions */}
      <div
        className="p-3 space-y-2"
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
      >
        {!collapsed && (
          <button
            className="cc-theme-row w-full"
            onClick={onThemeToggle}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center gap-2">
              {isDark
                ? <Moon size={14} style={{ color: 'var(--foreground-muted)' }} />
                : <Sun size={14} style={{ color: 'var(--foreground-muted)' }} />
              }
              <span className="text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
                {isDark ? 'Escuro' : 'Claro'}
              </span>
            </div>
            <div className={`cc-toggle ${isDark ? '' : 'on'}`} />
          </button>
        )}
        <button
          onClick={onNewRoster}
          className={`flex w-full items-center ${collapsed ? 'justify-center' : 'justify-center gap-2'} rounded-xl py-2 text-sm font-bold transition`}
          style={{ background: 'var(--accent)', color: 'var(--primary-foreground)' }}
          title={collapsed ? 'Nova escala' : undefined}
        >
          <CloudUpload size={15} />
          {!collapsed && 'Nova escala'}
        </button>
        <button
          onClick={onPowerOff}
          className={`flex w-full items-center ${collapsed ? 'justify-center' : 'justify-center gap-2'} rounded-xl py-2 text-sm font-bold transition`}
          style={{ background: 'rgba(248,113,113,0.10)', color: 'var(--event-alert)', border: '1px solid rgba(248,113,113,0.20)' }}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={15} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}

/* ── Bottom Nav (mobile) ────────────────────────────────────── */
export function BottomNav({
  activeView,
  errorsCount = 0,
  onMenuOpen,
  onChange,
  onOpenHomeView,
}: {
  activeView: ViewKey;
  errorsCount?: number;
  onMenuOpen: () => void;
  onChange: (view: ViewKey) => void;
  onOpenHomeView?: (view: string) => void;
}) {
  const items = [
    { id: 'home',    label: 'Cockpit',  icon: Home,         action: () => onOpenHomeView?.('home') },
    { id: 'roster',  label: 'Escala',   icon: CalendarDays, action: () => onChange('roster') },
    { id: 'alerts',  label: 'Alertas',  icon: Bell,         action: () => onChange('alerts'), badge: errorsCount },
    { id: 'fatigue', label: 'Carga',    icon: Gauge,        action: () => onChange('fatigue') },
    { id: 'menu',    label: 'Menu',     icon: Menu,         action: onMenuOpen },
  ];

  return (
    <nav className="cc-bottom-nav">
      {items.map(({ id, label, icon: Icon, action, badge }) => {
        const isActive = id === activeView;
        return (
          <button
            key={id}
            className={`cc-bottom-nav-item ${isActive ? 'active' : ''}`}
            onClick={action}
            aria-label={label}
          >
            <div className="relative">
              <Icon size={20} />
              {badge != null && badge > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 rounded-full text-white font-bold"
                  style={{
                    background: 'var(--event-alert)',
                    fontSize: '0.55rem',
                    padding: '0.1rem 0.3rem',
                    minWidth: '1rem',
                    textAlign: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
            <span className="cc-bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ── Hook: theme persistence ────────────────────────────────── */
export function useThemeMode() {
  const [mode, setMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('crewcheck_theme_mode');
      return (saved === 'light' ? 'light' : 'dark');
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-crew-theme', mode);
    try { localStorage.setItem('crewcheck_theme_mode', mode); } catch {}
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  return { mode, toggle };
}

export default MobileDrawer;
