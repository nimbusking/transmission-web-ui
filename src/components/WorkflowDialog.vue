<script setup lang="ts">
import { ref } from 'vue';
import { NModal, NInput, NButton, NAlert } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import type { TorrentTarget, Tracker } from '../domain/types';
import { errorMessage } from '../domain/torrents';
import { normalizeFolders } from '../services/settings';
import { runBatch } from '../services/batch';
import {
  cancelMatch,
  decidePartial,
  restoreMatch,
  resumeMatch,
  startMatch,
} from '../services/match-controller';
import { downloadJson } from '../services/files';
const props = defineProps<{ mode: string; targets: TorrentTarget[] }>(),
  emit = defineEmits<{ close: [] }>();
const app = useAppStore(),
  { t } = useI18n(),
  frozen = props.targets.map((x) => ({ ...x }));
const busy = ref(false),
  error = ref(''),
  folders = ref(app.settings.folderDictionary.join('\n')),
  oldUrl = ref(''),
  newUrl = ref('');
const preview = ref<{ target: TorrentTarget; name: string; before: string[]; after: Tracker[] }[]>(
  [],
);
async function attempt(work: () => Promise<unknown>) {
  busy.value = true;
  error.value = '';
  try {
    await work();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function prepare() {
  await attempt(async () => {
    preview.value = [];
    if (!oldUrl.value.trim()) throw new Error(t('oldUrl'));
    const rows: typeof preview.value = [];
    const results = await runBatch(
      frozen,
      async (target) => {
        const torrent = await app.readTarget(target, ['name', 'trackers']);
        const before = torrent.trackers ?? [];
        const after = before.map((tracker) => ({
          ...tracker,
          announce: tracker.announce.replaceAll(oldUrl.value, newUrl.value),
        }));
        if (after.some((tracker, i) => tracker.announce !== before[i].announce))
          rows.push({
            target,
            name: torrent.name ?? target.hashString,
            before: before.map((x) => x.announce),
            after,
          });
      },
      (target) => ({ id: target.id, name: app.byId.get(target.id)?.name ?? target.hashString }),
    );
    preview.value = rows;
    app.operationResults = results.items;
    if (results.items.some((x) => x.status !== 'success'))
      error.value = results.items
        .filter((x) => x.status !== 'success')
        .map((x) => `${x.name}: ${x.message ?? ''}`)
        .join('\n');
  });
}
async function replace() {
  const plan = preview.value.map((x) => ({ ...x }));
  await attempt(async () => {
    const result = await app.replaceTrackersBatch(plan);
    preview.value = [];
    if (result.items.some((x) => x.status !== 'success'))
      error.value = result.items
        .filter((x) => x.status !== 'success')
        .map((x) => `${x.name}: ${t(x.status)} ${x.message ?? ''}`)
        .join('\n');
  });
}
</script>
<template>
  <NModal
    :show="true"
    @update:show="
      (show) => {
        if (!show) emit('close');
      }
    "
    preset="card"
    :title="t(mode)"
    class="dialog large-dialog"
    @close="emit('close')"
    ><NAlert v-if="error" type="error">{{ error }}</NAlert
    ><template v-if="mode === 'replaceTrackers'"
      ><div class="form-stack">
        <label
          >{{ t('oldUrl') }}<NInput v-model:value="oldUrl" @update:value="preview = []" /></label
        ><label
          >{{ t('newUrl') }}<NInput v-model:value="newUrl" @update:value="preview = []" /></label
        ><NButton :loading="busy" :disabled="!oldUrl" @click="prepare">{{ t('preview') }}</NButton>
        <div v-for="item in preview" :key="item.target.hashString" class="import-preview">
          <strong>{{ item.name }}</strong>
          <div v-for="(url, i) in item.before" :key="i">
            <del v-if="url !== item.after[i].announce">{{ url }}</del> →
            {{ item.after[i].announce }}
          </div>
        </div>
        <NButton v-if="app.operationBusy" @click="app.cancelOperations">{{
          t('cancelPending')
        }}</NButton>
        <p v-if="app.operationBusy" class="muted">{{ t('batchCancelHint') }}</p>
        <NButton type="primary" :loading="busy" :disabled="!preview.length" @click="replace"
          >{{ t('apply') }} ({{ preview.length }})</NButton
        >
      </div></template
    ><template v-else
      ><p>{{ t('matchHint') }}</p>
      <NInput
        v-model:value="folders"
        type="textarea"
        :placeholder="t('candidates')"
        :autosize="{ minRows: 3, maxRows: 8 }"
      />
      <div class="button-row">
        <NButton
          type="primary"
          :disabled="
            !frozen.length || busy || app.matchJob?.running || !normalizeFolders(folders).length
          "
          @click="attempt(() => startMatch(frozen, normalizeFolders(folders)))"
          >{{ t('startMatch') }}</NButton><NButton
          :disabled="!app.matchJob || busy || app.matchJob.running"
          @click="attempt(resumeMatch)"
          >{{ t('resume') }}</NButton
        ><NButton :disabled="!app.matchJob?.running" @click="cancelMatch">{{ t('cancel') }}</NButton
        ><NButton
          v-if="app.matchJob"
          @click="downloadJson('folder-match-log.json', app.matchJob)"
          >{{ t('exportResults') }}</NButton
        >
      </div>
      <p class="muted">{{ t('cancellationHint') }}</p>
      <p v-if="app.matchJob?.items.some((x) => x.phase === 'interrupted')">{{ t('resumeHint') }}</p>
      <div
        v-for="item in app.matchJob?.items ?? []"
        :key="item.target.hashString"
        class="match-item"
      >
        <div>
          <strong>{{ item.name }}</strong><span
            >{{ t(item.phase) }} · {{ (item.progress * 100).toFixed(1) }}%</span
          >
        </div>
        <small
          >{{ t('originalDirectory') }}: {{ item.originalDir }}<br />{{ t('currentDirectory') }}:
          {{ item.currentDir }}</small
        >
        <p v-if="item.error" class="error-text">{{ item.error }}</p>
        <div class="button-row">
          <template v-if="item.phase === 'partial'"
            ><NButton
              size="tiny"
              :disabled="busy || app.matchJob?.running"
              @click="attempt(() => decidePartial(item.target.hashString, false))"
              >{{ t('continueMatch') }}</NButton
            ><NButton
              size="tiny"
              :disabled="busy || app.matchJob?.running"
              @click="attempt(() => decidePartial(item.target.hashString, true))"
              >{{ t('acceptPartial') }}</NButton
            ></template
          ><NButton
            v-if="item.currentDir !== item.originalDir"
            size="tiny"
            :disabled="busy || app.matchJob?.running"
            @click="attempt(() => restoreMatch(item))"
            >{{ t('restoreDirectory') }}</NButton
          >
        </div>
      </div></template
    ></NModal
  >
</template>
