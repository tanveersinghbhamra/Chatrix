// services/whatsapp.service.ts
//
// Single source of truth for all Meta WhatsApp Cloud API communication
// Every function that sends or receives data from Meta lives here
// Nothing outside this file should call Meta's API directly
//
// Supported operations:
//   Sending:  text, image, video, audio, document, sticker,
//             location, reaction, interactive buttons, interactive list,
//             contact cards, templates
//   Media:    upload, download, get URL
//   Utility:  mark as read, verify webhook signature, get phone details

import axios, { AxiosError } from "axios";
import { createHmac, timingSafeEqual } from "crypto";
import FormData from "form-data";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { LocationData, ReactionData } from "../db/types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const META_API_VERSION = "v21.0" as const;
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Timeout for standard API calls — sending messages, marking as read
const REQUEST_TIMEOUT = 10_000;

// Timeout for media operations — uploads can take longer for large files
const MEDIA_UPLOAD_TIMEOUT = 60_000;
const MEDIA_DOWNLOAD_TIMEOUT = 30_000;

// WhatsApp message size limits — enforced before hitting the API
const TEXT_MAX_LENGTH = 4096;
const CAPTION_MAX_LENGTH = 1024;
const TEMPLATE_MAX_LENGTH = 1024;

// Media size limits in bytes — Meta's hard limits
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; //   5 MB
const VIDEO_MAX_BYTES = 16 * 1024 * 1024; //  16 MB
const AUDIO_MAX_BYTES = 16 * 1024 * 1024; //  16 MB
const DOCUMENT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const STICKER_MAX_BYTES = 100 * 1024; // 100 KB

// Supported MIME types per media category
// Meta rejects anything not in these lists
const SUPPORTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
] as const;

const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/3gpp"] as const;

const SUPPORTED_AUDIO_TYPES = [
    "audio/aac",
    "audio/mp4",
    "audio/mpeg",
    "audio/amr",
    "audio/ogg",
    "audio/opus",
] as const;

const SUPPORTED_DOCUMENT_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "application/zip",
] as const;

const SUPPORTED_STICKER_TYPES = ["image/webp"] as const;

// ─── Meta error codes ─────────────────────────────────────────────────────────

const META_ERROR_CODES: Record<number, string> = {
    130429: "RATE_LIMITED",
    131026: "RECIPIENT_NOT_ON_WHATSAPP",
    131047: "DUPLICATE_MESSAGE",
    131051: "UNSUPPORTED_MESSAGE_TYPE",
    132000: "TEMPLATE_NOT_FOUND",
    132001: "TEMPLATE_PAUSED",
    132007: "TEMPLATE_FORMAT_CHARACTER_POLICY_VIOLATED",
    133004: "SERVER_ERROR",
    133005: "ACCESS_TOKEN_EXPIRED",
    133006: "ACCESS_TOKEN_INVALID",
    133008: "ACCOUNT_LOCKED",
    133009: "USER_NUMBER_CHANGED",
    135000: "GENERIC_USER_ERROR",
};

// ─── Types ────────────────────────────────────────────────────────────────────

// Media can be sent either by URL (Meta downloads it) or by Media ID
// (pre-uploaded to Meta). One of the two must be provided.
type MediaSource =
    | { url: string; mediaId?: never }
    | { mediaId: string; url?: never };

// Shared base for all send functions
interface SendBase {
    accessToken: string;
    phoneNumberId: string;
    to: string;
}

// Result of any send operation
export interface SendMessageResult {
    messageId: string | undefined;
}

// ─── Send param interfaces ────────────────────────────────────────────────────

export interface SendTextMessageParams extends SendBase {
    message: string;
    previewUrl?: boolean;
}

export interface SendImageMessageParams extends SendBase {
    source: MediaSource;
    caption?: string;
}

export interface SendVideoMessageParams extends SendBase {
    source: MediaSource;
    caption?: string;
}

export interface SendAudioMessageParams extends SendBase {
    source: MediaSource;
}

export interface SendDocumentMessageParams extends SendBase {
    source: MediaSource;
    filename?: string;
    caption?: string;
}

export interface SendStickerMessageParams extends SendBase {
    source: MediaSource;
}

export interface SendLocationMessageParams extends SendBase {
    location: LocationData;
}

