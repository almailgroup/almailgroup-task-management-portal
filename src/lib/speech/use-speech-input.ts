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
 * How long to keep listening after the last sound.
 *
 * `continuous` is on so a sentence with a pause in the middle of it is one
 * dictation rather than two, but that also means the recogniser will hold the
 * microphone open indefinitely. This closes it — someone who starts dictating
 * and is called away should not leave a live microphone behind.
 */
const SILENCE_MS = 6000;

/**
 * The level above which somebody is considered to still be talking.
 *
 * Well above a quiet room's noise floor and well below ordinary speech, which
 * the meter reads at around 0.4.
 */
const TALKING = 0.08;

/** How often sound is allowed to push the deadline back. */
const BUMP_EVERY_MS = 400;

export type SpeechInput = {
  /** False where the browser has no recogniser; the button is then hidden. */
  supported: boolean;
  listening: boolean;
  /** Words heard but not yet settled, for showing progress as you speak. */
  interim: string;
  /** A message key, or null. */
  error: string | null;
  /**
   * How loud it is right now, 0 to 1, in a ref rather than in state.
   *
   * A meter wants a new number every frame, and sixty renders a second of a
   * panel containing a chat thread to move some bars is not a trade worth
   * making. The meter reads this in its own animation frame and writes to the
   * DOM directly; React never sees it change.
   *
   * Stays at 0 when the level could not be measured — a second microphone
   * stream is a thing a browser is allowed to refuse, and dictation still
   * works when it does.
   */
  level: React.RefObject<number>;
  /** When listening began, for the elapsed count. Null when idle. */
  startedAt: number | null;
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

  const [startedAt, setStartedAt] = React.useState<number | null>(null);

  const recogniser = React.useRef<Recogniser | null>(null);
  const silence = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The level meter's own plumbing. Separate from the recogniser: the engine
  // hears the words but tells us nothing about how loud they were, so the
  // microphone is opened a second time purely to measure it.
  const level = React.useRef(0);
  // Set while a session is running, so the level meter can push the silence
  // deadline back. Held in a ref because the meter loop outlives the render
  // that started it.
  const keepAlive = React.useRef<(() => void) | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const audio = React.useRef<AudioContext | null>(null);
  const frame = React.useRef<number | null>(null);
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

  /**
   * Close the microphone the meter opened.
   *
   * Every track has to be stopped by hand. A `MediaStream` that is merely
   * dropped keeps the browser's recording indicator lit, which is alarming
   * and fair enough.
   */
  const stopMeter = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
    level.current = 0;
  }, []);

  /**
   * Measure how loud the room is, sixty times a second.
   *
   * Root mean square over the waveform, which is what a level meter measures —
   * peak would jump on a consonant and sit at zero through a vowel. The curve
   * is there because speech at a normal distance from a laptop microphone is
   * a small fraction of full scale, and a meter that reads 4% while somebody
   * talks does not tell them it is working, which is the entire job.
   */
  const startMeter = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      // `stop()` can land while the permission prompt is still open.
      if (!recogniser.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      const ctx = new Ctx();
      audio.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(mic).connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let lastBump = 0;
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const centred = (samples[i] - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / samples.length);
        const now = Math.min(1, Math.sqrt(rms) * 1.9);
        level.current = now;

        // Sound, not words, is what "still talking" means. The recogniser only
        // reports once it has settled a phrase, so a long or quietly-spoken
        // sentence could run past the deadline mid-breath and be cut off. The
        // meter knows there is a voice in the room a great deal sooner.
        if (now > TALKING && lastBump + BUMP_EVERY_MS < Date.now()) {
          lastBump = Date.now();
          keepAlive.current?.();
        }

        frame.current = requestAnimationFrame(read);
      };
      read();
    } catch {
      // Refused, or no microphone the meter may have. Dictation carries on
      // without a level; the meter falls back to showing that it is awake.
      stopMeter();
    }
  }, [stopMeter]);

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
      keepAlive.current = null;
      stopTimer();
      stopMeter();
      recogniser.current = null;
      setListening(false);
      setStartedAt(null);
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
    keepAlive.current = bumpSilence;
    setListening(true);
    setStartedAt(Date.now());
    bumpSilence();
    void startMeter();
  }, [locale, startMeter, stopMeter, stopTimer]);

  const toggle = React.useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Leaving the page with the microphone open is not acceptable, and neither
  // is a recogniser still holding handlers into an unmounted component.
  React.useEffect(
    () => () => {
      if (silence.current) clearTimeout(silence.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      stream.current?.getTracks().forEach((track) => track.stop());
      void audio.current?.close().catch(() => {});
      recogniser.current?.abort();
      recogniser.current = null;
    },
    [],
  );

  return { supported, listening, interim, error, level, startedAt, start, stop, toggle };
}
