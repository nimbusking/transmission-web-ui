"""Local comparison only: two read-only UI roots, one isolated Transmission RPC."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from pathlib import Path
import json, os

ROOT = Path(os.environ['UI_ROOT'])
VARIANT = os.environ['UI_VARIANT']
UPSTREAM = os.environ.get('TR_UPSTREAM', 'http://transmission:9091')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def content(self, data, content_type='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(data)

    def forward(self):
        path = urlsplit(self.path)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0: raise ValueError()
        except ValueError:
            self.send_error(400); return
        body = self.rfile.read(size) if self.command == 'POST' else None
        headers = {key: value for key, value in self.headers.items()
                   if key.lower() not in ('host', 'connection', 'content-length')}
        try:
            response = urlopen(Request(UPSTREAM + path.path + ('?' + path.query if path.query else ''),
                                       data=body, headers=headers, method=self.command), timeout=25)
        except HTTPError as error: response = error
        except (URLError, TimeoutError): self.send_error(502, 'Comparison daemon unavailable'); return
        with response:
            data = response.read()
            self.send_response(response.status)
            for key, value in response.headers.items():
                if key.lower() not in ('content-length', 'transfer-encoding', 'connection', 'date', 'server'):
                    self.send_header(key, value)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if self.command != 'HEAD': self.wfile.write(data)

    def route(self):
        path = urlsplit(self.path)
        if path.path in ('/transmission/rpc', '/transmission/upload'):
            self.forward(); return
        if self.command == 'POST': self.send_error(405); return
        if path.path in ('/', '/transmission/web'):
            self.send_response(302)
            self.send_header('Location', '/transmission/web/' + ('?' + path.query if path.query else ''))
            self.send_header('Content-Length', '0'); self.end_headers(); return
        if path.path == '/health':
            self.content(b'ok', 'text/plain', 200 if (ROOT/'index.html').is_file() else 503); return
        if path.path == '/comparison/update.json':
            self.content(b'{"comparison":true,"externalUpdateCheck":"disabled"}'); return
        if path.path == '/comparison/announce':
            self.content(b'd8:intervali60e5:peers0:e', 'text/plain'); return
        if path.path == '/comparison/info.json':
            info = json.loads(Path('/comparison/deployment.json').read_text())
            info['variant'] = VARIANT
            self.content(json.dumps(info).encode()); return
        if path.path.startswith('/comparison/fixtures/'):
            name = unquote(path.path[len('/comparison/fixtures/'):])
            if not name or '/' in name or name in ('.', '..'):
                self.send_error(400); return
            file = Path('/comparison/fixtures')/name
            if not file.is_file(): self.send_error(404); return
            self.content(file.read_bytes(), 'application/x-bittorrent'); return
        prefix = '/transmission/web/'
        if not path.path.startswith(prefix): self.send_error(404); return
        if VARIANT == 'legacy' and path.path == prefix + 'tr-web-control/config.js':
            data = (ROOT/'tr-web-control/config.js').read_bytes()
            # Existing application configuration only; old/ remains byte-for-byte unchanged.
            data += b'\nsystem.config.defaultSelectNode="torrent-all";\nsystem.config.defaultLang="zh-CN";\nsystem.checkUpdateScript="/comparison/update.json";\n'
            self.content(data, 'text/javascript; charset=utf-8'); return
        self.path = '/' + path.path[len(prefix):] + ('?' + path.query if path.query else '')
        super().do_HEAD() if self.command == 'HEAD' else super().do_GET()

    do_GET = route
    do_HEAD = route
    do_POST = route
    def list_directory(self, _path): self.send_error(403); return None
    def log_message(self, *_args): pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
