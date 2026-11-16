import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const old = await readFile('/tmp/twui-compat-original.ts', 'utf8');
const baseline = '/tmp/twui-compat-baseline.mjs',
  current = '/tmp/twui-compat-current.mjs';
await build({
  stdin: { contents: old, loader: 'ts', resolveDir: `${root}/src/domain` },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: baseline,
});
await build({
  entryPoints: ['src/domain/torrents.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: current,
});
const data = Array.from({ length: 5000 }, (_, id) => ({
  id,
  hashString: id.toString(16).padStart(40, '0'),
  name: `Sample ${id}`,
  downloadDir: `/data/${id % 50}`,
  totalSize: 32768,
  haveValid: 16384,
  haveUnchecked: 0,
  metadataPercentComplete: 1,
  leftUntilDone: 0,
  percentDone: 1,
  queuePosition: id,
  trackerStats: [
    { id: 0, tier: 0, announce: 'http://local.test/a', seederCount: 10, leecherCount: 0 },
  ],
}));
const results = {};
for (const [label, file] of [
  ['baseline', baseline],
  ['candidate', current],
]) {
  const api = await import(pathToFileURL(file).href),
    rows = new Map(),
    settings = api.defaultSettings();
  api.applyDelta(rows, data, [], true);
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    api.applyDelta(rows, data, [], false, api.DYNAMIC_FIELDS);
    api.selectTorrents(
      [...rows.values()],
      { status: 'all', search: 'sample', sortKey: 'completeSize', descending: false },
      settings,
    );
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  results[label] = {
    p50Ms: samples[15],
    p95Ms: samples[28],
    rows: rows.size,
    visibleColumns: settings.ui.columns.filter((x) => x.visible).length,
    dynamicRequestBytes: Buffer.byteLength(
      JSON.stringify({ fields: api.DYNAMIC_FIELDS, ids: 'recently-active' }),
    ),
    dynamicResponseBytes: Buffer.byteLength(
      JSON.stringify(
        data.map((row) =>
          Object.fromEntries(
            api.DYNAMIC_FIELDS.filter((key) => key in row).map((key) => [key, row[key]]),
          ),
        ),
      ),
    ),
  };
}
if (results.candidate.p95Ms > 200) throw new Error('Candidate exceeds 200ms model budget');
await writeFile(
  'docs/validation-evidence/shared-compatibility-performance.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        '30 synchronous 5000-row/20-column model update+sort samples, not UI frame time or 30-minute soak',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(results));
