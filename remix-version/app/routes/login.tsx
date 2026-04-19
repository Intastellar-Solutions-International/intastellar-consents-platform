import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [
  { title: "Login | Intastellar Consents (Remix)" },
];

export default function LoginRoute() {
  return (
    <MigrationShell
      title="Login"
      legacyHint="src/Login/Login.js — add form, loaders for session, and redirect to /:platform/dashboard"
    />
  );
}
