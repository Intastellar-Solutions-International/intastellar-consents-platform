import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Create organisation (Remix)" }];

export default function SettingsCreateOrgRoute() {
  return (
    <MigrationShell
      title="Create organisation"
      legacyHint="src/Pages/Settings/CreateOrganisation"
    />
  );
}
