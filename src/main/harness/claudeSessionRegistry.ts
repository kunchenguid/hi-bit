import type { SessionRole } from "@shared/sessionLog";

type Closable = {
  isAlive: () => boolean;
  close: () => void;
};

export class ClaudeSessionRegistry<T extends Closable> {
  private readonly sessions = new Map<string, T>();

  static makeKey(profileId: string, role: SessionRole): string {
    return `${profileId}/${role}`;
  }

  getOrCreate(key: string, factory: () => T): T {
    const existing = this.sessions.get(key);
    if (existing && existing.isAlive()) return existing;
    if (existing) this.sessions.delete(key);
    const created = factory();
    this.sessions.set(key, created);
    return created;
  }

  has(key: string): boolean {
    const existing = this.sessions.get(key);
    return existing !== undefined && existing.isAlive();
  }

  closeProfile(profileId: string): void {
    const prefix = `${profileId}/`;
    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(prefix)) {
        session.close();
        this.sessions.delete(key);
      }
    }
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }
}
