<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton, NCheckbox, NDropdown, NInputNumber } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  RefreshCw,
  Settings,
  Play,
  Pause,
  Pencil,
  Trash2,
  DatabaseSearch,
  Radio,
  FolderInput,
  Gauge,
  ListOrdered,
  Ellipsis,
  Columns3,
  ChevronDown,
} from '@lucide/vue';
const props = defineProps<{
  ready: boolean;
  busy: boolean;
  refreshing: boolean;
  targetCount: number;
  menu: { key: string; label: string }[];
  moreMenu: { key: string; label: string; disabled?: boolean }[];
  totalCount: number;
  autoRefresh: boolean;
  intervalMs: number;
  matchRunning: boolean | null;
}>();
const emit = defineEmits<{
  add: [];
  action: [key: string];
  bulkAction: [key: string];
  refresh: [];
  settings: [];
  columns: [];
  autoRefresh: [value: boolean];
  interval: [value: number];
  resumeMatch: [];
}>();
const { t } = useI18n();
const disabled = computed(() => !props.ready || props.busy || !props.targetCount);
const generation = ref(0);
const shortcuts = [
  { key: 'start', icon: Play },
  { key: 'stop', icon: Pause },
  { key: 'rename', icon: Pencil },
  { key: 'remove', icon: Trash2 },
  { key: 'verify', icon: DatabaseSearch },
  { key: 'reannounce', icon: Radio },
  { key: 'move', icon: FolderInput },
  { key: 'limits', icon: Gauge },
];
function select(key: string | number) {
  generation.value++;
  emit('action', String(key));
}
function selectBulk(key: string | number) {
  generation.value++;
  emit('bulkAction', String(key));
}
</script>
<template>
  <nav class="toolbar" :aria-label="t('taskToolbar')">
    <NButton type="primary" size="small" :disabled="!ready" @click="emit('add')">
      <template #icon><Plus :size="18" aria-hidden="true" /></template>{{ t('add') }}
    </NButton>
    <span class="toolbar-divider" aria-hidden="true" />
    <NButton
      quaternary
      size="small"
      class="toolbar-icon"
      :title="t('refresh')"
      :aria-label="t('refresh')"
      :loading="refreshing"
      @click="emit('refresh')"
    >
      <RefreshCw :size="18" aria-hidden="true" />
    </NButton>
    <NButton
      quaternary
      size="small"
      class="toolbar-icon"
      :title="t('settings')"
      :aria-label="t('settings')"
      @click="emit('settings')"
      ><Settings :size="18" aria-hidden="true"
    /></NButton>
    <span class="toolbar-divider" aria-hidden="true" />
    <NButton
      v-for="item in shortcuts"
      :key="item.key"
      quaternary
      size="small"
      class="toolbar-icon"
      :title="t(item.key)"
      :aria-label="t(item.key)"
      :disabled="disabled || (item.key === 'rename' && targetCount !== 1)"
      @click="emit('action', item.key)"
    >
      <component :is="item.icon" :size="18" aria-hidden="true" />
    </NButton>
    <NDropdown
      :key="`queue-${generation}`"
      trigger="click"
      :options="menu.filter((item) => item.key.startsWith('queue'))"
      @select="select"
    >
      <NButton
        quaternary
        size="small"
        class="toolbar-menu"
        :disabled="disabled"
        :title="t('queuePosition')"
        :aria-label="t('queuePosition')"
      >
        <ListOrdered :size="18" aria-hidden="true" /><ChevronDown :size="12" aria-hidden="true" />
      </NButton>
    </NDropdown>
    <NDropdown :key="`more-${generation}`" trigger="click" :options="moreMenu" @select="selectBulk">
      <NButton
        quaternary
        size="small"
        class="toolbar-menu"
        :disabled="!ready || busy || !totalCount"
        :title="t('more')"
        :aria-label="t('more')"
      >
        <Ellipsis :size="18" aria-hidden="true" /><ChevronDown :size="12" aria-hidden="true" />
      </NButton>
    </NDropdown>
    <span class="toolbar-divider" aria-hidden="true" />
    <NButton
      quaternary
      size="small"
      class="toolbar-icon"
      :title="t('columns')"
      :aria-label="t('columns')"
      @click="emit('columns')"
      ><Columns3 :size="18" aria-hidden="true"
    /></NButton>
    <span class="toolbar-divider" aria-hidden="true" />
    <div class="toolbar-refresh">
      <NCheckbox :checked="autoRefresh" @update:checked="emit('autoRefresh', $event)">{{
        t('autoRefresh')
      }}</NCheckbox>
      <NInputNumber
        :value="intervalMs / 1000"
        :disabled="!autoRefresh"
        :min="2"
        :max="300"
        :step="1"
        :precision="0"
        size="small"
        :input-props="{ 'aria-label': t('refreshSeconds') }"
        :title="t('refreshSeconds')"
        @update:value="(value) => value !== null && emit('interval', value * 1000)"
      />
      <span>{{ t('secondsPerRefresh') }}</span>
    </div>
    <NButton v-if="matchRunning !== null" size="small" @click="emit('resumeMatch')">
      {{ t('matchFolders') }}{{ matchRunning ? ' •' : '' }}
    </NButton>
  </nav>
</template>
