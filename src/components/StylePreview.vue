<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { visualProfile, visualVariables, type VisualTheme } from '../domain/visual-themes';
const props = defineProps<{ skin: VisualTheme }>();
const { t } = useI18n();
const dark = inject(
  'color-mode-dark',
  computed(() => false),
);
const variables = computed(() => visualVariables(visualProfile(props.skin, dark.value)));
</script>
<template>
  <span class="style-preview" :data-skin="skin" :style="variables" aria-hidden="true">
    <span class="sample-heading">Transmission <i /></span>
    <span class="sample-controls"
      ><span class="sample-action">+ {{ t('themePreviewAdd') }}</span
      ><span class="sample-field">{{ t('themePreviewSearch') }}</span></span
    >
    <span class="sample-table"
      ><span class="sample-table-head"><i /><i /></span
      ><span class="sample-table-row"><i /><b /></span
      ><span class="sample-table-row selected"><i /><b /></span
    ></span>
  </span>
</template>
