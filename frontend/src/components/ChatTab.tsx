"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage } from "@/lib/api";
import { formatTimestamp } from "@/lib/auth";

const SUGGESTIONS = [
  "What decisions were made?",
  "List the action items and owners.",
  "Summarize the key discussion points.",
];

export default function ChatTab({ recordingId }: { recordingId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMessages(recordingId).then(setMessages);
  }, [recordingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    // Optimistically show the user's message.
    const optimistic: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: q,
      sources: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await api.chat(recordingId, q);
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: res.answer,
          sources: res.sources,
          created_at: new Date().toISOString(),
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
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500">
            <p className="mb-3">Ask anything about this meeting. Try:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn-ghost text-xs" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                    <span className="font-medium">Sources: </span>
                    {m.sources.map((s, i) => (
                      <span key={s.chunk_id}>
                        {i > 0 && ", "}
                        {s.speakers ? `${s.speakers} ` : ""}@{formatTimestamp(s.start_seconds)}{" "}
                        ({Math.round(s.score * 100)}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          className="input"
          placeholder="Ask about decisions, action items, discussions…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button className="btn" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
