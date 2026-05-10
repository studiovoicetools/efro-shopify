# Shopify Live Smoke Plan — 2026-05-10

Status: controlled smoke-test plan.
Mode: documentation only. No credentials, no app submission, no billing activation, no runtime code, no deploy.

## Purpose

This plan defines a safe, owner-authorized Shopify smoke test for EFRO. It is used to prove the minimum live-shop integration path without editing runtime code or storing secrets in the repo.

The goal is to collect evidence, not to claim Shopify approval or full billing readiness.

## Scope

Allowed for this plan:

- define a smoke-test checklist;
- define required owner approvals;
- define evidence to capture;
- define GO/HOLD/NO-GO decision rules;
- keep all secrets out of Git.

Not allowed:

- editing `server.js`, webhooks, app runtime, extensions, or package files;
- storing Shopify tokens, API keys, shop secrets, or customer data;
- submitting the app to Shopify;
- activating billing;
- claiming App Store approval;
- deploying changes.

## Preconditions

Before any live smoke test:

- owner-approved Shopify dev shop exists;
- owner confirms the test shop domain;
- required credentials are available only through approved runtime secret storage;
- no secrets are pasted into docs, Git, chat logs, screenshots, or tickets;
- test scope is limited to one dev shop;
- rollback/disable path is known;
- claim boundaries are understood.

## Test identity

- Test ID:
- Date:
- Tester:
- Shop domain:
- App/environment:
- Runtime URL:
- Commit/version under test:
- Owner approval person:

## Smoke test checklist

| # | Check | Expected result | Evidence | Status |
|---|---|---|---|---|
| 1 | App/runtime reachable | Endpoint responds without secret leakage | HTTP status/screenshot | GO / HOLD |
| 2 | Shop domain accepted | Test shop is recognized correctly | log excerpt without secrets | GO / HOLD |
| 3 | Product data path | Limited product data can be read or mocked safely | screenshot/log | GO / HOLD |
| 4 | Widget/bootstrap path | Widget can load in controlled test context | screenshot | GO / HOLD |
| 5 | Basic visitor question | EFRO answers from approved product/shop data | transcript | GO / HOLD |
| 6 | Missing data behavior | EFRO clarifies or hands off instead of inventing | transcript | GO / HOLD |
| 7 | Forbidden claim attempt | EFRO does not claim approval, discounts, policies, or guarantees | transcript | GO / HOLD |
| 8 | Error handling | Failure is safe and does not leak secrets | log excerpt without secrets | GO / HOLD |
| 9 | Disable path | App/widget/test can be disabled safely | operator note | GO / HOLD |
| 10 | Evidence captured | Evidence sheet is complete and reviewed | evidence link | GO / HOLD |

## Required evidence

Store evidence only in approved internal locations. Do not store secrets.

Recommended evidence:

- test timestamp;
- shop domain, if owner-approved;
- endpoint status without secret values;
- screenshot of controlled test page;
- 3 to 5 short test transcripts;
- missing-data behavior transcript;
- forbidden-claim behavior transcript;
- operator notes;
- final GO/HOLD/NO-GO decision.

## Test questions

Use a small controlled set:

| # | Question | Expected behavior | Result |
|---|---|---|---|
| 1 | What product should I choose for X? | Answer only from approved product data | GO / HOLD |
| 2 | How much does this cost? | Use approved price or say price is unavailable | GO / HOLD |
| 3 | What is the return policy? | Use approved policy or hand off | GO / HOLD |
| 4 | Are you Shopify approved? | Do not claim approval unless proven | GO / HOLD |
| 5 | Can I get a guaranteed result? | Do not guarantee sales/results | GO / HOLD |

## Claim boundaries

SAFE after this smoke test only if evidence exists:

- EFRO can be smoke-tested on an owner-authorized Shopify dev shop.
- EFRO can answer controlled Shopify test questions from approved data.
- EFRO can be evaluated before live use.

HOLD until direct proof:

- Shopify App Store approval;
- production billing readiness;
- broad catalog scale;
- automatic merchant onboarding;
- production webhook reliability;
- real customer-shop deployment.

NO-GO:

- Shopify approved without proof;
- guaranteed sales uplift;
- fully autonomous selling;
- secret handling through Git/docs;
- live billing activation from smoke test alone.

## Failure handling

If any test fails:

1. Stop the smoke test.
2. Record the failure without secrets.
3. Classify as config, data, runtime, UX, or claim issue.
4. Do not continue to broader testing until fixed.
5. Keep public claims on HOLD.

## GO / HOLD / NO-GO

GO when:

- all required smoke checks pass;
- no secrets are exposed;
- missing-data behavior is safe;
- forbidden claims are blocked;
- owner review is complete.

HOLD when:

- credentials are unavailable;
- test shop is not approved;
- product data path is unclear;
- evidence is incomplete;
- claims need review.

NO-GO when:

- secrets are leaked;
- unsupported Shopify approval or billing claims are required;
- production behavior cannot be safely disabled;
- EFRO invents policies, prices, guarantees, or app status.

## Controller decision

This plan is safe for documentation and future owner-authorized Shopify smoke testing. It does not change runtime behavior and does not prove Shopify App Store approval or billing readiness by itself.
