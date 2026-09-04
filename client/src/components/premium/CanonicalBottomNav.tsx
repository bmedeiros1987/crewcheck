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
            data-nav-id={item.id}
            onClick={handleClick}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="cc-bottom-nav-icon" aria-hidden="true">
              <Icon size={20} />
              {badge > 0 && (
                <span className="cc-bottom-nav-badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="cc-bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default CanonicalBottomNav;
