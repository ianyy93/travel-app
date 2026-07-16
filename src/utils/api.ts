export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  function normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.origin;
    } catch {
      return url.replace(/\/$/, '');
    }
  }

  const currentOrigin = normalizeUrl(window.location.origin);

  // 1. Check localStorage for an override (set via the browser prompt on connection error)
  const saved = localStorage.getItem('BACKEND_URL');
  if (saved) {
    const normalizedSaved = normalizeUrl(saved);
    if (normalizedSaved && normalizedSaved !== currentOrigin) return normalizedSaved;
  }

  // 2. Check for baked-in URL from build process (set via VITE_APP_URL env var)
  const bakedUrl = import.meta.env.VITE_APP_URL || (typeof process !== 'undefined' && process.env ? (process.env as any).APP_URL : '');
  if (bakedUrl) {
    const normalizedBaked = normalizeUrl(bakedUrl);
    if (normalizedBaked && normalizedBaked !== currentOrigin) {
      return normalizedBaked;
    }
  }

  // 3. Local dev: if running on a port other than 3000 (e.g. Vite dev server on 5173),
  // point to the local Express backend on port 3000.
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
  if (isLocalhost && window.location.port !== '3000') {
    return 'http://localhost:3000';
  }

  // 4. Default: use relative paths (empty string = same origin).
  // This is correct for full-stack deployments (Render, Cloud Run, Railway, etc.)
  // where the Express server hosts both the frontend and the API on the same URL.
  return '';
}
