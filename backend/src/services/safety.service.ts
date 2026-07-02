// services/safety.service.ts
//
// Deterministic, rule-based safety check on Claude's generated reply.
// Runs AFTER claude.service.ts and BEFORE sending the reply to the customer.
//
// This is intentionally NOT another AI call — using AI to check AI output
// adds latency, cost, and its own failure modes. Rules are explicit and
// predictable: same input always produces same output, fully testable.
//
// Position in the pipeline (Session 5):
//   generateReply() → validateSafety() → sendTextMessage()
//
// On failure: never silently drop the message. Send a safe human-handoff
// fallback so the customer isn't left with no response. Flag the original
// reply in the DB for agent review (messages.safety_flagged = true).
//
// Called by: message.processor.ts (Session 5)

import { logger } from "../utils/logger.js";
import type { BotConfig } from "../db/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafetyInput {
    reply: string; // Claude's generated reply to check
    botConfig: BotConfig; // tenant config — for custom rules and language context
    contactPhone: string; // for logging only — never used in logic
    tenantId: string; // for logging only
    // Note: full ClaudeResponse is NOT passed here intentionally — the safety
    // validator only checks the reply string and botConfig rules. Passing the
    // full response would create unnecessary coupling between the two services.
    // Session 5 processor has the full ClaudeResponse and can pass individual
    // fields if future checks need them (e.g. checking score_reason for red flags).
}

export interface SafetyResult {
    safe: boolean; // true = send reply as-is, false = use fallback
    reply: string; // the reply to actually send (original or fallback)
    flagged: boolean; // whether to set messages.safety_flagged = true in DB
    reason: string | null; // why it was flagged — stored in messages.safety_reason
    originalReply: string; // always the original, for DB storage even when flagged
}

