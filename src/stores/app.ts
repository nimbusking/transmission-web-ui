import { readLoginSession, saveLoginSession } from '../services/login-session';
import { capture, type Checkpoint } from '../services/diagnostics/capture';
import { diagnostics } from '../services/diagnostics/recorder';
import {
  LIMIT_FIELDS,
  limitPatch,
  limitMatches,
  type LimitIntent,
  type LimitBaseline,
} from '../domain/limits';
import {
  trackerCapabilities,
  trackerSnapshot,
  sameTrackers,
  trackerPatch,
  type TrackerEdit,
} from '../domain/tracker-edit';
import { nonnegativeNumber } from '../domain/status';
import type { SessionStatistics } from '../domain/navigation';
import { defineStore } from 'pinia';
import { computed, ref, shallowReactive, shallowRef } from 'vue';
import type {
  Session,
  Settings,
  Torrent,
  TorrentTarget,
  DetailSection,
  UiSettings,
  SettingsSection,
  ItemResult,
  BatchResult,
  MatchJob,
  Label,
  MigrationReport,
  Tracker,
} from '../domain/types';
import {
  applyDelta,
  BASE_FIELDS,
  defaultSettings,
  DYNAMIC_FIELDS,
  errorMessage,
  normalizeTorrent,
  SUMMARY_FIELDS,
} from '../domain/torrents';
import { RpcClient, RpcError, isUnknownOutcome, reconciliationInterval } from '../services/rpc';
import { SettingsRepository, readLegacy, normalizeFolders } from '../services/settings';
import type { RuntimeConfig } from '../services/config';
import { runBatch } from '../services/batch';
import { validateSessionPatch } from '../services/session-fields';
import { setLanguage } from '../i18n';

