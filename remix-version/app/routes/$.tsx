import { LegacyRoot } from "~/legacy/LegacyRoot";

/**
 * Single catch-all route for every URL so the legacy BrowserRouter is never
 * torn down when the address bar path changes.
 */
export default function LegacyCatchAll() {
  return <LegacyRoot />;
}
