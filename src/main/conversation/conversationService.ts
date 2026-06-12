import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

/**
 * Where a stored picture came from. `builder` is one the kid shared in chat;
 * `searched` is one a bot or Bit pulled from the web with `search_image`;
 * `generated` is one a bot drew with `generate_image`. All three live in the
 * same `attachments/` store and are referenceable by id; only `builder` is shown
 * by `list_builder_pictures`.
 */
export type StoredImageSource = "builder" | "searched" | "generated";

/** A stored picture Bit can name as a build reference: stable id, mime, on-disk path, when stored. */
export type AttachmentSummary = {
  id: string;
  mimeType: string;
  /** Relative to the profile's conversation dir. */
  path: string;
  sharedAt: string;
  messageText: string;
  source: StoredImageSource;
};

/** Bytes a bot/Bit tool wants persisted into the shared store, with provenance. */
export type SaveImageInput = {
  data: string;
  mimeType: string;
  source: Exclude<StoredImageSource, "builder">;
  /** Provenance (e.g. the search query or the generation prompt), for recall. */
  meta?: Record<string, unknown>;
};

/** A freshly stored picture: stable id plus its on-disk path, relative to the conversation dir. */
export type SavedImage = { id: string; path: string; mimeType: string };

/**
 * The narrow capability the Pi/Bit runtimes need to persist and resolve pictures
 * their tools find or make, without depending on the whole ConversationService.
 */
export interface ImageStore {
  saveImage(profileId: string, input: SaveImageInput): Promise<SavedImage>;
  /** Resolves a stored picture id to an absolute file path + mime, for reference reads. */
  resolveImageFile(
    profileId: string,
    id: string,
  ): Promise<{ path: string; mimeType: string } | undefined>;
}

/**
 * One line in the sidecar index for a stored picture. Builder pictures are also
 * indexed so their stable ids still resolve after a parent resets the chat
 * transcript; current transcripts remain the richer source while they exist.
 */
type ImageIndexEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  source: StoredImageSource;
  createdAt: string;
  /** Builder-message text captured before a conversation reset clears the transcript. */
  messageText?: string;
  meta?: Record<string, unknown>;
};

/** Derives an attachment's id, falling back to the file-name stem for legacy lines. */
function attachmentId(image: ChatImage): string | undefined {
  if (image.id) return image.id;
  if (!image.path) return undefined;
  return basename(image.path).replace(/\.[^.]+$/, "");
}

function attachmentSummary(message: ChatMessage): AttachmentSummary | undefined {
  const image = message.image;
  if (!image?.path) return undefined;
  if (!isStoredAttachmentPath(image.path)) return undefined;
  const id = attachmentId(image);
  if (!id) return undefined;
  return {
    id,
    mimeType: image.mimeType,
    path: image.path,
    sharedAt: message.createdAt,
    messageText: message.text,
    source: "builder",
  };
}

function isStoredAttachmentPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized === `attachments/${basename(normalized)}`;
}

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
export class ConversationService implements ImageStore {
  constructor(
    private readonly layout: HiBitLayout,
    private readonly now: () => Date = () => new Date(),
  ) {}

  paths(profileId: string): ProfileConversationPaths {
    return profileConversationPaths(this.layout, profileId);
  }

  async readTranscript(profileId: string): Promise<ChatMessage[]> {
    const messages = await this.readStoredMessages(profileId);
    // The transcript line stores only the attachment's on-disk path (lean
    // jsonl); read the bytes back so the renderer can show the picture again
    // after a reload. A missing file just leaves the message text-only.
    return Promise.all(messages.map((message) => this.rehydrateImage(profileId, message)));
  }

  private async readStoredMessages(profileId: string): Promise<ChatMessage[]> {
    const entries = await readJsonl<TranscriptEntry>(this.paths(profileId).transcriptPath);
    return entries.flatMap((entry) =>
      entry.type === "chat_message" && entry.message ? [entry.message] : [],
    );
  }

