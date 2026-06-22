import { cn } from "@/lib/utils";
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
  } catch {
    // Mantém os dados se o storage estiver bloqueado.
  }
  await clearCrewCheckCaches();
  window.location.href = '/';
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
        <div className="flex min-h-screen items-center justify-center bg-[#eef5f8] p-5 text-[#092846] dark:bg-[#06101d] dark:text-white">
          <div className="w-full max-w-2xl rounded-[1.5rem] border border-white bg-white p-6 shadow-[0_18px_55px_rgba(8,24,42,0.14)] dark:border-white/10 dark:bg-white/[.07]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200">
                <AlertTriangle size={26} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600 dark:text-red-200">proteção global</p>
                <h2 className="mt-1 text-2xl font-black">{t('unexpectedError')}</h2>
                <p className="mt-2 text-sm leading-6 text-[#425a72] dark:text-slate-300">
                  O CrewCheck detectou uma falha de tela ou cache antigo. Use primeiro “Atualizar app”; se continuar, use “Limpar sessão da escala”. Seus dados de login e preferências principais serão preservados.
                </p>
              </div>
            </div>

            <div className="mt-5 max-h-56 overflow-auto rounded-2xl border border-[#dbe7f0] bg-[#f8fbfd] p-4 dark:border-white/10 dark:bg-black/25">
              <pre className="whitespace-pre-wrap text-xs leading-5 text-[#425a72] dark:text-slate-300">{stack}</pre>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void safeReload()}
                className={cn('flex items-center justify-center gap-2 rounded-2xl bg-[#092846] px-4 py-3 text-sm font-black text-white hover:bg-[#0d365e]')}
              >
                <RotateCcw size={16} />
                Atualizar app
              </button>
              <button
                onClick={() => void resetAndGoHome()}
                className={cn('flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-700 hover:bg-red-100 dark:border-red-400/20 dark:bg-red-500/15 dark:text-red-100')}
              >
                <Trash2 size={16} />
                Limpar sessão da escala
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
