"use client";

import { useRef, useState } from "react";

/**
 * Bonus: record audio from the browser mic and hand it back as a File, which the
 * dashboard uploads through the normal pipeline (Deepgram transcribes it).
 */
export default function MicRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        onRecorded(file);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      alert("Could not access the microphone.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <button
      type="button"
      className={recording ? "btn bg-red-600 hover:bg-red-700" : "btn-ghost"}
      onClick={recording ? stop : start}
    >
      {recording ? "■ Stop & upload" : "● Record"}
    </button>
  );
}
