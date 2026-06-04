"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import RecordingsTable from "@/components/RecordingsTable";
import UploadDropzone from "@/components/UploadDropzone";
import { api, type Recording } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [email, setEmail] = useState<string>();
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listRecordings();
      setRecordings(data);
    } catch {
      /* surfaced via auth redirect if token invalid */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    api
      .me()
      .then((u) => setEmail(u.email))
      .catch(() => router.replace("/login"));
    refresh().finally(() => setLoading(false));
  }, [router, refresh]);

  // Poll while any recording is still processing so the table updates live.
  useEffect(() => {
    const anyProcessing = recordings.some(
      (r) => r.status === "processing" || r.status === "uploaded"
    );
    if (anyProcessing && !pollRef.current) {
      pollRef.current = setInterval(refresh, 3000);
    } else if (!anyProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [recordings, refresh]);

  return (
    <div className="min-h-screen">
      <Navbar email={email} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <UploadDropzone onUploaded={refresh} />
        <div>
          <h2 className="mb-3 text-lg font-semibold">Your meetings</h2>
          {loading ? (
            <div className="card p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : (
            <RecordingsTable recordings={recordings} />
          )}
        </div>
      </main>
    </div>
  );
}
