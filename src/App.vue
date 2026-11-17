<script setup lang="ts">
import { hasPageLoginSession, readLoginSession } from './services/login-session';
import { diagnostics } from './services/diagnostics/recorder';
import { computed, onMounted, onUnmounted, provide, ref, watch, watchEffect } from 'vue';
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
import LoginPage from './components/LoginPage.vue';
import { loadConfig } from './services/config';
import { errorMessage } from './domain/torrents';
import {
  visualTheme,
  visualProfile,
  visualOverrides,
  visualVariables,
} from './domain/visual-themes';
const app = useAppStore(),
  { locale } = useI18n(),
  systemDark = ref(false);
const initializing = ref(true);
const loginEntry = ref(new URLSearchParams(location.search).get('login') === '1');
const hasConnected = ref(hasPageLoginSession());
watch(
  () => app.ready,
  (ready) => {
    if (ready) {
      hasConnected.value = true;
      loginEntry.value = false;
    }
  },
);
const media = window.matchMedia('(prefers-color-scheme: dark)');
function updateTheme() {
  systemDark.value = media.matches;
}
const dark = computed(
  () =>
    app.settings.ui.theme === 'dark' || (app.settings.ui.theme === 'system' && systemDark.value),
);
provide('color-mode-dark', dark);
const skin = computed(() => visualTheme(app.settings.ui.visualTheme));
const profile = computed(() => visualProfile(skin.value, dark.value));
const namespace = computed(() => `skin-${skin.value}-${dark.value ? 'dark' : 'light'}`);
const overrides = computed(() => visualOverrides(profile.value));
// One application owns the document palette, including teleported menus/dialogs.
const rootStyle = document.documentElement.style;
const originalVariables = new Map(
  [...Object.keys(visualVariables(profile.value)), 'color-scheme'].map((key) => [
    key,
    rootStyle.getPropertyValue(key),
  ]),
);
watchEffect(() => {
  for (const [key, value] of Object.entries(visualVariables(profile.value)))
    rootStyle.setProperty(key, value);
  rootStyle.setProperty('color-scheme', dark.value ? 'dark' : 'light');
});
onMounted(async () => {
  try {
    updateTheme();
    media.addEventListener('change', updateTheme);
    const runtime = await loadConfig();
    hasConnected.value = !!readLoginSession(runtime.rpcUrl);
    if (hasConnected.value) loginEntry.value = false;
    await app.initialize(runtime, false);
  } catch (e) {
    diagnostics.exception('initialization', e);
    app.error = errorMessage(e);
  } finally {
    initializing.value = false;
  }
});
onUnmounted(() => {
  app.dispose();
  media.removeEventListener('change', updateTheme);
  for (const [key, value] of originalVariables) {
    if (value) rootStyle.setProperty(key, value);
    else rootStyle.removeProperty(key);
  }
});
</script>
<template>
  <NConfigProvider
    :theme="dark ? darkTheme : null"
    :theme-overrides="overrides"
    :namespace="namespace"
    :class="namespace"
    :locale="locale === 'zh-CN' ? zhCN : enUS"
    :date-locale="locale === 'zh-CN' ? dateZhCN : dateEnUS"
  >
    <NGlobalStyle /><NMessageProvider
      ><NDialogProvider
        ><div :class="['application', { dark }]" :data-visual-theme="skin">
          <LoginPage
            v-if="
              (!initializing && (loginEntry || !hasConnected || app.authenticationRequired)) ||
              (!hasConnected && initializing)
            "
            :initializing="initializing"
            @authenticated="loginEntry = false"
          />
          <div v-else :inert="initializing" :aria-busy="initializing">
            <RouterView />
          </div></div></NDialogProvider
    ></NMessageProvider>
  </NConfigProvider>
</template>
