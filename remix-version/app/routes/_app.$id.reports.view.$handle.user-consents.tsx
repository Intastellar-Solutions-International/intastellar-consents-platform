import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "User consents (Remix)" }];

export default function IdReportsViewUserConsentsRoute() {
  const { id, handle } = useParams();
  return (
    <MigrationShell
      title={`User consents / ${handle} (${id})`}
      legacyHint="src/Pages/UserConsents/UserConsents.js"
    />
  );
}
