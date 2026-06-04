"use client";

import { type RecordingDetail } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

export default function SpeakerPanel({ recording }: { recording: RecordingDetail }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      {recording.summary && (
        <section className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Summary
          </h3>
          <p className="text-sm text-slate-700">{recording.summary}</p>
        </section>
      )}

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Speakers
        </h3>
        {recording.speakers.length === 0 ? (
          <p className="text-sm text-slate-400">No speaker data.</p>
        ) : (
          <ul className="space-y-2">
            {recording.speakers.map((s) => (
              <li
                key={s.label}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{s.label}</span>
                <span className="text-slate-500">
                  {formatTimestamp(s.total_speaking_seconds)} · {s.segment_count} turns
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Decisions
          </h3>
          {recording.decisions.length === 0 ? (
            <p className="text-sm text-slate-400">None detected.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {recording.decisions.map((d, i) => (
                <li key={i}>{d.description}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Action items
          </h3>
          {recording.action_items.length === 0 ? (
            <p className="text-sm text-slate-400">None detected.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {recording.action_items.map((a, i) => (
                <li key={i} className="rounded-md bg-amber-50 px-3 py-2">
                  <span>{a.description}</span>
                  {(a.owner || a.due) && (
                    <span className="ml-1 text-xs text-slate-500">
                      {a.owner ? `· ${a.owner}` : ""} {a.due ? `· due ${a.due}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
