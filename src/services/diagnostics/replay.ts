/** Offline RPC replay primitive. Only synthetic, explicitly sanitized fixtures are accepted. */
export interface ReplayExchange {
  method: string;
  arguments: Record<string, unknown>;
  status?: number;
  body?: string;
  sessionChallenge?: boolean;
  failure?: 'network';
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function createOfflineTransport(exchanges: ReplayExchange[]) {
  let position = 0;
  let divergence: string | undefined;
  const transport: typeof fetch = async (_url, init) => {
    if (divergence) throw new Error(divergence);
    const request = JSON.parse(String(init?.body)) as {
      method: string;
      arguments: Record<string, unknown>;
      tag: number;
    };
    const expected = exchanges[position];
    if (
      !expected ||
      expected.method !== request.method ||
      canonical(expected.arguments) !== canonical(request.arguments)
    ) {
      divergence = `Unmatched offline request at exchange ${position}`;
      throw new Error(divergence);
    }
    position++;
    if (expected.failure === 'network') throw new TypeError('Recorded network failure');
    if (expected.sessionChallenge)
      return new Response('', {
        status: 409,
        headers: { 'X-Transmission-Session-Id': 'synthetic-replay-session' },
      });
    let body = expected.body ?? '';
    try {
      const envelope = JSON.parse(body);
      // Preserve explicitly recorded wrong-tag fixtures. Normal envelopes use current RPC tag.
      if (envelope.tag === '$request') envelope.tag = request.tag;
      body = JSON.stringify(envelope);
    } catch {
      /* Invalid JSON is replay input, not a successful empty response. */
    }
    return new Response(body, { status: expected.status ?? 200 });
  };
  return {
    transport,
    report() {
      return {
        result: divergence || position !== exchanges.length ? 'diverged' : 'matched',
        consumed: position,
        remaining: exchanges.length - position,
        divergence,
        realRpcRequests: 0,
      };
    },
  };
}
