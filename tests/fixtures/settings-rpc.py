import json,time,urllib.request,urllib.error,sys
session_id=''
def rpc(method,args={}):
 global session_id
 for attempt in range(3):
  req=urllib.request.Request('http://127.0.0.1:9091/transmission/rpc',data=json.dumps({'method':method,'arguments':args}).encode(),headers={'Content-Type':'application/json','X-Transmission-Session-Id':session_id})
  try:
   with urllib.request.urlopen(req,timeout=10) as response: body=json.load(response)
   assert body['result']=='success',body
   return body.get('arguments',{})
  except urllib.error.HTTPError as error:
   if error.code!=409: raise
   session_id=error.headers['X-Transmission-Session-Id']
for i in range(100):
 try: before=rpc('session-get'); break
 except (urllib.error.URLError,ConnectionError): time.sleep(.1)
else: raise RuntimeError('daemon did not start')
fields=json.loads(sys.argv[1])
patch={}
for field in fields:
 key=field['key']
 if key not in before or field.get('version',16)>before['rpc-version']: continue
 if field['type']=='boolean': value=False
 elif field['type']=='number': value=3.25 if key=='seedRatioLimit' else 1410 if key=='alt-speed-time-begin' else 60 if key=='alt-speed-time-end' else 65 if key=='alt-speed-time-day' else 19443 if key=='peer-port' else 7
 else: value='preferred' if key=='encryption' else '' if key=='default-trackers' else 'http://127.0.0.1/unused-blocklist' if key=='blocklist-url' else '/data/settings-check'
 if before[key]!=value: patch[key]=value
rpc('session-set',patch)
after=rpc('session-get')
mismatches={key:{'expected':value,'actual':after.get(key)} for key,value in patch.items() if after.get(key)!=value}
assert not mismatches,mismatches
assert rpc('torrent-get',{'fields':['id']})['torrents']==[]
print(json.dumps({'version':before['version'],'rpcVersion':before['rpc-version'],'supportedFields':[f['key'] for f in fields if f['key'] in before and f.get('version',16)<=before['rpc-version']],'changedFields':list(patch),'readbackMatched':True,'tasks':0}))
