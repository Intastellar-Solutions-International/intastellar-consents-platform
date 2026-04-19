import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Cookie check (Remix)" }];

export default function CheckRoute() {
  return (
    <MigrationShell
      title="Cookie / crawler check"
      legacyHint="src/components/Crawler + App.js route /check"
    />
  );
}
