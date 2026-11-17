import { openDB } from 'idb';
import { capture, seal } from './capture';
import type { CapturePackage } from './protocol';
import { version } from '../../../package.json';

export interface DiagnosticEvent {
  seq: number;
  at: string;
  monoMs: number;
  type: string;
  level: 'info' | 'warn' | 'error';
  data: Record<string, unknown>;
}
export interface DiagnosticPackage {
  schemaVersion: 1;
  app: { version: string; buildId: string };
  capture: {
    id: string;
    sessionId: string;
    mode: 'diagnostic' | 'fault';
    eligibility: 'diagnostic-only';
    droppedEvents: number;
    start: string;
    end: string;
    complete: boolean;
    reasons: string[];
  };
  environment: Record<string, unknown>;
  checkpoint: null;
  observed: null;
  privacy: { version: number; transforms: string[]; losses: string[] };
  integrity?: { algorithm: 'SHA-256'; digest: string };
  events: DiagnosticEvent[];
}
const encoder = new TextEncoder();
const byteLength = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/** Only schema-owned scalar metadata enters storage. Free text is deliberately excluded. */
export function safeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const keys = new Set([
    'method',
    'requestId',
    'attempt',
    'status',
    'durationMs',
    'kind',
    'count',
    'generation',
    'full',
    'hidden',
    'online',
    'phase',
    'reason',
    'line',
    'column',
    'operationId',
    'action',
    'errorId',
    'source',
    'name',
  ]);
  const tokens = /^[a-zA-Z0-9_.:-]{1,80}$/;
  const result = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        keys.has(key) &&
        (typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' && tokens.test(value))),
    ),
  );
  if (Array.isArray(input.frames))
    result.frames = input.frames
      .slice(0, 30)
      .filter(
        (frame) =>
          frame &&
          typeof frame === 'object' &&
          /^assets\/[a-zA-Z0-9_.-]+\.js$/.test(frame.file) &&
          Number.isInteger(frame.line) &&
          Number.isInteger(frame.column),
      )
      .map((frame) => ({
        file: frame.file,
        line: frame.line,
        column: frame.column,
      }));
  return result;
}

export class DiagnosticRecorder {
  events: DiagnosticEvent[] = [];
  droppedEvents = 0;
  enabled = true;
  persistent = false;
  readonly id =
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private daemon: Record<string, unknown> = {};
  server(session: Record<string, unknown>) {
    this.daemon = {
      daemonVersion:
        typeof session.version === 'string' ? session.version.slice(0, 100) : undefined,
      rpcVersion: typeof session['rpc-version'] === 'number' ? session['rpc-version'] : undefined,
    };
  }
  private errorSequence = 0;
  private seenErrors = new WeakSet<object>();
  private instanceId = 'startup';
  private seq = 0;
  private bytes = 0;
  private sizes: number[] = [];
  private start = performance.now();
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private maintenance?: ReturnType<typeof setInterval>;
  private flushing = false;
  private queue: Promise<void> = Promise.resolve();
  private fault?: {
    events: DiagnosticEvent[];
    remaining: number;
    timer: ReturnType<typeof setTimeout>;
  };
  private faultCopies: DiagnosticPackage[] = [];
  private memoryCaptures: CapturePackage[] = [];
  private lastPersist = 0;
  private db?: Awaited<ReturnType<typeof openDB>>;

