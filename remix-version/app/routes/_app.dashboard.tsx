import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Dashboard picker (Remix)" }];

export default function DashboardPickerRoute() {
  return (
    <MigrationShell
      title="Platform selector (/dashboard)"
      legacyHint="src/App.js Route /dashboard → PlatformSelector"
    />
  );
}
