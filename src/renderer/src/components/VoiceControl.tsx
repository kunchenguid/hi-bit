import { useCallback, useEffect, useRef, useState } from "react";
import { MicRecorder } from "./micRecorder";
import { isAudioSilent, isLikelyHallucination, VOICE_SAMPLE_RATE } from "./voiceInput";
import { transcribeAudio, warmUpWhisper } from "./whisperClient";

type VoiceControlProps = {
  /** Appends transcribed speech to the draft for the kid to review before sending. */
  onVoiceText: (text: string) => void;
};

type Phase = "idle" | "preparing" | "recording" | "transcribing" | "error";
/** How the current recording is ended: release the held mic, or tap it again. */
type RecordMode = "hold" | "toggle";

/** Clips shorter than this are treated as accidental taps and dropped. */
const MIN_CLIP_SECONDS = 0.4;

/**
 * The talk-to-Bit control: the composer mic button itself is push-to-talk. Press
 * and hold it to talk and release to send; a quick click instead starts a
 * hands-free recording the kid ends with Stop. One gesture - the button is the
 * thing you talk into, not a door to another button. While active it shows a
 * small overlay with a live waveform. The mic only opens on press (privacy), and
 * the model downloads once on first use. Accidental taps and silence are dropped
 * so Whisper can't hallucinate on them.
 */
