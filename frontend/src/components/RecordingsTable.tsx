"use client";

import { useRouter } from "next/navigation";
import type { Recording } from "@/lib/api";
import StatusBadge from "./StatusBadge";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function RecordingsTable({ recordings }: { recordings: Recording[] }) {
  const router = useRouter();

  if (recordings.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No uploads yet. Add a recording or transcript to get started.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left dark:bg-slate-800/50">
          <tr>
            {["File", "Type", "Size", "Status", "Uploaded"].map((h) => (
              <th key={h} className="section-label px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {recordings.map((r) => {
            const clickable = r.status === "completed";
            return (
              <tr
                key={r.id}
                onClick={() => clickable && router.push(`/recordings/${r.id}`)}
                className={`transition-colors ${
                  clickable
                    ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : "opacity-70"
                }`}
                title={r.status === "failed" ? r.error || "Processing failed" : undefined}
              >
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  {r.original_filename}
                </td>
                <td className="px-4 py-3 capitalize text-slate-500 dark:text-slate-400">
                  {r.media_type}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {formatBytes(r.size_bytes)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {new Date(r.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
