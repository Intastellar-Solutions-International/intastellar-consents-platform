import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Compare (Remix)" }];

export default function IdCompareRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Compare (${id})`}
      legacyHint="src/Pages/Reports/Compare.js"
    />
  );
}
