<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  NModal,
  NTabs,
  NTabPane,
  NInput,
  NInputNumber,
  NSelect,
  NCheckbox,
  NButton,
  NAlert,
  NColorPicker,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { languages } from '../i18n';
import { defaultSettings, errorMessage, uniqueId } from '../domain/torrents';
import type { Label, MigrationReport } from '../domain/types';
import { migrateSettings } from '../services/settings';
import { SESSION_FIELDS, validateSessionPatch } from '../services/session-fields';
import { downloadJson, externalText } from '../services/files';
import enSession from '../i18n/session/en.json';
import zhSession from '../i18n/session/zh-CN.json';
const emit = defineEmits<{ close: [] }>(),
  app = useAppStore(),
  { t, locale } = useI18n(),
  message = useMessage();
const localImported = ref(false);
const busy = ref(false),
  error = ref(''),
  tab = ref('appearance'),
  folderText = ref(app.settings.folderDictionary.join('\n')),
  labels = ref<Label[]>(app.settings.labels.map((x) => ({ ...x }))),
  report = ref<MigrationReport>(),
  input = ref<any>(),
  diagnosticText = ref(''),
  serverConfirm = ref(false),
  path = ref(String(app.session?.['download-dir'] ?? ''));
const daemonDraft = reactive<Record<string, any>>({}),
  initialDaemon = JSON.parse(JSON.stringify(app.session ?? {}));
for (const field of SESSION_FIELDS)
  if (Object.hasOwn(initialDaemon, field.key)) daemonDraft[field.key] = initialDaemon[field.key];
