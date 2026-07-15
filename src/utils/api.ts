export function getApiBaseUrl(): string {
  // 1. Check localStorage for an override (useful for debugging/custom deployments)
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('BACKEND_URL');
    if (saved) return saved;
  }

  // 2. Check for baked-in URL from build process
  const bakedUrl = import.meta.env.VITE_APP_URL || (typeof process !== 'undefined' && process.env ? (process.env as any).APP_URL : '');
  if (bakedUrl && typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    try {
      const parsedConfigured = new URL(bakedUrl);
      if (parsedConfigured.origin !== currentOrigin) {
        return parsedConfigured.origin;
      }
    } catch (e) {
      // Ignore invalid URL
    }
  }

  // 3. If we are on Cloudflare and have no URL, try to use a default for this project
  // This is a last-resort fallback for the user's specific deployment.
  if (typeof window !== 'undefined' && window.location.hostname.includes('workers.dev')) {
    // Note: The user can set localStorage.setItem('BACKEND_URL', 'https://your-app.run.app') to override this.
    return 'https://ais-pre-55t7hmzfy6xbjhw6glxmqz-600172538697.asia-southeast1.run.app';
  }

  return '';
}
