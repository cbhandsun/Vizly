import { describe, expect, it, vi } from 'vitest';

import {
  readFlowchartImportFileText,
  validateFlowchartImportFile,
} from '../flowchartImportFile';

const messages = {
  invalidFormat: 'Invalid format',
  emptyFile: 'Empty file',
  invalidSize: 'Invalid size',
  tooLarge: ({ filename, size, limit }: { filename: string; size: string; limit: string }) => (
    `${filename}|${size}|${limit}`
  ),
};

describe('flowchartImportFile', () => {
  it('validates supported extensions and size limits for flowchart imports', () => {
    expect(validateFlowchartImportFile(
      { name: 'diagram.json', size: 1024 } as File,
      messages
    )).toEqual({
      ok: true,
      importKind: 'json',
    });

    expect(validateFlowchartImportFile(
      { name: 'diagram.mmd', size: 1024 } as File,
      messages
    )).toEqual({
      ok: true,
      importKind: 'mermaid',
    });

    expect(validateFlowchartImportFile(
      { name: 'diagram.png', size: 1024 } as File,
      messages
    )).toEqual({
      ok: false,
      error: 'Invalid format',
    });
  });

  it('returns the size-limit error for oversized imports', () => {
    const result = validateFlowchartImportFile(
      { name: 'huge.json', size: 6 * 1024 * 1024 } as File,
      messages
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected validation failure');
    }
    expect(result.error).toBe('huge.json|6 MB|5 MB');
  });

  it('rejects empty and invalid-size files before reading them', () => {
    expect(validateFlowchartImportFile(
      { name: 'empty.json', size: 0 } as File,
      messages
    )).toEqual({ ok: false, error: 'Empty file' });

    expect(validateFlowchartImportFile(
      { name: 'invalid.json', size: Number.NaN } as File,
      messages
    )).toEqual({ ok: false, error: 'Invalid size' });

    expect(validateFlowchartImportFile(
      { name: 'negative.json', size: -1 } as File,
      messages
    )).toEqual({ ok: false, error: 'Invalid size' });
  });

  it('sanitizes untrusted filenames before interpolating size errors', () => {
    const result = validateFlowchartImportFile(
      { name: 'report\u202Egnp.json\nsecond-line.json', size: 6 * 1024 * 1024 } as File,
      messages
    );

    expect(result).toEqual({
      ok: false,
      error: 'report gnp.json second-line.json|6 MB|5 MB',
    });
  });

  it('reads text file content through FileReader and rejects read errors', async () => {
    const readAsText = vi.fn(function (this: { onload: ((event: { target: { result: string } }) => void) | null }) {
      this.onload?.({ target: { result: 'flowchart TD\nA-->B' } });
    });

    await expect(readFlowchartImportFileText(
      new Blob(['ignored']),
      () => ({
        onload: null,
        onerror: null,
        readAsText,
      })
    )).resolves.toBe('flowchart TD\nA-->B');

    await expect(readFlowchartImportFileText(
      new Blob(['ignored']),
      () => ({
        onload: null,
        onerror: null,
        readAsText() {
          this.onerror?.call(
            this as unknown as FileReader,
            { type: 'error', target: this } as unknown as ProgressEvent<FileReader>,
          );
        },
      })
    )).rejects.toThrow('Failed to read import file.');
  });
});
