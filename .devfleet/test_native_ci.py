import importlib.util
from pathlib import Path
import tempfile
import json
import contextlib
import io
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('native_ci', Path(__file__).with_name('native_ci.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class NativeReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'package-lock.json').write_text('{"synthetic":true}\n')
        self.head = 'a' * 40
        self.tree = 'b' * 40
        self.dirty = ''
        self.calls = []

    def output(self, argv):
        if argv[1:] == ['rev-parse', 'HEAD']:
            return self.head
        if argv[1:] == ['rev-parse', 'HEAD^{tree}']:
            return self.tree
        if argv[1] == 'status':
            return self.dirty
        self.fail('Unexpected source query')

    def command(self, gate):
        self.calls.append(gate)
        return 0

    def receipt(self, command=None, project='app'):
        return module.run_checks(self.root, self.output, command or self.command, project, 'Darwin')

    def test_clean_source_emits_full_receipt_without_deployment(self):
        for project in ['app', 'core']:
            self.calls = []
            report = self.receipt(project=project)
            self.assertEqual(report['schema'], 'vizly-native-v2')
            self.assertEqual(report['status'], 'passed')
            self.assertEqual(report['node'], '22.23.4')
            self.assertFalse(report['deployment'])
            self.assertEqual(report['source'], report['source_after'])
            self.assertEqual(report['tree'], report['tree_after'])
            self.assertEqual(report['lock_sha256'], report['lock_sha256_after'])
            self.assertEqual(self.calls, ['install'] + module.GATES[project])

    def test_dirty_input_never_installs_or_runs_checks(self):
        self.dirty = ' M CANARY-PRIVATE-PATH'
        report = self.receipt()
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(self.calls, [])
        self.assertEqual(report['working_tree_before'], ['dirty'])
        self.assertNotIn('CANARY', str(report))

    def test_install_failure_keeps_failed_evidence(self):
        report = self.receipt(lambda gate: 7)
        self.assertEqual(report['installation_exit_code'], 7)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['gates'], [])
        self.assertEqual(report['source_after'], self.head)

    def test_failed_check_does_not_skip_remaining_checks_or_become_success(self):
        def command(gate):
            self.calls.append(gate)
            return 3 if gate == 'lint' else 0
        report = self.receipt(command)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(self.calls, ['install'] + module.GATES['app'])
        self.assertEqual(next(gate for gate in report['gates'] if gate['name'] == 'lint')['exit_code'], 3)

    def test_source_and_lock_drift_fail_even_with_all_zero_exits(self):
        for mutation in ['head', 'tree', 'lock', 'dirty']:
            with self.subTest(mutation=mutation):
                self.head, self.tree, self.dirty = 'a' * 40, 'b' * 40, ''
                (self.root / 'package-lock.json').write_text('before')
                def command(gate):
                    if gate == 'collaboration:build':
                        if mutation == 'head': self.head = 'c' * 40
                        if mutation == 'tree': self.tree = 'd' * 40
                        if mutation == 'lock': (self.root / 'package-lock.json').write_text('after')
                        if mutation == 'dirty': self.dirty = '?? generated-source'
                    return 0
                report = self.receipt(command)
                self.assertEqual(report['status'], 'failed')
                self.assertEqual(report['failure'], 'source-drift-or-dirty')

    def test_exception_text_is_not_serialized(self):
        def command(gate):
            raise RuntimeError('CANARY-CREDENTIAL')
        report = self.receipt(command)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['failure'], 'execution-failed')
        self.assertNotIn('CANARY', str(report))

    def test_main_rejects_old_runtime_before_any_install_or_gate(self):
        cli = self.root / 'npm-cli.js'; cli.write_text('synthetic')
        env = {'VIZLY_CI_STATE': str(self.root / 'state'), 'VIZLY_CI_LOCK': str(self.root / 'lock'),
               'VIZLY_NPM_CLI': str(cli)}
        with patch.dict(module.os.environ, env), patch.object(module.shutil, 'which', return_value='/synthetic/node'), \
             patch.object(module.subprocess, 'check_output', return_value='v22.22.2'), \
             patch.object(module, 'run_checks') as execute, \
             patch.object(sys, 'argv', ['native_ci.py', '--project', 'app', '--expected-os', module.platform.system()]), \
             contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as failure:
                module.main()
            self.assertEqual(failure.exception.code, 2)
            execute.assert_not_called()

    def test_cli_receipt_uses_real_clean_git_input_and_external_state(self):
        # Command bodies are synthetic; this verifies the actual Python/Node/Git CLI wiring only.
        checkout = self.root / 'checkout'; checkout.mkdir()
        scripts = checkout / '.devfleet'; scripts.mkdir()
        shutil.copyfile(Path(__file__).with_name('native_ci.py'), scripts / 'native_ci.py')
        (checkout / 'package-lock.json').write_text('{}')
        (checkout / 'scripts').mkdir()
        (checkout / 'scripts/verify-ci-negative-gates.mjs').write_text('process.exit(0);')
        hooks = self.root / 'empty-hooks'; hooks.mkdir()
        def git(*args):
            return subprocess.check_output(['git', '-c', 'core.hooksPath=' + str(hooks),
                '-c', 'commit.gpgsign=false', '-c', 'user.name=Synthetic CI',
                '-c', 'user.email=synthetic@example.invalid', *args], cwd=checkout,
                stderr=subprocess.DEVNULL, text=True).strip()
        git('init'); git('add', '.'); git('commit', '-m', 'Synthetic runner test')
        cli = self.root / 'synthetic-npm.mjs'
        cli.write_text('if (process.argv[2] === "--version") console.log("12.0.1");')
        state = self.root / 'runner-state'
        env = dict(module.os.environ, VIZLY_CI_STATE=str(state), VIZLY_CI_LOCK=str(self.root / 'runner.lock'),
                   VIZLY_NPM_CLI=str(cli), PYTHONDONTWRITEBYTECODE='1')
        result = subprocess.run([sys.executable, '-B', str(scripts / 'native_ci.py'), '--project', 'app',
                                 '--expected-os', module.platform.system()], cwd=checkout, env=env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        marker = 'VIZLY_NATIVE_RESULT='
        receipt = json.loads(next(line[len(marker):] for line in result.stdout.splitlines() if line.startswith(marker)))
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(receipt['source'], git('rev-parse', 'HEAD'))
        self.assertEqual(receipt['tree'], git('rev-parse', 'HEAD^{tree}'))
        self.assertEqual(git('status', '--porcelain'), '')
        stored = list(state.glob('native-app-*.json'))
        self.assertEqual(len(stored), 1)
        self.assertEqual(json.loads(stored[0].read_text()), receipt)

    def test_environment_drops_host_credentials_and_pins_empty_cloud_configuration(self):
        state = self.root / 'state'; state.mkdir()
        with patch.dict(module.os.environ, {'CANARY_SECRET': 'private', 'NODE_OPTIONS': 'untrusted', 'VITE_SUPABASE_URL': 'private'}, clear=True):
            env = module.clean_environment(state)
        self.assertNotIn('CANARY_SECRET', env)
        self.assertNotIn('NODE_OPTIONS', env)
        self.assertEqual(env['VITE_SUPABASE_URL'], '')
        self.assertEqual(env['PYTHONDONTWRITEBYTECODE'], '1')
        self.assertEqual((state / 'empty-npmrc').read_text(), '')

if __name__ == '__main__':
    unittest.main()
