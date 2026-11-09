/**
 * Opportunistic background runner — deprecated & disabled in resource optimization.
 * Scheduled background jobs are now strictly executed via the dedicated runner/cron
 * and never on user-interactive requests.
 */
export function maybeTriggerOpportunisticRun(): void {
  // No-op to prevent Vercel Fluid Active CPU consumption on user requests
}
