// Bull message processing queue backed by Upstash Redis.
// Single queue instance — imported by:
//   - webhook controller  → enqueueMessage()
//   - message.processor   → messageQueue.process()
//   - app.ts              → isQueueHealthy(), closeQueue()
//
// Design decisions:
//   - Queue name 'message-processing' is stable — changing it orphans existing jobs
//   - jobId = messageId gives dedup at queue level (DB webhook_events gives durable dedup)
//   - 3 retries with exponential backoff — mirrors WhatsAppError.isRetryable in Session 5
//   - removeOnComplete/Fail limits keep Redis memory bounded on Upstash free tier
//   - Bull uses ioredis under the hood — separate connection from @upstash/redis REST client
//     so we need to convert the Upstash REST URL to ioredis connection options manually

import Bull from "bull";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ─── Queue job data shape ─────────────────────────────────────────────────────
// This is the contract between the webhook controller (producer)
// and the message processor (consumer).
//
// Keep it lean — only carry what the processor needs to START its work.
// The processor fetches full contact/tenant data from the DB itself.
// Reason: job data is stored in Redis and survives restarts — large payloads
// waste Redis memory and slow down serialization.

export interface MessageJobData {
    messageId: string; // wa_message_id from Meta — idempotency key
    tenantId: string; // resolved from wa_phone_number_id in webhook controller
    contactPhone: string; // sanitized (no +, no spaces) — used for contact upsert
    contactName: string | null; // from Meta profile.name — may be absent
    messageType: string; // text | image | audio | video | document | location | sticker | reaction | interactive | unsupported
    messageBody: string; // text content, or '' for captionless media (DB: NOT NULL)
    timestamp: number; // Unix epoch from Meta payload — source of truth for message time

    // Media — populated only when messageType is image/video/audio/document/sticker
    mediaId: string | null; // Meta media ID — download in processor before it expires
    mediaMimeType: string | null; // e.g. 'image/jpeg', 'video/mp4'
    mediaCaption: string | null; // optional caption on image/video/document
    mediaFilename: string | null; // original filename — only present for document messages

    // Location — populated only when messageType === 'location'
    locationLatitude: number | null;
    locationLongitude: number | null;
    locationName: string | null;
    locationAddress: string | null;

    // Reaction — populated only when messageType === 'reaction'
    reactionEmoji: string | null;
    reactionTargetMessageId: string | null; // the message being reacted to
}

// ─── Redis connection for Bull ────────────────────────────────────────────────
// Bull uses ioredis internally — NOT the @upstash/redis REST client used elsewhere.
// These are two completely separate connections to the same Redis instance.
// This means the REST ping in app.ts health check does NOT verify Bull's connection.
// That's why we export isQueueHealthy() separately — see below.
//
// Upstash ioredis quirks:
//   - port is always 6379 (not the REST port)
//   - TLS is required
//   - enableReadyCheck must be false (Upstash doesn't support the Redis READY check command)
//   - maxRetriesPerRequest must be null (Bull requires this for its blocking commands)
//
// NOTE: lazyConnect was removed (2026-06-30) after live testing revealed it
// caused the consumer/processor connection to never properly initialize.
// Bull creates separate underlying ioredis connections for producer (add jobs)
// and consumer (process jobs / blocking pop). With lazyConnect: true, the
// producer connection activates on the first .add() call, but the consumer
// connection used internally by .process() did not reliably activate —
// jobs enqueued successfully but were never picked up by the worker.
// Confirmed via live test against real Upstash Redis: removing lazyConnect
// fixed processor pickup immediately. The minor startup delay this adds is
// a worthwhile tradeoff for correct behavior.

const getRedisConfig = (): Bull.QueueOptions["redis"] => {
    const url = new URL(config.upstash.redisUrl);
    return {
        host: url.hostname,
        port: 6379,
        password: config.upstash.redisToken,
        tls: {},
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    };
};

// ─── Queue instance ───────────────────────────────────────────────────────────

