<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onUnmounted, ref, watch } from 'vue';
import {
  NButton,
  NInput,
  NPagination,
  NDropdown,
  NAlert,
  NModal,
  NCheckbox,
  NSpin,
  useMessage,
  NProgress,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { progressFraction, progressText } from '../domain/status';
import { selectTorrents, formatBytes, errorMessage, STATUS_NAMES } from '../domain/torrents';
import type { TorrentTarget } from '../domain/types';
import TorrentTable from './TorrentTable.vue';
import { inFolder, torrentServers } from '../domain/navigation';
import SidebarNavigation from './SidebarNavigation.vue';
import BrandMark from './BrandMark.vue';
import WorkspaceToolbar from './WorkspaceToolbar.vue';
import ColumnSettingsDialog from './ColumnSettingsDialog.vue';
import ThemePicker from './ThemePicker.vue';
import LayoutPicker from './LayoutPicker.vue';
import ColorModeToggle from './ColorModeToggle.vue';
import WorkspaceStatusbar from './WorkspaceStatusbar.vue';
import { Info, PanelLeft, X } from '@lucide/vue';
import { layoutTheme } from '../domain/themes';
import { visualProfile, visualTheme } from '../domain/visual-themes';
const DetailPane = defineAsyncComponent(() => import('./DetailPane.vue'));
const AddDialog = defineAsyncComponent(() => import('./AddDialog.vue'));
const ActionDialog = defineAsyncComponent(() => import('./ActionDialog.vue'));
const SettingsDialog = defineAsyncComponent(() => import('./SettingsDialog.vue'));
const WorkflowDialog = defineAsyncComponent(() => import('./WorkflowDialog.vue'));
const AboutDialog = defineAsyncComponent(() => import('./AboutDialog.vue'));
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
  about = ref(false),
  action = ref(''),
  workflow = ref(''),
  captured = ref<TorrentTarget[]>([]),
  dropped = ref<File[]>([]);
const preparingGlobal = ref(false);
const dark = inject(
  'color-mode-dark',
  computed(() => app.settings.ui.theme === 'dark'),
);
const searchAppearance = computed(() => {
  if (!dark.value) return undefined;
  const p = visualProfile(visualTheme(app.settings.ui.visualTheme), true).palette;
  return {
    color: p.subtle,
    colorHover: p.subtle,
    colorFocus: p.subtle,
    border: `1px solid ${p.muted}`,
    borderHover: `1px solid ${p.accent}`,
    borderFocus: `1px solid ${p.accent}`,
    boxShadowFocus: `0 0 0 2px ${p.selected}`,
  };
});
const currentLayout = computed(() => layoutTheme(app.settings.ui.layoutTheme));
watch(currentLayout, () => (navOpen.value = false));
const showResults = ref(false);
const context = ref<{ x: number; y: number; targets: TorrentTarget[] } | null>(null);
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
  app.clearChecked();
});
watch(page, () => app.clearChecked());
watch(
  () => filtered.value.length,
  (length) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(length / app.settings.ui.pageSize)));
  },
);
const invalidNavigation = computed(
  () =>
    app.ready &&
    !app.stale &&
    ((folder.value && !app.torrents.some((x) => inFolder(x.downloadDir, folder.value!))) ||
      (tracker.value && !app.torrents.some((x) => torrentServers(x).includes(tracker.value!))) ||
      (label.value && !app.settings.labels.some((x) => x.id === label.value))),
);
function navigate(kind: string, value: string) {
  if (kind === 'status') {
    filter.value = value;
    if (value === 'all') {
      folder.value = null;
      tracker.value = null;
      label.value = null;
    }
  }
  if (kind === 'folder') folder.value = value;
  if (kind === 'tracker') tracker.value = value;
  if (kind === 'label') label.value = value;
  navOpen.value = false;
}
const commands: Record<string, string> = {
  start: 'torrent-start',
  startNow: 'torrent-start-now',
  stop: 'torrent-stop',
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
const moreMenu = computed(() =>
  ['stopAll', 'startAll', 'replaceTrackers'].map((key) => ({
    key,
    label: t(key),
    disabled: key === 'replaceTrackers' && !app.checkedIds.length,
  })),
);
async function operateBulk(key: string) {
  if (key === 'replaceTrackers') return operateChecked(key);
  if (
    !['startAll', 'stopAll'].includes(key) ||
    !app.ready ||
    app.stale ||
    app.operationBusy ||
    preparingGlobal.value
  )
    return;
  preparingGlobal.value = true;
  const epoch = app.generation;
  try {
    await app.refreshSnapshot();
    if (epoch !== app.generation) throw new Error(t('globalScopeChanged'));
    if (!app.ready || app.stale || app.operationBusy) return;
    await operate(
      key,
      app.torrents.map((row) => row.id),
    );
  } catch (e) {
    message.error(errorMessage(e));
  } finally {
    preparingGlobal.value = false;
  }
}
function operateChecked(key: string) {
  if (!app.ready || app.operationBusy || !app.checkedIds.length) return;
  return operate(key, [], app.captureCheckedTargets());
}
async function operate(key: string, ids: number[], frozen?: TorrentTarget[]) {
  context.value = null;
  try {
    captured.value = frozen ?? app.targets(ids);
    app.validateTargets(captured.value);
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
function openContext(event: MouseEvent, ids: number[]) {
  try {
    context.value = { x: event.clientX, y: event.clientY, targets: app.targets(ids) };
  } catch (e) {
    message.error(errorMessage(e));
  }
}
watch(
  () => context.value?.targets.every(app.isTargetCurrent),
  (valid) => {
    if (valid === false) context.value = null;
  },
);
function sort(key: string) {
  if (sortKey.value === key) descending.value = !descending.value;
  else {
    sortKey.value = key;
    descending.value = false;
  }
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
function collapseOnListBlank(event: MouseEvent) {
  if (event.button !== 0 || event.defaultPrevented || app.selectedId === null) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest(
      '[data-torrent-id], .mobile-transfer, thead, th, button, input, select, textarea, a, [role="button"], [role="checkbox"], [role="separator"], [role="scrollbar"], .n-scrollbar-rail, [contenteditable="true"]',
    )
  )
    return;
  app.select(null);
}
</script>
<template>
  <div
    :class="[
      'workspace',
      `layout-${currentLayout}`,
      { 'force-desktop': desktop, 'nav-open': navOpen },
    ]"
    :data-layout-theme="currentLayout"
    @dragover.prevent
    @drop="drop"
  >
    <header class="topbar">
      <button
        class="navigation-toggle"
        :aria-label="t(navOpen ? 'closeNavigation' : 'openNavigation')"
        :aria-expanded="navOpen"
        aria-controls="workspace-navigation"
        @click="navOpen = !navOpen"
      >
        <X v-if="navOpen" :size="20" aria-hidden="true" /><PanelLeft
          v-else
          :size="20"
          aria-hidden="true"
        />
      </button>
      <button class="brand" @click="navOpen = !navOpen">
        <span class="brand-mark"><BrandMark animated /></span
        ><span>Transmission<small>WEB UI</small></span>
      </button>
      <div class="top-actions">
        <LayoutPicker /><ThemePicker />
        <NButton
          class="appearance-trigger about-trigger"
          secondary
          :aria-label="t('about')"
          :title="t('about')"
          aria-haspopup="dialog"
          @click="about = true"
        >
          <template #icon><Info :size="18" aria-hidden="true" /></template>
          <span>{{ t('about') }}</span>
        </NButton>
      </div>
    </header>
    <WorkspaceToolbar
      :ready="app.ready && !app.stale"
      :busy="app.operationBusy || preparingGlobal"
      :refreshing="app.refreshing"
      :target-count="app.checkedIds.length"
      :menu="menu"
      :more-menu="moreMenu"
      :total-count="app.torrents.length"
      :auto-refresh="app.settings.ui.autoRefresh"
      :interval-ms="app.settings.ui.refreshIntervalMs"
      :match-running="app.matchJob ? app.matchJob.running : null"
      @add="
        dropped = [];
        add = true;
      "
      @action="operateChecked"
      @bulk-action="operateBulk"
      @refresh="app.refresh(true).catch((e) => message.error(errorMessage(e)))"
      @settings="settings = true"
      @columns="columns = true"
      @auto-refresh="(autoRefresh) => app.updateUi({ autoRefresh })"
      @interval="(refreshIntervalMs) => app.updateUi({ refreshIntervalMs })"
      @resume-match="
        captured = [];
        workflow = 'matchFolders';
      "
    />
    <button
      v-if="navOpen"
      class="navigation-scrim"
      :aria-label="t('closeNavigation')"
      @click="navOpen = false"
    />
    <aside id="workspace-navigation" class="sidebar">
      <SidebarNavigation
        :status="filter"
        :folder="folder"
        :tracker="tracker"
        :label="label"
        @select="navigate"
      />
    </aside>
    <div class="sidebar-bottom">
      <ColorModeToggle />
    </div>
    <main class="main-panel">
      <NAlert v-if="app.error" type="warning" :bordered="false" class="connection-alert"
        ><span>{{ app.error }} · {{ t('stale') }}</span
        ><NButton size="tiny" @click="app.connect()">{{ t('retry') }}</NButton
        ><NButton size="tiny" @click="app.requestAuthentication()">{{
          t('authenticate')
        }}</NButton></NAlert
      >
      <NAlert v-if="!app.storageAvailable" type="warning" :bordered="false">{{
        t('storageUnavailable')
      }}</NAlert>
      <div class="section-title">
        <div>
          <h1>{{ t(filter) }}</h1>
          <span class="muted">{{ t('tasks', { count: filtered.length }) }}</span>
        </div>
        <NInput
          v-model:value="search"
          clearable
          :placeholder="t('search')"
          class="search-input"
          :theme-overrides="searchAppearance"
        />
      </div>
      <div v-if="filter !== 'all' || folder || tracker || label" class="filter-chips">
        <NButton v-if="filter !== 'all'" size="tiny" @click="filter = 'all'"
          >{{ t(filter) }} ×</NButton
        >
        <NButton v-if="folder" size="tiny" @click="folder = null"
          >{{ t('folders') }}: {{ folder }} ×</NButton
        >
        <NButton v-if="tracker" size="tiny" @click="tracker = null"
          >{{ t('serverDistribution') }}: {{ tracker }} ×</NButton
        >
        <NButton v-if="label" size="tiny" @click="label = null"
          >{{ t('localLabels') }}:
          {{ app.settings.labels.find((x) => x.id === label)?.name || label }} ×</NButton
        >
      </div>
      <p v-if="invalidNavigation" class="invalid-navigation">{{ t('unavailableFilter') }}</p>
      <div class="list-region" @click="collapseOnListBlank">
        <NSpin v-if="app.connecting && !app.torrents.length" class="centered" /><template
          v-else-if="rows.length"
          ><TorrentTable
            class="desktop-table"
            :rows="rows"
            :row-offset="app.settings.ui.pagination ? (page - 1) * app.settings.ui.pageSize : 0"
            :sort-key="sortKey"
            :descending="descending"
            @sort="sort"
            @labels="(id) => operate('labels', [id])"
            @context="openContext"
          />
          <div class="mobile-list">
            <article
              v-for="row in rows"
              :key="row.id"
              :class="['mobile-transfer', { selected: row.id === app.selectedId }]"
              @click="app.select(row.id)"
            >
              <NCheckbox
                class="mobile-transfer-check"
                :aria-label="row.name"
                :checked="app.checkedIds.includes(row.id)"
                :disabled="!row.hashString"
                @click.stop
                @update:checked="(checked) => app.toggleChecked(row.id, checked)"
              />
              <div class="mobile-transfer-content">
                <strong>{{ row.name }}</strong>
                <div class="mobile-transfer-progress">
                  <NProgress
                    :percentage="(progressFraction(row.percentDone) ?? 0) * 100"
                    :aria-label="progressText(row.percentDone)"
                    :show-indicator="false"
                    :height="3"
                  />
                  <span class="mobile-transfer-percentage">{{
                    progressText(row.percentDone)
                  }}</span>
                </div>
                <small
                  >{{ t(STATUS_NAMES[row.status ?? -1] || 'unknown') }} ·
                  {{ formatBytes(row.totalSize || 0).replace('iB', 'B') }} · ↓
                  {{ formatBytes(row.rateDownload || 0, true) }}</small
                >
              </div>
            </article>
          </div></template
        >
        <div v-else class="empty-state">
          <span class="empty-icon"><BrandMark /></span>
          <h2>{{ t(app.torrents.length ? 'noMatches' : 'empty') }}</h2>
          <p>{{ t('emptyHint') }}</p>
        </div>
      </div>
      <footer class="list-footer">
        <span>{{
          app.checkedIds.length
            ? t('selected', { count: app.checkedIds.length })
            : t('pageRange', {
                from: filtered.length
                  ? app.settings.ui.pagination
                    ? (page - 1) * app.settings.ui.pageSize + 1
                    : 1
                  : 0,
                to: app.settings.ui.pagination
                  ? Math.min(page * app.settings.ui.pageSize, filtered.length)
                  : filtered.length,
                count: filtered.length,
              })
        }}</span><NPagination
          v-if="app.settings.ui.pagination"
          v-model:page="page"
          :page-size="app.settings.ui.pageSize"
          :item-count="filtered.length"
          :page-slot="5"
          show-size-picker
          show-quick-jumper
          :page-sizes="
            [
              ...new Set([
                10,
                20,
                30,
                40,
                50,
                100,
                150,
                200,
                250,
                300,
                5000,
                app.settings.ui.pageSize,
              ]),
            ]
              .sort((a, b) => a - b)
              .map((value) => ({ label: t('perPage', { count: value }), value }))
          "
          @update:page-size="
            (pageSize) => {
              page = 1;
              app.clearChecked();
              app.updateUi({ pageSize });
            }
          "
          :prefix="
            () =>
              t('pageOf', {
                page,
                pages: Math.max(1, Math.ceil(filtered.length / app.settings.ui.pageSize)),
              })
          "
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
    <WorkspaceStatusbar />
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
      @select="(key) => operate(String(key), [], context?.targets ?? [])"
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
    <ColumnSettingsDialog v-model:show="columns" />
    <AboutDialog v-if="about" @close="about = false" />
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
