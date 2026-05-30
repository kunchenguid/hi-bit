import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProfileReadTools,
  createProfileTools,
  resolveWithinProfile,
} from "./profileJailedTools";

async function makeProfile() {
  // Two sibling profiles under a shared parent, plus an unrelated "auth" dir
  // outside both, mirroring <userData>/.hi-bit/auth living outside profiles/.
  const parent = await mkdtemp(join(tmpdir(), "hibit-jail-"));
  const profileRoot = join(parent, "profiles", "profileA");
  const sibling = join(parent, "profiles", "profileB");
  const authDir = join(parent, "auth");
  await mkdir(join(profileRoot, "projects", "p1", "main-workbench"), { recursive: true });
  await mkdir(join(profileRoot, "conversation"), { recursive: true });
  await mkdir(sibling, { recursive: true });
  await mkdir(authDir, { recursive: true });
  await writeFile(
    join(profileRoot, "projects", "p1", "main-workbench", "index.html"),
    "<h1>hi</h1>",
  );
  await writeFile(join(profileRoot, "conversation", "conversation.json"), "{}");
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
    const result = await readTool(profileRoot)("projects/p1/main-workbench/index.html");
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

describe("createProfileTools", () => {
  it("exposes the read explorer tools plus write and edit, jailed to the profile", async () => {
    const { profileRoot } = await makeProfile();
    const names = createProfileTools(profileRoot)
      .map((tool) => tool.name)
      .sort();
    expect(names).toEqual(["edit", "find", "grep", "ls", "read", "write"]);
  });

  it("does not expose bash (Bit must never run shell commands)", async () => {
    const { profileRoot } = await makeProfile();
    const names = createProfileTools(profileRoot).map((tool) => tool.name);
    expect(names).not.toContain("bash");
  });

  function toolNamed(profileRoot: string, name: string) {
    const tool = createProfileTools(profileRoot).find((t) => t.name === name);
    if (!tool) throw new Error(`${name} tool missing`);
    return (params: unknown) =>
      tool.execute("call-1", params as never, undefined, () => {}, {} as never);
  }

  function refused(result: { content?: Array<{ type: string; text?: string }> }): boolean {
    return (result.content ?? []).some(
      (part) => part.type === "text" && /outside/i.test(part.text ?? ""),
    );
  }

  it("writes a new workbench file through the real write tool", async () => {
    const { profileRoot } = await makeProfile();
    await toolNamed(
      profileRoot,
      "write",
    )({
      path: "projects/p1/main-workbench/notes.txt",
      content: "hello kid",
    });
    const written = await readFile(
      join(profileRoot, "projects", "p1", "main-workbench", "notes.txt"),
      "utf8",
    );
    expect(written).toBe("hello kid");
  });

  it("refuses to write inside a workbench git directory", async () => {
    const { profileRoot } = await makeProfile();
    await mkdir(join(profileRoot, "projects", "p1", "main-workbench", ".git"), {
      recursive: true,
    });
    const outcome = await toolNamed(
      profileRoot,
      "write",
    )({
      path: "projects/p1/main-workbench/.git/config",
      content: "hacked",
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    await expect(
      readFile(join(profileRoot, "projects", "p1", "main-workbench", ".git", "config"), "utf8"),
    ).rejects.toThrow();
  });

  it("reports a successful direct write mutation", async () => {
    const { profileRoot } = await makeProfile();
    const mutations: Array<{ projectId: string; path: string; tool: string }> = [];
    const tool = createProfileTools(profileRoot, {
      onMutation: (mutation) => {
        mutations.push(mutation);
      },
    }).find((candidate) => candidate.name === "write");
    if (!tool) throw new Error("write tool missing");

    await tool.execute(
      "call-1",
      { path: "projects/p1/main-workbench/notes.txt", content: "hello kid" },
      undefined,
      () => {},
      {} as never,
    );

    expect(mutations).toEqual([
      { projectId: "p1", path: "projects/p1/main-workbench/notes.txt", tool: "write" },
    ]);
  });

  it("refuses to write profile metadata through the real write tool", async () => {
    const { profileRoot } = await makeProfile();
    const outcome = await toolNamed(
      profileRoot,
      "write",
    )({
      path: "conversation/conversation.json",
      content: "hacked",
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    expect(await readFile(join(profileRoot, "conversation", "conversation.json"), "utf8")).toBe(
      "{}",
    );
  });

  it("refuses to write outside the jail through the real write tool", async () => {
    const { profileRoot, authDir } = await makeProfile();
    const outcome = await toolNamed(
      profileRoot,
      "write",
    )({
      path: join(authDir, "codex.json"),
      content: "stolen",
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    // The credential file must be untouched.
    expect(await readFile(join(authDir, "codex.json"), "utf8")).toBe("{}");
  });

  it("edits an in-jail file through the real edit tool", async () => {
    const { profileRoot } = await makeProfile();
    await toolNamed(
      profileRoot,
      "edit",
    )({
      path: "projects/p1/main-workbench/index.html",
      edits: [{ oldText: "hi", newText: "hello" }],
    });
    const edited = await readFile(
      join(profileRoot, "projects", "p1", "main-workbench", "index.html"),
      "utf8",
    );
    expect(edited).toBe("<h1>hello</h1>");
  });

  it("reports a successful direct edit mutation", async () => {
    const { profileRoot } = await makeProfile();
    const mutations: Array<{ projectId: string; path: string; tool: string }> = [];
    const tool = createProfileTools(profileRoot, {
      onMutation: (mutation) => {
        mutations.push(mutation);
      },
    }).find((candidate) => candidate.name === "edit");
    if (!tool) throw new Error("edit tool missing");

    await tool.execute(
      "call-1",
      {
        path: "projects/p1/main-workbench/index.html",
        edits: [{ oldText: "hi", newText: "hello" }],
      },
      undefined,
      () => {},
      {} as never,
    );

    expect(mutations).toEqual([
      { projectId: "p1", path: "projects/p1/main-workbench/index.html", tool: "edit" },
    ]);
  });

  it("refuses to edit inside a workbench git directory", async () => {
    const { profileRoot } = await makeProfile();
    await mkdir(join(profileRoot, "projects", "p1", "main-workbench", ".git"), {
      recursive: true,
    });
    await writeFile(
      join(profileRoot, "projects", "p1", "main-workbench", ".git", "config"),
      "safe",
    );
    const outcome = await toolNamed(
      profileRoot,
      "edit",
    )({
      path: "projects/p1/main-workbench/.git/config",
      edits: [{ oldText: "safe", newText: "hacked" }],
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    expect(
      await readFile(
        join(profileRoot, "projects", "p1", "main-workbench", ".git", "config"),
        "utf8",
      ),
    ).toBe("safe");
  });

  it("refuses to edit project metadata through the real edit tool", async () => {
    const { profileRoot } = await makeProfile();
    await writeFile(join(profileRoot, "projects", "p1", "project.json"), "{}", "utf8");
    const outcome = await toolNamed(
      profileRoot,
      "edit",
    )({
      path: "projects/p1/project.json",
      edits: [{ oldText: "{}", newText: "hacked" }],
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    expect(await readFile(join(profileRoot, "projects", "p1", "project.json"), "utf8")).toBe("{}");
  });

  it("refuses to edit outside the jail through the real edit tool", async () => {
    const { profileRoot, sibling } = await makeProfile();
    const target = join(sibling, "secret.txt");
    const outcome = await toolNamed(
      profileRoot,
      "edit",
    )({
      path: target,
      edits: [{ oldText: "other kid's stuff", newText: "hacked" }],
    }).then(
      (result) => ({ threw: false, refused: refused(result) }),
      () => ({ threw: true, refused: true }),
    );
    expect(outcome.threw || outcome.refused).toBe(true);
    expect(await readFile(target, "utf8")).toBe("other kid's stuff");
  });
});
