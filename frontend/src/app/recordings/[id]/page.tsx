"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatTab from "@/components/ChatTab";
import Navbar from "@/components/Navbar";
import SpeakerPanel from "@/components/SpeakerPanel";
import StatusBadge from "@/components/StatusBadge";
import TranscriptTab from "@/components/TranscriptTab";
import VideoPlayer from "@/components/VideoPlayer";
import { api, type RecordingDetail } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

export default function RecordingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [recording, setRecording] = useState<RecordingDetail | null>(null);
  const [tab, setTab] = useState<"chat" | "transcript">("chat");
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const seekTo = useCallback((seconds: number) => {
    if (mediaRef.current) mediaRef.current.currentTime = seconds;
  }, []);

  const refreshRecording = useCallback(() => {
    api.getRecording(id).then(setRecording).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    api
      .getRecording(id)
      .then(setRecording)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [id, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-red-600">{error}</p>
          <a href="/" className="btn-ghost mt-4 inline-flex">← Back to dashboard</a>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            Loading recording…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-950">
      <Navbar />

      {/* ── Page header ───────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="/"
              className="flex shrink-0 items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronLeftIcon />
              Meetings
            </a>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <FileIcon />
              <span className="truncate">{recording.original_filename}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <StatusBadge status={recording.status} />
          </div>
        </div>
      </div>

      {/* ── Split layout ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: media + intelligence */}
        <div className="flex w-1/2 flex-col border-r border-slate-200 dark:border-slate-800">

          {/* Video */}
          <div className="h-[45%] shrink-0 bg-slate-950 p-3">
            <VideoPlayer
              recording={recording}
              mediaRef={mediaRef}
              onTimeUpdate={setCurrentTime}
            />
          </div>

          {/* Speaker / intelligence panel */}
          <div className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900">
            <SpeakerPanel recording={recording} onSpeakerRenamed={refreshRecording} />
          </div>
        </div>

        {/* RIGHT: Chat / Transcript */}
        <div className="flex w-1/2 flex-col bg-white dark:bg-slate-900">

          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-900">
            {(["chat", "transcript"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-5 py-3.5 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-brand-600 dark:bg-brand-400" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "chat" ? (
              <ChatTab recordingId={recording.id} seekTo={seekTo} />
            ) : (
              <TranscriptTab
                recordingId={recording.id}
                currentTime={currentTime}
                onSeek={seekTo}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
