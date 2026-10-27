import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect_business_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BusinessExportTests(unittest.TestCase):
    def setUp(self):
        self.run = {'id': 42, 'path': 'devfleet-business.yaml@refs/heads/main', 'head_sha': 'a' * 40,
                    'status': 'completed', 'conclusion': 'success'}
        self.jobs = [{'id': index + 1, 'name': name, 'status': 'completed', 'conclusion': 'success'}
                     for index, name in enumerate(['business-integration', 'business-security', 'business-complete', 'business-browser'])]
        self.receipt = {'schema': 'vizly-business-v1', 'scope': 'integration', 'status': 'passed',
                        'node': '22.23.4', 'npm': '12.0.1', 'os': 'Linux', 'deployment': False,
                        'installation_exit_code': 0, 'source': 'a' * 40, 'source_after': 'a' * 40,
                        'tree': 'b' * 40, 'tree_after': 'b' * 40,
                        'lock_sha256': 'c' * 64, 'lock_sha256_after': 'c' * 64,
                        'working_tree_before': [], 'working_tree_after': [],
                        'gates': [{'id': 'app-rls', 'command': 'test:rls', 'exit_code': 0, 'seconds': 1}]}
        self.log = 'unrelated PRIVATE-CANARY\nVIZLY_BUSINESS_RESULT=' + json.dumps(self.receipt)
        self.log_calls = 0

    def api(self, method, path, raw=False):
        self.assertEqual(method, 'GET')
        if path.endswith('/runs/42'):
            return self.run
        if path.endswith('/runs/42/jobs'):
            return {'jobs': self.jobs}
        self.assertTrue(path.endswith('/logs'))
        self.assertTrue(raw)
        self.log_calls += 1
        return self.log.encode()

    def collect(self):
        return module.collect(self.api, 'juhon/Vizly', '42')

    def test_exports_only_metadata_and_sanitized_receipts(self):
        self.receipt['private'] = 'PRIVATE-CANARY'
        self.receipt['working_tree_before'] = ['PRIVATE-CANARY-PATH']
        self.log = 'PRIVATE-CANARY\nVIZLY_BUSINESS_RESULT=' + json.dumps(self.receipt)
        report = self.collect()
        self.assertEqual(report['schema'], 'vizly-gitea-business-v1')
        self.assertEqual(report['run']['id'], '42')
        self.assertEqual(self.log_calls, 3)
        self.assertNotIn('PRIVATE-CANARY', json.dumps(report))
        self.assertEqual(report['jobs'][0]['business_result']['working_tree_before'], ['dirty-or-invalid'])

    def test_rejects_other_workflow_or_wrong_run(self):
        for field, value in [('path', 'devfleet-native.yaml'), ('id', 99)]:
            original = copy.deepcopy(self.run)
            self.run[field] = value
            with self.assertRaises(RuntimeError): self.collect()
            self.run = original

    def test_queued_jobs_never_acquire_successful_executor_evidence(self):
        self.jobs[0]['status'] = 'queued'
        self.jobs[0]['conclusion'] = None
        report = self.collect()
        self.assertNotIn('business_result', report['jobs'][0])
        self.assertEqual(self.log_calls, 2)

    def test_ambiguous_or_oversized_logs_are_rejected(self):
        self.log += '\nVIZLY_BUSINESS_RESULT=' + json.dumps(self.receipt)
        with self.assertRaises(RuntimeError): self.collect()
        self.log = 'x' * (32 * 1024 * 1024 + 1)
        with self.assertRaises(RuntimeError): self.collect()

    def test_unknown_gate_and_invalid_numeric_fields_are_not_exported(self):
        for field, value in [('id', 'PRIVATE-CANARY'), ('exit_code', True), ('seconds', float('nan'))]:
            receipt = copy.deepcopy(self.receipt)
            receipt['gates'][0][field] = value
            self.assertIsNone(module.business_receipt(receipt))

    def test_browser_counts_are_required_and_private_fields_are_dropped(self):
        receipt = copy.deepcopy(self.receipt)
        receipt.update({'scope': 'browser', 'schema': 'vizly-business-v2'})
        receipt['gates'] = [{'id': 'app-browser-main', 'command': 'test:e2e:main', 'exit_code': 0, 'seconds': 1}]
        self.assertIsNone(module.business_receipt(receipt))
        receipt['gates'][0]['browser'] = {'expected': 1, 'unexpected': 0, 'skipped': 0, 'flaky': 0,
            'cases': 1, 'reportSha256': 'a' * 64, 'private': 'PRIVATE-BODY-CANARY'}
        result = module.business_receipt(receipt)
        self.assertNotIn('CANARY', json.dumps(result))
        self.assertEqual(result['gates'][0]['browser']['cases'], 1)
        for key in ['skipped', 'flaky', 'unexpected']:
            invalid = copy.deepcopy(receipt)
            invalid['gates'][0]['browser'][key] = 1
            self.assertIsNone(module.business_receipt(invalid))

    def test_unknown_job_identity_is_rejected_before_log_fetch(self):
        self.jobs[0]['id'] = '../PRIVATE-CANARY'
        with self.assertRaises(RuntimeError): self.collect()
        self.assertEqual(self.log_calls, 0)

    def test_partial_job_inventory_is_rejected_before_log_fetch(self):
        def partial(method, path, raw=False):
            if path.endswith('/jobs'):
                return {'jobs': self.jobs, 'total_count': 5}
            return self.api(method, path, raw)
        with self.assertRaises(RuntimeError): module.collect(partial, 'juhon/Vizly', '42')
        self.assertEqual(self.log_calls, 0)

    def test_exported_complete_run_imports_through_real_node_cli(self):
        checks = [('app-database-paths', 'test:database'), ('app-rls', 'test:rls'),
                  ('app-s3', 'test:s3'), ('app-collaboration-build', 'collaboration:build'),
                  ('app-telemetry-storage', 'test:telemetry'),
                  ('app-collaboration-auth-load', 'collaboration:auth-load'),
                  ('app-collaboration-mixed-load', 'collaboration:mixed-load')]
        def complete_api(method, path, raw=False):
            if not path.endswith('/logs'):
                return self.api(method, path, raw)
            receipt = copy.deepcopy(self.receipt)
            security = path.endswith('/jobs/2/logs')
            browser = path.endswith('/jobs/4/logs')
            receipt['scope'] = 'security' if security else 'browser' if browser else 'integration'
            if browser: receipt['schema'] = 'vizly-business-v2'
            browser_checks = [('app-browser-runtime', 'playwright:install'), ('app-browser-main', 'test:e2e:main'),
                              ('app-browser-recovery', 'test:e2e:recovery'), ('app-browser-s3', 'test:e2e:s3'),
                              ('app-browser-compatibility', 'test:e2e:compatibility')]
            receipt['gates'] = [{'id': key, 'command': command, 'exit_code': 0, 'seconds': 1}
                                for key, command in ([('app-security', 'audit:all')] if security else browser_checks if browser else checks)]
            for gate in receipt['gates']:
                if gate['command'].startswith('test:e2e:'):
                    gate['browser'] = {'expected': 1, 'unexpected': 0, 'skipped': 0, 'flaky': 0, 'cases': 1, 'reportSha256': 'a' * 64}
            return ('VIZLY_BUSINESS_RESULT=' + json.dumps(receipt)).encode()
        exported = module.collect(complete_api, 'juhon/Vizly', '42')
        identity = {'app': {'repository': 'juhon/Vizly', 'commit': 'a' * 40,
                           'tree': 'b' * 40, 'lockSha256': 'c' * 64, 'clean': True}}
        with tempfile.TemporaryDirectory(prefix='vizly-business-roundtrip-') as directory:
            root = Path(directory)
            (root / 'identity.json').write_text(json.dumps(identity))
            (root / 'raw.json').write_text(json.dumps(exported))
            cli = Path(__file__).resolve().parents[1] / 'scripts/import-business-release-evidence.mjs'
            result = subprocess.run(['node', str(cli), str(root / 'identity.json'),
                                     str(root / 'raw.json'), str(root / 'output')],
                                    check=True, capture_output=True, text=True, timeout=30)
            self.assertEqual(json.loads(result.stdout)['gates'], 12)
            report = json.loads((root / 'output/app-security.json').read_text())
            self.assertEqual((report['runId'], report['jobId']), ('42', '2'))


if __name__ == '__main__':
    unittest.main()
