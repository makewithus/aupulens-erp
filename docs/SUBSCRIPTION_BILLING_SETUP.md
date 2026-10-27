# Subscription & Billing Setup Guide

This guide lists configuration names only. Never place live values in tests, reports, source control, or browser bundles.

## Razorpay configuration

- `RAZORPAY_KEY_ID`: server-side API key ID for the selected environment.
- `RAZORPAY_KEY_SECRET`: server-only API secret matching that key ID.
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`: public checkout key ID only; must match the selected server environment.
- `RAZORPAY_WEBHOOK_SECRET`: secret configured for the matching test or live webhook endpoint.
- Razorpay test and live dashboard credentials and webhook endpoints must be separate. Do not mix environments.

The current accepted implementation uses the Razorpay Payments Orders flow for one-time upgrades. Razorpay Subscriptions API integration and external subscription-plan identifiers require explicit configuration before AutoPay can be enabled. No live subscription API calls are made unless the required credentials and plan mapping are present.

## Webhooks

Configure the provider webhook endpoint at `/api/billing/webhooks/razorpay` over HTTPS. Set the exact webhook secret for that environment and subscribe only to events implemented and tested in the application. Verify signatures against the raw request body. Keep event IDs durable so provider redelivery can be deduplicated.

## SMTP / billing notifications

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or `SMTP_PASSWORD`) and the approved sender identity. Billing notifications must use a sandbox/test recipient in test runs. Delivery remains blocked until a real provider is configured and queue delivery is verified.

## Scheduler

Configure the deployment scheduler to call `GET /api/cron/billing/sweep` over HTTPS with `CRON_SECRET`. Use one scheduler identity and safe repeated invocation. Never run production sweeps against test data or test sweeps against Atlas.

## Disposable database tests

Set `QA_DISPOSABLE_MONGO_PORT` to a local MongoDB replica-set listener on a non-default port. The harness accepts only loopback test database names and rewrites Mongoose connections to that port. Billing lifecycle tests use a unique database per run and verify the replica set before fixture writes. Never set `BILLING_TEST_MONGO_URI` to Atlas or another shared database.

## Decisions required before production

- Renewal retry intervals, maximum attempts, and recovery window.
- Access/entitlement behavior after the stated three-day grace period.
- Whether Razorpay Subscriptions is enabled for this merchant, supported payment methods, authorization expiry, and duration/total cycle policy.
- Approved refund delegation and partial refund policy.
- Credit-note GST/tax allocation and invoice correction policy, signed off by finance/accountant.
- Existing customer pricing when catalog prices change; trial/coupon eligibility; reactivation semantics.
- Billing notification event scope, sender identity, retention, and recipient policy.

A missing decision must remain a configuration/release gate; do not infer a commercial, tax, or access policy from implementation defaults.
