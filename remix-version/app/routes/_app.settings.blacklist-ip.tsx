import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Blacklist IP (Remix)" }];

export default function SettingsBlacklistRoute() {
  return (
    <MigrationShell title="Blacklist IP" legacyHint="src/Pages/Settings/BlacklistIp/index.js" />
  );
}
