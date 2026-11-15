import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { VISUAL_THEME_IDS, visualProfile } from '../../src/domain/visual-themes';
import { defaultSettings } from '../../src/domain/torrents';
import { migrateSettings, SettingsRepository } from '../../src/services/settings';

function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const id of VISUAL_THEME_IDS)
  for (const dark of [false, true])
    it(`${id}/${dark ? 'dark' : 'light'} preserves readable text and primary actions`, () => {
      const p = visualProfile(id, dark).palette;
      for (const bg of [p.surface, p.subtle, p.header, p.table, p.selected])
        expect(contrast(p.text, bg), `${p.text}/${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const bg of [p.surface, p.subtle])
        expect(contrast(p.muted, bg), `${p.muted}/${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const bg of [p.accent, p.hover, p.pressed])
        expect(contrast(p.primaryText, bg), `${p.primaryText}/${bg}`).toBeGreaterThanOrEqual(4.5);
    });

it('old or unknown visual skins retain the chosen layout, mode and customized columns', () => {
  const saved = defaultSettings();
  delete saved.ui.visualTheme;
  saved.ui.layoutTheme = 'studio';
  saved.ui.theme = 'dark';
  saved.ui.columns[0].width = 381;
  const expected = { ...saved.ui, visualTheme: 'modern' };
  expect(migrateSettings(saved).settings.ui).toEqual(expected);
  expect(
    migrateSettings({ ...saved, ui: { ...saved.ui, visualTheme: 'future' } }).settings.ui,
  ).toEqual(expected);
});
it('layout, visual skin and mode merge transactionally and survive import', async () => {
  const key = `skin-${crypto.randomUUID()}`;
  const repositories = [
    new SettingsRepository(key),
    new SettingsRepository(key),
    new SettingsRepository(key),
  ];
  try {
    await Promise.all(repositories.map((r) => r.init()));
    await Promise.all([
      repositories[0].updateUi({ visualTheme: 'cupertino' }),
      repositories[1].updateUi({ layoutTheme: 'focus' }),
      repositories[2].updateUi({ theme: 'dark' }),
    ]);
    const exported = await repositories[0].load();
    expect(exported.ui).toMatchObject({
      visualTheme: 'cupertino',
      layoutTheme: 'focus',
      theme: 'dark',
    });
    await repositories[0].updateUi({ visualTheme: 'metro' });
    await repositories[1].import(migrateSettings(JSON.parse(JSON.stringify(exported))));
    expect((await repositories[2].load()).ui).toEqual(exported.ui);
  } finally {
    repositories.forEach((r) => r.close());
  }
});
