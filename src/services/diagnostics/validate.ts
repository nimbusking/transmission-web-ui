import { z } from 'zod';
import { supportedMethods } from './redact';
import type { CapturePackage } from './protocol';
const finite = z.number().finite();
const id = finite.int().positive();
const args = z
  .object({
    fields: z.array(z.string().max(64)).optional(),
    ids: z
      .union([
        z.literal('recently-active'),
        z.array(z.union([id, z.string().regex(/^[0-9a-f]{40}$/)])),
      ])
      .optional(),
    path: z
      .string()
      .regex(/^\/redacted\/path-\d+$|^$/)
      .optional(),
  })
  .strict();
const eventData: Record<string, z.ZodType> = {
  'operation.start': z
    .object({
      action: z.enum(['refresh', 'select', 'execute', 'connect', 'detail']),
      operationId: id,
      full: z.boolean().optional(),
      id: id.nullable().optional(),
      ids: z.array(id).optional(),
      method: z.enum(['torrent-start', 'torrent-stop']).optional(),
    })
    .strict(),
  'operation.end': z
    .object({
      operationId: id,
      outcome: z.enum(['resolved', 'rejected']),
      kind: z
        .enum([
          'network',
          'http',
          'auth',
          'protocol',
          'business',
          'timeout',
          'cancelled',
          'unknown',
        ])
        .optional(),
    })
    .strict(),
  'rpc.start': z
    .object({
      requestId: z.string().regex(/^req-\d+$/),
      method: z.string().refine((value) => supportedMethods.has(value)),
      arguments: args,
      operationId: id.optional(),
      context: z.enum(['default', 'session', 'refresh', 'detail', 'command']),
      timeoutMs: finite.min(1).max(120000),
    })
    .strict(),
  'rpc.attempt': z
    .object({
      requestId: z.string(),
      attempt: id.max(3),
      status: finite.int().min(100).max(599),
      challenge: z.boolean(),
    })
    .strict(),
  'rpc.response': z
    .object({
      requestId: z.string(),
      attempt: id.max(3),
      envelope: z.unknown().optional(),
      invalidJson: z.boolean(),
    })
    .strict(),
  'rpc.error': z
    .object({
      requestId: z.string(),
      kind: z.enum(['network', 'http', 'auth', 'protocol', 'business', 'timeout', 'cancelled']),
    })
    .strict(),
  'rpc.end': z.object({ requestId: z.string() }).strict(),
  'capture.stop': z.object({}).strict(),
  'state.discard': z
    .object({ generation: finite.int().min(0), reason: z.literal('generation') })
    .strict(),
};
export function validateCapture(input: CapturePackage) {
  const cp = input.checkpoint;
  z.object({
    operationCounter: finite.int().min(0).optional(),
    wallTime: finite.min(0),
    session: z
      .object({ version: z.string().max(100), 'rpc-version': finite.min(16) })
      .passthrough(),
    torrents: z
      .array(z.object({ id, hashString: z.string().regex(/^[0-9a-f]{40}$/) }).passthrough())
      .max(5000),
    ui: z
      .object({ autoRefresh: z.boolean(), refreshIntervalMs: finite.min(2000).max(300000) })
      .passthrough(),
    generation: finite.int().min(0),
    lastSessionAge: finite.min(0),
    lastSnapshotAge: finite.min(0),
    identities: z.array(z.tuple([id, finite.int().min(0)])),
    selectedId: id.nullable(),
    detail: z.object({ id }).passthrough().optional(),
    stale: z.boolean(),
    refreshDueMs: finite.min(0).max(300000).optional(),
  })
    .strict()
    .parse(cp);
  if (new Set(cp.torrents.map((row) => row.id)).size !== cp.torrents.length)
    throw new Error('duplicate-checkpoint-identity');
  if (cp.selectedId !== null && !cp.torrents.some((row) => row.id === cp.selectedId))
    throw new Error('missing-selected-identity');
  if (
    !input.events.length ||
    input.events.length > 10000 ||
    input.events.at(-1)?.type !== 'capture.stop'
  )
    throw new Error('missing-capture-stop');
  const requests = new Map<
    string,
    { ended: boolean; attempts: Set<number>; responses: Set<number>; error: boolean }
  >();
  const operations = new Map<number, boolean>();
  for (const event of input.events) {
    z.object({
      seq: id,
      at: z.string().datetime(),
      monoMs: finite.min(0).max(300000),
      type: z.string(),
      level: z.enum(['info', 'warn', 'error']),
      data: z.record(z.string(), z.unknown()),
    })
      .strict()
      .parse(event);
    if (
      !eventData[event.type] ||
      new TextEncoder().encode(JSON.stringify(event)).length > 512 * 1024
    )
      throw new Error('unsupported-event');
    eventData[event.type].parse(event.data);
    const data = event.data;
    if (event.type === 'operation.start') {
      if (operations.has(data.operationId)) throw new Error('duplicate-operation');
      if (data.action === 'execute' && (!data.method || !data.ids?.length))
        throw new Error('missing-operation-targets');
      if (data.action === 'select' && data.id === undefined) throw new Error('missing-selection');
      operations.set(data.operationId, false);
    } else if (event.type === 'operation.end') {
      if (operations.get(data.operationId) !== false) throw new Error('invalid-operation-end');
      operations.set(data.operationId, true);
    } else if (event.type === 'rpc.start') {
      if (requests.has(data.requestId)) throw new Error('duplicate-request');
      requests.set(data.requestId, {
        ended: false,
        attempts: new Set(),
        responses: new Set(),
        error: false,
      });
    } else if (event.type.startsWith('rpc.')) {
      const request = requests.get(data.requestId);
      if (!request || request.ended) throw new Error('invalid-request-reference');
      if (event.type === 'rpc.end') request.ended = true;
      if (event.type === 'rpc.error') {
        if (request.error) throw new Error('duplicate-request-error');
        request.error = true;
      }
      if (event.type === 'rpc.attempt') {
        if (request.attempts.has(data.attempt) || data.attempt !== request.attempts.size + 1)
          throw new Error('invalid-attempt-order');
        request.attempts.add(data.attempt);
      }
      if (event.type === 'rpc.response') {
        if (!request.attempts.has(data.attempt) || request.responses.has(data.attempt))
          throw new Error('invalid-response-reference');
        request.responses.add(data.attempt);
      }
    }
  }
  if (
    [...requests.values()].some((request) => !request.ended) ||
    [...operations.values()].some((ended) => !ended)
  )
    throw new Error('incomplete-events');
}
