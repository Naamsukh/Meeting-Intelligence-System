"use client";

import { useEffect, useRef, useState } from "react";
import { api, type RecordingDetail, type Speaker } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-500">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-500">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="12" y1="9" x2="12" y2="15" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
];

function speakerInitials(label: string) {
  return label.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 2).toUpperCase() || "?";
}

function SpeakerRow({
  speaker,
  colorClass,
  recordingId,
  onRenamed,
}: {
  speaker: Speaker;
  colorClass: string;
  recordingId: string;
  onRenamed: (updated: Speaker) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(speaker.label);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(speaker.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    const name = draft.trim();
    if (!name || name === speaker.label) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.renameSpeaker(recordingId, speaker.id, name);
      onRenamed(updated);
      setEditing(false);
    } catch {
      // revert on error
      setDraft(speaker.label);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setDraft(speaker.label); setEditing(false); }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${colorClass}`}>
        {speakerInitials(editing ? draft : speaker.label)}
      </span>

      <div className="flex flex-1 min-w-0 items-center gap-1">
        {editing ? (
          <input
            ref={inputRef}
            className="flex-1 min-w-0 rounded border border-brand-300 bg-white px-1.5 py-0.5 text-sm font-medium text-slate-900 outline-none focus:ring-1 focus:ring-brand-500 dark:border-brand-700 dark:bg-slate-700 dark:text-slate-100"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            disabled={saving}
            autoFocus
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {speaker.label}
            </span>
            <button
              type="button"
              onClick={startEdit}
              className="ml-1 shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-slate-700 group-hover:opacity-100 dark:hover:text-slate-200"
              title="Rename speaker"
            >
              <PencilIcon />
            </button>
          </>
        )}
      </div>

      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
        {formatTimestamp(speaker.total_speaking_seconds)} · {speaker.segment_count} turns
      </span>
    </li>
  );
}

export default function SpeakerPanel({
  recording,
  onSpeakerRenamed,
}: {
  recording: RecordingDetail;
  onSpeakerRenamed?: () => void;
}) {
  const [speakers, setSpeakers] = useState<Speaker[]>(recording.speakers);

  useEffect(() => {
    setSpeakers(recording.speakers);
  }, [recording.speakers]);

  function handleRenamed(updated: Speaker) {
    setSpeakers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    onSpeakerRenamed?.();
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">

      {/* Summary */}
      {recording.summary && (
        <section>
          <p className="section-label mb-2">Summary</p>
          <div className="card-inset">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {recording.summary}
            </p>
          </div>
        </section>
      )}

      {/* Speakers */}
      <section>
        <p className="section-label mb-2">Speakers</p>
        {speakers.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No speaker data.</p>
        ) : (
          <ul className="space-y-2">
            {speakers.map((s, i) => (
              <div key={s.id} className="group">
                <SpeakerRow
                  speaker={s}
                  colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                  recordingId={recording.id}
                  onRenamed={handleRenamed}
                />
              </div>
            ))}
          </ul>
        )}
      </section>

      {/* Decisions */}
      <section>
        <p className="section-label mb-2">Decisions</p>
        {recording.decisions.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">None detected.</p>
        ) : (
          <ul className="space-y-1.5">
            {recording.decisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <CheckIcon />
                {d.description}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Action items */}
      <section>
        <p className="section-label mb-2">Action items</p>
        {recording.action_items.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">None detected.</p>
        ) : (
          <ul className="space-y-2">
            {recording.action_items.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 dark:border-amber-900/30 dark:bg-amber-900/10"
              >
                <TaskIcon />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200">{a.description}</p>
                  {(a.owner || a.due) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.owner && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          {a.owner}
                        </span>
                      )}
                      {a.due && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          due {a.due}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
