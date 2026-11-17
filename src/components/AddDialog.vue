<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  NModal,
  NInput,
  NAutoComplete,
  NCheckbox,
  NSelect,
  NButton,
  NAlert,
  useMessage,
} from 'naive-ui';
import { Upload, File as FileIcon, X, FolderOpen } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { errorMessage } from '../domain/torrents';
import { torrentInput } from '../services/files';
const props = defineProps<{ files?: File[] }>(),
  emit = defineEmits<{ close: [] }>();
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const files = ref<File[]>(props.files ?? []),
  urls = ref(''),
  directory = ref(String(app.session?.['download-dir'] ?? '')),
  start = ref(false),
  setDefault = ref(false),
  labels = ref<string[]>([]),
  busy = ref(false),
  error = ref('');
const valid = computed(() => files.value.length > 0 || urls.value.trim().length > 0);
const fileInput = ref<HTMLInputElement>();
const dialogContent = ref<HTMLElement>();
watch(dialogContent, (element) => element?.focus({ preventScroll: true }), { flush: 'post' });
const dragging = ref(false);
const directoryOptions = computed(() =>
  [
    ...new Set([
      String(app.session?.['download-dir'] ?? ''),
      ...app.settings.folderDictionary,
      ...app.torrents.map((item) => item.downloadDir ?? ''),
    ]),
  ].filter(Boolean),
);
function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!busy.value) files.value.push(...Array.from(input.files ?? []));
  input.value = '';
}
function drop(event: DragEvent) {
  dragging.value = false;
  if (!busy.value) files.value.push(...Array.from(event.dataTransfer?.files ?? []));
}
async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const inputs: { name: string; filename?: string; metainfo?: string }[] = urls.value
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((filename) => ({ name: filename, filename }));
    const reading = await Promise.allSettled(files.value.map(torrentInput));
    const failures: string[] = [];
    reading.forEach((result, index) => {
      if (result.status === 'fulfilled') inputs.push(result.value);
      else failures.push(`${files.value[index].name}: ${errorMessage(result.reason)}`);
    });
    const result = await app.addTasks(inputs, {
      directory: directory.value.trim(),
      paused: !start.value,
      labels: labels.value,
      setDefault: setDefault.value,
    });
    if (failures.length) error.value = failures.join('\n');
    if (
      !failures.length &&
      result.items.every((x) => x.status === 'success' || x.status === 'duplicate')
    ) {
      message.success(t('success'));
      emit('close');
    }
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
    :auto-focus="false"
    @after-enter="dialogContent?.focus({ preventScroll: true })"
    @update:show="
      (show) => {
        if (!show && !busy) emit('close');
      }
    "
    preset="card"
    :title="t('add')"
    class="dialog medium-dialog"
    :mask-closable="!busy"
    :close-on-esc="!busy"
    :closable="!busy"
    @close="emit('close')"
    ><div
      ref="dialogContent"
      class="form-stack add-dialog-content"
      tabindex="-1"
      :aria-label="t('add')"
    >
      <input
        ref="fileInput"
        class="torrent-file-input"
        type="file"
        accept=".torrent"
        multiple
        :disabled="busy"
        :aria-label="t('chooseFiles')"
        @change="choose"
      />
      <button
        type="button"
        class="torrent-upload"
        :class="{ dragging }"
        :disabled="busy"
        @click="fileInput?.click()"
        @dragover.prevent.stop="dragging = !busy"
        @dragleave.prevent="dragging = false"
        @drop.prevent.stop="drop"
      >
        <span class="upload-icon"><Upload :size="22" aria-hidden="true" /></span>
        <span class="upload-copy"
          ><strong>{{ t('chooseFiles') }}</strong
          ><span>{{ t('dropFiles') }} · .torrent</span></span
        >
        <span class="upload-plus" aria-hidden="true">＋</span>
      </button>
      <div v-if="files.length" class="torrent-files">
        <div v-for="(file, index) in files" :key="index" class="torrent-file">
          <FileIcon :size="17" aria-hidden="true" /><span>{{ file.name }}</span
          ><NButton
            size="small"
            quaternary
            :aria-label="`${t('remove')} ${file.name}`"
            :disabled="busy"
            @click="files.splice(index, 1)"
            ><X :size="16" aria-hidden="true"
          /></NButton>
        </div>
      </div>
      <div class="add-directory">
        <label id="add-directory-label">{{ t('directory') }}</label>
        <NAutoComplete
          v-model:value="directory"
          :options="directoryOptions"
          :disabled="busy"
          :input-props="{ 'aria-labelledby': 'add-directory-label' }"
          :placeholder="t('directory')"
        >
          <template #suffix><FolderOpen :size="18" aria-hidden="true" /></template> </NAutoComplete
        ><small class="muted">{{ t('addHint') }}</small>
      </div>
      <label class="torrent-address"
        >{{ t('urls')
        }}<NInput
          v-model:value="urls"
          type="textarea"
          :placeholder="t('onePerLine')"
          :autosize="{ minRows: 3, maxRows: 8 }"
      /></label>
      <NSelect
        v-model:value="labels"
        multiple
        :options="app.settings.labels.map((x) => ({ label: x.name, value: x.id }))"
        :placeholder="t('labels')"
      /><NCheckbox v-model:checked="start">{{ t('startAdded') }}</NCheckbox
      ><NCheckbox v-model:checked="setDefault">{{ t('setDefault') }}</NCheckbox
      ><NAlert v-if="error" type="error">{{ error }}</NAlert>
      <div
        v-for="result in app.operationResults.filter(
          (x) => x.status !== 'success' && x.status !== 'duplicate',
        )"
        :key="result.id"
        class="result-row"
      >
        {{ result.name }} · {{ t(result.status) }} · {{ result.message }}
      </div>
    </div>
    <template #footer
      ><div class="dialog-actions">
        <NButton v-if="busy" @click="app.cancelOperations">{{
          t('cancelPending')
        }}</NButton><NButton :disabled="busy" @click="emit('close')">{{ t('cancel') }}</NButton
        ><NButton type="primary" :loading="busy" :disabled="!valid" @click="submit">{{
          t('add')
        }}</NButton>
      </div></template
    ></NModal
  >
</template>
<style scoped>
.add-dialog-content:focus {
  outline: none;
}
.torrent-file-input {
  display: none;
}
.torrent-upload {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  text-align: start;
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.torrent-upload:hover,
.torrent-upload.dragging {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}
.torrent-upload:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.torrent-upload:disabled {
  opacity: 0.5;
  cursor: default;
}
.upload-icon {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border-radius: 10px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.upload-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.upload-copy strong {
  font-weight: 600;
}
.upload-copy > span {
  font-size: 12px;
  color: var(--muted);
}
.upload-plus {
  color: var(--muted);
  font-size: 22px;
}
.torrent-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}
.torrent-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
}
.torrent-file > svg {
  flex-shrink: 0;
  color: var(--muted);
}
.torrent-file > span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.add-directory {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.add-directory :deep(.n-auto-complete) {
  min-width: 0;
}
.add-directory small {
  line-height: 1.5;
}
@media (max-width: 600px) {
  .torrent-upload {
    padding: 14px;
    gap: 10px;
  }
}
</style>
