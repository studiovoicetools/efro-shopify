# Shopify Managed Pricing Status Helper — 2026-05-04

## Status

Safe read-only compatibility layer. No production deploy, no real charges, no Partner Dashboard changes, no secrets.

## What was built

- Read-only Managed Pricing helpers in `server.js`.
- Pricing page URL helper for `https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans`.
- Read-only status endpoint: `GET /api/billing/managed-pricing/status?shop=<shop>`.
- Embedded app billing status card showing provider, status, EFRO plan, and a non-blocking Shopify plan-management CTA.
- Sync contract fields prepared in the endpoint response shape.

## Why no appSubscriptionCreate

EFRO is using Shopify Managed Pricing compatibility first. Shopify should own plan purchase, cancellation, trial behavior, plan changes, and proration. Creating app subscriptions in code would increase review risk and duplicate Managed Pricing behavior.

## Why no hard redirect

OAuth and app install review must stay stable. The app does not redirect merchants to billing during OAuth. The embedded UI only displays status and a manual CTA.

## Pricing Page URL

The helper derives the Shopify admin store handle from `<shop>.myshopify.com` and combines it with `SHOPIFY_APP_HANDLE` or the default app handle `efro-ki-verkaufsassistent`.

If app handle changes in Shopify, `SHOPIFY_APP_HANDLE` must be configured. If no valid handle exists, the CTA must stay disabled.

## Plan Mapping

Initial EFRO mapping:

- Starter -> `starter`
- Growth -> `growth`
- Premium -> `premium`
- Enterprise / private / managed / custom -> `enterprise`

Current mapping is intentionally conservative and treats unmapped or localized names as `unknown`. TODO: configure stable Shopify Managed Pricing plan handles/IDs from the Partner Dashboard and map those instead of relying only on visible plan names.

## Read-only Subscription Query

Prepared query:

```graphql
query EfroReadOnlyManagedPricingStatus {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      test
      trialDays
      currentPeriodEnd
    }
  }
}
```

Failures return `unknown`. Unknown status must not blindly unlock paid features.

## Sync Contract to EFRO

Prepared response fields:

- `shopDomain`
- `billingProvider: shopify_managed_pricing`
- `billingStatus`
- `efroPlanKey`
- `shopifySubscriptionId`
- `currentPeriodEnd`
- `test`
- `lastCheckedAt`
- `pricingPageUrl`

No cross-repo sync is implemented yet.

## Known Shopify Risks

- `activeSubscriptions` can have edge cases during trial, cancellation, reinstall, and plan changes.
- Localized plan names are not stable enough as the only mapping truth.
- Pricing page URL requires correctly configured Partner Dashboard plans and app handle.
- Billing UI must not block privacy, support, health, uninstall, or GDPR paths.

## Open Partner Dashboard Steps

- Configure Managed Pricing plans for Starter, Growth, Premium.
- Decide whether Enterprise is private/custom/managed.
- Decide how setup fees are represented or handled outside Managed Pricing.
- Confirm final app handle for pricing page URL.
- Capture stable plan identifiers for mapping.

## Later Live Tests

- Dev-store install with no plan.
- Pricing page CTA opens the intended Shopify plan page.
- Active plan is reflected by `currentAppInstallation.activeSubscriptions`.
- Trial and cancellation states normalize correctly.
- Unknown/error state does not unlock paid features.

## Not changed

- No `appSubscriptionCreate`.
- No Shopify Billing API charge creation.
- No Stripe for Shopify merchants.
- No hard billing redirect in OAuth.
- No Partner Dashboard changes.
- No production deploy.
