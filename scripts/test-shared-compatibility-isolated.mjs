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
 if isinstance(v,list):return b'l'+b''.join(ben(x) for x in v)+b'e'
 if isinstance(v,int):return b'i'+str(v).encode()+b'e'
 return b'd'+b''.join(ben(k)+ben(v[k]) for k in sorted(v))+b'e'
try:
 def ready():
  try:return rpc('session-get')
  except (OSError,urllib.error.URLError):return None
 version=wait(ready)['version']
 payload=b'A'*16384+b'B'*16384
 info={'files':[{'length':16384,'path':['a.bin']},{'length':16384,'path':['b.bin']}],'name':'isolated-compat','piece length':16384,'pieces':hashlib.sha1(payload[:16384]).digest()+hashlib.sha1(payload[16384:]).digest(),'private':1}
 hash=hashlib.sha1(ben(info)).hexdigest()
 Path('/data/isolated-compat').mkdir()
 Path('/data/isolated-compat/a.bin').write_bytes(payload[:16384])
 added=rpc('torrent-add',{'metainfo':base64.b64encode(ben({'announce':'http://127.0.0.1:19999/announce','info':info})).decode(),'paused':True,'download-dir':'/data','files-unwanted':[1]})['torrent-added']
 assert added['hashString'].lower()==hash
 fields=['id','hashString','status','percentDone','metadataPercentComplete','totalSize','haveValid','haveUnchecked','leftUntilDone','downloadLimited','downloadLimit','uploadLimited','uploadLimit','trackers','files','fileStats','wanted','priorities']
 def read():return rpc('torrent-get',{'ids':[hash],'fields':fields})['torrents'][0]
 wait(lambda:read()['status']==0)
 rpc('torrent-verify',{'ids':[hash]})
 row=wait(lambda: read() if read()['status']==0 and read()['haveValid']==16384 else None)
 assert row['totalSize']==32768 and row['haveValid']+row['haveUnchecked']==16384 and row['percentDone']==1,row
 results=[{'case':'selective-held-bytes','actual':row}]
 rpc('torrent-set',{'ids':[hash],'downloadLimited':True,'downloadLimit':123,'uploadLimited':False,'uploadLimit':456})
 rpc('torrent-set',{'ids':[hash],'downloadLimit':321})
 row=read();assert row['downloadLimit']==321 and row['uploadLimit']==456 and row['uploadLimited']==False,row
 rpc('torrent-set',{'ids':[hash],'downloadLimited':False})
 row=read();assert row['downloadLimit']==321 and row['downloadLimited']==False,row
 rpc('torrent-set',{'ids':[hash],'uploadLimited':True,'uploadLimit':0})
 row=read();assert row['uploadLimited']==True and row['uploadLimit']==0,row
 results.append({'case':'independent-limits-disable-and-zero','passed':True})
 extremes=[]
 for value in [4194303,4194304,4294967,4294968,9007199254740,9007199254740991]:
  rpc('torrent-set',{'ids':[hash],'downloadLimited':False,'downloadLimit':value})
  extremes.append({'requested':value,'readback':read()['downloadLimit']})
 results.append({'case':'limit-boundary-readback-disabled','values':extremes})
 tracker=read()['trackers'][0]
 rpc('torrent-set',{'ids':[hash],'trackerReplace':[tracker['id'],'http://127.0.0.1:19998/changed']})
 assert read()['trackers'][0]['announce']=='http://127.0.0.1:19998/changed'
 rpc('torrent-set',{'ids':[hash],'trackerAdd':['http://127.0.0.1:19997/added']})
 trackers=read()['trackers'];assert len(trackers)==2,trackers
 added_tracker=next(x for x in trackers if x['announce'].endswith('/added'))
 rpc('torrent-set',{'ids':[hash],'trackerRemove':[added_tracker['id']]})
 assert len(read()['trackers'])==1
 results.append({'case':'tracker-pure-url-independent-add-remove','passed':True,'afterAdd':trackers})
 if not version.startswith('3.00'):
  grouped='http://127.0.0.1:19998/changed\nhttp://127.0.0.1:19997/added\n\nhttp://127.0.0.1:19996/third'
  rpc('torrent-set',{'ids':[hash],'trackerList':grouped})
  trackers=read()['trackers'];assert len(trackers)==3 and trackers[0]['tier']==trackers[1]['tier'] and trackers[1]['tier']!=trackers[2]['tier'],trackers
  rpc('torrent-set',{'ids':[hash],'trackerList':grouped.replace('\n\n','\n')})
  assert len(set(x['tier'] for x in read()['trackers']))==1
  results.append({'case':'full-group-edit-and-group-only-change','passed':True})
 rpc('torrent-set',{'ids':[hash],'files-wanted':[1],'priority-low':[1]})
 row=read();assert row['wanted'][1] in [1,True] and row['priorities'][1]==-1,row
 results.append({'case':'file-index-and-priority','passed':True})
 print(json.dumps({'version':version,'cases':results,'hashOnlyRequests':True,'network':'none','hostPorts':[],'sharedMounts':[]}))

finally:
 daemon.terminate()
 try:daemon.wait(timeout=5)
 except subprocess.TimeoutExpired:daemon.kill();daemon.wait()
 log.close()
`;
const results = [];
for (const version of ['3.00', '4.0.0', '4.0.6', '4.1.4']) {
  const name = `twui-compat-${randomUUID()}`;
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
        'org.twui.validation=shared-compatibility',
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
    console.log(`${version}: shared compatibility data/limits/Trackers/files verified`);
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
  'docs/validation-evidence/shared-compatibility-daemons.json',
  JSON.stringify(
    { at: new Date().toISOString(), results, comparisonContainersTouched: false },
    null,
    2,
  ) + '\n',
);
