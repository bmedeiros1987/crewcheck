import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import Home from "./pages/Home";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import InfoPage from "./pages/InfoPage";
import WatchPage from "./pages/WatchPage";
import { getMe, isAuthenticated } from "./lib/authClient";
import { applyDocumentLanguage, installGlobalStaticTranslations } from "./lib/i18n";

type CrewThemeMode = 'light' | 'dark' | 'system';

function loadCrewThemeMode(): CrewThemeMode {
  try {
    const saved = window.localStorage.getItem('crewcheck_theme_mode');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyCrewThemeMode(mode: CrewThemeMode) {
  try {
    const effective = getEffectiveCrewTheme(mode);
    document.documentElement.dataset.crewThemeMode = mode;
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.style.colorScheme = effective;
  } catch {
    // Mantém tema padrão quando o navegador não permite acesso ao storage.
  }
}

function Protected({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const demoMode = window.localStorage.getItem('crewcheck_demo_mode_seen') === '1' || window.sessionStorage.getItem('crewcheck_demo_active') === '1';
    if (!isAuthenticated() && !demoMode) {
      setLocation("/login");
      return;
    }
    if (!isAuthenticated() && demoMode) {
      setReady(true);
      return;
    }
    getMe()
      .catch(() => setLocation("/login"))
      .finally(() => mounted && setReady(true));
    return () => {
      mounted = false;
    };
  }, [setLocation]);

  if (!isAuthenticated() && !(window.localStorage.getItem('crewcheck_demo_mode_seen') === '1' || window.sessionStorage.getItem('crewcheck_demo_active') === '1')) return null;
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06101d] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[.08] px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-3 h-10 w-10 animate-pulse rounded-2xl bg-cyan-300/30" />
          <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-100/70">Validando acesso</p>
          <p className="mt-1 text-sm text-slate-300">Carregando CrewCheck Premium...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


function CrewCheckGlobalBottomMenu() {
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/">{() => <Protected><Home /></Protected>}</Route>
      <Route path="/results">{() => <Protected><Results /></Protected>}</Route>
      <Route path="/watch">{() => <Protected><WatchPage device="samsung" /></Protected>}</Route>
      <Route path="/w">{() => <Protected><WatchPage device="samsung" /></Protected>}</Route>
      <Route path="/wear">{() => <Protected><WatchPage device="samsung" /></Protected>}</Route>
      <Route path="/apple-watch">{() => <Protected><WatchPage device="apple" /></Protected>}</Route>
      <Route path="/aw">{() => <Protected><WatchPage device="apple" /></Protected>}</Route>
      <Route path="/watch/apple">{() => <Protected><WatchPage device="apple" /></Protected>}</Route>
      <Route path="/statistics">{() => <Protected><InfoPage page="statistics" /></Protected>}</Route>
      <Route path="/download">{() => <Protected><InfoPage page="download" /></Protected>}</Route>
      <Route path="/android">{() => <Protected><InfoPage page="download" /></Protected>}</Route>
      <Route path="/disclaimer">{() => <InfoPage page="disclaimer" />}</Route>
      <Route path="/privacy">{() => <InfoPage page="privacy" />}</Route>
      <Route path="/delete-account">{() => <InfoPage page="deleteAccount" />}</Route>
      <Route path="/terms">{() => <InfoPage page="terms" />}</Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [appMode, setAppMode] = useState(false);

  useEffect(() => {
    const applySavedTheme = () => applyCrewThemeMode(loadCrewThemeMode());
    applyDocumentLanguage();
    installGlobalStaticTranslations();
    applySavedTheme();

    try {
      window.localStorage.setItem('crewcheck_last_loaded_version', '11.0.88');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch(() => undefined);
      }
      if ('caches' in window) {
        caches.keys()
          .then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name))))
          .catch(() => undefined);
      }
    } catch {
      // Navegador sem storage/service worker; segue normalmente.
    }

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemTheme = () => {
      if (loadCrewThemeMode() === 'system') applySavedTheme();
    };
    media?.addEventListener?.('change', handleSystemTheme);
    window.addEventListener('crewcheck:theme-change', applySavedTheme);
    window.addEventListener('storage', applySavedTheme);

    try {
      const params = new URLSearchParams(window.location.search);
      const enabled = params.get('app') === '1' || params.get('android') === '1' || window.localStorage.getItem('crewcheck_app_mode') === '1';
      if (enabled) {
        window.localStorage.setItem('crewcheck_app_mode', '1');
        document.documentElement.classList.add('crewcheck-android');
        document.body.classList.add('crewcheck-android-body');
      }
      setAppMode(enabled);
    } catch {
      setAppMode(false);
    }

    return () => {
      media?.removeEventListener?.('change', handleSystemTheme);
      window.removeEventListener('crewcheck:theme-change', applySavedTheme);
      window.removeEventListener('storage', applySavedTheme);
    };
  }, []);

  return (
    <ErrorBoundary>
      <Toaster richColors position={appMode ? "top-center" : "top-right"} />
      <Router />
      <CrewCheckGlobalBottomMenu />
    </ErrorBoundary>
  );
}
