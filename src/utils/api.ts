export function getApiBaseUrl(): string {
  // If we have a configured API URL in process.env (baked in at build time)
  // and the current origin is NOT that URL, we should use the configured API URL.
  // This allows static hostings (like Cloudflare Pages) to talk to the Cloud Run backend.
  const configuredUrl = (typeof process !== 'undefined' && process.env ? (process.env as any).APP_URL : '') || import.meta.env.VITE_APP_URL;
  if (configuredUrl && typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    try {
      const parsedConfigured = new URL(configuredUrl);
      if (parsedConfigured.origin !== currentOrigin) {
        // Return the configured URL origin (without trailing slash)
        return parsedConfigured.origin;
      }
    } catch (e) {
      // Ignore invalid URL
    }
  }
  return '';
}
