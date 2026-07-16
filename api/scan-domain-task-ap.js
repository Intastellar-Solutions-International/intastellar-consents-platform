/**
 * POST /api/scan-domain-task-ap
 *
 * Regional variant of scan-domain-task pinned to Asia Pacific (Singapore).
 * Routed to by pre-consent-scan-public when location=ap is requested.
 */
export { default } from "./scan-domain-task.js";
