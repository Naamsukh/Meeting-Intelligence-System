"use client";

import { api, type RecordingDetail } from "@/lib/api";

export default function VideoPlayer({ recording }: { recording: RecordingDetail }) {
  if (recording.media_type !== "video") {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-slate-900 text-center text-slate-400">
        <div>
          <p className="text-sm font-medium">Transcript-only upload</p>
          <p className="mt-1 text-xs">No media to play for {recording.original_filename}</p>
        </div>
      </div>
    );
  }

  const isAudio = (recording.mime_type || "").startsWith("audio");
  const src = api.mediaUrl(recording.id);

  return (
    <div className="flex h-full items-center justify-center rounded-lg bg-black">
      {isAudio ? (
        <audio controls className="w-full px-6" src={src} />
      ) : (
        <video controls className="max-h-full max-w-full" src={src} />
      )}
    </div>
  );
}
