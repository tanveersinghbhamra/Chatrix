// Encrypts and decrypts sensitive data using AES-256-GCM
// Used for: WhatsApp access tokens stored in database
//
// Storage format: iv:authTag:encryptedData (colon separated, hex encoded)

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    CipherGCM,
    DecipherGCM,
} from "crypto";
import { logger } from "../utils/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "hex" as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface EncryptedParts {
    iv: string;
    authTag: string;
    encryptedData: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────
// Cache key as module-level constant — validated once at startup
// Avoids reading and validating process.env on every encrypt/decrypt call
// Module loads once — this runs once — key is ready instantly after that
let _cachedKey: Buffer | null = null;

const getEncryptionKey = (): Buffer => {
    if (_cachedKey) return _cachedKey;

    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
        throw new Error("ENCRYPTION_KEY environment variable is not set");
    }

    if (key.length !== 32) {
        throw new Error(
            `ENCRYPTION_KEY must be exactly 32 characters. Current length: ${key.length}`,
        );
    }

    _cachedKey = Buffer.from(key, "utf8");
    return _cachedKey;
};

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : "Unknown error";
};

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Encrypts a plain text string using AES-256-GCM
 *
 * @param plainText - The text to encrypt (e.g. WhatsApp access token)
 * @returns Encrypted string in format: iv:authTag:encryptedData
 * @throws Error if encryption fails or input is invalid
 */
export const encrypt = (plainText: string): string => {
    if (!plainText || typeof plainText !== "string") {
        throw new Error("encrypt() requires a non-empty string");
    }

    try {
        const key = getEncryptionKey();
        const iv = randomBytes(IV_LENGTH);

        const cipher: CipherGCM = createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([
            cipher.update(plainText, "utf8"),
            cipher.final(),
        ]);

        const authTag = cipher.getAuthTag();

        const parts: EncryptedParts = {
            iv: iv.toString(ENCODING),
            authTag: authTag.toString(ENCODING),
            encryptedData: encrypted.toString(ENCODING),
        };

        return [parts.iv, parts.authTag, parts.encryptedData].join(":");
    } catch (error) {
        logger.error("Encryption failed", { error: getErrorMessage(error) });
        throw new Error("Encryption failed");
    }
};

/**
 * Decrypts an encrypted string back to plain text
 *
 * @param encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns Original plain text
 * @throws Error if decryption fails, data is tampered, or format is invalid
 */
export const decrypt = (encryptedText: string): string => {
    if (!encryptedText || typeof encryptedText !== "string") {
        throw new Error("decrypt() requires a non-empty string");
    }

    try {
        const key = getEncryptionKey();

        const parts = encryptedText.split(":");
        if (parts.length !== 3) {
            throw new Error("Invalid encrypted data format");
        }

        const [ivHex, authTagHex, encryptedHex] = parts as [
            string,
            string,
            string,
        ];

        const iv = Buffer.from(ivHex, ENCODING);
        const authTag = Buffer.from(authTagHex, ENCODING);
        const encrypted = Buffer.from(encryptedHex, ENCODING);

        if (iv.length !== IV_LENGTH) {
            throw new Error("Invalid IV length");
        }
        if (authTag.length !== AUTH_TAG_LENGTH) {
            throw new Error("Invalid auth tag length");
        }

        const decipher: DecipherGCM = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);

        return decrypted.toString("utf8");
    } catch (error) {
        logger.error("Decryption failed", { error: getErrorMessage(error) });
        throw new Error("Decryption failed");
    }
};

/**
 * Checks if a string is already encrypted
 * Useful to avoid double-encrypting a value
 *
 * @param text - String to check
 * @returns True if string matches encrypted format
 */
export const isEncrypted = (text: string): boolean => {
    if (!text || typeof text !== "string") return false;
    const parts = text.split(":");
    return (
        parts.length === 3 &&
        parts[0].length === IV_LENGTH * 2 &&
        parts[1].length === AUTH_TAG_LENGTH * 2
    );
};