  async initialize(endpoint = location.origin + location.pathname) {
    try {
      this.db?.close();
      clearInterval(this.maintenance);
      this.db = await openDB('transmission-web-ui-diagnostics', 1, {
        upgrade(db) {
          for (const name of ['instances', 'sessions', 'captures']) db.createObjectStore(name);
        },
      });
      const instanceTransaction = this.db.transaction('instances', 'readwrite');
      const known = await instanceTransaction.store.get(endpoint);
      this.instanceId = known ?? globalThis.crypto?.randomUUID?.() ?? this.id;
      if (!known) await instanceTransaction.store.put(this.instanceId, endpoint);
      await instanceTransaction.done;
      this.persistent = true;
      const preference = await this.db.get('instances', `preference:${this.instanceId}`);
      this.enabled = preference?.enabled !== false;
      await this.cleanup(true);
      this.maintenance = setInterval(() => {
        void this.cleanup().catch(() => {
          this.persistent = false;
        });
      }, 300000);
    } catch {
      this.persistent = false;
      this.record('storage.degraded', { reason: 'unavailable' });
    }
  }
  exception(source: string, error: unknown) {
    if (error && typeof error === 'object') {
      if (this.seenErrors.has(error)) return;
      this.seenErrors.add(error);
    }
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const frames = [...stack.slice(0, 16384).matchAll(/(assets\/[a-zA-Z0-9_.-]+\.js):(\d+):(\d+)/g)]
      .slice(0, 30)
      .map((match) => ({ file: match[1], line: Number(match[2]), column: Number(match[3]) }));
    const name =
      error instanceof Error &&
      ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'RpcError'].includes(
        error.name,
      )
        ? error.name
        : 'Error';
    this.record('runtime.error', {
      source,
      name,
      errorId: `error-${++this.errorSequence}`,
      frames,
    });
  }
  record(type: string, data: Record<string, unknown> = {}) {
    if (!this.enabled || !/^[a-z.]{1,48}$/.test(type)) return;
    try {
      const event: DiagnosticEvent = {
        seq: ++this.seq,
        at: new Date().toISOString(),
        monoMs: performance.now() - this.start,
        type,
        level: type.endsWith('.error') ? (data.kind === 'cancelled' ? 'info' : 'warn') : 'info',
        data: safeMetadata(data),
      };
      this.events.push(event);
      if (this.fault) {
        this.fault.events.push(event);
        if (--this.fault.remaining <= 0) void this.finishFault();
      } else if (
        (type.endsWith('.error') && data.kind !== 'cancelled') ||
        type.endsWith('.failure') ||
        type === 'runtime.rejection'
      ) {
        this.fault = {
          events: this.events.slice(-101),
          remaining: 20,
          timer: setTimeout(() => {
            void this.finishFault();
          }, 5000),
        };
      }
      const size = byteLength(event) + 1;
      this.sizes.push(size);
      this.bytes += size;
      const cutoff = Date.now() - 1800000;
      while (
        this.events.length > 1000 ||
        this.bytes > 2 * 1024 * 1024 ||
        Date.parse(this.events[0]?.at ?? '') < cutoff
      ) {
        this.events.shift();
        this.bytes -= this.sizes.shift() ?? 0;
        this.droppedEvents++;
      }
      if (this.seq % 50 === 0 && performance.now() - this.lastPersist >= 1000) void this.flush();
      if (!this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.flush();
        }, 1000);
    } catch {
      /* Diagnostics must never interrupt business operations. */
    }
  }
  info() {
    return {
      count: this.events.length,
      bytes: this.bytes,
      dropped: this.droppedEvents,
      start: this.events[0]?.at ?? '',
      end: this.events.at(-1)?.at ?? '',
    };
  }
  export(): DiagnosticPackage {
    return {
      schemaVersion: 1,
      app: { version, buildId: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'development' },
      capture: {
        id: this.id,
        sessionId: this.id,
        mode: 'diagnostic',
        eligibility: 'diagnostic-only',
        droppedEvents: this.droppedEvents,
        start: this.events[0]?.at ?? new Date().toISOString(),
        end: this.events.at(-1)?.at ?? new Date().toISOString(),
        complete: false,
        reasons: ['summary-only'],
      },
      environment:
        typeof navigator === 'undefined'
          ? {}
          : {
              ...this.daemon,
              uiLanguage:
                typeof document === 'undefined' ? undefined : document.documentElement.lang,
              online: navigator.onLine,
              indexedDB: typeof indexedDB !== 'undefined',
              userAgent: navigator.userAgent.slice(0, 512),
              language: navigator.language,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              width: globalThis.innerWidth,
              height: globalThis.innerHeight,
              dpr: globalThis.devicePixelRatio,
            },
      checkpoint: null,
      observed: null,
      privacy: {
        version: 1,
        transforms: ['metadata-whitelist'],
        losses: ['payloads-not-collected'],
      },
      events: structuredClone(this.events),
    };
  }
  flush() {
    if (this.flushing) return this.queue;
    this.flushing = true;
    this.lastPersist = performance.now();
    const epoch = this.epoch;
    const snapshot = this.export();
    this.queue = this.queue
      .then(async () => {
        if (!this.db || epoch !== this.epoch) return;
        try {
          await this.persist('sessions', this.id, snapshot);
          if (capture.active && capture.packet) await this.saveCapture(capture.packet);
          else await this.cleanup();
        } catch {
          this.persistent = false;
        }
      })
      .catch(() => {
        this.persistent = false;
      })
      .finally(() => {
        this.flushing = false;
      });
    return this.queue;
  }
  async saveCapture(packet: CapturePackage) {
    this.memoryCaptures = [
      ...this.memoryCaptures.filter((item) => item.capture.id !== packet.capture.id),
      structuredClone(packet),
    ].slice(-1);
    try {
      await this.persist('captures', packet.capture.id, packet);
      await this.cleanup();
    } catch {
      this.persistent = false;
    }
  }
  async savedCaptures(): Promise<CapturePackage[]> {
    try {
      const rows = await this.db?.getAll('captures');
      return (rows ?? [])
        .filter(
          (row) => row.instanceId === this.instanceId && row.package.capture.mode === 'enhanced',
        )
        .map((row) => row.package)
        .concat(
          this.memoryCaptures.filter(
            (item) => !(rows ?? []).some((row) => row.package.capture.id === item.capture.id),
          ),
        );
    } catch {
      return structuredClone(this.memoryCaptures);
    }
  }
  async previous(): Promise<DiagnosticPackage[]> {
    try {
      const rows = await this.db?.getAll('sessions');
      return (rows ?? [])
        .filter((row) => row.instanceId === this.instanceId && row.package.capture.id !== this.id)
        .map((row) => row.package);
    } catch {
      return [];
    }
  }
  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) capture.invalidate('recording-disabled');
    try {
      await this.db?.put('instances', { enabled }, `preference:${this.instanceId}`);
    } catch {
      this.persistent = false;
    }
  }
  async exportPackage() {
    try {
      return await seal(this.export());
    } catch {
      return this.export();
    }
  }
  async finishFault() {
    const fault = this.fault;
    if (!fault) return;
    clearTimeout(fault.timer);
    this.fault = undefined;
    const packet = this.export();
    packet.events = structuredClone(fault.events);
    packet.capture = {
      ...packet.capture,
      id: globalThis.crypto?.randomUUID?.() ?? `fault-${Date.now()}-${this.seq}`,
      mode: 'fault',
      start: fault.events[0]?.at ?? packet.capture.start,
    };
    while (byteLength(packet) > 256 * 1024 && packet.events.length > 1) packet.events.shift();
    this.faultCopies = [...this.faultCopies, packet].slice(-3);
    try {
      await this.persist('captures', packet.capture.id, packet);
      await this.cleanup();
    } catch {
      this.persistent = false;
    }
  }
  async faults(): Promise<DiagnosticPackage[]> {
    try {
      const rows = await this.db?.getAll('captures');
      return (rows ?? [])
        .filter((row) => row.instanceId === this.instanceId && row.package.capture.mode === 'fault')
        .map((row) => row.package)
        .concat(
          this.faultCopies.filter(
            (item) => !(rows ?? []).some((row) => row.package.capture.id === item.capture.id),
          ),
        )
        .sort(
          (a, b) =>
            a.capture.end.localeCompare(b.capture.end) ||
            (a.events.at(-1)?.seq ?? 0) - (b.events.at(-1)?.seq ?? 0),
        )
        .slice(-3);
    } catch {
      return structuredClone(this.faultCopies);
    }
  }
  private async persist(
    store: 'sessions' | 'captures',
    key: string,
    packet: DiagnosticPackage | CapturePackage,
  ) {
    if (!this.db) return;
    const metadata = {
      store,
      key,
      instanceId: this.instanceId,
      updatedAt: Date.now(),
      mode: packet.capture.mode,
      bytes: byteLength(packet) + 512,
    };
    const tx = this.db.transaction([store, 'instances'], 'readwrite');
    await tx
      .objectStore(store)
      .put({ updatedAt: metadata.updatedAt, instanceId: this.instanceId, package: packet }, key);
    await tx.objectStore('instances').put(metadata, `@log:${store}:${key}`);
    await tx.done;
  }
  async cleanup(reindex = false) {
    if (!this.db) return;
    const tx = this.db.transaction(['instances', 'sessions', 'captures'], 'readwrite');
    const index = tx.objectStore('instances');
    // Repair provisional v1 records once at initialization, never scan payloads on the hot path.
    if (reindex)
      for (const store of ['sessions', 'captures'] as const) {
        let cursor = await tx.objectStore(store).openCursor();
        while (cursor) {
          const key = `@log:${store}:${cursor.key}`;
          if (!(await index.get(key)))
            await index.put(
              {
                store,
                key: cursor.key,
                instanceId: cursor.value.instanceId,
                updatedAt: cursor.value.updatedAt,
                mode: cursor.value.package.capture.mode,
                bytes: byteLength(cursor.value.package) + 512,
              },
              key,
            );
          cursor = await cursor.continue();
        }
      }
    const rows = await index.getAll(IDBKeyRange.bound('@log:', '@log:\uffff'));
    const all = rows.sort((a, b) => a.updatedAt - b.updatedAt);
    let total = all.reduce((sum, item) => sum + item.bytes, 0);
    const bytes = new Map<string, number>(),
      faults = new Map<string, number>();
    for (const item of all) {
      bytes.set(item.instanceId, (bytes.get(item.instanceId) ?? 0) + item.bytes);
      if (item.mode === 'fault')
        faults.set(item.instanceId, (faults.get(item.instanceId) ?? 0) + 1);
    }
    for (const item of all) {
      const expired =
        Date.now() - item.updatedAt > (item.store === 'sessions' ? 86400000 : 604800000);
      if (
        expired ||
        total > 40 * 1024 * 1024 ||
        (bytes.get(item.instanceId) ?? 0) > 20 * 1024 * 1024 ||
        (item.mode === 'fault' && (faults.get(item.instanceId) ?? 0) > 3)
      ) {
        await tx.objectStore(item.store).delete(item.key);
        await index.delete(`@log:${item.store}:${item.key}`);
        total -= item.bytes;
        bytes.set(item.instanceId, bytes.get(item.instanceId)! - item.bytes);
        if (item.mode === 'fault') faults.set(item.instanceId, faults.get(item.instanceId)! - 1);
      }
    }
    await tx.done;
  }
  async clear() {
    this.epoch++;
    clearTimeout(this.fault?.timer);
    this.fault = undefined;
    this.faultCopies = [];
    this.memoryCaptures = [];
    this.events = [];
    this.sizes = [];
    this.bytes = 0;
    this.droppedEvents = 0;
    await this.queue;
    try {
      if (this.db) {
        const tx = this.db.transaction(['instances', 'sessions', 'captures'], 'readwrite');
        for (const store of [tx.objectStore('sessions'), tx.objectStore('captures')]) {
          let cursor = await store.openCursor();
          while (cursor) {
            if (cursor.value.instanceId === this.instanceId) {
              await tx.objectStore('instances').delete(`@log:${store.name}:${cursor.key}`);
              await cursor.delete();
            }
            cursor = await cursor.continue();
          }
        }
        await tx.done;
      }
    } catch {
      this.persistent = false;
    }
  }
}
export const diagnostics = new DiagnosticRecorder();

export function downloadDiagnostics(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `transmission-web-ui-${version}-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