export const messageQueue = new Bull<MessageJobData>("message-processing", {
    redis: getRedisConfig(),

    defaultJobOptions: {
        attempts: 3, // 1 original + 2 retries
        backoff: {
            type: "exponential",
            delay: 2000, // 2s → 4s → 8s
        },
        removeOnComplete: 100, // keep last 100 completed jobs for debugging
        removeOnFail: 500, // keep last 500 failed jobs for manual inspection
    },
});

// ─── Queue event logging ──────────────────────────────────────────────────────
// These fire on the worker side (message.processor.ts imports this module too).
// Logging here means every failure/stall is captured regardless of which
// part of the codebase triggered it.

messageQueue.on("error", (error: Error) => {
    // Queue-level error — usually a Redis connection problem
    logger.error("Message queue connection error", { error: error.message });
});

messageQueue.on("failed", (job, error: Error) => {
    // Job failed all attempts — needs manual investigation
    logger.error("Message job failed permanently", {
        jobId: job.id,
        messageId: job.data.messageId,
        tenantId: job.data.tenantId,
        attemptsUsed: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: error.message,
    });
});

messageQueue.on("stalled", (job) => {
    // Job was picked up by a worker that died before completing.
    // Bull automatically re-queues stalled jobs — this is just a warning.
    logger.warn("Message job stalled — Bull will re-queue automatically", {
        jobId: job.id,
        messageId: job.data.messageId,
    });
});

messageQueue.on("completed", (job) => {
    // Confirms the full webhook → queue → processor pipeline worked.
    // Useful during early development and for monitoring dashboards later.
    logger.info("Message job completed", {
        jobId: job.id,
        messageId: job.data.messageId,
        tenantId: job.data.tenantId,
    });
});

// ─── Health check ─────────────────────────────────────────────────────────────
// Called from app.ts /health route alongside the DB and Redis REST checks.
// Uses Bull's own isReady() — verifies the ioredis connection specifically,
// not the REST client. These are different connections — both must be checked.

export const isQueueHealthy = async (): Promise<boolean> => {
    try {
        await messageQueue.isReady();
        return true;
    } catch {
        return false;
    }
};

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// Called from app.ts SIGTERM/SIGINT handler after server.close().
// Waits for in-flight jobs to finish (up to the timeout Bull enforces),
// then closes the ioredis connection cleanly.
// Without this: Redis connections leak on every deploy, and Upstash free tier
// has a connection limit that would eventually be exhausted.

export const closeQueue = async (): Promise<void> => {
    try {
        await messageQueue.close();
        logger.info("Message queue closed cleanly");
    } catch (error) {
        logger.error("Error closing message queue", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

// ─── Enqueue helper ───────────────────────────────────────────────────────────
// Wraps Bull's add() with:
//   - jobId dedup: same messageId = same job, Bull returns the existing one
//   - duplicate detection: logs clearly when a message was already queued
//     so we don't log "enqueued" for a no-op (misleading during debugging)
//
// Note: the webhook_events table is the PRIMARY dedup layer (durable across restarts).
// This jobId dedup is SECONDARY — catches duplicates that arrive within Bull's
// dedup window before the DB check has a chance to catch them.

export const enqueueMessage = async (
    data: MessageJobData,
): Promise<Bull.Job<MessageJobData>> => {
    const job = await messageQueue.add(data, {
        jobId: data.messageId,
    });

    // Bull returns the existing job when jobId already exists.
    // Detect duplicates: if the job was created more than 2 seconds ago,
    // it pre-existed — this enqueue was a no-op.
    const isDuplicate = Date.now() - job.timestamp > 2000;

    if (isDuplicate) {
        logger.info("Message already queued — skipping duplicate", {
            jobId: job.id,
            messageId: data.messageId,
            tenantId: data.tenantId,
            originalQueuedAt: new Date(job.timestamp).toISOString(),
        });
    } else {
        logger.info("Message enqueued for processing", {
            jobId: job.id,
            messageId: data.messageId,
            tenantId: data.tenantId,
            messageType: data.messageType,
        });
    }

    return job;
};
