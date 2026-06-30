// services/claude.service.ts
//
// Calls the Anthropic API to generate a WhatsApp reply and extract lead intelligence
// from the conversation.
//
// Responsibilities:
//   1. Build the system prompt from the tenant's bot_config
//   2. Format the last 6 messages as conversation history
//   3. Call claude-sonnet-4-6 with structured JSON output instructions
//   4. Parse and validate the response
//   5. Return typed intelligence or throw a ClaudeServiceError
//
// Called by: message.processor.ts (Session 5)
// This service is stateless — all context is passed in per call.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { BotConfig, LeadScore } from "../db/types.js";

// ─── Anthropic client ─────────────────────────────────────────────────────────
// Single instance — SDK manages connection pooling internally.

const anthropic = new Anthropic({
    apiKey: config.anthropic.apiKey,
    // Timeout after 30s — Meta's 20s window is already closed by the time we're
    // here (processor runs async), but 30s prevents jobs hanging indefinitely.
    timeout: 30_000,
    maxRetries: 0, // Bull handles retries at the job level — don't double-retry
});

// ─── Types ────────────────────────────────────────────────────────────────────

// What the caller (Session 5 processor) passes in
export interface ClaudeContext {
    // Tenant configuration
    botConfig: BotConfig;

    // Contact memory — null on first ever message from this contact
    conversationSummary: string | null;

    // Last 6 messages from DB — ordered oldest → newest
    // Passed as raw objects so this service controls formatting
    recentMessages: Array<{
        direction: "inbound" | "outbound";
        body: string;
        message_type: string;
        created_at: Date;
    }>;

    // The new inbound message being processed right now
    newMessage: {
        body: string;
        message_type: string;
    };

    // Contact's current score — so Claude has context on prior classification
    currentScore: LeadScore;
}

// What this service returns to the processor
export interface ClaudeResponse {
    reply: string; // message to send to the customer
    score: LeadScore; // hot | warm | cold | unknown
    score_reason: string; // why this score was assigned
    intent: string; // what the customer wants e.g. "interested in 2BHK apartment"
    budget: string | null; // detected budget e.g. "AED 1.2M" or null if unknown
    timeline: string | null; // detected timeline e.g. "within 3 months" or null
    urgency_signals: string[]; // detected signals e.g. ["mentioned moving soon", "asked about availability"]
    update_summary: string; // new conversation summary to store — replaces old one
}

// ─── Error class ──────────────────────────────────────────────────────────────
// Typed error so Session 5 processor can decide whether to retry the Bull job.
//
// isRetryable = true  → transient (rate limit, server error) — Bull should retry
// isRetryable = false → permanent (invalid API key, bad request) — Bull should not retry

export class ClaudeServiceError extends Error {
    isRetryable: boolean;
    statusCode: number | undefined;

