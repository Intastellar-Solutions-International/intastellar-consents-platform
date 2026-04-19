import { Link, Outlet, useLocation } from "@remix-run/react";

/**
 * Pathless layout: same URL shape as the legacy app, wraps authenticated-style pages.
 * Replace this chrome with ported Header / Nav / Footer from `src/`.
 */
export default function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <Link to="/" className="font-semibold text-slate-800">
            Intastellar Consents (Remix)
          </Link>
          <span className="font-mono text-xs text-slate-500">{pathname}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        Port footer from <code className="rounded bg-slate-100 px-1">src/components/Footer</code>
      </footer>
    </div>
  );
}
