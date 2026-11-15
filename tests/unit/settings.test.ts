import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/torrents';
import { migrateSettings, readLegacy, SettingsRepository } from '../../src/services/settings';
it('C01/C07: migrates dictionary-only imports without erasing labels', () => {
  const current = defaultSettings();
  current.labels = [{ id: 'stable', name: 'keep', color: '#123456' }];
  const report = migrateSettings(
    { configVersion: 1, 'dictionary-folders': ['/a', '/a', ' /b '] },
    current,
  );
  expect(report.settings.labels).toEqual(current.labels);
  expect(report.settings.folderDictionary).toEqual(['/a', '/b']);
});
it('preserves original malformed storage and reports dangling label positions', () => {
  const hash = 'a'.repeat(40);
  const report = migrateSettings({
    system: {
      labels: [{ name: 'x', description: 'note', color: '#112233' }],
      labelMaps: { [hash]: [0, 5] },
    },
  });
  expect(report.settings.torrentLabels[hash]).toEqual([report.settings.labels[0].id]);
  expect(report.warnings.length).toBeGreaterThan(1);
  const legacy = readLegacy({ getItem: (key) => (key.endsWith('.system') ? '{bad' : null) });
  expect(legacy.errors).not.toEqual([]);
  expect(legacy.raw.originalStorage['transmission-web-control.system']).toBe('{bad');
});
it('C06: transaction merges concurrent tabs and isolates daemon endpoints', async () => {
  const key = `test-${crypto.randomUUID()}`,
    a = new SettingsRepository(key),
    b = new SettingsRepository(key),
    other = new SettingsRepository(`${key}-other`);
  try {
    await Promise.all([a.init(), b.init(), other.init()]);
    await Promise.all([
      a.updateUi({ theme: 'dark' }),
      b.update((v) => ({ ...v, folderDictionary: ['/keep'] })),
    ]);
    expect((await a.load()).ui.theme).toBe('dark');
    expect((await b.load()).folderDictionary).toEqual(['/keep']);
    expect((await other.load()).folderDictionary).toEqual([]);
    await a.import(migrateSettings({ 'dictionary-folders': ['/import'] }, await a.load()));
    expect(await b.migrated()).toBe(true);
    expect((await b.load()).ui.theme).toBe('dark');
  } finally {
    a.close();
    b.close();
    other.close();
  }
});
it('rejects unsupported versions without touching persisted data', async () => {
  expect(() => migrateSettings({ schemaVersion: 999 })).toThrow('Unsupported');
  const repo = new SettingsRepository(`invalid-${crypto.randomUUID()}`);
  try {
    await repo.init();
    await repo.updateUi({ theme: 'dark' });
    expect(() => migrateSettings({ schemaVersion: 999 })).toThrow();
    expect((await repo.load()).ui.theme).toBe('dark');
  } finally {
    repo.close();
  }
});
it('migrates legacy completion and peer-count columns without changing their meaning', () => {
  const report = migrateSettings({
    user: {
      torrentList: {
        fields: [
          { field: 'completeSize', width: '99' },
          { field: 'seederCount', width: '120' },
          { field: 'leecherCount', hidden: 'true' },
        ],
      },
    },
  });
  expect(report.settings.ui.columns.slice(0, 3).map((x) => x.key)).toEqual([
    'completeSize',
    'seederCount',
    'leecherCount',
  ]);
  expect(report.settings.ui.columns[0].width).toBe(99);
  expect(report.settings.ui.columns[2].visible).toBe(false);
});
it('import backup retains raw input and previous state, scoped to the endpoint', async () => {
  const repo = new SettingsRepository(`backup-${crypto.randomUUID()}`),
    other = new SettingsRepository(`other-${crypto.randomUUID()}`);
  try {
    await repo.init();
    await other.init();
    await repo.updateUi({ theme: 'dark' });
    const input = { 'dictionary-folders': ['/backup'], originalStorage: { malformed: '{bad' } };
    await repo.import(migrateSettings(input, await repo.load()));
    const backups = await repo.backups();
    expect(backups).toHaveLength(1);
    expect(backups[0].raw).toEqual(input);
    expect(backups[0].previous?.ui.theme).toBe('dark');
    expect(await other.backups()).toEqual([]);
  } finally {
    repo.close();
    other.close();
  }
});
it('navigation preferences merge nodes transactionally and old v2 files remain valid', async () => {
  const key = `nav-${crypto.randomUUID()}`,
    a = new SettingsRepository(key),
    b = new SettingsRepository(key);
  try {
    await Promise.all([a.init(), b.init()]);
    expect(migrateSettings(defaultSettings()).settings.ui.navigationExpanded).toBeUndefined();
    await Promise.all([
      a.updateUi({ navigationExpanded: { 'folder:/a': true } }),
      b.updateUi({ navigationExpanded: { 'stats:current-stats': false } }),
    ]);
    expect((await a.load()).ui.navigationExpanded).toEqual({
      'folder:/a': true,
      'stats:current-stats': false,
    });
  } finally {
    a.close();
    b.close();
  }
});
it('complete preset and undo run in one transaction while preserving other preferences', async () => {
  const repo = new SettingsRepository(`preset-${crypto.randomUUID()}`);
  try {
    await repo.init();
    await repo.updateUi({
      theme: 'dark',
      navigationExpanded: { 'status:all': false },
      columns: [{ key: 'name', width: 351, visible: true }],
    });
    const before = (await repo.load()).ui.columns;
    const full = await repo.columnPreset();
    expect(full.ui.columns.filter((x) => x.visible)).toHaveLength(20);
    await repo.updateUi({ pageSize: 100 });
    const restored = await repo.columnPreset(true);
    expect(restored.ui.columns).toEqual(before);
    expect(restored.ui.theme).toBe('dark');
    expect(restored.ui.pageSize).toBe(100);
    expect(restored.ui.navigationExpanded).toEqual({ 'status:all': false });
  } finally {
    repo.close();
  }
});

