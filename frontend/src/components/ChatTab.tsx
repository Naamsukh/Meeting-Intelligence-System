"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type ChatSource } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

const SUGGESTIONS = [
  "What decisions were made?",
  "List the action items and owners.",
  "Summarize the key discussion points.",
];

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function AssistantAvatar() {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
      AI
    </span>
  );
}

function SourcesList({
  sources,
  seekTo,
}: {
  sources: ChatSource[];
  seekTo?: (seconds: number) => void;
}) {
  return (
    <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
      <span className="font-medium text-slate-500 dark:text-slate-400">Sources: </span>
      {sources.map((s, i) => (
        <span key={s.chunk_id}>
          {i > 0 && ", "}
          {s.speakers ? `${s.speakers} ` : ""}
          <button
            type="button"
            onClick={() => seekTo?.(s.start_seconds)}
            className="underline decoration-dotted transition-colors hover:text-brand-600 dark:hover:text-brand-400"
            title={`Seek to ${formatTimestamp(s.start_seconds)}`}
          >
            @{formatTimestamp(s.start_seconds)}
          </button>{" "}
          ({Math.round(s.score * 100)}%)
        </span>
      ))}
    </div>
  );
}

export default function ChatTab({
  recordingId,
  seekTo,
}: {
  recordingId: string;
  seekTo?: (seconds: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMessages(recordingId).then(setMessages);
  }, [recordingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, streamText]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setStreamText("");

    const optimistic: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: q,
      sources: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    const startTime = Date.now();

    try {
      let accumulated = "";
      let finalSources: ChatSource[] = [];

      for await (const event of api.chatStream(recordingId, q)) {
        if (event.type === "delta") {
          accumulated += event.text;
          setStreamText(accumulated);
        } else if (event.type === "done") {
          finalSources = event.sources;
        }
      }

      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: accumulated,
          sources: finalSources,
          created_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: err instanceof Error ? `Error: ${err.message}` : "Something went wrong.",
          sources: null,
          created_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        },
      ]);
    } finally {
      setSending(false);
      setStreamText("");
    }
  }

  return (
    <div className="flex h-full flex-col">

      {/* Message area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Ask anything about this meeting
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/40"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2">
                <AssistantAvatar />
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {m.content}
                  </p>
                  {m.sources && m.sources.length > 0 && (
                    <SourcesList sources={m.sources} seekTo={seekTo} />
                  )}
                  {m.duration_ms != null && (
                    <p className="mt-1.5 text-right text-[10px] text-slate-400 dark:text-slate-500">
                      {m.duration_ms < 1000
                        ? `${m.duration_ms}ms`
                        : `${(m.duration_ms / 1000).toFixed(1)}s`}
                    </p>
                  )}
                </div>
              </div>
            )
          )}

          {/* Streaming assistant message */}
          {sending && (
            <div className="flex items-start gap-2">
              <AssistantAvatar />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                {streamText ? (
                  <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {streamText}
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-slate-500 align-middle" />
                  </p>
                ) : (
                  <div className="flex items-center gap-1 px-0 py-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500"
                        style={{ animation: `bounce-dot 1.4s ease-in-out ${i * 0.16}s infinite` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex shrink-0 gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <input
          className="input"
          placeholder="Ask about decisions, action items, discussions…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          className="btn shrink-0 px-3"
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
