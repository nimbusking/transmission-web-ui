import { defineStore } from 'pinia';
import { computed, ref, shallowReactive, shallowRef } from 'vue';
import type {
  Session,
  Settings,
  Torrent,
  TorrentTarget,
  DetailSection,
  UiSettings,
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
  CONFIG_FIELDS,
  defaultSettings,
  DYNAMIC_FIELDS,
  errorMessage,
  normalizeTorrent,
  SUMMARY_FIELDS,
} from '../domain/torrents';
import { RpcClient, RpcError, reconciliationInterval } from '../services/rpc';
import { SettingsRepository, readLegacy, normalizeFolders } from '../services/settings';
import type { RuntimeConfig } from '../services/config';
import { runBatch } from '../services/batch';
import { validateSessionPatch } from '../services/session-fields';
import { setLanguage } from '../i18n';

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
    stats = shallowRef<Record<string, number>>({});
  const byId = shallowReactive(new Map<number, Torrent>()),
    generation = ref(0),
    ready = ref(false),
    connecting = ref(false),
    refreshing = ref(false);
  const error = ref(''),
    stale = ref(false),
    lastUpdated = ref(0),
    storageAvailable = ref(true);
  const selectedId = ref<number | null>(null),
    checkedIds = ref<number[]>([]),
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
    lastSnapshot = 0,
    lastSession = 0,
    detailSequence = 0;
  let operationController: AbortController | undefined;
  let pendingFull = false;
  const torrents = computed(() => Array.from(byId.values()));
  const current = computed(() =>
    selectedId.value === null ? undefined : byId.get(selectedId.value),
  );
  async function initialize(runtime: RuntimeConfig) {
    config.value = runtime;
    rpc = new RpcClient(runtime.rpcUrl);
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
    await connect();
  }
  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    stopTimer();
    if (!settings.value.ui.autoRefresh) return;
    const delay = document.hidden ? 30000 : Math.max(2000, settings.value.ui.refreshIntervalMs);
    timer = setTimeout(async () => {
      try {
        await refresh();
      } catch {
        /* state contains error */
      } finally {
        schedule();
      }
    }, delay);
  }
  function visibilityChanged() {
    if (!document.hidden && ready.value) void refresh(true).catch(() => {});
    schedule();
  }
  async function connect(username?: string, password?: string) {
    stopTimer();
    controller.abort();
    detailController?.abort();
    controller = new AbortController();
    refreshTask = null;
    generation.value++;
    const epoch = generation.value;
    ready.value = false;
    connecting.value = true;
    error.value = '';
    selectedId.value = null;
    checkedIds.value = [];
    detail.value = undefined;
    if (username !== undefined) rpc.authenticate(username, password ?? '');
    try {
      const value = await rpc.session({ signal: controller.signal });
      if (epoch !== generation.value) return;
      if (value['rpc-version'] < 16) throw new Error('Transmission 3.00 or newer is required');
      session.value = value;
      lastSession = Date.now();
      lastSnapshot = 0;
      await refresh(true);
      if (epoch === generation.value) ready.value = true;
    } catch (e) {
      if (epoch === generation.value) {
        error.value = errorMessage(e);
        stale.value = true;
      }
    } finally {
      if (epoch === generation.value) {
        connecting.value = false;
        schedule();
      }
    }
  }
  function refresh(full = false): Promise<void> {
    if (refreshTask) {
      pendingFull ||= full;
      return refreshTask;
    }
    const epoch = generation.value;
    // Assigned below: finally compares this promise with the currently active generation.
    let task!: Promise<void>;
    // eslint-disable-next-line prefer-const
    task = (async () => {
      refreshing.value = true;
      try {
        if (Date.now() - lastSession > 30000) {
          const value = await rpc.session({ signal: controller.signal });
          if (epoch !== generation.value) return;
          if (
            session.value?.['session-id'] &&
            value['session-id'] !== session.value['session-id']
          ) {
            void connect();
            return;
          }
          session.value = value;
          lastSession = Date.now();
        }
        const snapshot =
          full || Date.now() - lastSnapshot >= reconciliationInterval(session.value?.version ?? '');
        const response = await rpc.torrents(
          snapshot ? SUMMARY_FIELDS : DYNAMIC_FIELDS,
          snapshot ? undefined : 'recently-active',
          { signal: controller.signal },
        );
        if (epoch !== generation.value) return;
        if (!Array.isArray(response.torrents))
          throw new RpcError('protocol', 'Missing torrents array');
        const missing = applyDelta(byId, response.torrents, response.removed, snapshot);
        if (missing.length) {
          const base = await rpc.torrents(BASE_FIELDS, missing, { signal: controller.signal });
          if (epoch !== generation.value) return;
          applyDelta(byId, base.torrents);
        }
        if (snapshot) lastSnapshot = Date.now();
        checkedIds.value = checkedIds.value.filter((id) => byId.has(id));
        if (selectedId.value !== null && !byId.has(selectedId.value)) select(null);
        const statistics = await rpc.call('session-stats', {}, { signal: controller.signal });
        if (epoch !== generation.value) return;
        stats.value = statistics;
        lastUpdated.value = Date.now();
        stale.value = false;
        error.value = '';
        ready.value = true;
        if (!document.hidden && selectedId.value !== null) await loadDetail();
      } catch (e) {
        if (epoch === generation.value) {
          error.value = errorMessage(e);
          stale.value = true;
        }
        throw e;
      } finally {
        if (refreshTask === task) {
          refreshing.value = false;
          refreshTask = null;
          if (pendingFull) {
            pendingFull = false;
            queueMicrotask(() => void refresh(true).catch(() => {}));
          }
        }
      }
    })();
    refreshTask = task;
    return task;
  }
  function select(id: number | null) {
    selectedId.value = id;
    detail.value = undefined;
    detailError.value = '';
    detailController?.abort();
    detailSequence++;
    if (id !== null) void loadDetail();
  }
  async function loadDetail(section = detailSection.value) {
    detailSection.value = section;
    const id = selectedId.value,
      epoch = generation.value,
      sequence = ++detailSequence;
    detailController?.abort();
    detailController = new AbortController();
    if (id === null || !byId.has(id)) return;
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
      config: CONFIG_FIELDS,
    };
    try {
      const response = await rpc.torrents(fields[section], [id], {
        signal: detailController.signal,
      });
      if (epoch !== generation.value || sequence !== detailSequence || selectedId.value !== id)
        return;
      const row = response.torrents.find((t) => t.id === id);
      if (row) detail.value = normalizeTorrent(row);
    } catch (e) {
      if (sequence === detailSequence && !(e instanceof RpcError && e.kind === 'cancelled'))
        detailError.value = errorMessage(e);
    } finally {
      if (sequence === detailSequence) detailLoading.value = false;
    }
  }
  function targets(ids: number[]): TorrentTarget[] {
    if (!ready.value || !ids.length) throw new Error('Select tasks while connected');
    return [...new Set(ids)].map((id) => {
      const torrent = byId.get(id);
      if (!torrent?.hashString) throw new Error(`Task identity unavailable: ${id}`);
      return { id, hashString: torrent.hashString, generation: generation.value };
    });
  }
  function validateTargets(items: TorrentTarget[]) {
    if (!items.length || !ready.value) throw new Error('No valid operation targets');
    for (const item of items)
      if (item.generation !== generation.value || byId.get(item.id)?.hashString !== item.hashString)
        throw new Error('Task identity changed; select the tasks again');
  }
  async function command(
    method: string,
    items: TorrentTarget[],
    args: Record<string, unknown> = {},
    workflow = false,
  ) {
    validateTargets(items);
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
    return rpc.call(method, { ...args, ids: items.map((x) => x.hashString) });
  }
  async function execute(
    method: string,
    items: TorrentTarget[],
    args: Record<string, unknown> = {},
  ): Promise<BatchResult> {
    validateTargets(items);
    if (operationBusy.value) throw new Error('Another batch is active');
    operationController = new AbortController();
    operationBusy.value = true;
    operationResults.value = [];
    try {
      const result = await runBatch(
        items,
        (target) => command(method, [target], args).then(() => {}),
        (target) => ({ id: target.id, name: byId.get(target.id)?.name ?? String(target.id) }),
        {
          signal: operationController.signal,
          concurrency: method === 'torrent-set-location' || method === 'torrent-verify' ? 1 : 3,
          onProgress: (values) => (operationResults.value = values),
        },
      );
      await refresh(true).catch(() => {});
      return result;
    } finally {
      operationBusy.value = false;
      operationController = undefined;
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
    if (!item || item.hashString !== target.hashString) throw new Error('Task no longer exists');
    return normalizeTorrent(item);
  }
  async function updateTrackers(
    target: TorrentTarget,
    expected: string[],
    replacement: { announce: string; tier: number; id?: number }[],
  ) {
    validateTargets([target]);
    try {
      const current = await readTarget(target, [
        'trackers',
        ...(session.value!['rpc-version'] >= 17 ? ['trackerList'] : []),
      ]);
      const before = (current.trackers ?? []).map((x) => x.announce);
      if (JSON.stringify(before) !== JSON.stringify(expected))
        throw new Error('Tracker list changed; reload before editing');
      for (const tracker of replacement)
        if (!/^(https?|udp):\/\//i.test(tracker.announce))
          throw new Error('Tracker URL must use http, https or udp');
      if (session.value!['rpc-version'] >= 17) {
        const tiers = new Map<number, string[]>();
        for (const item of replacement)
          tiers.set(item.tier, [...(tiers.get(item.tier) ?? []), item.announce]);
        await command('torrent-set', [target], {
          trackerList: [...tiers.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, urls]) => urls.join('\n'))
            .join('\n\n'),
        });
      } else {
        const existing = current.trackers ?? [],
          retained = new Set(replacement.flatMap((x) => (x.id === undefined ? [] : [x.id])));
        const trackerRemove = existing.filter((x) => !retained.has(x.id)).map((x) => x.id);
        // Transmission 3.00 consumes flat position/URL pairs and renumbers on removal.
        // Replace against the captured current list before any membership changes.
        const trackerReplace = replacement.flatMap((x) =>
          x.id !== undefined && existing.some((y) => y.id === x.id && y.announce !== x.announce)
            ? [x.id, x.announce]
            : [],
        );
        const trackerAdd = replacement.filter((x) => x.id === undefined).map((x) => x.announce);
        if (trackerReplace.length) await command('torrent-set', [target], { trackerReplace });
        if (trackerRemove.length) await command('torrent-set', [target], { trackerRemove });
        if (trackerAdd.length) await command('torrent-set', [target], { trackerAdd });
      }
    } finally {
      // 3.00 may have committed an earlier step before a later command fails.
      // Reconcile that partial result without hiding the original write error.
      if (
        selectedId.value === target.id &&
        generation.value === target.generation &&
        detailSection.value === 'trackers'
      )
        await loadDetail('trackers');
      await refresh(true).catch(() => {});
    }
  }
  async function addTasks(
    inputs: { name: string; filename?: string; metainfo?: string }[],
    options: { directory: string; paused: boolean; labels: string[]; setDefault: boolean },
  ) {
    if (!ready.value) throw new Error('Not connected');
    if (operationBusy.value) throw new Error('Another batch is active');
    operationController = new AbortController();
    operationBusy.value = true;
    operationResults.value = [];
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
          signal: operationController.signal,
          concurrency: 3,
          onProgress: (value) => (operationResults.value = value),
        },
      );
      await refresh(true).catch(() => {});
      return result;
    } finally {
      operationBusy.value = false;
      operationController = undefined;
    }
  }
  function cancelOperations() {
    operationController?.abort();
  }
  async function replaceTrackersBatch(
    plan: { target: TorrentTarget; name: string; before: string[]; after: Tracker[] }[],
  ) {
    if (operationBusy.value) throw new Error('Another batch is active');
    operationController = new AbortController();
    operationBusy.value = true;
    operationResults.value = [];
    try {
      return await runBatch(
        plan,
        (item) => updateTrackers(item.target, item.before, item.after),
        (item) => ({ id: item.target.id, name: item.name }),
        {
          signal: operationController.signal,
          concurrency: 3,
          onProgress: (values) => (operationResults.value = values),
        },
      );
    } finally {
      operationBusy.value = false;
      operationController = undefined;
    }
  }
  async function saveSession(patch: Record<string, unknown>) {
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
    settings.value = await repository.value!.updateUi(patch);
    if (patch.locale) await setLanguage(patch.locale);
    schedule();
  }
  async function assignLabels(hashes: string[], ids: string[]) {
    settings.value = await repository.value!.update((value) => {
      const valid = new Set(value.labels.map((x) => x.id));
      for (const hash of hashes) value.torrentLabels[hash] = ids.filter((id) => valid.has(id));
      return value;
    });
  }
  async function saveLabel(label: Label) {
    settings.value = await repository.value!.update((value) => {
      const index = value.labels.findIndex((item) => item.id === label.id);
      if (index >= 0) value.labels[index] = { ...label };
      else value.labels.push({ ...label });
      return value;
    });
  }
  async function removeLabel(id: string) {
    settings.value = await repository.value!.update((value) => {
      value.labels = value.labels.filter((label) => label.id !== id);
      for (const hash of Object.keys(value.torrentLabels))
        value.torrentLabels[hash] = value.torrentLabels[hash].filter((label) => label !== id);
      return value;
    });
  }
  async function saveFolders(folders: string[] | string) {
    settings.value = await repository.value!.update((value) => ({
      ...value,
      folderDictionary: normalizeFolders(folders),
    }));
  }
  async function importSettings(report: MigrationReport) {
    settings.value = await repository.value!.import(report);
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
    await repository.value!.saveJob(job);
    matchJob.value = { ...job, items: job.items.map((x) => ({ ...x })) };
  }
  function dispose() {
    stopTimer();
    controller.abort();
    detailController?.abort();
    repository.value?.close();
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
  return {
    settings,
    session,
    stats,
    byId,
    torrents,
    generation,
    ready,
    connecting,
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
    select,
    loadDetail,
    targets,
    command,
    execute,
    readTarget,
    updateTrackers,
    addTasks,
    replaceTrackersBatch,
    cancelOperations,
    saveSession,
    diagnostic,
    updateUi,
    assignLabels,
    saveLabel,
    removeLabel,
    saveFolders,
    importSettings,
    legacySettings,
    loadBackups,
    saveJob,
    dispose,
  };
});
