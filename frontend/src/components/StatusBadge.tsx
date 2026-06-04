const STYLES: Record<string, string> = {
  uploaded:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  completed:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? STYLES.uploaded;
  const processing = status === "processing" || status === "uploaded";
  return (
    <span className={`badge ${cls}`}>
      {processing && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {status}
    </span>
  );
}
