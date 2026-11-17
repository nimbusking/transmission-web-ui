<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { capture } from '../services/diagnostics/capture';
import { useAppStore } from '../stores/app';
import type { CapturePackage } from '../services/diagnostics/protocol';
import {
  diagnostics,
  downloadDiagnostics,
  type DiagnosticPackage,
} from '../services/diagnostics/recorder';
const app = useAppStore();
const active = ref(false);
const captureStatus = ref('');
const summaryInfo = ref(diagnostics.info());
const captureInfo = ref(capture.info());
const captures = ref<CapturePackage[]>([]);
const busy = ref(false);
let statusTimer: ReturnType<typeof setInterval>;
watch(
  () => app.config,
  () => {
    void update();
  },
);
const enabled = ref(diagnostics.enabled);
const persistent = ref(false);
const previous = ref<DiagnosticPackage[]>([]);
async function update() {
  persistent.value = diagnostics.persistent;
  enabled.value = diagnostics.enabled;
  previous.value = [...(await diagnostics.previous()), ...(await diagnostics.faults())];
  captures.value = await diagnostics.savedCaptures();
}
onMounted(() => {
  void update();
  statusTimer = setInterval(() => {
    active.value = capture.active;
    persistent.value = diagnostics.persistent;
    summaryInfo.value = diagnostics.info();
    captureInfo.value = capture.info();
    if (!capture.active && capture.packet?.capture.reasons.length)
      captureStatus.value = `录制已停止 / Stopped: ${capture.packet.capture.reasons.join(', ')}`;
  }, 250);
});
onUnmounted(() => clearInterval(statusTimer));
async function start() {
  busy.value = true;
  try {
    await app.startCapture();
    active.value = capture.active;
    captureStatus.value = '正在录制，最多5分钟 / Recording';
  } catch (error) {
    captureStatus.value = error instanceof Error ? error.message : 'Capture failed';
  } finally {
    busy.value = false;
  }
}
async function stop() {
  busy.value = true;
  try {
    const packet = await capture.stop(app.diagnosticState());
    await diagnostics.saveCapture(packet);
    active.value = false;
    captureStatus.value = `${packet.capture.eligibility}: ${packet.capture.reasons.join(', ')}`;
    await update();
  } finally {
    busy.value = false;
  }
}
function toggle() {
  void diagnostics.setEnabled(enabled.value);
  if (!enabled.value) capture.invalidate('recording-disabled');
}
async function clear() {
  capture.invalidate('cleared');
  capture.packet = undefined;
  await diagnostics.clear();
  await update();
}
</script>
<template>
  <details class="diagnostics-panel">
    <summary>诊断信息 / Diagnostics</summary>
    <p>
      日志仅保存在当前浏览器，导出后可人工提交。普通日志仅用于诊断；增强录制用于有限范围的离线重放。
    </p>
    <label
      ><input v-model="enabled" type="checkbox" @change="toggle" />本地采集 / Local recording</label
    >
    <p>{{ persistent ? 'IndexedDB 本地存储' : '内存模式：刷新后可能丢失' }}</p>
    <p>
      当前摘要 {{ summaryInfo.count }} 条 · {{ Math.ceil(summaryInfo.bytes / 1024) }} KiB · 已淘汰
      {{ summaryInfo.dropped }} 条
    </p>
    <p v-if="summaryInfo.start">{{ summaryInfo.start }} — {{ summaryInfo.end }}</p>
    <p v-if="active">
      剩余 {{ captureInfo.remainingSeconds }} 秒 · {{ captureInfo.events }} / 10000 条 ·
      {{ Math.ceil(captureInfo.bytes / 1024) }} / 10240 KiB
    </p>
    <button type="button" @click="diagnostics.exportPackage().then(downloadDiagnostics)">
      导出当前日志 / Export
    </button>
    <button v-if="app.ready && !active" type="button" :disabled="busy || !enabled" @click="start">
      开始增强录制 / Record
    </button>
    <button v-if="active || capture.packet" type="button" :disabled="busy" @click="stop">
      停止并保存录制 / Stop
    </button>
    <p role="status">{{ captureStatus }}</p>
    <button
      v-for="item in captures"
      :key="item.capture.id"
      type="button"
      @click="downloadDiagnostics(item)"
    >
      导出录制 {{ item.capture.start }} ({{ item.capture.eligibility }})
    </button>
    <button type="button" @click="clear">清除本实例日志 / Clear</button>
    <button
      v-for="item in previous"
      :key="item.capture.id"
      type="button"
      @click="downloadDiagnostics(item)"
    >
      导出历史日志 {{ item.events[0]?.at }}
    </button>
  </details>
</template>
<style scoped>
.diagnostics-panel {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--border);
  text-align: left;
  max-width: 100%;
  overflow-wrap: anywhere;
}
button {
  margin: 6px;
  padding: 6px 10px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
}
</style>
