import './lib/crewcheckPremiumRuntime';
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import "./premium-audit-v13-8-8.css";
import "./components/v1409/layout-lock.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
