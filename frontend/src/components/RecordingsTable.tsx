"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Recording } from "@/lib/api";
import StatusBadge from "./StatusBadge";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function DeleteCell({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation(); // prevent row click navigating to the recording
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    try {
      await api.deleteRecording(id);
      onDeleted();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button
          onClick={handleCancel}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleDelete}
      title="Delete recording"
      className="rounded-md p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20 dark:hover:text-red-400"
    >
      <TrashIcon />
    </button>
  );
}

export default function RecordingsTable({
  recordings,
  onDeleted,
}: {
  recordings: Recording[];
  onDeleted: () => void;
}) {
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
            {["File", "Type", "Size", "Status", "Uploaded", ""].map((h, i) => (
              <th key={i} className="section-label px-4 py-3">
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
                className={`group transition-colors ${
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
                <td className="px-4 py-3 text-right">
                  <DeleteCell id={r.id} onDeleted={onDeleted} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
