import type { LearningProgressView } from "@shared/learning";
import { useCallback, useEffect, useState } from "react";

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

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const api = window.hibit;
        if (!api) return;
        const next = await api.progress.get(profileId);
        setProgress(next);
      } catch {
        // Best-effort: a failed read should never disrupt the shell.
      }
    })();
  }, [profileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { progress, refresh };
}
