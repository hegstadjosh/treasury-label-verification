"use client";

export function BatchActionBar({
  message,
  busy,
  canAnalyze,
  onReset,
  onAnalyze,
}: {
  message: string;
  busy: boolean;
  canAnalyze: boolean;
  onReset: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">{message}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className="inline-flex items-center justify-center rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Spinner /> : null}
          <span className={busy ? "ml-2" : ""}>
            {busy ? "Analyzing..." : "Analyze batch"}
          </span>
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg aria-hidden className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <span className="font-semibold">Analysis failed. </span>
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 shadow-sm hover:bg-rose-100 sm:self-auto"
      >
        Retry
      </button>
    </div>
  );
}
