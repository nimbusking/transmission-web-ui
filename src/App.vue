<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  darkTheme,
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NGlobalStyle,
  enUS,
  zhCN,
  dateEnUS,
  dateZhCN,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from './stores/app';
import { loadConfig } from './services/config';
import { errorMessage } from './domain/torrents';
const app = useAppStore(),
  { locale } = useI18n(),
  systemDark = ref(false);
const media = window.matchMedia('(prefers-color-scheme: dark)');
function updateTheme() {
  systemDark.value = media.matches;
}
const dark = computed(
  () =>
    app.settings.ui.theme === 'dark' || (app.settings.ui.theme === 'system' && systemDark.value),
);
onMounted(async () => {
  updateTheme();
  media.addEventListener('change', updateTheme);
  try {
    await app.initialize(await loadConfig());
  } catch (e) {
    app.error = errorMessage(e);
  }
});
onUnmounted(() => {
  app.dispose();
  media.removeEventListener('change', updateTheme);
});
const overrides = {
  common: {
    primaryColor: '#168c7e',
    primaryColorHover: '#24a493',
    primaryColorPressed: '#117568',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
  },
  DataTable: { tdPaddingSmall: '5px 10px', thPaddingSmall: '8px 10px' },
};
</script>
<template>
  <NConfigProvider
    :theme="dark ? darkTheme : null"
    :theme-overrides="overrides"
    :locale="locale === 'zh-CN' ? zhCN : enUS"
    :date-locale="locale === 'zh-CN' ? dateZhCN : dateEnUS"
  >
    <NGlobalStyle /><NMessageProvider
      ><NDialogProvider
        ><div :class="['application', { dark }]"><RouterView /></div></NDialogProvider
    ></NMessageProvider>
  </NConfigProvider>
</template>
