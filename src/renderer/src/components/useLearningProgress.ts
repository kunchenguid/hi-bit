import type { LearningProgressView } from "@shared/learning";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reads a builder's place in the agentic-engineering curriculum (their skill
 * mastery, reach, and roadmap). Fetches on mount and whenever `refresh` is
 * called - the Factory Handbook and grown-up window call refresh on open so the
 * view is fresh. Best-effort: a failed or unavailable read leaves the last value
 * in place and never throws, so the shell is undisturbed before the preload
 * bridge is ready.
 */
export function useLearningProgress(profileId: string): {
  progress: LearningProgressView | null;
  refresh: () => void;
} {
  const [progress, setProgress] = useState<LearningProgressView | null>(null);
  // Monotonic request token: only the latest in-flight read may write state, so
  // a slow fetch for a previous profile can never land on top of a newer one,
  // and a read that resolves after unmount is ignored.
  const latestRequest = useRef(0);

  const refresh = useCallback(() => {
    const requestId = ++latestRequest.current;
    void (async () => {
      try {
        const api = window.hibit;
        if (!api) return;
        const next = await api.progress.get(profileId);
        if (latestRequest.current === requestId) setProgress(next);
      } catch {
        // Best-effort: a failed read should never disrupt the shell.
      }
    })();
  }, [profileId]);

  useEffect(() => {
    // Clear stale data on a profile switch so a different kid's mastery never
    // shows under the new name while the fresh read is in flight.
    setProgress(null);
    refresh();
    return () => {
      // Invalidate any pending read when the profile changes or we unmount.
      latestRequest.current++;
    };
  }, [refresh]);

  return { progress, refresh };
}
