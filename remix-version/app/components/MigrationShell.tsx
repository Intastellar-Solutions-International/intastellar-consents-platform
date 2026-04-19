import { Link } from "@remix-run/react";

type Props = {
  title: string;
  /** Original component or area in the webpack app (for porting). */
  legacyHint: string;
};

export function MigrationShell({ title, legacyHint }: Props) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Remix migration
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-3 text-slate-600">
        This route is wired in <code className="rounded bg-slate-100 px-1">remix-version</code>.
        Next step: move loaders/actions and UI from the legacy app into this route module.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        <span className="font-medium text-slate-700">Legacy reference:</span>{" "}
        <code className="break-all rounded bg-slate-100 px-1 text-slate-800">
          {legacyHint}
        </code>
      </p>
      <nav className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link className="text-blue-700 underline" to="/login">
          /login
        </Link>
        <Link className="text-blue-700 underline" to="/gdpr/dashboard">
          /gdpr/dashboard
        </Link>
        <Link className="text-blue-700 underline" to="/settings">
          /settings
        </Link>
      </nav>
    </div>
  );
}
