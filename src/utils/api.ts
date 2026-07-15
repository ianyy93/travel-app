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

  // 3. Fallback for common static hosting domains if we aren't already on the backend
  const staticDomains = [
    'workers.dev', 'pages.dev', 'github.io', 'netlify.app', 
    'vercel.app', 'web.app', 'firebaseapp.com', 'amplifyapp.com',
    'azurestaticapps.net', 'onrender.com', 'surge.sh'
  ];
  
  const hostname = window.location.hostname;
  const isStaticHost = staticDomains.some(domain => hostname.endsWith(domain));
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');

  if (isStaticHost || isLocalhost) {
    const backendUrl = normalizeUrl('https://ais-pre-55t7hmzfy6xbjhw6glxmqz-600172538697.asia-southeast1.run.app');
    if (currentOrigin !== backendUrl) {
      console.log(`[API] Static/Local host detected (${hostname}). Using backend: ${backendUrl}`);
      return backendUrl;
    }
  }

  return '';
}
