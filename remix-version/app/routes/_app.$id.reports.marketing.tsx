import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Marketing report (Remix)" }];

export default function IdReportsMarketingRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Marketing report (${id})`}
      legacyHint="src/Pages/Reports/MarketingReport/index.js"
    />
  );
}
