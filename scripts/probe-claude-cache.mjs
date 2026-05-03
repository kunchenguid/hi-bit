#!/usr/bin/env node
// Legacy standalone probe for Claude prompt caching behavior.
//
// Spawns claude N times against a fixture profile dir with the historical
// direct CLI flags Hi-Bit used before ACPX, parses each turn's stream-json
// output, and prints the cache-creation / cache-read tokens per turn.
//
// Usage:
//   node scripts/probe-claude-cache.mjs                # 3 turns, default flags
//   node scripts/probe-claude-cache.mjs --exclude-dynamic    # add --exclude-dynamic-system-prompt-sections
//   node scripts/probe-claude-cache.mjs --binary /path/to/claude --turns 5
//   node scripts/probe-claude-cache.mjs --keep         # keep the temp dir for inspection

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const BINARY = optValue("--binary", "claude");
const TURNS = Number.parseInt(optValue("--turns", "3"), 10);
const EXCLUDE_DYNAMIC = flag("--exclude-dynamic");
const KEEP = flag("--keep");

const PROMPTS = [
  "Hi Bit. I'm Ada, age 8, learning HTML. What's a tag?",
  "Cool, can you give me an example with my name in it?",
  "Now make it pink and bigger.",
  "What did we just learn?",
  "Bye Bit!",
];

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "hi-bit-probe-"));
  console.error(`[probe] temp profile dir: ${dir}`);

  // Mimic Hi-Bit's profile dir layout: a small CLAUDE.md so claude has stable
  // session context, plus a state.md that the tutor would normally read.
  await writeFile(
    join(dir, "CLAUDE.md"),
    `# Bit\n\nYou are Bit, a kid-friendly tutor. Keep replies under 40 words. Plain text only.\n`,
    "utf8",
  );
  await writeFile(join(dir, "state.md"), `# state\n\nname: Ada\nage: 8\n`, "utf8");

  const sessionId = randomUUID();
  const rows = [];

  for (let i = 0; i < Math.min(TURNS, PROMPTS.length); i++) {
    const mode = i === 0 ? "start" : "resume";
    const prompt = PROMPTS[i];
    console.error(`[probe] turn ${i + 1}: mode=${mode} prompt="${prompt}"`);
    const t0 = Date.now();
    const stdout = await runClaude({ binary: BINARY, mode, sessionId, prompt, cwd: dir });
    const wallMs = Date.now() - t0;
    const parsed = parseClaudeStream(stdout);
    rows.push({ turn: i + 1, mode, wallMs, ...parsed });
  }

  console.log("\n=== claude prompt-caching probe ===");
  console.log(`flags: --effort low --output-format stream-json --verbose${EXCLUDE_DYNAMIC ? " --exclude-dynamic-system-prompt-sections" : ""}`);
  console.log(`session id: ${sessionId}\n`);
  console.log(formatTable(rows));

  if (!KEEP) {
    await rm(dir, { recursive: true, force: true });
  } else {
    console.error(`[probe] kept profile dir: ${dir}`);
  }
}

function buildArgs({ mode, sessionId, prompt }) {
  const isolation = ["--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands"];
  const effort = ["--effort", "low"];
  const output = ["--output-format", "stream-json", "--verbose"];
  const dynamic = EXCLUDE_DYNAMIC ? ["--exclude-dynamic-system-prompt-sections"] : [];
  const tail =
    mode === "start"
      ? ["-p", prompt, "--session-id", sessionId]
      : ["--resume", sessionId, "-p", prompt];
  return [...isolation, ...effort, ...output, ...dynamic, ...tail];
}

function runClaude({ binary, mode, sessionId, prompt, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, buildArgs({ mode, sessionId, prompt }), { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code !== 0) {
        return reject(
          new Error(
            `claude exited code=${code} signal=${signal}\nstderr:\n${stderr.slice(0, 4000)}`,
          ),
        );
      }
      resolve(stdout);
    });
  });
}

function parseClaudeStream(stdout) {
  let result = null;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj?.type === "result") result = obj;
    } catch {}
  }
  if (!result) return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, apiMs: 0, cost: 0 };
  const u = result.usage ?? {};
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0,
    apiMs: result.duration_api_ms ?? 0,
    cost: result.total_cost_usd ?? 0,
    isError: result.is_error === true,
  };
}

function formatTable(rows) {
  const headers = ["turn", "mode", "wall_ms", "api_ms", "in", "out", "cache_create", "cache_read", "cost_usd"];
  const data = rows.map((r) => [
    String(r.turn),
    r.mode,
    String(r.wallMs),
    String(r.apiMs),
    String(r.input),
    String(r.output),
    String(r.cacheCreate),
    String(r.cacheRead),
    r.cost.toFixed(5),
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((row) => row[i].length)),
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const fmt = (cells) => cells.map((c, i) => c.padStart(widths[i])).join("  ");
  return [fmt(headers), sep, ...data.map(fmt)].join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
