import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { mergePathValues } from "./shellPath";

describe("mergePathValues", () => {
  it("appends login shell PATH entries without dropping the app PATH", () => {
    const current = ["/app/bin", "/usr/bin"].join(delimiter);
    const login = ["/opt/homebrew/bin", "/usr/bin", "/Users/ada/.npm/bin"].join(delimiter);

    expect(mergePathValues(current, login)).toBe(
      ["/app/bin", "/usr/bin", "/opt/homebrew/bin", "/Users/ada/.npm/bin"].join(delimiter),
    );
  });
});
