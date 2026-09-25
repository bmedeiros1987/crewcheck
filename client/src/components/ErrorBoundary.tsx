import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Component, ReactNode } from "react";
import { t } from "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

async function clearCrewCheckCaches() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.toLowerCase().includes('crewcheck')).map((name) => caches.delete(name)));
    }
  } catch {
    // Cache API indisponível ou bloqueada.
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Service Worker indisponível ou bloqueado.
  }
}

async function safeReload() {
  await clearCrewCheckCaches();
  window.location.reload();
}

async function resetAndGoHome() {
  try {
    const keepKeys = new Set([
      'crewcheck_auth_token',
      'crewcheck_user',
      'crewcheck_theme_mode',
      'crewcheck_language',
      'crewcheck_profile_avatar',
      'crewcheck_profile_display_name',
      'crewcheck_profile_company',
      'crewcheck_profile_base',
      'crewcheck_profile_rank',
      'crewcheck_app_mode',
    ]);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('crewcheck_') && !keepKeys.has(key)) localStorage.removeItem(key);
    }
    sessionStorage.clear();
    sessionStorage.setItem('crewcheck_force_view_once', 'diagnostics');
  } catch {
    // Mantém os dados se o storage estiver bloqueado.
  }
  await clearCrewCheckCaches();
  window.location.href = '/?safe=1&v=13.6.7';
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[CrewCheck] erro capturado pela proteção global', error);
  }

  render() {
    if (this.state.hasError) {
      const stack = this.state.error?.stack || this.state.error?.message || 'Erro não identificado.';
      return (
        <main className="cc-error-shell" role="alert" aria-live="assertive">
          <section className="cc-error-card" aria-labelledby="cc-error-title">
            <div className="cc-error-accent" aria-hidden="true" />
            <div className="cc-error-body">
              <div className="cc-error-brand-row">
                <img
                  className="cc-error-brand"
                  src="/icons/crewcheck-icon-v2.png"
                  alt="CrewCheck"
                  width="46"
                  height="46"
                  decoding="sync"
                />
                <span className="cc-error-brand-copy">
                  <strong>CrewCheck</strong>
                  <small>Proteção de experiência</small>
                </span>
              </div>

              <div className="cc-error-hero">
                <div className="cc-error-icon" aria-hidden="true">
                  <AlertTriangle size={25} />
                </div>
                <div>
                  <p className="cc-error-eyebrow">Recuperação segura</p>
                  <h1 id="cc-error-title" className="cc-error-title">{t('unexpectedError')}</h1>
                  <p className="cc-error-copy">
                    O CrewCheck protegeu a sessão antes que uma falha de tela ou um cache antigo virasse uma tela em branco. Tente atualizar o app primeiro. Se a falha continuar, limpe somente a sessão da escala; login e preferências principais permanecem preservados.
                  </p>
                </div>
              </div>

              <div className="cc-error-actions">
                <button type="button" onClick={() => void safeReload()} className="cc-error-primary">
                  <RotateCcw size={17} />
                  Atualizar app
                </button>
                <button type="button" onClick={() => void resetAndGoHome()} className="cc-error-secondary">
                  <Trash2 size={17} />
                  Limpar sessão da escala
                </button>
              </div>

              <details className="cc-error-details">
                <summary>Detalhes técnicos</summary>
                <pre>{stack}</pre>
              </details>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
