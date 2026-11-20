<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ChevronRight,
  ChevronDown,
  List,
  ListTree,
  Download,
  ArrowDown,
  Clock3,
  Upload,
  Pause,
  DatabaseSearch,
  Activity,
  CircleX,
  TriangleAlert,
  Server,
  Folder,
  ChartColumn,
  Tags,
  Tag,
  Layers,
  Gauge,
  ArrowUpFromLine,
  ArrowDownToLine,
  ListPlus,
  Repeat2,
  Timer,
} from '@lucide/vue';
import { useAppStore } from '../stores/app';
import { formatBytes, statusMatches } from '../domain/torrents';
import {
  torrentSizeTotal,
  navigationGroups,
  durationText,
  inFolder,
  type NavNode,
} from '../domain/navigation';
const props = defineProps<{
  status: string;
  folder: string | null;
  tracker: string | null;
  label: string | null;
}>();
const emit = defineEmits<{ select: [kind: string, value: string] }>();
const app = useAppStore(),
  { t } = useI18n();
const hostElement = ref<HTMLElement>();
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    height.value = entries[0].contentRect.height;
  });
  if (hostElement.value) observer.observe(hostElement.value);
});
onUnmounted(() => observer?.disconnect());
const scroll = ref(0),
  height = ref(600),
  focused = ref('status:all');
type SidebarNode = Omit<NavNode, 'children'> & {
  icon?: typeof Folder;
  children?: SidebarNode[];
  downloadCounts?: { key: string; count: number; icon: typeof Folder; label: string }[];
};
const icons: Record<string, typeof Folder> = {
  all: ListTree,
  downloading: Download,
  seeding: Upload,
  paused: Pause,
  checking: DatabaseSearch,
  active: Activity,
  error: CircleX,
  warning: TriangleAlert,
  server: Server,
  folder: Folder,
  statistics: ChartColumn,
  labels: Tags,
  label: Tag,
};
const statMetrics = [
  ['uploadedBytes', ArrowUpFromLine],
  ['downloadedBytes', ArrowDownToLine],
  ['filesAdded', ListPlus],
  ['sessionCount', Repeat2],
  ['secondsActive', Timer],
] as const;
const groups = computed(() => navigationGroups(app.torrents));
const roots = computed<SidebarNode[]>(() => {
  const status = ['downloading', 'paused', 'seeding', 'checking', 'active', 'error', 'warning'];
  const total = torrentSizeTotal(app.torrents);
  let running = 0,
    queued = 0;
  for (const torrent of app.torrents) {
    if (!statusMatches(torrent, 'downloading')) continue;
    if (torrent.status === 3) queued++;
    else running++;
  }
  const downloadCounts = (
    [
      ['downloadTotalCount', running + queued, List],
      ['downloadRunningCount', running, ArrowDown],
      ['downloadQueuedCount', queued, Clock3],
    ] as const
  ).map(([key, count, icon]) => ({ key, count, icon, label: t(key, { count }) }));
  const stats = (scope: 'cumulative-stats' | 'current-stats') => ({
    key: 'stats:' + scope,
    name: t(scope === 'current-stats' ? 'currentSession' : 'cumulative'),
    kind: 'folder',
    icon: scope === 'current-stats' ? Gauge : Layers,
    children: statMetrics.map(([field, icon]) => {
      const value = app.stats[scope]?.[field];
      return {
        key: `stats:${scope}:${field}`,
        name: t('stat' + field),
        kind: 'metric',
        icon,
        value:
          typeof value === 'number' && Number.isFinite(value) && value >= 0
            ? field.endsWith('Bytes')
              ? formatBytes(value)
              : field === 'secondsActive'
                ? durationText(value)
                : String(value)
            : '—',
      };
    }),
  });
  return [
    {
      key: 'status:all',
      name: t('all'),
      kind: 'all',
      value: 'all',
      count: app.torrents.length,
      size: total,
      children: status.map((value) => ({
        key: 'status:' + value,
        name: t(value),
        kind: value,
        value,
        ...(value === 'downloading'
          ? { downloadCounts }
          : { count: app.torrents.filter((x) => statusMatches(x, value)).length }),
      })),
    },
    {
      key: 'root:servers',
      name: t('serverDistribution'),
      kind: 'server',
      children: groups.value.servers.map((n) => ({
        ...n,
        name:
          n.value === '@none'
            ? t('noTracker')
            : n.value === '@unknown'
              ? t('unknownServer')
              : n.name,
      })),
    },
    {
      key: 'root:folders',
      name: t('dataDirectories'),
      kind: 'folder',
      children: groups.value.folders,
    },
    {
      key: 'root:stats',
      name: t('statistics') + (app.stale ? ' · ' + t('stale') : ''),
      kind: 'statistics',
      children: [stats('cumulative-stats'), stats('current-stats')],
    },
    {
      key: 'root:labels',
      name: t('localLabels'),
      kind: 'labels',
      children: app.settings.labels.map((x) => ({
        key: 'label:' + x.id,
        name: x.name,
        kind: 'label',
        value: x.id,
        count: app.torrents.filter((t) =>
          app.settings.torrentLabels[t.hashString || '']?.includes(x.id),
        ).length,
      })),
    },
  ];
});
const expanded = (n: NavNode, _depth: number) =>
  app.settings.ui.navigationExpanded?.[n.key] ?? n.key === 'status:all';
