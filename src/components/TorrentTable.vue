<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { NDataTable, NCheckbox, NProgress, NTag, type DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import type { Torrent } from '../domain/types';
import {
  formatBytes,
  formatDuration,
  formatRatio,
  STATUS_NAMES,
  trackerHost,
} from '../domain/torrents';
const props = defineProps<{ rows: Torrent[]; sortKey: string; descending: boolean }>();
const emit = defineEmits<{ sort: [key: string]; context: [event: MouseEvent, ids: number[]] }>();
const app = useAppStore(),
  { t } = useI18n(),
  anchor = ref<number | null>(null);
function check(row: Torrent, checked: boolean, shift = false) {
  const ids = new Set(app.checkedIds),
    index = props.rows.findIndex((x) => x.id === row.id),
    start = props.rows.findIndex((x) => x.id === anchor.value);
  const range =
    shift && start >= 0
      ? props.rows.slice(Math.min(start, index), Math.max(start, index) + 1)
      : [row];
  for (const item of range)
    if (checked) ids.add(item.id);
    else ids.delete(item.id);
  app.checkedIds = [...ids];
  anchor.value = row.id;
}
function resize(event: PointerEvent, key: string, initial: number) {
  event.preventDefault();
  event.stopPropagation();
  const start = event.clientX,
    handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    const width = Math.max(60, Math.min(1200, initial + e.clientX - start));
    handle.parentElement!.style.width = `${width - 20}px`;
  };
  const end = (e: PointerEvent) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    void app.updateUi({
      columns: app.settings.ui.columns.map((c) =>
        c.key === key
          ? { ...c, width: Math.max(60, Math.min(1200, initial + e.clientX - start)) }
          : c,
      ),
    });
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
function value(row: Torrent, key: string) {
  if (key === 'name') return h('span', { class: 'torrent-name', title: row.name }, row.name);
  if (key === 'percentDone')
    return h('div', { class: 'progress-cell' }, [
      h('span', `${((row.percentDone ?? 0) * 100).toFixed(1)}%`),
      h(NProgress, {
        type: 'line',
        percentage: (row.percentDone ?? 0) * 100,
        showIndicator: false,
        height: 3,
        color: row.status === 6 ? '#168c7e' : '#6085ce',
      }),
    ]);
  if (key === 'status')
    return h(
      'span',
      { class: `status-dot status-${row.status}` },
      t(STATUS_NAMES[row.status ?? -1] || 'unknown'),
    );
  if (['totalSize', 'uploadedEver', 'downloadedEver', 'completeSize'].includes(key))
    return formatBytes(row[key]);
  if (['rateDownload', 'rateUpload'].includes(key))
    return row[key] ? formatBytes(row[key], true) : '—';
  if (key === 'seederCount') return `${row.seederCount ?? 0} (${row.peersSendingToUs ?? 0})`;
  if (key === 'leecherCount') return `${row.leecherCount ?? 0} (${row.peersGettingFromUs ?? 0})`;
  if (key === 'eta') return formatDuration(row.eta ?? -1);
  if (key === 'uploadRatio') return formatRatio(row.uploadRatio ?? -1);
  if (key.endsWith('Date')) return row[key] ? new Date(row[key] * 1000).toLocaleString() : '—';
  if (key === 'isPrivate') return row.isPrivate ? '✓' : '—';
  if (key === 'labels')
    return h(
      'div',
      { class: 'label-list' },
      (app.settings.torrentLabels[row.hashString || ''] ?? []).flatMap((id) => {
        const label = app.settings.labels.find((x) => x.id === id);
        return label
          ? [
              h(
                NTag,
                {
                  size: 'small',
                  bordered: false,
                  color: { color: `${label.color}18`, textColor: label.color },
                },
                () => label.name,
              ),
            ]
          : [];
      }),
    );
  if (key === 'trackers')
    return [...new Set((row.trackers ?? []).map((x) => trackerHost(x.announce)))].join(', ');
  return String(row[key] ?? '—');
}
const columns = computed<DataTableColumns<Torrent>>(() => [
  {
    key: '_check',
    width: 38,
    fixed: 'left',
    title: () =>
      h(NCheckbox, {
        checked: props.rows.length > 0 && props.rows.every((x) => app.checkedIds.includes(x.id)),
        indeterminate:
          props.rows.some((x) => app.checkedIds.includes(x.id)) &&
          !props.rows.every((x) => app.checkedIds.includes(x.id)),
        'aria-label': t('selectAll'),
        onUpdateChecked: (checked: boolean) => {
          app.checkedIds = checked ? props.rows.map((x) => x.id) : [];
        },
      }),
    render: (row) =>
      h(
        'span',
        {
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            check(row, !app.checkedIds.includes(row.id), e.shiftKey);
          },
        },
        h(NCheckbox, {
          checked: app.checkedIds.includes(row.id),
          'aria-label': row.name,
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === ' ') {
              e.preventDefault();
              check(row, !app.checkedIds.includes(row.id), e.shiftKey);
            }
          },
        }),
      ),
  },
  ...app.settings.ui.columns
    .filter((x) => x.visible)
    .map((c) => ({
      key: c.key,
      width: c.width,
      ellipsis: { tooltip: true },
      title: () =>
        h('div', { class: 'column-head', style: { width: `${Math.max(40, c.width - 20)}px` } }, [
          h(
            'button',
            { class: 'column-sort', onClick: () => emit('sort', c.key) },
            `${t(c.key)}${props.sortKey === c.key ? (props.descending ? ' ↓' : ' ↑') : ''}`,
          ),
          h('span', {
            class: 'column-resizer',
            role: 'separator',
            'aria-label': `${t('width')} ${t(c.key)}`,
            onPointerdown: (e: PointerEvent) => resize(e, c.key, c.width),
            onClick: (e: Event) => e.stopPropagation(),
          }),
        ]),
      render: (row: Torrent) => value(row, c.key),
    })),
]);
function rowProps(row: Torrent) {
  return {
    onClick: () => app.select(row.id),
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emit('context', e, app.checkedIds.includes(row.id) ? [...app.checkedIds] : [row.id]);
    },
    'data-torrent-id': row.id,
  };
}
</script>
<template>
  <NDataTable
    class="torrent-table"
    :columns="columns"
    :data="rows"
    :row-key="(row) => row.id"
    :row-props="rowProps"
    :row-class-name="(row) => (row.id === app.selectedId ? 'selected-row' : '')"
    :scroll-x="columns.reduce((sum, c) => sum + Number(c.width || 100), 0)"
    :min-row-height="32"
    :height-for-row="() => 32"
    virtual-scroll
    flex-height
    size="small"
    :bordered="false"
    :single-line="true"
  />
</template>
