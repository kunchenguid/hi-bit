export type AuthStorageInfo = {
  path: string;
  /**
   * Current production builds report false: Codex tokens live in a plaintext
   * owner-only local file instead of Electron safeStorage/keychain storage.
   */
  encrypted: boolean;
  warning?: string;
};

export type AuthStatus = {
  authenticated: boolean;
  accountId?: string;
  expiresAt?: string;
  storage: AuthStorageInfo;
  error?: string;
};
