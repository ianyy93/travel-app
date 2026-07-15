export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // 1. Check localStorage for an override (useful for debugging/custom deployments)
  const saved = localStorage.getItem('BACKEND_URL');
  if (saved) return saved;

  // 2. Check for baked-in URL from build process
  const bakedUrl = import.meta.env.VITE_APP_URL || (typeof process !== 'undefined' && process.env ? (process.env as any).APP_URL : '');
  if (bakedUrl) {
    try {
      const parsedConfigured = new URL(bakedUrl);
      if (parsedConfigured.origin !== window.location.origin) {
        return parsedConfigured.origin;
      }
    } catch (e) {
      // Ignore invalid URL
    }
  }

  // 3. Fallback for common static hosting domains if we aren't already on the backend
  const staticDomains = ['workers.dev', 'pages.dev', 'github.io', 'netlify.app', 'vercel.app', 'web.app', 'firebaseapp.com'];
  const isStaticHost = staticDomains.some(domain => window.location.hostname.endsWith(domain));
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // If we are on a known static host or localhost and not on the primary backend URL,
  // use the known Cloud Run backend URL for this project.
  if (isStaticHost || isLocalhost) {
    const backendUrl = 'https://ais-pre-55t7hmzfy6xbjhw6glxmqz-600172538697.asia-southeast1.run.app';
    if (window.location.origin !== backendUrl) {
      return backendUrl;
    }
  }

  return '';
}
