export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** Which creation this message acted on, when Bit changed or delegated work. */
  projectId?: string;
};

export type ToolActivity = {
  callId: string;
  turnId?: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: unknown;
  content: ToolContent[];
  /** Which creation a worker is building, for kid-facing labels. */
  projectId?: string;
  projectTitle?: string;
};

/**
 * One creation's build activity: visible worker tool steps plus whether a bot is
 * working on it right now. Direct Bit edits are durable logbook history, not
 * worker activity rows. Drives the "See all activities" view.
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
  activeTurn?: { id: string; kind: TurnKind } | null;
  /** Creations with a live preview server right now, so Play is correct after a reload. */
  previews: PreviewInfo[];
  /**
   * Creations that can be played - those Bit has previewed before, so their
   * server can be restarted on demand. Superset of `previews`; lets Play recover
   * after an app restart killed the live servers.
   */
  playableProjectIds: string[];
};

/**
 * Every chat event is routed to the renderer by `profileId` (one continuous
 * profile-level transcript). `projectId`/`projectTitle` are optional attribution
 * marking which creation a worker turn or tool touched.
 */
type ChatEventMeta = {
  profileId: string;
  turnId: string;
  projectId?: string;
  projectTitle?: string;
};

/**
 * Why a Bit turn is running, so the renderer can word the "thinking" bubble for
 * the kid. `reply` is Bit answering the builder; `worker_result` is Bit reading
 * what a background bot just finished. Absent means `reply`.
 */
export type TurnKind = "reply" | "worker_result";

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
  // Preview events carry no turn: Hi-Bit spawns/kills the server out of band and
  // routes the result to the renderer by `profileId` to light up (or drop) Play.
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
