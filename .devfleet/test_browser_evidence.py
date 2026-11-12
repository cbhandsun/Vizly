import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('browser_evidence', Path(__file__).with_name('browser_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

diagnostics_spec = importlib.util.spec_from_file_location('browser_diagnostics', Path(__file__).with_name('browser_diagnostics.py'))
diagnostics = importlib.util.module_from_spec(diagnostics_spec)
diagnostics_spec.loader.exec_module(diagnostics)


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



class BrowserDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / 'checkout'
        self.artifacts = self.root / 'test-results' / 'run-1'
        self.artifacts.mkdir(parents=True)
        self.directory = self.base / 'state' / 'browser-report-synthetic'
        self.directory.mkdir(parents=True)
        self.path = self.directory / 'report.json'
        self.png = b'\x89PNG\r\n\x1a\npixels'

    def report(self, attachments, status='timedOut'):
        value = {'stats': {'expected': 0, 'unexpected': 1, 'skipped': 0, 'flaky': 0},
                 'suites': [{'specs': [{'title': 'synthetic timeout', 'tests': [
                     {'results': [{'status': status, 'attachments': attachments}]}]}]}]}
        self.path.write_text(json.dumps(value))
        return self.path.read_bytes()

    def retain(self):
        return diagnostics.retain_browser_diagnostics(self.root, self.path)

    def test_failed_trace_and_png_survive_checkout_cleanup(self):
        png, trace = self.artifacts / 'failed.png', self.artifacts / 'trace.zip'
        png.write_bytes(self.png)
        trace.write_bytes(b'PK\x03\x04trace-payload')
        original = self.report([{'contentType': 'image/png', 'path': str(png)},
                                {'contentType': 'application/zip', 'path': str(trace)}])
        value = self.retain()
        self.assertTrue(value['complete'])
        self.assertEqual(value['artifacts'], 2)
        self.assertEqual(value['failedResults'], 1)
        self.assertEqual(value['reportSha256'], hashlib.sha256(original).hexdigest())
        shutil.rmtree(self.root)
        saved = self.directory / 'diagnostics'
        self.assertEqual((saved / 'report.json').read_bytes(), original)
        self.assertEqual((saved / 'artifact-0.png').read_bytes(), self.png)
        self.assertEqual((saved / 'artifact-1.zip').read_bytes(), b'PK\x03\x04trace-payload')
        self.assertEqual(saved.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in saved.iterdir()))

    def test_inline_download_is_retained_without_exposing_report_text(self):
        self.report([{'contentType': 'image/png', 'body': base64.b64encode(self.png).decode(),
                      'name': 'PRIVATE-TEST-BODY-CANARY'}])
        value = self.retain()
        self.assertTrue(value['complete'])
        self.assertEqual((self.directory / 'diagnostics/artifact-0.png').read_bytes(), self.png)
        self.assertNotIn('CANARY', json.dumps(value))

    def test_paths_outside_test_results_are_never_read_or_copied(self):
        private = self.base / 'private.png'
        private.write_bytes(self.png + b'PRIVATE-BODY-CANARY')
        self.report([{'contentType': 'image/png', 'path': str(private)},
                     {'contentType': 'image/png', 'path': 'test-results/../private.png'}])
        value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['unsafeArtifacts'], 2)
        self.assertEqual(value['artifacts'], 0)
        self.assertNotIn(b'PRIVATE-BODY-CANARY', b''.join(p.read_bytes() for p in (self.directory / 'diagnostics').iterdir()))

    def test_file_and_directory_symlinks_are_refused(self):
        private = self.base / 'private'
        private.mkdir()
        (private / 'outside.png').write_bytes(self.png)
        file_link = self.artifacts / 'file.png'
        file_link.symlink_to(private / 'outside.png')
        directory_link = self.artifacts / 'linked'
        directory_link.symlink_to(private, target_is_directory=True)
        self.report([{'contentType': 'image/png', 'path': str(file_link)},
                     {'contentType': 'image/png', 'path': str(directory_link / 'outside.png')}])
        value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['unsafeArtifacts'], 2)
        self.assertEqual(value['artifacts'], 0)

    def test_missing_artifact_is_reported_without_faking_completeness(self):
        self.report([{'contentType': 'image/png', 'path': str(self.artifacts / 'missing.png')}])
        value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['missingArtifacts'], 1)
        self.assertIsNotNone(diagnostics.sanitize_browser_diagnostics(value))

    def test_malformed_report_is_preserved_privately_but_rejected(self):
        raw = b'not-json PRIVATE-BODY-CANARY'
        self.path.write_bytes(raw)
        with self.assertRaises(ValueError): self.retain()
        self.assertEqual((self.directory / 'diagnostics/report.json').read_bytes(), raw)

    def test_passed_case_does_not_import_arbitrary_attachments(self):
        self.report([{'contentType': 'image/png', 'path': '/outside/private.png'}], status='passed')
        value = self.retain()
        self.assertTrue(value['complete'])
        self.assertEqual(value['failedResults'], 0)
        self.assertEqual(value['artifacts'], 0)

    def test_per_artifact_and_total_byte_limits_fail_closed(self):
        raw = self.report([{'contentType': 'image/png', 'body': base64.b64encode(self.png).decode()}])
        with patch.object(diagnostics, 'MAX_ARTIFACT', 4): value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['artifacts'], 0)
        shutil.rmtree(self.directory / 'diagnostics')
        with patch.object(diagnostics, 'MAX_TOTAL', len(raw) + len(self.png) - 1): value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['artifacts'], 0)

    def test_artifact_count_unknown_types_and_bad_bytes_cannot_look_complete(self):
        self.report([{'contentType': 'image/png', 'body': base64.b64encode(b'not-png').decode()},
                     {'contentType': 'application/x-unknown', 'body': ''}])
        value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['unsafeArtifacts'], 1)
        self.assertEqual(value['ignoredArtifacts'], 1)
        shutil.rmtree(self.directory / 'diagnostics')
        self.report([{'contentType': 'text/plain', 'body': ''}] * 2)
        with patch.object(diagnostics, 'MAX_ATTACHMENTS', 1):
            with self.assertRaises(ValueError): self.retain()

    def test_special_file_cannot_block_capture(self):
        fifo = self.artifacts / 'trace.zip'
        os.mkfifo(fifo)
        self.report([{'contentType': 'application/zip', 'path': str(fifo)}])
        value = self.retain()
        self.assertFalse(value['complete'])
        self.assertEqual(value['unsafeArtifacts'], 1)
        self.assertEqual(value['artifacts'], 0)

    def test_report_symlinks_size_and_checkout_destinations_are_rejected(self):
        private = self.base / 'private-report.json'
        private.write_text('{}')
        self.path.symlink_to(private)
        with self.assertRaises(ValueError): self.retain()
        self.path.unlink()
        self.path.write_bytes(b'x' * 20)
        with patch.object(diagnostics, 'MAX_REPORT', 10):
            with self.assertRaises(ValueError): self.retain()
        inside = self.root / 'browser-report-inside'
        inside.mkdir()
        (inside / 'report.json').write_text('{}')
        with self.assertRaises(ValueError): diagnostics.retain_browser_diagnostics(self.root, inside / 'report.json')

    def test_public_metadata_rejects_invalid_values_and_strips_extras(self):
        self.report([])
        value = self.retain()
        self.assertIsNotNone(diagnostics.sanitize_browser_diagnostics(value))
        for key, changed in [('directory', '../../private'), ('artifacts', True),
                             ('totalBytes', diagnostics.MAX_TOTAL + 1), ('reportSha256', 'not-a-digest'),
                             ('missingArtifacts', 1)]:
            invalid = {**value, key: changed}
            self.assertIsNone(diagnostics.sanitize_browser_diagnostics(invalid))
        self.assertNotIn('CANARY', json.dumps(diagnostics.sanitize_browser_diagnostics({**value, 'extra': 'PRIVATE-CANARY'})))



if __name__ == '__main__':
    unittest.main()
