import type { ChildProcess } from "node:child_process";
import { type ClaudeUsage, parseClaudeStreamJson } from "./claudeStreamJson";

export type ClaudeSessionSpawnFn = (
  bin: string,
  args: readonly string[],
  options: { cwd: string },
) => ChildProcess;

export type ClaudeSessionOptions = {
  binary: string;
  args: readonly string[];
  cwd: string;
  sessionId: string;
  spawn: ClaudeSessionSpawnFn;
};

export type ClaudeTurnEvent =
  | { kind: "delta"; text: string }
  | { kind: "tool_use"; name: string }
  | { kind: "system_init" };

export type ClaudeTurnResult = {
  text: string;
  usage: ClaudeUsage | null;
  durationApiMs: number | null;
  numTurns: number | null;
};

export type ClaudeTurnHandle = {
  events: AsyncIterable<ClaudeTurnEvent>;
  complete: Promise<ClaudeTurnResult>;
};

type PendingTurn = {
  buffer: string;
  events: ClaudeTurnEvent[];
  resolveEvent: ((ev: IteratorResult<ClaudeTurnEvent>) => void) | null;
  resolveComplete: (result: ClaudeTurnResult) => void;
  rejectComplete: (err: Error) => void;
  resultText: string | null;
  usage: ClaudeUsage | null;
  durationApiMs: number | null;
  numTurns: number | null;
  done: boolean;
};

export class ClaudeSession {
  private readonly child: ChildProcess;
  private alive = true;
  private stdoutBuf = "";
  private stderrBuf = "";
  private currentTurn: PendingTurn | null = null;
  private readonly turnQueue: PendingTurn[] = [];
  private spawnError: Error | null = null;

  constructor(options: ClaudeSessionOptions) {
    this.child = options.spawn(options.binary, options.args, { cwd: options.cwd });
    this.wireProcess();
  }

  private wireProcess(): void {
    this.child.stdout?.on("data", (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (process.env.HIBIT_DEBUG_CLAUDE_STREAM) {
        process.stderr.write(`[claudeSession.stdout] ${data}`);
      }
      this.stdoutBuf += data;
      this.drainStdoutLines();
    });
    this.child.stderr?.on("data", (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.stderrBuf += data;
    });
    this.child.once("error", (err: Error) => {
      this.spawnError = err;
      this.alive = false;
      this.failAllTurns(err);
    });
    this.child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      this.alive = false;
      if (this.currentTurn || this.turnQueue.length > 0) {
        const stderr = this.stderrBuf.trim();
        const msg =
          stderr || `claude session exited code=${code ?? "null"} signal=${signal ?? "null"}`;
        this.failAllTurns(new Error(msg));
      }
    });
  }

  private drainStdoutLines(): void {
    let nl = this.stdoutBuf.indexOf("\n");
    while (nl >= 0) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line) this.handleLine(line);
      nl = this.stdoutBuf.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const turn = this.currentTurn;
    if (!turn) return;

    turn.buffer += `${line}\n`;

    const obj = parsed as { type?: unknown };

    if (obj.type === "stream_event") {
      const ev = (parsed as { event?: { type?: string; delta?: { text?: string } } }).event;
      if (ev?.type === "content_block_delta" && typeof ev.delta?.text === "string") {
        if (process.env.HIBIT_DEBUG_CLAUDE_STREAM) {
          process.stderr.write(`[claudeSession.delta] ${ev.delta.text}\n`);
        }
        this.emitEvent(turn, { kind: "delta", text: ev.delta.text });
      }
      return;
    }

    if (obj.type === "system" && (parsed as { subtype?: string }).subtype === "init") {
      this.emitEvent(turn, { kind: "system_init" });
      return;
    }

    if (obj.type === "result") {
      const summary = parseClaudeStreamJson(turn.buffer);
      turn.resultText = summary.text;
      turn.usage = summary.usage;
      turn.durationApiMs = summary.durationApiMs;
      turn.numTurns = summary.numTurns;
      this.completeCurrentTurn(
        summary.isError ? new Error(summary.errorMessage ?? "claude turn error") : null,
      );
    }
  }

  private emitEvent(turn: PendingTurn, ev: ClaudeTurnEvent): void {
    if (turn.resolveEvent) {
      const r = turn.resolveEvent;
      turn.resolveEvent = null;
      r({ value: ev, done: false });
    } else {
      turn.events.push(ev);
    }
  }

  private completeCurrentTurn(err: Error | null): void {
    const turn = this.currentTurn;
    if (!turn) return;
    turn.done = true;

    if (turn.resolveEvent) {
      const r = turn.resolveEvent;
      turn.resolveEvent = null;
      r({ value: undefined, done: true });
    }

    if (err) {
      turn.rejectComplete(err);
    } else {
      turn.resolveComplete({
        text: turn.resultText ?? "",
        usage: turn.usage,
        durationApiMs: turn.durationApiMs,
        numTurns: turn.numTurns,
      });
    }

    this.currentTurn = null;
    this.startNextQueuedTurn();
  }

  private failAllTurns(err: Error): void {
    if (this.currentTurn) {
      this.currentTurn.done = true;
      if (this.currentTurn.resolveEvent) {
        const r = this.currentTurn.resolveEvent;
        this.currentTurn.resolveEvent = null;
        r({ value: undefined, done: true });
      }
      this.currentTurn.rejectComplete(err);
      this.currentTurn = null;
    }
    while (this.turnQueue.length > 0) {
      const t = this.turnQueue.shift();
      t?.rejectComplete(err);
    }
  }

  private startNextQueuedTurn(): void {
    const next = this.turnQueue.shift();
    if (!next) return;
    this.currentTurn = next;
  }

  sendMessage(text: string): ClaudeTurnHandle {
    if (!this.alive || this.spawnError) {
      const err = this.spawnError ?? new Error("claude session is not alive");
      return {
        events: emptyAsyncIterable(),
        complete: Promise.reject(err),
      };
    }

    const turn: PendingTurn = {
      buffer: "",
      events: [],
      resolveEvent: null,
      resolveComplete: () => {},
      rejectComplete: () => {},
      resultText: null,
      usage: null,
      durationApiMs: null,
      numTurns: null,
      done: false,
    };
    const complete = new Promise<ClaudeTurnResult>((resolve, reject) => {
      turn.resolveComplete = resolve;
      turn.rejectComplete = reject;
    });

    const userMessage = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    };
    this.child.stdin?.write(`${JSON.stringify(userMessage)}\n`);

    if (this.currentTurn) {
      this.turnQueue.push(turn);
    } else {
      this.currentTurn = turn;
    }

    const events: AsyncIterable<ClaudeTurnEvent> = {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<ClaudeTurnEvent>> => {
          if (turn.events.length > 0) {
            return Promise.resolve({ value: turn.events.shift() as ClaudeTurnEvent, done: false });
          }
          if (turn.done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            turn.resolveEvent = resolve;
          });
        },
      }),
    };

    return { events, complete };
  }

  isAlive(): boolean {
    return this.alive;
  }

  close(): void {
    if (!this.alive) return;
    this.alive = false;
    try {
      this.child.stdin?.end();
    } catch {}
    this.child.kill("SIGTERM");
  }
}

function emptyAsyncIterable(): AsyncIterable<ClaudeTurnEvent> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ value: undefined, done: true }),
    }),
  };
}
