import { describe, it, expect, vi } from 'vitest';
import { RpcClient } from '../../src/services/rpc';
import { createOfflineTransport } from '../../src/services/diagnostics/replay';
describe('offline RPC primitive (not full business replay)', () => {
  it('replays session negotiation through real RpcClient without network', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    const replay = createOfflineTransport([
      { method: 'torrent-stop', arguments: { ids: [1] }, sessionChallenge: true },
      {
        method: 'torrent-stop',
        arguments: { ids: [1] },
        body: '{"result":"success","tag":"$request","arguments":{}}',
      },
    ]);
    await new RpcClient('/must-never-connect', replay.transport).call('torrent-stop', { ids: [1] });
    expect(replay.report()).toMatchObject({ result: 'matched', consumed: 2, realRpcRequests: 0 });
    expect(network).not.toHaveBeenCalled();
  });
  it('feeds malformed JSON through actual protocol validation', async () => {
    const replay = createOfflineTransport([
      { method: 'session-get', arguments: {}, body: 'invalid{' },
    ]);
    await expect(new RpcClient('/offline', replay.transport).session()).rejects.toMatchObject({
      kind: 'protocol',
    });
    expect(replay.report().result).toBe('matched');
  });
  it('reports divergence on unmatched calls and never provides success fallback', async () => {
    const replay = createOfflineTransport([]);
    await expect(new RpcClient('/offline', replay.transport).session()).rejects.toMatchObject({
      kind: 'network',
    });
    expect(replay.report().result).toBe('diverged');
  });
  it('does not allow observer failure to change a write outcome', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{"result":"success"}'));
    await expect(
      new RpcClient('/offline', transport, () => {
        throw new Error('Storage denied');
      }).call('torrent-stop', { ids: [1] }),
    ).resolves.toEqual({});
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
