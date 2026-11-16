<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from 'vue';
import {
  NModal,
  NConfigProvider,
  type GlobalThemeOverrides,
  NTabs,
  NTabPane,
  NInput,
  NInputNumber,
  NSelect,
  NCheckbox,
  NButton,
  NAlert,
  NColorPicker,
  NTimePicker,
  NAutoComplete,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { languages } from '../i18n';
import { visualProfile, visualTheme } from '../domain/visual-themes';
import { defaultSettings, errorMessage, formatBytes, uniqueId } from '../domain/torrents';
import type { Label, SettingsSection } from '../domain/types';
import { SESSION_FIELDS, validateSessionPatch } from '../services/session-fields';
import {
  exportSettings,
  previewSettings,
  TRANSFER_SECTIONS,
  type TransferSection,
} from '../services/settings-transfer';
import {
  FIELD_DEPENDENCIES,
  SESSION_GROUPS,
  SETTINGS_TABS,
  minutesToTime,
  timeToMinutes,
  setWeekday,
} from '../domain/settings-layout';
import { downloadJson, externalText } from '../services/files';
import enSession from '../i18n/session/en.json';
import zhSession from '../i18n/session/zh-CN.json';
const emit = defineEmits<{ close: [] }>(),
  app = useAppStore(),
  { t, locale } = useI18n(),
  message = useMessage();
const dark = inject(
  'color-mode-dark',
  computed(() => app.settings.ui.theme === 'dark'),
);
const settingsAppearance = computed<GlobalThemeOverrides | undefined>(() => {
  if (!dark.value) return undefined;
  const p = visualProfile(visualTheme(app.settings.ui.visualTheme), true).palette;
  const input = {
    color: p.subtle,
    colorHover: p.subtle,
    colorFocus: p.subtle,
    colorDisabled: p.canvas,
    textColor: p.text,
    textColorDisabled: p.muted,
    placeholderColor: p.muted,
    placeholderColorDisabled: p.muted,
    suffixTextColor: p.muted,
    border: `1px solid ${p.muted}`,
    borderDisabled: `1px solid ${p.muted}`,
    borderHover: `1px solid ${p.accent}`,
    borderFocus: `1px solid ${p.accent}`,
    boxShadowFocus: `0 0 0 2px ${p.selected}`,
  };
  return {
    Input: input,
    InputNumber: { peers: { Input: input }, iconColorDisabled: p.muted },
    AutoComplete: { peers: { Input: input } },
    TimePicker: { peers: { Input: input } },
    Select: {
      peers: {
        InternalSelection: {
          color: p.subtle,
          colorActive: p.subtle,
          colorDisabled: p.canvas,
          textColor: p.text,
          textColorDisabled: p.muted,
          placeholderColor: p.muted,
          placeholderColorDisabled: p.muted,
          border: `1px solid ${p.muted}`,
          borderHover: `1px solid ${p.accent}`,
          borderFocus: `1px solid ${p.accent}`,
          borderActive: `1px solid ${p.accent}`,
          boxShadowFocus: `0 0 0 2px ${p.selected}`,
          boxShadowActive: `0 0 0 2px ${p.selected}`,
          arrowColor: p.muted,
          arrowColorDisabled: p.muted,
        },
      },
    },
    ColorPicker: { border: `1px solid ${p.muted}`, peers: { Input: input } },
  };
});
const busy = ref(false),
  error = ref(''),
  tab = ref('basic'),
  folderText = ref(app.settings.folderDictionary.join('\n'));
const labels = ref<Label[]>(app.settings.labels.map((x) => ({ ...x }))),
  selectedLabels = ref<string[]>([]),
  deleteConfirm = ref(false);
const transferOpen = ref(false),
  exportSections = ref<TransferSection[]>(['ui', 'folders', 'labels']),
  importSections = ref<TransferSection[]>([]);
const report = ref<ReturnType<typeof previewSettings>>(),
  localImported = ref(false),
  serverConfirm = ref(false);
const diagnosticText = ref(''),
  portResult = ref<string>(),
  blockResult = ref<string>(),
  spaceResult = ref<string>();
const path = ref(String(app.session?.['download-dir'] ?? ''));
const initialDaemon = reactive<Record<string, any>>(JSON.parse(JSON.stringify(app.session ?? {}))),
  daemonDraft = reactive<Record<string, any>>({});
for (const field of SESSION_FIELDS)
  if (Object.hasOwn(initialDaemon, field.key)) daemonDraft[field.key] = initialDaemon[field.key];
const availableFields = computed(() =>
  SESSION_FIELDS.filter(
    (field) =>
      Object.hasOwn(daemonDraft, field.key) &&
      (field.version ?? 16) <= (app.session?.['rpc-version'] ?? 0),
  ),
);
const changes = computed(() =>
  Object.fromEntries(
    availableFields.value
      .filter((field) => daemonDraft[field.key] !== initialDaemon[field.key])
      .map((field) => [field.key, daemonDraft[field.key]]),
  ),
);
watch([() => app.session, busy], ([session, saving]) => {
  if (!session || saving || typeof session['alt-speed-enabled'] !== 'boolean') return;
  const key = 'alt-speed-enabled';
  if (daemonDraft[key] === initialDaemon[key]) daemonDraft[key] = session[key];
  initialDaemon[key] = session[key];
});
const utpLimitRisk = computed(
  () =>
    /^4\.0\.0(?:$|[^\d.])/.test(app.session?.version ?? '') &&
    (app.session?.['utp-enabled'] === true || daemonDraft['utp-enabled'] === true),
);
const alternateState = computed(() =>
  !app.ready || app.stale || typeof app.session?.['alt-speed-enabled'] !== 'boolean'
    ? t('scheduleStateUnavailable')
    : app.session['alt-speed-enabled']
      ? t('scheduleStateAlternate')
      : t('scheduleStateNormal'),
);
const directoryOptions = computed(() => [
  ...new Set([
    ...app.settings.folderDictionary,
    ...app.torrents.map((x) => x.downloadDir).filter((x): x is string => !!x),
  ]),
]);
const availableSections = computed<TransferSection[]>(() =>
  report.value
    ? [
        ...(report.value.sections ?? []),
        ...(Object.keys(report.value.server).length ? ['server' as const] : []),
      ]
    : [],
);
const unsupportedServer = computed(() =>
  Object.keys(report.value?.server ?? {}).filter(
    (key) =>
      !SESSION_FIELDS.some(
        (x) => x.key === key && (x.version ?? 16) <= (app.session?.['rpc-version'] ?? 0),
      ),
  ),
);
const importDiff = computed(() =>
  Object.entries(report.value?.server ?? {})
    .filter(
      ([key, value]) =>
        !unsupportedServer.value.includes(key) &&
        JSON.stringify(app.session?.[key]) !== JSON.stringify(value),
    )
    .map(([key, value]) => ({ key, before: app.session?.[key], after: value })),
);
const legacy = app.legacySettings(),
  backups = ref<Awaited<ReturnType<typeof app.loadBackups>>>([]);
function fieldLabel(key: string) {
  return ((locale.value === 'zh-CN' ? zhSession : enSession) as Record<string, string>)[key] || key;
}
function fields(group: string) {
  return (SESSION_GROUPS[group] ?? []).flatMap((key) =>
    availableFields.value.filter((field) => field.key === key),
  );
}
function fieldRows(group: string) {
  const items = fields(group),
    rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i++) {
    const next = items[i + 1];
    if (
      items[i].type === 'boolean' &&
      next?.type === 'number' &&
      !next.key.startsWith('alt-speed-time-') &&
      FIELD_DEPENDENCIES[next.key] === items[i].key
    ) {
      rows.push([items[i], next]);
      i++;
    } else rows.push([items[i]]);
  }
  return rows;
}
function compactField(key: string, type: string) {
  return type === 'number' || key === 'encryption';
}
function compactUnit(key: string) {
  if (key === 'speed-limit-down' || key === 'speed-limit-up') return 'KB/s';
  if (key === 'idle-seeding-limit' || key === 'queue-stalled-minutes') return fieldLabel('minutes');
  return '';
}
function disabled(key: string) {
  return busy.value || (!!FIELD_DEPENDENCIES[key] && !daemonDraft[FIELD_DEPENDENCIES[key]]);
}
function toggle(list: TransferSection[], value: TransferSection, checked: boolean) {
  return checked ? [...new Set([...list, value])] : list.filter((x) => x !== value);
}
async function attempt(work: () => Promise<unknown>) {
  error.value = '';
  busy.value = true;
  try {
    await work();
    return true;
  } catch (e) {
    error.value = errorMessage(e);
    return false;
  } finally {
    busy.value = false;
  }
}
async function saveLabel(item: Label) {
  await attempt(async () => {
    await app.saveLabel(item);
    message.success(t('success'));
  });
}
async function removeLabels() {
  if (
    await attempt(async () => {
      await app.removeLabels(selectedLabels.value);
      labels.value = labels.value.filter((x) => !selectedLabels.value.includes(x.id));
      selectedLabels.value = [];
    })
  )
    deleteConfirm.value = false;
}
async function saveFolders() {
  await attempt(async () => {
    await app.saveFolders(folderText.value);
    folderText.value = app.settings.folderDictionary.join('\n');
    message.success(t('success'));
  });
}
function preview(raw: unknown, labelsOnly = false) {
  report.value = undefined;
  localImported.value = false;
  serverConfirm.value = false;
  error.value = '';
  transferOpen.value = true;
  try {
    const next = previewSettings(raw, app.settings);
    if (labelsOnly && !next.sections?.includes('labels')) throw new Error(t('noSelection'));
    report.value = next;
    importSections.value = labelsOnly ? ['labels'] : [...(next.sections ?? [])];
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function importFile(event: Event, labelsOnly = false) {
  const element = event.target as HTMLInputElement,
    file = element.files?.[0];
  if (file) {
    report.value = undefined;
    localImported.value = false;
    serverConfirm.value = false;
    transferOpen.value = true;
    await attempt(async () => {
      const raw = JSON.parse(await file.text());
      preview(raw, labelsOnly);
    });
  }
  element.value = '';
}
async function importLocal() {
  const sections = importSections.value.filter((key): key is SettingsSection => key !== 'server');
  if (!sections.length || !report.value) return;
  await attempt(async () => {
    await app.importSettings(report.value!, sections);
    labels.value = app.settings.labels.map((x) => ({ ...x }));
    selectedLabels.value = [];
    folderText.value = app.settings.folderDictionary.join('\n');
    localImported.value = true;
    message.success(t('importComplete'));
  });
}
function exportSelected(sections = exportSections.value) {
  try {
    downloadJson(
      sections.length === 1 && sections[0] === 'labels'
        ? 'transmission-labels.json'
        : 'transmission-config.json',
      exportSettings(app.settings, app.session, sections),
    );
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function saveDaemon() {
  if (!Object.keys(changes.value).length) return;
  await attempt(async () => {
    await app.saveSession(changes.value);
    for (const field of availableFields.value) daemonDraft[field.key] = app.session?.[field.key];
    Object.assign(initialDaemon, app.session);
    message.success(t('success'));
  });
}
function confirmDaemon() {
  try {
    validateSessionPatch(
      Object.fromEntries(importDiff.value.map((x) => [x.key, x.after])),
      app.session!['rpc-version'],
    );
    error.value = '';
    serverConfirm.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function importDaemon() {
  await attempt(async () => {
    await app.saveSession(Object.fromEntries(importDiff.value.map((x) => [x.key, x.after])));
    for (const field of availableFields.value) daemonDraft[field.key] = app.session?.[field.key];
    Object.assign(initialDaemon, app.session);
    serverConfirm.value = false;
    message.success(t('success'));
  });
}
async function diagnostic(method: 'port-test' | 'free-space' | 'blocklist-update') {
  await attempt(async () => {
    const result = await app.diagnostic(
      method,
      method === 'free-space' ? String(daemonDraft['download-dir'] ?? path.value) : undefined,
    );
    if (method === 'port-test')
      portResult.value =
        result['port-is-open'] === true
          ? fieldLabel('port-is-open-true')
          : fieldLabel('port-is-open-false');
    if (method === 'blocklist-update')
      blockResult.value = t('blocklistCount', { count: result['blocklist-size'] ?? '—' });
    if (method === 'free-space')
      spaceResult.value =
        typeof result['size-bytes'] === 'number'
          ? formatBytes(result['size-bytes'])
          : t('dataUnavailable');
  });
}
async function external(kind: 'trackers' | 'release') {
  await attempt(async () => {
    diagnosticText.value = await externalText(
      kind === 'trackers' ? app.settings.ui.trackerListUrl : app.config!.releaseApi!,
    );
  });
}
</script>
<template>
  <NConfigProvider abstract :theme-overrides="settingsAppearance">
    <NModal
      :show="true"
      preset="card"
      :title="t('settings')"
      class="dialog large-dialog settings-dialog"
      @update:show="
        (show) => {
          if (!show) emit('close');
        }
      "
      @close="emit('close')"
    >
      <NAlert v-if="error" type="error" closable @close="error = ''">{{ error }}</NAlert>
      <NAlert
        v-if="utpLimitRisk && ['network', 'bandwidth', 'schedule'].includes(tab)"
        type="warning"
        data-testid="utp-limit-risk"
      >
        <p>{{ t('utpLimitRisk') }}</p>
        <NButton
          size="small"
          :disabled="busy || daemonDraft['utp-enabled'] === false"
          @click="daemonDraft['utp-enabled'] = false"
          >{{ t('disableUtpDraft') }}</NButton
        >
      </NAlert>
      <NTabs v-model:value="tab" type="line">
        <NTabPane
          v-for="group in SETTINGS_TABS"
          :key="group"
          :name="group"
          :tab="t('settings_' + group)"
        >
          <div v-if="SESSION_GROUPS[group]" class="settings-fields">
            <p v-if="group === 'schedule'" data-testid="schedule-live-state" role="status">
              {{ alternateState }} {{ t('scheduleStateHint') }}
            </p>
            <div
              v-for="row in fieldRows(group)"
              :key="row[0].key"
              class="settings-row"
              :class="{ 'settings-row--paired': row.length > 1 }"
            >
              <div
                v-for="field in row"
                :key="field.key"
                class="settings-field"
                :class="{
                  'settings-field--compact': compactField(field.key, field.type),
                  'settings-field--choice': field.key === 'encryption',
                  'settings-field--time':
                    field.key === 'alt-speed-time-begin' || field.key === 'alt-speed-time-end',
                  'settings-field--weekdays': field.key === 'alt-speed-time-day',
                }"
                :data-setting="field.key"
              >
                <NCheckbox
                  v-if="field.type === 'boolean'"
                  v-model:checked="daemonDraft[field.key]"
                  :disabled="busy"
                  >{{ fieldLabel(field.key) }}</NCheckbox
                >
                <template v-else>
                  <label
                    :id="'setting-' + field.key + '-label'"
                    :for="field.key === 'download-dir' ? undefined : 'setting-' + field.key"
                    >{{
                      field.key === 'alt-speed-time-begin'
                        ? t('scheduleStart')
                        : field.key === 'alt-speed-time-end'
                          ? t('scheduleEnd')
                          : field.key === 'alt-speed-time-day'
                            ? t('scheduleDays')
                            : fieldLabel(field.key)
                    }}</label
                  >
                  <NAutoComplete
                    v-if="field.key === 'download-dir'"
                    class="settings-path-input"
                    v-model:value="daemonDraft[field.key]"
                    :input-props="{
                      id: 'setting-' + field.key,
                      'aria-labelledby': 'setting-' + field.key + '-label',
                    }"
                    :options="directoryOptions"
                    :disabled="busy"
                  />
                  <NTimePicker
                    v-else-if="
                      field.key === 'alt-speed-time-begin' || field.key === 'alt-speed-time-end'
                    "
                    :formatted-value="minutesToTime(daemonDraft[field.key])"
                    format="HH:mm"
                    value-format="HH:mm"
                    :input-props="{ id: 'setting-' + field.key }"
                    :disabled="disabled(field.key)"
                    :clearable="false"
                    @update:formatted-value="
                      (value) => {
                        if (value) daemonDraft[field.key] = timeToMinutes(value);
                      }
                    "
                  />
                  <div
                    v-else-if="field.key === 'alt-speed-time-day'"
                    class="button-row settings-weekdays"
                    role="group"
                    :aria-label="t('scheduleDays')"
                  >
                    <NCheckbox
                      v-for="day in [1, 2, 3, 4, 5, 6, 0]"
                      :key="day"
                      :checked="!!(daemonDraft[field.key] & (1 << day))"
                      :disabled="disabled(field.key)"
                      @update:checked="
                        (checked) =>
                          (daemonDraft[field.key] = setWeekday(
                            daemonDraft[field.key],
                            day,
                            checked,
                          ))
                      "
                      >{{ t('weekday' + day) }}</NCheckbox
                    >
                  </div>
                  <NInputNumber
                    v-else-if="field.type === 'number'"
                    v-model:value="daemonDraft[field.key]"
                    :input-props="{ id: 'setting-' + field.key }"
                    :min="field.min"
                    :max="field.max"
                    :precision="field.key === 'seedRatioLimit' ? undefined : 0"
                    :disabled="disabled(field.key)"
                    ><template v-if="row.length > 1 && compactUnit(field.key)" #suffix
                      ><span class="settings-unit">{{ compactUnit(field.key) }}</span></template
                    ></NInputNumber
                  >
                  <NSelect
                    v-else-if="field.key === 'encryption'"
                    v-model:value="daemonDraft[field.key]"
                    :aria-label="fieldLabel(field.key)"
                    :options="
                      ['required', 'preferred', 'tolerated'].map((value) => ({
                        label: t('encryption_' + value),
                        value,
                      }))
                    "
                    :disabled="busy"
                  />
                  <NInput
                    v-else
                    v-model:value="daemonDraft[field.key]"
                    :input-props="{ id: 'setting-' + field.key }"
                    :type="field.key === 'default-trackers' ? 'textarea' : 'text'"
                    :autosize="
                      field.key === 'default-trackers' ? { minRows: 3, maxRows: 6 } : undefined
                    "
                    :disabled="disabled(field.key)"
                  />
                </template>
                <div v-if="field.key === 'download-dir'" class="settings-inline">
                  <NButton
                    size="small"
                    :loading="busy"
                    :disabled="!app.ready"
                    @click="diagnostic('free-space')"
                    >{{ t('freeSpace') }}</NButton><span role="status">{{
                    spaceResult ??
                    (app.freeSpace.path === daemonDraft['download-dir'] &&
                    app.freeSpace.bytes !== undefined
                      ? formatBytes(app.freeSpace.bytes)
                      : '—')
                  }}</span>
                </div>
                <div v-if="field.key === 'peer-port'" class="settings-inline">
                  <NButton
                    size="small"
                    :loading="busy"
                    :disabled="!app.ready"
                    @click="diagnostic('port-test')"
                    >{{ t('testPort') }}</NButton><span role="status">{{ portResult }}</span
                  ><small>{{ t('currentPortHint') }}</small>
                </div>
                <div v-if="field.key === 'blocklist-url'" class="settings-inline">
                  <NButton
                    size="small"
                    :loading="busy"
                    :disabled="!app.ready"
                    @click="diagnostic('blocklist-update')"
                    >{{ t('updateBlocklist') }}</NButton><span role="status">{{
                    blockResult ??
                    t('blocklistCount', { count: app.session?.['blocklist-size'] ?? '—' })
                  }}</span
                  ><small>{{ t('currentBlocklistHint') }}</small>
                </div>
              </div>
            </div>
            <p v-if="group === 'schedule'">{{ t('scheduleHint') }}</p>
            <p v-if="!fields(group).length">{{ t('dataUnavailable') }}</p>
          </div>
          <div v-if="group === 'basic'" class="form-stack settings-subsection">
            <div class="form-stack">
              <span>{{ t('configDirectory') }}</span><NInput
                :value="String(app.session?.['config-dir'] ?? '—')"
                readonly
                :input-props="{ 'aria-label': t('configDirectory') }"
              />
            </div>
            <h3>{{ t('localPreferences') }}</h3>
            <p>{{ t('localImmediate') }}</p>
            <label
              class="settings-preference-row settings-preference-row--choice"
              data-preference="locale"
              >{{ t('language')
              }}<NSelect
                :value="app.settings.ui.locale"
                :options="[{ label: t('automatic'), value: 'auto' }, ...languages]"
                @update:value="(locale) => app.updateUi({ locale })"
            /></label>
            <NCheckbox
              :checked="app.settings.ui.autoRefresh"
              @update:checked="(autoRefresh) => app.updateUi({ autoRefresh })"
              >{{ t('autoRefresh') }}</NCheckbox
            >
            <label class="settings-preference-row" data-preference="refreshIntervalMs"
              >{{ t('refreshInterval')
              }}<NInputNumber
                :value="app.settings.ui.refreshIntervalMs"
                :disabled="!app.settings.ui.autoRefresh"
                :min="2000"
                :max="300000"
                :step="1000"
                @update:value="(value) => value && app.updateUi({ refreshIntervalMs: value })"
            /></label>
            <NCheckbox
              :checked="app.settings.ui.pagination"
              @update:checked="(pagination) => app.updateUi({ pagination })"
              >{{ t('pagination') }}</NCheckbox
            >
            <label class="settings-preference-row" data-preference="pageSize"
              >{{ t('pageSize')
              }}<NSelect
                :value="app.settings.ui.pageSize"
                :disabled="!app.settings.ui.pagination"
                :options="
                  [50, 100, 200, 500, 1000, 5000].map((value) => ({ label: String(value), value }))
                "
                @update:value="(pageSize) => app.updateUi({ pageSize })"
            /></label>
            <NCheckbox
              :checked="app.settings.ui.forceDesktop"
              @update:checked="(forceDesktop) => app.updateUi({ forceDesktop })"
              >{{ t('forceDesktop') }}</NCheckbox
            >
            <p>{{ t('resetUiHint') }}</p>
            <NButton :disabled="busy" @click="attempt(() => app.updateUi(defaultSettings().ui))">{{
              t('resetUi')
            }}</NButton>
          </div>
          <div v-if="group === 'folders'" class="form-stack">
            <p>{{ t('folderHint') }}</p>
            <NInput
              v-model:value="folderText"
              :input-props="{ 'aria-label': t('folderDictionary') }"
              type="textarea"
              :autosize="{ minRows: 8, maxRows: 16 }"
            /><NButton type="primary" :loading="busy" @click="saveFolders">{{ t('save') }}</NButton>
          </div>
          <div v-if="group === 'extra'" class="form-stack">
            <h3>{{ t('manualServices') }}</h3>
            <p>{{ t('manualOnly') }}</p>
            <label
              >{{ t('ipUrl', { ip: '{ip}' })
              }}<NInput
                :value="app.settings.ui.ipUrl"
                @update:value="(ipUrl) => app.updateUi({ ipUrl })"
            /></label>
            <label
              >{{ t('trackerUrl')
              }}<NInput
                :value="app.settings.ui.trackerListUrl"
                @update:value="(trackerListUrl) => app.updateUi({ trackerListUrl })"
            /></label>
            <div class="button-row">
              <NButton :loading="busy" @click="external('trackers')">{{
                t('loadTrackers')
              }}</NButton><NButton
                :loading="busy"
                :disabled="!app.config?.releaseApi"
                @click="external('release')"
                >{{ t('checkUpdates') }}</NButton
              >
            </div>
            <pre v-if="diagnosticText" class="text-result">{{ diagnosticText }}</pre>
          </div>
          <div v-if="group === 'labels'" class="form-stack">
            <div class="button-row">
              <NButton
                :disabled="busy"
                @click="
                  labels.push({
                    id: uniqueId(),
                    name: t('newLabel'),
                    color: '#168c7e',
                    description: '',
                  })
                "
                >＋ {{ t('newLabel') }}</NButton
              ><NButton
                type="error"
                :disabled="busy || !selectedLabels.length"
                @click="deleteConfirm = true"
                >{{ t('deleteSelectedLabels') }} ({{ selectedLabels.length }})</NButton
              ><NButton @click="exportSelected(['labels'])">{{ t('exportLabels') }}</NButton
              ><label class="file-picker"
                >{{ t('importLabels')
                }}<input
                  data-testid="labels-import"
                  type="file"
                  accept=".json,application/json"
                  :disabled="busy"
                  @change="(event) => importFile(event, true)"
              /></label>
            </div>
            <div v-for="item in labels" :key="item.id" class="label-editor settings-label-row">
              <NCheckbox
                :aria-label="t('labelSelection', { name: item.name })"
                :checked="selectedLabels.includes(item.id)"
                @update:checked="
                  (checked) =>
                    (selectedLabels = checked
                      ? [...selectedLabels, item.id]
                      : selectedLabels.filter((id) => id !== item.id))
                "
              /><NInput
                v-model:value="item.name"
                :input-props="{ 'aria-label': t('labelName') }"
                :placeholder="t('labelName')"
              /><NInput
                v-model:value="item.description"
                :input-props="{ 'aria-label': t('description') }"
                :placeholder="t('description')"
              /><NColorPicker
                v-model:value="item.color"
                :modes="['hex']"
                :show-alpha="false"
                :aria-label="t('color')"
              /><NButton :loading="busy" @click="saveLabel(item)">{{ t('save') }}</NButton>
            </div>
          </div>
        </NTabPane>
      </NTabs>
      <template #footer
        ><div class="settings-footer">
          <NButton :disabled="busy" @click="transferOpen = true">{{
            t('configurationTransfer')
          }}</NButton><span v-if="Object.keys(changes).length">{{
            t('unsavedServerChanges', { count: Object.keys(changes).length })
          }}</span
          ><NButton
            v-if="SESSION_GROUPS[tab]"
            type="primary"
            :loading="busy"
            :disabled="!app.ready || !Object.keys(changes).length"
            @click="saveDaemon"
            >{{ t('saveDaemonSettings') }}</NButton
          >
        </div></template
      >
      <NModal
        v-model:show="transferOpen"
        preset="card"
        :title="t('configurationTransfer')"
        class="dialog large-dialog settings-transfer"
      >
        <NAlert v-if="error" type="error" closable @close="error = ''">{{ error }}</NAlert>
        <p>{{ t('transferHint') }}</p>
        <h3>{{ t('exportConfig') }}</h3>
        <div class="button-row">
          <NCheckbox
            v-for="section in TRANSFER_SECTIONS"
            :key="section"
            :checked="exportSections.includes(section)"
            :disabled="section === 'server' && !app.session"
            @update:checked="
              (checked) => (exportSections = toggle(exportSections, section, checked))
            "
            >{{ t('transfer_' + section) }}</NCheckbox
          >
        </div>
        <NButton :disabled="!exportSections.length" @click="exportSelected()">{{
          t('exportSelected')
        }}</NButton>
        <h3>{{ t('importConfig') }}</h3>
        <div class="button-row">
          <label class="file-picker"
            >{{ t('selectImportFile')
            }}<input
              data-testid="config-import"
              type="file"
              accept=".json,application/json"
              :disabled="busy"
              @change="importFile" /></label
          ><NButton v-if="legacy.available" :disabled="busy" @click="preview(legacy.raw)">{{
            t('migrate')
          }}</NButton>
        </div>
        <NAlert v-if="legacy.errors.length" type="warning">{{
          legacy.errors.map((note) => (note === 'storageUnavailable' ? t(note) : note)).join('\n')
        }}</NAlert>
        <section v-if="report" class="import-preview">
          <h3>{{ t('importPreview') }}</h3>
          <p>{{ t('selectedCategories') }}</p>
          <div class="button-row">
            <NCheckbox
              v-for="section in availableSections"
              :key="section"
              :checked="importSections.includes(section)"
              :disabled="busy"
              @update:checked="
                (checked) => {
                  importSections = toggle(importSections, section, checked);
                  localImported = false;
                }
              "
              >{{ t('transfer_' + section) }}</NCheckbox
            >
          </div>
          <p>
            {{ t('labels') }}: {{ report.settings.labels.length }} · {{ t('folderDictionary') }}:
            {{ report.settings.folderDictionary.length }}
          </p>
          <NAlert v-if="importSections.includes('labels')" type="warning">{{
            t('labelReplaceHint')
          }}</NAlert>
          <ul>
            <li v-for="note in report.warnings" :key="note">{{ note }}</li>
          </ul>
          <NAlert v-if="unsupportedServer.length" type="warning">{{
            t('serverImportUnsupported', { keys: unsupportedServer.join(', ') })
          }}</NAlert>
          <p>{{ t('backupSaved') }}</p>
          <div class="button-row">
            <NButton
              type="primary"
              :loading="busy"
              :disabled="localImported || !importSections.some((x) => x !== 'server')"
              @click="importLocal"
              >{{ t('importLocal') }}</NButton><NButton
              v-if="availableSections.includes('server')"
              :disabled="
                busy || !app.ready || !importSections.includes('server') || !importDiff.length
              "
              @click="confirmDaemon"
              >{{ t('importServer') }} ({{ importDiff.length }})</NButton
            >
          </div>
        </section>
        <NButton
          :disabled="busy"
          @click="
            attempt(async () => {
              backups = await app.loadBackups();
            })
          "
          >{{ t('backups') }}</NButton
        >
        <div v-for="backup in backups" :key="backup.id" class="button-row">
          <span>{{ new Date(backup.at).toLocaleString() }}</span><NButton
            size="small"
            @click="downloadJson('transmission-ui-backup.json', backup)"
            >{{ t('exportBackup') }}</NButton
          >
        </div>
      </NModal>
      <NModal
        v-model:show="serverConfirm"
        preset="card"
        :title="t('serverDiff')"
        class="dialog large-dialog"
        ><p>{{ t('importServerHint') }}</p>
        <table class="diff-table">
          <thead>
            <tr>
              <th>{{ t('name') }}</th>
              <th>{{ t('oldValue') }}</th>
              <th>{{ t('newValue') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in importDiff" :key="item.key">
              <td>{{ fieldLabel(item.key) }}</td>
              <td>{{ String(item.before) }}</td>
              <td>{{ String(item.after) }}</td>
            </tr>
          </tbody>
        </table>
        <NAlert v-if="error" type="error">{{ error }}</NAlert><template #footer
          ><NButton type="warning" :loading="busy" @click="importDaemon">{{
            t('confirm')
          }}</NButton></template
        ></NModal
      >
      <NModal
        v-model:show="deleteConfirm"
        preset="card"
        :title="t('deleteSelectedLabels')"
        class="dialog small-dialog"
        ><p>{{ t('deleteLabelsConfirm', { count: selectedLabels.length }) }}</p>
        <NAlert v-if="error" type="error">{{ error }}</NAlert><template #footer
          ><NButton type="error" :loading="busy" @click="removeLabels">{{
            t('confirm')
          }}</NButton></template
        ></NModal
      >
    </NModal>
  </NConfigProvider>
</template>
