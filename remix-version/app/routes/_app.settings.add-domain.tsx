import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Add domain (Remix)" }];

export default function SettingsAddDomainRoute() {
  return (
    <MigrationShell title="Add domain" legacyHint="src/Pages/Settings/AddDomain/index.js" />
  );
}
