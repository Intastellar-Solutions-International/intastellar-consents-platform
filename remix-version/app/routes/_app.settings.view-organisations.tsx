import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "View organisations (Remix)" }];

export default function SettingsViewOrgsRoute() {
  return (
    <MigrationShell
      title="View organisations"
      legacyHint="src/Pages/Settings/ViewOrganisations/index.js"
    />
  );
}
