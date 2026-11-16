<script setup lang="ts">
import { compatibilityMessage } from '../i18n/compatibility';
import { trackerSnapshot, trackerPatch, type TrackerEdit } from '../domain/tracker-edit';
import type { Tracker } from '../domain/types';
import { heldBytes, progressText } from '../domain/status';
import { peerCount } from '../domain/table';
import { computed, h, ref, watch } from 'vue';
import {
  fileRows,
  filePattern,
  filterFiles,
  sortFiles,
  type FilePreset,
  type FileSortKey,
} from '../domain/torrent-files';
import { ChevronDown, RefreshCw, Check, Ban, Flag } from '@lucide/vue';
import {
  NTabs,
  NTab,
  NButton,
  NInput,
  NCheckbox,
  NPagination,
  NSelect,
  NDropdown,
  NDataTable,
  NModal,
  NAlert,
  useMessage,
  type DataTableColumns,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import type { DetailSection, TorrentTarget } from '../domain/types';
import PieceMap from './PieceMap.vue';
import {
  STATUS_NAMES,
  formatDuration,
  errorMessage,
  fileProgress,
  formatBytes,
  formatRatio,
} from '../domain/torrents';
import { externalText } from '../services/files';
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const filePage = ref(1),
  filePreset = ref<FilePreset>('all'),
  fileSort = ref<{ key?: FileSortKey; descending: boolean }>({ descending: false });
const filePageSize = computed(() => app.settings.ui.filePageSize ?? 200);
const fileQuery = ref(''),
  regex = ref(false),
  checkedFiles = ref<number[]>([]),
  trackerEdit = ref(false),
  trackerAttempted = ref(false),
  trackerText = ref(''),
  trackerTarget = ref<TorrentTarget>(),
  expectedTrackers = ref<Tracker[]>([]),
  originalTrackers = ref<TrackerEdit[]>([]);
const busy = ref(false),
  failure = ref(''),
  ipResult = ref(''),
  renamePath = ref(''),
  renameValue = ref(''),
  renameTarget = ref<TorrentTarget>();
watch(
  () => app.selectedId,
  () => {
    trackerEdit.value = false;
    renameTarget.value = undefined;
    checkedFiles.value = [];
    fileQuery.value = '';
    filePreset.value = 'all';
    fileSort.value = { descending: false };
    filePage.value = 1;
    failure.value = '';
  },
);
const fileFilter = computed(() => filePattern(fileQuery.value, regex.value));
const allFiles = computed(() => fileRows(app.detail));
const files = computed(() =>
  sortFiles(
    filterFiles(allFiles.value, fileQuery.value, fileFilter.value, filePreset.value),
    fileSort.value.key,
    fileSort.value.descending,
  ),
);
const filePages = computed(() => Math.max(1, Math.ceil(files.value.length / filePageSize.value)));
const pagedFiles = computed(() =>
  files.value.slice((filePage.value - 1) * filePageSize.value, filePage.value * filePageSize.value),
);
watch([fileQuery, regex, filePreset, fileSort, filePageSize], () => {
  filePage.value = 1;
  checkedFiles.value = [];
});
watch(filePage, () => (checkedFiles.value = []));
watch(pagedFiles, (rows) => {
  if (filePage.value > filePages.value) filePage.value = filePages.value;
  const valid = new Set(rows.map((row) => row.index));
  checkedFiles.value = checkedFiles.value.filter((index) => valid.has(index));
});
function fileSortChanged(
  sorter: { columnKey: string | number; order: 'ascend' | 'descend' | false } | null,
) {
  fileSort.value = {
    key: sorter?.order ? (sorter.columnKey as FileSortKey) : undefined,
    descending: sorter?.order === 'descend',
  };
}
function sortableFile(key: FileSortKey) {
  return {
    sorter: 'default' as const,
    sortOrder:
      fileSort.value.key === key
        ? fileSort.value.descending
          ? ('descend' as const)
          : ('ascend' as const)
        : (false as const),
  };
}
const filePresets = computed(() =>
  (['all', 'padding', 'unnecessary'] as const).map((value) => ({
    value,
    label: t(`filePreset_${value}`),
  })),
);
const filePriorityOptions = computed(() =>
  ['high', 'normal', 'low'].map((level) => ({
    key: `priority-${level}`,
    label: t(
      level === 'high' ? 'priorityHigh' : level === 'normal' ? 'priorityNormal' : 'priorityLow',
    ),
  })),
);
const fileActionDisabled = computed(
  () => !checkedFiles.value.length || busy.value || !app.ready || app.stale || app.detailLoading,
);
async function refreshFiles() {
  await attempt(async () => {
    await app.loadDetail('files');
    if (app.detailError) throw new Error(app.detailError);
  });
}
const fileColumns = computed<DataTableColumns<any>>(() => [
  { type: 'selection', width: 40 },
  {
    key: 'name',
    title: t('name'),
    minWidth: 280,
    ellipsis: { tooltip: true },
    ...sortableFile('name'),
  },
  {
    key: 'length',
    title: t('totalSize'),
    width: 110,
    render: (row) => formatBytes(row.length),
    ...sortableFile('length'),
  },
  {
    key: 'progress',
    ...sortableFile('progress'),
    title: t('percentDone'),
    width: 100,
    render: (row) => `${(fileProgress(row.bytesCompleted, row.length) * 100).toFixed(1)}%`,
  },
  {
    key: 'bytesCompleted',
    title: t('fileDownloaded'),
    width: 110,
    ...sortableFile('bytesCompleted'),
    render: (row) => formatBytes(row.bytesCompleted),
  },
  {
    key: 'wanted',
    ...sortableFile('wanted'),
    title: t('wantedColumn'),
    width: 90,
    render: (row) => (row.stat?.wanted === undefined ? t('unknown') : row.stat.wanted ? '✓' : '—'),
  },
  {
    key: 'priority',
    title: t('priority'),
    width: 100,
    render: (row) =>
      t(
        row.stat?.priority === 1
          ? 'priorityHigh'
          : row.stat?.priority === -1
            ? 'priorityLow'
            : row.stat?.priority === 0
              ? 'priorityNormal'
              : 'unknown',
      ),
  },
  {
    key: 'rename',
    title: '',
    width: 80,
    render: (row) =>
      h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          onClick: () => {
            renamePath.value = row.name;
            renameValue.value = row.name.split('/').at(-1);
            renameTarget.value = app.detailTarget();
          },
        },
        () => t('rename'),
      ),
  },
]);
const peerColumns = computed<DataTableColumns<any>>(() => [
  { key: 'address', title: t('address'), width: 190 },
  { key: 'port', title: t('port'), width: 80 },
  { key: 'clientName', title: t('client'), width: 180 },
  {
    key: 'progress',
    title: t('percentDone'),
    width: 100,
    render: (row) => `${(row.progress * 100).toFixed(1)}%`,
  },
  {
    key: 'rateToClient',
    title: t('rateDownload'),
    width: 120,
    render: (row) => formatBytes(row.rateToClient, true),
  },
  {
    key: 'rateToPeer',
    title: t('rateUpload'),
    width: 120,
    render: (row) => formatBytes(row.rateToPeer, true),
  },
  {
    key: 'lookup',
    title: '',
    width: 100,
    render: (row) =>
      h(NButton, { size: 'tiny', onClick: () => lookup(row.address) }, () => t('ipLookup')),
  },
]);
const trackerColumns = computed<DataTableColumns<any>>(() => [
  { key: 'id', title: t('id'), width: 70 },
  { key: 'tier', title: t('tier'), width: 70 },
  { key: 'announce', title: t('announce'), minWidth: 300, ellipsis: { tooltip: true } },
  { key: 'lastAnnounceResult', title: t('status'), width: 250, ellipsis: { tooltip: true } },
  { key: 'seederCount', title: t('seeding'), width: 100 },
  { key: 'leecherCount', title: t('downloading'), width: 100 },
]);
const overview = computed(() => {
  const row = app.detail ?? { id: 0 };
  const date = (value?: number) => (value ? new Date(value * 1000).toLocaleString() : '—');
  const bytes = (value?: number, rate = false) => formatBytes(value ?? NaN, rate);
  const entries: [string, unknown][] = [
    ['downloadDir', row.downloadDir],
    ['hashString', row.hashString],
    ['status', t(STATUS_NAMES[row.status ?? -1] || 'unknown')],
    ['totalSize', bytes(row.totalSize)],
    ['completeSize', bytes(heldBytes(row))],
    ['leftUntilDone', bytes(row.leftUntilDone)],
    ['eta', formatDuration(row.eta ?? -1)],
    ['percentDone', progressText(row.percentDone)],
    ['rateDownload', bytes(row.rateDownload, true)],
    ['rateUpload', bytes(row.rateUpload, true)],
    ['seederCount', peerCount(row.seederCount, row.peersSendingToUs)],
    ['leecherCount', peerCount(row.leecherCount, row.peersGettingFromUs)],
    ['uploadedEver', bytes(row.uploadedEver)],
    ['downloadedEver', bytes(row.downloadedEver)],
    ['uploadRatio', formatRatio(row.uploadRatio ?? -1)],
    ['addedDate', date(row.addedDate)],
    ['doneDate', date(row.doneDate)],
    ['activityDate', date(row.activityDate)],
    ['creator', row.creator],
    ['dateCreated', date(row.dateCreated)],
    ['pieceCount', row.pieceCount],
    ['pieceSize', bytes(row.pieceSize)],
    ['haveValid', bytes(row.haveValid)],
    ['haveUnchecked', bytes(row.haveUnchecked)],
    ['description', row.comment],
    ['errorString', row.errorString],
  ];
  return entries.map(([key, value]) => ({
    key,
    value: value === undefined || value === '' ? '—' : String(value),
  }));
});
async function attempt(work: () => Promise<unknown>) {
  const epoch = app.generation,
    identity = app.current?.hashString;
  busy.value = true;
  failure.value = '';
  try {
    await work();
  } catch (e) {
    if (epoch === app.generation && identity === app.current?.hashString)
      failure.value = compatibilityMessage(errorMessage(e), t);
  } finally {
    busy.value = false;
  }
}
async function fileCommand(key: string) {
  if (!checkedFiles.value.length) return;
  const targets = [app.detailTarget()],
    indexes = [...checkedFiles.value];
  await attempt(async () => {
    await app.command('torrent-set', targets, { [key]: indexes });
    if (
      app.selectedId === targets[0].id &&
      app.generation === targets[0].generation &&
      app.detailSection === 'files'
    )
      await app.loadDetail('files');
  });
}
async function renameFile() {
  const target = renameTarget.value!;
  await attempt(async () => {
    if (!renameValue.value.trim() || /[/\\]/.test(renameValue.value)) throw new Error(t('newName'));
    await app.command('torrent-rename-path', [target], {
      path: renamePath.value,
      name: renameValue.value.trim(),
    });
    if (renameTarget.value === target) renameTarget.value = undefined;
    if (
      app.selectedId === target.id &&
      app.generation === target.generation &&
      app.detailSection === 'files'
    )
      await app.loadDetail('files');
  });
}
function editTrackers() {
  trackerAttempted.value = false;
  failure.value = '';
  trackerTarget.value = app.detailTarget();
  originalTrackers.value = trackerSnapshot(app.detail?.trackers);
  expectedTrackers.value = trackerSnapshot(app.detail?.trackers);
  trackerText.value = originalTrackers.value
    .map((x, i, a) => `${i && x.tier !== a[i - 1].tier ? '\n' : ''}${x.announce}`)
    .join('\n');
  trackerEdit.value = true;
}
const trackerReplacement = computed(() => {
  if (app.trackerCapability.state === 'url-only') return originalTrackers.value;
  let tier = 0,
    index = 0;
  return trackerText.value.split('\n').flatMap((line) => {
    const announce = line.trim();
    if (!announce) {
      tier++;
      return [];
    }
    const prior = originalTrackers.value[index++];
    return [{ announce, tier, ...(prior ? { id: prior.id } : {}) }];
  });
});
const trackerPlanError = computed(() => {
  if (!trackerEdit.value) return '';
  try {
    trackerPatch(expectedTrackers.value, trackerReplacement.value, app.trackerCapability);
    return '';
  } catch (e) {
    return compatibilityMessage(errorMessage(e), t);
  }
});
watch(
  () => app.generation,
  () => {
    trackerEdit.value = false;
    renameTarget.value = undefined;
  },
);
async function saveTrackers() {
  if (trackerAttempted.value || busy.value || trackerPlanError.value) return;
  trackerAttempted.value = true;
  const target = trackerTarget.value!;
  await attempt(async () => {
    await app.updateTrackers(target, expectedTrackers.value, trackerReplacement.value);
    if (trackerTarget.value === target) trackerEdit.value = false;
  });
}
async function lookup(ip: string) {
  await attempt(async () => {
    ipResult.value = await externalText(
      app.settings.ui.ipUrl.replaceAll('{ip}', encodeURIComponent(ip)),
    );
  });
}
async function copyMagnet() {
  try {
    await navigator.clipboard.writeText(app.detail?.magnetLink ?? '');
    message.success(t('copied'));
  } catch (e) {
    message.error(errorMessage(e));
  }
}
</script>
<template>
  <div class="detail-pane">
    <header class="detail-header">
      <strong :title="app.current?.name">{{ app.current?.name }}</strong><NButton
        quaternary
        size="small"
        :aria-label="t('collapseDetails')"
        @click="app.select(null)"
        ><template #icon><ChevronDown :size="14" /></template>{{ t('collapseDetails') }}</NButton
      >
    </header>
    <NTabs
      role="tablist"
      :aria-label="t('general')"
      :value="app.detailSection"
      size="small"
      type="line"
      @update:value="(value) => app.loadDetail(value as DetailSection)"
      ><NTab
        v-for="section in ['general', 'files', 'trackers', 'peers']"
        :key="section"
        :name="section"
        role="tab"
        :aria-selected="app.detailSection === section"
        :tabindex="app.detailSection === section ? 0 : -1"
        @keydown.enter="app.loadDetail(section as DetailSection)"
        @keydown.space.prevent="app.loadDetail(section as DetailSection)"
        >{{ t(section) }}</NTab
      ></NTabs
    ><NAlert
      v-if="app.detailError || failure"
      type="error"
      closable
      @close="
        failure = '';
        app.detailError = '';
      "
      >{{ failure || app.detailError }}</NAlert
    >
    <div class="detail-content">
      <dl v-if="app.detailSection === 'general'" class="overview-grid">
        <template v-for="entry in overview" :key="entry.key"
          ><dt
            :title="
              entry.key === 'completeSize'
                ? t('heldBytesHint')
                : ['seederCount', 'leecherCount'].includes(entry.key)
                  ? t('trackerReportsHint')
                  : undefined
            "
          >
            {{ t(entry.key) }}
          </dt>
          <dd :class="{ mono: entry.key === 'hashString' }">{{ entry.value }}</dd></template
        >
        <dt>Magnet</dt>
        <dd>
          <NButton size="tiny" :disabled="!app.detail?.magnetLink" @click="copyMagnet">{{
            t('copyMagnet')
          }}</NButton>
        </dd>
      </dl>
      <section
        v-if="app.detailSection === 'general' && app.detail?.pieces"
        class="overview-pieces"
        :aria-label="t('pieceProgress')"
      >
        <h3>{{ t('pieceProgress') }}</h3>
        <PieceMap
          :key="app.selectedId!"
          :encoded="app.detail.pieces"
          :count="app.detail.pieceCount || 0"
          :piece-size="app.detail.pieceSize ?? NaN"
          :total-size="app.detail.totalSize ?? NaN"
        />
      </section>
      <template v-if="app.detailSection === 'files'">
        <span v-if="fileFilter === 'invalid'" class="error-text">{{ t('invalidRegex') }}</span>
        <NDataTable
          class="torrent-file-table"
          v-model:checked-row-keys="checkedFiles"
          :columns="fileColumns"
          :data="pagedFiles"
          :row-key="(row) => row.index"
          remote
          virtual-scroll
          flex-height
          :min-row-height="32"
          :height-for-row="() => 32"
          :scroll-x="990"
          size="small"
          :bordered="false"
          @update:sorter="fileSortChanged"
        />
        <footer class="file-list-footer">
          <div class="file-page-controls">
            <span class="file-list-summary">{{
              t('fileListSummary', {
                from: files.length ? (filePage - 1) * filePageSize + 1 : 0,
                to: Math.min(filePage * filePageSize, files.length),
                matched: files.length,
                total: allFiles.length,
                selected: checkedFiles.length,
              })
            }}</span>
            <NPagination
              v-model:page="filePage"
              :page-size="filePageSize"
              :item-count="files.length"
              :page-slot="3"
              size="small"
              show-size-picker
              show-quick-jumper
              :page-sizes="
                [...new Set([10, 20, 30, 40, 50, 100, 150, 200, 250, 300, 5000, filePageSize])]
                  .sort((a, b) => a - b)
                  .map((value) => ({ label: t('perPage', { count: value }), value }))
              "
              :prefix="() => t('pageOf', { page: filePage, pages: filePages })"
              :aria-label="t('filePagination')"
              @update:page-size="(filePageSize) => app.updateUi({ filePageSize })"
            />
          </div>
          <div class="file-action-controls">
            <NButton
              size="tiny"
              :title="t('refreshFiles')"
              :aria-label="t('refreshFiles')"
              :loading="app.detailLoading"
              :disabled="busy || !app.ready || app.stale"
              @click="refreshFiles"
              ><template #icon><RefreshCw :size="15" /></template
            ></NButton>
            <NButton size="tiny" :disabled="fileActionDisabled" @click="fileCommand('files-wanted')"
              ><template #icon><Check :size="15" /></template>{{ t('wanted') }}</NButton
            >
            <NButton
              size="tiny"
              :disabled="fileActionDisabled"
              @click="fileCommand('files-unwanted')"
              ><template #icon><Ban :size="15" /></template>{{ t('unwanted') }}</NButton
            >
            <NDropdown
              :options="filePriorityOptions"
              :disabled="fileActionDisabled"
              trigger="click"
              @select="fileCommand"
              ><NButton size="tiny" :aria-label="t('filePriority')" :disabled="fileActionDisabled"
                ><template #icon><Flag :size="15" /></template>{{ t('priority')
                }}<ChevronDown :size="12" /></NButton
            ></NDropdown>
            <NSelect
              v-model:value="filePreset"
              class="file-preset"
              size="small"
              :options="filePresets"
              :aria-label="t('filePreset')"
            />
            <NInput
              v-model:value="fileQuery"
              class="file-query"
              size="small"
              :placeholder="t('fileSearch')"
              clearable
            />
            <NCheckbox v-model:checked="regex">{{ t('regex') }}</NCheckbox>
          </div>
        </footer>
      </template>
      <template v-if="app.detailSection === 'trackers'"
        ><div class="detail-toolbar">
          <NButton
            size="tiny"
            :disabled="
              !app.detail?.trackers ||
              busy ||
              app.operationBusy ||
              app.trackerCapability.state === 'unknown'
            "
            @click="editTrackers"
            >{{ t('edit') }}</NButton
          >
        </div>
        <NDataTable
          :columns="trackerColumns"
          :data="app.detail?.trackerStats || app.detail?.trackers || []"
          :row-key="(row) => row.id"
          virtual-scroll
          flex-height
          :scroll-x="900"
          size="small"
          :bordered="false"
      /></template>
      <NDataTable
        v-if="app.detailSection === 'peers'"
        :columns="peerColumns"
        :data="app.detail?.peers || []"
        :row-key="(row) => `${row.address}:${row.port}`"
        virtual-scroll
        flex-height
        :scroll-x="900"
        size="small"
        :bordered="false"
      />
    </div>
    <NModal
      v-model:show="trackerEdit"
      preset="card"
      :title="t('trackerEditor')"
      class="dialog medium-dialog"
      ><template v-if="app.trackerCapability.state === 'url-only'">
        <p>{{ t('trackerUrlOnly') }}</p>
        <label v-for="(row, index) in originalTrackers" :key="row.id ?? `new-${index}`">
          {{ t('tier') }} {{ row.tier }}
          <NInput v-model:value="row.announce" :disabled="busy || trackerAttempted" />
          <NButton
            :disabled="busy || trackerAttempted"
            @click="originalTrackers.splice(index, 1)"
            >{{ t('remove') }}</NButton
          >
        </label>
        <NButton
          :disabled="busy || trackerAttempted"
          @click="
            originalTrackers.push({
              announce: '',
              tier: originalTrackers.length
                ? Math.max(...originalTrackers.map((x) => x.tier)) + 1
                : 0,
            })
          "
          >{{ t('trackerAddMember') }}</NButton
        > </template
      ><NInput
        v-else
        v-model:value="trackerText"
        type="textarea"
        :autosize="{ minRows: 8, maxRows: 20 }"
      /><NAlert v-if="trackerPlanError" type="warning">{{ trackerPlanError }}</NAlert
      ><NAlert v-if="failure" type="error">{{ failure }}</NAlert
      ><template #footer
        ><NButton
          v-if="trackerAttempted"
          :disabled="busy"
          @click="
            async () => {
              await app.loadDetail('trackers');
              if (!app.detailError) editTrackers();
            }
          "
          >{{ t('reloadBaseline') }}</NButton
        ><NButton
          :disabled="
            trackerAttempted ||
            !!trackerPlanError ||
            app.operationBusy ||
            app.trackerCapability.state === 'unknown'
          "
          type="primary"
          :loading="busy"
          @click="saveTrackers"
          >{{ t('save') }}</NButton
        ></template
      ></NModal
    ><NModal
      :show="!!renameTarget"
      @update:show="
        (show) => {
          if (!show) renameTarget = undefined;
        }
      "
      preset="card"
      :title="t('rename')"
      class="dialog small-dialog"
      @close="renameTarget = undefined"
      ><p>{{ renamePath }}</p>
      <NInput v-model:value="renameValue" /><NAlert v-if="failure" type="error">{{
        failure
      }}</NAlert
      ><NButton type="primary" :loading="busy" @click="renameFile">{{ t('save') }}</NButton></NModal
    ><NModal
      :show="!!ipResult"
      @update:show="
        (show) => {
          if (!show) ipResult = '';
        }
      "
      preset="card"
      :title="t('ipLookup')"
      class="dialog medium-dialog"
      @close="ipResult = ''"
    >
      <pre class="text-result">{{ ipResult }}</pre>
    </NModal>
  </div>
</template>
