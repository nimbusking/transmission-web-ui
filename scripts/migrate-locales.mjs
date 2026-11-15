import { readFile, mkdir, writeFile } from 'node:fs/promises';
const mappings = {
  add: 'toolbar.add',
  start: 'toolbar.start',
  stop: 'toolbar.pause',
  remove: 'toolbar.remove',
  verify: 'toolbar.recheck',
  rename: 'toolbar.rename',
  refresh: 'toolbar.refresh',
  all: 'tree.all',
  active: 'tree.actively',
  downloading: 'tree.downloading',
  seeding: 'tree.sending',
  paused: 'tree.paused',
  checking: 'tree.check',
  error: 'tree.error',
  labels: 'tree.labels',
  save: 'dialog.public.button-ok',
  cancel: 'dialog.public.button-cancel',
  name: 'torrent-head.name',
  totalSize: 'torrent-head.totalSize',
  percentDone: 'torrent-head.percentDone',
  rateDownload: 'torrent-head.rateDownload',
  rateUpload: 'torrent-head.rateUpload',
  uploadRatio: 'torrent-head.uploadRatio',
};
const list = JSON.parse(await readFile('old/src/tr-web-control/i18n.json', 'utf8'));
await mkdir('src/i18n/locales', { recursive: true });
await mkdir('src/i18n/session', { recursive: true });
for (const locale of Object.keys(list)) {
  const data = JSON.parse(
    await readFile(`old/src/tr-web-control/i18n/${locale.replace('-', '_')}.json`, 'utf8'),
  );
  const clean = (value) =>
    value
      .replace(/<[^>]*>/g, '')
      .replace(/%n/g, '{count}')
      .replace(/@/g, "{'@'}")
      .trim();
  const result = {};
  for (const [key, path] of Object.entries(mappings)) {
    const value = path.split('.').reduce((obj, part) => obj?.[part], data);
    if (typeof value === 'string') result[key] = clean(value);
  }
  if (!['en', 'zh-CN'].includes(locale))
    await writeFile(`src/i18n/locales/${locale}.json`, JSON.stringify(result, null, 2) + '\n');
  if (['en', 'zh-CN'].includes(locale)) {
    const fields = Object.fromEntries(
      Object.entries(data.dialog['system-config'])
        .filter(([, v]) => typeof v === 'string')
        .map(([key, value]) => [key, clean(value)]),
    );
    let existing = {};
    try {
      existing = JSON.parse(await readFile(`src/i18n/session/${locale}.json`, 'utf8'));
    } catch {
      /* first migration */
    }
    await writeFile(
      `src/i18n/session/${locale}.json`,
      JSON.stringify({ ...fields, ...existing }, null, 2) + '\n',
    );
  }
}
console.log('Migrated legacy translations; new text falls back to English');
