// Handles all communication with Meta WhatsApp Business Cloud API

import axios, { AxiosError } from "axios";
import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "../utils/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const META_API_VERSION = "v21.0" as const;
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const REQUEST_TIMEOUT = 10000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetaErrorResponse {
    code: number;
    message: string;
    fbtrace_id?: string;
}

interface MetaApiError {
    code: number;
    message: string;
    type: string;
    fbTraceId?: string;
}

interface SendTextMessageParams {
    accessToken: string;
    phoneNumberId: string;
    to: string;
    message: string;
}

interface SendTemplateMessageParams {
    accessToken: string;
    phoneNumberId: string;
    to: string;
    templateName: string;
    languageCode?: string;
    components?: unknown[];
}

interface MarkAsReadParams {
    accessToken: string;
    phoneNumberId: string;
    messageId: string;
}

interface GetPhoneNumberDetailsParams {
    accessToken: string;
    phoneNumberId: string;
}

interface SendMessageResult {
    messageId: string | undefined;
}

interface PhoneNumberDetails {
    phoneNumber: string;
    displayName: string;
    qualityRating: string;
}

// Custom error class for Meta API errors
// Extends Error properly so TypeScript knows about extra properties
export class WhatsAppError extends Error {
    public metaErrorCode: number;
    public metaErrorType: string;

    constructor(message: string, code: number, type: string) {
        super(message);
        this.name = "WhatsAppError";
        this.metaErrorCode = code;
        this.metaErrorType = type;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// ─── Meta API error codes ─────────────────────────────────────────────────────
const META_ERROR_CODES: Record<number, string> = {
    131026: "RECIPIENT_NOT_ON_WHATSAPP",
    131047: "DUPLICATE_MESSAGE",
    130429: "RATE_LIMITED",
    131051: "UNSUPPORTED_MESSAGE_TYPE",
    132000: "TEMPLATE_NOT_FOUND",
    132001: "TEMPLATE_PAUSED",
    133004: "SERVER_ERROR",
    133005: "ACCESS_TOKEN_EXPIRED",
};

// ─── Axios instance ───────────────────────────────────────────────────────────
const metaApi = axios.create({
    baseURL: META_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: { "Content-Type": "application/json" },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseMetaError = (error: AxiosError): MetaApiError => {
    const data = error.response?.data as
        | { error?: MetaErrorResponse }
        | undefined;
    const metaError = data?.error;

    if (!metaError) {
        return {
            code: 0,
            message: error.message,
            type: "UNKNOWN",
        };
    }

    return {
        code: metaError.code,
        message: metaError.message,
        type: META_ERROR_CODES[metaError.code] ?? "UNKNOWN_META_ERROR",
        fbTraceId: metaError.fbtrace_id,
    };
};

const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : "Unknown error";
};

// ─── Send text message ────────────────────────────────────────────────────────
export const sendTextMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    message,
}: SendTextMessageParams): Promise<SendMessageResult> => {
    if (message.length > 4096) {
        throw new Error("Message exceeds WhatsApp 4096 character limit");
    }

    const recipient = to.replace(/^\+/, "");

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "text",
                text: { body: message, preview_url: false },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = response.data.messages?.[0]?.id as string | undefined;

        logger.info("WhatsApp text message sent", {
            to: recipient,
            messageId,
            phoneNumberId,
        });

        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);

        logger.error("WhatsApp text message failed", {
            to: recipient,
            phoneNumberId,
            errorCode: parsedError.code,
            errorType: parsedError.type,
            errorMessage: parsedError.message,
            fbTraceId: parsedError.fbTraceId,
        });

        throw new WhatsAppError(
            `WhatsApp send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── Send template message ────────────────────────────────────────────────────
export const sendTemplateMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    templateName,
    languageCode = "en",
    components = [],
}: SendTemplateMessageParams): Promise<SendMessageResult> => {
    const recipient = to.replace(/^\+/, "");

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: components.length > 0 ? components : undefined,
                },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = response.data.messages?.[0]?.id as string | undefined;

        logger.info("WhatsApp template message sent", {
            to: recipient,
            templateName,
            messageId,
        });

        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);

        logger.error("WhatsApp template message failed", {
            to: recipient,
            templateName,
            errorCode: parsedError.code,
            errorType: parsedError.type,
            errorMessage: parsedError.message,
        });

        throw new WhatsAppError(
            `Template send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── Mark message as read ─────────────────────────────────────────────────────
export const markAsRead = async ({
    accessToken,
    phoneNumberId,
    messageId,
}: MarkAsReadParams): Promise<void> => {
    try {
        await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId,
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        logger.debug("Message marked as read", { messageId });
    } catch (error) {
        // Don't throw — read receipts failing shouldn't break message processing
        logger.warn("Failed to mark message as read", {
            messageId,
            error: getErrorMessage(error),
        });
    }
};

// ─── Verify webhook signature ─────────────────────────────────────────────────
export const verifyWebhookSignature = (
    payload: string,
    signature: string,
): boolean => {
    if (!payload || !signature) {
        logger.warn(
            "Webhook verification failed: missing payload or signature",
        );
        return false;
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
        logger.error("META_APP_SECRET not set — cannot verify webhooks");
        return false;
    }

    try {
        const signatureHash = signature.startsWith("sha256=")
            ? signature.slice(7)
            : signature;

        const expectedHash = createHmac("sha256", appSecret)
            .update(payload, "utf8")
            .digest("hex");

        const signatureBuffer = Buffer.from(signatureHash, "hex");
        const expectedBuffer = Buffer.from(expectedHash, "hex");

        if (signatureBuffer.length !== expectedBuffer.length) {
            logger.warn(
                "Webhook signature length mismatch — possible tampering",
            );
            return false;
        }

        const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

        if (!isValid) {
            logger.warn("Webhook signature verification failed — rejected");
        }

        return isValid;
    } catch (error) {
        logger.error("Webhook signature verification error", {
            error: getErrorMessage(error),
        });
        return false;
    }
};

// ─── Get phone number details ─────────────────────────────────────────────────
export const getPhoneNumberDetails = async ({
    accessToken,
    phoneNumberId,
}: GetPhoneNumberDetailsParams): Promise<PhoneNumberDetails> => {
    try {
        const response = await metaApi.get(`/${phoneNumberId}`, {
            params: {
                fields: "display_phone_number,verified_name,quality_rating",
            },
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        return {
            phoneNumber: response.data.display_phone_number as string,
            displayName: response.data.verified_name as string,
            qualityRating: response.data.quality_rating as string,
        };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("Failed to get phone number details", {
            phoneNumberId,
            errorType: parsedError.type,
        });
        throw new Error(
            `Could not fetch phone number details: ${parsedError.type}`,
        );
    }
};
