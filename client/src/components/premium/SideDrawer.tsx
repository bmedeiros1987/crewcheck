'use client';
import { useState, useEffect } from 'react';
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
  ChevronDown,
  Sparkles,
  Clock,
  ShieldCheck,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */
type ViewKey = string;

interface SideDrawerProps {
  open?: boolean;
  onClose?: () => void;
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

/* ── Nav config — sem captions, com submenus ─────────────── */
const NAV_SECTIONS = [
  {
    id: 'escala',
    label: 'Escala',
    icon: CalendarDays,
    items: [
      { view: 'home',    label: 'Cockpit',       icon: Home,          home: true },
      { view: 'roster',  label: 'Minha Escala',  icon: CalendarDays },
      { view: 'import',  label: 'Importar',      icon: CloudUpload,   home: true },
      { view: 'summary', label: 'Resumo',        icon: LayoutDashboard },
    ],
  },
  {
    id: 'conformidade',
    label: 'Conformidade',
    icon: ShieldCheck,
    items: [
      { view: 'irregularities', label: 'RBAC 117',       icon: ShieldAlert, badge: true },
      { view: 'alerts',         label: 'Alertas',        icon: Bell,        badge: true },
      { view: 'fatigue',        label: 'Carga',          icon: Gauge },
      { view: 'metrics',        label: 'Relatório',      icon: BarChart3 },
    ],
  },
  {
    id: 'ferramentas',
    label: 'Ferramentas',
    icon: Sparkles,
    items: [
      { view: 'flightboard', label: 'Radar',            icon: Monitor,    home: true },
      { view: 'departure',   label: 'Saída',            icon: Navigation, home: true },
      { view: 'weather',     label: 'Meteorologia',     icon: Wifi,       home: true },
      { view: 'perdiem',     label: 'Diárias',          icon: Coffee,     home: true },
      { view: 'salary',      label: 'Salário',          icon: TrendingUp, home: true },
      { view: 'currency',    label: 'Moedas',           icon: DollarSign, home: true },
      { view: 'parking',     label: 'Meu Carro',        icon: Car,        home: true },
      { view: 'gym',         label: 'Rotina',           icon: Dumbbell,   home: true },
      { view: 'bids',        label: 'BIDS / PBS',       icon: Bell,       home: true },
      { view: 'statistics',  label: 'Gerenciador',      icon: Clock,      home: true },
    ],
  },
  {
    id: 'config',
    label: 'Configurações',
    icon: Settings,
    items: [
      { view: 'settings', label: 'Configurações', icon: Settings, home: true },
      { view: 'support',  label: 'Ajuda',         icon: Mail,     home: true },
      { view: 'notes',    label: 'Notas',         icon: FileText, home: true },
    ],
  },
];

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'CC';
}

/* ── Accent colors per section ──────────────────────────── */
const SECTION_COLORS: Record<string, string> = {
  escala:        '#22d3ee',
  conformidade:  '#a78bfa',
  ferramentas:   '#34d399',
  config:        '#94a3b8',
};

