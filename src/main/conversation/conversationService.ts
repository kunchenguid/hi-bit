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
    const state = await readJsonFile<ConversationStateRecord>(
      this.paths(profileId).conversationStatePath,
    );
    return state?.activeBitSessionFile;
  }

  async setBitSessionFile(profileId: string, sessionFile: string | undefined): Promise<void> {
    await writeJsonFile(this.paths(profileId).conversationStatePath, {
      schemaVersion: 1,
      activeBitSessionFile: sessionFile,
      updatedAt: this.now().toISOString(),
    } satisfies ConversationStateRecord);
  }
}
