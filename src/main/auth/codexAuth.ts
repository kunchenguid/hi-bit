import { rm } from "node:fs/promises";
import type { AuthStatus } from "@shared/auth";
import { readJsonFile, writeJsonFile } from "../storage/json";
import {
  buildCodexAuthorizationUrl,
  CodexAuthError,
  type CodexTokenPair,
  codexAccessTokenIsExpiring,
  createCodexOAuthState,
  createCodexPkce,
  exchangeCodexAuthorizationCode,
  extractCodexAccountId,
  getCodexAccessTokenExpiry,
  refreshCodexTokens,
  startCodexOAuthCallbackServer,
} from "./codexOAuth";

export type CodexTokenCodec = {
  encrypted: boolean;
  warning?: string;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
};

export type CodexCredential = {
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt?: string;
  updatedAt: string;
};

type StoredCodexCredential = {
  version: 1;
  encrypted: boolean;
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt?: string;
  updatedAt: string;
};

type CodexAuthServiceOptions = {
  authPath: string;
  codec?: CodexTokenCodec;
  fetchFn?: typeof fetch;
  openExternal?: (url: string) => Promise<unknown>;
  now?: () => Date;
  callbackTimeoutMs?: number;
  /**
   * Called when a token refresh is rejected because the stored refresh token is
   * dead, so the kid must reconnect Codex. Wired to surface the reconnect
   * overlay in the renderer. The credential is already cleared by the time this
   * fires.
   */
  onReconnectRequired?: () => void;
};

export const plainCodexTokenCodec: CodexTokenCodec = {
  encrypted: false,
  encrypt: (value) => value,
  decrypt: (value) => value,
};

export class CodexAuthService {
  private readonly authPath: string;
  private readonly codec: CodexTokenCodec;
  private readonly fetchFn: typeof fetch;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly now: () => Date;
  private readonly callbackTimeoutMs: number;
  private readonly onReconnectRequired?: () => void;
  private refreshInFlight?: Promise<CodexCredential>;

  constructor(options: CodexAuthServiceOptions) {
    this.authPath = options.authPath;
    this.codec = options.codec ?? plainCodexTokenCodec;
    this.fetchFn = options.fetchFn ?? fetch;
    this.openExternal = options.openExternal ?? (async () => undefined);
    this.now = options.now ?? (() => new Date());
    this.callbackTimeoutMs = options.callbackTimeoutMs ?? 5 * 60_000;
    this.onReconnectRequired = options.onReconnectRequired;
  }

