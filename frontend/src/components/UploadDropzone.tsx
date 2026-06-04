"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import MicRecorder from "./MicRecorder";

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

export default function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadRecording(file);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Upload a meeting
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Drop a recording (audio/video) or a transcript (.txt, .vtt, .srt). Processing
            happens in the background.
          </p>
        </div>
        <MicRecorder onRecorded={(f) => handleFiles([f] as unknown as FileList)} />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20"
            : "border-slate-200 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-brand-700 dark:hover:bg-slate-800/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".txt,.vtt,.srt,.md,audio/*,video/*"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <UploadIcon />
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {uploading ? "Uploading…" : "Click to browse or drag files here"}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Max 500 MB per file</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
