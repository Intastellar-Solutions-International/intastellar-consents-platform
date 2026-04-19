import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "User consents (Remix)" }];

export default function IdReportsUserConsentsRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`User consents (${id})`}
      legacyHint="src/Pages/UserConsents/UserConsents.js"
    />
  );
}
