<script setup lang="ts">
import { compatibilityMessage } from '../i18n/compatibility';
import { reactive, ref, computed, onUnmounted, watch } from 'vue';
import {
  NModal,
  NButton,
  NInput,
  NInputNumber,
  NCheckbox,
  NSelect,
  NAlert,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import type { TorrentTarget } from '../domain/types';
import { LIMIT_FIELDS, type LimitIntent, type LimitBaseline } from '../domain/limits';
import { safeCount } from '../domain/status';
import { errorMessage } from '../domain/torrents';
const props = defineProps<{ action: string; targets: TorrentTarget[] }>(),
  emit = defineEmits<{ close: [] }>();
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage(),
  frozen = props.targets.map((x) => ({ ...x }));
const names = frozen.map((x) => app.byId.get(x.id)?.name ?? x.hashString);
const name = ref(names[0] ?? ''),
  directory = ref(app.byId.get(frozen[0]?.id)?.downloadDir ?? ''),
  move = ref(false),
  verify = ref(false),
  deleteData = ref(false),
  labels = ref<string[]>(
    frozen.length === 1 ? [...(app.settings.torrentLabels[frozen[0].hashString] ?? [])] : [],
  ),
  busy = ref(false),
  verificationAttempted = ref(false),
  globalAttempted = ref(false),
  error = ref('');
const limits = reactive<LimitIntent>({
  download: { mode: 'keep', value: null },
  upload: { mode: 'keep', value: null },
});
const baselines = ref<LimitBaseline[]>([]),
  loading = ref(false),
  attempted = ref(false);
let loadSequence = 0;
onUnmounted(() => {
  loadSequence++;
});
watch(
  () => app.generation,
  () => {
    loadSequence++;
    baselines.value = [];
  },
);
const limitDisabled = computed(
  () =>
    loading.value ||
    attempted.value ||
    baselines.value.length !== frozen.length ||
    (['download', 'upload'] as const).every((d) => limits[d].mode === 'keep') ||
    (['download', 'upload'] as const).some(
      (d) =>
        limits[d].mode === 'limit' &&
        (safeCount(limits[d].value) === undefined ||
          (/^3\.00(?:\D|$)/.test(app.session?.version ?? '') && limits[d].value! > 4294967)),
    ),
);
function currentLimit(direction: 'download' | 'upload') {
  if (!baselines.value.length) return t('unknown');
  const values = baselines.value.map(({ row }) =>
    typeof row[`${direction}Limited`] !== 'boolean' ||
    safeCount(row[`${direction}Limit`]) === undefined
      ? t('unknown')
      : `${row[`${direction}Limited`] ? t('limitTo') : t('disableTaskLimit')}: ${row[`${direction}Limit`]} KB/s`,
  );
  return new Set(values).size === 1 ? values[0] : t('mixedValues');
}
async function loadLimits() {
  const sequence = ++loadSequence;
  loading.value = true;
  baselines.value = [];
  error.value = '';
  try {
    const values: LimitBaseline[] = [];
    for (const target of frozen)
      values.push({ target, row: await app.readTarget(target, LIMIT_FIELDS) });
    if (sequence !== loadSequence) return;
    baselines.value = values;
    attempted.value = false;
    for (const d of ['download', 'upload'] as const) {
      const valuesForDirection = values.map(({ row }) => safeCount(row[`${d}Limit`]));
      if (limits[d].mode === 'keep')
        limits[d].value =
          new Set(valuesForDirection).size === 1 ? (valuesForDirection[0] ?? null) : null;
    }
  } catch (e) {
    if (sequence === loadSequence) error.value = compatibilityMessage(errorMessage(e), t);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
if (props.action === 'limits') void loadLimits();
const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);
function focusCancel() {
  if (['verify', 'startAll', 'stopAll'].includes(props.action)) cancelButton.value?.$el.focus();
}
async function submit() {
  if (busy.value) return;
  const epoch = app.generation;
  busy.value = true;
  error.value = '';
  try {
    if (props.action === 'limits') {
      if (limitDisabled.value) return;
      attempted.value = true;
      const result = await app.saveLimits(
        baselines.value,
        structuredClone({ download: { ...limits.download }, upload: { ...limits.upload } }),
      );
      if (epoch !== app.generation) return;
      error.value = result.items
        .map((x) => `${x.name}: ${t(x.status)} ${compatibilityMessage(x.message ?? '', t)}`)
        .join('\n');
      return;
    }
    if (props.action === 'labels') {
      app.validateTargets(frozen);
      await app.assignLabels(
        frozen.map((x) => x.hashString),
        labels.value,
      );
    } else {
      let method = '',
        args: Record<string, unknown> = {};
      if (props.action === 'remove') {
        method = 'torrent-remove';
        args = { 'delete-local-data': deleteData.value };
      }
      if (props.action === 'rename') {
        if (!name.value.trim() || /[/\\]/.test(name.value)) throw new Error(t('newName'));
        method = 'torrent-rename-path';
        args = { path: names[0], name: name.value.trim() };
      }
      if (props.action === 'move') {
        if (!directory.value.trim()) throw new Error(t('directory'));
        method = 'torrent-set-location';
        args = { location: directory.value.trim(), move: move.value };
      }
      if (props.action === 'verify') method = 'torrent-verify';
      if (props.action === 'startAll') method = 'torrent-start';
      if (props.action === 'stopAll') method = 'torrent-stop';
      if (props.action === 'verify') verificationAttempted.value = true;
      if (['startAll', 'stopAll'].includes(props.action)) globalAttempted.value = true;
      const result = await app.execute(method, frozen, args);
      if (result.items.some((x) => x.status !== 'success')) {
        error.value = result.items
          .filter((x) => x.status !== 'success')
          .map((x) => `${x.name}: ${t(x.status)} ${compatibilityMessage(x.message ?? '', t)}`)
          .join('\n');
        return;
      }
      if (props.action === 'move' && verify.value) {
        const verification = await app.execute('torrent-verify', frozen);
        if (verification.items.some((x) => x.status !== 'success')) {
          error.value = verification.items
            .map((x) => `${x.name}: ${t(x.status)} ${compatibilityMessage(x.message ?? '', t)}`)
            .join('\n');
          return;
        }
      }
    }
    if (props.action === 'verify') {
      message.info(t('verifySubmitted'));
    }
    emit('close');
  } catch (e) {
    if (epoch === app.generation) error.value = compatibilityMessage(errorMessage(e), t);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <NModal
    :show="true"
    @update:show="
      (show) => {
        if (!show && !busy) emit('close');
      }
    "
    preset="card"
    :title="t(action)"
    class="dialog medium-dialog"
    :close-on-esc="!busy"
    :closable="!busy"
    :mask-closable="!busy"
    @close="emit('close')"
    @after-enter="focusCancel"
    ><p>{{ t('targetCount', { count: frozen.length }) }}</p>
    <div class="target-list">
      <div v-for="(item, index) in names" :key="index">{{ item }}</div>
    </div>
    <div class="form-stack">
      <NAlert v-if="action === 'verify'" type="warning" :bordered="false">{{
        t('verifyHint')
      }}</NAlert>
      <NAlert
        v-if="action === 'startAll' || action === 'stopAll'"
        type="warning"
        :bordered="false"
        >{{ t('globalActionHint') }}</NAlert
      >
      <template v-if="action === 'remove'"
        ><p>{{ t('removeHint') }}</p>
        <NCheckbox v-model:checked="deleteData">{{ t('deleteData') }}</NCheckbox></template
      ><label v-if="action === 'rename'">{{ t('newName') }}<NInput v-model:value="name" /></label
      ><template v-if="action === 'move'"
        ><label>{{ t('directory') }}<NInput v-model:value="directory" /></label
        ><NSelect
          v-if="app.settings.folderDictionary.length"
          :options="app.settings.folderDictionary.map((value) => ({ label: value, value }))"
          :placeholder="t('folderDictionary')"
          @update:value="(value) => (directory = value)"
        /><NCheckbox v-model:checked="move">{{ t('moveData') }}</NCheckbox
        ><NCheckbox v-model:checked="verify">{{ t('verifyAfter') }}</NCheckbox
        ><small v-if="verify">{{ t('verifyHint') }}</small
        ><small>{{ t('locateHint') }}</small></template
      ><template v-if="action === 'limits'">
        <div v-for="direction in ['download', 'upload'] as const" :key="direction">
          <label
            >{{ t(direction === 'download' ? 'downloadLimit' : 'uploadLimit') }}
            <small>{{ currentLimit(direction) }}</small>
            <NSelect
              v-model:value="limits[direction].mode"
              :disabled="loading || busy || attempted"
              :aria-label="t(direction === 'download' ? 'downloadLimited' : 'uploadLimited')"
              :options="[
                { label: t('keepUnchanged'), value: 'keep' },
                { label: t('disableTaskLimit'), value: 'disable' },
                { label: t('limitTo'), value: 'limit' },
              ]"
            />
          </label>
          <NInputNumber
            v-if="limits[direction].mode === 'limit'"
            v-model:value="limits[direction].value"
            :disabled="busy || attempted"
            :aria-label="t(direction === 'download' ? 'downloadLimit' : 'uploadLimit')"
          />
        </div>
        <small>{{ t('limitZeroHint') }}</small><small
          v-if="/^3\.00(?:\D|$)/.test(app.session?.version ?? '')"
          >{{ t('limit3Boundary') }}</small
        >
        <NButton :loading="loading" :disabled="busy" @click="loadLimits">{{
          t('reloadBaseline')
        }}</NButton> </template
      ><NSelect
        v-if="action === 'labels'"
        v-model:value="labels"
        multiple
        :options="app.settings.labels.map((x) => ({ label: x.name, value: x.id }))"
        :placeholder="t('labels')"
      /><NAlert v-if="error" type="error"
        >{{ error }}
        <p v-if="action === 'verify' && verificationAttempted">
          {{ t('verifyReconcile') }}
        </p>
        <p v-if="globalAttempted">{{ t('globalReconcile') }}</p></NAlert
      >
    </div>
    <template #footer
      ><div class="dialog-actions">
        <NButton
          v-if="['verify', 'startAll', 'stopAll', 'limits'].includes(action) && busy"
          @click="app.cancelOperations"
          >{{ t('cancelPending') }}</NButton
        >
        <NButton ref="cancelButton" :disabled="busy" @click="emit('close')">{{
          t('cancel')
        }}</NButton><NButton
          :type="action === 'remove' ? 'error' : 'primary'"
          :loading="busy"
          :disabled="
            (action === 'verify' && verificationAttempted) ||
            globalAttempted ||
            (action === 'limits' && limitDisabled)
          "
          @click="submit"
          >{{ t(action === 'verify' ? 'confirmVerify' : 'confirm') }}</NButton
        >
      </div></template
    ></NModal
  >
</template>
