<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NModal } from 'naive-ui';
import { GitFork, BookOpen, History, Globe } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { PROJECT_LINKS } from '../project';
import { version } from '../../package.json';
import BrandMark from './BrandMark.vue';

const emit = defineEmits<{ close: [] }>();
const app = useAppStore(),
  { t } = useI18n();
const cached = computed(() => !!app.session && (!app.ready || app.stale || app.connecting));
const links = [
  { key: 'projectHome', href: PROJECT_LINKS.home, icon: GitFork },
  { key: 'userGuide', href: PROJECT_LINKS.guide, icon: BookOpen },
  { key: 'releaseNotes', href: PROJECT_LINKS.updates, icon: History },
  { key: 'personalBlog', href: PROJECT_LINKS.blog, icon: Globe },
];
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    :title="t('about')"
    :aria-label="t('about')"
    class="dialog about-dialog"
    @update:show="(show) => !show && emit('close')"
  >
    <div class="about-content">
      <div class="about-logo"><BrandMark /></div>
      <h2>Transmission Web UI</h2>
      <span class="about-ui-version">v{{ version }}</span>
      <p class="about-description">{{ t('aboutDescription') }}</p>
      <dl class="about-facts">
        <div>
          <dt>Transmission</dt>
          <dd class="about-transmission">{{ app.session?.version || t('disconnected') }}</dd>
        </div>
        <div>
          <dt>RPC</dt>
          <dd class="about-rpc">{{ app.session?.['rpc-version'] ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('projectAuthor') }}</dt>
          <dd>nimbusk</dd>
        </div>
      </dl>
      <p v-if="cached" class="about-cache-hint">{{ t('aboutCachedVersion') }}</p>
      <div class="about-links">
        <NButton
          v-for="link in links"
          :key="link.key"
          tag="a"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
          secondary
        >
          <template #icon><component :is="link.icon" :size="17" aria-hidden="true" /></template>
          {{ t(link.key) }}
        </NButton>
      </div>
      <a
        class="about-license"
        :href="PROJECT_LINKS.license"
        target="_blank"
        rel="noopener noreferrer"
        >{{ t('projectLicense') }}</a
      >
    </div>
  </NModal>
</template>

<style scoped>
.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--text);
  font-size: 15px;
  line-height: 1.65;
  padding: 12px 0 8px;
}
.about-logo {
  width: 76px;
  height: 76px;
  color: var(--accent);
  margin-bottom: 18px;
}
h2 {
  margin: 0 0 10px;
  font-size: 24px;
  line-height: 1.3;
}
.about-ui-version {
  padding: 3px 12px;
  background: var(--selected);
  color: var(--accent);
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.about-description {
  margin: 16px 0 22px;
}
.about-facts {
  display: grid;
  gap: 10px;
  max-width: 100%;
  margin: 0;
}
.about-facts > div {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.about-cache-hint {
  margin: 12px 0 0;
}
.about-links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 26px 0 18px;
}
.about-links :deep(.n-button) {
  font-size: inherit;
}
.about-license {
  color: inherit;
  text-underline-offset: 3px;
}
.about-license:hover {
  color: var(--accent);
}
</style>
