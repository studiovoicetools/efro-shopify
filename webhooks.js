/**
 * Legacy placeholder.
 *
 * Active runtime entrypoint is server.js via package.json:
 *   "start": "node server.js"
 *
 * Webhook HMAC validation, operational webhooks, and GDPR handlers live in server.js.
 * This file is intentionally disabled so scanners do not treat old template code as production code.
 */

export function validateWebhookHmac() {
  throw new Error("Legacy webhook module disabled. Use server.js webhook handlers.");
}

export async function handleOrdersCreateWebhook() {
  throw new Error("Legacy webhook module disabled. Use server.js operational webhook handlers.");
}
