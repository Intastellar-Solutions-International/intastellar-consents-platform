import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Domains (Remix)" }];

export default function IdDomainsRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Domains (${id})`}
      legacyHint="src/Pages/Domains/index.js"
    />
  );
}
