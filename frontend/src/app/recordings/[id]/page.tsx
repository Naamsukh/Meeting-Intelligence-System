"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ChatTab from "@/components/ChatTab";
import Navbar from "@/components/Navbar";
import SpeakerPanel from "@/components/SpeakerPanel";
import TranscriptTab from "@/components/TranscriptTab";
import VideoPlayer from "@/components/VideoPlayer";
import { api, type RecordingDetail } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export default function RecordingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [recording, setRecording] = useState<RecordingDetail | null>(null);
  const [tab, setTab] = useState<"chat" | "transcript">("chat");
  const [error, setError] = useState<string | null>(null);

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
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-sm text-red-600">{error}</p>
          <a href="/" className="btn-ghost mt-4">
            ← Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <div className="border-b border-slate-200 bg-white px-4 py-2">
        <a href="/" className="text-sm text-brand-600 hover:underline">
          ← Back
        </a>
        <span className="ml-3 font-medium">{recording.original_filename}</span>
      </div>

      {/* Split layout: left 50% (media + speakers stacked), right 50% (tabs). */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT 50% width */}
        <div className="flex w-1/2 flex-col border-r border-slate-200">
          {/* top 50% height: media */}
          <div className="h-1/2 border-b border-slate-200 bg-slate-900 p-3">
            <VideoPlayer recording={recording} />
          </div>
          {/* bottom 50% height: speaker details + intelligence */}
          <div className="h-1/2 overflow-hidden bg-white">
            <SpeakerPanel recording={recording} />
          </div>
        </div>

        {/* RIGHT 50% width: Chat / Transcript tabs */}
        <div className="flex w-1/2 flex-col bg-white">
          <div className="flex border-b border-slate-200">
            {(["chat", "transcript"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "border-b-2 border-brand-600 text-brand-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === "chat" ? (
              <ChatTab recordingId={recording.id} />
            ) : (
              <TranscriptTab recordingId={recording.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
