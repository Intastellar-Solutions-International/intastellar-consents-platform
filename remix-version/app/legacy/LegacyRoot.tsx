import { useEffect, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { assignLegacyGlobals } from "./assignLegacyGlobals";

/**
 * Mounts the legacy webpack/React Router v5 app once inside a host div.
 * Globals are assigned before `App.js` is evaluated (see `assignLegacyGlobals`).
 */
export function LegacyRoot() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        assignLegacyGlobals();
        const [{ default: App }, { createRoot }] = await Promise.all([
          import("../../../src/App.js"),
          import("react-dom/client"),
        ]);
        if (cancelled || !hostRef.current) return;
        if (!rootRef.current) {
          rootRef.current = createRoot(hostRef.current);
        }
        rootRef.current.render(<App />);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      rootRef.current?.unmount();
      rootRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <div className="p-6 font-mono text-sm text-red-600">
        Failed to load legacy app: {error}
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      id="legacy-app-host"
      className="legacy-app-host"
      suppressHydrationWarning
    />
  );
}
