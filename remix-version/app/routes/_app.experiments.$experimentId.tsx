import type { MetaFunction } from "@remix-run/node";
import { useParams } from "@remix-run/react";
import { MigrationShell } from "~/components/MigrationShell";

export const meta: MetaFunction = () => [{ title: "Experiment (Remix)" }];

export default function ExperimentDetailRoute() {
  const { experimentId } = useParams();
  return (
    <MigrationShell
      title={`Experiment ${experimentId}`}
      legacyHint="src/Pages/Experiments/Experiments.js (detail)"
    />
  );
}
