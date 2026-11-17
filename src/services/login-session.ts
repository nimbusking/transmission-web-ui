// Tab-scoped credentials only. Never pass these values to settings or diagnostics.
interface LoginSession {
  username: string;
  password: string;
}
const key = (endpoint: string) => `twui:login-session:${new URL(endpoint).href}`;
export function readLoginSession(endpoint: string): LoginSession | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(endpoint)) ?? 'null');
    if (value && typeof value.username === 'string' && typeof value.password === 'string')
      return { username: value.username, password: value.password };
  } catch {
    // Storage can be blocked by browser policy; explicit login still works.
  }
}
const pageKey = () => `twui:login-page:${location.origin}${location.pathname}`;
export function hasPageLoginSession(): boolean {
  try {
    const endpoint = sessionStorage.getItem(pageKey()) ?? new URL('../rpc', document.baseURI).href;
    return (
      !!endpoint && new URL(endpoint).origin === location.origin && !!readLoginSession(endpoint)
    );
  } catch {
    return false;
  }
}
export function saveLoginSession(endpoint: string, value?: LoginSession) {
  try {
    if (value) {
      sessionStorage.setItem(key(endpoint), JSON.stringify(value));
      sessionStorage.setItem(pageKey(), new URL(endpoint).href);
    } else sessionStorage.removeItem(key(endpoint));
  } catch {
    // Do not prevent a successful login when storage is unavailable.
  }
}
