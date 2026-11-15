<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue';
import {
  NButton,
  NInput,
  NSelect,
  NPagination,
  NDropdown,
  NAlert,
  NModal,
  NCheckbox,
  NInputNumber,
  NSpin,
  useMessage,
  NProgress,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import {
  selectTorrents,
  statusMatches,
  formatBytes,
  trackerHost,
  errorMessage,
  STATUS_NAMES,
  DEFAULT_COLUMNS,
} from '../domain/torrents';
import type { TorrentTarget } from '../domain/types';
import TorrentTable from './TorrentTable.vue';
const DetailPane = defineAsyncComponent(() => import('./DetailPane.vue'));
const AddDialog = defineAsyncComponent(() => import('./AddDialog.vue'));
const ActionDialog = defineAsyncComponent(() => import('./ActionDialog.vue'));
const SettingsDialog = defineAsyncComponent(() => import('./SettingsDialog.vue'));
const WorkflowDialog = defineAsyncComponent(() => import('./WorkflowDialog.vue'));
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const filter = ref('all'),
  search = ref(''),
  debounced = ref(''),
  folder = ref<string | null>(null),
  tracker = ref<string | null>(null),
  label = ref<string | null>(null);
const sortKey = ref('queuePosition'),
  descending = ref(false),
  page = ref(1),
  navOpen = ref(false);
const add = ref(false),
  settings = ref(false),
  columns = ref(false),
  action = ref(''),
  workflow = ref(''),
  captured = ref<TorrentTarget[]>([]),
  dropped = ref<File[]>([]);
const user = ref(''),
  password = ref(''),
  showAuth = ref(false),
  showResults = ref(false);
const menuGeneration = ref(0);
const context = ref<{ x: number; y: number; ids: number[] } | null>(null);
let debounce: ReturnType<typeof setTimeout> | undefined;
watch(search, (v) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => (debounced.value = v), 120);
});
onUnmounted(() => clearTimeout(debounce));
const filtered = computed(() =>
  selectTorrents(
    app.torrents,
    {
      status: filter.value,
      search: debounced.value,
      sortKey: sortKey.value,
      descending: descending.value,
      folder: folder.value ?? undefined,
      tracker: tracker.value ?? undefined,
      label: label.value ?? undefined,
    },
    app.settings,
  ),
);
const rows = computed(() =>
  app.settings.ui.pagination
    ? filtered.value.slice(
        (page.value - 1) * app.settings.ui.pageSize,
        page.value * app.settings.ui.pageSize,
      )
    : filtered.value,
);
watch([filter, debounced, folder, tracker, label, () => app.settings.ui.pageSize], () => {
  page.value = 1;
  app.checkedIds = [];
});
watch(page, () => (app.checkedIds = []));
watch(
  () => filtered.value.length,
  (length) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(length / app.settings.ui.pageSize)));
  },
);
const categories = computed(() =>
  ['all', 'active', 'downloading', 'seeding', 'paused', 'checking', 'error', 'private'].map(
    (key) => ({ key, count: app.torrents.filter((x) => statusMatches(x, key)).length }),
  ),
);
const folderOptions = computed(() =>
  [...new Set(app.torrents.map((x) => x.downloadDir).filter(Boolean))]
    .sort()
    .map((value) => ({ label: value!, value: value! })),
);
const trackerOptions = computed(() =>
  [...new Set(app.torrents.flatMap((x) => (x.trackers ?? []).map((v) => trackerHost(v.announce))))]
    .sort()
    .map((value) => ({ label: value, value })),
);
const commands: Record<string, string> = {
  start: 'torrent-start',
  startNow: 'torrent-start-now',
  stop: 'torrent-stop',
  verify: 'torrent-verify',
  reannounce: 'torrent-reannounce',
  queueTop: 'queue-move-top',
  queueUp: 'queue-move-up',
  queueDown: 'queue-move-down',
  queueBottom: 'queue-move-bottom',
};
const menu = computed(() =>
  [
    'startNow',
    'verify',
    'reannounce',
    'rename',
    'move',
    'limits',
    'labels',
    'queueTop',
    'queueUp',
    'queueDown',
    'queueBottom',
    'replaceTrackers',
    'matchFolders',
  ].map((key) => ({ key, label: t(key) })),
);
const effectiveIds = computed(() =>
  app.checkedIds.length ? app.checkedIds : app.selectedId !== null ? [app.selectedId] : [],
);
async function operate(key: string, ids = effectiveIds.value) {
  context.value = null;
  try {
    captured.value = app.targets(ids);
    if (key === 'rename' && captured.value.length !== 1)
      throw new Error(t('targetCount', { count: 1 }));
    if (commands[key]) {
      await app.execute(commands[key], captured.value);
      showResults.value = app.operationResults.some((x) => x.status !== 'success');
    } else if (['replaceTrackers', 'matchFolders'].includes(key)) workflow.value = key;
    else action.value = key;
  } catch (e) {
    message.error(errorMessage(e));
  }
}
function sort(key: string) {
  if (sortKey.value === key) descending.value = !descending.value;
  else {
    sortKey.value = key;
    descending.value = false;
  }
}
function reorder(index: number, direction: number) {
  const list = [...app.settings.ui.columns];
  [list[index], list[index + direction]] = [list[index + direction], list[index]];
  void app.updateUi({ columns: list });
}
function resizeDetails(event: PointerEvent) {
  const initial = app.settings.ui.detailHeight,
    y = event.clientY;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const end = (e: PointerEvent) => {
    target.removeEventListener('pointerup', end);
    void app.updateUi({ detailHeight: Math.min(900, Math.max(160, initial + y - e.clientY)) });
  };
  target.addEventListener('pointerup', end);
}
function drop(event: DragEvent) {
  event.preventDefault();
  dropped.value = Array.from(event.dataTransfer?.files ?? []).filter((x) =>
    x.name.toLowerCase().endsWith('.torrent'),
  );
  if (dropped.value.length) add.value = true;
}
const desktop = computed(
  () =>
    app.settings.ui.forceDesktop ||
    new URLSearchParams(location.search).get('devicetype') === 'computer',
);
function resetColumns() {
  void app.updateUi({ columns: structuredClone(DEFAULT_COLUMNS) });
}
</script>
<template>
  <div
    :class="['workspace', { 'force-desktop': desktop, 'nav-open': navOpen }]"
    @dragover.prevent
    @drop="drop"
  >
    <header class="topbar">
      <button class="brand" @click="navOpen = !navOpen">
        <span class="brand-mark">↧</span><span>Transmission<small>WEB UI</small></span>
      </button>
      <div class="connection">
        <span :class="['connection-dot', { live: app.ready && !app.stale }]" />{{
          t(app.connecting ? 'connecting' : app.ready && !app.stale ? 'connected' : 'disconnected')
        }}<span v-if="app.session" class="muted">v{{ app.session.version }}</span>
      </div>
      <div class="top-actions">
        <span class="speed">↓ {{ formatBytes(app.stats.downloadSpeed || 0, true) }}</span
        ><span class="speed">↑ {{ formatBytes(app.stats.uploadSpeed || 0, true) }}</span
        ><NButton quaternary size="small" @click="settings = true">{{ t('settings') }}</NButton>
      </div>
    </header>
    <aside class="sidebar">
      <div class="sidebar-heading">{{ t('app') }}</div>
      <button
        v-for="category in categories"
        :key="category.key"
        :class="['nav-item', { active: filter === category.key }]"
        @click="
          filter = category.key;
          navOpen = false;
        "
      >
        <span>{{ t(category.key) }}</span><span class="nav-count">{{ category.count }}</span>
      </button>
      <div class="sidebar-heading">{{ t('folders') }}</div>
      <NSelect
        v-model:value="folder"
        clearable
        filterable
        :options="folderOptions"
        :placeholder="t('all')"
        size="small"
      />
      <div class="sidebar-heading">{{ t('trackers') }}</div>
      <NSelect
        v-model:value="tracker"
        clearable
        filterable
        :options="trackerOptions"
        :placeholder="t('all')"
        size="small"
      />
      <div class="sidebar-heading">{{ t('localLabels') }}</div>
      <button
        v-for="item in app.settings.labels"
        :key="item.id"
        :class="['nav-item', { active: label === item.id }]"
        @click="label = label === item.id ? null : item.id"
      >
        <span><i class="label-dot" :style="{ background: item.color }" />{{ item.name }}</span>
      </button>
      <div class="sidebar-bottom"><span>Transmission Web UI</span><small>2.0.0 · Vue 3</small></div>
    </aside>
    <main class="main-panel">
      <NAlert v-if="app.error" type="warning" :bordered="false" class="connection-alert"
        ><span>{{ app.error }} · {{ t('stale') }}</span
        ><NButton size="tiny" @click="app.connect()">{{ t('retry') }}</NButton
        ><NButton size="tiny" @click="showAuth = true">{{ t('authenticate') }}</NButton></NAlert
      >
      <NAlert v-if="!app.storageAvailable" type="warning" :bordered="false">{{
        t('storageUnavailable')
      }}</NAlert>
      <div class="section-title">
        <div>
          <h1>{{ t(filter) }}</h1>
          <span class="muted">{{ t('tasks', { count: filtered.length }) }}</span>
        </div>
        <NInput v-model:value="search" clearable :placeholder="t('search')" class="search-input" />
      </div>
      <div class="toolbar">
        <NButton
          type="primary"
          :disabled="!app.ready"
          @click="
            dropped = [];
            add = true;
          "
          >＋ {{ t('add') }}</NButton
        ><span class="toolbar-divider" /><NButton
          :disabled="!effectiveIds.length || !app.ready || app.operationBusy"
          @click="operate('start')"
          >▷ {{ t('start') }}</NButton
        ><NButton
          :disabled="!effectiveIds.length || !app.ready || app.operationBusy"
          @click="operate('stop')"
          >Ⅱ {{ t('stop') }}</NButton
        ><NButton
          :disabled="!effectiveIds.length || !app.ready || app.operationBusy"
          @click="operate('remove')"
          >{{ t('remove') }}</NButton
        ><NDropdown
          :key="menuGeneration"
          trigger="click"
          :options="menu"
          @select="
            (key) => {
              menuGeneration++;
              operate(String(key));
            }
          "
          ><NButton :disabled="!effectiveIds.length || !app.ready || app.operationBusy"
            >{{ t('more') }} ▾</NButton
          ></NDropdown
        ><span class="toolbar-spacer" /><NButton
          v-if="app.matchJob"
          size="small"
          @click="
            captured = [];
            workflow = 'matchFolders';
          "
          >{{ t('matchFolders') }}{{ app.matchJob.running ? ' •' : '' }}</NButton
        ><NButton
          quaternary
          :loading="app.refreshing"
          @click="app.refresh(true).catch((e) => message.error(errorMessage(e)))"
          >↻</NButton
        ><NButton quaternary class="desktop-only" @click="columns = true">{{
          t('columns')
        }}</NButton>
      </div>
      <div class="list-region">
        <NSpin v-if="app.connecting && !app.torrents.length" class="centered" /><template
          v-else-if="rows.length"
          ><TorrentTable
            class="desktop-table"
            :rows="rows"
            :sort-key="sortKey"
            :descending="descending"
            @sort="sort"
            @context="(event, ids) => (context = { x: event.clientX, y: event.clientY, ids })"
          />
          <div class="mobile-list">
            <article
              v-for="row in rows"
              :key="row.id"
              :class="['mobile-transfer', { selected: row.id === app.selectedId }]"
              @click="app.select(row.id)"
            >
              <NCheckbox
                :checked="app.checkedIds.includes(row.id)"
                @click.stop
                @update:checked="
                  (checked) =>
                    (app.checkedIds = checked
                      ? [...app.checkedIds, row.id]
                      : app.checkedIds.filter((id) => id !== row.id))
                "
              />
              <div>
                <strong>{{ row.name }}</strong><NProgress
                  :percentage="(row.percentDone || 0) * 100"
                  :show-indicator="false"
                  :height="3"
                /><small
                  >{{ t(STATUS_NAMES[row.status ?? -1] || 'unknown') }} ·
                  {{ formatBytes(row.totalSize || 0) }} · ↓
                  {{ formatBytes(row.rateDownload || 0, true) }}</small
                >
              </div>
            </article>
          </div></template
        >
        <div v-else class="empty-state">
          <span class="empty-icon">↧</span>
          <h2>{{ t(app.torrents.length ? 'noMatches' : 'empty') }}</h2>
          <p>{{ t('emptyHint') }}</p>
        </div>
      </div>
      <footer class="list-footer">
        <span>{{
          app.checkedIds.length
            ? t('selected', { count: app.checkedIds.length })
            : t('tasks', { count: filtered.length })
        }}</span><NPagination
          v-if="app.settings.ui.pagination"
          v-model:page="page"
          :page-size="app.settings.ui.pageSize"
          :item-count="filtered.length"
          :page-slot="5"
          size="small"
        /><NButton v-if="app.operationBusy" text size="tiny" @click="app.cancelOperations">{{
          t('cancelPending')
        }}</NButton
        ><NButton v-if="app.operationResults.length" text size="tiny" @click="showResults = true">{{
          t('results')
        }}</NButton>
      </footer>
      <section
        v-if="app.selectedId !== null"
        class="detail-region"
        :style="{ height: `${app.settings.ui.detailHeight}px` }"
      >
        <div class="detail-resizer" @pointerdown="resizeDetails" />
        <DetailPane />
      </section>
      <div v-else class="detail-placeholder desktop-only">{{ t('detailsHint') }}</div>
    </main>
    <NDropdown
      v-if="context"
      :show="true"
      trigger="manual"
      :x="context?.x"
      :y="context?.y"
      :options="[
        { key: 'start', label: t('start') },
        { key: 'stop', label: t('stop') },
        ...menu,
        { key: 'remove', label: t('remove') },
      ]"
      @clickoutside="context = null"
      @select="(key) => operate(String(key), context?.ids)"
    />
    <AddDialog v-if="add" :files="dropped" @close="add = false" /><ActionDialog
      v-if="action"
      :action="action"
      :targets="captured"
      @close="action = ''"
    /><SettingsDialog v-if="settings" @close="settings = false" /><WorkflowDialog
      v-if="workflow"
      :mode="workflow"
      :targets="captured"
      @close="workflow = ''"
    />
    <NModal v-model:show="columns" preset="card" :title="t('columns')" class="dialog medium-dialog"
      ><div v-for="(col, index) in app.settings.ui.columns" :key="col.key" class="column-setting">
        <NCheckbox
          :checked="col.visible"
          @update:checked="
            (visible) =>
              app.updateUi({
                columns: app.settings.ui.columns.map((c) =>
                  c.key === col.key ? { ...c, visible } : c,
                ),
              })
          "
          >{{ t(col.key) }}</NCheckbox><NInputNumber
          :value="col.width"
          :min="60"
          :max="1200"
          size="small"
          @update:value="
            (width) =>
              width &&
              app.updateUi({
                columns: app.settings.ui.columns.map((c) =>
                  c.key === col.key ? { ...c, width } : c,
                ),
              })
          "
        /><NButton size="tiny" :disabled="index === 0" @click="reorder(index, -1)">↑</NButton
        ><NButton
          size="tiny"
          :disabled="index === app.settings.ui.columns.length - 1"
          @click="reorder(index, 1)"
          >↓</NButton
        >
      </div>
      <NButton @click="resetColumns">{{ t('reset') }}</NButton></NModal
    >
    <NModal
      v-model:show="showAuth"
      preset="card"
      :title="t('authenticate')"
      class="dialog small-dialog"
      ><p>{{ t('authHint') }}</p>
      <NInput v-model:value="user" :placeholder="t('username')" autocomplete="username" /><NInput
        v-model:value="password"
        type="password"
        :placeholder="t('password')"
        autocomplete="current-password"
      /><NButton
        type="primary"
        @click="
          app.connect(user, password);
          password = '';
          showAuth = false;
        "
        >{{ t('confirm') }}</NButton
      ></NModal
    >
    <NModal
      v-model:show="showResults"
      preset="card"
      :title="t('results')"
      class="dialog medium-dialog"
      ><div v-for="(result, index) in app.operationResults" :key="index" class="result-row">
        <strong>{{ result.name }}</strong><span>{{ t(result.status) }}</span
        ><small>{{ result.message }}</small>
      </div></NModal
    >
  </div>
</template>
