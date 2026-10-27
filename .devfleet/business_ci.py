#!/usr/bin/env python3
"""Run Linux business gates against clean committed input; never deploy."""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
from native_ci import clean_environment, platform_lock, source_snapshot
from browser_evidence import read_browser_evidence, sanitize_browser_evidence

GATES = {
    'integration': [
        ('app-database-paths', 'test:database'),
        ('app-rls', 'test:rls'),
        ('app-s3', 'test:s3'),
        ('app-collaboration-build', 'collaboration:build'),
        ('app-collaboration-auth-load', 'collaboration:auth-load'),
        ('app-collaboration-mixed-load', 'collaboration:mixed-load'),
    ],
    'security': [('app-security', 'audit:all')],
    'browser': [
        ('app-browser-runtime', 'playwright:install'),
        ('app-browser-main', 'test:e2e:main'),
        ('app-browser-recovery', 'test:e2e:recovery'),
        ('app-browser-s3', 'test:e2e:s3'),
        ('app-browser-compatibility', 'test:e2e:compatibility'),
    ],
}


def run_checks(root, output, run, profile, clock=time.monotonic):
    before = source_snapshot(root, output)
    report = {
        'schema': 'vizly-business-v2' if profile == 'browser' else 'vizly-business-v1', 'scope': profile,
        'source': before['source'], 'tree': before['tree'],
        'lock_sha256': before['lock_sha256'],
        'working_tree_before': before['working_tree'],
        'os': 'Linux', 'node': '22.23.4', 'npm': '12.0.1',
        'status': 'failed', 'deployment': False,
        'installation_exit_code': None, 'gates': [],
    }
    try:
        if before['working_tree']:
            report['failure'] = 'dirty-input'
        else:
            report['installation_exit_code'] = run('install')
            if report['installation_exit_code'] == 0:
                for gate_id, command in GATES[profile]:
                    started = clock()
                    result = run(command)
                    code = result['exit_code'] if isinstance(result, dict) else result
                    gate = {
                        'id': gate_id, 'command': command, 'exit_code': code,
                        'seconds': round(max(0, clock() - started), 2),
                    }
                    if isinstance(result, dict) and 'browser' in result:
                        gate['browser'] = result['browser']
                    report['gates'].append(gate)
            else:
                report['failure'] = 'installation-failed'
    except Exception:
        report['failure'] = 'execution-failed'
    after = source_snapshot(root, output)
    report.update({
        'source_after': after['source'], 'tree_after': after['tree'],
        'lock_sha256_after': after['lock_sha256'],
        'working_tree_after': after['working_tree'],
    })
    if before != after or before['working_tree']:
        report['failure'] = 'source-drift-or-dirty' if not before['working_tree'] else 'dirty-input'
    elif (report['installation_exit_code'] == 0
          and len(report['gates']) == len(GATES[profile])
          and all(gate['exit_code'] == 0 for gate in report['gates'])
          and all(sanitize_browser_evidence(gate.get('browser')) is not None
                  for gate in report['gates'] if gate['command'].startswith('test:e2e:'))
          and 'failure' not in report):
        report['status'] = 'passed'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', choices=list(GATES), required=True)
    args = parser.parse_args()
    if platform.system() != 'Linux':
        parser.error('Business CI requires the dedicated Linux runner')
    root = Path(__file__).resolve().parents[1]
    state = Path(os.environ['VIZLY_CI_STATE']).resolve()
    lock = Path(os.environ['VIZLY_CI_LOCK']).resolve()
    if root == state or root in state.parents or root == lock or root in lock.parents:
        parser.error('Runner state and lock must be outside the checkout')
    node = shutil.which('node')
    npm = Path(os.environ['VIZLY_NPM_CLI']).resolve()
    if not node or not npm.is_file():
        parser.error('Pinned Node/npm not configured')
    state.mkdir(parents=True, exist_ok=True)
    with platform_lock(lock):
        env = clean_environment(state)
        env['PLAYWRIGHT_BROWSERS_PATH'] = str(state / 'playwright')

        def output(argv):
            return subprocess.check_output(argv, cwd=root, env=env, text=True, timeout=30).strip()

        if output([node, '--version']) != 'v22.23.4' or output([node, str(npm), '--version']) != '12.0.1':
            parser.error('Pinned Node/npm version mismatch')

        def run(command):
            if command.startswith('test:e2e:'):
                report_dir = Path(tempfile.mkdtemp(prefix='browser-report-', dir=state))
                path = report_dir / 'report.json'
                child_env = {**env, 'PLAYWRIGHT_JSON_OUTPUT_FILE': str(path), 'VIZLY_S3_BROWSER_REPORT': str(path)}
                argv = [node, str(npm), 'run', command]
                if command != 'test:e2e:s3':
                    argv += ['--', '--reporter=json']
                code = subprocess.run(argv, cwd=root, env=child_env).returncode
                try:
                    evidence = read_browser_evidence(path)
                except (OSError, ValueError, TypeError, KeyError, AttributeError):
                    print('Browser JSON evidence rejected: ' + command, flush=True)
                    return {'exit_code': code or 1}
                return {'exit_code': code, 'browser': evidence}
            if command == 'playwright:install':
                code = subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', '.devfleet',
                                       '-p', 'test_browser_evidence.py'], cwd=root, env=env).returncode
                if code != 0:
                    return code
            argv = ([node, 'node_modules/@playwright/test/cli.js', 'install', 'chromium', 'firefox', 'webkit']
                    if command == 'playwright:install' else
                    [node, str(npm), 'ci', '--no-audit', '--no-fund'] if command == 'install'
                    else [node, str(npm), 'run', command])
            code = subprocess.run(argv, cwd=root, env=env).returncode
            if command == 'playwright:install' and code == 0:
                code = subprocess.run([node, 'scripts/check-ci-browser-runtime.mjs'], cwd=root, env=env).returncode
            return code

        report = run_checks(root, output, run, args.profile)
        name = 'business-' + args.profile + '-' + str(time.time_ns()) + '.json'
        with (state / name).open('x') as stream:
            stream.write(json.dumps(report, indent=2, allow_nan=False) + '\n')
        print('VIZLY_BUSINESS_RESULT=' + json.dumps(report, allow_nan=False), flush=True)
        return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
