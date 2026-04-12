/**
 * Simple Crypto Service using Web Crypto API
 * Uses AES-GCM for encryption/decryption
 * Manages a local key in localStorage
 */

const KEY_STORAGE_NAME = 'DiagramView.CryptoKey';

export class CryptoService {
    // A fixed salt for our application's key derivation
    // Since we want deterministic keys across devices for the same user, 
    // the salt needs to be constant (or derived from something constant).
    private static readonly SALT = new TextEncoder().encode('DiagramView.CryptoSalt.v1');

    // Cache derived keys in memory to avoid recalculating on every call
    private static keyCache: Map<string, CryptoKey> = new Map();

    /**
     * Derive an AES-GCM key from a user-specific password (like userId)
     */
    static async deriveKey(userId: string): Promise<CryptoKey> {
        if (!userId) {
            throw new Error("userId is required for deterministic encryption");
        }

        if (this.keyCache.has(userId)) {
            return this.keyCache.get(userId)!;
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
                salt: this.SALT,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true, // extractable (not strictly necessary but useful for debugging if needed)
            ['encrypt', 'decrypt']
        );

        this.keyCache.set(userId, key);
        return key;
    }

    /**
     * Encrypt text deterministically for a specific user
     * Returns format: "ENC:iv_b64:ciphertext_b64"
     */
    static async encrypt(text: string, userId: string): Promise<string> {
        if (!text) return text;

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

            return `ENC:${ivStr}:${dataStr}`;
        } catch (e) {
            console.error('Encryption failed', e);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt text deterministically for a specific user
     * Expects format: "ENC:iv_b64:ciphertext_b64"
     */
    static async decrypt(text: string, userId: string): Promise<string> {
        if (!text || !text.startsWith('ENC:')) return text;

        try {
            const parts = text.split(':');
            if (parts.length !== 3) return text;

            const iv = this.base64ToArrayBuffer(parts[1]);
            const data = this.base64ToArrayBuffer(parts[2]);
            const key = await this.deriveKey(userId);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                key,
                data
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (e) {
            console.warn('Decryption failed (likely wrong userId, corrupt data, or old random key)', e);
            return text; // Return original if fail, though it will be the ENC string
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