  /**
   * Validates a picture's bytes and writes them into the profile's attachments
   * dir, returning the stable id (which doubles as the file-name stem so legacy
   * attachments can be recalled from the path) and the relative on-disk path.
   * Shared by `saveAttachment` (builder pictures) and `saveImage` (tool pictures).
   */
  private async writeImageBytes(
    profileId: string,
    image: { mimeType: string; data?: string },
  ): Promise<{ id: string; path: string }> {
    const ext = EXT_BY_MIME[image.mimeType];
    if (!ext) throw new Error("Unsupported image type.");
    if (typeof image.data !== "string" || image.data.length === 0) {
      throw new Error("Invalid image data.");
    }
    if (encodedBase64ByteLength(image.data) > MAX_ATTACHMENT_BYTES) {
      throw new Error("Image is too large.");
    }
    if (image.data.length % 4 !== 0 || !BASE64_CHARS.test(image.data)) {
      throw new Error("Invalid image data.");
    }
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large.");
    const { attachmentsDir } = this.paths(profileId);
    await mkdir(attachmentsDir, { recursive: true });
    const id = randomUUID();
    const fileName = `${id}.${ext}`;
    await writeFile(join(attachmentsDir, fileName), bytes);
    return { id, path: join("attachments", fileName) };
  }

  /**
   * Writes an attached picture's bytes to the profile's attachments dir and
   * returns the lean reference (mime type + relative path, no base64) that goes
   * on the persisted message. Keeping the bytes off the transcript line mirrors
   * the "strip image data from logs" doctrine. The later transcript append adds
   * the sidecar index line, once the message text and timestamp are known.
   */
  async saveAttachment(profileId: string, image: OutgoingImage): Promise<ChatImage> {
    const { id, path } = await this.writeImageBytes(profileId, image);
    return { id, mimeType: image.mimeType, path };
  }

  /**
   * Persists a picture a tool found (`search_image`) or made (`generate_image`)
   * into the same store as builder attachments, and records it in the sidecar
   * index so it can be recalled by id later - including from another creation.
   */
  async saveImage(profileId: string, input: SaveImageInput): Promise<SavedImage> {
    const { id, path } = await this.writeImageBytes(profileId, input);
    await appendJsonl(this.paths(profileId).attachmentsIndexPath, {
      id,
      fileName: basename(path),
      mimeType: input.mimeType,
      source: input.source,
      createdAt: this.now().toISOString(),
      meta: input.meta,
    } satisfies ImageIndexEntry);
    return { id, path, mimeType: input.mimeType };
  }

  private async readImageIndex(profileId: string): Promise<ImageIndexEntry[]> {
    return readJsonl<ImageIndexEntry>(this.paths(profileId).attachmentsIndexPath);
  }

  private async appendImageIndexEntry(profileId: string, entry: ImageIndexEntry): Promise<void> {
    const existing = await this.readImageIndex(profileId);
    if (existing.some((line) => line.id === entry.id)) return;
    await appendJsonl(this.paths(profileId).attachmentsIndexPath, entry);
  }

  private async indexBuilderAttachment(
    profileId: string,
    summary: AttachmentSummary,
  ): Promise<void> {
    await this.appendImageIndexEntry(profileId, {
      id: summary.id,
      fileName: basename(summary.path),
      mimeType: summary.mimeType,
      source: "builder",
      createdAt: summary.sharedAt,
      messageText: summary.messageText,
    });
  }

  /** Turns an index line into a summary, using its provenance as the recall text. */
  private indexSummary(entry: ImageIndexEntry): AttachmentSummary {
    const meta = entry.meta ?? {};
    const messageText =
      typeof entry.messageText === "string"
        ? entry.messageText
        : typeof meta.query === "string"
          ? meta.query
          : typeof meta.prompt === "string"
            ? meta.prompt
            : "";
    return {
      id: entry.id,
      mimeType: entry.mimeType,
      path: join("attachments", entry.fileName),
      sharedAt: entry.createdAt,
      messageText,
      source: entry.source,
    };
  }

