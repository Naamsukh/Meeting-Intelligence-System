const STYLES: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-600",
  processing: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] || STYLES.uploaded;
  const processing = status === "processing" || status === "uploaded";
  return (
    <span className={`badge ${cls}`}>
      {processing && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {status}
    </span>
  );
}
