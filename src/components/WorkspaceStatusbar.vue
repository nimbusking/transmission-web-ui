<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDownToLine, ArrowUpFromLine, HardDrive } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { formatBytes } from '../domain/torrents';
import { nonnegativeNumber } from '../domain/status';
import { version } from '../../package.json';
const app = useAppStore(),
  { t } = useI18n();
const connected = computed(() => app.ready && !app.stale && !app.connecting);
const outdated = computed(() => app.stale || app.connecting);
function bytes(value: unknown, rate = false) {
  const number = nonnegativeNumber(value);
  return number === undefined ? t('dataUnavailable') : formatBytes(number, rate);
}
const spaceHint = computed(() =>
  [t('spacePath', { path: app.freeSpace.path || t('dataUnavailable') }), app.freeSpace.error]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <footer class="workspace-statusbar" :aria-label="t('statusBar')">
    <div class="statusbar-group statusbar-transfers" :class="{ outdated }">
      <span
        class="statusbar-item statusbar-download"
        :title="outdated ? t('stale') : t('rateDownload')"
      >
        <ArrowDownToLine :size="14" aria-hidden="true" />{{ t('rateDownload') }}:
        <span>{{ bytes(app.stats.downloadSpeed, true) }}</span>
      </span>
      <span
        class="statusbar-item statusbar-upload"
        :title="outdated ? t('stale') : t('rateUpload')"
      >
        <ArrowUpFromLine :size="14" aria-hidden="true" />{{ t('rateUpload') }}:
        <span>{{ bytes(app.stats.uploadSpeed, true) }}</span>
      </span>
      <span class="statusbar-item statusbar-space" :title="spaceHint">
        <HardDrive :size="14" aria-hidden="true" />{{ t('availableSpace') }}:
        <span>{{
          bytes(
            app.freeSpace.path === app.session?.['download-dir'] ? app.freeSpace.bytes : undefined,
          )
        }}</span>
      </span>
      <span v-if="outdated && app.lastUpdated" class="statusbar-item statusbar-stale">{{
        t('stale')
      }}</span>
    </div>
    <div class="statusbar-group statusbar-instance">
      <span class="statusbar-item connection">
        <span :class="['connection-dot', { live: connected }]" />{{
          t(app.connecting ? 'connecting' : connected ? 'connected' : 'disconnected')
        }}
      </span>
      <span class="statusbar-item"
        >Transmission {{ app.session?.version || t('dataUnavailable') }}</span
      >
      <span class="statusbar-item">{{
        t('rpcVersion', { version: app.session?.['rpc-version'] ?? '—' })
      }}</span>
      <span class="statusbar-item">Transmission Web UI {{ version }}</span>
    </div>
  </footer>
</template>
