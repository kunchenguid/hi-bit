import { type JSX, useEffect } from "react";
import { DreamPicker } from "./screens/DreamPicker";
import { HarnessSetup } from "./screens/HarnessSetup";
import { KidWorkspace } from "./screens/KidWorkspace";
import { ProfileGate } from "./screens/ProfileGate";
import { useConfigStore } from "./state/configStore";
import { useProfileStore } from "./state/profileStore";
import { applyTheme } from "./theme/applyTheme";

export function App(): JSX.Element {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const profiles = useProfileStore((s) => s.profiles);
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
    applyTheme(document.documentElement, theme);
  }, [theme]);

  if (!activeProfileId) {
    return <ProfileGate />;
  }

  if (configStatus !== "ready") {
    return <ProfileGate />;
  }

  if (!defaultAgent) {
    return <HarnessSetup onDone={() => void loadConfig()} />;
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  if (!activeProfile) {
    return <ProfileGate />;
  }

  if (!activeProfile.currentDreamId) {
    return <DreamPicker profile={activeProfile} />;
  }

  return <KidWorkspace profile={activeProfile} />;
}
