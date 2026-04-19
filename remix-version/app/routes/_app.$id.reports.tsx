import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Reports (Remix)" }];

export default function IdReportsRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Reports (${id})`}
      legacyHint="src/Pages/Reports/Reports.js"
    />
  );
}
