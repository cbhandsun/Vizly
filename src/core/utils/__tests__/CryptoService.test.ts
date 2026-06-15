import { afterEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '../CryptoService';

describe('CryptoService', () => {
  afterEach(() => {
    CryptoService.clearKeyCache();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('encrypts secrets with the ENC2 format and decrypts them for the same user', async () => {
    const encrypted = await CryptoService.encrypt('sk-test-secret', 'user-1');

    expect(encrypted).toMatch(/^ENC2:/);
    expect(encrypted.startsWith('ENC2:') || encrypted.startsWith('ENC:')).toBe(true);
    await expect(CryptoService.decrypt(encrypted, 'user-1')).resolves.toBe('sk-test-secret');
    expect(encrypted).not.toContain('sk-test-secret');
  });

  it('does not decrypt ENC2 secrets with only the same public user id after local secret loss', async () => {
    const encrypted = await CryptoService.encrypt('sk-test-secret', 'user-1');
    CryptoService.clearKeyCache();
    localStorage.clear();

    await expect(CryptoService.decrypt(encrypted, 'user-1')).resolves.toBe('');
  });

  it('clears one user local secret and prevents decrypting that user cloud secret', async () => {
    const encrypted = await CryptoService.encrypt('sk-test-secret', 'user-1');

    CryptoService.clearUserSecret('user-1');

    await expect(CryptoService.decrypt(encrypted, 'user-1')).resolves.toBe('');
  });

  it('does not remove another user local secret when clearing one user', async () => {
    const userOneEncrypted = await CryptoService.encrypt('user-one-secret', 'user-1');
    const userTwoEncrypted = await CryptoService.encrypt('user-two-secret', 'user-2');

    CryptoService.clearUserSecret('user-1');

    await expect(CryptoService.decrypt(userOneEncrypted, 'user-1')).resolves.toBe('');
    await expect(CryptoService.decrypt(userTwoEncrypted, 'user-2')).resolves.toBe('user-two-secret');
  });

  it('can still decrypt legacy ENC payloads for migration compatibility', async () => {
    const legacyEncrypted = await createLegacyEncryptedPayload('legacy-secret', 'user-1');

    await expect(CryptoService.decrypt(legacyEncrypted, 'user-1')).resolves.toBe('legacy-secret');
  });
});

const createLegacyEncryptedPayload = async (text: string, userId: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('DiagramView.CryptoSalt.v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(text)
  );

  return `ENC:${toBase64(iv)}:${toBase64(encrypted)}`;
};

const toBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};
