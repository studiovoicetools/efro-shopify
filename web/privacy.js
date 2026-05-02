/**
 * Legacy Shopify template privacy module disabled.
 *
 * Mandatory privacy compliance webhooks are configured in shopify.app.toml and handled by server.js:
 * - /api/gdpr/customers-data-request
 * - /api/gdpr/customers-redact
 * - /api/gdpr/shop-redact
 *
 * The active server validates Shopify HMAC, records best-effort privacy events,
 * and performs best-effort customer/shop data deletion or anonymization.
 */

export default {};
