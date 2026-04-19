import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Create user (Remix)" }];

export default function SettingsCreateUserRoute() {
  return (
    <MigrationShell title="Create user" legacyHint="src/Pages/Settings/CreateUser/index.js" />
  );
}
