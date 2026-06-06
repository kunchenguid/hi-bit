/**
 * The navigation allowlist for Bit's and bots' browser. Hi-Bit is for kids, so
 * the browser may only ever load loopback (a creation's own preview server) or
 * parent-approved websites. Everything else is refused before navigation.
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
 * allowed. External websites must match a parent-approved domain or subdomain.
 */
export function isNavigationAllowed(url: string, allowlist: readonly AllowedDomain[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) return true;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = normalizeDomain(parsed.hostname);
  if (!host) return false;
  return allowlist.some((entry) => {
    const domain = normalizeDomain(entry);
    return domain !== null && (host === domain || host.endsWith(`.${domain}`));
  });
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
