export function getApiBaseUrl(): string {
  // Always use relative paths so that fetch resolves against the current document's base URL.
  // This is crucial in sandboxed iframes where window.location.origin might be "null",
  // and we want to rely on the browser's native relative path resolution.
  return '';
}
