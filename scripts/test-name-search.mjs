import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { build } from 'vite';

// Compile the production model into an isolated development audit directory, never dist.
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: '.lab/name-search-benchmark',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    lib: { entry: 'src/domain/torrents.ts', formats: ['es'], fileName: () => 'model.mjs' },
  },
});
const { selectTorrents, defaultSettings } = await import('../.lab/name-search-benchmark/model.mjs');
const settings = defaultSettings();
const rows = Array.from({ length: 5000 }, (_, id) => ({
  id,
  name: `三体.S0${(id % 2) + 1}.${id % 2 ? '2160p.BluRay' : '1080p.WEB-DL'}.${String(id).padStart(5, '0')}`,
  hashString: id.toString(16).padStart(40, '0'),
  downloadDir: '/data/comparison',
  status: 0,
}));
const queries = [
  ['', 5000],
  ['三体', 5000],
  ['1080 三体', 2500],
  ['１０８０ Ｓ０１ 三体', 2500],
  ['comparison', 0],
  ['04999 三体', 1],
];
const samples = [];
for (let iteration = 0; iteration < 25; iteration++)
  for (const [search, count] of queries) {
    const begin = performance.now();
    const result = selectTorrents(
      rows,
      { status: 'all', search, sortKey: 'name', descending: false },
      settings,
    );
    const ms = performance.now() - begin;
    assert.equal(result.length, count, search);
    if (search === '04999 三体') assert.equal(result[0].id, 4999);
    if (iteration >= 5) samples.push({ search, ms });
  }
const sorted = samples.map(({ ms }) => ms).sort((a, b) => a - b);
const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
const report = {
  at: new Date().toISOString(),
  taskCount: rows.length,
  samples,
  p95Ms,
  budgetMs: 200,
  passed: p95Ms <= 200,
  scope:
    '120 short production-domain filter+name-sort samples after 5 warm-up rounds, Node on this development host; excludes DOM, RPC and debounce; not a browser/30-minute or task 13.12 certificate',
};
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/name-search-model-performance.json',
  JSON.stringify(report, null, 2) + '\n',
);
assert.ok(report.passed, `5000-name model P95 ${p95Ms}ms exceeds ${report.budgetMs}ms`);
console.log(JSON.stringify({ samples: samples.length, p95Ms, passed: report.passed }));
