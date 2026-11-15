<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { pieceSegments } from '../domain/pieces';
const props = defineProps<{ encoded: string; count: number }>(),
  { t } = useI18n(),
  canvas = ref<HTMLCanvasElement>();
function draw() {
  const context = canvas.value?.getContext('2d');
  if (!context || !canvas.value) return;
  const cells = pieceSegments(props.encoded, props.count),
    columns = 64,
    rows = Math.max(1, Math.ceil(cells.length / columns));
  canvas.value.width = columns * 8;
  canvas.value.height = rows * 8;
  cells.forEach((progress, index) => {
    context.fillStyle = `hsl(172 65% ${94 - progress * 60}%)`;
    context.fillRect((index % columns) * 8, Math.floor(index / columns) * 8, 7, 7);
  });
}
onMounted(draw);
watch(() => [props.encoded, props.count], draw);
</script>
<template>
  <canvas
    ref="canvas"
    class="piece-map"
    role="img"
    :aria-label="`${t('pieceProgress')} (${count})`"
    :title="`${t('pieceProgress')} (${count})`"
  />
</template>
<style scoped>
.piece-map {
  width: 100%;
  max-width: 512px;
  image-rendering: pixelated;
  display: block;
}
</style>
