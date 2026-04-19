import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "View users (Remix)" }];

export default function SettingsViewUsersRoute() {
  return (
    <MigrationShell title="View users" legacyHint="src/Pages/Settings/ViewUsers/index.js" />
  );
}
