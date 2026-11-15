"""Test-only same-origin reverse proxy for root and nested Web UI deployments."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit
import os
UPSTREAM = os.environ.get('TR_UPSTREAM', 'http://tr4:9091')
class Proxy(BaseHTTPRequestHandler):
    def forward(self):
        path = urlsplit(self.path)
        if path.path.startswith('/nas/transmission/'):
            target = '/transmission/' + path.path[len('/nas/transmission/'):]
        elif path.path.startswith('/ui/'):
            target = '/transmission/web/' + path.path[len('/ui/'):]
        elif path.path == '/rpc': target = '/transmission/rpc'
        else: self.send_error(404); return
        if path.query: target += '?' + path.query
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))) if self.command == 'POST' else None
        headers = {key: value for key, value in self.headers.items() if key.lower() not in ('host','connection','content-length')}
        try: response = urlopen(Request(UPSTREAM + target, data=body, headers=headers, method=self.command), timeout=25)
        except HTTPError as error: response = error
        with response:
            content = response.read()
            self.send_response(response.status)
            for key, value in response.headers.items():
                if key.lower() not in ('content-length','transfer-encoding','connection','date','server'): self.send_header(key, value)
            self.send_header('Content-Length', str(len(content))); self.end_headers()
            if self.command != 'HEAD': self.wfile.write(content)
    do_GET = forward
    do_POST = forward
    do_HEAD = forward
    def log_message(self, *_args): pass
ThreadingHTTPServer(('0.0.0.0',8080), Proxy).serve_forever()
