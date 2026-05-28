import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProfileReadTools, resolveWithinProfile } from "./profileJailedTools";

async function makeProfile() {
  // Two sibling profiles under a shared parent, plus an unrelated "auth" dir
  // outside both, mirroring <userData>/.hi-bit/auth living outside profiles/.
  const parent = await mkdtemp(join(tmpdir(), "hibit-jail-"));
  const profileRoot = join(parent, "profiles", "profileA");
  const sibling = join(parent, "profiles", "profileB");
  const authDir = join(parent, "auth");
  await mkdir(join(profileRoot, "projects", "p1"), { recursive: true });
  await mkdir(sibling, { recursive: true });
  await mkdir(authDir, { recursive: true });
  await writeFile(join(profileRoot, "projects", "p1", "index.html"), "<h1>hi</h1>");
  await writeFile(join(sibling, "secret.txt"), "other kid's stuff");
  await writeFile(join(authDir, "codex.json"), "{}");
  return { parent, profileRoot, sibling, authDir };
}

describe("resolveWithinProfile", () => {
  it("accepts an in-jail relative path and returns its absolute path", async () => {
    const { profileRoot } = await makeProfile();
    const resolved = resolveWithinProfile(profileRoot, "projects/p1/index.html");
    expect(resolved).toBe(join(profileRoot, "projects", "p1", "index.html"));
  });

  it("accepts an in-jail absolute path", async () => {
    const { profileRoot } = await makeProfile();
    const abs = join(profileRoot, "projects", "p1", "index.html");
    expect(resolveWithinProfile(profileRoot, abs)).toBe(abs);
  });

  it("accepts the profile root itself", async () => {
    const { profileRoot } = await makeProfile();
    expect(resolveWithinProfile(profileRoot, ".")).toBe(profileRoot);
  });

  it("rejects a parent-traversal escape", async () => {
    const { profileRoot } = await makeProfile();
    expect(() => resolveWithinProfile(profileRoot, "../../auth/codex.json")).toThrow(/outside/i);
  });

  it("rejects an absolute path outside the profile (auth credentials)", async () => {
    const { profileRoot, authDir } = await makeProfile();
    expect(() => resolveWithinProfile(profileRoot, join(authDir, "codex.json"))).toThrow(
      /outside/i,
    );
  });

  it("rejects reading a sibling profile", async () => {
    const { profileRoot, sibling } = await makeProfile();
    expect(() => resolveWithinProfile(profileRoot, join(sibling, "secret.txt"))).toThrow(
      /outside/i,
    );
  });

  it("rejects a sibling whose path is a string-prefix of the root", async () => {
    const { profileRoot } = await makeProfile();
    // profileA vs profileA-evil: a naive startsWith(root) check would let this through.
    expect(() => resolveWithinProfile(profileRoot, `${profileRoot}-evil/x.txt`)).toThrow(
      /outside/i,
    );
  });

  it("rejects a symlink that points outside the jail", async () => {
    const { parent, profileRoot } = await makeProfile();
    const outsideDir = join(parent, "outside");
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, "loot.txt"), "loot");
    await symlink(outsideDir, join(profileRoot, "escape"));
    expect(() => resolveWithinProfile(profileRoot, "escape/loot.txt")).toThrow(/outside/i);
  });
});

describe("createProfileReadTools", () => {
  it("exposes exactly the read-only explorer tools", async () => {
    const { profileRoot } = await makeProfile();
    const names = createProfileReadTools(profileRoot)
      .map((tool) => tool.name)
      .sort();
    expect(names).toEqual(["find", "grep", "ls", "read"]);
  });

  it("includes no mutating tools", async () => {
    const { profileRoot } = await makeProfile();
    const names = createProfileReadTools(profileRoot).map((tool) => tool.name);
    for (const mutator of ["write", "edit", "bash"]) {
      expect(names).not.toContain(mutator);
    }
  });

  // End-to-end through pi's real read tool, proving the operations are wired to
  // the guard (not just that the guard works in isolation).
  function readTool(profileRoot: string) {
    const tool = createProfileReadTools(profileRoot).find((t) => t.name === "read");
    if (!tool) throw new Error("read tool missing");
    return (path: string) => tool.execute("call-1", { path }, undefined, () => {}, {} as never);
  }

  function resultText(result: { content?: Array<{ type: string; text?: string }> }): string {
    return (result.content ?? [])
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("");
  }

  it("reads an in-jail file through the real read tool", async () => {
    const { profileRoot } = await makeProfile();
    const result = await readTool(profileRoot)("projects/p1/index.html");
    expect(resultText(result)).toContain("<h1>hi</h1>");
  });

  it("denies an out-of-jail file through the real read tool", async () => {
    const { profileRoot, authDir } = await makeProfile();
    // The tool may either throw or return an error result; either way it must
    // refuse and never leak the credential file's contents.
    const outcome = await readTool(profileRoot)(join(authDir, "codex.json")).then(
      (result) => ({ threw: false, text: resultText(result) }),
      (error: unknown) => ({ threw: true, text: String(error) }),
    );
    expect(outcome.threw || /outside/i.test(outcome.text)).toBe(true);
    expect(outcome.text).not.toContain("{}");
  });
});
