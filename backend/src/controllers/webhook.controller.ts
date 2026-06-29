// controllers/webhook.controller.ts
//
// Two responsibilities:
//   GET  /webhook — Meta verification handshake (one-time setup)
//   POST /webhook — Receive inbound WhatsApp messages + status updates
//
// POST flow (strict ordering — each step is a gate):
//   1. Signature verification   — reject invalid requests before touching body
//   2. Parse payload            — extract entries from Meta's envelope structure
//   3. Return 200 immediately   — Meta retries if we take > 20s
//   4. Idempotency check        — skip already-processed events (webhook_events table)
//   5. Resolve tenant           — find tenant by wa_account_id
//   6. Check tenant active      — skip suspended/cancelled tenants
//   7. Check plan limits        — skip if at conversation cap
//   8. Enqueue Bull job         — actual processing async in message.processor.ts

import type { Request, Response } from "express";
import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import {
    verifyWebhookSignature,
    isMediaMessage,
} from "../services/whatsapp.service.js";
import { enqueueMessage } from "../services/queue.service.js";
import type { MessageJobData } from "../services/queue.service.js";
import { sanitizePhone } from "../utils/helpers.js";
import type { MessageType } from "../db/types.js";

// ─── Meta payload shapes ──────────────────────────────────────────────────────
// Meta sends a deeply nested structure. These types make it navigable safely.

interface MetaWebhookPayload {
    object: string; // always "whatsapp_business_account"
    entry: MetaEntry[];
}

interface MetaEntry {
    id: string; // wa_account_id (WABA ID)
    changes: MetaChange[];
}

interface MetaChange {
    value: MetaChangeValue;
    field: string; // usually "messages"
}

interface MetaChangeValue {
    messaging_product: string; // "whatsapp"
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    contacts?: MetaContact[];
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
}

interface MetaContact {
    profile: { name: string };
    wa_id: string; // phone number without +
}

interface MetaMessage {
    id: string; // message ID — our idempotency key
    from: string; // sender phone without +
    timestamp: string; // Unix timestamp as string
    type: string; // text | image | audio | video | document | location | sticker | reaction | interactive | unsupported
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    video?: { id: string; mime_type: string; caption?: string };
    audio?: { id: string; mime_type: string };
    document?: {
        id: string;
        mime_type: string;
        caption?: string;
        filename?: string;
    };
    sticker?: { id: string; mime_type: string };
    location?: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
    };
    reaction?: {
        message_id: string;
        emoji: string;
    };
    interactive?: {
        type: "button_reply" | "list_reply";
        button_reply?: { id: string; title: string };
        list_reply?: { id: string; title: string; description?: string };
    };
}

interface MetaStatus {
    id: string; // message ID
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code: number; title: string }>;
}

// ─── GET /webhook — Meta verification handshake ───────────────────────────────
// Meta calls this once during WhatsApp setup to verify we own the webhook URL.
// Must echo hub.challenge if hub.verify_token matches our configured token.

export const verifyWebhook = (req: Request, res: Response): void => {
    const mode = req.query["hub.mode"] as string | undefined;
    const token = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    if (mode === "subscribe" && token === config.meta.verifyToken) {
        // Guard: challenge must be present — Meta always sends it, but if it's
        // missing (malformed request), sending undefined would make Meta reject
        // our verification response.
        if (!challenge) {
            logger.warn("Meta webhook verification missing hub.challenge");
            res.status(400).json({ error: "Missing hub.challenge" });
            return;
        }
        logger.info("Meta webhook verification successful");
        res.status(200).send(challenge);
        return;
    }

    logger.warn("Meta webhook verification failed", {
        mode,
        tokenMatch: token === config.meta.verifyToken,
    });
    res.status(403).json({ error: "Verification failed" });
};

// ─── POST /webhook — Receive inbound messages ─────────────────────────────────

