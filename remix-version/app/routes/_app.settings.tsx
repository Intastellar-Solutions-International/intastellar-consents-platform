import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Settings (Remix)" }];

export default function SettingsRoute() {
  return (
    <MigrationShell
      title="Settings"
      legacyHint="src/Pages/Settings/index.js"
    />
  );
}