    constructor(message: string, isRetryable: boolean, statusCode?: number) {
        super(message);
        this.name = "ClaudeServiceError";
        this.isRetryable = isRetryable;
        this.statusCode = statusCode;
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
// 2048 gives comfortable headroom: reply (~100-150 words) + JSON structure overhead
// + update_summary (up to 200 words) + urgency_signals array. 1024 was measured to
// risk truncated/invalid JSON on longer conversations with verbose summaries.
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.3; // low = consistent business replies, not creative ones

// Summary max length — if a stored summary is longer than this, truncate it.
// Prevents prompt bloat on long-running contacts.
const MAX_SUMMARY_CHARS = 1500;

// ─── Main function ────────────────────────────────────────────────────────────

export const generateReply = async (
    ctx: ClaudeContext,
): Promise<ClaudeResponse> => {
    const systemPrompt = buildSystemPrompt(ctx.botConfig);
    const userPrompt = buildUserPrompt(ctx);

    logger.info("Calling Claude API", {
        model: MODEL,
        hasConversationSummary: !!ctx.conversationSummary,
        recentMessageCount: ctx.recentMessages.length,
        messageType: ctx.newMessage.message_type,
    });

    let rawText: string;

    try {
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: systemPrompt,
            messages: [
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
        });

        // Extract text from response
        // Anthropic SDK returns content as an array of blocks
        const textBlock = response.content.find(
            (block) => block.type === "text",
        );
        if (!textBlock || textBlock.type !== "text") {
            throw new ClaudeServiceError(
                "Claude returned no text content",
                false, // not retryable — structural issue
            );
        }

        rawText = textBlock.text;

        logger.info("Claude API response received", {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason,
        });
    } catch (error: unknown) {
        // Re-throw ClaudeServiceError as-is (already typed)
        if (error instanceof ClaudeServiceError) throw error;

        // Handle Anthropic SDK errors
        if (error instanceof Anthropic.APIError) {
            // error.status can be undefined — APIConnectionError and
            // APIConnectionTimeoutError have no HTTP status (request never completed).
            // These are exactly the cases that SHOULD be retried, so undefined status
            // must be treated as retryable, not as falling through to `false`.
            const isRetryable =
                error.status === undefined ||
                error.status === 429 ||
                error.status >= 500;
            logger.error("Anthropic API error", {
                status: error.status,
                message: error.message,
                isRetryable,
            });
            throw new ClaudeServiceError(
                `Anthropic API error: ${error.message}`,
                isRetryable,
                error.status,
            );
        }

        // Unknown error — treat as retryable (network issue, timeout)
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Unexpected error calling Claude", { error: message });
        throw new ClaudeServiceError(`Unexpected error: ${message}`, true);
    }

    // Parse and validate the JSON response.
    // previousSummary is passed as a fallback — if Claude fails to produce a
    // new summary, we keep the old one rather than wiping conversation memory.
    return parseClaudeResponse(rawText, ctx.conversationSummary);
};

// ─── System prompt builder ────────────────────────────────────────────────────
// The system prompt defines who Claude is acting as and what rules it must follow.
// Built from the tenant's bot_config — each business configures this via the dashboard.

const buildSystemPrompt = (botConfig: BotConfig): string => {
    // Guard: bot_config can be null/malformed if a tenant signed up but never
    // completed onboarding (onboarding_progress.step_bot_configured = false).
    // TypeScript assumes BotConfig at compile time but the DB value is JSONB —
    // nothing enforces this shape at runtime. Treat null/non-object as empty config
    // so the bot still functions with sensible defaults rather than crashing.
    const safeBotConfig: BotConfig =
        typeof botConfig === "object" && botConfig !== null ? botConfig : {};

    const agentName = safeBotConfig.agentName ?? "Assistant";
    const tone = safeBotConfig.tone ?? "professional and friendly";
    const businessDescription =
        safeBotConfig.businessDescription ?? "a business";
    // .join(",") on an empty array returns "" — not caught by `??` since "" is not
    // null/undefined. Explicitly check length so the fallback text actually applies.
    const services =
        safeBotConfig.services && safeBotConfig.services.length > 0
            ? safeBotConfig.services.join(", ")
            : "various services";
    const openingHours = safeBotConfig.openingHours ?? "during business hours";
    const location = safeBotConfig.location ?? "";
    const language = safeBotConfig.language ?? "auto";

    // Build safety rules — always include core rules, add custom ones from config
    const coreRules = [
        "Never invent prices, availability, or specific details you are not certain about",
        "Never make promises the business cannot keep",
        "If you do not know something, say so and offer to have a human follow up",
        "Never share personal data of other customers",
        "If someone is aggressive or abusive, stay professional and offer to connect them with a human agent",
        "Never discuss competitors",
    ];
    const customRules = safeBotConfig.safetyRules ?? [];
    const allRules = [...coreRules, ...customRules];
    const rulesText = allRules.map((rule, i) => `${i + 1}. ${rule}`).join("\n");

    const languageInstruction =
        language === "auto"
            ? "Detect the language the customer is writing in and always reply in that same language. If they mix languages, match their primary language."
            : `Always reply in ${language}.`;

    return `You are ${agentName}, an AI assistant for ${businessDescription}.

SERVICES OFFERED:
${services}

OPENING HOURS:
${openingHours}

${location ? `LOCATION:\n${location}\n` : ""}
TONE:
Be ${tone}. Keep replies concise — WhatsApp is a messaging app, not email. Avoid long paragraphs. Use line breaks to make messages readable. Keep your reply under 300 words.

LANGUAGE:
${languageInstruction}

SAFETY RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:
${rulesText}

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object. No preamble, no explanation, no markdown code fences. Just the raw JSON.

The JSON must have exactly these fields:
{
  "reply": "The WhatsApp message to send to the customer. Keep it conversational and concise.",
  "score": "hot OR warm OR cold OR unknown",
  "score_reason": "One sentence explaining why you assigned this score.",
  "intent": "What the customer wants or is asking about. Be specific.",
  "budget": "The customer's budget if mentioned, otherwise null.",
  "timeline": "The customer's timeline if mentioned, otherwise null.",
  "urgency_signals": ["Array of strings, each describing a detected urgency signal. Empty array if none."],
  "update_summary": "A concise summary of the entire conversation so far, updated to include this new message. Max 200 words. This will replace the previous summary."
}

SCORING GUIDE:
- hot: Strong buying signals — asking for price, availability, ready to meet/visit, mentioned specific requirement
- warm: Interested and engaged — asking questions, comparing options, but not yet ready to commit
- cold: Just browsing or asking generic questions, low engagement
- unknown: Cannot determine intent from the conversation yet`;
};

// ─── User prompt builder ──────────────────────────────────────────────────────
// The user prompt provides the conversation context for this specific call.
// It includes the summary (long-term memory) and recent messages (short-term memory).

const buildUserPrompt = (ctx: ClaudeContext): string => {
    const parts: string[] = [];

    // Defensive cap: the contract says "last 6 messages" but this file should not
    // blindly trust the caller. If Session 5 ever passes more (bug, future change),
    // silently bloating every prompt's token usage is the wrong failure mode —
    // take the most recent 6 and move on.
    const MAX_RECENT_MESSAGES = 6;
    const recentMessages =
        ctx.recentMessages.length > MAX_RECENT_MESSAGES
            ? ctx.recentMessages.slice(-MAX_RECENT_MESSAGES)
            : ctx.recentMessages;

    // ── Conversation summary (long-term memory) ───────────────────────────────
    if (ctx.conversationSummary) {
        // Truncate if excessively long — prevents prompt bloat
        const summary =
            ctx.conversationSummary.length > MAX_SUMMARY_CHARS
                ? ctx.conversationSummary.slice(0, MAX_SUMMARY_CHARS) +
                  "... [truncated]"
                : ctx.conversationSummary;

        parts.push(
            `CONVERSATION SUMMARY (what has happened so far):\n${summary}`,
        );
    } else {
        parts.push(
            "CONVERSATION SUMMARY:\nThis is the first message from this contact.",
        );
    }

    // ── Current lead score ────────────────────────────────────────────────────
    parts.push(`CURRENT LEAD SCORE: ${ctx.currentScore}`);

    // ── Recent messages (short-term memory) ──────────────────────────────────
    if (recentMessages.length > 0) {
        const formattedMessages = recentMessages
            .map((msg) => {
                const role =
                    msg.direction === "inbound" ? "Customer" : "Assistant";
                const type =
                    msg.message_type !== "text" ? ` [${msg.message_type}]` : "";
                const body = msg.body || `[${msg.message_type} message]`;
                return `${role}${type}: ${body}`;
            })
            .join("\n");

        parts.push(`RECENT CONVERSATION:\n${formattedMessages}`);
    }

    // ── New inbound message ───────────────────────────────────────────────────
    const newMsgType =
        ctx.newMessage.message_type !== "text"
            ? ` [${ctx.newMessage.message_type}]`
            : "";
    const newMsgBody =
        ctx.newMessage.body ||
        `[${ctx.newMessage.message_type} message — no text content]`;

    parts.push(`NEW MESSAGE FROM CUSTOMER${newMsgType}:\n${newMsgBody}`);
    parts.push("Respond with your JSON reply now.");

    return parts.join("\n\n");
};

// ─── Response parser ──────────────────────────────────────────────────────────
// Claude is instructed to return raw JSON but may occasionally add markdown fences
// or preamble. Strip those, parse, and validate every field.

const parseClaudeResponse = (
    rawText: string,
    previousSummary: string | null,
): ClaudeResponse => {
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let cleaned = rawText.trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();
    }

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        logger.error("Claude returned invalid JSON", {
            rawText: rawText.slice(0, 500), // log first 500 chars for debugging
        });
        throw new ClaudeServiceError(
            "Claude returned invalid JSON — cannot parse response",
            false, // not retryable — same call would produce same bad output
        );
    }

    // Validate shape
    return validateClaudeResponse(parsed, previousSummary);
};

