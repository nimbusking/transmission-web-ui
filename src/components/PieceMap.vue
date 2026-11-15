<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NTooltip } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { pieceAt, pieceCells, pieceGrid } from '../domain/pieces';
import { formatBytes } from '../domain/torrents';
const props = defineProps<{
    encoded: string;
    count: number;
    pieceSize: number;
    totalSize: number;
  }>(),
  { t } = useI18n(),
  container = ref<HTMLDivElement>(),
  canvas = ref<HTMLCanvasElement>(),
  width = ref(1),
  hovered = ref<{ index: number; x: number; y: number } | null>(null),
  cells = computed(() => pieceCells(props.encoded, props.count, props.pieceSize, props.totalSize)),
  grid = computed(() => pieceGrid(width.value, cells.value.length)),
  activeCell = computed(() => (hovered.value ? cells.value[hovered.value.index] : undefined));
let observer: ResizeObserver | undefined;
function clearHover() {
  hovered.value = null;
}
function draw() {
  clearHover();
  const node = canvas.value,
    context = node?.getContext('2d');
  if (!node || !context) return;
  const layout = grid.value,
    scale = Math.min(3, window.devicePixelRatio || 1);
  node.width = Math.round(layout.width * scale);
  node.height = Math.round(layout.height * scale);
  context.setTransform(node.width / layout.width, 0, 0, node.height / layout.height, 0, 0);
  cells.value.forEach((cell, index) => {
    context.fillStyle = `hsl(172 65% ${94 - cell.progress * 60}%)`;
    context.fillRect(
      (index % layout.columns) * layout.step,
      Math.floor(index / layout.columns) * layout.step,
      layout.side,
      layout.side,
    );
  });
}
function inspect(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect(),
    index = pieceAt(
      ((event.clientX - rect.left) * grid.value.width) / rect.width,
      ((event.clientY - rect.top) * grid.value.height) / rect.height,
      grid.value,
      cells.value.length,
    );
  hovered.value = index === null ? null : { index, x: event.clientX, y: event.clientY - 12 };
}
function focusCell(index: number) {
  const rect = canvas.value?.getBoundingClientRect();
  if (!rect || !cells.value[index]) return;
  hovered.value = {
    index,
    x: rect.left + ((index % grid.value.columns) + 0.5) * grid.value.step,
    y: rect.top + Math.floor(index / grid.value.columns) * grid.value.step - 8,
  };
}
function navigate(event: KeyboardEvent) {
  if (event.key === 'Escape') return clearHover();
  const offset: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: grid.value.columns,
    ArrowUp: -grid.value.columns,
  };
  if (offset[event.key] === undefined) return;
  event.preventDefault();
  focusCell(
    Math.max(0, Math.min(cells.value.length - 1, (hovered.value?.index ?? 0) + offset[event.key])),
  );
}
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = entry!.contentRect.width;
  });
  observer.observe(container.value!);
  window.addEventListener('scroll', clearHover, true);
  window.addEventListener('resize', draw);
  draw();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('scroll', clearHover, true);
  window.removeEventListener('resize', draw);
});
watch([cells, grid], draw, { flush: 'post' });
</script>
<template>
  <div ref="container" class="piece-map-container">
    <canvas
      ref="canvas"
      class="piece-map"
      role="img"
      tabindex="0"
      :style="{ height: `${grid.height}px` }"
      :aria-label="`${t('pieceProgress')} (${count}). ${t('pieceKeyboardHelp')}`"
      @pointermove="inspect"
      @pointerdown="inspect"
      @pointerleave="clearHover"
      @focus="!hovered && focusCell(0)"
      @blur="clearHover"
      @keydown="navigate"
    />
    <NTooltip
      trigger="manual"
      :show="!!activeCell"
      :x="hovered?.x"
      :y="hovered?.y"
      placement="top"
      :show-arrow="false"
      :animated="false"
      :keep-alive-on-hover="false"
      content-class="piece-cell-tooltip"
      :content-style="{ pointerEvents: 'none' }"
    >
      <template v-if="activeCell">
        <strong
          >{{ formatBytes(activeCell.size ?? NaN) }} ×
          {{ (activeCell.progress * 100).toFixed(2) }}%</strong
        >
        <div>{{ t('pieceRange', { from: activeCell.from + 1, to: activeCell.to }) }}</div>
      </template>
    </NTooltip>
    <small v-if="count > 512" class="piece-map-caption">{{
      t('pieceSummary', { count, cells: 512 })
    }}</small>
  </div>
</template>
<style scoped>
.piece-map-container {
  width: 100%;
  min-width: 0;
}
.piece-map-caption {
  display: block;
  margin-top: 10px;
  color: var(--muted);
}
.piece-map {
  width: 100%;
  display: block;
  outline-offset: 4px;
}
</style>
