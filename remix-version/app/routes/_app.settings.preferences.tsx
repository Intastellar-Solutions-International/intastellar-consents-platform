import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "User preferences (Remix)" }];

export default function SettingsPreferencesRoute() {
  return (
    <MigrationShell
      title="User preferences"
      legacyHint="src/Pages/Settings/UserPreferences/index.js"
    />
  );
}
