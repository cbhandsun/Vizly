import { describe, expect, it, vi } from 'vitest';

import {
  readFlowchartImportFileText,
  validateFlowchartImportFile,
} from '../flowchartImportFile';

describe('flowchartImportFile', () => {
  it('validates supported extensions and size limits for flowchart imports', () => {
    expect(validateFlowchartImportFile(
      { name: 'diagram.json', size: 1024 } as File,
      'Invalid format'
    )).toEqual({
      ok: true,
      importKind: 'json',
    });

    expect(validateFlowchartImportFile(
      { name: 'diagram.mmd', size: 1024 } as File,
      'Invalid format'
    )).toEqual({
      ok: true,
      importKind: 'mermaid',
    });

    expect(validateFlowchartImportFile(
      { name: 'diagram.png', size: 1024 } as File,
      'Invalid format'
    )).toEqual({
      ok: false,
      error: 'Invalid format',
    });
  });

  it('returns the size-limit error for oversized imports', () => {
    const result = validateFlowchartImportFile(
      { name: 'huge.json', size: 6 * 1024 * 1024 } as File,
      'Invalid format'
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected validation failure');
    }
    expect(result.error).toContain('huge.json is too large');
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