// Individual check result — used internally
interface CheckResult {
    passed: boolean;
    reason: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// WhatsApp's hard limit — double-checked here even though claude.service.ts
// already caps reply length. Safety validator is the last line of defense
// before the message hits Meta's API.
const MAX_REPLY_LENGTH = 3500;

// Fallback message sent when a reply is flagged as unsafe.
// Generic enough to work for any business type (real estate, clinic, salon, etc.)
// in the UAE market. Deliberately vague — don't reveal that the AI flagged something.
const FALLBACK_REPLY =
    "Thank you for your message! One of our team members will review your enquiry and get back to you shortly. 🙏";

// ─── Main function ────────────────────────────────────────────────────────────

export const validateSafety = (input: SafetyInput): SafetyResult => {
    const { reply, contactPhone, tenantId } = input;

    // Guard: botConfig can be null/malformed at runtime if tenant never completed
    // onboarding (bot_config is JSONB — nothing enforces BotConfig shape at DB level).
    // Same guard as in claude.service.ts for the same reason.
    const botConfig: BotConfig =
        typeof input.botConfig === "object" && input.botConfig !== null
            ? input.botConfig
            : {};

    // Run all checks
    const checks: Array<{ name: string; result: CheckResult }> = [
        { name: "empty_reply", result: checkEmptyReply(reply) },
        { name: "reply_too_long", result: checkReplyLength(reply) },
        {
            name: "price_invention",
            result: checkPriceInvention(reply, botConfig),
        },
        {
            name: "appointment_commitment",
            result: checkAppointmentCommitment(reply),
        },
        { name: "availability_claim", result: checkAvailabilityClaim(reply) },
        {
            name: "address_invention",
            result: checkAddressInvention(reply, botConfig),
        },
        { name: "contact_info_leak", result: checkContactInfoLeak(reply) },
        {
            name: "competitor_mention",
            result: checkCompetitorMention(reply, botConfig),
        },
    ];

    // Find the first failing check
    // We stop at the first failure — one clear reason is easier to act on
    // than a list of multiple problems in one reply.
    const failure = checks.find((c) => !c.result.passed);

    if (failure) {
        logger.warn("Safety check failed — using fallback reply", {
            tenantId,
            contactPhone,
            checkName: failure.name,
            reason: failure.result.reason,
            // Log first 200 chars of original — enough to understand what was flagged
            // without logging a potentially sensitive full reply
            originalReplyPreview: reply.slice(0, 200),
        });

        return {
            safe: false,
            reply: FALLBACK_REPLY,
            flagged: true,
            reason: `${failure.name}: ${failure.result.reason ?? "check failed"}`,
            originalReply: reply,
        };
    }

    // All checks passed — 8 checks total
    logger.info("Safety checks passed", {
        tenantId,
        contactPhone,
        checksRun: checks.length,
    });

    return {
        safe: true,
        reply,
        flagged: false,
        reason: null,
        originalReply: reply,
    };
};

// ─── Individual checks ────────────────────────────────────────────────────────
// Each returns { passed: boolean, reason: string | null }
// passed = true means the check passed (no problem found)
// passed = false means the check failed (problem detected)

// ── Check 1: Empty reply ──────────────────────────────────────────────────────
// Claude should never return an empty reply — the validator in claude.service.ts
// throws if it does, but we double-check here as a last resort since an empty
// WhatsApp message causes a Meta API error.

const checkEmptyReply = (reply: string): CheckResult => {
    if (!reply || reply.trim().length === 0) {
        return { passed: false, reason: "reply is empty or whitespace only" };
    }
    return { passed: true, reason: null };
};

// ── Check 2: Reply too long ───────────────────────────────────────────────────
// Last defense before Meta's API rejects an oversized message.

const checkReplyLength = (reply: string): CheckResult => {
    if (reply.length > MAX_REPLY_LENGTH) {
        return {
            passed: false,
            reason: `reply length ${reply.length} exceeds WhatsApp limit of ${MAX_REPLY_LENGTH} chars`,
        };
    }
    return { passed: true, reason: null };
};

// ── Check 3: Price invention ──────────────────────────────────────────────────
// Detects when Claude invents specific prices, which violates the core safety
// rule "never invent prices" baked into the system prompt.
//
// UAE market context: AED is the primary currency. Also check USD, $ since
// many Dubai properties are also quoted in USD/international currencies.
//
// Pattern logic:
//   - Matches currency symbols/codes followed by numbers, or numbers followed by them
//   - Examples: "AED 1,200,000" / "1.2M AED" / "$500" / "500 USD"
//   - Does NOT flag general mentions of currency words without numbers
//     ("we accept payment in AED") — only when paired with specific amounts
//
// When to skip this check:
//   - If botConfig has no safetyRules mentioning price, we still check — this
//     is a CORE rule that always applies regardless of custom config.
//   - If the bot is explicitly configured as a "pricing bot" (future use case),
//     a custom override mechanism would be needed — not in scope now.

// Covers:
//   "AED 1,200,000" / "1.2M AED" / "$500" / "500 USD" (symbol + number combos)
//   "800k" / "1.5M" alone (number + k/M without currency — common shorthand)
//   "one million dirhams" (written-out — formal Arabic-influenced style)
const PRICE_PATTERN =
    /(?:AED|USD|EUR|GBP|SAR|QAR|\$|€|£)\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|M|k|K))?|[\d,]+(?:\.\d+)?\s*(?:AED|USD|EUR|GBP|SAR|QAR|\$|€|£)|[\d,]+(?:\.\d+)?\s*(?:million|M)\s*(?:AED|USD|dirhams?)|\b\d+(?:\.\d+)?\s*[kK]\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hundred\s+thousand|million)\s+(?:AED|USD|dirhams?|dollars?)/i;

const checkPriceInvention = (
    reply: string,
    botConfig: BotConfig,
): CheckResult => {
    // Skip if the tenant explicitly allows price mentions in their custom rules.
    // Convention: if safetyRules contains "allow_prices" we skip this check.
    // This is an escape hatch for businesses like supermarkets that DO want
    // the bot to quote prices. Not advertised in the UI yet — for future use.
    const allowPrices = botConfig.safetyRules?.some((rule) =>
        rule.toLowerCase().includes("allow_prices"),
    );
    if (allowPrices) return { passed: true, reason: null };

    if (PRICE_PATTERN.test(reply)) {
        return {
            passed: false,
            reason:
                "reply contains specific price/amount — Claude may be inventing figures. " +
                "Core rule: never quote specific prices without business confirmation.",
        };
    }
    return { passed: true, reason: null };
};

// ── Check 4: Appointment commitment ──────────────────────────────────────────
// Detects when Claude makes specific time commitments on behalf of the business
// ("I'll call you at 3pm", "someone will visit on Monday") that the business
// may not be able to honor — creating false expectations and damaging trust.
//
// We're looking for patterns that combine:
//   - A commitment verb (will call, will visit, will contact, can meet, etc.)
//   - A specific time reference (at 3pm, on Monday, tomorrow, within the hour, etc.)
//
// We deliberately avoid flagging general availability language like:
//   "We're available during business hours" — this is fine
//   "Our team will get back to you" — fine, no specific time
//   "You can visit our showroom anytime" — fine, no commitment

