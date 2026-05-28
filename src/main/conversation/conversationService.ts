import { access, mkdir, rename } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type { ChatMessage } from "@shared/chat";
import { appendJsonl, readJsonFile, readJsonl, writeJsonFile } from "../storage/json";
import {
  type HiBitLayout,
  type ProfileConversationPaths,
  profileConversationPaths,
} from "../storage/layout";

type ConversationStateRecord = {
  schemaVersion: 1;
  activeBitSessionFile?: string;
  /** @deprecated legacy key + path from before the Mayor -> Bit rename. */
  activeMayorSessionFile?: string;
  updatedAt: string;
};

type TranscriptEntry = {
  timestamp: string;
  type: "chat_message";
  message: ChatMessage;
};

/**
 * Owns the per-profile conversation: one continuous transcript (`transcript.jsonl`)
 * and the active Bit Pi session file (`conversation.json`).
 */
export class ConversationService {
  constructor(
    private readonly layout: HiBitLayout,
    private readonly now: () => Date = () => new Date(),
  ) {}

  paths(profileId: string): ProfileConversationPaths {
    return profileConversationPaths(this.layout, profileId);
  }

  async readTranscript(profileId: string): Promise<ChatMessage[]> {
    const entries = await readJsonl<TranscriptEntry>(this.paths(profileId).transcriptPath);
    return entries.flatMap((entry) =>
      entry.type === "chat_message" && entry.message ? [entry.message] : [],
    );
  }

  async appendMessage(profileId: string, message: ChatMessage): Promise<void> {
    await appendJsonl(this.paths(profileId).transcriptPath, {
      timestamp: message.createdAt,
      type: "chat_message",
      message,
    } satisfies TranscriptEntry);
  }

  async getBitSessionFile(profileId: string): Promise<string | undefined> {
    await this.migrateLegacySessions(profileId);
    const state = await readJsonFile<ConversationStateRecord>(
      this.paths(profileId).conversationStatePath,
    );
    const stored = state?.activeBitSessionFile ?? state?.activeMayorSessionFile;
    return stored ? this.remapLegacySessionPath(profileId, stored) : undefined;
  }

  /**
   * Sessions used to live under `conversation/sessions/mayor`. Move an existing
   * profile's folder to `.../bit` on first access so its continuous Bit session
   * survives the Mayor -> Bit rename. Idempotent and best-effort.
   */
  private async migrateLegacySessions(profileId: string): Promise<void> {
    const { conversationDir, bitSessionsDir } = this.paths(profileId);
    const legacyDir = join(conversationDir, "sessions", "mayor");
    try {
      await access(legacyDir);
    } catch {
      return; // no legacy folder
    }
    try {
      await access(bitSessionsDir);
      return; // new folder already exists - don't clobber
    } catch {}
    try {
      await mkdir(dirname(bitSessionsDir), { recursive: true });
      await rename(legacyDir, bitSessionsDir);
    } catch (error) {
      console.error(`Failed to migrate legacy Bit sessions for ${profileId}:`, error);
    }
  }

  /** Remap a stored `.../sessions/mayor/...` pointer onto the new `bit` folder. */
  private remapLegacySessionPath(profileId: string, stored: string): string {
    const { conversationDir, bitSessionsDir } = this.paths(profileId);
    const legacyDir = join(conversationDir, "sessions", "mayor");
    return stored.startsWith(legacyDir + sep)
      ? join(bitSessionsDir, stored.slice(legacyDir.length + 1))
      : stored;
  }

  async setBitSessionFile(profileId: string, sessionFile: string | undefined): Promise<void> {
    await writeJsonFile(this.paths(profileId).conversationStatePath, {
      schemaVersion: 1,
      activeBitSessionFile: sessionFile,
      updatedAt: this.now().toISOString(),
    } satisfies ConversationStateRecord);
  }
}