export interface SendReactionMessageParams extends SendBase {
    reactionData: ReactionData;
}

// Interactive button — max 3 per message, max 20 chars per title
export interface InteractiveButton {
    id: string; // your identifier — returned when customer taps
    title: string; // text shown on the button — max 20 chars
}

export interface SendInteractiveButtonsParams extends SendBase {
    body: string; // message body text
    buttons: InteractiveButton[]; // 1-3 buttons
    header?: string; // optional header text
    footer?: string; // optional footer text
}

// Interactive list row — one item in a list section
export interface InteractiveListRow {
    id: string; // your identifier — returned when customer selects
    title: string; // row title — max 24 chars
    description?: string; // optional description — max 72 chars
}

// Interactive list section — groups rows together
export interface InteractiveListSection {
    title?: string; // section header
    rows: InteractiveListRow[]; // 1+ rows per section
}

export interface SendInteractiveListParams extends SendBase {
    body: string; // message body text
    buttonText: string; // text on the list-open button — max 20 chars
    sections: InteractiveListSection[]; // 1-10 sections
    header?: string;
    footer?: string;
}

// WhatsApp contact card fields
export interface WhatsAppContact {
    name: {
        firstName: string;
        lastName?: string;
        formattedName: string;
    };
    phones?: Array<{
        phone: string;
        type?: "CELL" | "MAIN" | "IPHONE" | "HOME" | "WORK";
        waId?: string;
    }>;
    emails?: Array<{
        email: string;
        type?: "WORK" | "HOME";
    }>;
    organization?: {
        company?: string;
        title?: string;
    };
    urls?: Array<{
        url: string;
        type?: "WORK" | "HOME";
    }>;
}

export interface SendContactMessageParams extends SendBase {
    contacts: WhatsAppContact[];
}

export interface SendTemplateMessageParams extends SendBase {
    templateName: string;
    languageCode?: string;
    components?: unknown[];
}

export interface MarkAsReadParams {
    accessToken: string;
    phoneNumberId: string;
    messageId: string;
}

export interface GetPhoneNumberDetailsParams {
    accessToken: string;
    phoneNumberId: string;
}

export interface PhoneNumberDetails {
    phoneNumber: string;
    displayName: string;
    qualityRating: string;
}

// ─── Media interfaces ─────────────────────────────────────────────────────────

export interface UploadMediaParams {
    accessToken: string;
    phoneNumberId: string;
    file: Buffer;
    mimeType: string;
    filename: string;
}

export interface UploadMediaResult {
    mediaId: string;
}

