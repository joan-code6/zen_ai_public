import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, HashRouter } from "react-router-dom"
import { ThemeProvider } from "next-themes"
 
import "./index.css"
import "./i18n"
import App from "./App.tsx"
import ErrorBoundary from "./components/ErrorBoundary";
import { initBackend } from "./lib/backend";

const isFileProtocol = window.location.protocol === "file:";
const AppRouter = isFileProtocol ? HashRouter : BrowserRouter;
 
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AppRouter>
          <App />
        </AppRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)

// Initialize backend URL fetch (best-effort)
initBackend().catch(() => {});
