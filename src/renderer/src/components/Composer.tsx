import type { OutgoingImage } from "@shared/chat";
import { useLayoutEffect, useRef, useState } from "react";
import { CameraCapture } from "./CameraCapture";
import {
  imageDataUrl,
  imageFromClipboardEvent,
  readClipboardImage,
  toAttachment,
} from "./imageInput";
import { VoiceControl } from "./VoiceControl";

type ComposerProps = {
  value: string;
  running: boolean;
  /** The picture currently attached to the draft, if any. */
  image?: OutgoingImage | null;
  /** Whether this device can run local voice input (gated on WebGPU). */
  voiceSupported?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onAttachImage?: (image: OutgoingImage) => void;
  onClearImage?: () => void;
  /** Appends transcribed speech to the draft for the kid to review before sending. */
  onVoiceText?: (text: string) => void;
};

export function Composer({
  value,
  running,
  image,
  voiceSupported,
  onChange,
  onSend,
  onAbort,
  onAttachImage,
  onClearImage,
  onVoiceText,
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Grow the box from one row only as far as the text needs: collapse to the
  // natural height, then match the content. The body measures the DOM rather
  // than `value`, but `value` is the dependency on purpose - it re-measures on
  // every keystroke and shrinks back to one row when a send clears the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the re-measure trigger, read via the DOM.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const borderY = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borderY}px`;
  }, [value]);

  const attach = (img: OutgoingImage) => {
    setAttachmentError(null);
    onAttachImage?.(img);
  };

  const attachSource = async (source: Blob) => {
    try {
      attach(await toAttachment(source));
    } catch {
      setAttachmentError("Could not attach that picture.");
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAttachImage) return;
    const blob = imageFromClipboardEvent(event.clipboardData);
    if (!blob) return;
    event.preventDefault();
    await attachSource(blob);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await attachSource(file);
  };

  const choosePaste = async () => {
    setMenuOpen(false);
    const blob = await readClipboardImage();
    if (blob) await attachSource(blob);
  };

  const chooseFile = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const chooseCamera = () => {
    setMenuOpen(false);
    setCameraOpen(true);
  };

  return (
    <form
      className="hb-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) onSend();
      }}
    >
      <label className="hb-sr-only" htmlFor="hibit-composer">
        Ask Bit to build
      </label>
      <div className="hb-composer-field">
        {image ? (
          <div className="hb-composer-chip">
            <img src={imageDataUrl(image)} alt="The one you attached" />
            <button
              type="button"
              className="hb-composer-chip-remove"
              aria-label="Remove picture"
              onClick={() => onClearImage?.()}
            >
              ×
            </button>
          </div>
        ) : null}
        <textarea
          id="hibit-composer"
          ref={textareaRef}
          rows={1}
          placeholder="Ask Bit to build..."
          value={value}
          disabled={running}
          onChange={(event) => onChange(event.currentTarget.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter keeps the newline. Skip while a turn is
            // running or an IME composition is mid-word.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!running) onSend();
          }}
        />
      </div>
      {attachmentError ? <p className="hb-composer-error">{attachmentError}</p> : null}
      <div className="hb-composer-actions">
        {!running && voiceSupported && onVoiceText ? (
          <VoiceControl onVoiceText={onVoiceText} />
        ) : null}
        {!running && onAttachImage ? (
          <div className="hb-attach">
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="hb-attach-scrim"
                  aria-label="Close picture menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="hb-attach-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void choosePaste()}>
                    <span className="hb-attach-icon hb-attach-icon-paste" aria-hidden="true" />
                    Paste a picture
                  </button>
                  <button type="button" role="menuitem" onClick={chooseFile}>
                    <span className="hb-attach-icon hb-attach-icon-file" aria-hidden="true" />
                    Choose from files
                  </button>
                  <button type="button" role="menuitem" onClick={chooseCamera}>
                    <span className="hb-attach-icon hb-attach-icon-camera" aria-hidden="true" />
                    Use the camera
                  </button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={`hb-attach-button${menuOpen ? " hb-attach-button-open" : ""}`}
              aria-label="Add a picture"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {/* A geometric SVG plus, not a text glyph: it centers exactly in
                  the button instead of riding the font's off-center baseline. */}
              <svg className="hb-attach-plus" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z" fill="currentColor" />
              </svg>
            </button>
          </div>
        ) : null}
        {running ? (
          <button className="hb-button hb-button-danger" type="button" onClick={onAbort}>
            Stop
          </button>
        ) : (
          <button className="hb-button hb-button-primary" type="submit">
            Send
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        className="hb-sr-only"
        type="file"
        accept="image/*"
        onChange={handleFile}
        tabIndex={-1}
      />
      {cameraOpen ? (
        <CameraCapture
          onCapture={(img) => {
            setCameraOpen(false);
            attach(img);
          }}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </form>
  );
}
