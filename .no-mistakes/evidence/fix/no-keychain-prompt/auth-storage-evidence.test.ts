import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodexAuthService } from "../../../../src/main/auth/codexAuth";

const evidenceDir = dirname(fileURLToPath(import.meta.url));

describe("no-keychain-prompt evidence", () => {
  it("persists Codex credentials as a plain owner-only local file and ignores legacy keychain ciphertext", async () => {
    const generatedAuthPath = join(evidenceDir, "generated", "auth", "codex.json");
    const legacyAuthPath = join(evidenceDir, "legacy", "auth", "codex.json");
    await rm(join(evidenceDir, "generated"), { recursive: true, force: true });
    await rm(join(evidenceDir, "legacy"), { recursive: true, force: true });

    const service = new CodexAuthService({
      authPath: generatedAuthPath,
      now: () => new Date("2026-06-08T09:50:00.000Z"),
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-evidence" }),
      refreshToken: "plain-refresh-token-evidence",
    });

    const rawGenerated = await readFile(generatedAuthPath, "utf8");
    const generated = JSON.parse(rawGenerated) as {
      encrypted: boolean;
      accessToken: string;
      refreshToken: string;
      accountId: string;
      updatedAt: string;
    };
    const mode = ((await stat(generatedAuthPath)).mode & 0o777).toString(8).padStart(4, "0");

    await mkdir(dirname(legacyAuthPath), { recursive: true });
    await writeFile(
      legacyAuthPath,
      `${JSON.stringify(
        {
          version: 1,
          encrypted: true,
          accessToken: "legacy-safeStorage-ciphertext",
          refreshToken: "legacy-safeStorage-ciphertext",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const legacyStatus = await new CodexAuthService({ authPath: legacyAuthPath }).status();

    const evidence = {
      generatedAuthFile: generatedAuthPath,
      generatedMode: mode,
      generatedEncryptedFlag: generated.encrypted,
      generatedRefreshTokenStoredPlaintext: generated.refreshToken === "plain-refresh-token-evidence",
      generatedAccessTokenLooksPlaintextJwt: generated.accessToken.split(".").length === 3,
      generatedAccountId: generated.accountId,
      generatedUpdatedAt: generated.updatedAt,
      legacyAuthFile: legacyAuthPath,
      legacyEncryptedFlag: true,
      legacyStatusAuthenticated: legacyStatus.authenticated,
    };
    await writeFile(join(evidenceDir, "auth-storage-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence).toMatchObject({
      generatedMode: "0600",
      generatedEncryptedFlag: false,
      generatedRefreshTokenStoredPlaintext: true,
      generatedAccessTokenLooksPlaintextJwt: true,
      generatedAccountId: "acct-evidence",
      legacyStatusAuthenticated: false,
    });
  });
});

function jwtWithPayload(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
