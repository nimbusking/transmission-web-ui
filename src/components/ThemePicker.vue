<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NModal, useMessage } from 'naive-ui';
import { Palette, Check, Monitor } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { VISUAL_THEME_IDS, visualTheme, type VisualTheme } from '../domain/visual-themes';
import { errorMessage } from '../domain/torrents';
import StylePreview from './StylePreview.vue';
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const open = ref(false),
  saving = ref(false);
const selected = computed(() => visualTheme(app.settings.ui.visualTheme));
async function choose(id: VisualTheme) {
  if (saving.value || selected.value === id) return;
  saving.value = true;
  try {
    await app.updateUi({ visualTheme: id });
  } catch (e) {
    message.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
async function followSystem() {
  if (saving.value) return;
  saving.value = true;
  try {
    await app.updateUi({ theme: 'system' });
  } catch (e) {
    message.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <NButton
    class="appearance-trigger theme-trigger"
    secondary
    :aria-label="t('visualThemes')"
    :title="t('visualThemes')"
    @click="open = true"
  >
    <template #icon><Palette :size="18" aria-hidden="true" /></template
    ><span>{{ t('theme') }}</span>
  </NButton>
  <NModal
    v-if="open"
    :show="true"
    preset="card"
    :title="t('visualThemes')"
    class="dialog theme-dialog"
    @update:show="
      (show) => {
        if (!show) open = false;
      }
    "
  >
    <p class="theme-intro">{{ t('visualThemeHint') }}</p>
    <div class="theme-options" role="group" :aria-label="t('visualThemes')">
      <button
        v-for="id in VISUAL_THEME_IDS"
        :key="id"
        type="button"
        :class="['theme-option', { selected: selected === id }]"
        :aria-label="t(`skin_${id}`)"
        :aria-pressed="selected === id"
        :disabled="saving"
        @click="choose(id)"
      >
        <StylePreview :skin="id" />
        <span class="theme-option-title"
          >{{ t(`skin_${id}`) }}<Check v-if="selected === id" :size="16" aria-hidden="true"
        /></span>
        <span class="theme-description">{{ t(`skin_${id}_description`) }}</span>
      </button>
    </div>
    <div class="theme-picker-footer">
      <span>{{ t('colorModeLocation') }}</span>
      <NButton
        text
        size="small"
        :disabled="saving"
        :aria-pressed="app.settings.ui.theme === 'system'"
        @click="followSystem"
      >
        <template #icon><Monitor :size="15" aria-hidden="true" /></template
        >{{ t('followSystemColor') }}
      </NButton>
    </div>
  </NModal>
</template>
