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

const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is off for this site. Allow it from the icon in the address bar, then try again.",
  "service-not-allowed": "This browser doesn't allow speech input here. Chrome, Edge or Safari usually do; or type instead.",
  network: "This browser's speech service isn't reachable (Brave and some others turn it off). Try Chrome, Edge or Safari, or type instead.",
  "audio-capture": "No microphone was found. Check one is connected, or type instead.",
  "no-speech": "Didn't hear anything. Try again a little closer to the microphone.",
  "language-not-supported": "Speech input doesn't support this browser's language. Type instead.",
};

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Speak({
  value,
  onChange,
  disabled,
  className = "light",
  idle = "Speak",
  active = "Stop",
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  className?: string;
  idle?: React.ReactNode; // what the button shows; an icon is fine, it has its own label
  active?: React.ReactNode;
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
    // The app is in English, so listen for English whatever the browser's own language is.
    r.lang = navigator.language?.toLowerCase().startsWith("en") ? navigator.language : "en-US";
    r.interimResults = true;
    r.continuous = true;
    let heardAnything = false;
    let failed = false;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      if (heard.trim()) heardAnything = true;
      onChange(before + heard.trim());
    };
    // Every failure gets a reason, so speech never stops without explanation.
    r.onerror = (e) => {
      failed = true;
      setProblem(SPEECH_ERRORS[e.error] ?? "Speech input stopped. You can type instead.");
    };
    r.onend = () => {
      setListening(false);
      if (!heardAnything && !failed) setProblem("Didn't catch anything. Try again, or type instead.");
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setProblem("Speech input couldn't start. Try again, or type instead.");
    }
  }

  function stop() {
    recognition.current?.stop();
    setListening(false);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Speak"}
      >
        {listening ? active : idle}
      </button>
      {listening && <span className="speak-note">Listening…</span>}
      {problem && <span className="speak-note error">{problem}</span>}
    </>
  );
}
