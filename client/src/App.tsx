import { useEffect, useRef, useState, type ReactNode } from "react";
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

const OPENING_VIDEO_SRC = "/assets/opening/crewcheck-opening.mp4?v=11.1.77";

function CrewCheckOpeningSplash({ label = "CrewCheck Premium" }: { label?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const tryPlay = () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        video.muted = true;
        video.playsInline = true;
        const attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => undefined);
      } catch {
        // Autoplay pode variar no WebView/iOS; o fallback visual continua centralizado.
      }
    };
    tryPlay();
    const t1 = window.setTimeout(() => alive && tryPlay(), 250);
    const t2 = window.setTimeout(() => alive && tryPlay(), 900);
    return () => { alive = false; window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#020817] text-white">
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        src={OPENING_VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        onLoadedData={() => setVideoReady(true)}
        onCanPlay={() => setVideoReady(true)}
        aria-label="Abertura CrewCheck"
      />
      {!videoReady && <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,.30),transparent_32%),linear-gradient(135deg,#020817_0%,#071a35_50%,#020817_100%)]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020817]/12 via-[#020817]/28 to-[#020817]/72" />
      <div className="relative z-10 flex w-full justify-center px-6 text-center">
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-950/38 px-5 py-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/85">{label}</p>
          <div className="mx-auto mt-4 h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-200/90" />
          </div>
        </div>
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
  const [bootSplashDone, setBootSplashDone] = useState(false);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setBootSplashDone(true), 2200);
    const applySavedTheme = () => applyCrewThemeMode(loadCrewThemeMode());
    applyDocumentLanguage();
    installGlobalStaticTranslations();
    applySavedTheme();

    try {
      window.localStorage.setItem('crewcheck_last_loaded_version', '11.1.77');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
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

  if (!bootSplashDone) return <CrewCheckOpeningSplash label="CrewCheck Premium" />;

  return (
    <ErrorBoundary>
      <Toaster richColors position={appMode ? "top-center" : "top-right"} />
      <Router />
      <CrewCheckGlobalBottomMenu />
    </ErrorBoundary>
  );
}
