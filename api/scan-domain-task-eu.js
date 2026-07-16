/**
 * POST /api/scan-domain-task-eu
 *
 * Regional variant of scan-domain-task pinned to EU (Frankfurt).
 * Routed to by pre-consent-scan-public when location=eu is requested.
 */
export { default } from "./scan-domain-task.js";