/* ── Section with collapsible submenu ───────────────────── */
function NavSection({
  section,
  activeView,
  errorsCount,
  collapsed,
  onNavigate,
  defaultOpen,
}: {
  section: typeof NAV_SECTIONS[0];
  activeView: string;
  errorsCount: number;
  collapsed: boolean;
  onNavigate: (view: string, home: boolean) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const SectionIcon = section.icon;
  const color = SECTION_COLORS[section.id] || 'var(--accent)';
  const hasActive = section.items.some((i) => i.view === activeView);

  if (collapsed) {
    // In collapsed mode: show only icons, no section headers
    return (
      <div className="mb-1">
        {section.items.map((item) => {
          const Icon = item.icon;
          const isActive = item.view === activeView;
          return (
            <button
              key={item.view}
              title={item.label}
              onClick={() => onNavigate(item.view, !!item.home)}
              className={`cc-sidebar-nav-item ${isActive ? 'active' : ''}`}
              style={{ justifyContent: 'center', padding: '0.55rem' }}
            >
              <Icon size={17} style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-1">
      {/* Section header — clickable to collapse/expand */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition"
        style={{
          background: hasActive ? `color-mix(in srgb, ${color} 8%, transparent)` : 'transparent',
          color: hasActive ? color : 'var(--foreground-subtle)',
        }}
      >
        <SectionIcon size={14} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1, textAlign: 'left' }}>
          {section.label}
        </span>
        <ChevronDown
          size={12}
          style={{
            transition: 'transform 0.2s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Items */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: open ? `${section.items.length * 3}rem` : '0',
          transition: 'max-height 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {section.items.map((item) => {
          const Icon = item.icon;
          const isActive = item.view === activeView;
          const hasBadge = 'badge' in item && item.badge && errorsCount > 0;
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view, !!item.home)}
              className={`cc-sidebar-nav-item ${isActive ? 'active' : ''}`}
              style={{ paddingLeft: '2rem' }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </span>
              {hasBadge && (
                <span
                  style={{
                    background: 'var(--event-alert)',
                    color: '#fff',
                    borderRadius: '9999px',
                    fontSize: '0.55rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.35rem',
                    minWidth: '1.1rem',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {errorsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Theme Toggle ───────────────────────────────────────── */
function ThemeToggle({ isDark, onToggle, compact }: { isDark: boolean; onToggle?: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onToggle}
      className="cc-theme-row w-full"
      style={{ cursor: 'pointer', justifyContent: compact ? 'center' : undefined }}
      aria-label="Alternar tema"
    >
      {!compact && (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isDark ? <Moon size={14} /> : <Sun size={14} />}
          {isDark ? 'Escuro' : 'Claro'}
        </span>
      )}
      <div
        style={{
          width: '2.25rem',
          height: '1.25rem',
          borderRadius: '9999px',
          background: isDark ? 'rgba(34,211,238,0.25)' : 'rgba(4,118,168,0.20)',
          border: `1px solid ${isDark ? 'rgba(34,211,238,0.35)' : 'rgba(4,118,168,0.30)'}`,
          position: 'relative',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '0.125rem',
            left: isDark ? '0.125rem' : '1rem',
            width: '0.875rem',
            height: '0.875rem',
            borderRadius: '50%',
            background: isDark ? '#22d3ee' : '#0476a8',
            transition: 'left 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isDark
            ? <Moon size={8} style={{ color: '#020810' }} />
            : <Sun size={8} style={{ color: '#fff' }} />
          }
        </div>
      </div>
    </button>
  );
}

/* ── Mobile Drawer ──────────────────────────────────────── */
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

  const handleNav = (view: string, home: boolean) => {
    if (home) onOpenHomeView?.(view);
    else onChange(view);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="cc-drawer-overlay" onClick={onClose}>
      <aside className="cc-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1rem 0.875rem', borderBottom: '1px solid var(--sidebar-border)', paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #22d3ee, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plane size={14} style={{ color: '#020810' }} />
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>CrewCheck</p>
              <p style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--foreground-subtle)' }}>Premium Roster</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--foreground-muted)' }}
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        {/* Profile */}
        <button
          onClick={() => handleNav('settings', true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', margin: '0.5rem 0.5rem 0', borderRadius: '0.875rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', cursor: 'pointer', width: 'calc(100% - 1rem)', textAlign: 'left' }}
        >
          <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(99,102,241,0.2))', border: '2px solid rgba(34,211,238,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8125rem', color: 'var(--accent)', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || 'Tripulante'}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rank || 'Tripulante'} · {base || 'Base'}</p>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--foreground-subtle)', flexShrink: 0 }} />
        </button>

        {/* Theme toggle */}
        <div style={{ padding: '0.5rem 0.75rem 0' }}>
          <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.5rem', paddingBottom: '1rem' }}>
          {NAV_SECTIONS.map((section) => {
            const hasActive = section.items.some((i) => i.view === activeView);
            return (
              <NavSection
                key={section.id}
                section={section}
                activeView={activeView}
                errorsCount={errorsCount}
                collapsed={false}
                onNavigate={handleNav}
                defaultOpen={hasActive || section.id === 'escala'}
              />
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0))' }}>
          <button
            onClick={() => { onNewRoster?.(); onClose?.(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderRadius: '0.875rem', padding: '0.625rem', fontSize: '0.875rem', fontWeight: 700, background: 'var(--accent)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', width: '100%' }}
          >
            <CloudUpload size={15} />
            Nova escala
          </button>
          <button
            onClick={() => { onPowerOff?.(); onClose?.(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderRadius: '0.875rem', padding: '0.625rem', fontSize: '0.875rem', fontWeight: 700, background: 'rgba(248,113,113,0.10)', color: 'var(--event-alert)', border: '1px solid rgba(248,113,113,0.20)', cursor: 'pointer', width: '100%' }}
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ── Desktop Sidebar ────────────────────────────────────── */
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

  const handleNav = (view: string, home: boolean) => {
    if (home) onOpenHomeView?.(view);
    else onChange(view);
  };

  return (
    <aside className={`cc-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', padding: collapsed ? '1rem 0.5rem' : '1rem 1rem', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
            <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, #22d3ee, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Plane size={16} style={{ color: '#020810' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>CrewCheck</p>
              <p style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--foreground-subtle)', whiteSpace: 'nowrap' }}>Premium Roster</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--foreground-muted)', flexShrink: 0 }}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.5rem 0.5rem' }}>
        {NAV_SECTIONS.map((section) => {
          const hasActive = section.items.some((i) => i.view === activeView);
          return (
            <NavSection
              key={section.id}
              section={section}
              activeView={activeView}
              errorsCount={errorsCount}
              collapsed={collapsed}
              onNavigate={handleNav}
              defaultOpen={hasActive || section.id === 'escala'}
            />
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '0.75rem 0.5rem', borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
        {!collapsed && <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />}
        {collapsed && (
          <button
            onClick={onThemeToggle}
            title={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', borderRadius: '0.75rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', cursor: 'pointer', color: 'var(--foreground-muted)' }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
        <button
          onClick={onNewRoster}
          title={collapsed ? 'Nova escala' : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: collapsed ? 0 : '0.5rem', borderRadius: '0.875rem', padding: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, background: 'var(--accent)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', width: '100%' }}
        >
          <CloudUpload size={14} />
          {!collapsed && 'Nova escala'}
        </button>
        <button
          onClick={onPowerOff}
          title={collapsed ? 'Sair' : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: collapsed ? 0 : '0.5rem', borderRadius: '0.875rem', padding: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, background: 'rgba(248,113,113,0.08)', color: 'var(--event-alert)', border: '1px solid rgba(248,113,113,0.18)', cursor: 'pointer', width: '100%' }}
        >
          <LogOut size={14} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}

/* ── Bottom Nav (mobile) ────────────────────────────────── */
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
    { id: 'home',    label: 'Cockpit', icon: Home,         action: () => onOpenHomeView?.('home') },
    { id: 'roster',  label: 'Escala',  icon: CalendarDays, action: () => onChange('roster') },
    { id: 'alerts',  label: 'Alertas', icon: Bell,         action: () => onChange('alerts'), badge: errorsCount },
    { id: 'fatigue', label: 'Carga',   icon: Gauge,        action: () => onChange('fatigue') },
    { id: 'menu',    label: 'Menu',    icon: Menu,         action: onMenuOpen },
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
            <div style={{ position: 'relative' }}>
              <Icon size={20} />
              {badge != null && badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'var(--event-alert)',
                    color: '#fff',
                    borderRadius: '9999px',
                    fontSize: '0.5rem',
                    fontWeight: 800,
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

/* ── Hook: theme persistence ────────────────────────────── */
export function useThemeMode() {
  const [mode, setMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('crewcheck_theme_mode');
      return saved === 'light' ? 'light' : 'dark';
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
