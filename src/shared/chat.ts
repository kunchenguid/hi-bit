export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/**
 * A picture the builder attached to a message. `data` is base64 bytes (no
 * `data:` prefix) - what the model and the renderer need. To keep the on-disk
 * transcript lean, the persisted line stores only `mimeType` + `path` (relative
 * to the conversation's attachments dir, where the bytes actually live); `data`
 * is rehydrated from that file when the transcript is read back.
 */
export type ChatImage = {
  mimeType: string;
  /** Base64 bytes for rendering / the model. Absent on the persisted transcript line. */
  data?: string;
  /** Where the bytes live on disk, relative to the conversation dir. */
  path?: string;
  /**
   * Stable handle for this picture, so Bit can recall it later as an
   * art-direction reference for a build (see [[ImageReference]]). Older
   * transcript lines may lack it; derive it from the file name in that case.
   */
  id?: string;
};

/** A picture the builder is attaching to the next message (always carries bytes). */
export type OutgoingImage = { mimeType: string; data: string };

/**
 * A picture made available to a bot as an art-direction reference for image
 * generation. `id` is the stable handle a bot passes to `generate_image`'s
 * `reference_paths`; `path` is the on-disk file (absolute at runtime). The
 * canonical bytes are the builder's attachment, stored at factory level - never
 * copied into a creation.
 */
export type ImageReference = { id: string; path: string; mimeType: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** Which creation this message acted on, when Bit changed or delegated work. */
  projectId?: string;
  /** A picture the builder attached to this message, when present. */
  image?: ChatImage;
};

export type ToolActivity = {
  callId: string;
  turnId?: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: unknown;
  content: ToolContent[];
  /** Which creation a bot is building, for kid-facing labels. */
  projectId?: string;
  projectTitle?: string;
  /**
   * The task this step's bot was sent to do - the instructions Bit handed it.
   * Shared by every step of the same `turnId`, so the Logbook can name a bot by
   * what it was asked to build rather than its latest tool call.
   */
  summary?: string;
};

/**
 * One creation's build activity: visible bot tool steps plus whether a bot is
 * working on it right now. Direct Bit edits are durable logbook history, not
 * bot activity rows. Drives the Logbook view.
 */
export type CreationActivity = {
  projectId: string;
  title: string;
  status: "working" | "done";
  updatedAt: string;
  steps: ToolActivity[];
};

/**
 * A creation's live preview server: a per-project process Hi-Bit spawned so the
 * kid can play what Bit built. `url` is the finished loopback URL the renderer
 * points an iframe at; the renderer never sees a bare port.
 */
export type PreviewInfo = {
  projectId: string;
  title?: string;
  url: string;
  startedAt: string;
};

export type ChatSnapshot = {
  profileId: string;
  messages: ChatMessage[];
  activity: CreationActivity[];
  isRunning: boolean;
  /**
   * Bit turn currently producing output.
   * `isRunning` may still be true for bot-result turns, but the renderer uses
   * this kind to show the bot-review thinking bubble without locking input.
   */
  activeTurn?: { id: string; kind: TurnKind } | null;
  /** Creations with a live preview server right now, so Play or the picker is correct after a reload. */
  previews: PreviewInfo[];
  /**
   * Creations that can be played - those Bit has previewed before, so their
   * server can be restarted on demand. Superset of `previews`; lets Play or the
   * picker recover after an app restart killed the live servers.
   */
  playableProjectIds: string[];
};

/**
 * Every chat event is routed to the renderer by `profileId` (one continuous
 * profile-level transcript). `projectId`/`projectTitle` are optional attribution
 * marking which creation a bot turn or tool touched.
 */
type ChatEventMeta = {
  profileId: string;
  turnId: string;
  projectId?: string;
  projectTitle?: string;
};

/**
 * Why a Bit turn is running, so the renderer can word the "thinking" bubble for
 * the kid. `reply` is Bit answering the builder; `bot_result` is Bit reading
 * what a background bot just finished. Absent means `reply`.
 */
export type TurnKind = "reply" | "bot_result";

export type ChatEvent =
  | ({ type: "turn_start"; kind?: TurnKind } & ChatEventMeta)
  | ({ type: "assistant_delta"; text: string } & ChatEventMeta)
  | ({ type: "build_start" } & ChatEventMeta)
  | ({
      type: "build_end";
      status: "completed" | "cancelled" | "failed";
    } & ChatEventMeta)
  | ({
      type: "tool_start";
      callId: string;
      toolName: string;
      args: unknown;
      /** The bot's task (Bit's instructions), so the Logbook can label the bot. */
      summary?: string;
    } & ChatEventMeta)
  | ({
      type: "tool_update";
      callId: string;
      content: ToolContent[];
    } & ChatEventMeta)
  | ({
      type: "tool_end";
      callId: string;
      isError: boolean;
      content: ToolContent[];
    } & ChatEventMeta)
  | ({
      type: "turn_end";
      status: "completed" | "cancelled" | "failed";
      error?: string;
      kind?: TurnKind;
    } & ChatEventMeta)
  | ({ type: "profile_updated" } & ChatEventMeta)
  // Preview events carry no turn: Hi-Bit spawns/kills the server out of band and
  // routes the result to the renderer by `profileId` to light up (or drop) Play or the picker.
  | {
      type: "preview_ready";
      profileId: string;
      projectId: string;
      projectTitle?: string;
      url: string;
    }
  | {
      type: "preview_stopped";
      profileId: string;
      projectId: string;
    };

export type SendMessageResult =
  | { ok: true; turnId: string; status: "completed" | "cancelled" }
  | { ok: false; turnId?: string; error: string };
