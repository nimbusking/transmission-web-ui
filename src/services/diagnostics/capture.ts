import { validateCapture } from './validate';
import { version } from '../../../package.json';
import { Redactor, supportedMethods } from './redact';
import { canonical } from './replay';
import type { CapturePackage, CaptureEvent } from './protocol';
export type Checkpoint = CapturePackage['checkpoint'];
export async function seal<T extends { integrity?: { algorithm: 'SHA-256'; digest: string } }>(
  input: T,
): Promise<T> {
  const { integrity: _ignored, ...body } = input;
  const normalized = JSON.parse(JSON.stringify(body));
  const bytes = new TextEncoder().encode(canonical(normalized));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    ...normalized,
    integrity: {
      algorithm: 'SHA-256',
      digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      ),
    },
  };
}

const size = (input: unknown) => new TextEncoder().encode(JSON.stringify(input)).length;
export const buildId = () => (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'development');
export class CaptureRecorder {
  active = false;
  packet?: CapturePackage;
  private redactor = new Redactor();
  private startTime = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private bytes = 0;
  private pending = new Set<string>();
  private calls = new Map<string, { method: string; tag: number }>();
  private operation = 0;
  private openOperations = new Set<number>();
  start(checkpoint: Checkpoint, sessionId = crypto.randomUUID()) {
    if (this.active) throw new Error('capture-already-active');
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID)
      throw new Error('Enhanced recording requires HTTPS or localhost');
    this.redactor = new Redactor();
    const safe: Checkpoint = {
      ...checkpoint,
      session: this.redactor.session(checkpoint.session),
      torrents: checkpoint.torrents.map((row) => this.redactor.torrent(row)),
      ui: this.redactor.ui(checkpoint.ui),
      identities: checkpoint.identities.map(([id, revision]) => [this.redactor.id(id), revision]),
      selectedId: checkpoint.selectedId === null ? null : this.redactor.id(checkpoint.selectedId),
      detail: checkpoint.detail ? this.redactor.torrent(checkpoint.detail) : undefined,
    };
    this.packet = {
      schemaVersion: 1,
      app: { version, buildId: buildId() },
      capture: {
        id: crypto.randomUUID(),
        sessionId,
        mode: 'enhanced',
        start: new Date().toISOString(),
        end: '',
        complete: false,
        eligibility: 'ineligible',
        reasons: [],
        droppedEvents: 0,
        limits: { durationMs: 300000, events: 10000, bytes: 10 * 1024 * 1024 },
      },
      environment:
        typeof navigator === 'undefined'
          ? {}
          : {
              userAgent: navigator.userAgent.slice(0, 512),
              language: navigator.language,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              online: navigator.onLine,
              width: globalThis.innerWidth,
              height: globalThis.innerHeight,
              dpr: globalThis.devicePixelRatio,
              indexedDB: typeof indexedDB !== 'undefined',
              crypto: !!crypto.subtle,
            },
      checkpoint: safe,
      events: [],
      observed: {},
      privacy: {
        version: 1,
        transforms: [
          'synthetic-identities',
          'synthetic-paths',
          'synthetic-trackers',
          'template-text',
        ],
        losses: [],
      },
    };
    this.pending.clear();
    this.calls.clear();
    this.openOperations.clear();
    this.operation = 0;
    const captureWallTime = Date.now();
    const elapsed = Math.max(0, captureWallTime - this.packet.checkpoint.wallTime);
    this.packet.checkpoint.wallTime = captureWallTime;
    this.packet.checkpoint.lastSessionAge += elapsed;
    this.packet.checkpoint.lastSnapshotAge += elapsed;
    if (this.packet.checkpoint.refreshDueMs !== undefined)
      this.packet.checkpoint.refreshDueMs = Math.max(
        0,
        this.packet.checkpoint.refreshDueMs - elapsed,
      );
    this.packet.capture.start = new Date(captureWallTime).toISOString();
    this.startTime = performance.now();
    this.bytes = size(this.packet);
    this.active = true;
    if (this.bytes > 10 * 1024 * 1024 - 4096) {
      this.packet.checkpoint.torrents = [];
      this.packet.checkpoint.detail = undefined;
      this.bytes = size(this.packet);
      this.invalidate('checkpoint-oversize');
    }
    if (this.active) this.timer = setTimeout(() => this.invalidate('duration-limit'), 300000);
  }
  event(type: string, data: Record<string, unknown>) {
    if (!this.active || !this.packet) return;
    const event: CaptureEvent = {
      seq: this.packet.events.length + 1,
      at: new Date().toISOString(),
      monoMs: performance.now() - this.startTime,
      type,
      level: type.endsWith('.error') ? (data.kind === 'cancelled' ? 'info' : 'warn') : 'info',
      data,
    };
    const bytes = size(event);
    if (
      bytes > 512 * 1024 ||
      this.bytes + bytes + 4096 > 10 * 1024 * 1024 ||
      this.packet.events.length >= 10000
    ) {
      this.invalidate(bytes > 512 * 1024 ? 'event-oversize' : 'capacity-limit');
      return;
    }
    this.bytes += bytes + 1;
    this.packet.events.push(event);
  }
  invalidate(reason: string) {
    if (!this.packet || !this.active) return;
    if (!this.packet.capture.reasons.includes(reason)) this.packet.capture.reasons.push(reason);
    this.packet.capture.end = new Date().toISOString();
    this.active = false;
    clearTimeout(this.timer);
  }
  begin(action: string, values: Record<string, unknown> = {}, assignedId?: number) {
    if (!this.active) return undefined;
    if (!['refresh', 'select', 'execute', 'connect', 'detail'].includes(action)) {
      this.invalidate('unsupported-action');
      return undefined;
    }
    const operationId = assignedId ?? ++this.operation;
    const data: Record<string, unknown> = { action, operationId };
    if (typeof values.full === 'boolean') data.full = values.full;
    if (values.id === null || typeof values.id === 'number')
      data.id = values.id === null ? null : this.redactor.id(values.id);
    if (typeof values.method === 'string') {
      if (!['torrent-start', 'torrent-stop'].includes(values.method)) {
        this.invalidate('unsupported-action');
        return undefined;
      }
      data.method = values.method;
    }
    if (Array.isArray(values.ids)) data.ids = values.ids.map((id) => this.redactor.id(id));
    this.openOperations.add(operationId);
    this.event('operation.start', data);
    return operationId;
  }
  end(operationId: number | undefined, kind?: string) {
    if (operationId === undefined) return;
    this.openOperations.delete(operationId);
    this.event('operation.end', {
      operationId,
      outcome: kind ? 'rejected' : 'resolved',
      ...(kind ? { kind } : {}),
    });
  }
  rpc(type: string, data: Record<string, any>) {
    if (!this.active) return;
    const requestId = data.requestId as string;
    try {
      if (type === 'rpc.start') {
        if (!supportedMethods.has(data.method)) {
          this.invalidate('unsupported-method');
          return;
        }
        this.pending.add(requestId);
        this.calls.set(requestId, { method: data.method, tag: data.tag });
        this.event(type, {
          requestId,
          method: data.method,
          arguments: this.redactor.args(data.method, data.arguments),
          context: data.context ?? 'default',
          ...(data.operationId !== undefined ? { operationId: data.operationId } : {}),
          timeoutMs: data.timeoutMs,
        });
      } else if (type === 'rpc.response') {
        const call = this.calls.get(requestId);
        if (!call) {
          this.invalidate('missing-request');
          return;
        }
        this.event(type, {
          requestId,
          attempt: data.attempt,
          envelope: data.invalidJson
            ? undefined
            : data.envelope && typeof data.envelope === 'object'
              ? this.redactor.response(call.method, data.envelope, call.tag)
              : null,
          invalidJson: !!data.invalidJson,
        });
      } else if (type === 'rpc.attempt') {
        this.event(type, {
          requestId,
          attempt: data.attempt,
          status: data.status,
          challenge: !!data.challenge,
        });
      } else if (type === 'rpc.error') {
        this.event(type, { requestId, kind: data.kind });
      } else if (type === 'rpc.end') {
        this.pending.delete(requestId);
        this.event(type, { requestId });
      }
    } catch {
      this.invalidate('coverage-gap');
    }
  }
  projection(input: Record<string, any>) {
    return {
      torrents: input.torrents.map((row: Record<string, unknown>) => {
        const safe = this.redactor.torrent(row);
        return {
          id: safe.id,
          hashString: safe.hashString,
          status: safe.status,
          error: safe.error,
          percentDone: safe.percentDone,
          haveValid: safe.haveValid,
        };
      }),
      selectedId: input.selectedId === null ? null : this.redactor.id(input.selectedId),
      stale: input.stale,
      generation: input.generation,
      ready: input.ready,
      authenticationRequired: input.authenticationRequired,
      results: input.results.map((item: Record<string, any>) => ({
        id: this.redactor.id(item.id),
        status: item.status,
      })),
      detailId: input.detailId === null ? null : this.redactor.id(input.detailId),
    };
  }
  info() {
    return {
      events: this.packet?.events.length ?? 0,
      bytes: this.bytes,
      remainingSeconds: this.active
        ? Math.max(0, Math.ceil((300000 - (performance.now() - this.startTime)) / 1000))
        : 0,
    };
  }
  async stop(observed: Record<string, any>) {
    if (!this.packet) throw new Error('no-capture');
    if (this.active) {
      if (this.pending.size || this.openOperations.size)
        this.packet.capture.reasons.push('pending-work');
      this.event('capture.stop', {});
      const projection = this.projection(observed);
      if (this.bytes + size(projection) + 4096 > 10 * 1024 * 1024)
        this.packet.capture.reasons.push('final-state-oversize');
      else this.packet.observed = projection;
      this.packet.capture.end = new Date().toISOString();
      this.active = false;
      clearTimeout(this.timer);
    }
    if (!this.packet.capture.reasons.length) {
      try {
        validateCapture(this.packet);
      } catch {
        this.packet.capture.reasons.push('schema-coverage-gap');
      }
    }
    this.packet.capture.complete = this.packet.capture.reasons.length === 0;
    this.packet.capture.eligibility = this.packet.capture.complete ? 'replayable' : 'ineligible';
    try {
      this.packet = await seal(this.packet);
    } catch {
      this.packet.capture.complete = false;
      this.packet.capture.eligibility = 'ineligible';
      this.packet.capture.reasons.push('integrity-unavailable');
    }
    return structuredClone(this.packet);
  }
}
export const capture = new CaptureRecorder();

