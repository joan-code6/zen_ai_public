import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ThemeProvider } from "next-themes"
 
import "./index.css"
import "./i18n"
import App from "./App.tsx"
import ErrorBoundary from "./components/ErrorBoundary";
import { initBackend } from "./lib/backend";
 
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)

// Initialize backend URL fetch (best-effort)
initBackend().catch(() => {});
