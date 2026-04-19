import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "GDPR config (Remix)" }];

/** Legacy route was empty in App.js — confirm product intent before porting. */
export default function SettingsConfigGdprRoute() {
  return (
    <MigrationShell
      title="GDPR configuration"
      legacyHint="src/App.js Route /settings/config-gdpr (empty)"
    />
  );
}
