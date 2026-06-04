"use client";

import React from "react";
import { api, type RecordingDetail } from "@/lib/api";

function FilmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}

export default function VideoPlayer({
  recording,
  mediaRef,
  onTimeUpdate,
}: {
  recording: RecordingDetail;
  mediaRef?: React.RefObject<HTMLMediaElement | null>;
  onTimeUpdate?: (t: number) => void;
}) {
  function handleTimeUpdate(e: React.SyntheticEvent<HTMLMediaElement>) {
    onTimeUpdate?.(e.currentTarget.currentTime);
  }
  if (recording.media_type !== "video") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-slate-800 text-center">
        <div className="flex flex-col items-center gap-3">
          <FilmIcon />
          <div>
            <p className="text-sm font-medium text-slate-300">Transcript-only upload</p>
            <p className="mt-0.5 text-xs text-slate-500">{recording.original_filename}</p>
          </div>
        </div>
      </div>
    );
  }

  const isAudio = (recording.mime_type || "").startsWith("audio");
  const src = api.mediaUrl(recording.id);

  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-black">
      {isAudio ? (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          controls
          className="w-full px-6"
          src={src}
          onTimeUpdate={handleTimeUpdate}
        />
      ) : (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          controls
          className="max-h-full max-w-full rounded-lg"
          src={src}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
    </div>
  );
}
