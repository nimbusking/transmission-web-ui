<script setup lang="ts">
import { computed, ref } from 'vue';
import { NModal, NInput, NCheckbox, NSelect, NButton, NAlert, useMessage } from 'naive-ui';
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
function choose(event: Event) {
  files.value.push(...Array.from((event.target as HTMLInputElement).files ?? []));
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
    if (!failures.length && result.items.every((x) => x.status === 'success')) {
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
    ><div class="form-stack">
      <label
        >{{ t('urls')
        }}<NInput
          v-model:value="urls"
          type="textarea"
          :placeholder="t('onePerLine')"
          :autosize="{ minRows: 3, maxRows: 8 }" /></label
      ><label class="file-picker"
        >＋ {{ t('chooseFiles') }}<input type="file" accept=".torrent" multiple @change="choose"
      /></label>
      <div v-for="(file, index) in files" :key="index" class="file-choice">
        <span>{{ file.name }}</span><NButton
          size="tiny"
          quaternary
          :disabled="busy"
          @click="files.splice(index, 1)"
          >×</NButton
        >
      </div>
      <label
        >{{ t('directory')
        }}<NInput v-model:value="directory" :placeholder="t('directory')" /><small class="muted">{{
          t('addHint')
        }}</small></label
      ><NSelect
        v-if="app.settings.folderDictionary.length"
        :options="app.settings.folderDictionary.map((value) => ({ label: value, value }))"
        :placeholder="t('folderDictionary')"
        @update:value="(value) => (directory = value)"
      /><NSelect
        v-model:value="labels"
        multiple
        :options="app.settings.labels.map((x) => ({ label: x.name, value: x.id }))"
        :placeholder="t('labels')"
      /><NCheckbox v-model:checked="start">{{ t('startAdded') }}</NCheckbox
      ><NCheckbox v-model:checked="setDefault">{{ t('setDefault') }}</NCheckbox
      ><NAlert v-if="error" type="error">{{ error }}</NAlert>
      <div
        v-for="result in app.operationResults.filter((x) => x.status !== 'success')"
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
