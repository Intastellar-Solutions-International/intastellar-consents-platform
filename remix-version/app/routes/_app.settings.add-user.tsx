import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Add user (Remix)" }];

export default function SettingsAddUserRoute() {
  return (
    <MigrationShell title="Add user" legacyHint="src/Pages/Settings/AddUser/index.js" />
  );
}
