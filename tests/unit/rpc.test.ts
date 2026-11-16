import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcClient, reconciliationInterval } from '../../src/services/rpc';
const ok = (args = {}) => Response.json({ result: 'success', arguments: args });
afterEach(() => vi.useRealTimers());
describe('RPC settlement and safe retries (B09)', () => {
  it('negotiates 409 and preserves identical write arguments', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 409, headers: { 'X-Transmission-Session-Id': 'session' } }),
      )
      .mockResolvedValueOnce(ok());
    await new RpcClient('/rpc', transport).call('torrent-stop', { ids: ['hash'] });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][1].body).toBe(transport.mock.calls[0][1].body);
    expect(transport.mock.calls[1][1].headers['X-Transmission-Session-Id']).toBe('session');
  });
  it.each([
    [401, 'auth'],
    [500, 'http'],
  ])('settles HTTP %s without retry', async (status, kind) => {
    const transport = vi.fn().mockResolvedValue(new Response('', { status: Number(status) }));
    await expect(new RpcClient('/rpc', transport).call('torrent-remove')).rejects.toMatchObject({
      kind,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('bounds handshake retries', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 409, headers: { 'X-Transmission-Session-Id': 'x' } }),
      );
    await expect(new RpcClient('/rpc', transport).call('session-get')).rejects.toMatchObject({
      kind: 'protocol',
    });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['bad JSON', () => new Response('bad')],
    ['business failure', () => Response.json({ result: 'invalid metainfo' })],
    ['wrong tag', () => Response.json({ result: 'success', tag: 999 })],
  ])('rejects %s', async (_, response) => {
    await expect(
      new RpcClient('/rpc', vi.fn().mockResolvedValue(response())).call('torrent-add'),
    ).rejects.toThrow();
  });
  it('does not repeat writes after network errors', async () => {
    const transport = vi.fn().mockRejectedValue(new TypeError('connection lost'));
    await expect(new RpcClient('/rpc', transport).call('torrent-add')).rejects.toMatchObject({
      kind: 'network',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('distinguishes timeout and explicit cancellation', async () => {
    vi.useFakeTimers();
    const transport = vi.fn(
      (_url, init) =>
        new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('abort'))),
        ),
    );
    const client = new RpcClient('/rpc', transport);
    const timeout = expect(client.call('session-get', {}, { timeoutMs: 50 })).rejects.toMatchObject(
      { kind: 'timeout' },
    );
    await vi.advanceTimersByTimeAsync(50);
    await timeout;
    const controller = new AbortController();
    const cancelled = expect(
      client.call('session-get', {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    controller.abort();
    await cancelled;
  });
  it('reconciles early 4.x more often', () => {
    expect(reconciliationInterval('4.0.5')).toBe(15000);
    expect(reconciliationInterval('4.0.6')).toBe(60000);
  });
});
it('default fetch transport preserves browser receiver semantics', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(ok());
  };
  try {
    await expect(new RpcClient('/rpc').call('session-get')).resolves.toEqual({});
  } finally {
    globalThis.fetch = original;
  }
});

it('uses explicit credentials without browser HTTP-auth state and clears them for re-login', async () => {
  const transport = vi.fn().mockImplementation(async () => ok());
  const client = new RpcClient('/rpc', transport);
  client.authenticate('user', 'secret');
  await client.session();
  expect(transport.mock.calls[0][1].credentials).toBe('omit');
  expect(transport.mock.calls[0][1].headers.Authorization).toBe(`Basic ${btoa('user:secret')}`);
  client.clearAuthentication();
  await client.session();
  expect(transport.mock.calls[1][1].headers.Authorization).toBeUndefined();
});
