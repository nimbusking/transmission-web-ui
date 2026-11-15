import json, os
from pathlib import Path
Path('/config').mkdir(exist_ok=True)
Path('/data').mkdir(exist_ok=True)
p=Path('/config/settings.json')
settings=json.loads(p.read_text()) if p.exists() else {}
if not p.exists() or not os.getenv('TR_INITIAL_SETTINGS_ONLY'):
    settings.update({'rpc-enabled':True,'rpc-bind-address':'0.0.0.0','rpc-port':9091,'rpc-whitelist-enabled':False,'rpc-host-whitelist-enabled':False,'rpc-authentication-required':bool(os.getenv('TR_USER')),'rpc-username':os.getenv('TR_USER',''),'rpc-password':os.getenv('TR_PASS',''),'download-dir':'/data','incomplete-dir-enabled':False,'start-added-torrents':False,'dht-enabled':False,'pex-enabled':False,'lpd-enabled':False,'port-forwarding-enabled':False,'peer-port':51413,'peer-port-random-on-start':False,'download-queue-enabled':False,'seed-queue-enabled':False})
p.write_text(json.dumps(settings))
os.execvp('transmission-daemon',['transmission-daemon','--foreground','--config-dir','/config'])
