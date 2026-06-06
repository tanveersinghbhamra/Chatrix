import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    CipherGCM,
    DecipherGCM,
} from "crypto";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "hex" as const;

interface EncryptedParts {
    iv: string;
    authTag: string;
    encryptedData: string;
}

let _cachedKey: Buffer | null = null;

const getEncryptionKey = (): Buffer => {
    if (_cachedKey) return _cachedKey;

    // config.encryption.key is already validated at startup
    // — guaranteed to exist and be exactly 32 characters
    // — no need to re-validate here
    _cachedKey = Buffer.from(config.encryption.key, "utf8");
    return _cachedKey;
};

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : "Unknown error";
};

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

export const isEncrypted = (text: string): boolean => {
    if (!text || typeof text !== "string") return false;
    const parts = text.split(":");
    if (parts.length !== 3) return false;
    const [first, second] = parts as [string, string, string];
    return (
        first.length === IV_LENGTH * 2 && second.length === AUTH_TAG_LENGTH * 2
    );
};
