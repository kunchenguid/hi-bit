/**
 * The navigation gate for Bit's and bots' browser. Hi-Bit is for kids, so the
 * browser may only ever load a creation's own active preview.
 * Everything else - any external website - is refused before navigation.
 *
 * Pure on purpose: the gate logic is unit-tested here.
 */

/** Loopback hosts are where creation previews run. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/**
 * The single gate every browser navigation passes through. Only active creation
 * preview origins are allowed; every external website is refused.
 */
export function isNavigationAllowed(url: string, previewUrls: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" || !isLoopbackHost(parsed.hostname)) return false;
  return previewUrls.some((previewUrl) => {
    try {
      const preview = new URL(previewUrl);
      return parsed.origin === preview.origin;
    } catch {
      return false;
    }
  });
}
