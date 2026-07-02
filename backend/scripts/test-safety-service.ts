// scripts/test-safety-service.ts
//
// Verification script for safety.service.ts
// Zero cost — pure logic, no external API calls, no DB, no Redis.
// Run from backend/ folder: npx tsx scripts/test-safety-service.ts
//
// Each test case specifies:
//   - scenario name (what we're testing)
//   - input (the reply Claude generated + botConfig)
//   - expected (what validateSafety should return)
//
// A PASS means the code behaved exactly as expected.
// A FAIL means the code has a bug or the regex needs adjustment.

import { validateSafety } from "../src/services/safety.service.js";
import type { SafetyInput } from "../src/services/safety.service.js";

// ─── Test framework (no dependencies — plain Node) ────────────────────────────

let passed = 0;
let failed = 0;

const test = (
    name: string,
    input: SafetyInput,
    expected: { safe: boolean; flagged: boolean; checkName?: string },
): void => {
    const result = validateSafety(input);

    const safeMatch = result.safe === expected.safe;
    const flaggedMatch = result.flagged === expected.flagged;
    const checkMatch = expected.checkName
        ? (result.reason?.startsWith(expected.checkName) ?? false)
        : true;

    if (safeMatch && flaggedMatch && checkMatch) {
        console.log(`  ✅ PASS — ${name}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL — ${name}`);
        if (!safeMatch) {
            console.log(
                `     safe: expected=${expected.safe} got=${result.safe}`,
            );
        }
        if (!flaggedMatch) {
            console.log(
                `     flagged: expected=${expected.flagged} got=${result.flagged}`,
            );
        }
        if (!checkMatch) {
            console.log(
                `     reason: expected to start with "${expected.checkName}" got="${result.reason}"`,
            );
        }
        console.log(`     reply sent: "${result.reply.slice(0, 100)}"`);
        failed++;
    }
};

// ─── Base botConfig for most tests ───────────────────────────────────────────

const baseBotConfig = {
    agentName: "Layla",
    businessDescription: "a Dubai real estate agency",
    services: ["Apartment sales", "Villa rentals"],
    tone: "professional",
    language: "auto",
    location: "Business Bay, Dubai",
    safetyRules: [],
};

const baseTenantId = "test-tenant-id";
const basePhone = "971509999999";