export async function parseCapture(
  raw: string,
  expectedBuild: string,
  candidate = false,
): Promise<CapturePackage> {
  if (new TextEncoder().encode(raw).length > 12 * 1024 * 1024) throw new Error('import-oversize');
  const input = JSON.parse(raw);
  function inspect(value: unknown, depth = 0) {
    if (depth > 32) throw new Error('import-depth');
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('unsafe-key');
        inspect(child, depth + 1);
      }
  }
  inspect(input);
  if (
    input.schemaVersion !== 1 ||
    input.capture?.mode !== 'enhanced' ||
    !input.capture.complete ||
    input.capture.eligibility !== 'replayable' ||
    input.capture.reasons?.length ||
    !input.checkpoint ||
    !Array.isArray(input.events) ||
    !Array.isArray(input.checkpoint.torrents) ||
    !input.observed ||
    !input.integrity?.digest
  )
    throw new Error('ineligible-capture');
  if (!candidate && input.app?.buildId !== expectedBuild) throw new Error('build-mismatch');
  if (
    input.events.some(
      (event: CaptureEvent, index: number) =>
        event.seq !== index + 1 ||
        !Number.isFinite(event.monoMs) ||
        event.monoMs < 0 ||
        (index > 0 && event.monoMs < input.events[index - 1].monoMs),
    )
  )
    throw new Error('event-sequence');
  const sealed = await seal(input);
  if (sealed.integrity?.digest !== input.integrity.digest) throw new Error('integrity-mismatch');
  validateCapture(input);
  return input;
}
