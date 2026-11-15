<script setup lang="ts">
import { reactive, ref } from 'vue';
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
const limits = reactive({
  downloadLimited: true,
  downloadLimit: 100,
  uploadLimited: true,
  uploadLimit: 100,
});
const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);
function focusCancel() {
  if (['verify', 'startAll', 'stopAll'].includes(props.action)) cancelButton.value?.$el.focus();
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    if (props.action === 'labels') {
      app.targets(frozen.map((x) => x.id)).forEach((x, i) => {
        if (x.hashString !== frozen[i].hashString || x.generation !== frozen[i].generation)
          throw new Error('Task identity changed');
      });
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
      if (props.action === 'limits') {
        method = 'torrent-set';
        args = { ...limits };
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
          .map((x) => `${x.name}: ${t(x.status)} ${x.message ?? ''}`)
          .join('\n');
        return;
      }
      if (props.action === 'move' && verify.value) {
        const verification = await app.execute('torrent-verify', frozen);
        if (verification.items.some((x) => x.status !== 'success')) {
          error.value = verification.items
            .map((x) => `${x.name}: ${t(x.status)} ${x.message ?? ''}`)
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
    error.value = errorMessage(e);
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
      ><template v-if="action === 'limits'"
        ><NCheckbox v-model:checked="limits.downloadLimited">{{ t('downloadLimited') }}</NCheckbox
        ><NInputNumber
          v-model:value="limits.downloadLimit"
          :min="0"
          :precision="0"
          :aria-label="t('downloadLimit')" /><NCheckbox v-model:checked="limits.uploadLimited">{{
          t('uploadLimited')
        }}</NCheckbox
        ><NInputNumber
          v-model:value="limits.uploadLimit"
          :min="0"
          :precision="0"
          :aria-label="t('uploadLimit')" /></template
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
          v-if="['verify', 'startAll', 'stopAll'].includes(action) && busy"
          @click="app.cancelOperations"
          >{{ t('cancelPending') }}</NButton
        >
        <NButton ref="cancelButton" :disabled="busy" @click="emit('close')">{{
          t('cancel')
        }}</NButton><NButton
          :type="action === 'remove' ? 'error' : 'primary'"
          :loading="busy"
          :disabled="(action === 'verify' && verificationAttempted) || globalAttempted"
          @click="submit"
          >{{ t(action === 'verify' ? 'confirmVerify' : 'confirm') }}</NButton
        >
      </div></template
    ></NModal
  >
</template>
