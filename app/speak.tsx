"use client";

import { useEffect, useRef, useState } from "react";

// Speak instead of typing, using the browser's own speech recognition.
// The words appear in the field as they're heard, and nothing is sent until
// the person presses the button themselves, so they can read and fix it first.
// Shown only in browsers that support it (Chrome, Edge, Safari).

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Speak({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  // Checked after the page loads, so the server and browser render the same thing.
  useEffect(() => setSupported(recognitionClass() !== null), []);
  useEffect(() => () => recognition.current?.stop(), []);

  if (!supported) return null;

  function start() {
    const Class = recognitionClass();
    if (!Class) return;
    setProblem(null);
    // Speech is added after whatever is already typed.
    const before = value.trim() ? value.trim() + " " : "";
    const r = new Class();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      onChange(before + heard.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setProblem("Microphone access is off for this site. You can allow it in the browser's address bar.");
      } else if (e.error === "no-speech") {
        setProblem("Didn't hear anything. Try again a little closer to the microphone.");
      }
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  function stop() {
    recognition.current?.stop();
    setListening(false);
  }

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
      >
        {listening ? "Stop" : "Speak"}
      </button>
      {listening && <span className="small muted">Listening…</span>}
      {problem && <span className="small error">{problem}</span>}
    </>
  );
}
