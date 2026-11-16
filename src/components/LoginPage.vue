<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NInput, NSelect, NAlert, useMessage } from 'naive-ui';
import { ArrowRight, Server } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { languages } from '../i18n';
import { errorMessage } from '../domain/torrents';
import BrandMark from './BrandMark.vue';
import ColorModeToggle from './ColorModeToggle.vue';
const emit = defineEmits<{ authenticated: [] }>();
const props = defineProps<{ initializing: boolean }>();
const app = useAppStore();
const { t, locale } = useI18n();
const message = useMessage();
const username = ref('');
const password = ref('');
const submitting = ref(false);
const attempted = ref(false);
const busy = computed(() => props.initializing || app.connecting || submitting.value);
const server = computed(() => {
  try {
    return new URL(app.config?.rpcUrl ?? location.href).host;
  } catch {
    return '';
  }
});
async function login() {
  if (busy.value || !app.config || !username.value.trim()) return;
  submitting.value = true;
  attempted.value = true;
  try {
    await app.connect(username.value.trim(), password.value);
    if (app.ready && !app.authenticationRequired) emit('authenticated');
  } finally {
    password.value = '';
    submitting.value = false;
  }
}
async function changeLanguage(value: string) {
  try {
    await app.updateUi({ locale: value });
  } catch (error) {
    message.error(errorMessage(error));
  }
}
</script>
<template>
  <div class="login-page">
    <header class="login-header">
      <span>Transmission Web UI</span>
      <NSelect
        :value="locale"
        :options="languages"
        :disabled="initializing"
        :aria-label="t('language')"
        class="login-language"
        @update:value="changeLanguage"
      />
    </header>
    <main class="login-main">
      <form class="login-form" :aria-busy="busy" @submit.prevent="login">
        <div class="login-heading">
          <div class="login-logo"><BrandMark /></div>
          <h1>Transmission</h1>
          <p>{{ t('loginSubtitle') }}</p>
        </div>
        <label for="login-username">{{ t('username') }}</label>
        <NInput
          v-model:value="username"
          :input-props="{ id: 'login-username', required: true }"
          autocomplete="username"
          :placeholder="t('username')"
          :disabled="busy"
          size="large"
        />
        <label for="login-password">{{ t('password') }}</label>
        <NInput
          v-model:value="password"
          :input-props="{ id: 'login-password' }"
          type="password"
          show-password-on="click"
          autocomplete="current-password"
          :placeholder="t('password')"
          :disabled="busy"
          size="large"
        />
        <NAlert
          v-if="app.error && (attempted || !app.authenticationFailed)"
          type="error"
          :bordered="false"
          class="login-error"
          role="alert"
        >
          {{ app.authenticationFailed ? t('loginAuthError') : app.error }}
        </NAlert>
        <NButton
          attr-type="submit"
          type="primary"
          size="large"
          block
          class="login-submit"
          :loading="busy"
          :disabled="busy || !app.config || !username.trim()"
        >
          {{ busy ? t('connecting') : t('loginSubmit')
          }}<ArrowRight v-if="!busy" :size="16" aria-hidden="true" />
        </NButton>
        <NButton
          v-if="app.error && !app.authenticationRequired"
          text
          block
          :disabled="busy || !app.config"
          class="login-retry"
          @click="app.connect()"
          >{{ t('retry') }}</NButton
        >
        <p class="login-server">
          <Server :size="14" aria-hidden="true" /><span>{{ t('loginServer') }} · {{ server }}</span>
        </p>
      </form>
    </main>
    <footer class="login-footer">
      <ColorModeToggle v-if="!initializing" /><span v-else></span
      ><span>{{ t('loginTagline') }}</span
      ><span></span>
    </footer>
  </div>
</template>
<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
}
.login-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 32px;
  color: var(--muted);
  font-size: 12px;
}
.login-language {
  width: 140px;
}
.login-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}
.login-form {
  width: 320px;
  max-width: 100%;
}
.login-heading {
  text-align: center;
  margin-bottom: 32px;
}
.login-logo {
  width: 48px;
  height: 48px;
  margin: 0 auto 22px;
  color: var(--brand);
}
.login-heading h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.7px;
  margin: 0 0 10px;
}
.login-heading p {
  color: var(--muted);
  margin: 0;
}
.login-form label {
  display: block;
  margin: 18px 0 8px;
  font-weight: 500;
}
.login-form :deep(.n-input) {
  --n-color: var(--canvas) !important;
}
.login-submit {
  margin-top: 26px;
}
.login-submit :deep(.n-button__content) {
  gap: 10px;
}
.login-error {
  margin-top: 18px;
}
.login-retry {
  margin-top: 14px;
}
.login-server {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  margin: 22px 0 0;
  overflow-wrap: anywhere;
}
.login-server svg {
  flex-shrink: 0;
}
.login-footer {
  display: grid;
  grid-template-columns: 36px 1fr 36px;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 767px) {
  .login-header {
    padding: 20px;
    gap: 10px;
  }
  .login-language {
    width: 120px;
  }
  .login-main {
    padding: 32px 24px;
  }
  .login-footer {
    padding: 20px;
  }
  .login-form :deep(input) {
    font-size: 16px;
  }
}

@media (max-width: 767px), (pointer: coarse) {
  .login-form :deep(input) {
    font-size: 16px;
  }
  .login-form :deep(.n-input),
  .login-language :deep(.n-base-selection) {
    --n-height: 44px !important;
  }
  .login-submit {
    min-height: 44px;
  }
  .login-form :deep(.n-input__eye) {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-footer {
    grid-template-columns: 44px 1fr 44px;
  }
  .login-footer :deep(.color-mode-toggle) {
    width: 44px;
    height: 44px;
  }
}
</style>
