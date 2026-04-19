import { LegacyRoot } from "~/legacy/LegacyRoot";

/**
 * Client-only catch-all: hosts the legacy webpack/React Router v5 app in one mount
 * so in-app navigations do not remount the tree (single Remix route for all URLs).
 */
export default function LegacyCatchAll() {
  return <LegacyRoot />;
}
