// routes/webhook.routes.ts
//
// Mounts the two Meta webhook endpoints:
//   GET  /webhook  — verification handshake (Meta calls once during setup)
//   POST /webhook  — inbound messages and status updates
//
// Note: express.raw({ type: 'application/json' }) is already applied to /webhook
// in app.ts BEFORE express.json(). The raw body arrives as Buffer in the controller.
// Do NOT add any JSON body parser here — it would destroy the raw bytes needed
// for HMAC-SHA256 signature verification.

import { Router } from "express";
import {
    verifyWebhook,
    receiveWebhook,
} from "../controllers/webhook.controller.js";

const router = Router();

// Meta verification handshake — GET /webhook
router.get("/", verifyWebhook);

// Inbound messages + status updates — POST /webhook
router.post("/", receiveWebhook);

export default router;
