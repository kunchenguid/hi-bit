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
    expect(isNavigationAllowed("http://127.0.0.1:4321/")).toBe(true);
    expect(isNavigationAllowed("http://localhost:5173/index.html")).toBe(true);
  });

  it("refuses every external website", () => {
    expect(isNavigationAllowed("https://wikipedia.org/")).toBe(false);
    expect(isNavigationAllowed("http://wikipedia.org/")).toBe(false);
    expect(isNavigationAllowed("https://nasa.gov/foo")).toBe(false);
    // https loopback is not a creation preview (previews are served over http).
    expect(isNavigationAllowed("https://127.0.0.1:4321/")).toBe(false);
  });

  it("refuses non-http schemes and unparseable input", () => {
    expect(isNavigationAllowed("file:///etc/passwd")).toBe(false);
    expect(isNavigationAllowed("ftp://127.0.0.1/")).toBe(false);
    expect(isNavigationAllowed("javascript:alert(1)")).toBe(false);
    expect(isNavigationAllowed("not a url")).toBe(false);
    expect(isNavigationAllowed("")).toBe(false);
  });
});
