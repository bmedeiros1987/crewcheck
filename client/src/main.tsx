import './lib/crewcheckPremiumRuntime';
import './lib/themeRuntime';
import './lib/offlineRuntime';
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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
