import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Auth login (Remix)" }];

export default function AuthLoginRoute() {
  return (
    <MigrationShell
      title="Auth login"
      legacyHint="src/Login/AuthLogin.js"
    />
  );
}
