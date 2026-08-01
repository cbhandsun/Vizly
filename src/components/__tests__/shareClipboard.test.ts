import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggingMocks = vi.hoisted(() => ({
  clipboardFailure: vi.fn(),
}));

vi.mock('../shareDialogLogging', () => ({
  logShareDialogClipboardFailure: loggingMocks.clipboardFailure,
}));

import { isSafeShareUrl, tryCopyShareUrl } from '../shareClipboard';

describe('share clipboard boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts bounded HTTP(S) URLs and rejects empty, unsafe, and oversized inputs', () => {
    expect(isSafeShareUrl('https://vizly.example/#/shared?token=abc')).toBe(true);
    expect(isSafeShareUrl('http://127.0.0.1:4173/#/shared?token=abc')).toBe(true);
    expect(isSafeShareUrl('')).toBe(false);
    expect(isSafeShareUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeShareUrl(`https://vizly.example/${'a'.repeat(4096)}`)).toBe(false);
    expect(isSafeShareUrl(null)).toBe(false);
  });

  it('copies a safe share URL when the browser clipboard is available', async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };

    await expect(tryCopyShareUrl('https://vizly.example/#/shared?token=abc', clipboard)).resolves.toBe(true);

    expect(clipboard.writeText).toHaveBeenCalledWith('https://vizly.example/#/shared?token=abc');
    expect(loggingMocks.clipboardFailure).not.toHaveBeenCalled();
  });

  it('returns false without touching the clipboard for invalid input or missing capability', async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };

    await expect(tryCopyShareUrl('javascript:alert(1)', clipboard)).resolves.toBe(false);
    await expect(tryCopyShareUrl('https://vizly.example/share', undefined)).resolves.toBe(false);

    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('returns false and safely logs clipboard rejection without logging the URL', async () => {
    const failure = new Error('NotAllowedError');
    const clipboard = { writeText: vi.fn(async () => { throw failure; }) };

    await expect(tryCopyShareUrl('https://vizly.example/#/shared?token=secret-token', clipboard)).resolves.toBe(false);

    expect(loggingMocks.clipboardFailure).toHaveBeenCalledWith(failure);
    expect(JSON.stringify(loggingMocks.clipboardFailure.mock.calls)).not.toContain('secret-token');
  });
});