// Helper to build SafetyInput quickly
const input = (
    reply: string,
    botConfigOverrides: Record<string, unknown> = {},
): SafetyInput => ({
    reply,
    botConfig: { ...baseBotConfig, ...botConfigOverrides },
    contactPhone: basePhone,
    tenantId: baseTenantId,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(70));
console.log("SAFETY SERVICE TEST SUITE");
console.log("═".repeat(70));

// ── Group 1: Happy path — safe replies that should PASS ───────────────────────
console.log("\n● Happy path (all should be SAFE)");

test(
    "normal real estate inquiry reply — no violations",
    input(
        "Thank you for reaching out! We have several 2-bedroom apartments available in Dubai Marina. Our specialist will share detailed pricing and options with you. Would you like to schedule a viewing?",
    ),
    { safe: true, flagged: false },
);

test(
    "Arabic reply — should pass",
    input(
        "شكراً لتواصلك معنا! لدينا شقق رائعة في دبي مارينا. سيتواصل معك أحد متخصصينا قريباً.",
    ),
    { safe: true, flagged: false },
);

test(
    "reply mentioning 'AED' without a number — should pass",
    input(
        "We accept payments in AED and USD. Our team will provide full pricing details.",
    ),
    { safe: true, flagged: false },
);

test(
    "reply with general time language — should pass (no specific commitment)",
    input(
        "Our team will get back to you during business hours. We're available Sunday to Thursday.",
    ),
    { safe: true, flagged: false },
);

test(
    "reply with location but from approved botConfig.location — should pass",
    input(
        "You can visit us at our office in Business Bay, Dubai during working hours.",
    ),
    { safe: true, flagged: false },
);

test(
    "short confirmation reply — should pass",
    input("Got it! Someone from our team will be in touch soon. 🙏"),
    { safe: true, flagged: false },
);

// ── Group 2: Price invention ──────────────────────────────────────────────────
console.log("\n● Price invention (all should be FLAGGED)");

test(
    "reply with specific AED price",
    input("This apartment is priced at AED 1,200,000."),
    { safe: false, flagged: true, checkName: "price_invention" },
);

test(
    "reply with price in millions format",
    input("The villa starts from 2.5M AED."),
    { safe: false, flagged: true, checkName: "price_invention" },
);

test("reply with USD price", input("Units are available from $350,000."), {
    safe: false,
    flagged: true,
    checkName: "price_invention",
});

test(
    "price check skipped when allow_prices in safetyRules",
    input("Our lunch menu starts from AED 45 per person.", {
        safetyRules: ["allow_prices"],
    }),
    { safe: true, flagged: false },
);

// ── Group 3: Appointment commitment ──────────────────────────────────────────
console.log("\n● Appointment commitment (all should be FLAGGED)");

test(
    "will call you at specific time",
    input("Our agent will call you at 3pm today."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

test(
    "will visit on a specific day",
    input("We can visit you on Monday to show the property."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

test(
    "will get back within the hour",
    input("Someone will contact you within the hour."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

// ── Group 4: Address invention ────────────────────────────────────────────────
console.log("\n● Address invention (all should be FLAGGED)");

test(
    "invented unit number not in approved location",
    input(
        "You can visit us at Unit 5, Floor 3, Marina Tower. We're open daily.",
    ),
    { safe: false, flagged: true, checkName: "address_invention" },
);

test(
    "invented villa number",
    input(
        "The property is Villa 12, Jumeirah 1. Available for viewing this week.",
    ),
    { safe: false, flagged: true, checkName: "address_invention" },
);

// ── Group 5: Contact info leak ────────────────────────────────────────────────
console.log("\n● Contact info leak (all should be FLAGGED)");

test(
    "UAE mobile number in reply",
    input("You can reach our agent directly on +971 50 123 4567."),
    { safe: false, flagged: true, checkName: "contact_info_leak" },
);

test(
    "email address in reply",
    input(
        "Send your documents to agent@realestatecompany.com and we'll review them.",
    ),
    { safe: false, flagged: true, checkName: "contact_info_leak" },
);

// ── Group 6: Competitor mention ───────────────────────────────────────────────
console.log("\n● Competitor mention (flagged when competitors configured)");

test(
    "competitor mentioned — flagged when configured",
    input("You might also want to check PropertyFinder for more listings.", {
        safetyRules: ["no_competitor: PropertyFinder", "no_competitor: Bayut"],
    }),
    { safe: false, flagged: true, checkName: "competitor_mention" },
);

test(
    "competitor in reply — not flagged when NO competitors configured",
    input("You might also want to check PropertyFinder for more listings.", {
        safetyRules: [],
    }),
    { safe: true, flagged: false },
);

test(
    "second competitor mentioned — flagged",
    input("Bayut has similar listings if you want to compare.", {
        safetyRules: ["no_competitor: PropertyFinder", "no_competitor: Bayut"],
    }),
    { safe: false, flagged: true, checkName: "competitor_mention" },
);

// ── Group 7: Empty reply ──────────────────────────────────────────────────────
console.log("\n● Empty reply (all should be FLAGGED)");

test("empty string", input(""), {
    safe: false,
    flagged: true,
    checkName: "empty_reply",
});

test("whitespace only", input("   \n  \t  "), {
    safe: false,
    flagged: true,
    checkName: "empty_reply",
});

// ── Group 8: Reply too long ───────────────────────────────────────────────────
console.log("\n● Reply too long (should be FLAGGED)");

test("reply exceeds 3500 char limit", input("A".repeat(3501)), {
    safe: false,
    flagged: true,
    checkName: "reply_too_long",
});

test("reply exactly at limit — should pass", input("A".repeat(3500)), {
    safe: true,
    flagged: false,
});

// ── Group 9: False positive prevention ───────────────────────────────────────
// These are replies that LOOK like they might trigger a check but shouldn't.
console.log("\n● False positive prevention (all should be SAFE)");

test(
    "'3-4 bedroom' should not trigger phone check",
    input("We have 3-4 bedroom options available in the area."),
    { safe: true, flagged: false },
);

test(
    "'10-15 minutes away' should not trigger phone check",
    input("The property is 10-15 minutes from the metro station."),
    { safe: true, flagged: false },
);

test(
    "'floor plan' should not trigger address check",
    input("I can share the floor plan with you once our team contacts you."),
    { safe: true, flagged: false },
);

test(
    "general business hours mention should not trigger appointment check",
    input("Our showroom is open Saturday to Thursday, 9am to 7pm."),
    { safe: true, flagged: false },
);

// ── Group 10: Contraction appointment commitment ─────────────────────────────
console.log(
    "\n● Appointment commitment — contraction forms (all should be FLAGGED)",
);

test(
    "I'll call you — contraction form",
    input("I'll call you at 3pm to discuss the options."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

test(
    "we'll have someone visit",
    input("We'll have our agent visit you tomorrow to show the property."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

// ── Group 11: Address invention edge cases ────────────────────────────────────
console.log("\n● Address invention edge cases");

test(
    "approved location in reply — should pass",
    input(
        "You can find us in Business Bay, Dubai. Our team will share exact directions.",
    ),
    { safe: true, flagged: false },
);

test(
    "invented office number alongside approved location — should FAIL",
    input("Come visit us at Office 5, Business Bay, Dubai. We're open daily."),
    { safe: false, flagged: true, checkName: "address_invention" },
);

// ── Group 12: Phone number false positive prevention ──────────────────────────
console.log("\n● Phone number false positives (all should be SAFE)");

test(
    "property reference number should not trigger phone check",
    input(
        "Here is a great option for you, Reference: 12345678, located in Marina.",
    ),
    { safe: true, flagged: false },
);

test(
    "year should not trigger phone check",
    input("This building was completed in 2023 and has modern finishes."),
    { safe: true, flagged: false },
);

// ── Group 13: Null botConfig ──────────────────────────────────────────────────
console.log("\n● Null/malformed botConfig (should not crash)");

test(
    "null botConfig — should not throw, should process safely",
    {
        reply: "Thank you for reaching out! Our team will be in touch.",
        botConfig: null as unknown as import("../src/db/types.js").BotConfig,
        contactPhone: "971509999999",
        tenantId: "test-tenant",
    },
    { safe: true, flagged: false },
);

// ── Group 14: Availability claims ────────────────────────────────────────────
console.log("\n● Availability claims (all should be FLAGGED)");

test(
    "specific unit availability claim",
    input("Unit 5B is available right now for viewing."),
    { safe: false, flagged: true, checkName: "availability_claim" },
);

test(
    "'that apartment is available' — specific property",
    input("Yes, that apartment is available. You can book a viewing today."),
    { safe: false, flagged: true, checkName: "availability_claim" },
);

test(
    "specific unit count claim",
    input("We have 3 units available in that tower right now."),
    { safe: false, flagged: true, checkName: "availability_claim" },
);

test(
    "general availability — should PASS",
    input(
        "We have several properties available in that area. Our team will share options with you.",
    ),
    { safe: true, flagged: false },
);

test(
    "deferring availability check to human — should PASS",
    input(
        "Our team can check availability for you and get back to you shortly.",
    ),
    { safe: true, flagged: false },
);

// ── Group 15: Soft commitments — should all PASS ──────────────────────────────
console.log("\n● Soft commitments without time (all should be SAFE)");

test(
    "team will get back to you — no time",
    input("Our team will get back to you with more details."),
    { safe: true, flagged: false },
);

test(
    "someone will be in touch — no time",
    input("Someone from our team will be in touch soon."),
    { safe: true, flagged: false },
);

test(
    "we'll send you the brochure — no time",
    input("We'll send you the brochure and floor plans for your review."),
    { safe: true, flagged: false },
);

// ── Group 16: Price — additional patterns ────────────────────────────────────
console.log(
    "\n● Price invention — additional patterns (all should be FLAGGED)",
);

test(
    "written-out number with currency — formal style",
    input("The apartment costs one million dirhams, which is very reasonable."),
    { safe: false, flagged: true, checkName: "price_invention" },
);

test(
    "k shorthand without currency symbol",
    input("Prices start from 800k for a studio in this area."),
    { safe: false, flagged: true, checkName: "price_invention" },
);

// ── Group 15: Appointment — additional patterns ───────────────────────────────
console.log(
    "\n● Appointment commitment — additional patterns (all should be FLAGGED)",
);

test(
    "arrange a viewing on specific date",
    input("I will arrange a viewing for you on Saturday at the property."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

test(
    "visit on the Nth — date number not day name",
    input("Our team will visit you on the 15th to show the unit."),
    { safe: false, flagged: true, checkName: "appointment_commitment" },
);

// ── Group 16: Phone — international numbers ───────────────────────────────────
console.log(
    "\n● Contact info leak — international phone numbers (all should be FLAGGED)",
);

test(
    "Saudi Arabia number in reply",
    input("You can reach our Saudi office on +966 50 123 4567."),
    { safe: false, flagged: true, checkName: "contact_info_leak" },
);

test(
    "Indian number in reply — large expat community in UAE",
    input("Our consultant in India can be reached on +91 98765 43210."),
    { safe: false, flagged: true, checkName: "contact_info_leak" },
);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(70));
console.log(
    `RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
console.log("═".repeat(70) + "\n");

if (failed > 0) {
    process.exit(1);
}