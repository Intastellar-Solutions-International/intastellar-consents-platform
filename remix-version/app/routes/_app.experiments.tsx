import type { MetaFunction } from "@remix-run/node";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Experiments (Remix)" }];

export default function ExperimentsRoute() {
  return (
    <MigrationShell title="Experiments" legacyHint="src/Pages/Experiments/Experiments.js" />
  );
}
