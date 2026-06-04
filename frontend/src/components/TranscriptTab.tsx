"use client";

import { useEffect, useState } from "react";
import { api, type Segment } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

export default function TranscriptTab({ recordingId }: { recordingId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTranscript(recordingId)
      .then(setSegments)
      .finally(() => setLoading(false));
  }, [recordingId]);

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading transcript…</div>;
  }
  if (segments.length === 0) {
    return <div className="p-4 text-sm text-slate-400">No transcript available.</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-3">
        {segments.map((s) => (
          <div key={s.idx} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-brand-700">{s.speaker}</span>
              <span className="text-xs text-slate-400">
                {formatTimestamp(s.start_seconds)}
              </span>
            </div>
            <p className="text-slate-700">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
