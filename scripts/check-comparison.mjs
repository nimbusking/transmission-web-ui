import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const { RpcClient } = await import('../.lab/comparison/rpc.mjs'),
  endpoints = ['http://127.0.0.1:19080', 'http://127.0.0.1:19081'],
  clients = endpoints.map((endpoint) => new RpcClient(`${endpoint}/transmission/rpc`)),
  restart = process.argv.includes('--restart-check'),
  deployment = JSON.parse(await readFile('.lab/comparison/deployment.json', 'utf8')),
  seed = JSON.parse(await readFile('.lab/comparison/seed.json', 'utf8'));
for (const endpoint of endpoints) assert.equal((await fetch(`${endpoint}/health`)).status, 200);
const rows = await Promise.all(
  clients.map(async (client) => {
    assert.ok((await client.session()).version.startsWith('4.1.4'));
    return (await client.torrents(['id', 'hashString', 'name', 'status', 'percentDone'])).torrents;
  }),
);
assert.deepEqual(
  rows[0].map((row) => row.hashString).sort(),
  rows[1].map((row) => row.hashString).sort(),
);
let persistence = 'not requested';
if (restart) {
  const before = await clients[1].session(),
    original = before['peer-limit-global'];
  assert.ok(Number.isInteger(original));
  await clients[1].call('session-set', { 'peer-limit-global': original + 1 });
  try {
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        'twui-compare',
        '-f',
        'lab/compare.compose.yaml',
        'restart',
        'transmission',
      ],
      { stdio: 'inherit' },
    );
    let after;
    for (let i = 0; i < 100; i++) {
      try {
        after = await clients[1].session();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(after?.['peer-limit-global'], original + 1);
    assert.equal((await clients[0].session())['peer-limit-global'], original + 1);
    persistence = 'passed; original setting restored';
  } finally {
    await clients[1].call('session-set', { 'peer-limit-global': original });
  }
}
const current = (await clients[1].torrents(['id', 'hashString', 'name', 'status', 'percentDone']))
  .torrents;
const report = {
  at: new Date().toISOString(),
  deployment,
  sameBackendHashes: true,
  daemon: '4.1.4',
  configurationPersistence: persistence,
  samples: current.filter((row) => seed.tasks.some((task) => task.hash === row.hashString)),
  browserReport: 'comparison-browsers.log',
  browserCases:
    'separate Chromium/Firefox/WebKit start in modern, pause in legacy with cross-view synchronization',
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/comparison-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
