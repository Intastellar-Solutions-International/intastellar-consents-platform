import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Marketing report (Remix)" }];

export default function IdReportsViewMarketingRoute() {
  const { id, handle } = useParams();
  return (
    <MigrationShell
      title={`Marketing / ${handle} (${id})`}
      legacyHint="src/Pages/Reports/MarketingReport/index.js"
    />
  );
}
