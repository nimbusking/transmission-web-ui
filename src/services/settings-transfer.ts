import type { MigrationReport, Session, Settings, SettingsSection } from '../domain/types';
import { migrateSettings } from './settings';
import { SESSION_FIELDS } from './session-fields';

export type TransferSection = SettingsSection | 'server';
export const TRANSFER_SECTIONS: TransferSection[] = ['ui', 'folders', 'labels', 'server'];
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function exportSettings(
  settings: Settings,
  session: Session | null | undefined,
  sections: TransferSection[],
) {
  const data: Record<string, unknown> = {};
  if (sections.includes('ui')) data.ui = settings.ui;
  if (sections.includes('folders')) data.folders = settings.folderDictionary;
  if (sections.includes('labels'))
    data.labels = { definitions: settings.labels, assignments: settings.torrentLabels };
  if (sections.includes('server') && session)
    data.server = Object.fromEntries(
      SESSION_FIELDS.filter(
        (field) =>
          Object.hasOwn(session, field.key) && (field.version ?? 16) <= session['rpc-version'],
      ).map((field) => [field.key, session[field.key]]),
    );
  if (!Object.keys(data).length) throw new Error('Select at least one available section');
  return { format: 'transmission-web-ui', formatVersion: 1, sections: data };
}
export function previewSettings(
  raw: unknown,
  current: Settings,
): MigrationReport & { server: Record<string, unknown> } {
  if (!object(raw)) throw new Error('Configuration must be a JSON object');
  const sections: SettingsSection[] = [];
  let report: MigrationReport,
    server: Record<string, unknown> = {};
  if (raw.format !== undefined) {
    if (raw.format !== 'transmission-web-ui' || raw.formatVersion !== 1 || !object(raw.sections))
      throw new Error('Unsupported configuration format');
    const data = raw.sections,
      next = structuredClone(current);
    if (Object.keys(data).some((key) => !TRANSFER_SECTIONS.includes(key as TransferSection)))
      throw new Error('Unknown configuration section');
    if (Object.hasOwn(data, 'ui')) {
      next.ui = data.ui;
      sections.push('ui');
    }
    if (Object.hasOwn(data, 'folders')) {
      next.folderDictionary = data.folders;
      sections.push('folders');
    }
    if (Object.hasOwn(data, 'labels')) {
      if (!object(data.labels)) throw new Error('Invalid labels section');
      next.labels = data.labels.definitions;
      next.torrentLabels = data.labels.assignments;
      sections.push('labels');
    }
    if (Object.hasOwn(data, 'server')) {
      if (!object(data.server)) throw new Error('Invalid daemon section');
      server = data.server;
    }
    if (!Object.keys(data).length) throw new Error('No recognized configuration sections');
    report = migrateSettings(next);
  } else if (Array.isArray(raw.labels) && Object.hasOwn(raw, 'maps')) {
    if (!object(raw.maps)) throw new Error('Invalid label mappings');
    report = migrateSettings({ system: { labels: raw.labels, labelMaps: raw.maps } }, current);
    sections.push('labels');
  } else {
    report = migrateSettings(raw, current);
    if (raw.schemaVersion === 2) sections.push('ui', 'folders', 'labels');
    else {
      if (raw.system || raw.user) sections.push('ui');
      if (Object.hasOwn(raw, 'dictionary-folders')) sections.push('folders');
      if (Array.isArray(raw.system?.labels)) sections.push('labels');
    }
    if (Object.hasOwn(raw, 'server')) {
      if (!object(raw.server)) throw new Error('Invalid daemon section');
      server = raw.server;
    }
  }
  return { ...report, raw, sections, server };
}
