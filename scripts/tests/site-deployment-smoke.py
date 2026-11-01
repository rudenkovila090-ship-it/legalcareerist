"""Exercise install/rollback on disposable files with simulated PM2/npm and a local HTTP server."""
import http.server
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tarfile
import tempfile
import threading

REPO = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = json.loads((REPO / 'updates/site-reliability/manifest.json').read_text())

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        running = json.loads((self.server.fixture / 'process.json').read_text())['online']
        updated = (self.server.fixture / 'live/server/lib/leadInbox.js').exists()
        fail = (self.server.fixture / 'fail-new-version').exists() and updated
        status = 200 if running and not fail else 503
        body = b'{"ok":true}'
        kind = 'application/json'
        if self.path == '/api/account/lead-inbox':
            status = 401 if running and updated and not fail else 404
            body = b'{"ok":false}'
        if self.path == '/':
            body, kind = b'<html>synthetic public website</html>', 'text/html'
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_): pass

def run():
    fixture = pathlib.Path(tempfile.mkdtemp(prefix='site-deploy-smoke-'))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.fixture = fixture
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    try:
        live, release, backups, bin_dir = [fixture / n for n in ('live', 'release', 'backups', 'bin')]
        for directory in (live, release, bin_dir): directory.mkdir()
        (fixture / 'process.json').write_text('{"online":true}')
        for item in MANIFEST['files']:
            relative = item['path']
            out = release / relative
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO / relative, out)
            if item['before']:
                old = subprocess.check_output(['git', 'show', MANIFEST['baseline'] + ':' + relative], cwd=REPO)
                target = live / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(old)
        for relative in ['scripts/install-site-reliability.mjs', 'updates/site-reliability/manifest.json']:
            target = release / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO / relative, target)
        shutil.copytree(REPO / 'server/lib', release / 'server/lib', dirs_exist_ok=True)
        (release / 'server').mkdir(exist_ok=True)
        for root, label in [(live, 'old'), (release, 'new')]:
            for relative in ['node_modules', 'server/node_modules', 'dist/assets']:
                (root / relative).mkdir(parents=True, exist_ok=True)
                (root / relative / (label + '.txt')).write_text(label)
            (root / 'dist/index.html').write_text(label + ' website')
        (live / 'server/data').mkdir(parents=True)
        data_file = live / 'server/data/synthetic-payments.json'
        data_file.write_text('{"paid":1}')
        env_file = live / 'server/.env'
        env_file.write_text(f'PORT={port}\nAUTO_EXCLUDE=0\nTEST_SECRET=SYNTHETIC_ONLY\n')
        pm2 = bin_dir / 'pm2'
        pm2.write_text('''#!/usr/bin/env python3
import os,json,pathlib,sys
root=pathlib.Path(os.environ['DEPLOY_SMOKE_FIXTURE'])
file=root/'process.json';state=json.loads(file.read_text())
action=sys.argv[1]
if action=='jlist':
 print(json.dumps([{'name':'legalcareerist-api','pm2_env':{'pm_exec_path':str(root/'live/server/index.js'),'exec_mode':'fork_mode','status':'online' if state['online'] else 'stopped','PORT':os.environ['DEPLOY_SMOKE_PORT'],'AUTO_EXCLUDE':os.environ.get('DEPLOY_SMOKE_EXCLUDE','0')}}]))
else:
 state['online']=action=='restart';file.write_text(json.dumps(state))
 with (root/'pm2-actions.log').open('a') as f:f.write(action+'\\n')
''')
        npm = bin_dir / 'npm'
        npm.write_text('#!/bin/sh\n# Prepared fixture trees substitute for dependency downloads and builds.\nexit 0\n')
        for script in [pm2, npm]: script.chmod(0o755)
        env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'],
               'DEPLOY_SMOKE_FIXTURE': str(fixture), 'DEPLOY_SMOKE_PORT': str(port),
               'SITE_RELIABILITY_TARGET': str(live), 'SITE_RELIABILITY_BACKUPS': str(backups),
               'SITE_RELIABILITY_PUBLIC_URL': f'http://127.0.0.1:{port}/'}
        installer = release / 'scripts/install-site-reliability.mjs'
        def invoke(*args):
            return subprocess.run(['node', str(installer), *args], env=env, text=True, capture_output=True, timeout=60)
        def require_ok(result):
            assert result.returncode == 0, result.stdout + result.stderr
        require_ok(invoke('--verify-files', str(live)))
        before = (live / 'server/index.js').read_bytes()
        (live / 'server/index.js').write_bytes(before + b'\n// unrelated local change\n')
        assert invoke('--verify-files', str(live)).returncode != 0
        (live / 'server/index.js').write_bytes(before)
        print('PASS preflight detects unexpected local edits', flush=True)
        env['DEPLOY_SMOKE_EXCLUDE'] = '1'
        assert invoke().returncode != 0
        assert not (fixture / 'pm2-actions.log').exists()
        del env['DEPLOY_SMOKE_EXCLUDE']
        print('PASS enabled exclusions stop this installer before any changes', flush=True)
        require_ok(invoke())
        assert data_file.read_text() == '{"paid":1}'
        assert env_file.read_text().endswith('TEST_SECRET=SYNTHETIC_ONLY\n')
        assert (live / 'dist/index.html').read_text() == 'new website'
        assert (live / 'dist/assets/old.txt').exists()
        assert stat.S_IMODE((live / 'dist/index.html').stat().st_mode) == 0o644
        assert stat.S_IMODE((live / 'dist').stat().st_mode) == 0o755
        print('PASS installation preserves data/settings, old browser assets and web-readable permissions', flush=True)
        archive = next(backups.glob('*.tar.gz'))
        assert stat.S_IMODE(archive.stat().st_mode) == 0o600
        with tarfile.open(archive) as tar:
            assert './server/.env' in tar.getnames()
            assert './server/data/synthetic-payments.json' in tar.getnames()
            assert not any('.reliability-' in n for n in tar.getnames())
        print('PASS full private backup includes settings/data and excludes staging directories', flush=True)
        backup = next(backups.glob('deployment-*'))
        data_file.write_text('{"paid":2,"newPaymentAfterDeployment":true}')
        rolled = subprocess.run(['node', str(backup / 'installer.mjs'), '--rollback', str(backup)], env=env, text=True, capture_output=True, timeout=60)
        require_ok(rolled)
        assert data_file.read_text() == '{"paid":2,"newPaymentAfterDeployment":true}'
        assert (live / 'dist/index.html').read_text() == 'old website'
        assert (live / 'server/index.js').read_bytes() == before
        assert not (live / 'server/lib/leadInbox.js').exists()
        print('PASS rollback restores old code while retaining newly received payments', flush=True)
        (fixture / 'fail-new-version').touch()
        failed = invoke()
        assert failed.returncode != 0
        assert (live / 'server/index.js').read_bytes() == before
        assert (live / 'dist/index.html').read_text() == 'old website'
        assert json.loads((fixture / 'process.json').read_text())['online']
        assert json.loads(data_file.read_text())['paid'] == 2
        print('PASS failed health check automatically restores the prior running version', flush=True)
    finally:
        server.shutdown(); server.server_close()
        shutil.rmtree(fixture)

if __name__ == '__main__': run()
