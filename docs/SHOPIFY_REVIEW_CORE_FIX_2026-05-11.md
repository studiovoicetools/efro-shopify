# Shopify Review Core Fix — 2026-05-11

Status: review blocker fix plan and evidence checklist.

## Shopify reported

- Theme app block/theme extension not visible in editor.
- Widget could not be tested in storefront.
- Chat did not return meaningful product recommendations or answers.

## Fix scope

- Theme app block now renders visible setup content.
- Theme app block explicitly loads efro.js.
- efro.js avoids duplicate iframe injection.
- efro.js uses safer shop detection.
- No secrets changed.
- No billing changed.
- No deploy in this commit.

## Required manual review proof

Before resubmission:

1. Deploy Shopify extension/app version.
2. Open Shopify theme editor.
3. Confirm EFRO Sales Assistant block appears.
4. Add block to a product or home section.
5. Save theme.
6. Open storefront.
7. Confirm EFRO iframe appears.
8. Confirm chat opens.
9. Ask product recommendation question.
10. Capture screenshot or screencast.
11. Confirm no 404, 500, 300 redirect, blank page, or blocked UI.

## Still HOLD

- Resubmission before theme editor proof.
- Resubmission before chat/product recommendation proof.
- Public claims about production-grade recommendations without evidence.