export function VoiceControl({ onVoiceText }: VoiceControlProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordMode, setRecordMode] = useState<RecordMode>("hold");
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MicRecorder | null>(null);
  // Pointer state in refs: a fast click can release before React re-renders, and
  // begin() reads "still held?" the moment recording actually starts.
  const pressedRef = useRef(false);
  const recordingRef = useRef(false);
  const modeRef = useRef<RecordMode>("hold");
  const finishingRef = useRef(false);
  const beginTokenRef = useRef(0);
  const finishCaptureRef = useRef<() => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    recordingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    teardown();
    finishingRef.current = false;
    setDownloadPct(null);
    setPhase("idle");
  }, [teardown]);

  const finishCapture = useCallback(async () => {
    if (finishingRef.current) return; // a release and the runaway guard can both fire
    finishingRef.current = true;
    recordingRef.current = false;
    const recorder = recorderRef.current;
    if (!recorder) {
      reset();
      return;
    }
    setPhase("transcribing");
    try {
      const samples = recorder.endCapture();
      teardown();
      // Drop accidental taps and silence rather than letting Whisper invent text.
      if (samples.length >= VOICE_SAMPLE_RATE * MIN_CLIP_SECONDS && !isAudioSilent(samples)) {
        const text = await transcribeAudio(samples);
        if (text && !isLikelyHallucination(text)) onVoiceText(text);
      }
      reset();
    } catch {
      setError("Bit could not understand that. Want to try again?");
      setPhase("error");
    }
  }, [onVoiceText, reset, teardown]);

  // Keep the ref the recorder's runaway guard calls pointing at the latest
  // finishCapture (its identity changes with onVoiceText).
  useEffect(() => {
    finishCaptureRef.current = () => void finishCapture();
  });

  useEffect(
    () => () => {
      beginTokenRef.current++;
      teardown();
    },
    [teardown],
  );

  // Draw the live waveform while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const canvas = canvasRef.current;
    const analyser = recorderRef.current?.getAnalyser();
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const stroke = getComputedStyle(canvas).getPropertyValue("--ink").trim() || "#1c1a17";
    const buffer = new Uint8Array(analyser.fftSize);

    const draw = () => {
      analyser.getByteTimeDomainData(buffer);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      const slice = canvas.width / buffer.length;
      for (let i = 0; i < buffer.length; i++) {
        const y = (buffer[i] / 128) * (canvas.height / 2); // 128 == silence midline
        const x = i * slice;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase]);

  // Make sure the model file exists (download once), then open the mic and
  // start recording. Whisper warm-up happens after capture begins, so the kid
  // does not wait on the local model before talking. The mode is decided by
  // whether the kid is still holding when recording actually begins: held ->
  // push-to-talk (release sends); already let go -> hands-free.
  const begin = useCallback(async () => {
    const token = ++beginTokenRef.current;
    const isCurrent = () => beginTokenRef.current === token;
    setError(null);
    finishingRef.current = false;
    setPhase("preparing");
    let offProgress = () => {};
    try {
      const { modelReady } = await window.hibit.voice.status();
      if (!modelReady) {
        setDownloadPct(0);
        offProgress = window.hibit.voice.onDownloadProgress((progress) => {
          const next = Math.round(progress.fraction * 100);
          setDownloadPct((prev) => (prev === null ? next : Math.max(prev, next)));
        });
        await window.hibit.voice.ensureModel();
        offProgress();
        offProgress = () => {};
        if (!isCurrent()) return;
      }
      if (!isCurrent()) return;
      setDownloadPct(null);
      // Open the mic and start recording immediately - don't wait on the model.
      // It's only needed to transcribe (at endCapture), so warm it up in the
      // background; the worker queue runs init before our transcribe, and the
      // load overlaps with the kid talking instead of delaying capture.
      const recorder = new MicRecorder();
      recorder.onLimitReached = () => finishCaptureRef.current();
      await recorder.start();
      if (!isCurrent()) {
        recorder.stop();
        return;
      }
      recorderRef.current = recorder;
      recorder.beginCapture();
      recordingRef.current = true;
      modeRef.current = pressedRef.current ? "hold" : "toggle";
      setRecordMode(modeRef.current);
      setPhase("recording");
      // Errors surface on the real transcription; here it's only priming.
      void warmUpWhisper().catch(() => {});
    } catch {
      if (!isCurrent()) return;
      setError("Bit could not get voice ready. You can still type your message.");
      setPhase("error");
    } finally {
      offProgress();
    }
  }, []);

  const cancelPreparation = useCallback(() => {
    beginTokenRef.current++;
    reset();
  }, [reset]);

  const onPressStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (phase === "idle") {
        pressedRef.current = true;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture unavailable - hold still works via the button.
        }
        void begin();
      } else if (phase === "recording" && modeRef.current === "toggle") {
        // Tap the mic again to stop a hands-free recording.
        void finishCapture();
      }
    },
    [phase, begin, finishCapture],
  );

  const onPressEnd = useCallback(() => {
    pressedRef.current = false;
    // Only a held (push-to-talk) recording ends on release; a hands-free one
    // waits for Stop. If recording hasn't started yet, begin() picks the mode.
    if (phase === "recording" && modeRef.current === "hold" && recordingRef.current) {
      void finishCapture();
    }
  }, [phase, finishCapture]);

  const active = phase !== "idle";
  // A hands-free recording is ended by tapping the mic again, so the button
  // itself becomes the stop control - mic glyph turns into a stop square and
  // its label changes - instead of a separate Stop button in the callout.
  const isStopControl = phase === "recording" && recordMode === "toggle";

  return (
    <div className="hb-voice">
      <button
        type="button"
        className={`hb-mic-button${phase === "recording" ? " hb-mic-button-on" : ""}`}
        aria-label={isStopControl ? "Stop recording" : "Talk to Bit"}
        aria-pressed={phase === "recording"}
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
      >
        {/* Geometric shapes, not glyphs, so they center in the button. The mic
            becomes a stop square once a hands-free recording is running. */}
        {isStopControl ? (
          <svg viewBox="0 0 24 24" className="hb-mic-icon" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="hb-mic-icon" aria-hidden="true">
            <path
              d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
      {active ? (
        // A callout anchored above the mic with a caret pointing at it - an
        // ephemeral status readout, not a focus-trapping modal, and no backdrop
        // dimming the chat. The kid's eye stays on the button they're holding.
        <div className="hb-voice-callout" role="status" aria-live="polite" aria-label="Talk to Bit">
          {phase === "recording" ? (
            <canvas
              className="hb-voice-wave"
              ref={canvasRef}
              role="img"
              aria-label="Microphone waveform"
            />
          ) : (
            <div className="hb-voice-mic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
                <path
                  d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
          <p className="hb-voice-status">
            {phase === "preparing"
              ? downloadPct !== null
                ? `Getting your voice ready... ${downloadPct}%`
                : "Getting your voice ready..."
              : phase === "recording"
                ? recordMode === "hold"
                  ? "Listening - let go to send"
                  : "Listening - tap the mic to stop"
                : phase === "transcribing"
                  ? "Working out what you said..."
                  : (error ?? "Something went wrong.")}
          </p>
          {phase === "preparing" ? (
            <div className="hb-voice-actions">
              <button type="button" className="hb-button hb-button-sm" onClick={cancelPreparation}>
                Cancel
              </button>
            </div>
          ) : phase === "error" ? (
            <div className="hb-voice-actions">
              <button type="button" className="hb-button hb-button-sm" onClick={reset}>
                Close
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
