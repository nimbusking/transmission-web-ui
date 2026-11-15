<script setup lang="ts">
import { computed, h, reactive, ref, watch } from 'vue';
import {
  NTabs,
  NTab,
  NButton,
  NInput,
  NCheckbox,
  NInputNumber,
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
  CONFIG_FIELDS,
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
const fileQuery = ref(''),
  regex = ref(false),
  checkedFiles = ref<number[]>([]),
  trackerEdit = ref(false),
  trackerText = ref(''),
  trackerTarget = ref<TorrentTarget>(),
  expectedTrackers = ref<string[]>([]),
  originalTrackers = ref<{ id: number; announce: string; tier: number }[]>([]);
const configDraft = reactive<Record<string, any>>({}),
  dirty = ref(false),
  configTarget = ref<TorrentTarget>(),
  busy = ref(false),
  failure = ref(''),
  ipResult = ref(''),
  renamePath = ref(''),
  renameValue = ref(''),
  renameTarget = ref<TorrentTarget>();
watch(
  () => app.selectedId,
  () => {
    dirty.value = false;
    checkedFiles.value = [];
    fileQuery.value = '';
    failure.value = '';
    configTarget.value = undefined;
  },
);
watch(
  () => app.detail,
  (detail) => {
    if (detail && app.detailSection === 'config' && !dirty.value && app.selectedId !== null) {
      for (const key of CONFIG_FIELDS.filter((x) => x !== 'id')) configDraft[key] = detail[key];
      configTarget.value = app.targets([app.selectedId])[0];
    }
  },
);
const fileFilter = computed(() => {
  try {
    return regex.value ? new RegExp(fileQuery.value, 'i') : null;
  } catch {
    return 'invalid';
  }
});
const files = computed(() =>
  (app.detail?.files ?? [])
    .map((file, index) => ({ ...file, index, stat: app.detail?.fileStats?.[index] }))
    .filter((file) =>
      fileFilter.value === 'invalid'
        ? false
        : fileFilter.value
          ? fileFilter.value.test(file.name)
          : file.name.toLowerCase().includes(fileQuery.value.toLowerCase()),
    ),
);
watch([fileQuery, regex], () => (checkedFiles.value = []));
const fileColumns = computed<DataTableColumns<any>>(() => [
  { type: 'selection', width: 40 },
  { key: 'name', title: t('name'), minWidth: 320, ellipsis: { tooltip: true } },
  { key: 'length', title: t('totalSize'), width: 110, render: (row) => formatBytes(row.length) },
  {
    key: 'progress',
    title: t('percentDone'),
    width: 100,
    render: (row) => `${(fileProgress(row.bytesCompleted, row.length) * 100).toFixed(1)}%`,
  },
  {
    key: 'wanted',
    title: t('wantedColumn'),
    width: 90,
    render: (row) => (row.stat?.wanted ? '✓' : '—'),
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
            : 'priorityNormal',
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
            renameTarget.value = app.targets([app.selectedId!])[0];
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
    [
      'completeSize',
      bytes(Math.max(0, (row.totalSize ?? 0) - (row.leftUntilDone ?? row.totalSize ?? 0))),
    ],
    ['leftUntilDone', bytes(row.leftUntilDone)],
    ['eta', formatDuration(row.eta ?? -1)],
    ['percentDone', `${((row.percentDone ?? 0) * 100).toFixed(1)}%`],
    ['rateDownload', bytes(row.rateDownload, true)],
    ['rateUpload', bytes(row.rateUpload, true)],
    ['seederCount', `${row.seederCount ?? 0} (${row.peersSendingToUs ?? 0})`],
    ['leecherCount', `${row.leecherCount ?? 0} (${row.peersGettingFromUs ?? 0})`],
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
  busy.value = true;
  failure.value = '';
  try {
    await work();
  } catch (e) {
    failure.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function fileCommand(key: string) {
  if (!checkedFiles.value.length) return;
  const targets = app.targets([app.selectedId!]),
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
  trackerTarget.value = app.targets([app.selectedId!])[0];
  originalTrackers.value = (app.detail?.trackers ?? []).map((x) => ({ ...x }));
  expectedTrackers.value = originalTrackers.value.map((x) => x.announce);
  trackerText.value = originalTrackers.value
    .map((x, i, a) => `${i && x.tier !== a[i - 1].tier ? '\n' : ''}${x.announce}`)
    .join('\n');
  trackerEdit.value = true;
}
async function saveTrackers() {
  let tier = 0,
    index = 0;
  const replacement = trackerText.value.split('\n').flatMap((line) => {
    const announce = line.trim();
    if (!announce) {
      tier++;
      return [];
    }
    const prior = originalTrackers.value[index++];
    return [{ announce, tier, ...(prior ? { id: prior.id } : {}) }];
  });
  const target = trackerTarget.value!;
  await attempt(async () => {
    await app.updateTrackers(target, expectedTrackers.value, replacement);
    if (trackerTarget.value === target) trackerEdit.value = false;
  });
}
async function saveConfig() {
  const target = configTarget.value!,
    draft = { ...configDraft };
  await attempt(async () => {
    await app.command('torrent-set', [target], draft);
    if (
      app.selectedId === target.id &&
      app.generation === target.generation &&
      app.detailSection === 'config' &&
      JSON.stringify(configDraft) === JSON.stringify(draft)
    ) {
      dirty.value = false;
      await app.loadDetail('config');
    }
    message.success(t('success'));
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
        size="tiny"
        :aria-label="t('close')"
        @click="app.select(null)"
        >×</NButton
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
        v-for="section in ['general', 'files', 'trackers', 'peers', 'config']"
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
          ><dt>{{ t(entry.key) }}</dt>
          <dd :class="{ mono: entry.key === 'hashString' }">{{ entry.value }}</dd></template
        >
        <dt>Magnet</dt>
        <dd>
          <NButton size="tiny" :disabled="!app.detail?.magnetLink" @click="copyMagnet">{{
            t('copyMagnet')
          }}</NButton>
        </dd>
        <dt>{{ t('pieceProgress') }}</dt>
        <dd>
          <PieceMap
            v-if="app.detail?.pieces"
            :encoded="app.detail.pieces"
            :count="app.detail.pieceCount || 0"
          />
        </dd>
      </dl>
      <template v-if="app.detailSection === 'files'"
        ><div class="detail-toolbar">
          <NInput
            v-model:value="fileQuery"
            size="small"
            :placeholder="t('fileSearch')"
            clearable
          /><NCheckbox v-model:checked="regex">{{ t('regex') }}</NCheckbox
          ><NButton
            v-for="[key, text] in [
              ['files-wanted', 'wanted'],
              ['files-unwanted', 'unwanted'],
              ['priority-high', 'priorityHigh'],
              ['priority-normal', 'priorityNormal'],
              ['priority-low', 'priorityLow'],
            ]"
            :key="key"
            size="tiny"
            :disabled="!checkedFiles.length || busy"
            @click="fileCommand(key)"
            >{{ t(text) }}</NButton
          >
        </div>
        <span v-if="fileFilter === 'invalid'" class="error-text">{{
          t('invalidRegex')
        }}</span><NDataTable
          v-model:checked-row-keys="checkedFiles"
          :columns="fileColumns"
          :data="files"
          :row-key="(row) => row.index"
          virtual-scroll
          flex-height
          :min-row-height="32"
          :height-for-row="() => 32"
          :scroll-x="900"
          size="small"
          :bordered="false"
      /></template>
      <template v-if="app.detailSection === 'trackers'"
        ><div class="detail-toolbar">
          <NButton size="tiny" :disabled="!app.detail || busy" @click="editTrackers">{{
            t('edit')
          }}</NButton>
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
      <div v-if="app.detailSection === 'config'" class="config-grid">
        <label
          v-for="key in CONFIG_FIELDS.filter((x) => x !== 'id' && configDraft[x] !== undefined)"
          :key="key"
          ><span>{{ t(key) }}</span
          ><NCheckbox
            v-if="typeof configDraft[key] === 'boolean'"
            v-model:checked="configDraft[key]"
            @update:checked="dirty = true" /><NInputNumber
            v-else
            v-model:value="configDraft[key]"
            :min="key === 'bandwidthPriority' ? -1 : 0"
            :max="key.endsWith('Mode') ? 2 : key === 'bandwidthPriority' ? 1 : undefined"
            size="small"
            @update:value="dirty = true" /></label
        ><NButton
          type="primary"
          :loading="busy"
          :disabled="!dirty || !configTarget"
          @click="saveConfig"
          >{{ t('save') }}</NButton
        >
      </div>
    </div>
    <NModal
      v-model:show="trackerEdit"
      preset="card"
      :title="t('trackerList')"
      class="dialog medium-dialog"
      ><NInput
        v-model:value="trackerText"
        type="textarea"
        :autosize="{ minRows: 8, maxRows: 20 }"
      /><NAlert v-if="failure" type="error">{{ failure }}</NAlert
      ><template #footer
        ><NButton type="primary" :loading="busy" @click="saveTrackers">{{
          t('save')
        }}</NButton></template
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
