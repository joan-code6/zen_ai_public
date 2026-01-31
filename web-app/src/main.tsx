import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
 
import "./index.css"
import App from "./App.tsx"
import ErrorBoundary from "./components/ErrorBoundary";
import { initBackend } from "./lib/backend";
 
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)

// Initialize backend URL fetch (best-effort)
initBackend().catch(() => {});
