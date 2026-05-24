export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** Which creation this message acted on, when Bit delegated work. */
  projectId?: string;
};

export type ToolActivity = {
  callId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: unknown;
  content: ToolContent[];
  /** Which creation a worker is building, for kid-facing labels. */
  projectId?: string;
  projectTitle?: string;
};

export type ChatSnapshot = {
  profileId: string;
  messages: ChatMessage[];
  tools: ToolActivity[];
  isRunning: boolean;
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

export type ChatEvent =
  | ({ type: "turn_start" } & ChatEventMeta)
  | ({ type: "assistant_delta"; text: string } & ChatEventMeta)
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
    } & ChatEventMeta);

export type SendMessageResult =
  | { ok: true; turnId: string; status: "completed" | "cancelled" }
  | { ok: false; turnId?: string; error: string };