it('adds a compatible layout default without resetting color mode or custom settings', () => {
  const saved = defaultSettings();
  delete saved.ui.layoutTheme;
  saved.ui.theme = 'dark';
  saved.ui.columns[0].width = 381;
  saved.ui.navigationExpanded = { 'folder:/keep': true };
  const migrated = migrateSettings(saved).settings;
  expect(migrated.ui).toEqual({ ...saved.ui, layoutTheme: 'workbench' });
  const future = { ...saved, ui: { ...saved.ui, layoutTheme: 'future-layout' } };
  expect(migrateSettings(future).settings.ui).toEqual(migrated.ui);
});

it('layout and color mode persist independently under concurrent updates and import', async () => {
  const key = `themes-${crypto.randomUUID()}`,
    a = new SettingsRepository(key),
    b = new SettingsRepository(key);
  try {
    await Promise.all([a.init(), b.init()]);
    await Promise.all([a.updateUi({ layoutTheme: 'studio' }), b.updateUi({ theme: 'dark' })]);
    const exported = await a.load();
    expect(exported.ui.layoutTheme).toBe('studio');
    expect(exported.ui.theme).toBe('dark');
    await b.updateUi({ layoutTheme: 'focus' });
    expect((await a.load()).ui.theme).toBe('dark');
    await b.import(migrateSettings(JSON.parse(JSON.stringify(exported))));
    expect((await a.load()).ui.layoutTheme).toBe('studio');
    expect((await a.load()).ui.theme).toBe('dark');
  } finally {
    a.close();
    b.close();
  }
});
it('file page size defaults for existing v2 and persists independently from torrent pagination', async () => {
  const existing = defaultSettings();
  delete existing.ui.filePageSize;
  expect(migrateSettings(existing).settings.ui.filePageSize).toBe(200);
  existing.ui.filePageSize = -1;
  expect(migrateSettings(existing).settings.ui.filePageSize).toBe(200);
  const key = `file-pages-${crypto.randomUUID()}`,
    a = new SettingsRepository(key),
    b = new SettingsRepository(key);
  try {
    await Promise.all([a.init(), b.init()]);
    await Promise.all([a.updateUi({ filePageSize: 50 }), b.updateUi({ pageSize: 100 })]);
    expect((await b.load()).ui).toMatchObject({ filePageSize: 50, pageSize: 100 });
  } finally {
    a.close();
    b.close();
  }
});
