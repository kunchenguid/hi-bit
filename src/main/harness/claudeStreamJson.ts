export type ClaudeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type ParsedClaudeStream = {
  text: string;
  usage: ClaudeUsage | null;
  isError: boolean;
  errorMessage: string | null;
  numTurns: number | null;
  durationApiMs: number | null;
  totalCostUsd: number | null;
};

type ResultEvent = {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

type AssistantEvent = {
  type: "assistant";
  message?: {
    content?: Array<{ type?: string; text?: string }>;
  };
};

function isResultEvent(value: unknown): value is ResultEvent {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "result"
  );
}

function isAssistantEvent(value: unknown): value is AssistantEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "assistant"
  );
}

function extractAssistantText(ev: AssistantEvent): string {
  const blocks = ev.message?.content;
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const block of blocks) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("");
}

export function parseClaudeStreamJson(stdout: string): ParsedClaudeStream {
  let lastResult: ResultEvent | null = null;
  const assistantTextParts: string[] = [];

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isResultEvent(parsed)) {
      lastResult = parsed;
      continue;
    }
    if (isAssistantEvent(parsed)) {
      const text = extractAssistantText(parsed);
      if (text) assistantTextParts.push(text);
    }
  }

  if (!lastResult) {
    return {
      text: "",
      usage: null,
      isError: true,
      errorMessage: "no result event found in claude stream-json output",
      numTurns: null,
      durationApiMs: null,
      totalCostUsd: null,
    };
  }

  const subtype = lastResult.subtype ?? "";
  const isError = lastResult.is_error === true || subtype !== "success";
  const resultText = typeof lastResult.result === "string" ? lastResult.result : "";
  const text = !isError && resultText.length === 0 ? assistantTextParts.join("") : resultText;

  return {
    text,
    usage: extractUsage(lastResult.usage),
    isError,
    errorMessage: isError ? resultText || `claude result subtype="${subtype}"` : null,
    numTurns: typeof lastResult.num_turns === "number" ? lastResult.num_turns : null,
    durationApiMs:
      typeof lastResult.duration_api_ms === "number" ? lastResult.duration_api_ms : null,
    totalCostUsd: typeof lastResult.total_cost_usd === "number" ? lastResult.total_cost_usd : null,
  };
}

function extractUsage(usage: ResultEvent["usage"]): ClaudeUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}
