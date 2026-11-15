<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { NButton, NCheckbox, NInputNumber, NModal } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [show: boolean] }>();
const app = useAppStore(),
  { t } = useI18n(),
  mounted = ref(false),
  visible = ref(false);
// Defer controls until needed, then retain them across subsequent openings.
watch(
  () => props.show,
  async (show) => {
    if (show) {
      mounted.value = true;
      // Mount hidden first so the initial opening also uses the short fade.
      await nextTick();
    }
    visible.value = props.show;
  },
  { immediate: true },
);
function reorder(index: number, direction: number) {
  const list = [...app.settings.ui.columns];
  [list[index], list[index + direction]] = [list[index + direction], list[index]];
  void app.updateUi({ columns: list });
}
</script>
<template>
  <NModal
    v-if="mounted"
    :show="visible"
    display-directive="show"
    preset="card"
    :title="t('columns')"
    class="dialog medium-dialog column-settings-dialog"
    @update:show="emit('update:show', $event)"
  >
    <div v-for="(col, index) in app.settings.ui.columns" :key="col.key" class="column-setting">
      <NCheckbox
        :checked="col.visible"
        @update:checked="
          (visible) =>
            app.updateUi({
              columns: app.settings.ui.columns.map((c) =>
                c.key === col.key ? { ...c, visible } : c,
              ),
            })
        "
        >{{ t(col.key) }}</NCheckbox
      >
      <NInputNumber
        :value="col.width"
        :min="60"
        :max="1200"
        size="small"
        @update:value="
          (width) =>
            width &&
            app.updateUi({
              columns: app.settings.ui.columns.map((c) =>
                c.key === col.key ? { ...c, width } : c,
              ),
            })
        "
      />
      <NButton size="tiny" :disabled="index === 0" @click="reorder(index, -1)">↑</NButton>
      <NButton
        size="tiny"
        :disabled="index === app.settings.ui.columns.length - 1"
        @click="reorder(index, 1)"
        >↓</NButton
      >
    </div>
  </NModal>
</template>
