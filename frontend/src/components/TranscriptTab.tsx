"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Segment } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

const SPEAKER_DOT_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
    </svg>
  );
}

export default function TranscriptTab({
  recordingId,
  currentTime,
  onSeek,
}: {
  recordingId: string;
  currentTime?: number;
  onSeek?: (seconds: number) => void;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Prevents the scroll event fired by our own scrollIntoView from triggering userScrolled.
  const suppressScrollRef = useRef(false);

  useEffect(() => {
    segmentRefs.current = [];
    setUserScrolled(false);
    api
      .getTranscript(recordingId)
      .then(setSegments)
      .finally(() => setLoading(false));
  }, [recordingId]);

  // Stable speaker → color index map (recomputed only when segments change).
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((s) => {
      if (!map.has(s.speaker)) map.set(s.speaker, map.size);
    });
    return map;
  }, [segments]);

  // Index of the last segment whose start_seconds ≤ currentTime.
  const activeIdx = useMemo(() => {
    if (currentTime == null || segments.length === 0) return -1;
    return segments.findLastIndex((s) => s.start_seconds <= currentTime);
  }, [segments, currentTime]);

  // Auto-scroll to the active segment — only when the user hasn't scrolled away.
  useEffect(() => {
    if (userScrolled || activeIdx < 0) return;
    const el = segmentRefs.current[activeIdx];
    if (!el) return;
    suppressScrollRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = setTimeout(() => {
      suppressScrollRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [activeIdx, userScrolled]);

  function handleScroll() {
    if (!suppressScrollRef.current) setUserScrolled(true);
  }

  function syncNow() {
    if (activeIdx < 0) return;
    setUserScrolled(false);
    const el = segmentRefs.current[activeIdx];
    if (!el) return;
    suppressScrollRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      suppressScrollRef.current = false;
    }, 800);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-500 dark:text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        Loading transcript…
      </div>
    );
  }
  if (segments.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400 dark:text-slate-500">
        No transcript available.
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-3"
      >
        <div className="space-y-0.5 px-3">
          {segments.map((s, i) => {
            const isActive = i === activeIdx;
            const colorIdx = (speakerColorMap.get(s.speaker) ?? 0) % SPEAKER_DOT_COLORS.length;
            const dotColor = SPEAKER_DOT_COLORS[colorIdx];

            return (
              <div
                key={s.idx}
                ref={(el) => { segmentRefs.current[i] = el; }}
                className={`group rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
                }`}
              >
                {/* Speaker + timestamp row */}
                <div className="mb-1 flex items-center gap-2">
                  {isActive ? (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" />
                  ) : (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                  )}
                  <span
                    className={`font-medium ${
                      isActive
                        ? "text-brand-700 dark:text-brand-300"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {s.speaker}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSeek?.(s.start_seconds)}
                    className="text-xs text-slate-400 underline decoration-dotted transition-colors hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400"
                    title={`Seek to ${formatTimestamp(s.start_seconds)}`}
                  >
                    {formatTimestamp(s.start_seconds)}
                  </button>
                </div>

                {/* Transcript text */}
                <p
                  className={`pl-4 leading-relaxed ${
                    isActive
                      ? "text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating sync button — visible only after the user scrolls away */}
      {userScrolled && activeIdx >= 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <button
            onClick={syncNow}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 active:scale-95"
          >
            <SyncIcon />
            Sync with video
          </button>
        </div>
      )}
    </div>
  );
}
