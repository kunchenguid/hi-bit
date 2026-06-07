import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import packageJson from "./package.json";

const execFileAsync = promisify(execFile);
const githubExpression = (expression: string) => `$${expression}`;

describe("release distribution config", () => {
  it("adds a local mac packaging script and keeps electron-builder on the pnpm-safe version", () => {
    expect(packageJson.scripts?.["package:mac"] ?? "").toContain(
      "electron-builder --mac dir --universal --config electron-builder.dev.yml",
    );
    expect(packageJson.devDependencies?.["electron-builder"]).toBe("26.8.2");
  });

  it("keeps the browser-bundled voice stack out of packaged production dependencies", () => {
    expect(packageJson.dependencies?.["@huggingface/transformers"]).toBeUndefined();
    expect(packageJson.devDependencies?.["@huggingface/transformers"]).toBe("^4.2.0");
  });

  it("packages local mac builds under a distinct bundle identity", async () => {
    expect(packageJson.scripts?.["package:mac"] ?? "").toContain(
      "--config electron-builder.dev.yml",
    );
    const devConfig = await readFile(
      resolve(import.meta.dirname, "electron-builder.dev.yml"),
      "utf8",
    );

    expect(devConfig).toContain("extends: ./electron-builder.yml");
    expect(devConfig).toContain("appId: com.hibit.app.dev");
    expect(devConfig).toContain("productName: Hi-Bit Dev");
  });

  it("declares an unsigned electron-builder mac bundle with packaged Hi-Bit resources", async () => {
    const config = await readFile(resolve(import.meta.dirname, "electron-builder.yml"), "utf8");

    expect(config).toContain("appId: com.hibit.app");
    expect(config).toContain("productName: Hi-Bit");
    expect(config).toContain("icon: build/icon.icns");
    expect(config).toContain("identity: null");
    expect(config).toContain("hardenedRuntime: false");
    expect(config).toContain(
      "x64ArchFiles: Contents/Resources/app.asar.unpacked/node_modules/koffi/**",
    );
    expect(config).toContain("from: skills");
    expect(config).toContain("to: brand/mascot-boo.svg");
    await expect(
      stat(resolve(import.meta.dirname, "build/icon.icns")).then((file) => file.isFile()),
    ).resolves.toBe(true);
  });

  it("adds a release-please workflow that publishes the DMG and updates the Homebrew tap", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, ".github/workflows/release-please.yml"),
      "utf8",
    );

    expect(workflow).toContain("googleapis/release-please-action@v4");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain(
      `hi-bit-release-created: ${githubExpression("{{ steps.release.outputs.release_created }}")}`,
    );
    expect(workflow).toContain(
      `hi-bit-tag-name: ${githubExpression("{{ steps.release.outputs.tag_name }}")}`,
    );
    expect(workflow).toContain(
      `hi-bit-version: ${githubExpression("{{ steps.release.outputs.version }}")}`,
    );
    expect(workflow).toContain(
      `if: ${githubExpression("{{ needs.release-please.outputs.hi-bit-release-created == 'true' }}")}`,
    );
    expect(workflow).toContain(`ref: ${githubExpression("{{ env.TAG_NAME }}")}`);
    expect(workflow).toContain("CSC_IDENTITY_AUTO_DISCOVERY");
    expect(workflow).toContain("HIBIT_UMAMI_HOST: https://a.kunchenguid.com");
    expect(workflow).toContain(
      `HIBIT_UMAMI_WEBSITE_ID: ${githubExpression("{{ vars.HIBIT_UMAMI_WEBSITE_ID }}")}`,
    );
    expect(workflow).toContain('codesign --force --deep --sign - "dist/mac-universal/Hi-Bit.app"');
    expect(workflow).toContain("gh release upload");
    expect(workflow).toContain("HOMEBREW_TAP_TOKEN");
    expect(workflow).toContain("Casks/hi-bit.rb");
    expect(workflow).toContain("git diff --cached --quiet");
    expect(workflow).toContain("xattr");
    expect(workflow).toContain('"~/Library/Application Support/hi-bit"');
    expect(workflow).toContain('uninstall quit: "com.hibit.app"');
    expect(workflow).toContain("uninstall_preflight do");
    expect(workflow).toContain('system("/usr/bin/pgrep", "-x", "Hi-Bit"');
    expect(workflow).toContain('nohup", args: ["/bin/sh", "-c"');
    expect(workflow).toContain('while [ -e "#{appdir}/Hi-Bit.app" ]; do');
    expect(workflow).toContain('/usr/bin/open -a "#{appdir}/Hi-Bit.app"');
    expect(workflow).not.toContain("tags:");
    await expect(
      stat(resolve(import.meta.dirname, ".github/workflows/release.yml")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("generates a syntactically valid Homebrew relaunch shell script", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, ".github/workflows/release-please.yml"),
      "utf8",
    );
    const caskTemplateMatch = workflow.match(
      /cat > "\$RUNNER_TEMP\/homebrew-tap\/Casks\/hi-bit\.rb" << CASK_EOF\n(?<template>[\s\S]*?)\n\s+CASK_EOF/,
    );

    expect(caskTemplateMatch?.groups?.template).toBeDefined();

    const caskTemplate = (caskTemplateMatch?.groups?.template ?? "").replace(/^\s{10}/gm, "");
    const { stdout: generatedCask } = await execFileAsync(
      "/bin/bash",
      ["-c", `cat << CASK_EOF\n${caskTemplate}\nCASK_EOF`],
      {
        env: {
          ...process.env,
          SHA256: "abc123",
          TAG_NAME: "hi-bit-v1.2.3",
          VERSION: "1.2.3",
        },
      },
    );
    const scriptMatch = generatedCask.match(
      /<<~RELAUNCH_SCRIPT\], must_succeed: false\n(?<script>[\s\S]*?)\n\s*RELAUNCH_SCRIPT/,
    );

    expect(scriptMatch?.groups?.script).toBeDefined();

    const script = (scriptMatch?.groups?.script ?? "")
      .replace(/^\s{14}/gm, "")
      .replaceAll("#{appdir}", "/Applications");

    await expect(execFileAsync("/bin/sh", ["-n", "-c", script])).resolves.toBeDefined();
  });

  it("declares release-please manifest mode for Hi-Bit", async () => {
    const config = JSON.parse(
      await readFile(resolve(import.meta.dirname, "release-please-config.json"), "utf8"),
    );
    const manifest = JSON.parse(
      await readFile(resolve(import.meta.dirname, ".release-please-manifest.json"), "utf8"),
    );

    expect(config).toMatchObject({
      $schema:
        "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true,
      "include-component-in-tag": true,
      packages: {
        ".": {
          "release-type": "node",
          "package-name": "hi-bit",
          component: "hi-bit",
        },
      },
    });
    expect(manifest).toEqual({
      ".": packageJson.version,
    });
  });

  it("allows release-please PRs to update generated release metadata", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, ".github/workflows/guard-generated-files.yml"),
      "utf8",
    );

    expect(workflow).toContain("github.event.pull_request.user.login != 'release-please[bot]'");
    expect(workflow).toContain(
      "!startsWith(github.event.pull_request.head.ref, 'release-please--')",
    );
    expect(workflow).toContain(
      'name_status=$(git diff --name-status "$' + "{BASE_SHA}...$" + '{HEAD_SHA}")',
    );
    expect(workflow).toContain("manifest_status=$(printf '%s\\n' \"$name_status\" | awk");
    expect(workflow).toContain("config_status=$(printf '%s\\n' \"$name_status\" | awk");
    expect(workflow).toContain('[ "$manifest_status" = "A" ] && [ "$config_status" = "A" ]');
    expect(workflow).toContain("for path in CHANGELOG.md; do");
    expect(workflow).toContain(
      "for path in out dist .cache src/renderer/src/generated uploads .lavish; do",
    );
  });

  it("requires no-mistakes for human pull requests", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, ".github/workflows/no-mistakes-required.yml"),
      "utf8",
    );

    expect(workflow).toContain("name: Require no-mistakes");
    expect(workflow).toContain("types: [opened, edited, synchronize, reopened]");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("github.event.pull_request.user.login != 'github-actions[bot]'");
    expect(workflow).toContain("github.event.pull_request.user.login != 'dependabot[bot]'");
    expect(workflow).toContain("github.event.pull_request.user.login != 'release-please[bot]'");
    expect(workflow).toContain(
      `PR_BODY: ${githubExpression("{{ github.event.pull_request.body }}")}`,
    );
    expect(workflow).toContain(
      "Updates from [git push no-mistakes](https://github.com/kunchenguid/no-mistakes)",
    );
    expect(workflow).toContain("This PR was not raised through no-mistakes.");
  });

  it("documents the no-mistakes contribution flow", async () => {
    const guide = await readFile(resolve(import.meta.dirname, "CONTRIBUTING.md"), "utf8");

    expect(guide).toContain("Human-authored pull requests targeting `main` must be raised");
    expect(guide).toContain("git push no-mistakes");
    expect(guide).toContain("no-mistakes quick start");
    expect(guide).toContain("`pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`");
    expect(guide).toContain("Run `pnpm package:mac` when changing packaging");
    expect(guide).toContain(
      "Local `pnpm package:mac` builds intentionally produce `Hi-Bit Dev.app`",
    );
    expect(guide).toContain(
      "Keep universal macOS packaging compatible with both Intel and Apple Silicon Macs",
    );
    expect(guide).toContain("Keep `electron-builder` at `26.8.2` or newer");
    expect(guide).toContain("Do not hand-edit release-please metadata");
    expect(guide).toContain("Hi-Bit releases are proposed by release-please");
    expect(guide).toContain("Maintainers must keep `HOMEBREW_TAP_TOKEN` configured");
    expect(guide).toContain("Maintainers must keep `HIBIT_UMAMI_WEBSITE_ID` configured");
    expect(guide).not.toContain("a normal PR against `main` with passing tests is enough");
  });

  it("documents anonymous release telemetry in the agent guide", async () => {
    const guide = await readFile(resolve(import.meta.dirname, "AGENTS.md"), "utf8");

    expect(guide).toContain("anonymous, best-effort release telemetry");
    expect(guide).toContain("self-hosted Umami");
    expect(guide).toContain("no kid names, prompts, profile ids, creation ids, file contents");
    expect(guide).toContain("HIBIT_TELEMETRY=0");
    expect(guide).not.toContain("No telemetry and no Hi-Bit cloud backend.");
  });
});
