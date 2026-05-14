export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          TTB Prototype
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Alcohol Label Verification - Batch Review
        </h1>
        <p className="text-sm text-slate-600">
          Upload labels, declare the expected product facts, and review the
          automatic verdicts. Clear cases stay handled; exceptions surface with
          evidence.
        </p>
      </div>
    </header>
  );
}