  async status(): Promise<AuthStatus> {
    try {
      const credential = await this.loadCredential();
      if (!credential) {
        return {
          authenticated: false,
          storage: this.storageInfo(),
        };
      }
      return {
        authenticated: true,
        accountId: credential.accountId,
        expiresAt: credential.expiresAt,
        storage: this.storageInfo(),
      };
    } catch (error) {
      return {
        authenticated: false,
        storage: this.storageInfo(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async login(): Promise<AuthStatus> {
    const state = createCodexOAuthState();
    const pkce = await createCodexPkce();
    const callbackServer = await startCodexOAuthCallbackServer({
      state,
      timeoutMs: this.callbackTimeoutMs,
    });

    try {
      const authorizationUrl = buildCodexAuthorizationUrl({
        redirectUri: callbackServer.redirectUri,
        codeChallenge: pkce.codeChallenge,
        state,
      });
      await this.openExternal(authorizationUrl);
      const code = await callbackServer.waitForCode();
      const tokenPair = await exchangeCodexAuthorizationCode(
        {
          code,
          redirectUri: callbackServer.redirectUri,
          codeVerifier: pkce.codeVerifier,
        },
        this.fetchFn,
      );
      await this.saveTokenPair(tokenPair);
      return this.status();
    } finally {
      await callbackServer.close();
    }
  }

  async logout(): Promise<void> {
    await rm(this.authPath, { force: true });
  }

  async getFreshAccessToken(): Promise<string> {
    const credential = await this.loadCredential();
    if (!credential) {
      throw new Error("Connect Codex before starting Bit.");
    }

    if (!codexAccessTokenIsExpiring(credential.accessToken, this.now().getTime())) {
      return credential.accessToken;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshCredential(credential).finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    const next = await this.refreshInFlight;
    return next.accessToken;
  }

  private async refreshCredential(credential: CodexCredential): Promise<CodexCredential> {
    let refreshed: CodexTokenPair;
    try {
      refreshed = await refreshCodexTokens(credential.refreshToken, this.fetchFn);
    } catch (error) {
      // A dead refresh token can never recover on its own: clear it so the app
      // is honest about being signed out, then ask the renderer to surface the
      // reconnect overlay. Transient failures (5xx, network) just propagate.
      if (error instanceof CodexAuthError && error.requiresReconnect) {
        const latest = await this.loadCredential();
        if (latest?.refreshToken === credential.refreshToken) {
          await this.logout();
          this.onReconnectRequired?.();
        }
      }
      throw error;
    }
    return this.saveTokenPair(refreshed);
  }

  async saveTokenPair(tokenPair: CodexTokenPair): Promise<CodexCredential> {
    const credential: CodexCredential = {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      accountId: extractCodexAccountId(tokenPair.accessToken),
      expiresAt: getCodexAccessTokenExpiry(tokenPair.accessToken),
      updatedAt: this.now().toISOString(),
    };
    await this.writeCredential(credential);
    return credential;
  }

  async loadCredential(): Promise<CodexCredential | null> {
    const stored = await readJsonFile<StoredCodexCredential>(this.authPath);
    if (!stored) return null;
    if (stored.version !== 1) {
      throw new Error("Unsupported Codex auth file version.");
    }
    if (typeof stored.accessToken !== "string" || typeof stored.refreshToken !== "string") {
      throw new Error("Codex auth file is missing tokens.");
    }

    if (stored.encrypted && !this.codec.encrypted) {
      // Written by an older build that encrypted tokens with Electron
      // safeStorage (the macOS keychain). This build no longer touches the
      // keychain, so it can't decrypt them - treat it as signed out instead of
      // handing the ciphertext back as a token. The kid reconnects once and the
      // credential is rewritten in plaintext, which never prompts again.
      return null;
    }

    const accessToken = stored.encrypted
      ? this.codec.decrypt(stored.accessToken)
      : stored.accessToken;
    const refreshToken = stored.encrypted
      ? this.codec.decrypt(stored.refreshToken)
      : stored.refreshToken;
    if (!accessToken || !refreshToken) {
      throw new Error("Codex auth file is missing tokens.");
    }

    return {
      accessToken,
      refreshToken,
      accountId: stored.accountId ?? extractCodexAccountId(accessToken),
      expiresAt: stored.expiresAt ?? getCodexAccessTokenExpiry(accessToken),
      updatedAt: stored.updatedAt,
    };
  }

  private async writeCredential(credential: CodexCredential): Promise<void> {
    const stored: StoredCodexCredential = {
      version: 1,
      encrypted: this.codec.encrypted,
      accessToken: this.codec.encrypted
        ? this.codec.encrypt(credential.accessToken)
        : credential.accessToken,
      refreshToken: this.codec.encrypted
        ? this.codec.encrypt(credential.refreshToken)
        : credential.refreshToken,
      accountId: credential.accountId,
      expiresAt: credential.expiresAt,
      updatedAt: credential.updatedAt,
    };
    await writeJsonFile(this.authPath, stored, { mode: 0o600 });
  }

  private storageInfo(): AuthStatus["storage"] {
    return {
      path: this.authPath,
      encrypted: this.codec.encrypted,
      warning: this.codec.encrypted ? undefined : this.codec.warning,
    };
  }
}