const targetRevision = Symbol('observed-task-lifecycle');
type CapturedTarget = TorrentTarget & { [targetRevision]?: number };
const allowedMethods = new Set([
  'torrent-start',
  'torrent-start-now',
  'torrent-stop',
  'torrent-verify',
  'torrent-reannounce',
  'torrent-remove',
  'torrent-rename-path',
  'torrent-set-location',
  'torrent-set',
  'queue-move-top',
  'queue-move-up',
  'queue-move-down',
  'queue-move-bottom',
]);
export const useAppStore = defineStore('application', () => {
  const settings = shallowRef<Settings>(defaultSettings()),
    session = shallowRef<Session>(),
    stats = shallowRef<SessionStatistics>({});
  const freeSpace = shallowRef<{ path: string; bytes?: number; error?: string }>({ path: '' });
  const byId = shallowReactive(new Map<number, Torrent>()),
    generation = ref(0),
    ready = ref(false),
    connecting = ref(false),
    refreshing = ref(false);
  const authenticationRequired = ref(false);
  const authenticationFailed = ref(false);
  const error = ref(''),
    stale = ref(false),
    lastUpdated = ref(0),
    storageAvailable = ref(true);
  const selectedId = ref<number | null>(null),
    checkedTargets = shallowRef<TorrentTarget[]>([]),
    selectedTarget = shallowRef<TorrentTarget>(),
    detailSection = ref<DetailSection>('general'),
    detail = shallowRef<Torrent>(),
    detailLoading = ref(false),
    detailError = ref('');
  const operationResults = shallowRef<ItemResult[]>([]),
    operationBusy = ref(false),
    config = shallowRef<RuntimeConfig>();
  const repository = shallowRef<SettingsRepository>(),
    matchJob = shallowRef<MatchJob>();
  let rpc: RpcClient,
    controller = new AbortController(),
    detailController: AbortController | undefined;
  let refreshTask: Promise<void> | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    replayDeadline = Infinity,
    timerDue = 0,
    lastSnapshot = 0,
    lastSession = 0,
    detailSequence = 0;
  let operationController: AbortController | undefined;
  let operationToken: symbol | undefined;
  let replayStateObserver: ((type: string, data: Record<string, unknown>) => void) | undefined;
  function recordDiscard(epoch: number, reason = 'generation') {
    const data = { generation: epoch, reason };
    diagnostics.record('state.discard', data);
    capture.event('state.discard', data);
    replayStateObserver?.('state.discard', data);
  }
  function obsolete(epoch: number) {
    if (epoch === generation.value) return false;
    recordDiscard(epoch);
    return true;
  }
  let diagnosticOperation = 0;
  function beginDiagnosticOperation(action: string, values: Record<string, unknown> = {}) {
    const operationId = ++diagnosticOperation;
    diagnostics.record('operation.start', {
      operationId,
      action,
      count: Array.isArray(values.ids) ? values.ids.length : undefined,
    });
    capture.begin(action, values, operationId);
    return operationId;
  }
  function endDiagnosticOperation(operationId: number | undefined, kind?: string) {
    if (operationId !== undefined) diagnostics.record('operation.end', { operationId, kind });
    capture.end(operationId, kind);
  }
  const trackerCapability = computed(() => trackerCapabilities(session.value, generation.value));
  function acquireOperation() {
    if (operationBusy.value) throw new Error('Another batch is active');
    const token = Symbol('operation');
    operationToken = token;
    operationController = new AbortController();
    operationBusy.value = true;
    operationResults.value = [];
    return { token, signal: operationController.signal, epoch: generation.value };
  }
  function releaseOperation(token: symbol) {
    if (operationToken !== token) return;
    operationBusy.value = false;
    operationController = undefined;
    operationToken = undefined;
  }
  function assertOperation(lock: ReturnType<typeof acquireOperation>) {
    if (operationToken !== lock.token || generation.value !== lock.epoch || lock.signal.aborted)
      throw new RpcError('cancelled', 'Operation cancelled; reconcile before retrying');
  }

  let pendingFull = false,
    disposed = false;
  const identityVersions = new Map<number, number>();
  const torrents = computed(() => Array.from(byId.values()));
  const current = computed(() =>
    selectedId.value === null ? undefined : byId.get(selectedId.value),
  );
  const checkedIds = computed({
    get: () => checkedTargets.value.filter(isTargetCurrent).map((target) => target.id),
    set: (ids: number[]) => setCheckedIds(ids),
  });
  function isTargetCurrent(target: TorrentTarget) {
    return (
      target.generation === generation.value &&
      ((target as CapturedTarget)[targetRevision] === undefined ||
        (target as CapturedTarget)[targetRevision] === (identityVersions.get(target.id) ?? 0)) &&
      !!target.hashString &&
      byId.get(target.id)?.hashString === target.hashString
    );
  }
  function captureTarget(id: number): CapturedTarget {
    const hashString = byId.get(id)?.hashString;
    if (!hashString) throw new Error(`Task identity unavailable: ${id}`);
    return {
      id,
      hashString,
      generation: generation.value,
      [targetRevision]: identityVersions.get(id) ?? 0,
    };
  }
  function observeIdentities(items: Torrent[], removed: number[] = [], snapshot = false) {
    const incoming = new Map(items.map((row) => [row.id, row.hashString]));
    const gone = new Set(removed);
    for (const [id, row] of byId)
      if (
        gone.has(id) ||
        (snapshot && !incoming.has(id)) ||
        (incoming.has(id) && incoming.get(id) !== row.hashString)
      )
        identityVersions.set(id, (identityVersions.get(id) ?? 0) + 1);
  }
  function setCheckedIds(ids: number[]) {
    const previous = new Map(checkedTargets.value.map((target) => [target.id, target]));
    checkedTargets.value = [...new Set(ids)].flatMap((id) => {
      const old = previous.get(id);
      if (old) return isTargetCurrent(old) ? [old] : [];
      const hashString = byId.get(id)?.hashString;
      return ready.value && hashString ? [captureTarget(id)] : [];
    });
  }
  function clearChecked() {
    checkedTargets.value = [];
  }
  function toggleChecked(id: number, checked: boolean) {
    setCheckedIds(checked ? [...checkedIds.value, id] : checkedIds.value.filter((x) => x !== id));
  }
  function captureCheckedTargets() {
    const captured = checkedTargets.value.map((target) => ({ ...target }));
    validateTargets(captured);
    return captured;
  }
  function reconcileIdentities() {
    checkedTargets.value = checkedTargets.value.filter(isTargetCurrent);
    if (selectedTarget.value && !isTargetCurrent(selectedTarget.value)) select(null, 'internal');
  }
  function detailTarget(): TorrentTarget {
    const target = selectedTarget.value;
    if (!target || !detail.value || detail.value.hashString !== target.hashString)
      throw new Error('Task identity unavailable');
    validateTargets([target]);
    return { ...target };
  }
  async function initialize(runtime: RuntimeConfig, autoConnect = true) {
    // Diagnostic storage must not delay restoration of the application session.
    void diagnostics.initialize(runtime.rpcUrl);
    const savedLogin = readLoginSession(runtime.rpcUrl);
    disposed = false;
    authenticationRequired.value = !autoConnect && !savedLogin;
    config.value = runtime;
    rpc = new RpcClient(runtime.rpcUrl, undefined, (type, data) => {
      diagnostics.record(type, data);
      capture.rpc(type, data);
    });
    const endpoint = new URL(runtime.rpcUrl),
      instanceKey = `${endpoint.origin}${endpoint.pathname}`;
    const defaults = defaultSettings();
    defaults.ui.locale = runtime.defaultLocale;
    defaults.ui.refreshIntervalMs = runtime.refreshIntervalMs;
    const repo = new SettingsRepository(instanceKey, defaults);
    repository.value = repo;
    settings.value = await repo.init();
    storageAvailable.value = repo.persistent;
    await setLanguage(new URLSearchParams(location.search).get('lang') || settings.value.ui.locale);
    repo.onChange = async () => {
      capture.invalidate('external-change');
      settings.value = await repo.load();
      await setLanguage(settings.value.ui.locale);
      schedule();
    };
    const previous = await repo.loadJob();
    if (previous) {
      previous.running = false;
      for (const item of previous.items)
        if (
          ['planned', 'locating', 'verifying', 'waiting', 'evaluating', 'restoring'].includes(
            item.phase,
          )
        )
          item.phase = 'interrupted';
      matchJob.value = previous;
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    if (savedLogin) await connect(savedLogin.username, savedLogin.password, 'internal');
    else if (autoConnect) await connect();
  }
  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function schedule(remaining?: number) {
    stopTimer();
    if (disposed || authenticationRequired.value || !settings.value.ui.autoRefresh) return;
    const delay =
      remaining ?? (document.hidden ? 30000 : Math.max(2000, settings.value.ui.refreshIntervalMs));
    timerDue = Date.now() + delay;
    if (timerDue > replayDeadline) return;
    timer = setTimeout(async () => {
      try {
        await refresh(false, 'timer');
      } catch {
        /* state contains error */
      } finally {
        schedule();
      }
    }, delay);
  }
  function visibilityChanged() {
    if (!disposed && settings.value.ui.autoRefresh && !document.hidden && ready.value)
      void refresh(true, 'visibility').catch(() => {});
    schedule();
  }
  function requestAuthentication() {
    authenticationRequired.value = true;
    ready.value = false;
    stopTimer();
    rpc.clearAuthentication();
    if (config.value) saveLoginSession(config.value.rpcUrl);
  }
  async function connect(username?: string, password?: string, source = 'manual') {
    const captureOperation = source === 'manual' ? beginDiagnosticOperation('connect') : undefined;
    stopTimer();
    controller.abort();
    detailController?.abort();
    controller = new AbortController();
    refreshTask = null;
    generation.value++;
    operationController?.abort();
    if (operationToken) releaseOperation(operationToken);
    stats.value = {};
    session.value = undefined;
    freeSpace.value = { path: '' };
    const epoch = generation.value;
    ready.value = false;
    connecting.value = true;
    error.value = '';
    authenticationFailed.value = false;
    selectedId.value = null;
    clearChecked();
    selectedTarget.value = undefined;
    detail.value = undefined;
    if (username !== undefined) rpc.authenticate(username, password ?? '');
    try {
      const value = await rpc.session({
        signal: controller.signal,
        context: 'session',
        operationId: captureOperation,
      });
      if (obsolete(epoch)) return;
      if (value['rpc-version'] < 16) throw new Error('Transmission 3.00 or newer is required');
      session.value = value;
      diagnostics.server(value);
      lastSession = Date.now();
      lastSnapshot = 0;
      await refresh(true, 'internal', captureOperation);
      if (epoch === generation.value) {
        ready.value = true;
        authenticationRequired.value = false;
        if (username !== undefined && config.value)
          saveLoginSession(config.value.rpcUrl, { username, password: password ?? '' });
      }
    } catch (e) {
      if (epoch === generation.value) {
        error.value = errorMessage(e);
        authenticationFailed.value = e instanceof RpcError && e.kind === 'auth';
        if (authenticationFailed.value) requestAuthentication();
        stale.value = true;
      }
    } finally {
      if (epoch === generation.value) {
        connecting.value = false;
        schedule();
      }
      endDiagnosticOperation(captureOperation);
    }
  }
  async function refreshSnapshot(): Promise<void> {
    // A joined full request may only queue reconciliation; wait for the active
    // chain to settle before capturing the scope of a global operation.
    while (refreshTask) await refreshTask;
    await refresh(true);
  }
  function refresh(full = false, source = 'manual', parentOperation?: number): Promise<void> {
    diagnostics.record('state.refresh', { full, generation: generation.value });
    if (disposed || (authenticationRequired.value && !connecting.value)) return Promise.resolve();
    if (refreshTask) {
      pendingFull ||= full;
      return refreshTask;
    }
    const captureOperation =
      source === 'manual' ? beginDiagnosticOperation('refresh', { full }) : undefined;
    const requestOperation = captureOperation ?? parentOperation;
    let captureFailure: string | undefined;
    const epoch = generation.value;
    // Assigned below: finally compares this promise with the currently active generation.
    let task!: Promise<void>;
    // eslint-disable-next-line prefer-const
    task = (async () => {
      refreshing.value = true;
      try {
        if (Date.now() - lastSession > 30000) {
          const value = await rpc.session({
            signal: controller.signal,
            context: 'session',
            operationId: requestOperation,
          });
          if (obsolete(epoch)) return;
          if (
            session.value?.['session-id'] &&
            value['session-id'] !== session.value['session-id']
          ) {
            void connect(undefined, undefined, 'internal');
            return;
          }
          session.value = value;
          diagnostics.server(value);
          lastSession = Date.now();
        }
        const snapshot =
          full || Date.now() - lastSnapshot >= reconciliationInterval(session.value?.version ?? '');
        const response = await rpc.torrents(
          snapshot ? SUMMARY_FIELDS : DYNAMIC_FIELDS,
          snapshot ? undefined : 'recently-active',
          { signal: controller.signal, context: 'refresh', operationId: requestOperation },
        );
        if (obsolete(epoch)) return;
        if (!Array.isArray(response.torrents))
          throw new RpcError('protocol', 'Missing torrents array');
        observeIdentities(response.torrents, response.removed, snapshot);
        const missing = applyDelta(
          byId,
          response.torrents,
          response.removed,
          snapshot,
          snapshot ? SUMMARY_FIELDS : DYNAMIC_FIELDS,
        );
        reconcileIdentities();
        if (missing.length) {
          const revisions = new Map(missing.map((id) => [id, byId.get(id)]));
          try {
            const base = await rpc.torrents(
              BASE_FIELDS,
              missing.map((id) => byId.get(id)?.hashString || id),
              { signal: controller.signal, context: 'refresh', operationId: requestOperation },
            );
            if (obsolete(epoch)) return;
            applyDelta(
              byId,
              base.torrents.filter(
                (row) =>
                  revisions.has(row.id) &&
                  revisions.get(row.id) === byId.get(row.id) &&
                  (!revisions.get(row.id)?.hashString ||
                    revisions.get(row.id)?.hashString === row.hashString),
              ),
              [],
              false,
              BASE_FIELDS,
            );
          } catch {
            // A missing base row retries on the existing refresh chain only.
            if (obsolete(epoch)) return;
          }
        }
        if (snapshot) lastSnapshot = Date.now();
        reconcileIdentities();
        if (selectedId.value !== null && !byId.has(selectedId.value)) select(null, 'internal');
        const statistics = await rpc.call(
          'session-stats',
          {},
          { signal: controller.signal, context: 'refresh', operationId: requestOperation },
        );
        if (obsolete(epoch)) return;
        stats.value = statistics;
        await refreshFreeSpace(epoch, requestOperation);
        if (obsolete(epoch)) return;
        lastUpdated.value = Date.now();
        stale.value = false;
        error.value = '';
        ready.value = true;
        if (!document.hidden && selectedId.value !== null)
          await loadDetail(detailSection.value, 'internal', requestOperation);
      } catch (e) {
        captureFailure = e instanceof RpcError ? e.kind : 'unknown';
        if (epoch !== generation.value) recordDiscard(epoch);
        if (epoch === generation.value) {
          error.value = errorMessage(e);
          authenticationFailed.value = e instanceof RpcError && e.kind === 'auth';
          if (authenticationFailed.value) requestAuthentication();
          stale.value = true;
        }
        throw e;
      } finally {
        endDiagnosticOperation(captureOperation, captureFailure);
        if (refreshTask === task) {
          refreshing.value = false;
          refreshTask = null;
          if (pendingFull) {
            pendingFull = false;
            queueMicrotask(() => void refresh(true, 'internal').catch(() => {}));
          }
        }
      }
    })();
    refreshTask = task;
    return task;
  }
  async function refreshFreeSpace(epoch: number, operationId?: number) {
    const path = session.value?.['download-dir'];
    if (typeof path !== 'string' || !path) {
      freeSpace.value = { path: '' };
      return;
    }
    if (freeSpace.value.path !== path) freeSpace.value = { path };
    // This read shares the existing refresh lifecycle; a disk query failure must
    // not disconnect an otherwise healthy torrent list and speed snapshot.
    try {
      const result = await rpc.call(
        'free-space',
        { path },
        {
          signal: controller.signal,
          timeoutMs: 5000,
          operationId,
        },
      );
      if (epoch !== generation.value || path !== session.value?.['download-dir']) return;
      freeSpace.value = { path, bytes: nonnegativeNumber(result['size-bytes']) };
    } catch (e) {
      if (epoch !== generation.value || path !== session.value?.['download-dir']) return;
      freeSpace.value = { path, error: errorMessage(e) };
    }
  }
  function select(id: number | null, source = 'manual') {
    const captureOperation =
      source === 'manual' ? beginDiagnosticOperation('select', { id }) : undefined;
    selectedTarget.value = id === null || !byId.get(id)?.hashString ? undefined : captureTarget(id);
    selectedId.value = id;
    detail.value = undefined;
    detailError.value = '';
    detailLoading.value = false;
    detailController?.abort();
    detailSequence++;
    if (id !== null) void loadDetail(detailSection.value, 'internal', captureOperation);
    endDiagnosticOperation(captureOperation);
  }
  async function loadDetail(
    section = detailSection.value,
    source = 'manual',
    parentOperation?: number,
  ) {
    if (section !== 'general') capture.invalidate('unsupported-detail');
    const captureOperation = source === 'manual' ? beginDiagnosticOperation('detail') : undefined;
    const requestOperation = captureOperation ?? parentOperation;
    detailSection.value = section;
    const target = selectedTarget.value;
    const id = selectedId.value,
      epoch = generation.value,
      sequence = ++detailSequence;
    detailController?.abort();
    detailController = new AbortController();
    if (id === null || !target || !isTargetCurrent(target)) {
      endDiagnosticOperation(captureOperation);
      return;
    }
    detailLoading.value = true;
    detailError.value = '';
    const fields: Record<DetailSection, string[]> = {
      general: [
        ...SUMMARY_FIELDS,
        'comment',
        'creator',
        'dateCreated',
        'pieceCount',
        'pieceSize',
        'magnetLink',
        'haveValid',
        'haveUnchecked',
        'pieces',
      ],
      files: ['id', 'files', 'fileStats', 'wanted', 'priorities'],
      trackers: [
        'id',
        'trackers',
        'trackerStats',
        ...(session.value!['rpc-version'] >= 17 ? ['trackerList'] : []),
      ],
      peers: ['id', 'peers', 'peersFrom'],
    };
    try {
      const response = await rpc.torrents(
        [...new Set([...fields[section], 'hashString'])],
        [target.hashString],
        {
          signal: detailController.signal,
          context: 'detail',
          operationId: requestOperation,
        },
      );
      if (
        epoch !== generation.value ||
        sequence !== detailSequence ||
        selectedId.value !== id ||
        !isTargetCurrent(target)
      )
        return;
      const row = response.torrents.find((t) => t.id === id && t.hashString === target.hashString);
      if (row) detail.value = normalizeTorrent(row);
    } catch (e) {
      if (sequence === detailSequence && !(e instanceof RpcError && e.kind === 'cancelled'))
        detailError.value = errorMessage(e);
    } finally {
      if (sequence === detailSequence) detailLoading.value = false;
      endDiagnosticOperation(captureOperation);
    }
  }
  function targets(ids: number[]): TorrentTarget[] {
    if (!ready.value || !ids.length) throw new Error('Select tasks while connected');
    return [...new Set(ids)].map((id) => {
      const torrent = byId.get(id);
      if (!torrent?.hashString) throw new Error(`Task identity unavailable: ${id}`);
      return captureTarget(id);
    });
  }
  function validateTargets(items: TorrentTarget[]) {
    if (!items.length || !ready.value) throw new Error('No valid operation targets');
    for (const item of items)
      if (!isTargetCurrent(item)) throw new Error('Task identity changed; select the tasks again');
  }
  async function command(
    method: string,
    items: TorrentTarget[],
    args: Record<string, unknown> = {},
    workflow = false,
    token?: symbol,
    operationId?: number,
  ) {
    validateTargets(items);
    if (operationBusy.value && token !== operationToken) throw new Error('Another batch is active');
    if (
      !workflow &&
      matchJob.value?.running &&
      items.some((target) =>
        matchJob.value!.items.some((item) => item.target.hashString === target.hashString),
      )
    )
      throw new Error(
        'A directory match is active for this task; cancel and reconcile it before other operations',
      );
    if (!allowedMethods.has(method)) throw new Error(`Unsupported operation: ${method}`);
    if (method === 'torrent-remove' && typeof args['delete-local-data'] !== 'boolean')
      throw new Error('Delete-data must be boolean');
    return rpc.call(
      method,
      { ...args, ids: items.map((x) => x.hashString) },
      { context: 'command', operationId },
    );
  }
  async function execute(
    method: string,
    items: TorrentTarget[],
    args: Record<string, unknown> = {},
  ): Promise<BatchResult> {
    const captureOperation = beginDiagnosticOperation('execute', {
      method,
      ids: items.map((item) => item.id),
    });
    diagnostics.record('operation.start', { method, count: items.length });
    validateTargets(items);
    const lock = acquireOperation();
    try {
      const result = await runBatch(
        items,
        (target) =>
          command(method, [target], args, false, lock.token, captureOperation).then(() => {}),
        (target) => ({ id: target.id, name: byId.get(target.id)?.name ?? String(target.id) }),
        {
          signal: lock.signal,
          concurrency: method === 'torrent-set-location' || method === 'torrent-verify' ? 1 : 3,
          onProgress: (values) => {
            if (operationToken === lock.token) operationResults.value = values;
          },
        },
      );
      await refresh(true, 'internal', captureOperation).catch(() => {});
      return result;
    } finally {
      releaseOperation(lock.token);
      endDiagnosticOperation(captureOperation);
    }
  }
  async function readTarget(target: TorrentTarget, fields: string[]): Promise<Torrent> {
    validateTargets([target]);
    const response = await rpc.torrents(
      [...new Set(['id', 'hashString', ...fields])],
      [target.hashString],
    );
    validateTargets([target]);
    const item = response.torrents[0];
    if (!item || item.id !== target.id || item.hashString !== target.hashString)
      throw new Error('Task no longer exists');
    return normalizeTorrent(item);
  }
  async function saveLimits(baselines: LimitBaseline[], intent: LimitIntent): Promise<BatchResult> {
    capture.invalidate('unsupported-action');
    validateTargets(baselines.map((x) => x.target));
    const lock = acquireOperation();
    try {
      const plans: { target: TorrentTarget; patch: Record<string, unknown> }[] = [];
      // All preflights settle before the first write. A conflict stops the whole batch.
      for (const baseline of baselines) {
        assertOperation(lock);
        const current = await readTarget(baseline.target, LIMIT_FIELDS);
        plans.push({
          target: baseline.target,
          patch: limitPatch(baseline.row, current, intent, session.value),
        });
      }
      validateTargets(baselines.map((x) => x.target));
      const items: ItemResult[] = [];
      for (const plan of plans) {
        const result: ItemResult = {
          id: plan.target.id,
          name: byId.get(plan.target.id)?.name ?? plan.target.hashString,
          status: 'skipped',
        };
        if (lock.signal.aborted || lock.epoch !== generation.value) result.status = 'cancelled';
        else if (!Object.keys(plan.patch).length) result.message = 'No changes needed';
        else {
          let submitted = false;
          try {
            assertOperation(lock);
            await command('torrent-set', [plan.target], plan.patch, false, lock.token);
            submitted = true;
            const actual = await readTarget(plan.target, LIMIT_FIELDS);
            result.status = limitMatches(actual, intent) ? 'success' : 'failed';
            if (result.status === 'failed')
              result.message = 'Saved values do not match; reload before editing';
          } catch (e) {
            result.status = submitted || isUnknownOutcome(e) ? 'unknown' : 'failed';
            result.message =
              result.status === 'unknown'
                ? 'May have been applied; reload to reconcile'
                : errorMessage(e);
          }
        }
        items.push(result);
        if (operationToken === lock.token) operationResults.value = [...items];
      }
      return { items, completedAt: Date.now() };
    } finally {
      releaseOperation(lock.token);
    }
  }
  async function saveTrackerPlan(
    target: TorrentTarget,
    expected: Tracker[],
    replacement: TrackerEdit[],
    lock: ReturnType<typeof acquireOperation>,
  ) {
    capture.invalidate('unsupported-action');
    assertOperation(lock);
    validateTargets([target]);
    const baseline = trackerSnapshot(expected);
    const patch = trackerPatch(baseline, replacement, trackerCapability.value);
    const current = trackerSnapshot((await readTarget(target, ['trackers'])).trackers);
    assertOperation(lock);
    if (!sameTrackers(current, baseline, true))
      throw new Error('Tracker list changed; reload before editing');
    if (!Object.keys(patch).length)
      return { status: 'skipped' as const, message: 'No changes needed' };
    let submitted = false;
    try {
      await command('torrent-set', [target], patch, false, lock.token);
      submitted = true;
      const actual = trackerSnapshot((await readTarget(target, ['trackers'])).trackers);
      if (!sameTrackers(actual, replacement))
        throw new Error('Saved Tracker list does not match; reload before editing');
      return { status: 'success' as const };
    } catch (e) {
      if (submitted && !(e instanceof Error && e.message.startsWith('Saved Tracker')))
        throw new RpcError('timeout', 'May have been applied; reload to reconcile');
      throw e;
    }
  }
  async function updateTrackers(
    target: TorrentTarget,
    expected: Tracker[],
    replacement: TrackerEdit[],
  ) {
    capture.invalidate('unsupported-action');
    const lock = acquireOperation();
    try {
      return await saveTrackerPlan(target, expected, replacement, lock);
    } finally {
      releaseOperation(lock.token);
      if (
        isTargetCurrent(target) &&
        selectedId.value === target.id &&
        detailSection.value === 'trackers'
      )
        await loadDetail('trackers');
    }
  }
  async function addTasks(
    inputs: { name: string; filename?: string; metainfo?: string }[],
    options: { directory: string; paused: boolean; labels: string[]; setDefault: boolean },
  ) {
    capture.invalidate('unsupported-action');
    if (!ready.value) throw new Error('Not connected');
    const lock = acquireOperation();
    try {
      if (options.setDefault) await saveSession({ 'download-dir': options.directory });
      const plan = inputs.filter((x) => x.filename?.trim() || x.metainfo);
      const result = await runBatch(
        plan,
        async (item) => {
          let data: Record<string, any>;
          try {
            data = await rpc.call('torrent-add', {
              ...(item.metainfo
                ? { metainfo: item.metainfo }
                : { filename: item.filename!.trim() }),
              ...(options.directory ? { 'download-dir': options.directory } : {}),
              paused: options.paused,
            });
          } catch (error) {
            if (
              error instanceof RpcError &&
              error.kind === 'business' &&
              error.message.toLowerCase() === 'duplicate torrent'
            )
              return {
                status: 'duplicate' as const,
                message: options.labels.length
                  ? 'The daemon omitted the duplicate identity; local labels were not changed.'
                  : undefined,
              };
            throw error;
          }
          const torrent = data['torrent-added'] || data['torrent-duplicate'];
          if (!torrent?.hashString)
            throw new RpcError('protocol', 'Missing added torrent identity');
          if (options.labels.length) await assignLabels([torrent.hashString], options.labels);
          return {
            status: data['torrent-duplicate'] ? ('duplicate' as const) : ('success' as const),
          };
        },
        (item) => ({ id: item.name, name: item.name }),
        {
          signal: lock.signal,
          concurrency: 3,
          onProgress: (value) => {
            if (operationToken === lock.token) operationResults.value = value;
          },
        },
      );
      await refresh(true, 'internal').catch(() => {});
      return result;
    } finally {
      releaseOperation(lock.token);
    }
  }
  function cancelOperations() {
    operationController?.abort();
  }
  async function replaceTrackersBatch(
    plan: { target: TorrentTarget; name: string; before: Tracker[]; after: Tracker[] }[],
  ) {
    capture.invalidate('unsupported-action');
    const lock = acquireOperation();
    try {
      return await runBatch(
        plan,
        (item) => saveTrackerPlan(item.target, item.before, item.after, lock),
        (item) => ({ id: item.target.id, name: item.name }),
        {
          signal: lock.signal,
          concurrency: 3,
          onProgress: (values) => {
            if (operationToken === lock.token) operationResults.value = values;
          },
        },
      );
    } finally {
      releaseOperation(lock.token);
    }
  }
  async function saveSession(patch: Record<string, unknown>) {
    capture.invalidate('unsupported-action');
    await rpc.call('session-set', validateSessionPatch(patch, session.value!['rpc-version']));
    session.value = await rpc.session();
    lastSession = Date.now();
  }
  async function diagnostic(
    method: 'port-test' | 'free-space' | 'blocklist-update',
    path?: string,
  ) {
    return rpc.call(method, path ? { path } : {}, {
      timeoutMs: method === 'blocklist-update' ? 120000 : 20000,
    });
  }
  async function updateUi(patch: Partial<UiSettings>) {
    capture.invalidate('settings-change');
    settings.value = await repository.value!.updateUi(patch);
    if (patch.locale) await setLanguage(patch.locale);
    schedule();
  }
  async function assignLabels(hashes: string[], ids: string[]) {
    capture.invalidate('unsupported-action');
    settings.value = await repository.value!.update((value) => {
      const valid = new Set(value.labels.map((x) => x.id));
      for (const hash of hashes) value.torrentLabels[hash] = ids.filter((id) => valid.has(id));
      return value;
    });
  }
  async function saveLabel(label: Label) {
    capture.invalidate('unsupported-action');
    settings.value = await repository.value!.update((value) => {
      const index = value.labels.findIndex((item) => item.id === label.id);
      if (index >= 0) value.labels[index] = { ...label };
      else value.labels.push({ ...label });
      return value;
    });
  }
  async function removeLabels(ids: string[]) {
    capture.invalidate('unsupported-action');
    settings.value = await repository.value!.update((value) => {
      value.labels = value.labels.filter((label) => !ids.includes(label.id));
      for (const hash of Object.keys(value.torrentLabels))
        value.torrentLabels[hash] = value.torrentLabels[hash].filter(
          (label) => !ids.includes(label),
        );
      return value;
    });
  }
  const removeLabel = (id: string) => removeLabels([id]);
  async function saveFolders(folders: string[] | string) {
    capture.invalidate('unsupported-action');
    settings.value = await repository.value!.update((value) => ({
      ...value,
      folderDictionary: normalizeFolders(folders),
    }));
  }
  async function importSettings(report: MigrationReport, sections?: SettingsSection[]) {
    capture.invalidate('unsupported-action');
    settings.value = await repository.value!.import(report, sections);
    await setLanguage(settings.value.ui.locale);
    schedule();
  }
  function legacySettings() {
    try {
      return readLegacy(localStorage);
    } catch {
      return { raw: {}, available: false, errors: ['storageUnavailable'] };
    }
  }
  function loadBackups() {
    return repository.value!.backups();
  }
  async function saveJob(job: MatchJob) {
    capture.invalidate('unsupported-action');
    await repository.value!.saveJob(job);
    matchJob.value = { ...job, items: job.items.map((x) => ({ ...x })) };
  }
  function dispose() {
    disposed = true;
    pendingFull = false;
    generation.value++;
    stopTimer();
    controller.abort();
    detailController?.abort();
    repository.value?.close();
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
  function diagnosticState() {
    return {
      torrents: torrents.value,
      selectedId: selectedId.value,
      stale: stale.value,
      ready: ready.value,
      generation: generation.value,
      authenticationRequired: authenticationRequired.value,
      results: operationResults.value,
      detailId: detail.value?.id ?? null,
    };
  }
  async function startCapture() {
    if (capture.active || !diagnostics.enabled)
      throw new Error('Recording is already active or disabled');
    if (!ready.value || operationBusy.value || matchJob.value?.running || connecting.value)
      throw new Error('Capture requires an idle connected workspace');
    let checkpointTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        refreshSnapshot(),
        new Promise<never>((_, reject) => {
          checkpointTimeout = setTimeout(() => reject(new Error('Checkpoint timeout')), 10000);
        }),
      ]);
    } finally {
      clearTimeout(checkpointTimeout);
    }
    if (operationBusy.value || detailLoading.value)
      throw new Error('Wait for current operations to finish');
    const now = Date.now();
    capture.start(
      {
        operationCounter: diagnosticOperation,
        wallTime: now,
        session: session.value!,
        torrents: torrents.value,
        ui: settings.value.ui as unknown as Record<string, unknown>,
        generation: generation.value,
        lastSessionAge: now - lastSession,
        lastSnapshotAge: now - lastSnapshot,
        identities: [...identityVersions],
        selectedId: selectedId.value,
        detail: detail.value,
        stale: stale.value,
        refreshDueMs: timer ? Math.max(0, timerDue - now) : undefined,
      },
      diagnostics.id,
    );
  }
  function restoreDiagnosticCheckpoint(
    checkpoint: Checkpoint,
    transport: typeof fetch,
    observe: (type: string, data: Record<string, unknown>) => void,
    duration = Infinity,
  ) {
    stopTimer();
    controller.abort();
    detailController?.abort();
    controller = new AbortController();
    refreshTask = null;
    pendingFull = false;
    disposed = false;
    rpc = new RpcClient('/offline-rpc', transport, observe);
    replayDeadline = Date.now() + duration;
    replayStateObserver = observe;
    diagnosticOperation = checkpoint.operationCounter ?? 0;
    generation.value = checkpoint.generation;
    byId.clear();
    identityVersions.clear();
    for (const row of checkpoint.torrents) byId.set(row.id as number, row as Torrent);
    for (const [id, revision] of checkpoint.identities) identityVersions.set(id, revision);
    session.value = checkpoint.session as Session;
    settings.value = { ...defaultSettings(), ui: { ...defaultSettings().ui, ...checkpoint.ui } };
    selectedId.value = checkpoint.selectedId;
    selectedTarget.value =
      checkpoint.selectedId === null ? undefined : captureTarget(checkpoint.selectedId);
    detail.value = checkpoint.detail as Torrent | undefined;
    detailSection.value = 'general';
    detailSequence = 0;
    stale.value = checkpoint.stale;
    ready.value = true;
    authenticationRequired.value = false;
    error.value = '';
    operationResults.value = [];
    lastSession = Date.now() - checkpoint.lastSessionAge;
    lastSnapshot = Date.now() - checkpoint.lastSnapshotAge;
    schedule(checkpoint.refreshDueMs);
  }
  return {
    diagnosticState,
    startCapture,
    restoreDiagnosticCheckpoint,
    settings,
    session,
    stats,
    freeSpace,
    byId,
    torrents,
    generation,
    ready,
    connecting,
    authenticationRequired,
    authenticationFailed,
    requestAuthentication,
    refreshing,
    error,
    stale,
    lastUpdated,
    storageAvailable,
    selectedId,
    checkedIds,
    detailSection,
    detail,
    detailLoading,
    detailError,
    current,
    operationResults,
    operationBusy,
    config,
    repository,
    matchJob,
    initialize,
    connect,
    refresh,
    refreshSnapshot,
    select,
    loadDetail,
    targets,
    setCheckedIds,
    clearChecked,
    toggleChecked,
    captureCheckedTargets,
    isTargetCurrent,
    validateTargets,
    detailTarget,
    command,
    execute,
    readTarget,
    updateTrackers,
    saveLimits,
    trackerCapability,
    addTasks,
    replaceTrackersBatch,
    cancelOperations,
    saveSession,
    diagnostic,
    updateUi,
    assignLabels,
    saveLabel,
    removeLabel,
    removeLabels,
    saveFolders,
    importSettings,
    legacySettings,
    loadBackups,
    saveJob,
    dispose,
  };
});
