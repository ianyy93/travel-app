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

  // 1. Check localStorage for an override (useful for debugging/custom deployments)
  const saved = localStorage.getItem('BACKEND_URL');
  if (saved) {
    const normalizedSaved = normalizeUrl(saved);
    if (normalizedSaved && normalizedSaved !== currentOrigin) return normalizedSaved;
  }

  // 2. Check for baked-in URL from build process
  const bakedUrl = import.meta.env.VITE_APP_URL || (typeof process !== 'undefined' && process.env ? (process.env as any).APP_URL : '');
  if (bakedUrl) {
    const normalizedBaked = normalizeUrl(bakedUrl);
    if (normalizedBaked && normalizedBaked !== currentOrigin) {
      return normalizedBaked;
    }
  }

  // 3. Fallback: If we are not on the backend itself, we need to point to the backend.
  const backendUrl = normalizeUrl('https://ais-pre-55t7hmzfy6xbjhw6glxmqz-600172538697.asia-southeast1.run.app');
  
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');

  if (currentOrigin !== backendUrl) {
    if (isLocalhost) {
      // For local development:
      // If we are on port 3000 (backend port), use relative paths to route to the local server
      if (window.location.port === '3000') {
        return '';
      }
      // If on another local port (e.g., Vite dev server on 5173), point to local backend on 3000
      return 'http://localhost:3000';
    }

    // In production, if the current origin is not the backend itself (e.g., custom domains, static hosting subdomains, or iframe previews),
    // we must direct requests to the deployed Cloud Run backend.
    console.log(`[API] Deployed static/custom host detected (${hostname}). Using backend: ${backendUrl}`);
    return backendUrl;
  }

  return '';
}
