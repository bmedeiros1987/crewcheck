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
import LegalPage from "./pages/LegalPage";
import OAuthVerificationPage from "./pages/OAuthVerificationPage";
import WatchPage from "./pages/WatchPage";
import VisitorAccessPage from "./pages/VisitorAccessPage";
import SharedRosterPage from "./pages/SharedRosterPage";
import AdminPartnerAccountsPage from "./pages/AdminPartnerAccountsPage";
import AboutUsPage from "./pages/AboutUsPage";
import TelegramConnectPage from "./pages/TelegramConnectPage";
import { getMe, getStoredUser, isAuthenticated } from "./lib/authClient";
import { applyDocumentLanguage, installGlobalStaticTranslations } from "./lib/i18n";
import TermsGate from "./components/TermsGate";

type CrewThemeMode = 'light' | 'dark' | 'system';

function loadCrewThemeMode(): CrewThemeMode {
  try {
    const saved = window.localStorage.getItem('crewcheck_theme_mode');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch { return 'system'; }
}

function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

function applyCrewThemeMode(mode: CrewThemeMode) {
  try {
    const effective = getEffectiveCrewTheme(mode);
    document.documentElement.dataset.crewThemeMode = mode;
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.style.colorScheme = effective;
  } catch {}
}

function CrewCheckOpeningSplash({ label = "CrewCheck Premium" }: { label?: string }) {
  return <div className="cc1270-loader" aria-label={label}><div className="cc1270-loader-bg" /><div className="cc1270-loader-card"><span className="cc1270-loader-logo">✈</span><strong>CrewCheck</strong><small>Carregando CrewCheck Premium</small></div></div>;
}

async function enablePartnerDemoRoster() {
  try {
    const response = await fetch('/api/partner/demo-profile', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    if (!payload?.partner || !payload?.demoRosterEnabled) return;
    const user = getStoredUser();
    const accountKey = String(user?.id || user?.email || 'partner').toLowerCase();
    const marker = `crewcheck_partner_demo_loaded:${accountKey}`;
    if (window.localStorage.getItem(marker) === '1') return;
    window.localStorage.setItem('crewcheck_demo_mode_seen', '1');
    window.sessionStorage.setItem('crewcheck_demo_active', '1');
    window.localStorage.setItem('crewcheck_partner_demo_account', accountKey);
    window.localStorage.setItem('crewcheck_partner_name', String(payload.partnerName || 'Parceiro CrewCheck'));
    window.localStorage.setItem(marker, '1');
  } catch {}
}

function Protected({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const demoMode = window.localStorage.getItem('crewcheck_demo_mode_seen') === '1' || window.sessionStorage.getItem('crewcheck_demo_active') === '1';
    if (!isAuthenticated() && !demoMode) { setLocation('/login'); return; }
    if (!isAuthenticated() && demoMode) { setReady(true); return; }
    getMe().then(() => enablePartnerDemoRoster()).catch(() => setLocation('/login')).finally(() => mounted && setReady(true));
    return () => { mounted = false; };
  }, [setLocation]);
  if (!isAuthenticated() && !(window.localStorage.getItem('crewcheck_demo_mode_seen') === '1' || window.sessionStorage.getItem('crewcheck_demo_active') === '1')) return null;
  if (!ready) return <CrewCheckOpeningSplash label="CrewCheck Premium" />;
  return <TermsGate>{children}</TermsGate>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const user = getStoredUser();
  const role = String((user as any)?.role || window.localStorage.getItem('crewcheck_role') || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  const admin = role.includes('admin') || ['bmedeiros1987@gmail.com', 'bruno@crewcheck.local'].includes(email);
  return admin ? <>{children}</> : <NotFound />;
}

function CrewCheckGlobalBottomMenu() { return null; }

function Router() {
  return <Switch>
    <Route path="/login" component={AuthPage} />
    <Route path="/visitor" component={VisitorAccessPage} />
    <Route path="/share/:token">{(params) => <SharedRosterPage token={params.token} />}</Route>
    <Route path="/admin/partners">{() => <Protected><AdminOnly><AdminPartnerAccountsPage /></AdminOnly></Protected>}</Route>
    <Route path="/telegram">{() => <Protected><TelegramConnectPage /></Protected>}</Route>
    <Route path="/sobre" component={AboutUsPage} />
    <Route path="/about" component={AboutUsPage} />
    <Route path="/">{() => <Protected><Home /></Protected>}</Route>
    <Route path="/app">{() => <Protected><Home /></Protected>}</Route>
    <Route path="/home">{() => <Protected><Home /></Protected>}</Route>
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
    <Route path="/privacy">{() => <LegalPage kind="privacy" />}</Route>
    <Route path="/delete-account">{() => <InfoPage page="deleteAccount" />}</Route>
    <Route path="/terms">{() => <LegalPage kind="terms" />}</Route>
    <Route path="/oauth-verification" component={OAuthVerificationPage} />
    <Route path="/google-calendar" component={OAuthVerificationPage} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  const [, setLocation] = useLocation();
  const [appMode, setAppMode] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState<{ enabled?: boolean; message?: string; title?: string; status?: string; adminBypass?: boolean } | null>(null);
  const [bootSplashDone, setBootSplashDone] = useState(true);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setBootSplashDone(true), 80);
    const applySavedTheme = () => applyCrewThemeMode(loadCrewThemeMode());
    applyDocumentLanguage(); installGlobalStaticTranslations(); applySavedTheme();
    try {
      window.localStorage.setItem('crewcheck_last_loaded_version', '14.2.6');
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);
      if ('caches' in window) caches.keys().then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name)))).catch(() => undefined);
    } catch {}
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemTheme = () => { if (loadCrewThemeMode() === 'system') applySavedTheme(); };
    media?.addEventListener?.('change', handleSystemTheme);
    window.addEventListener('crewcheck:theme-change', applySavedTheme);
    window.addEventListener('storage', applySavedTheme);
    try {
      const params = new URLSearchParams(window.location.search);
      const enabled = params.get('app') === '1' || params.get('android') === '1' || window.localStorage.getItem('crewcheck_app_mode') === '1';
      if (enabled) { window.localStorage.setItem('crewcheck_app_mode', '1'); document.documentElement.classList.add('crewcheck-android'); document.body.classList.add('crewcheck-android-body'); }
      setAppMode(enabled);
    } catch { setAppMode(false); }
    return () => { window.clearTimeout(splashTimer); media?.removeEventListener?.('change', handleSystemTheme); window.removeEventListener('crewcheck:theme-change', applySavedTheme); window.removeEventListener('storage', applySavedTheme); };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadMaintenance = () => fetch('/api/maintenance/status', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((payload) => { if (alive && payload) setMaintenanceState(payload); }).catch(() => undefined);
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
  const publicPaths = ['/privacy', '/terms', '/about', '/sobre', '/oauth-verification', '/google-calendar', '/delete-account', '/visitor', '/share/'];
  const maintenanceBlocks = Boolean(maintenanceState?.enabled && !clientAdmin && currentPath !== '/login' && !publicPaths.some((path) => currentPath.startsWith(path)));

  if (!bootSplashDone) return <CrewCheckOpeningSplash label="CrewCheck Premium" />;
  if (maintenanceBlocks) return <ErrorBoundary><Toaster richColors position={appMode ? "top-center" : "top-right"} /><MaintenanceModePage state={maintenanceState || undefined} onAdminAccess={() => setLocation('/login')} /></ErrorBoundary>;

  return <ErrorBoundary>
    <Toaster richColors position={appMode ? "top-center" : "top-right"} />
    <Router /><CrewCheckGlobalBottomMenu />
  </ErrorBoundary>;
}