const daemonFields = computed(() =>
  SESSION_FIELDS.filter(
    (field) =>
      Object.hasOwn(daemonDraft, field.key) &&
      (field.version ?? 16) <= (app.session?.['rpc-version'] ?? 0),
  ),
);
const legacy = app.legacySettings();
const backups = ref<Awaited<ReturnType<typeof app.loadBackups>>>([]);
async function loadBackups() {
  await attempt(async () => {
    backups.value = await app.loadBackups();
  });
}
const importDiff = computed(() =>
  Object.entries(input.value?.server ?? {})
    .filter(
      ([key, value]) =>
        SESSION_FIELDS.some(
          (x) => x.key === key && (x.version ?? 16) <= (app.session?.['rpc-version'] ?? 0),
        ) && JSON.stringify(app.session?.[key]) !== JSON.stringify(value),
    )
    .map(([key, value]) => ({ key, before: app.session?.[key], after: value })),
);
function fieldLabel(key: string) {
  const source = (locale.value === 'zh-CN' ? zhSession : enSession) as Record<string, string>;
  return source[key] || key;
}
async function attempt(work: () => Promise<unknown>) {
  error.value = '';
  busy.value = true;
  try {
    await work();
  } catch (e) {
    error.value = errorMessage(e);
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
async function removeLabel(id: string) {
  await attempt(async () => {
    await app.removeLabel(id);
    labels.value = labels.value.filter((item) => item.id !== id);
  });
}
async function saveFolders() {
  await attempt(async () => {
    await app.saveFolders(folderText.value);
    message.success(t('success'));
  });
}
function preview(raw: unknown) {
  localImported.value = false;
  error.value = '';
  try {
    input.value = raw;
    report.value = migrateSettings(raw, app.settings);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await attempt(async () => preview(JSON.parse(await file.text())));
}
async function importLocal() {
  await attempt(async () => {
    await app.importSettings(report.value!);
    labels.value = app.settings.labels.map((x) => ({ ...x }));
    folderText.value = app.settings.folderDictionary.join('\n');
    localImported.value = true;
    message.success(t('success'));
  });
}
async function saveDaemon() {
  await attempt(async () => {
    const changes = Object.fromEntries(
      Object.entries(daemonDraft).filter(([key, value]) => value !== initialDaemon[key]),
    );
    await app.saveSession(changes);
    Object.assign(initialDaemon, app.session);
    message.success(t('success'));
  });
}
async function importDaemon() {
  await attempt(async () => {
    const patch = validateSessionPatch(
      Object.fromEntries(importDiff.value.map((x) => [x.key, x.after])),
      app.session!['rpc-version'],
    );
    await app.saveSession(patch);
    Object.assign(daemonDraft, patch);
    Object.assign(initialDaemon, app.session);
    serverConfirm.value = false;
    message.success(t('success'));
  });
}
async function diagnostic(method: 'port-test' | 'free-space' | 'blocklist-update') {
  await attempt(async () => {
    diagnosticText.value = JSON.stringify(
      await app.diagnostic(method, method === 'free-space' ? path.value : undefined),
      null,
      2,
    );
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
  <NModal
    :show="true"
    @update:show="
      (show) => {
        if (!show) emit('close');
      }
    "
    preset="card"
    :title="t('settings')"
    class="dialog large-dialog"
    @close="emit('close')"
    ><NAlert v-if="error" type="error" closable @close="error = ''">{{ error }}</NAlert
    ><NTabs v-model:value="tab" type="line" animated
      ><NTabPane name="appearance" :tab="t('appearance')"
        ><div class="form-stack">
          <label
            >{{ t('language')
            }}<NSelect
              :value="app.settings.ui.locale"
              :options="[{ label: t('automatic'), value: 'auto' }, ...languages]"
              @update:value="(locale) => app.updateUi({ locale })" /></label
          ><NCheckbox
            :checked="app.settings.ui.autoRefresh"
            @update:checked="(autoRefresh) => app.updateUi({ autoRefresh })"
            >{{ t('autoRefresh') }}</NCheckbox
          ><label
            >{{ t('refreshInterval')
            }}<NInputNumber
              :value="app.settings.ui.refreshIntervalMs"
              :disabled="!app.settings.ui.autoRefresh"
              :min="2000"
              :max="300000"
              :step="1000"
              @update:value="
                (value) => value && app.updateUi({ refreshIntervalMs: value })
              " /></label
          ><NCheckbox
            :checked="app.settings.ui.pagination"
            @update:checked="(pagination) => app.updateUi({ pagination })"
            >{{ t('pagination') }}</NCheckbox
          ><label
            >{{ t('pageSize')
            }}<NSelect
              :value="app.settings.ui.pageSize"
              :options="
                [50, 100, 200, 500, 1000, 5000].map((value) => ({ label: String(value), value }))
              "
              @update:value="(pageSize) => app.updateUi({ pageSize })" /></label
          ><NCheckbox
            :checked="app.settings.ui.forceDesktop"
            @update:checked="(forceDesktop) => app.updateUi({ forceDesktop })"
            >{{ t('forceDesktop') }}</NCheckbox
          ><NButton @click="app.updateUi(defaultSettings().ui)">{{ t('resetUi') }}</NButton>
        </div></NTabPane
      >
      <NTabPane name="daemon" :tab="t('daemon')"
        ><div v-if="app.session" class="config-grid">
          <label v-for="field in daemonFields" :key="field.key"
            ><span :title="field.key">{{ fieldLabel(field.key) }}</span
            ><NCheckbox
              v-if="field.type === 'boolean'"
              v-model:checked="daemonDraft[field.key]" /><NInputNumber
              v-else-if="field.type === 'number'"
              v-model:value="daemonDraft[field.key]"
              :min="field.min"
              :max="field.max"
              size="small" /><NSelect
              v-else-if="field.key === 'encryption'"
              v-model:value="daemonDraft[field.key]"
              :options="
                ['required', 'preferred', 'tolerated'].map((value) => ({ label: value, value }))
              " /><NInput v-else v-model:value="daemonDraft[field.key]" size="small"
          /></label>
        </div>
        <NButton type="primary" :loading="busy" :disabled="!app.ready" @click="saveDaemon">{{
          t('save')
        }}</NButton></NTabPane
      >
      <NTabPane name="data" :tab="t('data')"
        ><div class="form-stack">
          <h3>{{ t('labels') }}</h3>
          <div v-for="item in labels" :key="item.id" class="label-editor">
            <NInput v-model:value="item.name" :placeholder="t('labelName')" /><NInput
              v-model:value="item.description"
              :placeholder="t('description')"
            /><NColorPicker
              v-model:value="item.color"
              :modes="['hex']"
              :show-alpha="false"
            /><NButton size="small" :loading="busy" @click="saveLabel(item)">{{
              t('save')
            }}</NButton
            ><NButton size="small" @click="removeLabel(item.id)">×</NButton>
          </div>
          <NButton
            @click="
              labels.push({
                id: uniqueId(),
                name: t('newLabel'),
                color: '#168c7e',
                description: '',
              })
            "
            >＋ {{ t('newLabel') }}</NButton
          ><label
            >{{ t('folderDictionary')
            }}<NInput
              v-model:value="folderText"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 10 }" /></label
          ><NButton :loading="busy" @click="saveFolders">{{ t('save') }}</NButton>
          <div class="button-row">
            <NButton @click="downloadJson('transmission-ui-config.json', app.settings)">{{
              t('exportConfig')
            }}</NButton><NButton
              :disabled="!app.session"
              @click="
                downloadJson('transmission-daemon-config.json', {
                  configVersion: 1,
                  server: Object.fromEntries(
                    SESSION_FIELDS.filter((x) => app.session?.[x.key] !== undefined).map((x) => [
                      x.key,
                      app.session![x.key],
                    ]),
                  ),
                })
              "
              >{{ t('exportServer') }}</NButton
            ><label class="file-picker"
              >{{ t('importConfig')
              }}<input type="file" accept=".json,application/json" @change="importFile" /></label
            ><NButton v-if="legacy.available" @click="preview(legacy.raw)">{{
              t('migrate')
            }}</NButton>
          </div>
          <NAlert v-if="legacy.errors.length" type="warning">{{
            legacy.errors.map((note) => (note === 'storageUnavailable' ? t(note) : note)).join('\n')
          }}</NAlert><NButton @click="loadBackups">{{ t('backups') }}</NButton>
          <div v-for="backup in backups" :key="backup.id" class="button-row">
            <span>{{ new Date(backup.at).toLocaleString() }}</span><NButton
              size="small"
              @click="downloadJson('transmission-ui-backup.json', backup)"
              >{{ t('exportBackup') }}</NButton
            >
          </div>
          <section v-if="report" class="import-preview">
            <h3>{{ t('importPreview') }}</h3>
            <p>
              {{ t('labels') }}: {{ report.settings.labels.length }} · {{ t('folderDictionary') }}:
              {{ report.settings.folderDictionary.length }}
            </p>
            <ul>
              <li v-for="note in report.warnings" :key="note">{{ note }}</li>
            </ul>
            <p>{{ t('backupSaved') }}</p>
            <NButton
              type="primary"
              :loading="busy"
              :disabled="localImported"
              @click="importLocal"
              >{{ t('importLocal') }}</NButton><NButton
              v-if="importDiff.length"
              @click="serverConfirm = true"
              >{{ t('importServer') }} ({{ importDiff.length }})</NButton
            >
          </section>
        </div></NTabPane
      >
      <NTabPane name="advanced" :tab="t('advanced')"
        ><div class="form-stack">
          <div class="button-row">
            <NButton :loading="busy" :disabled="!app.ready" @click="diagnostic('port-test')">{{
              t('testPort')
            }}</NButton><NButton
              :loading="busy"
              :disabled="!app.ready"
              @click="diagnostic('blocklist-update')"
              >{{ t('updateBlocklist') }}</NButton
            >
          </div>
          <label>{{ t('directory') }}<NInput v-model:value="path" /></label
          ><NButton
            :loading="busy"
            :disabled="!app.ready || !path"
            @click="diagnostic('free-space')"
            >{{ t('freeSpace') }}</NButton
          >
          <h3>{{ t('manualServices') }}</h3>
          <p class="muted">{{ t('manualOnly') }}</p>
          <label
            >{{ t('ipUrl', { ip: '{ip}' })
            }}<NInput
              :value="app.settings.ui.ipUrl"
              @update:value="(ipUrl) => app.updateUi({ ipUrl })" /></label
          ><label
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
        </div></NTabPane
      ></NTabs
    ><NModal
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
    ></NModal
  >
</template>
