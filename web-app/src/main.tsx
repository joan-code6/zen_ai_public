import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
 
import "./index.css"
import App from "./App.tsx"
import ErrorBoundary from "./components/ErrorBoundary";
import { initBackend } from "./lib/backend";
 
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

// Initialize backend URL fetch (best-effort)
initBackend().catch(() => {});
