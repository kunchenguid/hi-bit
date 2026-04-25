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

function isResultEvent(value: unknown): value is ResultEvent {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "result"
  );
}

export function parseClaudeStreamJson(stdout: string): ParsedClaudeStream {
  let lastResult: ResultEvent | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isResultEvent(parsed)) lastResult = parsed;
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
  const text = typeof lastResult.result === "string" ? lastResult.result : "";

  return {
    text,
    usage: extractUsage(lastResult.usage),
    isError,
    errorMessage: isError ? text || `claude result subtype="${subtype}"` : null,
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
