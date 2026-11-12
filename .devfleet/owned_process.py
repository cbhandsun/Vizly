"""Reap only the Linux test subprocess tree, including detached previews."""
import os
from pathlib import Path
import signal
import subprocess
import time


def identity(pid):
    try:
        fields = (Path('/proc') / str(pid) / 'stat').read_text().rpartition(')')[2].split()
        return None if fields[0] == 'Z' else (int(fields[1]), int(fields[19]))
    except (OSError, ValueError, IndexError):
        return None


def collect(known):
    snapshot = {}
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit():
            value = identity(int(entry.name))
            if value is not None:
                snapshot[int(entry.name)] = value
    active = {pid for pid, started in known.items()
              if pid in snapshot and snapshot[pid][1] == started}
    while True:
        added = {pid for pid, (parent, _) in snapshot.items()
                 if parent in active and pid not in active}
        if not added:
            break
        for pid in added:
            known[pid] = snapshot[pid][1]
        active.update(added)


def alive(known):
    return [pid for pid, started in known.items()
            if (current := identity(pid)) is not None and current[1] == started]


def stop(known):
    for signum, grace in [(signal.SIGTERM, 5), (signal.SIGKILL, 1)]:
        for pid in sorted(alive(known), reverse=True):
            try:
                os.kill(pid, signum)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + grace
        while alive(known) and time.monotonic() < deadline:
            time.sleep(0.05)
    if alive(known):
        raise RuntimeError('Owned test processes did not stop')


def run_owned(argv, *, cwd, env):
    if not Path('/proc/self/stat').is_file():
        raise RuntimeError('Owned business subprocesses require Linux')
    child = subprocess.Popen(argv, cwd=cwd, env=env, start_new_session=True)
    current = identity(child.pid)
    known = {child.pid: current[1]} if current else {}
    previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}

    def cancelled(signum, _frame):
        raise SystemExit(128 + signum)

    for sig in previous:
        signal.signal(sig, cancelled)
    try:
        while True:
            collect(known)
            try:
                return child.wait(timeout=0.25)
            except subprocess.TimeoutExpired:
                continue
    finally:
        # A second cancellation must not interrupt bounded cleanup. A cancelled
        # gate never returns a passing receipt; start ticks guard PID reuse.
        for sig in previous:
            signal.signal(sig, signal.SIG_IGN)
        collect(known)
        try:
            stop(known)
            child.wait(timeout=2)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
