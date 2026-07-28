export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('BACKEND_URL');
    if (saved) return saved.replace(/\/$/, '');
    return window.location.origin;
  }
  return '';
}
