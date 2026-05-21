export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type ToolActivity = {
  callId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: unknown;
  content: ToolContent[];
};

export type ChatSnapshot = {
  projectId: string;
  messages: ChatMessage[];
  tools: ToolActivity[];
  isRunning: boolean;
};

export type ChatEvent =
  | { type: "turn_start"; projectId: string; turnId: string }
  | { type: "assistant_delta"; projectId: string; turnId: string; text: string }
  | {
      type: "tool_start";
      projectId: string;
      turnId: string;
      callId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_update";
      projectId: string;
      turnId: string;
      callId: string;
      content: ToolContent[];
    }
  | {
      type: "tool_end";
      projectId: string;
      turnId: string;
      callId: string;
      isError: boolean;
      content: ToolContent[];
    }
  | {
      type: "turn_end";
      projectId: string;
      turnId: string;
      status: "completed" | "cancelled" | "failed";
      error?: string;
    };

export type SendMessageResult =
  | { ok: true; turnId: string; status: "completed" | "cancelled" }
  | { ok: false; turnId?: string; error: string };
