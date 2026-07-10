import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import MaintenanceModePage from "./pages/MaintenanceModePage";
import Home from "./pages/Home";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import InfoPage from "./pages/InfoPage";
import WatchPage from "./pages/WatchPage";
import { getMe, getStoredUser, isAuthenticated } from "./lib/authClient";
import { applyDocumentLanguage, installGlobalStaticTranslations } from "./lib/i18n";

type CrewThemeMode = 'light' | 'dark' | 'system';

function loadCrewThemeMode(): CrewThemeMode {
  try {
    const saved = window.localStorage.getItem('crewcheck_theme_mode');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
  } catch {
    return 'dark';
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

function CrewCheckOpeningSplash({ label = "CrewCheck Premium" }: { label?: string }) {
  return (
    <div className="cc1270-loader" aria-label={label}>
      <div className="cc1270-loader-bg" />
      <div className="cc1270-loader-card">
        <span className="cc1270-loader-logo">✈</span>
        <strong>CrewCheck</strong>
        <small>Carregando CrewCheck Premium</small>
      </div>
    </div>
  );
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
  if (!ready) return <CrewCheckOpeningSplash label="CrewCheck Premium" />;

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
      <Route path="/result">{() => <Protected><Results /></Protected>}</Route>
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
  const [, setLocation] = useLocation();
  const [appMode, setAppMode] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState<{ enabled?: boolean; message?: string; title?: string; status?: string; adminBypass?: boolean } | null>(null);
  const [bootSplashDone, setBootSplashDone] = useState(true);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setBootSplashDone(true), 80);
    const applySavedTheme = () => applyCrewThemeMode(loadCrewThemeMode());
    applyDocumentLanguage();
    installGlobalStaticTranslations();
    applySavedTheme();

    try {
      window.localStorage.setItem('crewcheck_last_loaded_version', '13.5.0');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=13.5.0').then((registration) => {
          registration.update().catch(() => undefined);
          navigator.serviceWorker.controller?.postMessage('CLEAR_CREWCHECK_CACHE');
        }).catch(() => undefined);
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
      window.clearTimeout(splashTimer);
      media?.removeEventListener?.('change', handleSystemTheme);
      window.removeEventListener('crewcheck:theme-change', applySavedTheme);
      window.removeEventListener('storage', applySavedTheme);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadMaintenance = () => {
      fetch('/api/maintenance/status', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => { if (alive && payload) setMaintenanceState(payload); })
        .catch(() => undefined);
    };
    loadMaintenance();
    const timer = window.setInterval(loadMaintenance, 60_000);
    const handler = () => loadMaintenance();
    window.addEventListener('crewcheck:maintenance-updated', handler);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('crewcheck:maintenance-updated', handler); };
  }, []);

  const storedUser = getStoredUser();
  const storedRole = String((storedUser as any)?.role || localStorage.getItem('crewcheck_role') || '').toLowerCase();
  const storedEmail = String(storedUser?.email || '').toLowerCase();
  const clientAdmin = storedRole.includes('admin') || ['bmedeiros1987@gmail.com', 'bruno@crewcheck.local'].includes(storedEmail);
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  const maintenanceBlocks = Boolean(maintenanceState?.enabled && !clientAdmin && currentPath !== '/login' && !currentPath.startsWith('/privacy') && !currentPath.startsWith('/terms') && !currentPath.startsWith('/delete-account'));

  if (!bootSplashDone) return <CrewCheckOpeningSplash label="CrewCheck Premium" />;
  if (maintenanceBlocks) return (
    <ErrorBoundary>
      <Toaster richColors position={appMode ? "top-center" : "top-right"} />
      <MaintenanceModePage
        state={maintenanceState || undefined}
        onAdminAccess={() => setLocation('/login')}
      />
    </ErrorBoundary>
  );

  return (
    <ErrorBoundary>
      <Toaster richColors position={appMode ? "top-center" : "top-right"} />
      <Router />
      <CrewCheckGlobalBottomMenu />
    </ErrorBoundary>
  );
}
