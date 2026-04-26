import type { Profile } from "@shared/profile";
import { type JSX, useCallback, useEffect, useState } from "react";
import {
  findCursorMarkerPosition,
  findLocalCursorMarkerPosition,
  parseCursorMarkerResponse,
} from "../editor/cursorMarker";
import { useProjectsStore } from "../state/projectsStore";
import type { EditorCursorTarget } from "./CodeEditor";
import { CodeEditor } from "./CodeEditor";
import { KidChat } from "./KidChat";

type Props = {
  profile: Profile;
  onEnterParentMode: () => void;
  onSwitchDream: () => void;
  onOpenProjects: () => void;
};

export function KidBuildWorkspace({
  profile,
  onEnterParentMode,
  onSwitchDream,
  onOpenProjects,
}: Props): JSX.Element {
  const [editorRevealed, setEditorRevealed] = useState(false);
  const [cursorTarget, setCursorTarget] = useState<EditorCursorTarget | null>(null);
  const [cursorTargetStatus, setCursorTargetStatus] = useState<"idle" | "locating">("idle");
  const [cursorTargetError, setCursorTargetError] = useState<string | null>(null);
  const [pendingCursorMessage, setPendingCursorMessage] = useState<string | null>(null);
  const projectStatus = useProjectsStore((s) => s.status);
  const projectProfileId = useProjectsStore((s) => s.profileId);
  const projectSlug = useProjectsStore((s) => s.slug);
  const dreamId = profile.currentDreamId ?? null;
  const projectReadyForProfile =
    projectStatus === "ready" && projectProfileId === profile.id && projectSlug === dreamId;

  const locateCursorTarget = useCallback(
    async (latestBitMessage: string): Promise<void> => {
      const { activeFileName, buffers, profileId, slug } = useProjectsStore.getState();
      if (profileId !== profile.id || slug !== dreamId) return;
      const activeBuffer = buffers.find((buffer) => buffer.name === activeFileName);
      if (!activeBuffer) {
        setCursorTargetError("Open a file first, then Bit can point to the spot.");
        setCursorTargetStatus("idle");
        return;
      }

      setCursorTargetStatus("locating");
      setCursorTargetError(null);
      const getFreshActiveBuffer = (): typeof activeBuffer | null => {
        const fresh = useProjectsStore.getState();
        if (fresh.profileId !== profileId || fresh.slug !== slug) return null;
        if (fresh.activeFileName !== activeFileName) return null;
        const freshBuffer = fresh.buffers.find((buffer) => buffer.name === activeFileName);
        if (!freshBuffer || freshBuffer.content !== activeBuffer.content) return null;
        return freshBuffer;
      };
      const showLocalFallback = (): boolean => {
        const freshBuffer = getFreshActiveBuffer();
        if (!freshBuffer) return true;
        const local = findLocalCursorMarkerPosition(freshBuffer.content, latestBitMessage);
        if (!local.ok) return false;
        setCursorTarget({
          filename: freshBuffer.name,
          position: local.position,
          requestId: Date.now(),
        });
        return true;
      };
      try {
        const result = await window.hibit.requestCursorMarker(profile.id, {
          filename: activeBuffer.name,
          editorContent: activeBuffer.content,
          latestBitMessage,
        });
        if (!result.ok) {
          if (showLocalFallback()) return;
          console.warn("Cursor marker helper failed", result.error);
          setCursorTargetError("Bit could not find the spot. Try asking again.");
          return;
        }

        const parsed = parseCursorMarkerResponse(result.text);
        if (!parsed.ok) {
          if (showLocalFallback()) return;
          setCursorTargetError(parsed.error);
          return;
        }
        if (parsed.surroundingContentWithMarker.length === 0) {
          if (showLocalFallback()) return;
          setCursorTargetError("Bit could not find a safe spot in this file.");
          return;
        }

        const freshBuffer = getFreshActiveBuffer();
        if (!freshBuffer) return;
        const position = findCursorMarkerPosition(
          freshBuffer.content,
          parsed.surroundingContentWithMarker,
        );
        if (!position.ok) {
          if (showLocalFallback()) return;
          setCursorTargetError(position.error);
          return;
        }

        setCursorTarget({
          filename: freshBuffer.name,
          position: position.position,
          requestId: Date.now(),
        });
      } catch (err) {
        if (showLocalFallback()) return;
        console.warn("Cursor marker helper crashed", err);
        setCursorTargetError("Bit could not find the spot. Try again.");
      } finally {
        setCursorTargetStatus("idle");
      }
    },
    [dreamId, profile.id],
  );

  async function handleShowCursorTarget(latestBitMessage: string): Promise<void> {
    if (cursorTargetStatus === "locating") return;
    if (!editorRevealed || !projectReadyForProfile) {
      setCursorTargetError(null);
      setCursorTargetStatus("locating");
      setPendingCursorMessage(latestBitMessage);
      setEditorRevealed(true);
      return;
    }
    await locateCursorTarget(latestBitMessage);
  }

  useEffect(() => {
    if (!pendingCursorMessage) return;
    if (!editorRevealed) return;
    if (projectStatus === "error") {
      setPendingCursorMessage(null);
      setCursorTargetStatus("idle");
      setCursorTargetError("Open a file first, then Bit can point to the spot.");
      return;
    }
    if (!projectReadyForProfile) return;
    const message = pendingCursorMessage;
    setPendingCursorMessage(null);
    void locateCursorTarget(message);
  }, [
    pendingCursorMessage,
    editorRevealed,
    projectStatus,
    projectReadyForProfile,
    locateCursorTarget,
  ]);

  if (!editorRevealed) {
    return (
      <KidChat
        profile={profile}
        onEnterParentMode={onEnterParentMode}
        onSwitchDream={onSwitchDream}
        onOpenProjects={onOpenProjects}
        onOpenEditor={() => setEditorRevealed(true)}
        onShowCursorTarget={handleShowCursorTarget}
        cursorTargetStatus={cursorTargetStatus}
        cursorTargetError={cursorTargetError}
      />
    );
  }

  return (
    <main className="hb-build-shell">
      <section className="hb-build-editor" aria-label="Code workspace">
        <CodeEditor
          profile={profile}
          docked
          cursorTarget={cursorTarget}
          onCursorTargetCleared={() => setCursorTarget(null)}
        />
      </section>
      <aside className="hb-build-chat" aria-label="Chat with Bit">
        <KidChat
          profile={profile}
          onEnterParentMode={onEnterParentMode}
          onSwitchDream={onSwitchDream}
          onOpenProjects={onOpenProjects}
          onShowCursorTarget={handleShowCursorTarget}
          cursorTargetStatus={cursorTargetStatus}
          cursorTargetError={cursorTargetError}
          docked
        />
      </aside>
    </main>
  );
}
