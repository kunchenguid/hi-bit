import { type JSX, useEffect, useRef } from "react";
import { KidWorkspace } from "./screens/KidWorkspace";
import { ParentShell } from "./screens/ParentShell";
import { ProfileGate } from "./screens/ProfileGate";
import { useAppModeStore } from "./state/appModeStore";
import { useConfigStore } from "./state/configStore";
import { useProfileStore } from "./state/profileStore";
import { applyTheme } from "./theme/applyTheme";

export function App(): JSX.Element {
  const mode = useAppModeStore((s) => s.mode);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const profiles = useProfileStore((s) => s.profiles);
  const profileStatus = useProfileStore((s) => s.status);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const configStatus = useConfigStore((s) => s.status);
  const defaultAgent = useConfigStore((s) => s.config?.defaultAgent);
  const theme = useConfigStore((s) => s.config?.theme);
  const loadConfig = useConfigStore((s) => s.load);

  useEffect(() => {
    if (configStatus === "idle") {
      void loadConfig();
    }
  }, [configStatus, loadConfig]);

  useEffect(() => {
    if (profileStatus === "idle") {
      void loadProfiles();
    }
  }, [profileStatus, loadProfiles]);

  useEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  // Once both stores have reached "ready" once, never gate the UI on
  // re-load cycles afterwards. Re-fetches must not unmount the routed
  // screen, or any screen that calls loadX() on mount creates a loop.
  const bootstrapDoneRef = useRef(false);
  const configBootstrapped = configStatus === "ready" || configStatus === "error";
  const profilesBootstrapped = profileStatus === "ready" || profileStatus === "error";
  if (configBootstrapped && profilesBootstrapped) {
    bootstrapDoneRef.current = true;
  }

  if (!bootstrapDoneRef.current) {
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Waking Bit up...</p>
      </main>
    );
  }

  if (profileStatus === "error") {
    return <ProfileGate />;
  }

  if (mode === "parent" || !defaultAgent || profiles.length === 0) {
    return <ParentShell />;
  }

  if (!activeProfileId) {
    return <ProfileGate />;
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  if (!activeProfile) {
    return <ProfileGate />;
  }

  return <KidWorkspace profile={activeProfile} />;
}
