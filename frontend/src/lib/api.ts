import { getToken } from "./auth";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type Recording = {
  id: string;
  original_filename: string;
  media_type: string;
  mime_type: string | null;
  size_bytes: number;
  status: string;
  error: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type Speaker = {
  id: number;
  label: string;
  total_speaking_seconds: number;
  segment_count: number;
};

export type ActionItem = { description: string; owner: string | null; due: string | null };
export type Decision = { description: string };

export type RecordingDetail = Recording & {
  summary: string | null;
  speakers: Speaker[];
  action_items: ActionItem[];
  decisions: Decision[];
};

export type Segment = {
  idx: number;
  speaker: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
};

export type ChatSource = {
  chunk_id: number;
  chunk_index: number;
  start_seconds: number;
  end_seconds: number;
  speakers: string | null;
  score: number;
};

export type ChatMessage = {
  id: number;
  role: string;
  content: string;
  sources: ChatSource[] | null;
  created_at: string;
  duration_ms?: number;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; sources: ChatSource[] };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: string; email: string }>("/auth/me"),

  listRecordings: () => request<Recording[]>("/recordings"),
  getRecording: (id: string) => request<RecordingDetail>(`/recordings/${id}`),
  getTranscript: (id: string) => request<Segment[]>(`/recordings/${id}/transcript`),
  uploadRecording: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Recording>("/recordings", { method: "POST", body: form });
  },

  deleteRecording: (id: string) =>
    request<void>(`/recordings/${id}`, { method: "DELETE" }),

  getMessages: (id: string) => request<ChatMessage[]>(`/recordings/${id}/messages`),
  chat: (id: string, question: string) =>
    request<{ answer: string; sources: ChatSource[] }>(`/recordings/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  async *chatStream(id: string, question: string): AsyncGenerator<StreamEvent> {
    const token = getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/recordings/${id}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ question }),
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          yield JSON.parse(line.slice(6)) as StreamEvent;
        }
      }
    }
  },

  renameSpeaker: (recordingId: string, speakerId: number, name: string) =>
    request<Speaker>(`/recordings/${recordingId}/speakers/${speakerId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  mediaUrl: (id: string) =>
    `${API_BASE}/recordings/${id}/media?token=${encodeURIComponent(getToken() || "")}`,
};
