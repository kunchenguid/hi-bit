/**
 * The navigation gate for Bit's and bots' browser. Hi-Bit is for kids, so the
 * browser may only ever load a creation's own preview, which runs on loopback.
 * Everything else - any external website - is refused before navigation.
 *
 * Pure on purpose: the gate logic is unit-tested here.
 */

/** Loopback hosts are always allowed: that is where a creation's preview runs. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/**
 * The single gate every browser navigation passes through. Only a creation's own
 * loopback preview is allowed; every external website is refused.
 */
export function isNavigationAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" && isLoopbackHost(parsed.hostname);
}
