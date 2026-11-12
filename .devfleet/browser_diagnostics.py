"""Preserve bounded browser failure evidence privately before checkout cleanup."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat

MAX_REPORT = 32 * 1024 * 1024
MAX_ARTIFACT = 16 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
MAX_ATTACHMENTS = 512
KINDS = {'image/png': '.png', 'application/zip': '.zip', 'text/markdown': '.md',
         'text/plain': '.txt', 'application/json': '.json'}


def _read_regular(path, limit):
    if path.is_symlink():
        raise ValueError('Symlink evidence is not allowed')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError('Invalid evidence file or budget')
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Evidence budget exceeded')
    return data


def _failed_attachments(report):
    pending = list(report.get('suites', []))
    count = 0
    while pending:
        suite = pending.pop()
        count += 1
        if count > 100000 or not isinstance(suite, dict):
            raise ValueError('Invalid diagnostic suite inventory')
        pending.extend(suite.get('suites', []))
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                for result in test.get('results', []):
                    if result.get('status') != 'passed':
                        yield result.get('attachments', [])


def _artifact_path(root, value):
    if not isinstance(value, str) or not value:
        raise ValueError('Invalid artifact path')
    base = root / 'test-results'
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = root / candidate
    if '..' in candidate.parts or base.is_symlink():
        raise ValueError('Unsafe artifact path')
    for path in [candidate, *candidate.parents]:
        if path.resolve() == root:
            break
        if path.is_symlink():
            raise ValueError('Symlink artifact path')
    candidate.resolve().relative_to(base.resolve())
    return candidate


def retain_browser_diagnostics(root, report_path):
    root, report_path = Path(root).resolve(), Path(report_path)
    if (report_path.name != 'report.json' or report_path.parent.is_symlink()
        or not re.fullmatch(r'browser-report-[A-Za-z0-9_-]{1,100}', report_path.parent.name)
        or root == report_path.parent.resolve() or root in report_path.parent.resolve().parents):
        raise ValueError('Diagnostics must remain outside the checkout')
    raw = _read_regular(report_path, MAX_REPORT)
    destination = report_path.parent / 'diagnostics'
    destination.mkdir(mode=0o700, exist_ok=False)
    saved_report = destination / 'report.json'
    saved_report.write_bytes(raw)
    saved_report.chmod(0o600)
    report = json.loads(raw)
    if not isinstance(report, dict):
        raise ValueError('Invalid browser diagnostic report')
    artifacts, failed, missing, unsafe, ignored = [], 0, 0, 0, 0
    total = len(raw)
    for attachments in _failed_attachments(report):
        failed += 1
        for item in attachments:
            if len(artifacts) + missing + unsafe + ignored >= MAX_ATTACHMENTS:
                raise ValueError('Too many diagnostic artifacts')
            kind = item.get('contentType')
            if kind not in KINDS:
                ignored += 1
                continue
            try:
                body = item.get('body')
                if body is not None:
                    if not isinstance(body, str) or len(body) > (MAX_ARTIFACT + 2) // 3 * 4:
                        raise ValueError('Invalid inline artifact budget')
                    data = base64.b64decode(body, validate=True)
                else:
                    data = _read_regular(_artifact_path(root, item.get('path')), MAX_ARTIFACT)
                if len(data) > MAX_ARTIFACT or total + len(data) > MAX_TOTAL:
                    raise ValueError('Diagnostic byte budget exceeded')
                if kind == 'image/png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('Invalid diagnostic PNG')
                if kind == 'application/zip' and not data.startswith((b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08')):
                    raise ValueError('Invalid diagnostic ZIP')
            except FileNotFoundError:
                missing += 1
                continue
            except (OSError, ValueError, TypeError):
                unsafe += 1
                continue
            name = 'artifact-' + str(len(artifacts)) + KINDS[kind]
            path = destination / name
            path.write_bytes(data)
            path.chmod(0o600)
            total += len(data)
            artifacts.append({'file': name, 'contentType': kind, 'bytes': len(data),
                              'sha256': hashlib.sha256(data).hexdigest()})
    manifest = {'schema': 'vizly-browser-diagnostics-v1', 'reportSha256': hashlib.sha256(raw).hexdigest(),
                'reportBytes': len(raw), 'failedResults': failed, 'artifacts': artifacts,
                'missingArtifacts': missing, 'unsafeArtifacts': unsafe, 'ignoredArtifacts': ignored,
                'totalBytes': total, 'complete': missing == unsafe == ignored == 0}
    raw_manifest = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    manifest_path = destination / 'manifest.json'
    manifest_path.write_bytes(raw_manifest)
    manifest_path.chmod(0o600)
    return {'schema': manifest['schema'], 'directory': report_path.parent.name,
            'reportSha256': manifest['reportSha256'], 'manifestSha256': hashlib.sha256(raw_manifest).hexdigest(),
            'artifacts': len(artifacts), 'totalBytes': total, 'failedResults': failed,
            'missingArtifacts': missing, 'unsafeArtifacts': unsafe, 'ignoredArtifacts': ignored, 'complete': manifest['complete']}


def sanitize_browser_diagnostics(value):
    if (not isinstance(value, dict) or value.get('schema') != 'vizly-browser-diagnostics-v1'
        or not isinstance(value.get('directory'), str)
        or not re.fullmatch(r'browser-report-[A-Za-z0-9_-]{1,100}', value['directory'])
        or type(value.get('complete')) is not bool):
        return None
    for key in ['reportSha256', 'manifestSha256']:
        if not isinstance(value.get(key), str) or not re.fullmatch(r'[a-f0-9]{64}', value[key]):
            return None
    limits = {'artifacts': MAX_ATTACHMENTS, 'totalBytes': MAX_TOTAL, 'failedResults': 100000,
              'missingArtifacts': MAX_ATTACHMENTS, 'unsafeArtifacts': MAX_ATTACHMENTS, 'ignoredArtifacts': MAX_ATTACHMENTS}
    if any(type(value.get(key)) is not int or not 0 <= value[key] <= limit for key, limit in limits.items()):
        return None
    if value['complete'] != (value['missingArtifacts'] == value['unsafeArtifacts'] == value['ignoredArtifacts'] == 0):
        return None
    keys = ['schema', 'directory', 'reportSha256', 'manifestSha256', *limits, 'complete']
    return {key: value[key] for key in keys}
