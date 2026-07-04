/**
 * Simple Crypto Service using Web Crypto API
 * Uses AES-GCM for encryption/decryption
 * Protects cloud-synced secrets with a per-user local secret.
 */
import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

const LOCAL_SECRET_PREFIX = 'DiagramView.CryptoSecret.v2';

export class CryptoService {
    private static readonly LEGACY_SALT = new TextEncoder().encode('DiagramView.CryptoSalt.v1');
    private static readonly LOCAL_SECRET_SALT = new TextEncoder().encode('DiagramView.CryptoSalt.v2.local');

    // Cache derived keys in memory to avoid recalculating on every call
    private static keyCache: Map<string, CryptoKey> = new Map();

    private static getSecretStorageKey(userId: string): string {
        return `${LOCAL_SECRET_PREFIX}_${userId}`;
    }

    static clearKeyCache(): void {
        this.keyCache.clear();
    }

    static clearUserSecret(userId: string): void {
        if (!userId) return;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.getSecretStorageKey(userId));
        }
        this.keyCache.delete(`v2:${userId}`);
        this.keyCache.delete(`v1:${userId}`);
    }

    private static getOrCreateLocalSecret(userId: string): string {
        if (!userId) {
            throw new Error("userId is required for encryption");
        }

        const storageKey = this.getSecretStorageKey(userId);
        const existing = localStorage.getItem(storageKey);
        if (existing) return existing;

        const secretBytes = window.crypto.getRandomValues(new Uint8Array(32));
        const secret = this.arrayBufferToBase64(secretBytes);
        localStorage.setItem(storageKey, secret);
        return secret;
    }

    /**
     * Derive an AES-GCM key from a per-user local secret.
     */
    static async deriveKey(userId: string): Promise<CryptoKey> {
        const cacheKey = `v2:${userId}`;
        if (this.keyCache.has(cacheKey)) {
            return this.keyCache.get(cacheKey)!;
        }

        const localSecret = this.getOrCreateLocalSecret(userId);
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(`${userId}:${localSecret}`),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        const key = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: this.LOCAL_SECRET_SALT,
                iterations: 210000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        this.keyCache.set(cacheKey, key);
        return key;
    }

    private static async deriveLegacyKey(userId: string): Promise<CryptoKey> {
        const cacheKey = `v1:${userId}`;
        if (this.keyCache.has(cacheKey)) {
            return this.keyCache.get(cacheKey)!;
        }

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
                salt: this.LEGACY_SALT,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        this.keyCache.set(cacheKey, key);
        return key;
    }

    /**
     * Encrypt text for a specific user.
     * Returns format: "ENC2:iv_b64:ciphertext_b64"
     */
    static async encrypt(text: string, userId: string): Promise<string> {
        if (!text) return text;
        if (text.startsWith('ENC2:')) return text;

        try {
            const key = await this.deriveKey(userId);
            const encoder = new TextEncoder();
            const data = encoder.encode(text);

            // IV must be unique for each encryption
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );

            const ivStr = this.arrayBufferToBase64(iv);
            const dataStr = this.arrayBufferToBase64(encrypted);

            return `ENC2:${ivStr}:${dataStr}`;
        } catch (e) {
            safeLog.error('Encryption failed', redactSensitiveLogValue(e));
            throw new Error('Failed to encrypt data', { cause: e });
        }
    }

    /**
     * Decrypt text deterministically for a specific user
     * Expects format: "ENC2:iv_b64:ciphertext_b64" or legacy "ENC:iv_b64:ciphertext_b64".
     */
    static async decrypt(text: string, userId: string): Promise<string> {
        if (!text || (!text.startsWith('ENC2:') && !text.startsWith('ENC:'))) return text;

        try {
            const parts = text.split(':');
            if (parts.length !== 3) return text;

            const iv = this.base64ToArrayBuffer(parts[1]);
            const data = this.base64ToArrayBuffer(parts[2]);
            const key = parts[0] === 'ENC2' ? await this.deriveKey(userId) : await this.deriveLegacyKey(userId);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                key,
                data
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (e) {
            safeLog.warn(
                'Decryption failed (likely missing local secret, wrong user, or corrupt data)',
                redactSensitiveLogValue(e)
            );
            return '';
        }
    }

    // --- Helpers ---

    private static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    private static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
