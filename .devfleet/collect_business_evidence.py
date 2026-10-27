"""Export selected Gitea API facts using DevFoundry's existing connection; no log bodies or credentials saved. Business runs only."""
import argparse
import json
from pathlib import Path
import re
import sys
from browser_evidence import sanitize_browser_evidence


def business_receipt(value):
    if not isinstance(value, dict):
        return None
    result = {}
    rules = {
        'source': r'[a-f0-9]{40}', 'source_after': r'[a-f0-9]{40}',
        'tree': r'[a-f0-9]{40}', 'tree_after': r'[a-f0-9]{40}',
        'lock_sha256': r'[a-f0-9]{64}', 'lock_sha256_after': r'[a-f0-9]{64}',
        'node': r'\d+\.\d+\.\d+', 'npm': r'\d+\.\d+\.\d+',
        'status': r'passed|failed', 'schema': r'vizly-business-v[12]',
        'os': r'Linux', 'scope': r'integration|security|browser',
    }
    for key, pattern in rules.items():
        item = value.get(key)
        if isinstance(item, str) and re.fullmatch(pattern, item):
            result[key] = item
    if result.get('scope') == 'browser' and result.get('schema') != 'vizly-business-v2':
        return None
    result['deployment'] = value.get('deployment') is not False
    install = value.get('installation_exit_code')
    if type(install) is int and 0 <= install <= 255:
        result['installation_exit_code'] = install
    for key in ['working_tree_before', 'working_tree_after']:
        # Only clean status is retained. Do not expose arbitrary paths from runner logs.
        if key in value:
            result[key] = [] if value[key] == [] else ['dirty-or-invalid']
    checks = {'app-database-paths':'test:database','app-rls':'test:rls','app-s3':'test:s3',
              'app-collaboration-build':'collaboration:build','app-collaboration-auth-load':'collaboration:auth-load',
              'app-collaboration-mixed-load':'collaboration:mixed-load','app-security':'audit:all',
              'app-browser-runtime':'playwright:install', 'app-browser-main':'test:e2e:main',
              'app-browser-recovery':'test:e2e:recovery', 'app-browser-s3':'test:e2e:s3',
              'app-browser-compatibility':'test:e2e:compatibility'}
    result['gates'] = []
    gates = value.get('gates')
    if not isinstance(gates, list) or len(gates) > 32:
        return None
    for gate in gates:
        if not isinstance(gate, dict) or gate.get('id') not in checks or gate.get('command') != checks.get(gate.get('id')):
            return None
        code, seconds = gate.get('exit_code'), gate.get('seconds')
        if type(code) is not int or not 0 <= code <= 255 or type(seconds) not in [int, float] or not 0 <= seconds <= 86400:
            return None
        item = {'id': gate['id'], 'command': gate['command'], 'exit_code': code, 'seconds': seconds}
        if gate['command'].startswith('test:e2e:'):
            browser = sanitize_browser_evidence(gate.get('browser'))
            if browser is None:
                return None
            item['browser'] = browser
        result['gates'].append(item)
    return result


def collect(api, repository, run_id):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository) or not re.fullmatch(r'[1-9]\d*', run_id):
        raise RuntimeError('Invalid repository or run')
    prefix = '/repos/' + repository + '/actions'
    run = api('GET', prefix + '/runs/' + run_id)
    workflow = run.get('path', '').split('@', 1)[0]
    if workflow != 'devfleet-business.yaml' or str(run.get('id')) != run_id or not re.fullmatch(r'[a-f0-9]{40}', run.get('head_sha', '')):
        raise RuntimeError('Unexpected workflow or revision')
    inventory = api('GET', prefix + '/runs/' + run_id + '/jobs')
    jobs = inventory.get('jobs')
    if not isinstance(jobs, list) or len(jobs) > 16 or (
        'total_count' in inventory and (type(inventory['total_count']) is not int or inventory['total_count'] != len(jobs))
    ):
        raise RuntimeError('Unexpected job inventory')
    statuses = {'completed', 'queued', 'in_progress', 'waiting'}
    conclusions = {'success', 'failure', 'cancelled', 'skipped', 'neutral', None}
    def state(value, allowed):
        return value if value in allowed else 'unknown'
    result = {'schema': 'vizly-gitea-business-v1', 'provider': 'gitea', 'repository': repository,
              'workflow': workflow, 'run': {'id': str(run['id']), 'head_sha': run['head_sha'],
                'status': state(run.get('status'), statuses), 'conclusion': state(run.get('conclusion'), conclusions)}, 'jobs': []}
    for job in jobs:
        if not isinstance(job, dict) or not re.fullmatch(r'[1-9]\d*', str(job.get('id', ''))):
            raise RuntimeError('Invalid job identity')
        if job.get('name') not in ['business-integration', 'business-security', 'business-browser', 'business-complete']:
            raise RuntimeError('Unexpected job name')
        item = {'id': str(job['id']), 'name': job['name'], 'status': state(job.get('status'), statuses),
                'conclusion': state(job.get('conclusion'), conclusions)}
        if item['status'] == 'completed' and job['name'] != 'business-complete':
            raw = api('GET', prefix + '/jobs/' + str(job['id']) + '/logs', raw=True)
            if len(raw) > 32 * 1024 * 1024:
                raise RuntimeError('Job log exceeds export budget')
            receipts = []
            for line in raw.decode(errors='replace').splitlines():
                marker = 'VIZLY_BUSINESS_RESULT='
                if marker in line:
                    if len(line) > 2 * 1024 * 1024:
                        raise RuntimeError('Receipt line exceeds export budget')
                    try:
                        receipts.append(business_receipt(json.loads(line.split(marker, 1)[1])))
                    except (ValueError, TypeError):
                        receipts.append(None)
            if len(receipts) > 1:
                raise RuntimeError('Ambiguous executor receipts')
            item['business_result'] = receipts[0] if receipts else None
        result['jobs'].append(item)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', choices=['juhon/Vizly'], required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--devfoundry-scripts', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[1-9]\d*', args.run) or args.output.exists():
        parser.error('Run must be numeric and output must be new')
    if re.fullmatch(r'(?i)(?:\.env.*|\.npmrc|\.rustdesk.*|auth\.json)', args.output.name):
        parser.error('Sensitive output path')
    sys.path.insert(0, str(args.devfoundry_scripts.resolve()))
    from gitea_api import connection
    with connection() as api:
        report = collect(api, args.repository, args.run)
    with args.output.open('x') as stream:
        stream.write(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'status': 'exported-not-approved', 'repository': args.repository, 'runId': args.run,
                      'conclusion': report['run']['conclusion']}))