export interface MediaUrlResult {
    url: string;
    mimeType: string;
    fileSize: number;
    expiresAt: Date; // Meta URLs expire — caller should cache and re-fetch if expired
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class WhatsAppError extends Error {
    public readonly metaErrorCode: number;
    public readonly metaErrorType: string;
    public readonly isRetryable: boolean;

    constructor(message: string, code: number, type: string) {
        super(message);
        this.name = "WhatsAppError";
        this.metaErrorCode = code;
        this.metaErrorType = type;
        // Some errors are worth retrying — rate limits, server errors
        // Others are permanent — recipient not on WhatsApp, token expired
        this.isRetryable = [130429, 133004].includes(code);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// ─── Axios instances ──────────────────────────────────────────────────────────

// Standard instance for message sending and API calls
const metaApi = axios.create({
    baseURL: META_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: { "Content-Type": "application/json" },
});

// Separate instance for media operations — longer timeouts, no default Content-Type
// (media uploads use multipart/form-data, set per-request)
const metaMediaApi = axios.create({
    baseURL: META_BASE_URL,
    timeout: MEDIA_UPLOAD_TIMEOUT,
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
        ...(metaError.fbtrace_id !== undefined && {
            fbTraceId: metaError.fbtrace_id,
        }),
    };
};

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : "Unknown error";

// Normalise phone number — strip leading + for Meta API
const normalizeRecipient = (phone: string): string => phone.replace(/^\+/, "");

// Extract Meta message ID from standard send response
const extractMessageId = (data: unknown): string | undefined => {
    const response = data as { messages?: Array<{ id?: string }> };
    return response.messages?.[0]?.id;
};

// Build the media payload — either link or id, never both
const buildMediaPayload = (
    source: MediaSource,
    caption?: string,
    filename?: string,
): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};

    if (source.url !== undefined) {
        payload["link"] = source.url;
    } else {
        payload["id"] = source.mediaId;
    }

    if (caption !== undefined && caption.length > 0) {
        payload["caption"] = caption;
    }

    if (filename !== undefined && filename.length > 0) {
        payload["filename"] = filename;
    }

    return payload;
};

// ─── Missing internal types ───────────────────────────────────────────────────

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

// ─── SEND: Text ───────────────────────────────────────────────────────────────

export const sendTextMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    message,
    previewUrl = false,
}: SendTextMessageParams): Promise<SendMessageResult> => {
    if (!message || message.trim().length === 0) {
        throw new WhatsAppError(
            "Message body cannot be empty",
            0,
            "INVALID_PARAM",
        );
    }
    if (message.length > TEXT_MAX_LENGTH) {
        throw new WhatsAppError(
            `Message exceeds ${TEXT_MAX_LENGTH} character limit`,
            0,
            "MESSAGE_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "text",
                text: { body: message, preview_url: previewUrl },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
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
        });
        throw new WhatsAppError(
            `Text send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Image ──────────────────────────────────────────────────────────────

export const sendImageMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    source,
    caption,
}: SendImageMessageParams): Promise<SendMessageResult> => {
    if (caption && caption.length > CAPTION_MAX_LENGTH) {
        throw new WhatsAppError(
            `Caption exceeds ${CAPTION_MAX_LENGTH} character limit`,
            0,
            "CAPTION_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "image",
                image: buildMediaPayload(source, caption),
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp image message sent", {
            to: recipient,
            messageId,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp image message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Image send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Video ──────────────────────────────────────────────────────────────

export const sendVideoMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    source,
    caption,
}: SendVideoMessageParams): Promise<SendMessageResult> => {
    if (caption && caption.length > CAPTION_MAX_LENGTH) {
        throw new WhatsAppError(
            `Caption exceeds ${CAPTION_MAX_LENGTH} character limit`,
            0,
            "CAPTION_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "video",
                video: buildMediaPayload(source, caption),
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp video message sent", {
            to: recipient,
            messageId,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp video message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Video send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Audio ──────────────────────────────────────────────────────────────
// Audio messages do not support captions — Meta API rejects them

export const sendAudioMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    source,
}: SendAudioMessageParams): Promise<SendMessageResult> => {
    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "audio",
                audio: buildMediaPayload(source),
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp audio message sent", {
            to: recipient,
            messageId,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp audio message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Audio send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Document ───────────────────────────────────────────────────────────

export const sendDocumentMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    source,
    filename,
    caption,
}: SendDocumentMessageParams): Promise<SendMessageResult> => {
    if (caption && caption.length > CAPTION_MAX_LENGTH) {
        throw new WhatsAppError(
            `Caption exceeds ${CAPTION_MAX_LENGTH} character limit`,
            0,
            "CAPTION_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "document",
                document: buildMediaPayload(source, caption, filename),
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp document message sent", {
            to: recipient,
            messageId,
            filename,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp document message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Document send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Sticker ────────────────────────────────────────────────────────────
// Stickers must be WebP format — static or animated
// Only supported via media ID (not URL) per Meta's documentation

export const sendStickerMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    source,
}: SendStickerMessageParams): Promise<SendMessageResult> => {
    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "sticker",
                sticker: buildMediaPayload(source),
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp sticker message sent", {
            to: recipient,
            messageId,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp sticker message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Sticker send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Location ───────────────────────────────────────────────────────────

export const sendLocationMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    location,
}: SendLocationMessageParams): Promise<SendMessageResult> => {
    // Validate coordinates are within real-world bounds
    if (location.latitude < -90 || location.latitude > 90) {
        throw new WhatsAppError(
            "Latitude must be between -90 and 90",
            0,
            "INVALID_COORDINATES",
        );
    }
    if (location.longitude < -180 || location.longitude > 180) {
        throw new WhatsAppError(
            "Longitude must be between -180 and 180",
            0,
            "INVALID_COORDINATES",
        );
    }

    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "location",
                location: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    // Only include name/address if provided — omitting is cleaner
                    // than sending empty strings
                    ...(location.name && { name: location.name }),
                    ...(location.address && { address: location.address }),
                },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp location message sent", {
            to: recipient,
            messageId,
            latitude: location.latitude,
            longitude: location.longitude,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp location message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Location send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Reaction ───────────────────────────────────────────────────────────
// Reacts to a specific message with an emoji
// To remove a reaction, send empty string as emoji

export const sendReactionMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    reactionData,
}: SendReactionMessageParams): Promise<SendMessageResult> => {
    const recipient = normalizeRecipient(to);

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "reaction",
                reaction: {
                    message_id: reactionData.reacted_to_message_id,
                    emoji: reactionData.emoji,
                },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp reaction sent", {
            to: recipient,
            messageId,
            emoji: reactionData.emoji,
            reactedTo: reactionData.reacted_to_message_id,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp reaction failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Reaction send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Interactive Buttons ────────────────────────────────────────────────
// Max 3 buttons per message
// Button title max 20 characters
// Button ID max 256 characters — returned in webhook when customer taps

export const sendInteractiveButtons = async ({
    accessToken,
    phoneNumberId,
    to,
    body,
    buttons,
    header,
    footer,
}: SendInteractiveButtonsParams): Promise<SendMessageResult> => {
    // Validate button count
    if (buttons.length === 0 || buttons.length > 3) {
        throw new WhatsAppError(
            "Interactive message must have 1-3 buttons",
            0,
            "INVALID_BUTTON_COUNT",
        );
    }

    // Validate button titles
    for (const button of buttons) {
        if (button.title.length > 20) {
            throw new WhatsAppError(
                `Button title "${button.title}" exceeds 20 character limit`,
                0,
                "BUTTON_TITLE_TOO_LONG",
            );
        }
        if (button.id.length > 256) {
            throw new WhatsAppError(
                `Button ID "${button.id}" exceeds 256 character limit`,
                0,
                "BUTTON_ID_TOO_LONG",
            );
        }
        if (!button.id || !button.title) {
            throw new WhatsAppError(
                "Every button must have both id and title",
                0,
                "INVALID_BUTTON",
            );
        }
    }

    // Validate body length
    if (!body || body.length === 0) {
        throw new WhatsAppError(
            "Interactive message body is required",
            0,
            "MISSING_BODY",
        );
    }
    if (body.length > 1024) {
        throw new WhatsAppError(
            "Interactive message body exceeds 1024 character limit",
            0,
            "BODY_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

    // Build interactive payload
    const interactive: Record<string, unknown> = {
        type: "button",
        body: { text: body },
        action: {
            buttons: buttons.map((btn) => ({
                type: "reply",
                reply: {
                    id: btn.id,
                    title: btn.title,
                },
            })),
        },
    };

    // Only include header/footer if provided — omitting undefined fields
    // prevents sending empty objects to Meta which can cause API errors
    if (header && header.length > 0) {
        interactive["header"] = { type: "text", text: header };
    }
    if (footer && footer.length > 0) {
        interactive["footer"] = { text: footer };
    }

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "interactive",
                interactive,
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp interactive buttons sent", {
            to: recipient,
            messageId,
            buttonCount: buttons.length,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp interactive buttons failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Interactive buttons failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Interactive List ───────────────────────────────────────────────────
// A scrollable menu with sections and selectable rows
// Max 10 sections, max 10 rows per section (Meta limit)
// Button text max 20 chars, row title max 24 chars, row description max 72 chars

export const sendInteractiveList = async ({
    accessToken,
    phoneNumberId,
    to,
    body,
    buttonText,
    sections,
    header,
    footer,
}: SendInteractiveListParams): Promise<SendMessageResult> => {
    // Validate sections
    if (sections.length === 0 || sections.length > 10) {
        throw new WhatsAppError(
            "Interactive list must have 1-10 sections",
            0,
            "INVALID_SECTION_COUNT",
        );
    }

    // Validate button text
    if (!buttonText || buttonText.length === 0) {
        throw new WhatsAppError(
            "List button text is required",
            0,
            "MISSING_BUTTON_TEXT",
        );
    }
    if (buttonText.length > 20) {
        throw new WhatsAppError(
            "List button text exceeds 20 character limit",
            0,
            "BUTTON_TEXT_TOO_LONG",
        );
    }

    // Validate body
    if (!body || body.length === 0) {
        throw new WhatsAppError(
            "Interactive list body is required",
            0,
            "MISSING_BODY",
        );
    }

    // Validate all rows across all sections
    let totalRows = 0;
    for (const section of sections) {
        if (section.rows.length === 0) {
            throw new WhatsAppError(
                "Each section must have at least one row",
                0,
                "EMPTY_SECTION",
            );
        }
        if (section.rows.length > 10) {
            throw new WhatsAppError(
                "Each section can have at most 10 rows",
                0,
                "TOO_MANY_ROWS",
            );
        }
        for (const row of section.rows) {
            if (!row.id || !row.title) {
                throw new WhatsAppError(
                    "Every row must have both id and title",
                    0,
                    "INVALID_ROW",
                );
            }
            if (row.title.length > 24) {
                throw new WhatsAppError(
                    `Row title "${row.title}" exceeds 24 character limit`,
                    0,
                    "ROW_TITLE_TOO_LONG",
                );
            }
            if (row.description && row.description.length > 72) {
                throw new WhatsAppError(
                    `Row description exceeds 72 character limit`,
                    0,
                    "ROW_DESCRIPTION_TOO_LONG",
                );
            }
            totalRows++;
        }
    }

    // Meta's global row limit across all sections
    if (totalRows > 10) {
        throw new WhatsAppError(
            `Total rows across all sections cannot exceed 10 (got ${totalRows})`,
            0,
            "TOO_MANY_TOTAL_ROWS",
        );
    }

    const recipient = normalizeRecipient(to);

    const interactive: Record<string, unknown> = {
        type: "list",
        body: { text: body },
        action: {
            button: buttonText,
            sections: sections.map((section) => ({
                ...(section.title && { title: section.title }),
                rows: section.rows.map((row) => ({
                    id: row.id,
                    title: row.title,
                    ...(row.description && { description: row.description }),
                })),
            })),
        },
    };

    if (header && header.length > 0) {
        interactive["header"] = { type: "text", text: header };
    }
    if (footer && footer.length > 0) {
        interactive["footer"] = { text: footer };
    }

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "interactive",
                interactive,
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp interactive list sent", {
            to: recipient,
            messageId,
            sectionCount: sections.length,
            totalRows,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp interactive list failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Interactive list failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Contact Card ───────────────────────────────────────────────────────
// Sends a vCard-style contact to the customer
// Useful for sharing business contacts, agent details, referrals

export const sendContactMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    contacts,
}: SendContactMessageParams): Promise<SendMessageResult> => {
    if (contacts.length === 0) {
        throw new WhatsAppError(
            "At least one contact is required",
            0,
            "NO_CONTACTS",
        );
    }

    const recipient = normalizeRecipient(to);

    // Map to Meta's contact format
    const metaContacts = contacts.map((contact) => ({
        name: {
            first_name: contact.name.firstName,
            last_name: contact.name.lastName,
            formatted_name: contact.name.formattedName,
        },
        ...(contact.phones && {
            phones: contact.phones.map((p) => ({
                phone: p.phone,
                type: p.type ?? "CELL",
                ...(p.waId && { wa_id: p.waId }),
            })),
        }),
        ...(contact.emails && {
            emails: contact.emails.map((e) => ({
                email: e.email,
                type: e.type ?? "WORK",
            })),
        }),
        ...(contact.organization && {
            org: {
                ...(contact.organization.company && {
                    company: contact.organization.company,
                }),
                ...(contact.organization.title && {
                    title: contact.organization.title,
                }),
            },
        }),
        ...(contact.urls && {
            urls: contact.urls.map((u) => ({
                url: u.url,
                type: u.type ?? "WORK",
            })),
        }),
    }));

    try {
        const response = await metaApi.post(
            `/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "contacts",
                contacts: metaContacts,
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
        logger.info("WhatsApp contact message sent", {
            to: recipient,
            messageId,
            contactCount: contacts.length,
        });
        return { messageId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("WhatsApp contact message failed", {
            to: recipient,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Contact send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── SEND: Template ───────────────────────────────────────────────────────────

export const sendTemplateMessage = async ({
    accessToken,
    phoneNumberId,
    to,
    templateName,
    languageCode = "en",
    components = [],
}: SendTemplateMessageParams): Promise<SendMessageResult> => {
    if (!templateName || templateName.trim().length === 0) {
        throw new WhatsAppError(
            "Template name is required",
            0,
            "MISSING_TEMPLATE_NAME",
        );
    }
    if (templateName.length > TEMPLATE_MAX_LENGTH) {
        throw new WhatsAppError(
            `Template name exceeds ${TEMPLATE_MAX_LENGTH} character limit`,
            0,
            "TEMPLATE_NAME_TOO_LONG",
        );
    }

    const recipient = normalizeRecipient(to);

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
                    // Omit components entirely if empty — cleaner than sending []
                    components: components.length > 0 ? components : undefined,
                },
            },
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const messageId = extractMessageId(response.data);
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
        });
        throw new WhatsAppError(
            `Template send failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── UTILITY: Mark as read ────────────────────────────────────────────────────

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
        // Never throw — read receipts are best-effort
        // A failed read receipt must never interrupt message processing
        logger.warn("Failed to mark message as read", {
            messageId,
            error: getErrorMessage(error),
        });
    }
};

// ─── UTILITY: Verify webhook signature ───────────────────────────────────────

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

    try {
        // Strip "sha256=" prefix if present
        const signatureHash = signature.startsWith("sha256=")
            ? signature.slice(7)
            : signature;

        const expectedHash = createHmac("sha256", config.meta.appSecret)
            .update(payload, "utf8")
            .digest("hex");

        const signatureBuffer = Buffer.from(signatureHash, "hex");
        const expectedBuffer = Buffer.from(expectedHash, "hex");

        // Length check required before timingSafeEqual — throws if lengths differ
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

// ─── UTILITY: Get phone number details ────────────────────────────────────────

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
        throw new WhatsAppError(
            `Could not fetch phone number details: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── MEDIA: Upload ────────────────────────────────────────────────────────────
// Uploads a file to Meta's servers and returns a media ID
// Media IDs are reusable for 30 days
// Use this when you want to send the same file to multiple recipients
// without Meta downloading it from your URL each time

export const uploadMedia = async ({
    accessToken,
    phoneNumberId,
    file,
    mimeType,
    filename,
}: UploadMediaParams): Promise<UploadMediaResult> => {
    // Validate file size based on MIME type
    const sizeLimit = getMediaSizeLimit(mimeType);
    if (file.length > sizeLimit) {
        throw new WhatsAppError(
            `File size ${file.length} bytes exceeds ${sizeLimit} byte limit for ${mimeType}`,
            0,
            "FILE_TOO_LARGE",
        );
    }

    // Validate MIME type is supported
    if (!isSupportedMimeType(mimeType)) {
        throw new WhatsAppError(
            `Unsupported MIME type: ${mimeType}`,
            0,
            "UNSUPPORTED_MIME_TYPE",
        );
    }

    const form = new FormData();
    form.append("file", file, { filename, contentType: mimeType });
    form.append("type", mimeType);
    form.append("messaging_product", "whatsapp");

    try {
        const response = await metaMediaApi.post(
            `/${phoneNumberId}/media`,
            form,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    ...form.getHeaders(),
                },
                timeout: MEDIA_UPLOAD_TIMEOUT,
            },
        );

        const mediaId = response.data.id as string;

        logger.info("Media uploaded to Meta", {
            phoneNumberId,
            mediaId,
            mimeType,
            fileSize: file.length,
        });

        return { mediaId };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("Media upload failed", {
            phoneNumberId,
            mimeType,
            fileSize: file.length,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Media upload failed: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── MEDIA: Get URL ───────────────────────────────────────────────────────────
// Retrieves the download URL for a media ID
// Call this when a customer sends you media — you get the media_id in the webhook
// The returned URL expires — do not cache it for more than a few minutes
// Download the file immediately and store it in your own storage if needed

export const getMediaUrl = async (
    accessToken: string,
    mediaId: string,
): Promise<MediaUrlResult> => {
    try {
        const response = await metaApi.get(`/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: MEDIA_DOWNLOAD_TIMEOUT,
        });

        const data = response.data as {
            url: string;
            mime_type: string;
            file_size: number;
        };

        // Meta URLs typically expire after ~5 minutes
        // We set an expiry so callers can check before using a cached URL
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        logger.debug("Media URL retrieved", {
            mediaId,
            mimeType: data.mime_type,
            fileSize: data.file_size,
        });

        return {
            url: data.url,
            mimeType: data.mime_type,
            fileSize: data.file_size,
            expiresAt,
        };
    } catch (error) {
        const parsedError = parseMetaError(error as AxiosError);
        logger.error("Failed to get media URL", {
            mediaId,
            errorCode: parsedError.code,
            errorType: parsedError.type,
        });
        throw new WhatsAppError(
            `Could not retrieve media URL: ${parsedError.type}`,
            parsedError.code,
            parsedError.type,
        );
    }
};

// ─── MEDIA: Download ──────────────────────────────────────────────────────────
// Downloads the actual file bytes from a Meta media URL
// Always call getMediaUrl() first to get the URL, then downloadMedia()
// Meta requires your access token even for the download request

export const downloadMedia = async (
    accessToken: string,
    mediaUrl: string,
): Promise<Buffer> => {
    try {
        const response = await axios.get(mediaUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                // Required — Meta rejects download requests without User-Agent
                "User-Agent": "Chatrix/1.0",
            },
            responseType: "arraybuffer",
            timeout: MEDIA_DOWNLOAD_TIMEOUT,
        });

        const buffer = Buffer.from(response.data as ArrayBuffer);

        logger.debug("Media downloaded", {
            url: mediaUrl.slice(0, 50), // truncate — URLs are long
            sizeBytes: buffer.length,
        });

        return buffer;
    } catch (error) {
        logger.error("Media download failed", {
            url: mediaUrl.slice(0, 50),
            error: getErrorMessage(error),
        });
        throw new WhatsAppError(
            "Failed to download media file",
            0,
            "MEDIA_DOWNLOAD_FAILED",
        );
    }
};

// ─── MEDIA: Helpers ───────────────────────────────────────────────────────────

// Returns the size limit in bytes for a given MIME type
const getMediaSizeLimit = (mimeType: string): number => {
    if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
        return IMAGE_MAX_BYTES;
    }
    if ((SUPPORTED_VIDEO_TYPES as readonly string[]).includes(mimeType)) {
        return VIDEO_MAX_BYTES;
    }
    if ((SUPPORTED_AUDIO_TYPES as readonly string[]).includes(mimeType)) {
        return AUDIO_MAX_BYTES;
    }
    if ((SUPPORTED_STICKER_TYPES as readonly string[]).includes(mimeType)) {
        return STICKER_MAX_BYTES;
    }
    // Default to document limit for any other supported type
    return DOCUMENT_MAX_BYTES;
};

// Returns true if the MIME type is in any of the supported lists
const isSupportedMimeType = (mimeType: string): boolean => {
    return (
        (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_VIDEO_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_AUDIO_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_STICKER_TYPES as readonly string[]).includes(mimeType)
    );
};

// ─── Exports: Type guards ─────────────────────────────────────────────────────
// Useful in Session 2 webhook handler and Session 5 message processor
// to identify what kind of message arrived

export const isMediaMessage = (
    messageType: string,
): messageType is "image" | "video" | "audio" | "document" | "sticker" => {
    return ["image", "video", "audio", "document", "sticker"].includes(
        messageType,
    );
};

export const isInteractiveMessage = (
    messageType: string,
): messageType is "interactive" => {
    return messageType === "interactive";
};

export const isLocationMessage = (
    messageType: string,
): messageType is "location" => {
    return messageType === "location";
};

export const isReactionMessage = (
    messageType: string,
): messageType is "reaction" => {
    return messageType === "reaction";
};

// Re-export supported MIME type constants so other modules
// can use them without importing from this file's internals
export const SUPPORTED_MIME_TYPES = {
    image: SUPPORTED_IMAGE_TYPES,
    video: SUPPORTED_VIDEO_TYPES,
    audio: SUPPORTED_AUDIO_TYPES,
    document: SUPPORTED_DOCUMENT_TYPES,
    sticker: SUPPORTED_STICKER_TYPES,
} as const;

export const MEDIA_SIZE_LIMITS = {
    image: IMAGE_MAX_BYTES,
    video: VIDEO_MAX_BYTES,
    audio: AUDIO_MAX_BYTES,
    document: DOCUMENT_MAX_BYTES,
    sticker: STICKER_MAX_BYTES,
} as const;
