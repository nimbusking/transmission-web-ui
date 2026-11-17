import { beforeEach, expect, it, vi } from 'vitest';
import { readLoginSession, saveLoginSession } from '../../src/services/login-session';
const endpoint = 'http://localhost/transmission/rpc';
beforeEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it('isolates credentials by RPC endpoint and clears rejected sessions', () => {
  saveLoginSession(endpoint, { username: 'demo', password: 'secret' });
  expect(readLoginSession(endpoint)).toEqual({ username: 'demo', password: 'secret' });
  expect(readLoginSession('http://localhost/other/rpc')).toBeUndefined();
  saveLoginSession(endpoint);
  expect(readLoginSession(endpoint)).toBeUndefined();
});
it('continues without session restoration when storage is unavailable or malformed', () => {
  sessionStorage.setItem(`twui:login-session:${endpoint}`, '{');
  expect(readLoginSession(endpoint)).toBeUndefined();
  vi.stubGlobal('sessionStorage', {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  });
  expect(readLoginSession(endpoint)).toBeUndefined();
  expect(() => saveLoginSession(endpoint, { username: 'demo', password: 'secret' })).not.toThrow();
  expect(() => saveLoginSession(endpoint)).not.toThrow();
});
