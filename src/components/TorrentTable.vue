<script setup lang="ts">
import { computed, h, ref } from 'vue';
import {
  Download,
  Upload,
  Pause,
  Clock,
  DatabaseSearch,
  CircleX,
  TriangleAlert,
  Tag,
} from '@lucide/vue';
import { hasWarning } from '../domain/navigation';
import { tableBytes, tableDate, tableServers, peerCount, progressValue } from '../domain/table';
import { NDataTable, NCheckbox, NTag, type DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import type { Torrent } from '../domain/types';
import { formatDuration, formatRatio, STATUS_NAMES } from '../domain/torrents';
const props = defineProps<{
  rows: Torrent[];
  sortKey: string;
  descending: boolean;
  rowOffset?: number;
}>();
const emit = defineEmits<{
  sort: [key: string];
  labels: [id: number];
  context: [event: MouseEvent, ids: number[]];
}>();
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
  if (key === 'name') {
    const warning = hasWarning(row),
      error = !!row.error && row.error !== 1;
    const icon = error
      ? CircleX
      : warning
        ? TriangleAlert
        : row.status === 0
          ? Pause
          : row.status === 2
            ? DatabaseSearch
            : row.status === 4
              ? Download
              : row.status === 6
                ? Upload
                : Clock;
    const status = t(STATUS_NAMES[row.status ?? -1] || 'unknown');
    const hint = [
      row.name,
      row.downloadDir,
      status,
      warning ? t('trackerWarningHint') : '',
      row.errorString,
    ]
      .filter(Boolean)
      .join('\n');
    return h('span', { class: 'torrent-name-cell', title: hint }, [
      h(icon, {
        size: 14,
        class: error ? 'text-error' : warning ? 'text-warning' : 'muted',
        'aria-hidden': true,
      }),
      h('span', { class: 'torrent-name' }, row.name),
    ]);
  }
  if (key === 'percentDone') {
    const progress = progressValue(row),
      percentage = progress.value;
    const title = progress.checking
      ? t('checkingProgress', { value: percentage === undefined ? '—' : percentage.toFixed(2) })
      : '';
    const fullTitle = progress.checking
      ? `${title} · ${t('percentDone')} ${typeof row.percentDone === 'number' ? (row.percentDone * 100).toFixed(2) + '%' : '—'}`
      : title;
    return h(
      'div',
      {
        class: 'progress-cell',
        title: fullTitle,
        role: 'progressbar',
        'aria-label': t('percentDone'),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': percentage,
        'aria-valuetext': progress.checking
          ? title
          : percentage === undefined
            ? '—'
            : `${percentage.toFixed(2)}%`,
      },
      [
        h('span', {
          class: 'progress-fill',
          'aria-hidden': true,
          style: {
            width: `${percentage ?? 0}%`,
            backgroundColor: row.error
              ? '#d97757'
              : progress.checking
                ? '#b5945b'
                : row.status === 6
                  ? '#168c7e'
                  : '#6085ce',
          },
        }),
        h(
          'span',
          { class: 'progress-label', 'aria-hidden': true },
          percentage === undefined ? '—' : `${percentage.toFixed(2)}%`,
        ),
      ],
    );
  }
  if (key === 'status')
    return h(
      'span',
      { class: `status-dot status-${row.status}` },
      t(STATUS_NAMES[row.status ?? -1] || 'unknown'),
    );
  if (key === 'totalSize') return tableBytes(row[key]).replace('iB', 'B');
  if (['uploadedEver', 'downloadedEver', 'completeSize'].includes(key)) return tableBytes(row[key]);
  if (['rateDownload', 'rateUpload'].includes(key))
    return row[key] === 0 ? '—' : tableBytes(row[key], true);
  if (key === 'seederCount') return peerCount(row.seederCount, row.peersSendingToUs);
  if (key === 'leecherCount') return peerCount(row.leecherCount, row.peersGettingFromUs);
  if (key === 'eta')
    return row.percentDone === 1
      ? '—'
      : typeof row.eta === 'number' && row.eta < 0
        ? '∞'
        : formatDuration(row.eta ?? -1);
  if (key === 'uploadRatio') return formatRatio(row.uploadRatio ?? -1);
  if (key.endsWith('Date')) return tableDate(row[key]);
  if (key === 'isPrivate') return row.isPrivate ? '✓' : '—';
  if (key === 'labels')
    return h('div', { class: 'label-list' }, [
      h(
        'button',
        {
          class: 'table-label-edit',
          type: 'button',
          title: t('editLabelsFor', { name: row.name }),
          'aria-label': t('editLabelsFor', { name: row.name }),
          disabled: !app.ready || app.operationBusy,
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            emit('labels', row.id);
          },
        },
        h(Tag, { size: 14, 'aria-hidden': true }),
      ),
      ...(app.settings.torrentLabels[row.hashString || ''] ?? []).flatMap((id) => {
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
    ]);
  if (key === 'trackers') return tableServers(row);
  return String(row[key] ?? '—');
}
const indices = computed(() => new Map(props.rows.map((row, index) => [row.id, index])));
const dragging = ref<string | null>(null);
function dropColumn(event: DragEvent, key: string) {
  event.preventDefault();
  event.stopPropagation();
  const from = dragging.value;
  dragging.value = null;
  if (!from || from === key) return;
  const list = [...app.settings.ui.columns];
  const index = list.findIndex((x) => x.key === from);
  if (index < 0) return;
  const [column] = list.splice(index, 1);
  list.splice(
    list.findIndex((x) => x.key === key),
    0,
    column,
  );
  void app.updateUi({ columns: list });
}
const columns = computed<DataTableColumns<Torrent>>(() => [
  {
    key: '_row',
    width: 48,
    fixed: 'left',
    title: () => h('span', { 'aria-label': t('rowNumber') }, '№'),
    render: (row) =>
      h(
        'span',
        { class: 'row-number' },
        String((props.rowOffset ?? 0) + (indices.value.get(row.id) ?? 0) + 1),
      ),
  },
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
      align: [
        'totalSize',
        'uploadRatio',
        'rateDownload',
        'rateUpload',
        'uploadedEver',
        'downloadedEver',
        'completeSize',
        'id',
        'queuePosition',
      ].includes(c.key)
        ? ('right' as const)
        : ('left' as const),
      className: c.key === 'percentDone' ? 'torrent-progress-column' : undefined,
      ellipsis: c.key === 'percentDone' ? false : { tooltip: true },
      title: () =>
        h(
          'div',
          {
            class: 'column-head',
            'data-column-key': c.key,
            style: { width: `${Math.max(40, c.width - 20)}px` },
            onDragover: (event: DragEvent) => event.preventDefault(),
            onDrop: (event: DragEvent) => dropColumn(event, c.key),
          },
          [
            h(
              'button',
              {
                class: 'column-sort',
                draggable: true,
                onDragstart: (event: DragEvent) => {
                  dragging.value = c.key;
                  event.dataTransfer?.setData('text/plain', c.key);
                },
                onDragend: () => {
                  dragging.value = null;
                },
                onClick: () => {
                  if (!dragging.value) emit('sort', c.key);
                },
              },
              `${t(c.key)}${props.sortKey === c.key ? (props.descending ? ' ↓' : ' ↑') : ''}`,
            ),
            h('span', {
              class: 'column-resizer',
              role: 'separator',
              'aria-label': `${t('width')} ${t(c.key)}`,
              onPointerdown: (e: PointerEvent) => resize(e, c.key, c.width),
              onClick: (e: Event) => e.stopPropagation(),
            }),
          ],
        ),
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