// Flags replies where Claude commits to a specific meeting, call, or visit
// AND ties it to a specific time or date.
//
// ALLOWED (soft commitment, no specific time):
//   "Our team will get back to you" — fine
//   "Someone will be in touch soon" — fine
//   "We'll send you the brochure" — fine
//
// FLAGGED (specific time-bound commitment):
//   "Our agent will call you at 3pm" — flagged
//   "We can visit you on Monday" — flagged
//   "I'll arrange a viewing on the 15th" — flagged
//   "We'll meet you tomorrow" — flagged
//
// Why: a time-bound commitment creates a specific expectation the business
// may not honor. Generic follow-up promises are acceptable business language.
const MEETING_COMMITMENT =
    /(?:will|i'll|we'll|they'll|can|shall|going to)\s+(?:\S+\s+){0,3}(?:call|contact|visit|meet|come|reach|arrange|schedule|book)\s+(?:\S+\s+){0,2}(?:you|for you|a viewing|an appointment|a meeting)/i;

// Specific time references — day names, clock times, date numbers, relative times
const SPECIFIC_TIME =
    /(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow|today\s+at|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+the\s+\d{1,2}(?:st|nd|rd|th)?|on\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|within\s+(?:the\s+hour|\d+\s*(?:hour|minute|min))|in\s+\d+\s*(?:hour|minute|min))/i;

const checkAppointmentCommitment = (reply: string): CheckResult => {
    if (MEETING_COMMITMENT.test(reply) && SPECIFIC_TIME.test(reply)) {
        return {
            passed: false,
            reason:
                "reply contains a specific time-bound meeting commitment. " +
                "Claude should not schedule meetings or calls on behalf of the business.",
        };
    }
    return { passed: true, reason: null };
};

// ── Check 5: Availability claim ──────────────────────────────────────────────
// Detects when Claude makes specific availability claims about properties,
// units, or services — e.g. "Unit 5B is available", "we have 3 units left",
// "that villa is still on the market".
//
// Why this is a reputation risk: Claude has no access to live inventory.
// Any availability claim it makes is either hallucinated or based on stale
// context. A customer who comes in expecting a specific unit based on the
// bot's claim and finds it sold will blame the business, not the AI.
//
// FLAGGED:
//   "Unit 5B is available right now" — specific unit claim
//   "Yes, we have 3 units available in that building" — specific count
//   "That villa is still available" — specific property claim
//   "The 2BHK on floor 12 is available" — specific unit
//
// ALLOWED (general availability language):
//   "We have properties available in that area" — general, fine
//   "Our team can check availability for you" — deferring to human, fine
//   "We have several options available" — non-specific, fine
//
// Pattern logic: flags when a specific unit/property identifier (floor number,
// unit number, "that", "this") is combined with an availability confirmation.

const SPECIFIC_AVAILABILITY =
    /(?:unit|apartment|villa|flat|office|shop|floor|suite|property|plot)\s+\S+\s+(?:is|are)\s+(?:available|ready|vacant|on\s+the\s+market|still\s+available)|(?:that|this)\s+(?:unit|apartment|villa|flat|office|property)\s+is\s+(?:available|ready|vacant)|(?:we\s+have|there\s+(?:is|are))\s+\d+\s+(?:unit|apartment|villa|flat|office|property|bedroom|bhk)/i;

const checkAvailabilityClaim = (reply: string): CheckResult => {
    if (SPECIFIC_AVAILABILITY.test(reply)) {
        return {
            passed: false,
            reason:
                "reply makes a specific availability claim. " +
                "Claude has no access to live inventory — specific availability must come from the business.",
        };
    }
    return { passed: true, reason: null };
};

// ── Check 6 (was 5): Address invention ───────────────────────────────────────
// Detects when Claude invents or hallucinates a specific street address.
// UAE addresses often follow patterns like:
//   - "Unit 5, Floor 3, XYZ Tower, Sheikh Zayed Road, Dubai"
//   - "Office 204, Business Bay, Dubai"
//   - "Villa 12, Jumeirah 1"
//
// We flag replies that contain what looks like a specific unit/floor/villa
// number combined with a location reference — a strong signal Claude is
// inventing address details rather than deferring to a human.
//
// If the tenant's bot_config.location field is set, we do NOT flag it for
// containing address-like content — the location field is the approved address.

const ADDRESS_PATTERN =
    /(?:unit|office|flat|apartment|apt|villa|floor|level|shop|suite)\s+\d+/i;

const checkAddressInvention = (
    reply: string,
    botConfig: BotConfig,
): CheckResult => {
    if (!ADDRESS_PATTERN.test(reply)) return { passed: true, reason: null };

    // Extract what ADDRESS_PATTERN actually matched in the reply
    const match = ADDRESS_PATTERN.exec(reply);
    const matchedText = match ? match[0] : "";

    // Only pass if the MATCHED PORTION itself is part of the approved location string.
    // Checking if the whole reply contains the location is not enough — Claude could
    // correctly mention "Business Bay, Dubai" (from config) AND invent "Office 5"
    // in the same reply. We want to flag the invented part, not whitelist the whole reply.
    const configuredLocation = (botConfig.location ?? "").toLowerCase();
    if (
        configuredLocation.length > 0 &&
        configuredLocation.includes(matchedText.toLowerCase())
    ) {
        return { passed: true, reason: null };
    }

    return {
        passed: false,
        reason:
            "reply contains what appears to be a specific address or unit number. " +
            "Claude may be inventing location details not in its approved configuration.",
    };
};

// ── Check 6: Contact info leak ────────────────────────────────────────────────
// Detects when Claude includes phone numbers or emails in the reply.
// Risk: Claude might hallucinate a contact number, or accidentally surface
// another customer's contact info from its training or the conversation context.
//
// Exception: we do NOT flag the reply if the number/email it contains
// exactly matches the business's own configured contact info (future: add
// botConfig.contactEmail, botConfig.contactPhone fields in a later session).
// For now, flagging all phone/email in replies is the safer default.
//
// Phone pattern: requires enough digits to be a real phone number (7+ digits
// in a recognizable pattern). Deliberately avoids matching things like
// "3-4 bedrooms", "10-15 minutes", "2,500 sq ft" — common in real estate replies.
// UAE phone formats:
//   +971 50 123 4567  /  971501234567  /  050 123 4567  /  04 123 4567
// Covers UAE and common customer origin countries (GCC + India — high volume in UAE market).
// The \b\d{7,}\b alternative is intentionally NOT used — it matched property
// reference numbers, listing IDs, and other common real estate identifiers.
// Instead we match recognizable international phone patterns with country codes.
//   UAE:    +971 / 00971 / 0 + network prefix
//   Saudi:  +966
//   Qatar:  +974
//   Kuwait: +965
//   India:  +91 (large expat community in UAE)
const PHONE_IN_REPLY =
    /(?:\+971|00971|0)\s*(?:50|51|52|54|55|56|58|2|3|4|6|7|9)\s*\d{3}\s*\d{4}|(?:\+966|\+974|\+965|\+91)\s*[\d\s-]{8,12}/;

const EMAIL_IN_REPLY = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const checkContactInfoLeak = (reply: string): CheckResult => {
    if (PHONE_IN_REPLY.test(reply)) {
        return {
            passed: false,
            reason:
                "reply contains what appears to be a phone number. " +
                "Claude should not include contact numbers — direct customers to speak with the team.",
        };
    }
    if (EMAIL_IN_REPLY.test(reply)) {
        return {
            passed: false,
            reason:
                "reply contains what appears to be an email address. " +
                "Claude should not include contact emails — direct customers to speak with the team.",
        };
    }
    return { passed: true, reason: null };
};

// ── Check 7: Competitor mention ───────────────────────────────────────────────
// Detects when Claude mentions competitor businesses by name.
// The system prompt already instructs Claude not to discuss competitors,
// but a check here catches cases where it slips through.
//
// How this works: the tenant's botConfig.safetyRules may contain competitor
// names in the format "no_competitor: CompanyName" — we extract those and
// check if any appear in the reply.
//
// If no competitors are configured, this check always passes — we can't
// know who the competitors are without the business telling us.
//
// Format convention (documented in onboarding UI — future Session 13):
//   safetyRules: ["no_competitor: PropertyFinder", "no_competitor: Bayut"]

const checkCompetitorMention = (
    reply: string,
    botConfig: BotConfig,
): CheckResult => {
    const competitors = (botConfig.safetyRules ?? [])
        .filter((rule) => rule.toLowerCase().startsWith("no_competitor:"))
        .map((rule) => rule.split(":")[1]?.trim())
        .filter(
            (name): name is string =>
                typeof name === "string" && name.length > 0,
        );

    if (competitors.length === 0) return { passed: true, reason: null };

    const replyLower = reply.toLowerCase();
    const mentioned = competitors.find((name) =>
        replyLower.includes(name.toLowerCase()),
    );

    if (mentioned) {
        return {
            passed: false,
            reason: `reply mentions competitor "${mentioned}" — Claude should not reference competitors.`,
        };
    }

    return { passed: true, reason: null };
};

// ─── Utility: get fallback reply ──────────────────────────────────────────────
// Exported so Session 5 processor can use the same fallback text when it
// needs to send a fallback for other reasons (e.g. Claude API completely down).

export const getFallbackReply = (): string => FALLBACK_REPLY;
