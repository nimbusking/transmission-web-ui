import type { Session, Torrent } from '../domain/types';
export type ErrorKind =
  'network' | 'http' | 'auth' | 'protocol' | 'business' | 'timeout' | 'cancelled';
export class RpcError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}
export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export class RpcClient {
  private sessionId = '';
  private authorization = '';
  private tag = 0;
  constructor(
    public url: string,
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  authenticate(username: string, password: string) {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    this.authorization = `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))}`;
  }
  clearAuthentication() {
    this.authorization = '';
    this.sessionId = '';
  }
  async call<T = Record<string, any>>(
    method: string,
    args: Record<string, unknown> = {},
    options: CallOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 20000);
    const tag = ++this.tag;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Transmission-Session-Id': this.sessionId,
        };
        if (this.authorization) headers.Authorization = this.authorization;
        const response = await this.transport(this.url, {
          method: 'POST',
          // Explicit Authorization is managed by the login page; do not use the
          // browser's HTTP-auth cache or trigger its native challenge dialog.
          credentials: 'omit',
          cache: 'no-store',
          headers,
          body: JSON.stringify({ method, arguments: args, tag }),
          signal: controller.signal,
        });
        if (response.status === 409) {
          const sessionId = response.headers.get('X-Transmission-Session-Id');
          if (!sessionId || attempt === 2)
            throw new RpcError('protocol', 'Session negotiation failed', 409);
          this.sessionId = sessionId;
          continue;
        }
        if (response.status === 401 || response.status === 403)
          throw new RpcError(
            'auth',
            `Authentication or access denied (${response.status})`,
            response.status,
          );
        if (!response.ok)
          throw new RpcError(
            'http',
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
          );
        let data: any;
        try {
          data = await response.json();
        } catch {
          throw new RpcError('protocol', 'Invalid RPC JSON response');
        }
        if (
          !data ||
          typeof data !== 'object' ||
          typeof data.result !== 'string' ||
          (data.tag !== undefined && data.tag !== tag)
        )
          throw new RpcError('protocol', 'Invalid RPC response envelope');
        if (data.result !== 'success') throw new RpcError('business', data.result);
        return (data.arguments ?? {}) as T;
      }
      throw new RpcError('protocol', 'Session negotiation exhausted');
    } catch (error) {
      if (error instanceof RpcError) throw error;
      if (controller.signal.aborted)
        throw new RpcError(
          timedOut ? 'timeout' : 'cancelled',
          timedOut
            ? 'RPC request timed out; reconcile before repeating a write'
            : 'Request cancelled',
        );
      throw new RpcError('network', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  async torrents(
    fields: string[],
    ids?: (number | string)[] | 'recently-active',
    options?: CallOptions,
  ): Promise<{ torrents: Torrent[]; removed?: number[] }> {
    return this.call('torrent-get', { fields, ...(ids === undefined ? {} : { ids }) }, options);
  }
  session(options?: CallOptions): Promise<Session> {
    return this.call('session-get', {}, options);
  }
}
export function isUnknownOutcome(error: unknown): boolean {
  return (
    error instanceof RpcError &&
    ['network', 'timeout', 'cancelled', 'protocol', 'http'].includes(error.kind)
  );
}
export function reconciliationInterval(version: string): number {
  return /^4\.0\.[0-5](?:\D|$)/.test(version) ? 15000 : 60000;
}
