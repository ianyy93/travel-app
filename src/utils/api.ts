export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('BACKEND_URL');
    if (saved) return saved.replace(/\/$/, '');
    return '';
  }
  return '';
}
