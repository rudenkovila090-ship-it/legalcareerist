"""A saved launcher must unpack the real release and stop before npm on empty extraction."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[2]
node = shutil.which('node')

with tempfile.TemporaryDirectory(prefix='arina-launcher-test-') as temporary:
    for mode in ['success', 'empty-extraction', 'archive-failure', 'install-failure']:
        root = Path(temporary) / mode
        binary = root / 'bin'
        binary.mkdir(parents=True)
        scratch = root / 'tmp'
        scratch.mkdir()
        actions = root / 'actions.txt'
        npm = binary / 'npm'
        npm.write_text('''#!/usr/bin/env python3
from pathlib import Path
import sys
assert Path('package.json').is_file()
assert Path('scripts/publish-community-page.mjs').is_file()
assert Path('src/assets/ambassadors/arina-bachina.png').stat().st_size == 2204723
with open(''' + repr(str(actions)) + ''', 'a') as log: log.write('npm ' + ' '.join(sys.argv[1:]) + '\\n')
if ''' + repr(mode) + ''' == 'install-failure': sys.exit(23)
assert sys.argv[1:] in [['ci', '--no-audit', '--no-fund'], ['run', 'build']]
''')
        npm.chmod(0o755)
        wrapper = binary / 'node'
        wrapper.write_text('''#!/usr/bin/env python3
import os, sys
if sys.argv[1] != 'scripts/publish-community-page.mjs':
    os.execv(''' + repr(node) + ''', [''' + repr(node) + ''', *sys.argv[1:]])
assert sys.argv[2:] == ['--commit', '856ffcf8801b65973a67409910b0b50d6c126d96']
with open(''' + repr(str(actions)) + ''', 'a') as log: log.write('publisher\\n')
print('COMMUNITY_PAGE_PUBLISHED: synthetic publisher, no live writes')
''')
        wrapper.chmod(0o755)
        if mode == 'empty-extraction':
            tar = binary / 'tar'
            tar.write_text('#!/bin/sh\nexit 0\n')
            tar.chmod(0o755)
        if mode == 'archive-failure':
            wrapper = binary / 'git'
            wrapper.write_text('#!/bin/sh\nexit 42\n')
            wrapper.chmod(0o755)
        env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'],
               'ARINA_SITE_CHECKOUT': str(repo), 'ARINA_BACKUP_ROOT': str(root / 'backups'), 'ARINA_TEMP_ROOT': str(scratch)}
        result = subprocess.run(['bash', str(repo / 'scripts/publish-arina-photo.sh')], env=env, cwd=root,
                                text=True, capture_output=True, timeout=60)
        calls = actions.read_text().splitlines() if actions.exists() else []
        if mode == 'success':
            assert result.returncode == 0, result.stdout + result.stderr
            assert calls == ['npm ci --no-audit --no-fund', 'npm run build', 'publisher'], calls
            assert 'ARINA_PHOTO_PUBLISHED:' in result.stdout
            assert not list(scratch.iterdir())
        else:
            assert result.returncode != 0, result.stdout + result.stderr
            assert 'ARINA_PHOTO_NOT_PUBLISHED:' in result.stdout
            assert 'ARINA_PHOTO_PUBLISHED:' not in result.stdout
            assert calls == (['npm ci --no-audit --no-fund'] if mode == 'install-failure' else []), calls
        print('PASS launcher ' + mode + ': real pinned archive and portrait, ordered steps, fail-fast, no live publication')
