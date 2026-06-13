import type { ThinkingSpeed } from "@shared/config";
import type { UpdateStatus } from "@shared/ipc";
import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { keepFocusInside } from "./focusTrap";
import { Icon, type IconName } from "./Icon";
import { ProfileSettingsMenu } from "./ProfileSettingsMenu";
import { ResetConversationControl } from "./ResetConversationControl";
import { ThinkingSpeedControl } from "./ThinkingSpeedControl";
import { UpdateNotice } from "./UpdateNotice";

type SettingsTab = "profile" | "bit" | "about";

type SettingsOverlayProps = {
  profile: ProfileSummary;
  busy: boolean;
  thinkingSpeed: ThinkingSpeed;
  updateStatus: UpdateStatus | null;
  appVersion: string | null;
  resetBlockedReason: string | null;
  onClose: () => void;
  onOpenFolder: () => void;
  onSwitchProfile: () => void;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
  onResetConversation: () => Promise<void>;
  onChangeThinkingSpeed: (speed: ThinkingSpeed) => void;
};

const TABS: Array<{ id: SettingsTab; label: string; icon: IconName }> = [
  { id: "profile", label: "Profile", icon: "i-user" },
  { id: "bit", label: "How Bit works", icon: "i-code" },
  { id: "about", label: "About & updates", icon: "i-star" },
];

export function SettingsOverlay({
  profile,
  busy,
  thinkingSpeed,
  updateStatus,
  appVersion,
  resetBlockedReason,
  onClose,
  onOpenFolder,
  onSwitchProfile,
  onUpdateProfile,
  onResetConversation,
  onChangeThinkingSpeed,
}: SettingsOverlayProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const updateAvailable = updateStatus?.updateAvailable ?? false;
  const versionLabel = appVersion ?? updateStatus?.currentVersion ?? "checking";

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
  }, []);

  const close = () => {
    const returnFocus = returnFocusRef.current;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    onClose();
  };

  return (
    <div className="hb-handbook-backdrop">
      <section
        className="hb-card hb-settings"
        aria-labelledby="hb-settings-title"
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={(event) => keepFocusInside(event, dialogRef.current, close)}
      >
        <header className="hb-settings-head">
          <button
            className="hb-button hb-button-secondary hb-settings-back"
            type="button"
            onClick={close}
          >
            <Icon name="i-arrow-left" />
            Back to building
          </button>
          <div className="hb-settings-title-wrap">
            <h2 className="hb-settings-title" id="hb-settings-title">
              <Icon name="i-settings" />
              Settings
            </h2>
            <p>for {profile.name}&apos;s account</p>
          </div>
        </header>

        <div className="hb-settings-layout">
          <div className="hb-settings-sidebar" role="tablist" aria-label="Settings sections">
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              const tabHasUpdate = tab.id === "about" && updateAvailable;
              return (
                <button
                  key={tab.id}
                  className="hb-settings-tab"
                  type="button"
                  role="tab"
                  id={`hb-settings-tab-${tab.id}`}
                  aria-controls={`hb-settings-panel-${tab.id}`}
                  aria-selected={selected}
                  aria-label={tabHasUpdate ? `${tab.label} - update available` : tab.label}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon name={tab.icon} />
                  <span>{tab.label}</span>
                  {tabHasUpdate ? (
                    <span className="hb-settings-tab-dot" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="hb-settings-content" data-scroll-container="settings-content">
            {activeTab === "profile" ? (
              <section
                className="hb-settings-panel"
                role="tabpanel"
                id="hb-settings-panel-profile"
                aria-labelledby="hb-settings-tab-profile"
              >
                <div className="hb-settings-panel-intro">
                  <h3>Profile</h3>
                  <p>
                    Everything tied to this kid - who they are, plus the actions that act on their
                    account.
                  </p>
                </div>
                <SettingsSubhead icon="i-heart" label="Details" />
                <ProfileSettingsMenu
                  profile={profile}
                  busy={busy}
                  onUpdateProfile={onUpdateProfile}
                />
                <SettingsSubhead icon="i-user" label="This account" />
                <div className="hb-settings-action-list">
                  <SettingsActionRow
                    icon="i-folder"
                    title="Open creations folder"
                    detail={`See ${profile.name}'s files on disk.`}
                  >
                    <button
                      className="hb-button hb-button-secondary"
                      type="button"
                      onClick={onOpenFolder}
                    >
                      <Icon name="i-folder" />
                      Open creations folder
                    </button>
                  </SettingsActionRow>
                  <SettingsActionRow
                    icon="i-swap"
                    title="Switch profile"
                    detail="Hand the app to another builder."
                  >
                    <button
                      className="hb-button hb-button-secondary"
                      type="button"
                      onClick={onSwitchProfile}
                    >
                      <Icon name="i-swap" />
                      Switch profile
                    </button>
                  </SettingsActionRow>
                  <SettingsActionRow
                    icon="i-close"
                    title="Reset conversation"
                    detail="Clear the chat and start fresh."
                    className="hb-settings-reset-row"
                  >
                    <ResetConversationControl
                      builderName={profile.name}
                      busy={busy}
                      blockedReason={resetBlockedReason}
                      onReset={onResetConversation}
                    />
                  </SettingsActionRow>
                </div>
              </section>
            ) : null}

            {activeTab === "bit" ? (
              <section
                className="hb-settings-panel"
                role="tabpanel"
                id="hb-settings-panel-bit"
                aria-labelledby="hb-settings-tab-bit"
              >
                <div className="hb-settings-panel-intro">
                  <h3>How Bit works</h3>
                  <p>
                    Tune how Bit thinks. Slower means more careful builds; faster means quicker
                    replies.
                  </p>
                </div>
                <ThinkingSpeedControl
                  value={thinkingSpeed}
                  busy={busy}
                  onChange={onChangeThinkingSpeed}
                />
              </section>
            ) : null}

            {activeTab === "about" ? (
              <section
                className="hb-settings-panel"
                role="tabpanel"
                id="hb-settings-panel-about"
                aria-labelledby="hb-settings-tab-about"
              >
                <div className="hb-settings-panel-intro">
                  <h3>About &amp; updates</h3>
                  <p>Version info and keeping Hi-Bit current.</p>
                </div>
                <div className="hb-settings-action-list">
                  <div className="hb-settings-action-row">
                    <Icon name="i-star" className="hb-settings-action-icon" />
                    <div className="hb-settings-action-copy">
                      <strong>Hi-Bit</strong>
                      <span>Version {versionLabel}</span>
                    </div>
                  </div>
                </div>
                {updateStatus ? <UpdateNotice status={updateStatus} /> : null}
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

type SettingsSubheadProps = {
  icon: IconName;
  label: string;
};

function SettingsSubhead({ icon, label }: SettingsSubheadProps) {
  return (
    <h4 className="hb-settings-subhead">
      <Icon name={icon} />
      {label}
    </h4>
  );
}

type SettingsActionRowProps = {
  icon: IconName;
  title: string;
  detail: string;
  className?: string;
  children?: ReactNode;
};

function SettingsActionRow({ icon, title, detail, className, children }: SettingsActionRowProps) {
  return (
    <div className={["hb-settings-action-row", className].filter(Boolean).join(" ")}>
      <Icon name={icon} className="hb-settings-action-icon" />
      <div className="hb-settings-action-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="hb-settings-action-control">{children}</div>
    </div>
  );
}
