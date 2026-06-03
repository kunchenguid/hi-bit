import type { OutgoingImage } from "@shared/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import { toAttachment } from "./imageInput";

type CameraCaptureProps = {
  onCapture: (image: OutgoingImage) => void;
  onClose: () => void;
};

/**
 * A small webcam capture modal: live preview, Snap to freeze a frame, then Retake
 * or Use it. Opens the camera with getUserMedia and always stops the stream when
 * it closes (or unmounts) so the camera light goes off.
 */
export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled)
          setError("Hi-Bit could not open the camera. You can still paste or pick a file.");
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  const close = useCallback(() => {
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setShot({ url: canvas.toDataURL("image/jpeg", 0.9), canvas });
  }, []);

  const use = useCallback(async () => {
    if (!shot) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      shot.canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) return;
    const image = await toAttachment(blob);
    stopStream();
    onCapture(image);
  }, [onCapture, shot, stopStream]);

  return (
    <div className="hb-camera-backdrop" role="dialog" aria-modal="true" aria-label="Take a picture">
      <div className="hb-camera-sheet">
        <div className="hb-camera-stage">
          {error ? (
            <p className="hb-camera-error">{error}</p>
          ) : shot ? (
            <img className="hb-camera-frame" src={shot.url} alt="Your snapshot, ready to use" />
          ) : (
            <video ref={videoRef} className="hb-camera-frame" playsInline muted />
          )}
        </div>
        <div className="hb-camera-actions">
          {error ? (
            <button type="button" className="hb-button" onClick={close}>
              Close
            </button>
          ) : shot ? (
            <>
              <button type="button" className="hb-button" onClick={() => setShot(null)}>
                Retake
              </button>
              <button
                type="button"
                className="hb-button hb-button-primary"
                onClick={() => void use()}
              >
                Use this picture
              </button>
            </>
          ) : (
            <>
              <button type="button" className="hb-button" onClick={close}>
                Cancel
              </button>
              <button type="button" className="hb-button hb-button-primary" onClick={snap}>
                Snap
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
