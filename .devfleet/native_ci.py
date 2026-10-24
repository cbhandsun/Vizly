#!/usr/bin/env python3
"""Vizly native checks only. This entry never deploys or publishes packages."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time

GATES = {
    'app': ['typecheck', 'lint', 'negative-enforcement', 'test:ci', 'build', 'collaboration:build'],
    'core': ['build:sdk', 'typecheck:source', 'typecheck:test-support',
             'typecheck:focus-geometry', 'typecheck:build-plugins',
             'lint:source', 'check:package-boundaries',
             'check:core-package-contents', 'test'],
}


@contextmanager
def platform_lock(path):
    """App and Core native jobs on the same OS share one resource budget."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if os.name == 'nt':
            import msvcrt
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b'0')
                handle.flush()
            while True:
                handle.seek(0)
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(2)
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def clean_environment(state):
    # Host runners must not pass user/cloud credentials to build tooling.
    allowed = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot',
               'COMSPEC', 'ComSpec', 'PATHEXT', 'WINDIR', 'TEMP', 'TMP',
               'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL',
               'NO_PROXY', 'no_proxy']
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    empty_config = state / 'empty-npmrc'
    empty_config.touch(exist_ok=True)
    env.update({
        'CI': 'true', 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
        'NPM_CONFIG_USERCONFIG': str(empty_config),
        'NPM_CONFIG_GLOBALCONFIG': str(state / 'empty-global-npmrc'),
        'NPM_CONFIG_CACHE': str(state / 'npm-cache'),
        'VITE_SUPABASE_URL': '', 'VITE_SUPABASE_ANON_KEY': '',
        'VITE_YJS_WEBSOCKET_URL': '',
    })
    (state / 'empty-global-npmrc').touch(exist_ok=True)
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=list(GATES), required=True)
    parser.add_argument('--expected-os', choices=['Darwin', 'Windows', 'Linux'], required=True)
    args = parser.parse_args()
    if platform.system() != args.expected_os:
        parser.error('Native OS does not match the requested platform')
    root = Path(__file__).resolve().parents[1]
    state = Path(os.environ['VIZLY_CI_STATE']).resolve()
    lock = Path(os.environ['VIZLY_CI_LOCK']).resolve()
    node = shutil.which('node')
    npm = Path(os.environ['VIZLY_NPM_CLI']).resolve()
    if not node or not npm.is_file():
        parser.error('Pinned Node/npm not configured on this runner')
    state.mkdir(parents=True, exist_ok=True)
    with platform_lock(lock):
        env = clean_environment(state)
        def output(argv):
            return subprocess.check_output(argv, cwd=root, env=env, text=True, timeout=30).strip()
        assert output([node, '--version']) == 'v22.22.2', 'Node version mismatch'
        assert output([node, str(npm), '--version']) == '12.0.1', 'npm version mismatch'
        source = output(['git', 'rev-parse', 'HEAD'])
        lock_hash = hashlib.sha256((root / 'package-lock.json').read_bytes()).hexdigest()
        report = {'source': source, 'os': platform.system(), 'arch': platform.machine(),
                  'node': '22.22.2', 'npm': '12.0.1', 'lock_sha256': lock_hash,
                  'project': args.project, 'scope': 'native-only', 'deployment': False,
                  'gates': []}
        print('VIZLY_INPUT=' + json.dumps(report), flush=True)
        install = subprocess.run([node, str(npm), 'ci', '--no-audit', '--no-fund'], cwd=root, env=env)
        if install.returncode:
            return install.returncode
        for gate in GATES[args.project]:
            started = time.monotonic()
            argv = [node, 'scripts/verify-ci-negative-gates.mjs'] if gate == 'negative-enforcement' else [node, str(npm), 'run', gate]
            result = subprocess.run(argv, cwd=root, env=env)
            report['gates'].append({'name': gate, 'exit_code': result.returncode,
                                    'seconds': round(time.monotonic() - started, 2)})
            (root / 'devfleet-native-result.json').write_text(json.dumps(report, indent=2) + '\n')
        if source != output(['git', 'rev-parse', 'HEAD']):
            raise RuntimeError('Source HEAD changed during the checks')
        if lock_hash != hashlib.sha256((root / 'package-lock.json').read_bytes()).hexdigest():
            raise RuntimeError('Dependency lock changed during the checks')
        print('VIZLY_NATIVE_RESULT=' + json.dumps(report), flush=True)
        return 1 if any(g['exit_code'] for g in report['gates']) else 0


if __name__ == '__main__':
    sys.exit(main())