export const receiveWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    // ── Step 1: Verify HMAC-SHA256 signature ──────────────────────────────────
    // Body is raw Buffer (express.raw() is set up in app.ts for /webhook).
    // Must verify BEFORE parsing — raw bytes required for signature check.
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!signature) {
        logger.warn("Webhook received without signature", {
            requestId: req.id,
        });
        res.status(401).json({ error: "Missing signature" });
        return;
    }

    // Guard: express.raw() only runs for 'application/json' content-type.
    // If body is missing or not a Buffer, something is wrong with the request.
    // Casting directly without checking would cause a silent crash on .toString().
    if (!Buffer.isBuffer(req.body)) {
        logger.warn(
            "Webhook body is not a Buffer — wrong content-type or empty body",
            {
                requestId: req.id,
                contentType: req.headers["content-type"],
            },
        );
        res.status(400).json({ error: "Invalid request body" });
        return;
    }

    const rawBody: Buffer = req.body;
    const rawBodyString = rawBody.toString("utf-8");

    if (!verifyWebhookSignature(rawBodyString, signature)) {
        logger.warn("Webhook signature verification failed", {
            requestId: req.id,
        });
        res.status(401).json({ error: "Invalid signature" });
        return;
    }

    // ── Step 2: Parse payload ────────────────────────────────────────────────
    let payload: MetaWebhookPayload;
    try {
        payload = JSON.parse(rawBodyString) as MetaWebhookPayload;
    } catch {
        logger.warn("Webhook payload is not valid JSON", { requestId: req.id });
        res.status(400).json({ error: "Invalid payload" });
        return;
    }

    // Validate it's a WhatsApp webhook
    if (payload.object !== "whatsapp_business_account") {
        res.status(400).json({ error: "Not a WhatsApp webhook" });
        return;
    }

    // ── Step 3: Return 200 immediately ───────────────────────────────────────
    // Meta retries if we take > 20s. Everything after this is fire-and-forget.
    // The async block below must NEVER throw — wrap it entirely so an unhandled
    // rejection from a malformed payload doesn't crash the Node process.
    res.status(200).send("OK");

    // ── Step 4+: Async processing ─────────────────────────────────────────────
    // Wrapped in try/catch: after res.send() we are outside Express's error handler.
    // Any uncaught throw here becomes an unhandledRejection → process crash.
    try {
        for (const entry of payload.entry) {
            const waAccountId = entry.id;

            // Guard: Meta has sent malformed payloads with missing changes during incidents
            if (!Array.isArray(entry.changes)) continue;

            for (const change of entry.changes) {
                if (change.field !== "messages") continue;

                const value = change.value;

                // ── Inbound messages ─────────────────────────────────────────
                // Use Promise.allSettled — not Promise.all — so one failed message
                // doesn't cancel processing of the others in the same batch.
                // Meta batches multiple messages in one webhook during catch-up
                // after downtime. Sequential awaiting would be unnecessarily slow.
                if (value.messages && value.messages.length > 0) {
                    const messagePromises = value.messages.map((message) =>
                        handleInboundMessage({
                            waAccountId,
                            message,
                            contacts: value.contacts ?? [],
                            requestId: req.id,
                        }).catch((error: unknown) => {
                            logger.error("Failed to handle inbound message", {
                                requestId: req.id,
                                messageId: message.id,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            });
                        }),
                    );
                    await Promise.allSettled(messagePromises);
                }

                // ── Status updates ───────────────────────────────────────────
                // Same pattern — process concurrently, log individual failures.
                if (value.statuses && value.statuses.length > 0) {
                    const statusPromises = value.statuses.map((status) =>
                        handleStatusUpdate(status).catch((error: unknown) => {
                            logger.error("Failed to handle status update", {
                                requestId: req.id,
                                messageId: status.id,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            });
                        }),
                    );
                    await Promise.allSettled(statusPromises);
                }
            }
        }
    } catch (error: unknown) {
        // Outer catch: protects against malformed payload structure (null entry,
        // missing fields, etc). Individual message errors are caught above —
        // this only fires for structural problems with the Meta envelope itself.
        logger.error("Unexpected error processing webhook payload", {
            requestId: req.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

// ─── Handle a single inbound message ─────────────────────────────────────────

interface HandleInboundParams {
    waAccountId: string;
    message: MetaMessage;
    contacts: MetaContact[];
    requestId: string;
}

const handleInboundMessage = async ({
    waAccountId,
    message,
    contacts,
    requestId,
}: HandleInboundParams): Promise<void> => {
    const messageId = message.id;

    // ── Step 4: Idempotency check — atomic INSERT ON CONFLICT ───────────────
    // Meta delivers the same webhook multiple times — during outages, milliseconds
    // apart. A SELECT-then-INSERT has a race condition: two concurrent requests
    // both pass the SELECT, both try to INSERT, one hits the UNIQUE(event_id)
    // constraint and crashes.
    //
    // Solution: single atomic INSERT ... ON CONFLICT (event_id) DO NOTHING.
    // Check numInsertedOrUpdatedRows — if 0, another request claimed this event
    // first. We skip. No race condition possible.
    //
    // tenant_id starts null — we don't know it yet. Updated once resolved below.
    const insertResult = await db
        .insertInto("webhook_events")
        .values({
            tenant_id: null,
            event_id: messageId,
            event_type: "message",
            payload: JSON.stringify(message),
            processed: false,
        })
        .onConflict((oc) => oc.column("event_id").doNothing())
        .executeTakeFirst();

    if (insertResult.numInsertedOrUpdatedRows === BigInt(0)) {
        logger.info("Webhook event already seen — skipping duplicate", {
            requestId,
            messageId,
        });
        return;
    }

    // ── Step 5: Resolve tenant from wa_account_id ────────────────────────────
    const tenant = await db
        .selectFrom("tenants")
        .select(["id", "plan_status", "conversations_used"])
        .where("wa_account_id", "=", waAccountId)
        .executeTakeFirst();

    if (!tenant) {
        logger.warn("No tenant found for wa_account_id — ignoring message", {
            requestId,
            messageId,
            waAccountId,
        });
        return;
    }

    // Update webhook_events with resolved tenant_id
    await db
        .updateTable("webhook_events")
        .set({ tenant_id: tenant.id })
        .where("event_id", "=", messageId)
        .execute();

    // ── Step 6: Check tenant is active ──────────────────────────────────────
    const activeStatuses: Array<typeof tenant.plan_status> = [
        "trial",
        "active",
    ];
    if (!activeStatuses.includes(tenant.plan_status)) {
        logger.info("Tenant is not active — ignoring message", {
            requestId,
            messageId,
            tenantId: tenant.id,
            planStatus: tenant.plan_status,
        });
        return;
    }

    // ── Step 7: Check plan conversation limit ────────────────────────────────
    // Fetch the limit for this tenant's plan from plan_limits
    const planLimit = await db
        .selectFrom("tenants")
        .innerJoin("plan_limits", "plan_limits.plan", "tenants.plan")
        .select(["plan_limits.conversations_limit"])
        .where("tenants.id", "=", tenant.id)
        .executeTakeFirst();

    if (
        planLimit &&
        tenant.conversations_used >= planLimit.conversations_limit
    ) {
        logger.info(
            "Tenant has reached conversation limit — ignoring message",
            {
                requestId,
                messageId,
                tenantId: tenant.id,
                used: tenant.conversations_used,
                limit: planLimit.conversations_limit,
            },
        );
        return;
    }

    // ── Step 8: Normalize phone and build job data ────────────────────────────
    const contactPhone = sanitizePhone(message.from);

    // Find contact name from the contacts array Meta includes
    const metaContact = contacts.find(
        (c) => sanitizePhone(c.wa_id) === contactPhone,
    );
    const contactName = metaContact?.profile.name ?? null;

    // Determine message type — map Meta's type to our MessageType enum
    const rawType = message.type;
    const messageType = mapMessageType(rawType);

    // Extract type-specific fields
    const jobData: MessageJobData = {
        messageId,
        tenantId: tenant.id,
        contactPhone,
        contactName,
        messageType,
        messageBody: extractBody(message),
        timestamp: parseInt(message.timestamp, 10),
        // Media
        mediaId: extractMediaId(message),
        mediaMimeType: extractMimeType(message),
        mediaCaption: extractCaption(message),
        mediaFilename: message.document?.filename ?? null,
        // Location
        locationLatitude: message.location?.latitude ?? null,
        locationLongitude: message.location?.longitude ?? null,
        locationName: message.location?.name ?? null,
        locationAddress: message.location?.address ?? null,
        // Reaction
        reactionEmoji: message.reaction?.emoji ?? null,
        reactionTargetMessageId: message.reaction?.message_id ?? null,
    };

    // ── Enqueue Bull job ──────────────────────────────────────────────────────
    // jobId = messageId is the second dedup layer (first is webhook_events above)
    await enqueueMessage(jobData);

    logger.info("Inbound message queued for processing", {
        requestId,
        messageId,
        tenantId: tenant.id,
        contactPhone,
        messageType,
    });
};

// ─── Handle status update (delivered, read, failed) ───────────────────────────
// Update the message status in our DB so the dashboard shows delivery info.
//
// Strategy: look up the message by wa_message_id first.
// This gives us tenant_id directly from the row — no separate tenant lookup needed.
// It also confirms the message exists in our DB before attempting any update.
// One query total instead of two (tenant lookup → message update).
//
// Status updates come in constantly (sent → delivered → read per outbound message).
// Eliminating the extra tenant query here matters at scale.

const handleStatusUpdate = async (status: MetaStatus): Promise<void> => {
    // Map Meta status to our MessageStatus enum
    const statusMap: Record<string, string> = {
        sent: "sent",
        delivered: "delivered",
        read: "read",
        failed: "failed",
    };

    const mappedStatus = statusMap[status.status];
    if (!mappedStatus) return;

    // Look up the message — gives us tenant_id and confirms it exists in our DB.
    // If not found: status update is for a message we didn't send (e.g. sent before
    // Chatrix was connected, or from another platform). Skip silently.
    const existingMessage = await db
        .selectFrom("messages")
        .select(["id", "tenant_id"])
        .where("wa_message_id", "=", status.id)
        .executeTakeFirst();

    if (!existingMessage) return;

    await db
        .updateTable("messages")
        .set({
            status: mappedStatus as "sent" | "delivered" | "read" | "failed",
        })
        .where("id", "=", existingMessage.id)
        .execute();

    if (status.status === "failed" && status.errors) {
        logger.warn("WhatsApp message delivery failed", {
            tenantId: existingMessage.tenant_id,
            messageId: status.id,
            errors: status.errors,
        });
    }
};

// ─── Extraction helpers ───────────────────────────────────────────────────────
// Pull fields from Meta's union-typed message object safely.

const mapMessageType = (rawType: string): MessageType => {
    const valid: MessageType[] = [
        "text",
        "image",
        "audio",
        "video",
        "document",
        "location",
        "sticker",
        "reaction",
        "interactive",
    ];
    return (
        valid.includes(rawType as MessageType) ? rawType : "unsupported"
    ) as MessageType;
};

const extractBody = (msg: MetaMessage): string => {
    if (msg.text?.body) return msg.text.body;
    // Interactive: extract the selected option's title as the "body"
    if (msg.interactive?.button_reply)
        return msg.interactive.button_reply.title;
    if (msg.interactive?.list_reply) return msg.interactive.list_reply.title;
    // Media: use caption if present, otherwise empty string (DB constraint: NOT NULL)
    if (isMediaMessage(msg.type)) {
        return extractCaption(msg) ?? "";
    }
    return "";
};

const extractMediaId = (msg: MetaMessage): string | null => {
    if (!isMediaMessage(msg.type)) return null;
    return (
        msg.image?.id ??
        msg.video?.id ??
        msg.audio?.id ??
        msg.document?.id ??
        msg.sticker?.id ??
        null
    );
};

const extractMimeType = (msg: MetaMessage): string | null => {
    if (!isMediaMessage(msg.type)) return null;
    return (
        msg.image?.mime_type ??
        msg.video?.mime_type ??
        msg.audio?.mime_type ??
        msg.document?.mime_type ??
        msg.sticker?.mime_type ??
        null
    );
};

const extractCaption = (msg: MetaMessage): string | null => {
    // audio and sticker do not support captions — Meta API rejects them
    return (
        msg.image?.caption ??
        msg.video?.caption ??
        msg.document?.caption ??
        null
    );
};