// ─── Response validator ───────────────────────────────────────────────────────
// Validates that every field exists and has the correct type.
// Falls back to safe defaults for non-critical fields rather than crashing —
// a degraded response is better than a failed job that never replies to the customer.

const VALID_SCORES: LeadScore[] = ["hot", "warm", "cold", "unknown"];

// WhatsApp text messages have a hard 4096 character limit enforced by Meta's API.
// Truncating well below that (3500) leaves room for any wrapping our send function
// might add and guarantees we never hit a 400 from Meta over message length.
const MAX_REPLY_CHARS = 3500;

// Defensive cap — a well-behaved model returns 0-5 signals. Anything beyond 20
// indicates a malformed or runaway response; truncate rather than store it all.
const MAX_URGENCY_SIGNALS = 20;

const validateClaudeResponse = (
    raw: unknown,
    previousSummary: string | null,
): ClaudeResponse => {
    if (typeof raw !== "object" || raw === null) {
        throw new ClaudeServiceError("Claude response is not an object", false);
    }

    const obj = raw as Record<string, unknown>;

    // reply — critical, must be a non-empty string
    if (typeof obj["reply"] !== "string" || !obj["reply"].trim()) {
        throw new ClaudeServiceError(
            "Claude response missing or empty 'reply' field",
            false,
        );
    }

    // Cap reply length — protects against Meta API rejecting an oversized message
    // and against a misbehaving model generating runaway output.
    let reply = obj["reply"].trim();
    if (reply.length > MAX_REPLY_CHARS) {
        logger.warn("Claude reply exceeded max length — truncating", {
            originalLength: reply.length,
            maxLength: MAX_REPLY_CHARS,
        });
        reply = reply.slice(0, MAX_REPLY_CHARS - 3) + "...";
    }

    // score — must be a valid LeadScore, default to 'unknown' if invalid
    const rawScore = obj["score"];
    const score: LeadScore =
        typeof rawScore === "string" &&
        VALID_SCORES.includes(rawScore as LeadScore)
            ? (rawScore as LeadScore)
            : "unknown";

    if (score !== rawScore) {
        logger.warn("Claude returned invalid score — defaulting to unknown", {
            rawScore,
        });
    }

    // score_reason — default to empty string if missing
    const score_reason =
        typeof obj["score_reason"] === "string" ? obj["score_reason"] : "";

    // intent — default to empty string if missing
    const intent = typeof obj["intent"] === "string" ? obj["intent"] : "";

    // budget — must be string or null
    const budget = typeof obj["budget"] === "string" ? obj["budget"] : null;

    // timeline — must be string or null
    const timeline =
        typeof obj["timeline"] === "string" ? obj["timeline"] : null;

    // urgency_signals — must be array of strings, capped to prevent runaway storage
    const rawSignals = obj["urgency_signals"];
    const urgency_signals: string[] = Array.isArray(rawSignals)
        ? rawSignals
              .filter((s): s is string => typeof s === "string")
              .slice(0, MAX_URGENCY_SIGNALS)
        : [];

    // update_summary — critical for conversation memory.
    // If Claude fails to produce one, fall back to the PREVIOUS summary rather
    // than an empty string. An empty summary would silently wipe out everything
    // we know about this contact — far worse than carrying the old summary forward
    // one more turn until Claude produces a valid one.
    const rawUpdateSummary = obj["update_summary"];
    let update_summary: string;
    if (typeof rawUpdateSummary === "string" && rawUpdateSummary.trim()) {
        update_summary = rawUpdateSummary.trim();
    } else {
        logger.warn(
            "Claude did not return update_summary — keeping previous summary",
            {
                hadPreviousSummary: !!previousSummary,
            },
        );
        update_summary = previousSummary ?? "";
    }

    return {
        reply,
        score,
        score_reason,
        intent,
        budget,
        timeline,
        urgency_signals,
        update_summary,
    };
};
