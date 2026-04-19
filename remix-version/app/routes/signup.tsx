import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Signup (Remix)" }];

export default function SignupRoute() {
  return (
    <MigrationShell
      title="Signup"
      legacyHint="src/Login/Signup.js"
    />
  );
}
