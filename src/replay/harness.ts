import { createApp, h, nextTick } from 'vue';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { i18n } from '../i18n';
import { diagnostics } from '../services/diagnostics/recorder';
import '../style.css';
import '../themes.css';
import '../visual-themes.css';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';
import { capture, parseCapture, buildId, seal } from '../services/diagnostics/capture';
import { createCaptureTransport } from '../services/diagnostics/player';
import { RpcError } from '../services/rpc';
import { canonical } from '../services/diagnostics/replay';
import type { CapturePackage } from '../services/diagnostics/protocol';

const pinia = createPinia();
setActivePinia(pinia);
const app = useAppStore();
let replay: ReturnType<typeof createCaptureTransport> | undefined;
let packet: CapturePackage;
let pending = 0;
let domainExpected: Record<string, unknown> | undefined;
const errors: string[] = [];
const completedOperations = new Set<number>();
function output(value: unknown) {
  document.getElementById('result')!.textContent = JSON.stringify(value, null, 2);
}
async function action(data: Record<string, any>) {
  if (data.action === 'refresh') await app.refresh(data.full);
  else if (data.action === 'select') app.select(data.id);
  else if (data.action === 'execute') await app.execute(data.method, app.targets(data.ids));
  else if (data.action === 'detail') await app.loadDetail('general');
  else if (data.action === 'connect') await app.connect();
  else throw new Error('Unsupported action');
}
window.__replay = {
  buildId: buildId(),
  seal,
  async initialize(autoRefresh = false) {
    await app.initialize({
      rpcUrl: new URL('/rpc', location.href).href,
      defaultLocale: 'en',
      refreshIntervalMs: 5000,
    });
    await app.updateUi({ autoRefresh });
  },
  async renderWorkspace() {
    const { default: Workspace } = await import('../components/Workspace.vue');
    const element = document.createElement('div');
    document.body.appendChild(element);
    createApp({
      render: () =>
        h(NConfigProvider, null, {
          default: () => h(NMessageProvider, null, { default: () => h(Workspace) }),
        }),
    })
      .use(pinia)
      .use(i18n)
      .mount(element);
    await nextTick();
  },
  async measure(enabled: boolean, iterations: number) {
    diagnostics.enabled = enabled;
    const refresh: number[] = [],
      interaction: number[] = [];
    for (let index = 0; index < iterations; index++) {
      let start = performance.now();
      await app.refresh(true);
      await nextTick();
      refresh.push(performance.now() - start);
      start = performance.now();
      (
        document.querySelector('.torrent-table .column-sort') ??
        document.querySelector('.workspace button')
      )?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await nextTick();
      interaction.push(performance.now() - start);
    }
    return { refresh, interaction };
  },
  async start() {
    await app.startCapture();
  },
  action,
  async stop() {
    return capture.stop(app.diagnosticState());
  },
  state() {
    return JSON.parse(JSON.stringify(app.diagnosticState()));
  },
  async prepare(raw: string, candidate = false, expected?: Record<string, unknown>) {
    packet = await parseCapture(raw, buildId(), candidate);
    if (candidate && !expected) throw new Error('candidate-requires-domain-assertion');
    domainExpected = expected;
    return {
      wallTime: packet.checkpoint.wallTime,
      duration: packet.events.at(-1)?.monoMs ?? 0,
      barriers: packet.events
        .filter((event) => ['rpc.end', 'operation.end'].includes(event.type))
        .map((event) => ({
          at: event.monoMs,
          seq: event.seq,
          operationId: event.type === 'operation.end' ? event.data.operationId : undefined,
        })),
    };
  },
  arm() {
    replay = createCaptureTransport(packet);
    app.restoreDiagnosticCheckpoint(
      packet.checkpoint,
      replay.transport,
      replay.observe,
      packet.events.at(-1)?.monoMs,
    );
    const starts = packet.events.filter((event) => event.type === 'operation.start');
    completedOperations.clear();
    const completions = new Map<number, Promise<void>>();
    for (const event of starts) {
      let finish!: () => void;
      completions.set(
        event.data.operationId,
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const dependencies = packet.events
        .filter((item) => item.type === 'operation.end' && item.seq < event.seq)
        .map((item) => completions.get(item.data.operationId))
        .filter(Boolean);
      const expectedEnd = packet.events.find(
        (item) => item.type === 'operation.end' && item.data.operationId === event.data.operationId,
      );
      setTimeout(() => {
        pending++;
        void Promise.all(dependencies)
          .then(() => action(event.data))
          .then(
            () => {
              if (expectedEnd?.data.outcome === 'rejected')
                errors.push(`operation-resolution:${event.data.operationId}`);
            },
            (error) => {
              const kind = error instanceof RpcError ? error.kind : 'unknown';
              if (expectedEnd?.data.outcome !== 'rejected' || expectedEnd?.data.kind !== kind)
                errors.push(`operation-rejection:${event.data.operationId}:${kind}`);
            },
          )
          .finally(() => {
            pending--;
            completedOperations.add(event.data.operationId);
            finish();
          });
      }, event.monoMs);
    }
  },
  settledAt(barrier: { seq: number; operationId?: number }) {
    return barrier.operationId !== undefined
      ? completedOperations.has(barrier.operationId)
      : !!replay?.hasConsumed(barrier.seq);
  },
  report() {
    if (!replay) throw new Error('Replay not armed');
    const actual = app.diagnosticState();
    const projected = JSON.parse(
      JSON.stringify({
        torrents: actual.torrents.map((row) => ({
          id: row.id,
          hashString: row.hashString,
          status: row.status,
          error: row.error,
          percentDone: row.percentDone,
          haveValid: row.haveValid,
        })),
        selectedId: actual.selectedId,
        stale: actual.stale,
        ready: actual.ready,
        generation: actual.generation,
        authenticationRequired: actual.authenticationRequired,
        results: actual.results.map((item) => ({ id: item.id, status: item.status })),
        detailId: actual.detailId,
      }),
    );
    const expected = domainExpected ?? packet.observed;
    const transport = replay.report();
    const differences = Object.keys(expected).filter(
      (key) => canonical(expected[key]) !== canonical((projected as Record<string, unknown>)[key]),
    );
    const report = {
      sourceObserved: packet.observed,
      candidate: !!domainExpected,
      sourceBuildId: packet.app.buildId,
      targetBuildId: buildId(),
      differences,
      errors,
      pending,
      ...transport,
      actual: projected,
      expected,
    };
    if (differences.length || pending || errors.length) report.result = 'diverged';
    output(report);
    return report;
  },
};
