"use client";

/** Admin error boundary: shown when a page fails to render (e.g. the database is unreachable). */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-sm border border-danger/30 bg-danger-soft p-6">
      <h1 className="font-display text-2xl text-ink">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The server ran into a problem, possibly a temporary database outage. No changes were made by loading this page.
        {error.digest && <span className="block mt-1 text-xs text-muted">Reference for support: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className="btn btn-sm btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
