import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Reports (domain) (Remix)" }];

export default function IdReportsViewHandleRoute() {
  const { id, handle } = useParams();
  return (
    <MigrationShell
      title={`Reports / ${handle} (${id})`}
      legacyHint="src/Pages/Reports/Reports.js (domain-scoped /view/:handle)"
    />
  );
}
