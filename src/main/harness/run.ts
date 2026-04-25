import type { ChildProcess } from "node:child_process";
import type { HarnessCommand } from "./command";

export type HarnessRunEvent = { kind: "stdout"; data: string } | { kind: "stderr"; data: string };

export type HarnessRunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type HarnessSpawnFn = (
  bin: string,
  args: readonly string[],
  options: { cwd: string },
) => ChildProcess;

export type RunHarnessOptions = {
  command: HarnessCommand;
  spawn: HarnessSpawnFn;
  onEvent?: (event: HarnessRunEvent) => void;
  signal?: AbortSignal;
};

export function runHarness(opts: RunHarnessOptions): Promise<HarnessRunResult> {
  return new Promise((resolve, reject) => {
    const child = opts.spawn(opts.command.bin, opts.command.args, {
      cwd: opts.command.cwd,
    });
    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        child.kill("SIGTERM");
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    const cleanup = () => {
      opts.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdoutBuf += data;
      opts.onEvent?.({ kind: "stdout", data });
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderrBuf += data;
      opts.onEvent?.({ kind: "stderr", data });
    });
    child.once("error", (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        exitCode: code,
        signal,
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });
  });
}
