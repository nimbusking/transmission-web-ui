import type { CapturePackage, CaptureEvent } from './protocol';
import { canonical } from './replay';

export function createCaptureTransport(packet: CapturePackage) {
  const starts = packet.events.filter((event) => event.type === 'rpc.start');
  const used = new Set<number>();
  const bindings = new Map<string, CaptureEvent>();
  const errors = new Map<string, string>();
  const consumed = new Set<number>();
  const failures: string[] = [];
  const origin = performance.now();
  const trace: { type: string; data: Record<string, unknown> }[] = [];
  const wait = (at: number) => {
    const remaining = at - (performance.now() - origin);
    return remaining <= 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => setTimeout(resolve, remaining));
  };
  function fail(reason: string) {
    failures.push(reason);
    return new Error(reason);
  }
  function observe(type: string, data: Record<string, unknown>) {
    trace.push({ type, data: { requestId: data.requestId, kind: data.kind } });
    if (type === 'state.discard') {
      const expected = packet.events.find(
        (event) =>
          event.type === type &&
          !consumed.has(event.seq) &&
          canonical(event.data) === canonical(data),
      );
      if (!expected) fail('unexpected-state-discard');
      else consumed.add(expected.seq);
    } else if (type === 'rpc.start') {
      const expected = starts.find(
        (event) =>
          !used.has(event.seq) &&
          event.data.method === data.method &&
          event.data.operationId === data.operationId &&
          (event.data.context ?? 'default') === (data.context ?? 'default') &&
          canonical(event.data.arguments) === canonical(data.arguments),
      );
      if (!expected) {
        fail(`unmatched-request:${data.method}`);
        return;
      }
      used.add(expected.seq);
      consumed.add(expected.seq);
      bindings.set(String(data.requestId), expected);
    } else if (type === 'rpc.error') errors.set(String(data.requestId), String(data.kind));
    else if (type === 'rpc.end') {
      const start = bindings.get(String(data.requestId));
      if (!start) return;
      const related = packet.events.filter(
        (event) => event.data.requestId === start.data.requestId,
      );
      const expectedError = related.find((event) => event.type === 'rpc.error');
      if (expectedError?.data.kind !== errors.get(String(data.requestId)))
        fail(`error-kind:${start.data.requestId}`);
      for (const event of related.filter((event) => ['rpc.end', 'rpc.error'].includes(event.type)))
        consumed.add(event.seq);
    }
  }
  const attempts = new Map<string, number>();
  const transport: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const runtimeId = `req-${request.tag}`;
    const start = bindings.get(runtimeId);
    if (!start) throw fail('transport-without-match');
    const ordinal = (attempts.get(runtimeId) ?? 0) + 1;
    attempts.set(runtimeId, ordinal);
    const related = packet.events.filter((event) => event.data.requestId === start.data.requestId);
    const attempt = related.find(
      (event) => event.type === 'rpc.attempt' && event.data.attempt === ordinal,
    );
    if (!attempt) {
      const error = related.find((event) => event.type === 'rpc.error');
      if (!error) throw fail('missing-attempt');
      if (error.data.kind === 'timeout' || error.data.kind === 'cancelled') {
        return new Promise<Response>((_, reject) => {
          const abort = () => reject(new DOMException('Recorded abort', 'AbortError'));
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort, { once: true });
        });
      }
      await wait(error.monoMs);
      throw new TypeError('Recorded network failure');
    }
    const response = related.find(
      (event) => event.type === 'rpc.response' && event.data.attempt === ordinal,
    );
    await wait(response?.monoMs ?? attempt.monoMs);
    consumed.add(attempt.seq);
    if (response) consumed.add(response.seq);
    const headers = attempt.data.challenge
      ? { 'X-Transmission-Session-Id': 'synthetic-session' }
      : undefined;
    let body = '';
    if (response?.data.invalidJson) body = 'invalid-json{';
    else if (response) {
      const envelope = structuredClone(response.data.envelope) as Record<string, unknown>;
      if (envelope && typeof envelope === 'object') {
        if (envelope.tag === '$request') envelope.tag = request.tag;
        else if (envelope.tag === '$wrong') envelope.tag = request.tag + 100000;
      }
      body = JSON.stringify(envelope);
    }
    return new Response([204, 205, 304].includes(Number(attempt.data.status)) ? null : body, {
      status: Number(attempt.data.status),
      headers,
    });
  };
  return {
    transport,
    hasConsumed: (seq: number) => consumed.has(seq),
    observe,
    trace,
    report() {
      const remaining = packet.events.filter(
        (event) =>
          (event.type.startsWith('rpc.') || event.type === 'state.discard') &&
          !consumed.has(event.seq),
      );
      return {
        result: failures.length || remaining.length ? 'diverged' : 'matched',
        failures,
        realRpcRequests: 0,
        consumedRpcEvents: consumed.size,
        remainingRpcEvents: remaining.map((event) => event.seq),
        trace,
      };
    },
  };
}
