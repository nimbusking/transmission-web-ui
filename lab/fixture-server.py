"""Local-only HTTP fixture and compact BitTorrent tracker. No external requests."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote_to_bytes, urlsplit
import socket, time
peers = {}
def encode(value):
    if isinstance(value, int): return b'i'+str(value).encode()+b'e'
    if isinstance(value, str): value = value.encode()
    if isinstance(value, bytes): return str(len(value)).encode()+b':'+value
    return b'd'+b''.join(encode(k)+encode(value[k]) for k in sorted(value))+b'e'
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/announce':
            query = dict((k, unquote_to_bytes(v)) for k,v in (part.split('=',1) for part in parsed.query.split('&') if '=' in part))
            info = query.get('info_hash', b'')
            if len(info) != 20: self.send_error(400); return
            port = int(query.get('port', b'0')); key = (self.client_address[0], port)
            swarm = peers.setdefault(info, {})
            if query.get('event') == b'stopped': swarm.pop(key, None)
            else: swarm[key] = time.time()
            compact = b''.join(socket.inet_aton(ip)+p.to_bytes(2,'big') for (ip,p), seen in list(swarm.items()) if (ip,p) != key and time.time()-seen < 120)
            data = encode({'interval': 2, 'min interval': 1, 'peers': compact})
        elif parsed.path.startswith('/files/'):
            name = parsed.path.removeprefix('/files/')
            if not name or '/' in name or name in ('.','..'): self.send_error(400); return
            file = Path('/fixtures')/name
            if not file.is_file(): self.send_error(404); return
            data = file.read_bytes()
        elif parsed.path == '/health': data = b'ok'
        else: self.send_error(404); return
        self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self, *_args): pass
ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
