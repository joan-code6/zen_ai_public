const GIST_URL = "https://gist.githubusercontent.com/joan-code6/8b995d800205dbb119842fa588a2bd2c/raw/zen.json";

let _initPromise: Promise<void> | null = null;
let _backendUrl: string | null = null;

export function getBackendUrl(): string | null {
  return _backendUrl;
}

async function fetchGistJson(): Promise<any> {
  const res = await fetch(GIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch gist: ${res.status}`);
  return res.json();
}

export async function initBackend(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      // First try to get from environment variable
      const envUrl = import.meta.env.VITE_BACKEND_URL;
      if (envUrl) {
        _backendUrl = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
        try { localStorage.setItem("zen_backend_url", _backendUrl); } catch {}
        try { (window as any).__ZEN_BACKEND_URL = _backendUrl; } catch {}
        return;
      }

      // Fallback to gist
      const data = await fetchGistJson();
      // Accept several possible shapes: { backendUrl }, { backend: { url } }, or { url }
      _backendUrl = data?.backendUrl || data?.backend?.url || data?.url || null;
      if (_backendUrl) {
        // normalize
        if (!_backendUrl.startsWith("http")) _backendUrl = `https://${_backendUrl}`;
        try { localStorage.setItem("zen_backend_url", _backendUrl); } catch {}
        // also expose globally for quick debugging
        try { (window as any).__ZEN_BACKEND_URL = _backendUrl; } catch {}
      }
    } catch (err) {
      // On failure, try to read previously cached value
      try { _backendUrl = localStorage.getItem("zen_backend_url"); } catch { _backendUrl = null; }
    }
  })();
  return _initPromise;
}

export async function apiFetch(path: string, opts?: RequestInit) {
  await initBackend();
  const base = _backendUrl;
  if (!base) throw new Error("Backend URL not configured");
  const url = new URL(path.replace(/^\//, ""), base).toString();
  return fetch(url, opts);
}

export default { initBackend, getBackendUrl, apiFetch };
