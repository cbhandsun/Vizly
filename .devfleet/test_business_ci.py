import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('business_ci', Path(__file__).with_name('business_ci.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BusinessReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'package-lock.json').write_text('synthetic lock\n')
        self.head, self.tree, self.dirty = 'a' * 40, 'b' * 40, ''
        self.calls = []

    def output(self, argv):
        if argv[1:] == ['rev-parse', 'HEAD']:
            return self.head
        if argv[1:] == ['rev-parse', 'HEAD^{tree}']:
            return self.tree
        if argv[1] == 'status':
            return self.dirty
        self.fail('Unexpected command')

    def execute(self, command):
        self.calls.append(command)
        if command.startswith('test:e2e:'):
            return {'exit_code': 0, 'browser': {'expected': 1, 'unexpected': 0, 'skipped': 0, 'flaky': 0, 'cases': 1, 'reportSha256': 'a' * 64}}
        return 0

    def receipt(self, execute=None, profile='integration'):
        return module.run_checks(self.root, self.output, execute or self.execute, profile)

    def test_clean_profiles_bind_source_and_run_every_gate(self):
        for profile in module.GATES:
            self.calls = []
            report = self.receipt(profile=profile)
            self.assertEqual(report['status'], 'passed')
            self.assertEqual(report['schema'], 'vizly-business-v2' if profile == 'browser' else 'vizly-business-v1')
            self.assertEqual(report['source'], report['source_after'])
            self.assertEqual(report['tree'], report['tree_after'])
            self.assertEqual(report['lock_sha256'], report['lock_sha256_after'])
            self.assertEqual(self.calls, ['install'] + [command for _, command in module.GATES[profile]])
            self.assertFalse(report['deployment'])

    def test_dirty_source_refuses_to_install_and_redacts_paths(self):
        self.dirty = ' M PRIVATE-PATH-CANARY'
        report = self.receipt()
        self.assertEqual(report['failure'], 'dirty-input')
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(self.calls, [])
        self.assertNotIn('CANARY', json.dumps(report))

    def test_installation_failure_never_passes_or_runs_business_gates(self):
        report = self.receipt(lambda command: 7)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['gates'], [])
        self.assertEqual(report['installation_exit_code'], 7)

    def test_failed_business_gate_does_not_hide_remaining_results(self):
        def execute(command):
            self.calls.append(command)
            return 9 if command == 'test:rls' else 0
        report = self.receipt(execute)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(len(report['gates']), len(module.GATES['integration']))
        self.assertEqual(next(g for g in report['gates'] if g['id'] == 'app-rls')['exit_code'], 9)
        self.assertEqual(self.calls[-1], 'collaboration:mixed-load')

    def test_source_or_lock_drift_rejects_zero_exit_codes(self):
        for field in ['head', 'tree', 'dirty', 'lock']:
            with self.subTest(field=field):
                self.head, self.tree, self.dirty = 'a' * 40, 'b' * 40, ''
                (self.root / 'package-lock.json').write_text('synthetic lock\n')
                def execute(command):
                    if command == 'collaboration:mixed-load':
                        if field == 'head': self.head = 'c' * 40
                        if field == 'tree': self.tree = 'd' * 40
                        if field == 'dirty': self.dirty = '?? unexpected-source'
                        if field == 'lock': (self.root / 'package-lock.json').write_text('changed')
                    return 0
                report = self.receipt(execute)
                self.assertEqual(report['status'], 'failed')
                self.assertEqual(report['failure'], 'source-drift-or-dirty')

    def test_exception_does_not_serialize_credentials(self):
        def execute(_command):
            raise RuntimeError('PRIVATE-CREDENTIAL-CANARY')
        report = self.receipt(execute)
        self.assertEqual(report['status'], 'failed')
        self.assertNotIn('CANARY', json.dumps(report))

    def test_browser_install_and_each_suite_are_mandatory(self):
        expected = ['playwright:install', 'test:e2e:main', 'test:e2e:recovery',
                    'test:e2e:s3', 'test:e2e:compatibility']
        self.assertEqual([command for _, command in module.GATES['browser']], expected)
        for failing in expected:
            self.calls = []
            def execute(command):
                result = self.execute(command)
                if command == failing:
                    return {**result, 'exit_code': 5} if isinstance(result, dict) else 5
                return result
            report = self.receipt(execute, profile='browser')
            self.assertEqual(report['status'], 'failed')
            self.assertEqual(self.calls, ['install'] + expected)

    def test_browser_zero_exit_without_original_case_evidence_is_rejected(self):
        report = self.receipt(lambda _: 0, profile='browser')
        self.assertEqual(report['status'], 'failed')
        self.assertTrue(all(gate['exit_code'] == 0 for gate in report['gates']))

    def test_browser_skips_or_retries_never_pass(self):
        for field in ['skipped', 'flaky', 'unexpected']:
            def execute(command):
                result = self.execute(command)
                if command == 'test:e2e:main': result['browser'][field] = 1
                return result
            self.assertEqual(self.receipt(execute, profile='browser')['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
