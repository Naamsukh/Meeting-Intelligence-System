"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import MicRecorder from "./MicRecorder";

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
      // Fire uploads; the backend processes asynchronously, so we return fast.
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Upload a meeting</h2>
          <p className="text-sm text-slate-500">
            Drop a recording (audio/video) or a transcript (.txt, .vtt, .srt). Processing
            happens in the background.
          </p>
        </div>
        <MicRecorder onRecorded={(f) => handleFiles([f] as unknown as FileList)} />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:bg-slate-50"
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
        <p className="text-sm font-medium">
          {uploading ? "Uploading…" : "Click to browse or drag files here"}
        </p>
        <p className="mt-1 text-xs text-slate-400">Max 500 MB per file</p>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
