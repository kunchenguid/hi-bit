/**
 * The navigation allowlist for Bit's and bots' browser. Hi-Bit is for kids, so
 * the browser may only ever load loopback (a creation's own preview server).
 * Everything else is refused before a navigation is ever issued.
 *
 * Pure on purpose: the gate logic is unit-tested here.
 */

/** A domain entry like `wikipedia.org` - matches that host and any subdomain. */
export type AllowedDomain = string;

/** Loopback hosts are always allowed: that is where a creation's preview runs. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** Normalizes a parent-entered domain ("HTTPS://Wikipedia.org/foo") to a bare host. */
export function normalizeDomain(entry: string): string | null {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed) return null;
  // Accept either a bare host or a full URL; strip scheme, path, port, leading www.
  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * The single gate every browser navigation passes through. Loopback is always
 * allowed. Anything unparseable, any non-http scheme, and any external host is refused.
 */
export function isNavigationAllowed(url: string, _allowlist: readonly AllowedDomain[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) return true;
  return false;
}

/** The kid-safe domains shipped on by default; parents add more in settings. */
export const DEFAULT_ALLOWLIST: readonly AllowedDomain[] = [
  "wikipedia.org",
  "wiktionary.org",
  "kids.nationalgeographic.com",
  "nasa.gov",
  "code.org",
  "scratch.mit.edu",
  "developer.mozilla.org",
];
