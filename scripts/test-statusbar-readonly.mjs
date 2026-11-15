// Offline disposable daemons only; no compare containers, shared volumes or published ports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const legacyConfig = await readFile('lab/openssl-3-legacy.cnf', 'utf8');
const source = String.raw`
import os,json,time,subprocess,urllib.request,urllib.error
from pathlib import Path
Path('/config').mkdir(exist_ok=True);Path('/data').mkdir(exist_ok=True)
Path('/tmp/openssl.cnf').write_text(LEGACY_CONFIG)
os.environ['OPENSSL_CONF']='/tmp/openssl.cnf'
settings={'rpc-enabled':True,'rpc-bind-address':'127.0.0.1','rpc-port':9091,'rpc-whitelist-enabled':False,'rpc-host-whitelist-enabled':False,'rpc-authentication-required':False,'download-dir':'/data','dht-enabled':False,'pex-enabled':False,'lpd-enabled':False,'port-forwarding-enabled':False}
Path('/config/settings.json').write_text(json.dumps(settings))
log=open('/tmp/daemon.log','w')
daemon=subprocess.Popen(['transmission-daemon','--foreground','--config-dir','/config'],stdout=log,stderr=log)
session='';calls=[]
def rpc(method,args={}):
 global session
 assert method in ['session-get','session-stats','free-space']
 calls.append(method)
 for attempt in range(3):
  req=urllib.request.Request('http://127.0.0.1:9091/transmission/rpc',json.dumps({'method':method,'arguments':args}).encode(),{'X-Transmission-Session-Id':session,'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req,timeout=3) as r:result=json.load(r)
   assert result['result']=='success',result
   return result['arguments']
  except urllib.error.HTTPError as e:
   if e.code!=409:raise
   session=e.headers['X-Transmission-Session-Id']
 raise AssertionError('Handshake failed')
try:
 for i in range(100):
  try: info=rpc('session-get');break
  except (ConnectionError,urllib.error.URLError):time.sleep(.1)
 else:raise AssertionError(Path('/tmp/daemon.log').read_text())
 stats=rpc('session-stats');path=info['download-dir'];space=rpc('free-space',{'path':path})
 disk=os.statvfs(path);actual=disk.f_bavail*disk.f_frsize
 assert stats['downloadSpeed']==0 and stats['uploadSpeed']==0,stats
 assert space['size-bytes']==actual,(space,actual)
 print(json.dumps({'version':info['version'],'rpc':info['rpc-version'],'downloadSpeed':stats['downloadSpeed'],'uploadSpeed':stats['uploadSpeed'],'path':path,'freeSpaceBytes':space['size-bytes'],'statvfsAvailableBytes':actual,'equal':True,'readOnly':True,'network':'none','calls':calls}))
finally:
 daemon.terminate()
 try:daemon.wait(timeout=10)
 except subprocess.TimeoutExpired:daemon.kill();daemon.wait()
`;
const results = [];
for (const version of ['3.00', '4.0.0', '4.0.6', '4.1.4']) {
  const output = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--tmpfs',
      '/config',
      '--tmpfs',
      '/data',
      '--entrypoint',
      'python3',
      `twui-lab/transmission:${version}`,
      '-',
    ],
    {
      input: `LEGACY_CONFIG=${JSON.stringify(legacyConfig)}\n${source}`,
      encoding: 'utf8',
      timeout: 40000,
    },
  );
  const result = JSON.parse(output.trim());
  assert.ok(result.version.startsWith(version));
  results.push(result);
  console.log(`${version}: real zero speeds and free-space/statvfs match`);
}
await writeFile(
  'artifacts/statusbar-rpc.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      results,
      daemonWrites: [],
      compareContainerActions: [],
      limitation:
        'Real idle-zero speeds verified; nonzero display mapping covered by controlled browser fixtures, no transfer started on compare tasks.',
    },
    null,
    2,
  ) + '\n',
);