  private async transcriptAttachmentSummaries(profileId: string): Promise<AttachmentSummary[]> {
    const messages = await this.readStoredMessages(profileId);
    const summaries: AttachmentSummary[] = [];
    for (const message of messages) {
      const summary = attachmentSummary(message);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  private async indexedImageSummaries(profileId: string): Promise<AttachmentSummary[]> {
    return (await this.readImageIndex(profileId)).map((entry) => this.indexSummary(entry));
  }

  /**
   * The builder's shared pictures, newest first, so Bit can recall one later as
   * an art-direction reference for a build. Builder-only by design - the kid
   * should never see machine-found/made pictures as "pictures you shared". The
   * attachment index is now the durable source, with transcript lines layered on
   * while they exist so a reset can clear chat history without stranding ids.
   */
  async listAttachments(profileId: string): Promise<AttachmentSummary[]> {
    const transcript = await this.transcriptAttachmentSummaries(profileId);
    const indexed = (await this.indexedImageSummaries(profileId)).filter(
      (summary) => summary.source === "builder",
    );
    return mergeImageSummaries([...transcript, ...indexed]);
  }

  /**
   * Every stored picture, newest first, optionally narrowed to one source.
   * `list_builder_pictures` passes `{ source: "builder" }`; reference resolution
   * uses the unfiltered set so any id (builder, searched, or generated) resolves.
   */
  async listImages(
    profileId: string,
    options: { source?: StoredImageSource } = {},
  ): Promise<AttachmentSummary[]> {
    const transcript = await this.transcriptAttachmentSummaries(profileId);
    const indexed = await this.indexedImageSummaries(profileId);
    const all = mergeImageSummaries([...transcript, ...indexed]);
    return options.source ? all.filter((summary) => summary.source === options.source) : all;
  }

  /**
   * Looks up one stored picture by its stable id, across all sources, for
   * building a build's references. Builder attachments use transcript details
   * when present and fall back to the sidecar index after a reset.
   */
  async resolveImage(profileId: string, id: string): Promise<AttachmentSummary | undefined> {
    const fromBuilder = (await this.listAttachments(profileId)).find(
      (summary) => summary.id === id,
    );
    if (fromBuilder) return fromBuilder;
    const entry = (await this.readImageIndex(profileId)).find((line) => line.id === id);
    return entry ? this.indexSummary(entry) : undefined;
  }

  /** Resolves a stored picture id to an absolute file path + mime (ImageStore). */
  async resolveImageFile(
    profileId: string,
    id: string,
  ): Promise<{ path: string; mimeType: string } | undefined> {
    const summary = await this.resolveImage(profileId, id);
    if (!summary) return undefined;
    return {
      path: join(this.paths(profileId).conversationDir, summary.path),
      mimeType: summary.mimeType,
    };
  }

  async readAttachmentData(profileId: string, image: ChatImage): Promise<string | undefined> {
    if (!image.path) return image.data;
    try {
      const file = join(this.paths(profileId).attachmentsDir, basename(image.path));
      return (await readFile(file)).toString("base64");
    } catch {
      return image.data;
    }
  }

  private async rehydrateImage(profileId: string, message: ChatMessage): Promise<ChatMessage> {
    if (!message.image?.path || message.image.data) return message;
    const data = await this.readAttachmentData(profileId, message.image);
    return data ? { ...message, image: { ...message.image, data } } : message;
  }

  async appendMessage(profileId: string, message: ChatMessage): Promise<void> {
    await appendJsonl(this.paths(profileId).transcriptPath, {
      timestamp: message.createdAt,
      type: "chat_message",
      message,
    } satisfies TranscriptEntry);
    const summary = attachmentSummary(message);
    if (summary) await this.indexBuilderAttachment(profileId, summary);
  }

  /**
   * Clears the profile's chat transcript and Bit session files while preserving
   * the attachments directory as the durable picture library for builds.
   */
  async resetConversation(profileId: string): Promise<void> {
    for (const summary of await this.transcriptAttachmentSummaries(profileId)) {
      await this.indexBuilderAttachment(profileId, summary);
    }
    const paths = this.paths(profileId);
    await Promise.all([
      rm(paths.transcriptPath, { force: true }),
      rm(paths.bitSessionsDir, { force: true, recursive: true }),
      rm(paths.conversationStatePath, { force: true }),
    ]);
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

function mergeImageSummaries(summaries: AttachmentSummary[]): AttachmentSummary[] {
  const byId = new Map<string, AttachmentSummary>();
  for (const summary of summaries) {
    if (!byId.has(summary.id)) byId.set(summary.id, summary);
  }
  return [...byId.values()].sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
}
