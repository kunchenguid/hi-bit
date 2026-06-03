import type { OutgoingImage } from "@shared/chat";
import { useRef, useState } from "react";
import { CameraCapture } from "./CameraCapture";
import {
  imageDataUrl,
  imageFromClipboardEvent,
  readClipboardImage,
  toAttachment,
} from "./imageInput";

type ComposerProps = {
  value: string;
  running: boolean;
  /** The picture currently attached to the draft, if any. */
  image?: OutgoingImage | null;
  onChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onAttachImage?: (image: OutgoingImage) => void;
  onClearImage?: () => void;
};

export function Composer({
  value,
  running,
  image,
  onChange,
  onSend,
  onAbort,
  onAttachImage,
  onClearImage,
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attach = (img: OutgoingImage) => {
    onAttachImage?.(img);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAttachImage) return;
    const blob = imageFromClipboardEvent(event.clipboardData);
    if (!blob) return;
    event.preventDefault();
    attach(await toAttachment(blob));
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) attach(await toAttachment(file));
  };

  const choosePaste = async () => {
    setMenuOpen(false);
    const blob = await readClipboardImage();
    if (blob) attach(await toAttachment(blob));
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
      <div className="hb-composer-actions">
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
              +
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
