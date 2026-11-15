// One-off offline daemons only: no ports, bind mounts, shared data or existing services.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const legacyConfig = await readFile('lab/openssl-3-legacy.cnf', 'utf8');
const source = String.raw`
import os,json,base64,hashlib,time,subprocess,urllib.request,urllib.error
from pathlib import Path
Path('/config').mkdir(exist_ok=True);Path('/data').mkdir(exist_ok=True)
Path('/tmp/openssl.cnf').write_text(LEGACY_CONFIG)
os.environ['OPENSSL_CONF']='/tmp/openssl.cnf'
settings={'rpc-enabled':True,'rpc-bind-address':'127.0.0.1','rpc-port':9091,'rpc-whitelist-enabled':False,'rpc-host-whitelist-enabled':False,'rpc-authentication-required':False,'download-dir':'/data','incomplete-dir-enabled':False,'rename-partial-files':False,'start-added-torrents':False,'dht-enabled':False,'pex-enabled':False,'lpd-enabled':False,'port-forwarding-enabled':False}
Path('/config/settings.json').write_text(json.dumps(settings))
log=open('/tmp/daemon.log','w')
daemon=subprocess.Popen(['transmission-daemon','--foreground','--config-dir','/config'],stdout=log,stderr=log)
session='';writes=[]
def rpc(method,args={}):
 global session
 if method=='torrent-verify':writes.append(args)
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
def wait(predicate):
 deadline=time.monotonic()+20
 while time.monotonic()<deadline:
  value=predicate()
  if value:return value
  time.sleep(.1)
 raise AssertionError('Verification did not settle')
def ben(v):
 if isinstance(v,bytes):return str(len(v)).encode()+b':'+v
 if isinstance(v,str):return ben(v.encode())
 if isinstance(v,int):return b'i'+str(v).encode()+b'e'
 return b'd'+b''.join(ben(k)+ben(v[k]) for k in sorted(v))+b'e'
try:
 def ready():
  try:return rpc('session-get')
  except (OSError,urllib.error.URLError):return None
 version=wait(ready)['version']
 payload=b'A'*16384+b'B'*16384
 info={'length':len(payload),'name':'isolated-verification.bin','piece length':16384,'pieces':hashlib.sha1(payload[:16384]).digest()+hashlib.sha1(payload[16384:]).digest(),'private':1}
 hash=hashlib.sha1(ben(info)).hexdigest()
 added=rpc('torrent-add',{'metainfo':base64.b64encode(ben({'announce':'http://127.0.0.1:19999/announce','info':info})).decode(),'paused':True,'download-dir':'/data'})['torrent-added']
 assert added['hashString'].lower()==hash
 def read():return rpc('torrent-get',{'ids':[hash],'fields':['id','hashString','status','percentDone','recheckProgress','haveValid','pieceCount','pieceSize','pieces']})['torrents'][0]
 wait(lambda:read()['status']==0)
 results=[]
 for label,data,valid,bits in [('corrupt-half',payload[:16384]+b'X'*16384,16384,b'\x80'),('complete',payload,32768,b'\xc0')]:
  with open('/data/isolated-verification.bin','wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  ack=rpc('torrent-verify',{'ids':[hash]})
  def settled():
   row=read()
   return row if row['status']==0 and row['haveValid']==valid else None
  row=wait(settled)
  assert row['percentDone']==valid/32768,row
  assert row['pieceCount']==2 and row['pieceSize']==16384,row
  assert base64.b64decode(row['pieces'])==bits,row
  assert Path('/data/isolated-verification.bin').read_bytes()==data
  results.append({'case':label,'haveValid':row['haveValid'],'percentDone':row['percentDone'],'status':row['status'],'pieces':row['pieces'],'requestAccepted':True,'actualCompletionChecked':True,'fileUnchanged':True})
 assert writes==[{'ids':[hash]},{'ids':[hash]}],writes
 print(json.dumps({'version':version,'cases':results,'hashOnlyRequests':True,'network':'none','hostPorts':[],'sharedMounts':[]}))
finally:
 daemon.terminate()
 try:daemon.wait(timeout=5)
 except subprocess.TimeoutExpired:daemon.kill();daemon.wait()
 log.close()
`;
const results = [];
for (const version of ['3.00', '4.0.0', '4.0.6', '4.1.4']) {
  const name = `twui-verify-${randomUUID()}`;
  try {
    const output = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--pull=never',
        '--network',
        'none',
        '--name',
        name,
        '--label',
        'org.twui.validation=verification-confirmation',
        '--entrypoint',
        'python3',
        `twui-lab/transmission:${version}`,
        '-',
      ],
      {
        input: `LEGACY_CONFIG=${JSON.stringify(legacyConfig)}\n${source}`,
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    const result = JSON.parse(output.trim());
    assert.ok(result.version.startsWith(version));
    results.push(result);
    console.log(`${version}: corrupt half + complete data verified`);
  } finally {
    // Only the unique disposable container created above; never a Compose service.
    try {
      execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    } catch {
      /* --rm already removed it */
    }
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/verification-daemon-results.json',
  JSON.stringify(
    { at: new Date().toISOString(), results, comparisonContainersTouched: false },
    null,
    2,
  ) + '\n',
);
