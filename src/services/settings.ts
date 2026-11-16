import { openDB, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { LAYOUT_THEME_IDS } from '../domain/themes';
import { VISUAL_THEME_IDS } from '../domain/visual-themes';
import {
  defaultSettings,
  DEFAULT_COLUMNS,
  PREVIOUS_DEFAULT_COLUMNS,
  uniqueId,
} from '../domain/torrents';
import type {
  Settings,
  MigrationReport,
  MatchJob,
  UiSettings,
  ColumnSetting,
  SettingsSection,
} from '../domain/types';

const columnSchema = z.object({
  key: z.string(),
  width: z.number().min(40).max(1200),
  visible: z.boolean(),
});
const uiSchema = z.object({
  columnPresetVersion: z.number().int().optional(),
  columnsBackup: z.array(columnSchema).optional(),
  navigationExpanded: z.record(z.string(), z.boolean()).optional(),
  locale: z.string(),
  theme: z.enum(['light', 'dark', 'system']),
  layoutTheme: z.enum(LAYOUT_THEME_IDS).catch('workbench'),
  visualTheme: z.enum(VISUAL_THEME_IDS).catch('modern'),
  refreshIntervalMs: z.number().min(2000).max(300000),
  autoRefresh: z.boolean(),
  pagination: z.boolean(),
  pageSize: z.number().int().min(10).max(5000),
  filePageSize: z.number().int().min(10).max(5000).catch(200),
  sidebarWidth: z.number().min(160).max(400),
  detailHeight: z.number().min(160).max(900),
  forceDesktop: z.boolean(),
  columns: z.array(columnSchema),
  ipUrl: z.string(),
  trackerListUrl: z.string(),
});
export const settingsSchema = z.object({
  schemaVersion: z.literal(2),
  ui: uiSchema,
  labels: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      description: z.string().optional(),
    }),
  ),
  torrentLabels: z.record(z.string(), z.array(z.string())),
  folderDictionary: z.array(z.string()),
});
export const LEGACY_KEYS = [
  'transmission-web-control.system',
  'transmission-web-control',
  'dictionary.folders',
  'auto-match-data-folder-work-mode',
  'auto-match-data-folder-time-interval',
];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function normalizeFolders(value: string[] | string): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value.split('\n')).map((x) => x.trim()).filter(Boolean),
    ),
  ];
}
export function migrateSettings(raw: any, current: Settings = defaultSettings()): MigrationReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Configuration must be a JSON object');
  if (raw.schemaVersion !== undefined) {
    if (raw.schemaVersion !== 2) throw new Error('Unsupported configuration schema version');
    const settings = settingsSchema.parse(raw);
    const labelIds = new Set(settings.labels.map((x) => x.id));
    if (labelIds.size !== settings.labels.length) throw new Error('Duplicate label IDs');
    const warnings: string[] = [];
    for (const [hash, ids] of Object.entries(settings.torrentLabels)) {
      if (ids.some((id) => !labelIds.has(id))) warnings.push(`Unresolved labels: ${hash}`);
      settings.torrentLabels[hash] = ids.filter((id) => labelIds.has(id));
    }
    if (!settings.ui.columnPresetVersion) {
      const columns = settings.ui.columns;
      const previous = PREVIOUS_DEFAULT_COLUMNS;
      if (
        columns.length === previous.length &&
        columns.every(
          (c, i) =>
            c.key === previous[i].key &&
            c.width === previous[i].width &&
            c.visible === previous[i].visible,
        )
      ) {
        settings.ui.columnsBackup = clone(columns);
        settings.ui.columns = clone(DEFAULT_COLUMNS);
      }
      settings.ui.columnPresetVersion = 1;
    }
    const known = new Set(DEFAULT_COLUMNS.map((x) => x.key));
    settings.ui.columns = settings.ui.columns.filter(
      (c, index, list) => known.has(c.key) && list.findIndex((x) => x.key === c.key) === index,
    );
    for (const col of DEFAULT_COLUMNS)
      if (!settings.ui.columns.some((x) => x.key === col.key)) settings.ui.columns.push(clone(col));
    return { settings, warnings, raw };
  }
  if (raw.configVersion !== undefined && raw.configVersion !== 1)
    throw new Error('Unsupported legacy configuration version');
  if (!['system', 'user', 'dictionary-folders', 'server'].some((key) => Object.hasOwn(raw, key)))
    throw new Error('No recognized configuration sections');
  const settings = clone(current),
    warnings: string[] = [];
  const system = raw.system;
  if (system && typeof system === 'object') {
    const theme = String(system.theme ?? '');
    if (theme) settings.ui.theme = /black|dark/i.test(theme) ? 'dark' : 'light';
    if (typeof system.autoReload === 'boolean') settings.ui.autoRefresh = system.autoReload;
    if (typeof system.reloadStep === 'number')
      settings.ui.refreshIntervalMs = Math.min(300000, Math.max(2000, system.reloadStep));
    if (typeof system.pagination === 'boolean') settings.ui.pagination = system.pagination;
    if (Number.isInteger(system.pageSize))
      settings.ui.pageSize = Math.min(5000, Math.max(10, system.pageSize));
    if (system.defaultLang) settings.ui.locale = String(system.defaultLang).replace('_', '-');
    if (Array.isArray(system.labels)) {
      settings.labels = system.labels.map((x: any, index: number) => ({
        id: uniqueId(),
        name: String(x.name ?? x.text ?? `Label ${index + 1}`),
        description: String(x.description ?? ''),
        color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#18a058',
      }));
      settings.torrentLabels = {};
      for (const [hash, indexes] of Object.entries(system.labelMaps || {})) {
        if (!Array.isArray(indexes) || !/^[0-9a-f]{40,64}$/i.test(hash)) {
          warnings.push(`Invalid label mapping: ${hash}`);
          continue;
        }
        settings.torrentLabels[hash] = [
          ...new Set(
            indexes.flatMap((index) => {
              const label = settings.labels[Number(index)];
              if (!Number.isInteger(Number(index)) || !label) {
                warnings.push(`Unresolved label: ${hash}/${index}`);
                return [];
              }
              return [label.id];
            }),
          ),
        ];
      }
      warnings.push(
        'Legacy label positions are preserved; historical mis-associations cannot be inferred.',
      );
    }
  }
  if (Object.hasOwn(raw, 'dictionary-folders')) {
    const folders = raw['dictionary-folders'];
    if (
      folders !== null &&
      typeof folders !== 'string' &&
      (!Array.isArray(folders) || folders.some((x) => typeof x !== 'string'))
    )
      throw new Error('Invalid folder dictionary');
    settings.folderDictionary = normalizeFolders(folders ?? []);
  }
  const oldColumns = raw.user?.torrentList?.fields;
  if (Array.isArray(oldColumns)) {
    const aliases: Record<string, string> = { remainingTime: 'eta', statusCode: 'status' };
    const result: ColumnSetting[] = [];
    for (const field of oldColumns) {
      const key = aliases[field.field] ?? field.field;
      const base = DEFAULT_COLUMNS.find((x) => x.key === key);
      if (base && !result.some((x) => x.key === key))
        result.push({
          key,
          width: Math.max(40, Math.min(1200, Number(field.width) || base.width)),
          visible: !(field.hidden === true || field.hidden === 'true'),
        });
    }
    settings.ui.columns = [
      ...result,
      ...DEFAULT_COLUMNS.filter((x) => !result.some((c) => c.key === x.key)).map(clone),
    ];
  }
  if (raw.server)
    warnings.push(
      'Daemon settings require separate explicit confirmation; local import will not apply them.',
    );
  return { settings: settingsSchema.parse(settings), warnings, raw };
}
export function readLegacy(storage: Pick<Storage, 'getItem'>): {
  raw: any;
  available: boolean;
  errors: string[];
} {
  const raw: any = { configVersion: 1, originalStorage: {} },
    errors: string[] = [];
  let available = false;
  for (const key of LEGACY_KEYS) {
    try {
      raw.originalStorage[key] = storage.getItem(key);
    } catch {
      errors.push(`Storage unavailable: ${key}`);
    }
  }
  for (const [key, section] of [
    [LEGACY_KEYS[0], 'system'],
    [LEGACY_KEYS[1], 'user'],
  ] as const) {
    try {
      const value = storage.getItem(key);
      if (value !== null) {
        available = true;
        raw[section] = JSON.parse(value);
      }
    } catch {
      errors.push(`Invalid JSON: ${key}`);
    }
  }
  try {
    const folders = storage.getItem('dictionary.folders');
    if (folders !== null) {
      raw['dictionary-folders'] = folders.split('\n');
      available = true;
    }
  } catch {
    errors.push('Local storage unavailable');
  }
  return { raw, available, errors };
}
export class SettingsRepository {
  private db?: IDBPDatabase;
  private memoryBackups: { id: string; at: number; raw: unknown; previous?: Settings }[] = [];
  private memory = defaultSettings();
  persistent = true;
  channel?: BroadcastChannel;
  onChange?: () => void;
  constructor(
    public instanceKey: string,
    private defaults = defaultSettings(),
  ) {
    this.memory = clone(defaults);
  }
  async init(): Promise<Settings> {
    try {
      this.db = await openDB('transmission-web-ui', 2, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
        },
      });
    } catch {
      this.persistent = false;
    }
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`twui:${this.instanceKey}`);
      this.channel.onmessage = () => this.onChange?.();
    }
    return this.load();
  }
  async load(): Promise<Settings> {
    if (!this.db) {
      this.memory = migrateSettings(this.memory).settings;
      return clone(this.memory);
    }
    const tx = this.db.transaction('data', 'readwrite');
    const value = await tx.store.get(`${this.instanceKey}:settings`);
    const next = value ? migrateSettings(value).settings : clone(this.defaults);
    if (value && JSON.stringify(value) !== JSON.stringify(next))
      await tx.store.put(clone(next), `${this.instanceKey}:settings`);
    await tx.done;
    return next;
  }
  columnPreset(restore = false) {
    return this.update((current) => {
      if (restore) {
        if (current.ui.columnsBackup) {
          current.ui.columns = clone(current.ui.columnsBackup);
          delete current.ui.columnsBackup;
        }
      } else {
        current.ui.columnsBackup = clone(current.ui.columns);
        current.ui.columns = clone(DEFAULT_COLUMNS);
      }
      current.ui.columnPresetVersion = 1;
      return current;
    });
  }
  async update(mutator: (settings: Settings) => Settings): Promise<Settings> {
    let next: Settings;
    if (this.db) {
      const tx = this.db.transaction('data', 'readwrite');
      const value = await tx.store.get(`${this.instanceKey}:settings`);
      next = settingsSchema.parse(
        mutator(value ? migrateSettings(value).settings : clone(this.defaults)),
      );
      await tx.store.put(clone(next), `${this.instanceKey}:settings`);
      await tx.done;
    } else {
      next = settingsSchema.parse(mutator(clone(this.memory)));
      this.memory = clone(next);
    }
    this.channel?.postMessage('settings');
    return next;
  }
  updateUi(patch: Partial<UiSettings>) {
    return this.update((current) => ({
      ...current,
      ui: {
        ...current.ui,
        ...clone(patch),
        ...(patch.navigationExpanded
          ? {
              navigationExpanded: Object.fromEntries(
                Object.entries({
                  ...current.ui.navigationExpanded,
                  ...patch.navigationExpanded,
                }).slice(-5000),
              ),
            }
          : {}),
      },
    }));
  }
  async import(report: MigrationReport, sections?: SettingsSection[]): Promise<Settings> {
    const apply = (current: Settings) => {
      if (!sections) return settingsSchema.parse(report.settings);
      const next = clone(current);
      if (sections.includes('ui')) next.ui = clone(report.settings.ui);
      if (sections.includes('folders'))
        next.folderDictionary = clone(report.settings.folderDictionary);
      if (sections.includes('labels')) {
        next.labels = clone(report.settings.labels);
        next.torrentLabels = clone(report.settings.torrentLabels);
      }
      return settingsSchema.parse(next);
    };
    const at = Date.now(),
      id = `${this.instanceKey}:backup:${at}:${uniqueId()}`;
    if (this.db) {
      const tx = this.db.transaction('data', 'readwrite');
      const current = await tx.store.get(`${this.instanceKey}:settings`);
      const next = apply(current ? migrateSettings(current).settings : clone(this.defaults));
      await tx.store.put(
        {
          id,
          raw: clone(report.raw),
          previous: current,
          at,
        },
        id,
      );
      await tx.store.put(clone(next), `${this.instanceKey}:settings`);
      await tx.store.put(true, `${this.instanceKey}:migrated`);
      await tx.done;
      this.channel?.postMessage('settings');
      return next;
    }
    this.memoryBackups.push({ id, at, raw: clone(report.raw), previous: clone(this.memory) });
    return this.update(apply);
  }
  async backups(): Promise<{ id: string; at: number; raw: unknown; previous?: Settings }[]> {
    if (!this.db) return clone(this.memoryBackups).sort((a, b) => b.at - a.at);
    const prefix = `${this.instanceKey}:backup:`,
      result = [];
    let cursor = await this.db
      .transaction('data')
      .store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    while (cursor) {
      result.push({ ...cursor.value, id: String(cursor.key) });
      cursor = await cursor.continue();
    }
    return result.sort((a, b) => b.at - a.at);
  }
  async migrated(): Promise<boolean> {
    return Boolean(await this.db?.get('data', `${this.instanceKey}:migrated`));
  }
  async saveJob(job: MatchJob) {
    if (this.db) await this.db.put('data', clone(job), `${this.instanceKey}:job`);
  }
  async loadJob(): Promise<MatchJob | undefined> {
    return this.db?.get('data', `${this.instanceKey}:job`);
  }
  close() {
    this.db?.close();
    this.channel?.close();
  }
}
