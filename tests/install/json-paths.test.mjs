import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const parse = (value, kind = 'session') =>
  execFileSync('awk', ['-v', `kind=${kind}`, '-f', 'release/installer/json-paths.awk'], {
    timeout: 3000,
    input: typeof value === 'string' ? value : JSON.stringify(value),
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
assert.equal(
  parse({
    arguments: {
      'config-dir': '/config',
      'download-dir': '/data/中文 file',
      'incomplete-dir-enabled': false,
    },
    result: 'success',
  }),
  '/arguments/config-dir\t/config\n/arguments/download-dir\t/data/中文 file\n/arguments/incomplete-dir-enabled\tfalse\n',
);
assert.match(
  parse(
    '{"arguments":{"config-dir":"/\\u4e2d\\u6587/\\ud83d\\ude00","download-dir":"/data/\\"x\\""},"result":"success"}',
  ),
  /中文\/😀/,
);
assert.equal(
  parse(
    {
      arguments: { torrents: [{ downloadDir: '/data/one' }, { downloadDir: '/data/two' }] },
      result: 'success',
    },
    'torrents',
  ),
  '/arguments/torrents/0/downloadDir\t/data/one\n/arguments/torrents/1/downloadDir\t/data/two\n',
);
for (const invalid of [
  '{}',
  '{"result":"error"}',
  '{"result":"success","result":"success"}',
  '{"result":"success"} trailing',
  '{"arguments":{"config-dir":5},"result":"success"}',
  '{"arguments":{"config-dir":"/data\\nother"},"result":"success"}',
  '{"result":"success","x":01}',
  '{"result":"success","x":"\\ud800"}',
])
  assert.throws(() => parse(invalid));
console.log(
  'Strict RPC path parser: escaped Unicode, spaces, arrays, duplicate keys, malformed values and controls passed',
);
