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
        'CI': 'true', 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
        'NPM_CONFIG_USERCONFIG': str(empty_config),
        'NPM_CONFIG_GLOBALCONFIG': str(state / 'empty-global-npmrc'),
        'NPM_CONFIG_CACHE': str(state / 'npm-cache'),
        'VITE_SUPABASE_URL': '', 'VITE_SUPABASE_ANON_KEY': '',
        'VITE_YJS_WEBSOCKET_URL': '',
    })
    (state / 'empty-global-npmrc').touch(exist_ok=True)
    return env


def source_snapshot(root, output):
    return {
        'source': output(['git', 'rev-parse', 'HEAD']),
        'tree': output(['git', 'rev-parse', 'HEAD^{tree}']),
        'lock_sha256': hashlib.sha256((root / 'package-lock.json').read_bytes()).hexdigest(),
        # Paths are unnecessary to prove clean input and may contain private identifiers.
        'working_tree': [] if not output(['git', 'status', '--porcelain=v1', '--untracked-files=all']) else ['dirty'],
    }


def run_checks(root, output, run, project, system, clock=time.monotonic):
    """Native-only evidence. Failed installation/checks and source drift never become a passing receipt."""
    before = source_snapshot(root, output)
    report = {'schema': 'vizly-native-v2', 'source': before['source'], 'tree': before['tree'],
              'lock_sha256': before['lock_sha256'], 'working_tree_before': before['working_tree'],
              'os': system, 'arch': platform.machine(), 'node': '22.23.4', 'npm': '12.0.1',
              'project': project, 'scope': 'native-only', 'deployment': False,
              'installation_exit_code': None, 'gates': [], 'status': 'failed'}
    try:
        if before['working_tree']:
            report['failure'] = 'dirty-input'
        else:
            report['installation_exit_code'] = run('install')
            if report['installation_exit_code'] == 0:
                for gate in GATES[project]:
                    started = clock()
                    code = run(gate)
                    report['gates'].append({'name': gate, 'exit_code': code,
                                           'seconds': round(max(0, clock() - started), 2)})
            else:
                report['failure'] = 'installation-failed'
    except Exception:
        # Never serialize exception text from commands or dependencies.
        report['failure'] = 'execution-failed'
    after = source_snapshot(root, output)
    report.update({'source_after': after['source'], 'tree_after': after['tree'],
                   'lock_sha256_after': after['lock_sha256'], 'working_tree_after': after['working_tree']})
    stable = before == after and not before['working_tree']
    if not stable:
        report['failure'] = 'source-drift-or-dirty'
    if (stable and 'failure' not in report and report['installation_exit_code'] == 0
            and len(report['gates']) == len(GATES[project])
            and all(gate['exit_code'] == 0 for gate in report['gates'])):
        report['status'] = 'passed'
    return report


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
    if root == state or root in state.parents or root == lock or root in lock.parents:
        parser.error('Runner state and lock must be outside the source checkout')
    node = shutil.which('node')
    npm = Path(os.environ['VIZLY_NPM_CLI']).resolve()
    if not node or not npm.is_file():
        parser.error('Pinned Node/npm not configured on this runner')
    state.mkdir(parents=True, exist_ok=True)
    with platform_lock(lock):
        env = clean_environment(state)
        def output(argv):
            return subprocess.check_output(argv, cwd=root, env=env, text=True, timeout=30).strip()
        if output([node, '--version']) != 'v22.23.4' or output([node, str(npm), '--version']) != '12.0.1':
            parser.error('Pinned Node/npm version mismatch; update runner runtime before executing this source')
        def run(gate):
            if gate == 'install':
                argv = [node, str(npm), 'ci', '--no-audit', '--no-fund']
            elif gate == 'negative-enforcement':
                argv = [node, 'scripts/verify-ci-negative-gates.mjs']
            else:
                argv = [node, str(npm), 'run', gate]
            return subprocess.run(argv, cwd=root, env=env).returncode
        report = run_checks(root, output, run, args.project, platform.system())
        # Evidence is outside Git input; unique files preserve earlier failed attempts.
        name = 'native-' + args.project + '-' + str(time.time_ns()) + '.json'
        with (state / name).open('x') as stream:
            stream.write(json.dumps(report, indent=2, allow_nan=False) + '\n')
        print('VIZLY_NATIVE_RESULT=' + json.dumps(report, allow_nan=False), flush=True)
        return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
