import { expect, it } from 'vitest';
import { en, zh } from '../../src/i18n/messages';
import enSession from '../../src/i18n/session/en.json';
import zhSession from '../../src/i18n/session/zh-CN.json';
import { SESSION_FIELDS } from '../../src/services/session-fields';
it('Chinese and English cover every writable daemon field and share UI keys', () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  for (const field of SESSION_FIELDS) {
    expect((enSession as Record<string, string>)[field.key], field.key).toBeTruthy();
    expect((zhSession as Record<string, string>)[field.key], field.key).toBeTruthy();
  }
});