const flat = computed(() => {
  const out: { node: SidebarNode; depth: number }[] = [];
  const walk = (nodes: SidebarNode[], depth: number) =>
    nodes.forEach((node) => {
      out.push({ node, depth });
      if (node.children?.length && expanded(node, depth)) walk(node.children, depth + 1);
    });
  walk(roots.value, 0);
  return out;
});
watch(flat, (list) => {
  if (!list.some((x) => x.node.key === focused.value)) focused.value = list[0]?.node.key || '';
  if (hostElement.value && scroll.value > list.length * 34 - hostElement.value.clientHeight) {
    hostElement.value.scrollTop = Math.max(0, list.length * 34 - hostElement.value.clientHeight);
    scroll.value = hostElement.value.scrollTop;
  }
});
const start = computed(() => Math.max(0, Math.floor(scroll.value / 34) - 5));
const visible = computed(() =>
  flat.value.slice(start.value, start.value + Math.ceil(height.value / 34) + 12),
);
function selected(n: NavNode) {
  return (
    n.key === 'status:' + props.status ||
    n.key === 'folder:' + props.folder ||
    n.key === 'tracker:' + props.tracker ||
    n.key === 'label:' + props.label
  );
}
function descendantSelected(n: NavNode): boolean {
  if (n.key === 'root:servers') return !!props.tracker;
  if (n.key === 'root:folders') return !!props.folder;
  if (n.key === 'root:labels') return !!props.label;
  return (
    n.key.startsWith('folder:') &&
    !!props.folder &&
    props.folder !== n.value &&
    inFolder(props.folder, n.value!)
  );
}
function toggle(n: NavNode, depth: number) {
  void app.updateUi({
    navigationExpanded: { [n.key]: !expanded(n, depth) },
  });
}
function choose(n: NavNode, depth: number) {
  if (n.key.startsWith('status:')) emit('select', 'status', n.value!);
  else if (n.key.startsWith('tracker:')) emit('select', 'tracker', n.value!);
  else if (n.key.startsWith('folder:')) emit('select', 'folder', n.value!);
  else if (n.kind === 'label') emit('select', 'label', n.value!);
  else if (n.children) toggle(n, depth);
}
async function keydown(e: KeyboardEvent, n: NavNode, depth: number) {
  const index = flat.value.findIndex((x) => x.node.key === n.key);
  let target = index;
  if (e.key === 'ArrowDown') target++;
  else if (e.key === 'ArrowUp') target--;
  else if (e.key === 'ArrowRight') {
    if (n.children?.length && !expanded(n, depth)) toggle(n, depth);
    else target++;
  } else if (e.key === 'ArrowLeft') {
    if (n.children?.length && expanded(n, depth)) toggle(n, depth);
    else {
      for (let i = index - 1; i >= 0; i--)
        if (flat.value[i].depth < depth) {
          target = i;
          break;
        }
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    choose(n, depth);
  } else return;
  e.preventDefault();
  target = Math.max(0, Math.min(flat.value.length - 1, target));
  focused.value = flat.value[target].node.key;
  const host = (e.currentTarget as HTMLElement).closest('.navigation-tree') as HTMLElement;
  host.scrollTop = Math.max(0, target * 34 - host.clientHeight / 2);
  scroll.value = host.scrollTop;
  await nextTick();
  host.querySelector<HTMLElement>(`[data-index="${target}"]`)?.focus();
}
</script>
<template>
  <div
    ref="hostElement"
    class="navigation-tree"
    role="tree"
    :aria-label="t('navigation')"
    @scroll="
      scroll = ($event.target as HTMLElement).scrollTop;
      height = ($event.target as HTMLElement).clientHeight;
    "
  >
    <div :style="{ height: flat.length * 34 + 'px', position: 'relative' }">
      <div
        v-for="({ node, depth }, i) in visible"
        :key="node.key"
        class="tree-row"
        :class="{ active: selected(node), ancestor: descendantSelected(node) }"
        role="treeitem"
        :aria-level="depth + 1"
        :aria-selected="selected(node)"
        :aria-expanded="node.children?.length ? expanded(node, depth) : undefined"
        :tabindex="focused === node.key ? 0 : -1"
        :data-index="start + i"
        :style="{ top: (start + i) * 34 + 'px', paddingLeft: Math.min(depth, 4) * 12 + 'px' }"
        :title="node.key.startsWith('folder:') ? node.value : node.name"
        @keydown="keydown($event, node, depth)"
        @focus="focused = node.key"
      >
        <button
          v-if="node.children?.length"
          class="tree-toggle"
          tabindex="-1"
          :aria-label="t('toggleBranch', { name: node.name })"
          @click.stop="toggle(node, depth)"
        >
          <component :is="expanded(node, depth) ? ChevronDown : ChevronRight" :size="13" /></button
        ><span v-else class="tree-toggle" />
        <component
          :is="node.kind === 'metric' ? 'span' : 'button'"
          class="tree-select"
          :class="{ 'tree-select-download': node.downloadCounts }"
          tabindex="-1"
          @click="choose(node, depth)"
        >
          <component
            :is="node.icon ?? icons[node.kind] ?? Folder"
            :size="16"
            aria-hidden="true"
          /><span class="tree-name">{{
            node.name === '@unknown' ? t('unknownFolder') : node.name
          }}</span
          ><span v-if="node.downloadCounts" class="tree-number tree-download-counts">
            <span
              v-for="item in node.downloadCounts"
              :key="item.key"
              role="img"
              :aria-label="item.label"
              :title="item.label"
            >
              <component :is="item.icon" :size="12" aria-hidden="true" />{{ item.count }}
            </span>
          </span>
          <span v-else-if="node.count !== undefined" class="tree-number">[{{ node.count }}]</span>
        </component>
        <span
          v-if="'size' in node || node.kind === 'metric'"
          class="tree-size"
          :title="node.kind === 'metric' ? undefined : t('torrentSizeTotalHint')"
          >{{ node.kind === 'metric' ? node.value : `[${formatBytes(node.size ?? NaN)}]` }}</span
        >
      </div>
    </div>
  </div>
</template>
<style scoped>
.navigation-tree {
  container-type: inline-size;
  flex: 1;
  min-height: 100px;
  overflow: auto;
  position: relative;
}
.tree-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 3px;
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
}
.tree-row:hover {
  background: var(--subtle);
}
.tree-row.ancestor {
  box-shadow: inset 2px 0 var(--accent);
}
.tree-row.active {
  background: var(--selected);
  color: var(--accent);
}
.tree-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  width: 18px;
  height: 28px;
  background: none;
  color: inherit;
  border: 0;
  padding: 0;
}
.tree-select {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 0;
  color: inherit;
  text-align: left;
  padding: 4px 0;
  height: 32px;
}
.tree-select svg {
  flex-shrink: 0;
}
.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-number,
.tree-size {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tree-number {
  margin-left: auto;
}
.tree-download-counts {
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
  padding-inline-end: 6px;
}
.tree-download-counts > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
@container (max-width: 168px) {
  .tree-select-download {
    gap: 4px;
  }
  .tree-select-download > svg {
    display: none;
  }
  .tree-download-counts {
    gap: 4px;
    padding-inline-end: 3px;
  }
  .tree-download-counts > span {
    gap: 2px;
  }
}
.tree-size {
  padding-right: 6px;
  max-width: 48%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
