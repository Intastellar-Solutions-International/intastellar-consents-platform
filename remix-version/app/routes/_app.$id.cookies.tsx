import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Cookies dashboard (Remix)" }];

export default function IdCookiesRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Cookies (${id})`}
      legacyHint="src/Pages/Dashboard/CookiesDashboard.js"
    />
  );
}
