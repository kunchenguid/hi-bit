export type ClaudeOkFixtureOptions = {
  result: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

export function claudeOkStreamJson(opts: ClaudeOkFixtureOptions): string {
  const event = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: opts.result,
    num_turns: 1,
    duration_api_ms: 100,
    total_cost_usd: 0,
    usage: {
      input_tokens: opts.inputTokens ?? 0,
      output_tokens: opts.outputTokens ?? 0,
      cache_creation_input_tokens: opts.cacheCreationInputTokens ?? 0,
      cache_read_input_tokens: opts.cacheReadInputTokens ?? 0,
    },
  };
  return `${JSON.stringify(event)}\n`;
}
