// jobs/message.processor.ts
//
// Bull worker — registers the processor function that handles each queued message.
// Imported once in app.ts on startup. The import itself registers the processor.
//
// THIS IS A STUB — full processing logic is built in Session 5.
// The structure below is intentional: Session 5 fills in the try block,
// it does not restructure this file.
//
// Full flow Session 5 will implement inside processMessage:
//   - Check contact opted_out — skip entirely if true
//   - Upsert contact (create or update last_message_at, message_count)
//   - Store inbound message in messages table
//   - Cancel pending drip job if contact has one (contacts.drip_job_id)
//   - Load conversation summary + last 6 messages from DB
//   - Call Claude AI service (Session 3)
//   - Run safety validator (Session 4)
//   - Send reply via whatsapp.service.ts sendTextMessage() or media variant
//   - Store outbound message in messages table
//   - Update contact: score, intent, budget, timeline, conversation_summary
//   - Increment tenants.conversations_used
//   - Create notification if hot lead detected
//   - Mark webhook_events.processed = true
//   - Enroll in drip sequence if applicable (Session 8)

import Bull from "bull";
import { messageQueue } from "../services/queue.service.js";
import type { MessageJobData } from "../services/queue.service.js";
import { logger } from "../utils/logger.js";

// ─── Processor function ───────────────────────────────────────────────────────
// Bull calls this for each dequeued job.
//   - Return (resolve) → job marked complete
//   - Throw            → job marked failed, Bull retries up to attempts limit
//
// job.attemptsMade is 0-indexed: 0 = first attempt, 1 = first retry, 2 = second retry.
// Session 5 should check this for retry-aware logic — e.g. don't send a WhatsApp
// reply on a retry if the outbound message row already exists in the DB.

const processMessage = async (job: Bull.Job<MessageJobData>): Promise<void> => {
    const { messageId, tenantId, contactPhone, messageType } = job.data;

    logger.info("Processing message job", {
        jobId: job.id,
        messageId,
        tenantId,
        contactPhone,
        messageType,
        // +1 for human-readable logging: attempt 1 of 3, not 0 of 2
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
    });

    try {
        // ── Session 5 replaces this comment with the full processing pipeline ──
        // Stub: completes immediately so the webhook → queue path can be tested
        // end-to-end before Session 5 is built.
        logger.info(
            "Message job completed (stub — Session 5 will process this)",
            {
                jobId: job.id,
                messageId,
            },
        );
    } catch (error: unknown) {
        // Any error thrown here causes Bull to mark the job as failed and retry.
        // Log before rethrowing so every failure has a trace entry.
        logger.error("Message job failed", {
            jobId: job.id,
            messageId,
            tenantId,
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error; // rethrow — Bull needs this to trigger retry logic
    }
};

// ─── Register processor ───────────────────────────────────────────────────────
// Concurrency = 5: Bull picks up 5 jobs simultaneously on this worker instance.
//
// Why 5 and not higher:
//   Each job will eventually (Session 5) make: 3-5 DB queries, 1 Redis read,
//   1 Anthropic API call (~1-3s), 1 Meta API call. On Render's $7/month instance
//   (512MB RAM, shared CPU), going above 5 concurrent jobs risks memory pressure
//   and CPU contention that slows ALL jobs rather than speeding them up.
//
// On scaling: if volume grows, scale horizontally (multiple Render instances)
// rather than increasing concurrency per instance.
//
// Wrapped in try/catch: messageQueue.process() connects to Redis internally.
// If Redis is unreachable at startup, this would throw and crash app.ts before
// waitForDatabase() has run. We log the error and let the app start anyway —
// the queue will reconnect when Redis becomes available (lazyConnect: true).

try {
    messageQueue.process(5, processMessage);
    logger.info("Message processor registered", {
        queue: "message-processing",
        concurrency: 5,
    });
} catch (error: unknown) {
    logger.error(
        "Failed to register message processor — queue may be unavailable",
        {
            error: error instanceof Error ? error.message : String(error),
        },
    );
}
