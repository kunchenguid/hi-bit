import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodexAuthService, type CodexTokenCodec } from "./codexAuth";

async function tempAuthPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hibit-auth-"));
  return join(root, "auth", "codex.json");
}

describe("CodexAuthService", () => {
  it("reports signed out status when no credential file exists", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });

    await expect(service.status()).resolves.toMatchObject({
      authenticated: false,
      storage: { path: authPath, encrypted: false },
    });
  });

  it("stores credentials under the Hi-Bit auth path with restrictive permissions", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath, now: () => new Date("2026-01-02T03:04:05Z") });

    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-123" }),
      refreshToken: "refresh-token",
    });

    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-123",
      expiresAt: "1970-01-01T00:33:20.000Z",
    });
    const file = JSON.parse(await readFile(authPath, "utf8"));
    expect(file).toMatchObject({
      version: 1,
      encrypted: false,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
    const mode = (await stat(authPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("refreshes expiring access tokens before returning them to Pi", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({
      authPath,
      now: () => new Date(900_000),
      fetchFn: (async () =>
        Response.json({
          access_token: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
          refresh_token: "refresh-new",
        })) as typeof fetch,
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 1_000, chatgpt_account_id: "acct-old" }),
      refreshToken: "refresh-old",
    });

    await expect(service.getFreshAccessToken()).resolves.toBe(
      jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
    );
    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-new",
    });
  });

  it("signals a reconnect and clears the dead credential when the refresh token is rejected", async () => {
    const authPath = await tempAuthPath();
    const onReconnectRequired = vi.fn();
    const service = new CodexAuthService({
      authPath,
      now: () => new Date(900_000),
      onReconnectRequired,
      fetchFn: (async () => new Response("{}", { status: 401 })) as typeof fetch,
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 1_000 }),
      refreshToken: "dead-refresh",
    });

    await expect(service.getFreshAccessToken()).rejects.toThrow(
      /Codex token refresh failed with HTTP 401/,
    );
    expect(onReconnectRequired).toHaveBeenCalledTimes(1);
    // The dead token is cleared so a relaunch lands on the connect gate.
    await expect(service.status()).resolves.toMatchObject({ authenticated: false });
  });

  it("shares one refresh across concurrent access-token requests", async () => {
    const authPath = await tempAuthPath();
    const onReconnectRequired = vi.fn();
    let releaseRefresh: (() => void) | undefined;
    let calls = 0;
    const service = new CodexAuthService({
      authPath,
      now: () => new Date(900_000),
      onReconnectRequired,
      fetchFn: (async () => {
        calls += 1;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
          return Response.json({
            access_token: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
            refresh_token: "refresh-new",
          });
        }
        return new Response("{}", { status: 401 });
      }) as typeof fetch,
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 1_000, chatgpt_account_id: "acct-old" }),
      refreshToken: "refresh-old",
    });

    const firstToken = service.getFreshAccessToken();
    const secondToken = service.getFreshAccessToken();
    await vi.waitFor(() => expect(calls).toBe(1));
    releaseRefresh?.();
    await expect(Promise.all([firstToken, secondToken])).resolves.toEqual([
      jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
      jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
    ]);

    expect(onReconnectRequired).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-new",
    });
  });

  it("keeps the credential and stays quiet on a transient refresh failure", async () => {
    const authPath = await tempAuthPath();
    const onReconnectRequired = vi.fn();
    const service = new CodexAuthService({
      authPath,
      now: () => new Date(900_000),
      onReconnectRequired,
      fetchFn: (async () => new Response("{}", { status: 500 })) as typeof fetch,
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 1_000 }),
      refreshToken: "refresh-old",
    });

    await expect(service.getFreshAccessToken()).rejects.toThrow(
      /Codex token refresh failed with HTTP 500/,
    );
    expect(onReconnectRequired).not.toHaveBeenCalled();
    await expect(service.status()).resolves.toMatchObject({ authenticated: true });
  });

  it("asks to connect Codex when Bit needs a provider token", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });

    await expect(service.getFreshAccessToken()).rejects.toThrow(
      "Connect Codex before starting Bit.",
    );
  });

  it("uses the configured codec for token-at-rest protection", async () => {
    const authPath = await tempAuthPath();
    const codec: CodexTokenCodec = {
      encrypted: true,
      encrypt: (value) => `box:${Buffer.from(value).toString("base64url")}`,
      decrypt: (value) => Buffer.from(value.replace(/^box:/, ""), "base64url").toString("utf8"),
    };
    const service = new CodexAuthService({ authPath, codec, now: () => new Date(0) });

    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000 }),
      refreshToken: "refresh",
    });

    const raw = await readFile(authPath, "utf8");
    const stored = JSON.parse(raw) as { refreshToken: string };
    expect(stored.refreshToken).not.toBe("refresh");
    await expect(service.getFreshAccessToken()).resolves.toBe(jwtWithPayload({ exp: 2_000 }));
  });

  it("treats keychain-encrypted credentials from older builds as signed out", async () => {
    // Older builds encrypted tokens with Electron safeStorage (the macOS
    // keychain). This build no longer touches the keychain, so it can't decrypt
    // them - it must not pass the ciphertext along as if it were a token. The
    // kid reconnects once and the credential is rewritten in plaintext.
    const authPath = await tempAuthPath();
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        version: 1,
        encrypted: true,
        accessToken: "keychain-ciphertext",
        refreshToken: "keychain-ciphertext",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const service = new CodexAuthService({ authPath });

    await expect(service.status()).resolves.toMatchObject({ authenticated: false });
    await expect(service.getFreshAccessToken()).rejects.toThrow(
      "Connect Codex before starting Bit.",
    );
  });

  it("logs out by removing the app-owned auth file", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000 }),
      refreshToken: "refresh",
    });

    await service.logout();

    await expect(service.status()).resolves.toMatchObject({ authenticated: false });
  });
});

function jwtWithPayload(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
