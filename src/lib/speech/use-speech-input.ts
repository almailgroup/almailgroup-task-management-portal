"use client";

import * as React from "react";

import { speechError, speechLocale } from "@/lib/speech";
import { useI18n } from "@/lib/i18n/client";

/**
 * Dictation, using the recogniser already in the browser.
 *
 * No key, no server, no audio leaving this code: `SpeechRecognition` is a
 * platform API, and the transcript arrives as text. The engine behind it is
 * the browser's own — in Chrome that means the audio goes to Google to be
 * recognised, which is worth knowing but is not something this app arranges
 * or can turn off.
 *
 * Only some browsers have it. Firefox has none, so `supported` is false there
 * and the button is not offered rather than offered and broken.
 */

/** The shape used here. The DOM lib does not ship these. */
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechResultEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechErrorEvent = { error: string };
type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecogniserClass = new () => Recogniser;

function recogniserClass(): RecogniserClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecogniserClass;
    webkitSpeechRecognition?: RecogniserClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * How long to keep listening after the last word.
 *
 * `continuous` is on so a sentence with a pause in the middle of it is one
 * dictation rather than two, but that also means the recogniser will hold the
 * microphone open indefinitely. This closes it — someone who starts dictating
 * and is called away should not leave a live microphone behind.
 */
const SILENCE_MS = 6000;

export type SpeechInput = {
  /** False where the browser has no recogniser; the button is then hidden. */
  supported: boolean;
  listening: boolean;
  /** Words heard but not yet settled, for showing progress as you speak. */
  interim: string;
  /** A message key, or null. */
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

/**
 * @param onText Called with each settled phrase, to append to whatever is
 *   being written. Interim words never go through it: they change as the
 *   engine reconsiders, and rewriting somebody's textbox under them is worse
 *   than showing the guess separately.
 */
export function useSpeechInput(onText: (text: string) => void): SpeechInput {
  const { locale } = useI18n();
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const recogniser = React.useRef<Recogniser | null>(null);
  const silence = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept in a ref so the recogniser's handlers, which are attached once, always
  // call the current one rather than the one from the render that built them.
  const deliver = React.useRef(onText);
  deliver.current = onText;

  // Detection has to happen after mount: the server has no window, and
  // deciding on the server would render a button the browser then disagrees
  // with, which is a hydration mismatch.
  React.useEffect(() => setSupported(recogniserClass() !== null), []);

  const stopTimer = React.useCallback(() => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
  }, []);

  const stop = React.useCallback(() => {
    stopTimer();
    recogniser.current?.stop();
  }, [stopTimer]);

  const start = React.useCallback(() => {
    const Recognition = recogniserClass();
    if (!Recognition || recogniser.current) return;

    setError(null);
    setInterim("");

    const engine = new Recognition();
    engine.lang = speechLocale(locale);
    engine.continuous = true;
    engine.interimResults = true;
    engine.maxAlternatives = 1;

    const bumpSilence = () => {
      if (silence.current) clearTimeout(silence.current);
      silence.current = setTimeout(() => engine.stop(), SILENCE_MS);
    };

    engine.onresult = (event) => {
      bumpSilence();
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const settled = text.trim();
          if (settled) deliver.current(settled);
        } else {
          pending += text;
        }
      }
      setInterim(pending.trim());
    };

    engine.onerror = (event) => {
      const key = speechError(event.error);
      if (key) setError(key);
    };

    engine.onend = () => {
      stopTimer();
      recogniser.current = null;
      setListening(false);
      setInterim("");
    };

    try {
      engine.start();
    } catch {
      // Chrome throws InvalidStateError if start() is called while a previous
      // session is still winding down. Nothing to report; the button simply
      // does not engage.
      return;
    }

    recogniser.current = engine;
    setListening(true);
    bumpSilence();
  }, [locale, stopTimer]);

  const toggle = React.useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Leaving the page with the microphone open is not acceptable, and neither
  // is a recogniser still holding handlers into an unmounted component.
  React.useEffect(
    () => () => {
      if (silence.current) clearTimeout(silence.current);
      recogniser.current?.abort();
      recogniser.current = null;
    },
    [],
  );

  return { supported, listening, interim, error, start, stop, toggle };
}
