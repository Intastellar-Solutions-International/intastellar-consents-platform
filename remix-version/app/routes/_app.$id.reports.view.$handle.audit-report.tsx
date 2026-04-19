import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Audit report (Remix)" }];

export default function IdReportsViewAuditRoute() {
  const { id, handle } = useParams();
  return (
    <MigrationShell
      title={`Audit report / ${handle} (${id})`}
      legacyHint="src/Pages/Reports/AuditReport/index.js"
    />
  );
}
