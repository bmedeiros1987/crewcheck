import './lib/crewcheckPremiumRuntime';
import './lib/themeRuntime';
import './lib/offlineRuntime';
import './lib/pwaSharedPdfRuntime';
import './lib/iosNativeRuntime';
import './lib/buildIdentityRuntime';
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import "./premium-audit-v13-8-8.css";
import "./components/v1409/layout-lock.css";
import "./components/v1417/operational-intelligence.css";
import "./theme-v14-3-17.css";
import "./styles/internal-global-header.css";
import "./styles/auth-premium-v2.css";
import "./styles/ipad-shell-v14-3-94.css";
import "./styles/auth-p1-entry-polish.css";
import "./styles/auth-mobile-scroll-p0.css";
import "./styles/web-desktop-shell.css";
import "./styles/bottom-nav-clarity.css";
import "./styles/opening-splash-identity.css";
import "./styles/atlas-1c-semantic-navigation.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
