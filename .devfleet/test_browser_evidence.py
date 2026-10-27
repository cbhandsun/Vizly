import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('browser_evidence', Path(__file__).with_name('browser_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BrowserEvidenceTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.path = self.root / 'report.json'
        self.report = {'stats': {'expected': 1, 'unexpected': 0, 'skipped': 0, 'flaky': 0}, 'errors': [],
                       'suites': [{'specs': [{'ok': True, 'tests': [{'expectedStatus': 'passed', 'status': 'expected',
                           'results': [{'status': 'passed', 'retry': 0, 'errors': []}]}]}]}]}

    def read(self, report):
        self.path.write_text(json.dumps(report))
        return module.read_browser_evidence(self.path)

    def test_exports_counts_digest_and_no_test_bodies(self):
        self.report['private'] = 'PRIVATE-BODY-CANARY'
        result = self.read(self.report)
        self.assertEqual(result['cases'], 1)
        self.assertEqual(len(result['reportSha256']), 64)
        self.assertNotIn('CANARY', json.dumps(result))

    def test_zero_skipped_failed_flaky_and_mismatched_counts_are_rejected(self):
        for key, value in [('expected', 0), ('expected', 2), ('skipped', 1), ('unexpected', 1),
                           ('flaky', 1), ('expected', True)]:
            report = copy.deepcopy(self.report)
            report['stats'][key] = value
            with self.assertRaises(ValueError): self.read(report)

    def test_expected_failure_or_hidden_retry_is_rejected_even_with_green_summary(self):
        for scenario in ['expected-failure', 'retry', 'missing-results', 'hidden-error']:
            report = copy.deepcopy(self.report)
            test = report['suites'][0]['specs'][0]['tests'][0]
            if scenario == 'expected-failure': test['expectedStatus'] = 'failed'
            if scenario == 'retry': test['results'][0]['retry'] = 1
            if scenario == 'missing-results': test['results'] = []
            if scenario == 'hidden-error': report['errors'] = [{'message': 'PRIVATE-BODY-CANARY'}]
            with self.assertRaises(ValueError): self.read(report)

    def test_symlink_report_is_rejected(self):
        self.path.symlink_to(self.root / 'missing.json')
        with self.assertRaises(ValueError): module.read_browser_evidence(self.path)

    def test_real_playwright_reports_pass_only_first_attempt_success(self):
        app = Path(__file__).resolve().parents[1]
        node = shutil.which('node')
        cli = app / 'node_modules/@playwright/test/cli.js'
        test_api = (app / 'node_modules/@playwright/test/index.mjs').as_uri()
        bodies = {'passed': 'expect(1).toBe(1);', 'skipped': 'test.skip();',
                  'flaky': 'if (info.retry === 0) throw Error("synthetic retry");',
                  'expected-failure': 'test.fail(); throw Error("synthetic expected failure");'}
        for name, body in bodies.items():
            with self.subTest(name=name):
                case = self.root / name
                case.mkdir()
                report = case / 'report.json'
                (case / 'probe.spec.mjs').write_text('import {test,expect} from ' + json.dumps(test_api)
                    + ';test("fixture",async({},info)=>{' + body + '});')
                (case / 'config.mjs').write_text('export default ' + json.dumps({
                    'testDir': str(case), 'outputDir': str(case / 'results'), 'retries': 1,
                    'workers': 1, 'reporter': [['list']]}) + ';')
                env = {'PATH': str(Path(node).parent) + os.pathsep + os.defpath,
                       'HOME': str(case), 'CI': 'true', 'PLAYWRIGHT_JSON_OUTPUT_FILE': str(report)}
                result = subprocess.run([node, str(cli), 'test', '--config', str(case / 'config.mjs'), '--reporter=json'],
                                        env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0)
                if name == 'passed':
                    self.assertEqual(module.read_browser_evidence(report)['cases'], 1)
                else:
                    with self.assertRaises(ValueError): module.read_browser_evidence(report)


if __name__ == '__main__':
    unittest.main()
