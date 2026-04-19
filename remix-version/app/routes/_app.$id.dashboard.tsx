import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Dashboard (Remix)" }];

export default function IdDashboardRoute() {
  const { id } = useParams();
  return (
    <MigrationShell
      title={`Dashboard (${id})`}
      legacyHint={
        id === "gdpr"
          ? "src/Pages/Dashboard/Dashboard.js"
          : "src/Pages/Dashboard/ferry/Dashboard.js"
      }
    />
  );
}
