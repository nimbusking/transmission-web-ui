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
