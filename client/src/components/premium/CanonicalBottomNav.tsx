import { BOTTOM_NAVIGATION_ITEMS, type CrewCheckViewKey } from './navigationConfig';

interface CanonicalBottomNavProps {
  activeView: CrewCheckViewKey;
  errorsCount?: number;
  onMenuOpen: () => void;
  onChange: (view: CrewCheckViewKey) => void;
  onOpenHomeView?: (view: string) => void;
}

export function CanonicalBottomNav({
  activeView,
  errorsCount = 0,
  onMenuOpen,
  onChange,
  onOpenHomeView,
}: CanonicalBottomNavProps) {
  return (
    <nav className="cc-bottom-nav" aria-label="Navegação principal">
      {BOTTOM_NAVIGATION_ITEMS.map((item) => {
        const Icon = item.icon;
        const badge = item.badge ? errorsCount : 0;
        const isActive = item.view === activeView;

        const handleClick = () => {
          if (item.menu) {
            onMenuOpen();
            return;
          }
          if (!item.view) return;
          if (item.home) onOpenHomeView?.(item.view);
          else onChange(item.view);
        };

        return (
          <button
            key={item.id}
            type="button"
            className={`cc-bottom-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleClick}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={20} />
              {badge > 0 && (
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
            <span className="cc-bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default CanonicalBottomNav;
