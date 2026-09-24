/**
 * How long an emailed estimate or variation link can still record a decision.
 * After this the price is stale: the owner is asked to ring rather than accept
 * last month's number. Shared by the estimate and variation pages and actions.
 */
export const DECISION_LINK_DAYS = 30;

/** Anything sent at or before this instant has expired. */
export function decisionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DECISION_LINK_DAYS * 24 * 60 * 60 * 1000);
}
