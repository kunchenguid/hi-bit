import type { UpdateStatus } from "@shared/ipc";
import { useEffect, useState } from "react";

// Match the main-process checker's cadence: re-read the cached status every 4
// hours while the app is open, so a release that lands mid-session eventually
// surfaces without a restart.
export const UPDATE_STATUS_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Reads the main process's cached "is a newer Hi-Bit out?" status on mount and
 * refreshes it on a slow interval. Best-effort: a failed or unavailable check
 * leaves the status null (no update shown) and never throws, so the shell is
 * undisturbed even before the preload bridge is ready.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const api = window.hibit;
        if (!api) return;
        const next = await api.app.getUpdateStatus();
        if (!cancelled && next) setStatus(next);
      } catch {
        // Best-effort: a failed check should never disrupt the shell.
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), UPDATE_STATUS_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}
