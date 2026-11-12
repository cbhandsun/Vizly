import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from owned_process import identity


@unittest.skipUnless(sys.platform == 'linux', 'Linux business executor contract')
class OwnedProcessTests(unittest.TestCase):
    def exercise(self, cancel):
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'preview.json'
            preview = (
                "import json,os,socket,sys,time;from pathlib import Path;"
                "s=socket.socket();s.bind(('127.0.0.1',0));s.listen();"
                "Path(sys.argv[1]).write_text(json.dumps({'pid':os.getpid(),'port':s.getsockname()[1]}));"
                "time.sleep(60)"
            )
            parent = (
                "import subprocess,sys,time;"
                f"subprocess.Popen([sys.executable,'-c',{preview!r},sys.argv[1]],start_new_session=True);"
                f"time.sleep({60 if cancel else 1.5})"
            )
            runner = (
                "import os,sys;from owned_process import run_owned;"
                f"sys.exit(run_owned([sys.executable,'-c',{parent!r},sys.argv[1]],cwd=os.getcwd(),env=os.environ.copy()))"
            )
            worker = subprocess.Popen([sys.executable, '-c', runner, str(receipt)],
                                      cwd=Path(__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            owned = None
            try:
                deadline = time.monotonic() + 10
                while not receipt.exists() and time.monotonic() < deadline:
                    self.assertIsNone(worker.poll())
                    time.sleep(0.05)
                self.assertTrue(receipt.exists())
                data = json.loads(receipt.read_text())
                owned = identity(data['pid'])
                self.assertIsNotNone(owned)
                if cancel:
                    time.sleep(0.5)
                    worker.terminate()
                _, stderr = worker.communicate(timeout=12)
                self.assertEqual(worker.returncode, 128 + signal.SIGTERM if cancel else 0,
                                 stderr.decode(errors='replace'))
                self.assertIsNone(identity(data['pid']))
                with socket.socket() as connection:
                    self.assertNotEqual(connection.connect_ex(('127.0.0.1', data['port'])), 0)
            finally:
                if worker.poll() is None:
                    worker.kill()
                    worker.communicate(timeout=3)
                if receipt.exists():
                    pid = json.loads(receipt.read_text())['pid']
                    if owned is not None and identity(pid) == owned:
                        os.kill(pid, signal.SIGTERM)

    def test_normal_exit_reaps_detached_preview(self):
        self.exercise(False)

    def test_cancellation_reaps_detached_preview_without_passing(self):
        self.exercise(True)
