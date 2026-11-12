"""Read private Playwright reports; export counts and a digest, never test bodies."""
import hashlib
import json
import re


def sanitize_browser_evidence(value):
    keys = ['expected', 'unexpected', 'skipped', 'flaky', 'cases']
    if (not isinstance(value, dict) or any(type(value.get(k)) is not int or not 0 <= value[k] <= 100000 for k in keys)
        or value['expected'] == 0 or value['cases'] != value['expected']
        or any(value[k] for k in ['unexpected', 'skipped', 'flaky'])
        or not isinstance(value.get('reportSha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', value['reportSha256'])):
        return None
    return {**{k: value[k] for k in keys}, 'reportSha256': value['reportSha256']}


def read_browser_evidence(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Invalid browser report file')
    raw = path.read_bytes()
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError('Browser report budget exceeded')
    report = json.loads(raw)
    if not isinstance(report, dict):
        raise ValueError('Invalid browser report')
    stats = report.get('stats')
    if (not isinstance(stats, dict) or report.get('errors') != []
        or any(type(stats.get(k)) is not int or not 0 <= stats[k] <= 100000
               for k in ['expected', 'unexpected', 'skipped', 'flaky'])
        or stats['expected'] == 0 or any(stats[k] for k in ['unexpected', 'skipped', 'flaky'])):
        raise ValueError('Browser cases did not all pass')
    count, suites_seen = 0, 0
    pending = list(report['suites']) if isinstance(report.get('suites'), list) else [None]
    while pending:
        suite = pending.pop()
        suites_seen += 1
        if not isinstance(suite, dict) or suites_seen > 100000:
            raise ValueError('Invalid browser suite')
        nested, specs = suite.get('suites', []), suite.get('specs', [])
        if not isinstance(nested, list) or not isinstance(specs, list):
            raise ValueError('Invalid browser suite inventory')
        pending.extend(nested)
        for spec in specs:
            if not isinstance(spec, dict) or spec.get('ok') is not True or not isinstance(spec.get('tests'), list) or not spec['tests']:
                raise ValueError('Invalid browser case')
            for test in spec['tests']:
                if not isinstance(test, dict) or test.get('expectedStatus') != 'passed' or test.get('status') != 'expected':
                    raise ValueError('Browser case was skipped, flaky or expected to fail')
                results = test.get('results')
                if (not isinstance(results, list) or len(results) != 1 or not isinstance(results[0], dict)
                    or results[0].get('status') != 'passed' or type(results[0].get('retry')) is not int
                    or results[0]['retry'] != 0 or results[0].get('errors') != [] or results[0].get('error')):
                    raise ValueError('Browser case did not pass on its first attempt')
                count += 1
                if count > 100000:
                    raise ValueError('Browser case budget exceeded')
    if count != stats['expected']:
        raise ValueError('Browser report case count mismatch')
    return {**{k: stats[k] for k in ['expected', 'unexpected', 'skipped', 'flaky']},
            'cases': count, 'reportSha256': hashlib.sha256(raw).hexdigest()}
