import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/torrents';
import { migrateSettings, SettingsRepository } from '../../src/services/settings';
import { exportSettings, previewSettings } from '../../src/services/settings-transfer';
import { SESSION_FIELDS } from '../../src/services/session-fields';
import {
  SESSION_GROUPS,
  minutesToTime,
  timeToMinutes,
  setWeekday,
} from '../../src/domain/settings-layout';
it('places every writable daemon field in exactly one legacy category', () => {
  const fields = Object.values(SESSION_GROUPS).flat();
  expect(new Set(fields).size).toBe(fields.length);
  expect([...fields].sort()).toEqual(SESSION_FIELDS.map((x) => x.key).sort());
});
it('roundtrips all valid schedule times and weekday masks, including midnight and Sunday', () => {
  for (let minute = 0; minute < 1440; minute++)
    expect(timeToMinutes(minutesToTime(minute))).toBe(minute);
  for (let mask = 0; mask < 128; mask++)
    for (let day = 0; day < 7; day++) {
      expect(setWeekday(mask, day, true) & (1 << day)).toBe(1 << day);
      expect(setWeekday(mask, day, false) & (1 << day)).toBe(0);
      expect(setWeekday(mask, day, !!(mask & (1 << day)))).toBe(mask);
    }
  for (const invalid of ['24:00', '1:30', '12:60', 'foo'])
    expect(() => timeToMinutes(invalid)).toThrow();
});
it('exports only selected categories and never exports RPC credentials or unsupported fields', () => {
  const source = defaultSettings();
  source.labels = [{ id: 'id', name: 'tag', color: '#123456' }];
  source.torrentLabels = { ['a'.repeat(40)]: ['id'] };
  const session = {
    version: '3.00',
    'rpc-version': 16,
    'download-dir': '/old',
    'default-trackers': 'not-supported',
    'rpc-password': 'secret',
  };
  const labels = exportSettings(source, session, ['labels']);
  expect(Object.keys(labels.sections)).toEqual(['labels']);
  expect(previewSettings(labels, defaultSettings()).settings.labels).toEqual(source.labels);
  const exported = exportSettings(source, session, ['server']);
  expect(exported.sections).toEqual({ server: { 'download-dir': '/old' } });
  expect(() => exportSettings(source, null, [])).toThrow();
});
it('imports legacy labels/maps and current v2 without losing stable identities', () => {
  const hash = 'a'.repeat(40);
  const old = previewSettings(
    {
      labels: [
        { name: 'First', color: '#123456' },
        { name: 'Second', color: '#abcdef' },
      ],
      maps: { [hash]: [1, 0, 9] },
    },
    defaultSettings(),
  );
  expect(old.sections).toEqual(['labels']);
  expect(old.settings.torrentLabels[hash]).toEqual([
    old.settings.labels[1].id,
    old.settings.labels[0].id,
  ]);
  expect(old.warnings.length).toBeGreaterThan(0);
  const next = previewSettings(exportSettings(old.settings, null, ['labels']), defaultSettings());
  expect(next.settings.labels).toEqual(old.settings.labels);
  expect(next.settings.torrentLabels).toEqual(old.settings.torrentLabels);
  expect(previewSettings(old.settings, defaultSettings()).sections).toEqual([
    'ui',
    'folders',
    'labels',
  ]);
});
it('rejects unsupported and corrupt sections, duplicate IDs, invalid mappings and colors', () => {
  const source = defaultSettings();
  for (const sections of [
    { unknown: [] },
    { folders: [1] },
    { labels: null },
    { server: [] },
    { labels: { definitions: [{ id: 'a', name: 'x', color: 'red' }], assignments: {} } },
  ]) {
    expect(() =>
      previewSettings({ format: 'transmission-web-ui', formatVersion: 1, sections }, source),
    ).toThrow();
  }
  expect(() =>
    previewSettings(
      { format: 'transmission-web-ui', formatVersion: 999, sections: { folders: [] } },
      source,
    ),
  ).toThrow();
  const label = { id: 'same', name: 'x', color: '#123456' };
  expect(() => previewSettings({ ...source, labels: [label, label] }, source)).toThrow('Duplicate');
  expect(() => previewSettings({ labels: [], maps: [] }, source)).toThrow();
});
it('imports selected categories against transaction-time state and preserves other tabs plus source backups', async () => {
  const key = `sections-${crypto.randomUUID()}`,
    a = new SettingsRepository(key),
    b = new SettingsRepository(key);
  try {
    await a.init();
    await b.init();
    const report = previewSettings(
      {
        configVersion: 1,
        system: {
          autoReload: false,
          labels: [{ name: 'replace', color: '#112233' }],
          labelMaps: {},
        },
        'dictionary-folders': [],
        server: { 'download-dir': '/import' },
      },
      await a.load(),
    );
    await b.update((current) => ({
      ...current,
      ui: { ...current.ui, theme: 'dark' },
      labels: [{ id: 'keep', name: 'Keep', color: '#abcdef' }],
      torrentLabels: { ['a'.repeat(40)]: ['keep'] },
      folderDictionary: ['/before'],
    }));
    await a.import(report, ['folders']);
    const result = await b.load();
    expect(result.folderDictionary).toEqual([]);
    expect(result.ui.theme).toBe('dark');
    expect(result.labels[0].id).toBe('keep');
    expect(result.torrentLabels['a'.repeat(40)]).toEqual(['keep']);
    const backups = await a.backups();
    expect(backups[0].raw).toEqual(report.raw);
    expect(backups[0].previous?.folderDictionary).toEqual(['/before']);
    await b.updateUi({ forceDesktop: true });
    await a.import(report, ['labels']);
    const final = await b.load();
    expect(final.labels[0].name).toBe('replace');
    expect(final.ui.forceDesktop).toBe(true);
    expect(final.folderDictionary).toEqual([]);
  } finally {
    a.close();
    b.close();
  }
});
it('continues to load settings without new storage fields and leaves deferred legacy preferences unchanged', () => {
  const source = defaultSettings();
  expect(migrateSettings(source).settings.ui).toEqual(source.ui);
  const report = previewSettings(
    { system: { nav: { servers: false }, hideSubfolders: true, simpleCheckMode: true } },
    source,
  );
  expect(report.settings.ui).toEqual(source.ui);
});
