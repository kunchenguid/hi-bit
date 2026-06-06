import { describe, expect, it } from "vitest";
import { isLoopbackHost, isNavigationAllowed } from "./navigation";

describe("isLoopbackHost", () => {
  it("matches loopback hosts only", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });
});

describe("isNavigationAllowed", () => {
  it("allows a creation's own loopback preview", () => {
    expect(isNavigationAllowed("http://127.0.0.1:4321/", ["http://127.0.0.1:4321/"])).toBe(true);
    expect(
      isNavigationAllowed("http://127.0.0.1:4321/index.html", ["http://127.0.0.1:4321/"]),
    ).toBe(true);
  });

  it("refuses loopback urls that are not active previews", () => {
    expect(isNavigationAllowed("http://127.0.0.1:5173/", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("http://localhost:4321/", ["http://127.0.0.1:4321/"])).toBe(false);
  });

  it("refuses every external website", () => {
    expect(isNavigationAllowed("https://wikipedia.org/", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("http://wikipedia.org/", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("https://nasa.gov/foo", ["http://127.0.0.1:4321/"])).toBe(false);
    // https loopback is not a creation preview (previews are served over http).
    expect(isNavigationAllowed("https://127.0.0.1:4321/", ["http://127.0.0.1:4321/"])).toBe(false);
  });

  it("refuses non-http schemes and unparseable input", () => {
    expect(isNavigationAllowed("file:///etc/passwd", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("ftp://127.0.0.1/", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("javascript:alert(1)", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("not a url", ["http://127.0.0.1:4321/"])).toBe(false);
    expect(isNavigationAllowed("", ["http://127.0.0.1:4321/"])).toBe(false);
  });
});
