import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWLIST,
  isLoopbackHost,
  isNavigationAllowed,
  normalizeDomain,
} from "./allowlist";

describe("isLoopbackHost", () => {
  it("matches loopback hosts only", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, path, port, and leading www", () => {
    expect(normalizeDomain("HTTPS://www.Wikipedia.org/wiki/Cat")).toBe("wikipedia.org");
    expect(normalizeDomain("wikipedia.org")).toBe("wikipedia.org");
    expect(normalizeDomain("  Code.org  ")).toBe("code.org");
  });

  it("returns null for empty or unparseable input", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("http://")).toBeNull();
  });
});

describe("isNavigationAllowed", () => {
  const list = ["wikipedia.org", "nasa.gov"];

  it("always allows loopback, regardless of the list", () => {
    expect(isNavigationAllowed("http://127.0.0.1:4321/", [])).toBe(true);
    expect(isNavigationAllowed("http://localhost:5173/index.html", [])).toBe(true);
  });

  it("refuses external websites even when domains are listed", () => {
    expect(isNavigationAllowed("https://wikipedia.org/", list)).toBe(false);
    expect(isNavigationAllowed("https://en.wikipedia.org/wiki/Cat", list)).toBe(false);
    expect(isNavigationAllowed("https://www.nasa.gov/", list)).toBe(false);
  });

  it("refuses off-list hosts", () => {
    expect(isNavigationAllowed("https://evil.com/", list)).toBe(false);
    expect(isNavigationAllowed("https://notwikipedia.org/", list)).toBe(false);
  });

  it("does not let a lookalike suffix sneak past", () => {
    // wikipedia.org.evil.com must NOT match wikipedia.org
    expect(isNavigationAllowed("https://wikipedia.org.evil.com/", list)).toBe(false);
  });

  it("refuses non-http schemes even on an allowed domain", () => {
    expect(isNavigationAllowed("file:///etc/passwd", list)).toBe(false);
    expect(isNavigationAllowed("javascript:alert(1)", list)).toBe(false);
    expect(isNavigationAllowed("ftp://wikipedia.org/", list)).toBe(false);
  });

  it("refuses unparseable input", () => {
    expect(isNavigationAllowed("not a url", list)).toBe(false);
  });

  it("keeps the default external list inert for browser navigation", () => {
    expect(DEFAULT_ALLOWLIST.length).toBeGreaterThan(0);
    expect(isNavigationAllowed("https://en.wikipedia.org/", DEFAULT_ALLOWLIST)).toBe(false);
  });
});
