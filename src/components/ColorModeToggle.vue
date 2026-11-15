<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import { Sun, Moon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { errorMessage } from '../domain/torrents';
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const dark = inject(
  'color-mode-dark',
  computed(() => app.settings.ui.theme === 'dark'),
);
const saving = ref(false);
const label = computed(() => t(dark.value ? 'switchToLight' : 'switchToDark'));
async function toggle() {
  if (saving.value) return;
  const theme = dark.value ? 'light' : 'dark';
  saving.value = true;
  try {
    await app.updateUi({ theme });
  } catch (error) {
    message.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <NButton
    class="color-mode-toggle"
    circle
    :disabled="saving"
    :aria-label="label"
    :title="label"
    @click="toggle"
  >
    <Sun v-if="dark" :size="19" aria-hidden="true" /><Moon v-else :size="19" aria-hidden="true" />
  </NButton>
</template>
