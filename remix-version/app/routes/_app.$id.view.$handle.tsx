import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Domain view (Remix)" }];

export default function IdViewHandleRoute() {
  const { id, handle } = useParams();
  return (
    <MigrationShell
      title={`View ${handle} (${id})`}
      legacyHint="src/Pages/Dashboard/Dashboard.js (same shell as /:id/dashboard with domain handle)"
    />
  );
}
