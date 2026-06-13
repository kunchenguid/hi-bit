import { useEffect, useState } from "react";

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const api = window.hibit;
        if (!api) return;
        const info = await api.app.info();
        if (!cancelled) setVersion(info.version);
      } catch {
        // Best-effort: version text should never disturb the chat shell.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
