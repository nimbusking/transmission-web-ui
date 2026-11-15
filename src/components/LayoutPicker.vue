<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NModal, useMessage } from 'naive-ui';
import { PanelsTopLeft, Check } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { LAYOUT_THEME_IDS, layoutTheme, type LayoutTheme } from '../domain/themes';
import { errorMessage } from '../domain/torrents';
const app = useAppStore(),
  { t } = useI18n(),
  message = useMessage();
const open = ref(false),
  saving = ref(false);
const selected = computed(() => layoutTheme(app.settings.ui.layoutTheme));
async function choose(value: LayoutTheme) {
  if (saving.value || value === selected.value) return;
  saving.value = true;
  try {
    await app.updateUi({ layoutTheme: value });
  } catch (error) {
    message.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <NButton
    class="appearance-trigger layout-trigger"
    secondary
    :aria-label="t('layoutThemes')"
    :title="t('layoutThemes')"
    @click="open = true"
  >
    <template #icon><PanelsTopLeft :size="18" aria-hidden="true" /></template>
    <span>{{ t('layout') }}</span>
  </NButton>
  <NModal
    v-if="open"
    :show="true"
    preset="card"
    :title="t('layoutThemes')"
    class="dialog layout-dialog"
    @update:show="
      (show) => {
        if (!show) open = false;
      }
    "
  >
    <p class="theme-intro">{{ t('layoutThemeHint') }}</p>
    <div class="theme-options" role="group" :aria-label="t('layoutThemes')">
      <button
        v-for="id in LAYOUT_THEME_IDS"
        :key="id"
        type="button"
        :class="['theme-option', { selected: selected === id }]"
        :aria-pressed="selected === id"
        :aria-label="t(`layout_${id}`)"
        :disabled="saving"
        @click="choose(id)"
      >
        <span :class="['theme-preview', `preview-${id}`]" aria-hidden="true">
          <span class="preview-header" /><span class="preview-toolbar" /><span
            class="preview-nav"
          />
          <span class="preview-content"><i /><i /><i /><i /></span>
        </span>
        <span class="theme-option-title"
          >{{ t(`layout_${id}`) }}<Check v-if="selected === id" :size="16" aria-hidden="true"
        /></span>
        <span class="theme-description">{{ t(`layout_${id}_description`) }}</span>
      </button>
    </div>
  </NModal>
</template>
