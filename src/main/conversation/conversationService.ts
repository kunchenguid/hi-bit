import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ChatImage, ChatMessage, OutgoingImage } from "@shared/chat";
import { appendJsonl, readJsonFile, readJsonl, writeJsonFile } from "../storage/json";
import {
  type HiBitLayout,
  type ProfileConversationPaths,
  profileConversationPaths,
} from "../storage/layout";

/** Maps the picture's mime type to a file extension for the stored attachment. */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const BASE64_CHARS = /^[A-Za-z0-9+/]+={0,2}$/;

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
    const messages = entries.flatMap((entry) =>
      entry.type === "chat_message" && entry.message ? [entry.message] : [],
    );
    // The transcript line stores only the attachment's on-disk path (lean
    // jsonl); read the bytes back so the renderer can show the picture again
    // after a reload. A missing file just leaves the message text-only.
    return Promise.all(messages.map((message) => this.rehydrateImage(profileId, message)));
  }

  /**
   * Writes an attached picture's bytes to the profile's attachments dir and
   * returns the lean reference (mime type + relative path, no base64) that goes
   * on the persisted message. Keeping the bytes off the transcript line mirrors
   * the "strip image data from logs" doctrine.
   */
  async saveAttachment(profileId: string, image: OutgoingImage): Promise<ChatImage> {
    const ext = EXT_BY_MIME[image.mimeType];
    if (!ext) throw new Error("Unsupported image type.");
    if (!image.data || image.data.length % 4 !== 0 || !BASE64_CHARS.test(image.data)) {
      throw new Error("Invalid image data.");
    }
    if (encodedBase64ByteLength(image.data) > MAX_ATTACHMENT_BYTES) {
      throw new Error("Image is too large.");
    }
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large.");
    const { attachmentsDir } = this.paths(profileId);
    await mkdir(attachmentsDir, { recursive: true });
    const fileName = `${randomUUID()}.${ext}`;
    await writeFile(join(attachmentsDir, fileName), bytes);
    return { mimeType: image.mimeType, path: join("attachments", fileName) };
  }

  private async rehydrateImage(profileId: string, message: ChatMessage): Promise<ChatMessage> {
    if (!message.image?.path || message.image.data) return message;
    try {
      // Resolve under the attachments dir by basename only, never the stored path
      // verbatim, so a doctored transcript can't read outside the attachments dir.
      const file = join(this.paths(profileId).attachmentsDir, basename(message.image.path));
      const data = (await readFile(file)).toString("base64");
      return { ...message, image: { ...message.image, data } };
    } catch {
      return message;
    }
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

function encodedBase64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}
